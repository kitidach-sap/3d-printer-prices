const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// Product type → category mapping
const CATEGORY_MAP = {
  // HDD (Rotational)
  external_hdd: 'hdd',
  external_hdd25: 'hdd',
  internal_hdd: 'hdd',
  internal_hdd25: 'hdd',
  internal_sshd: 'hdd',
  internal_sas: 'hdd',
  // SSD (Solid State)
  external_ssd: 'ssd',
  internal_ssd: 'ssd',
  m2_ssd: 'ssd',
  m2_nvme: 'ssd',
  u2: 'ssd',
  // Volatile (RAM)
  ddr5u: 'volatile',
  ddr5so: 'volatile',
  ddr5r: 'volatile',
  ddr4u: 'volatile',
  ddr4so: 'volatile',
  ddr4r: 'volatile',
  // Removable
  microsd: 'removable',
  sd_card: 'removable',
  cf_card: 'removable',
  cfast_card: 'removable',
  cfexpress: 'removable',
  usb_flash: 'removable',
  // Optical
  bdrw: 'optical',
  bdr: 'optical',
  dvdrw: 'optical',
  dvdr: 'optical',
  cdrw: 'optical',
  cdr: 'optical',
  // Tape
  lto3: 'tape',
  lto4: 'tape',
  lto5: 'tape',
  lto6: 'tape',
  lto7: 'tape',
  lto8: 'tape',
  lto9: 'tape',
};

function extractASIN(url) {
  const match = url.match(/\/dp\/([A-Z0-9]{10})/);
  return match ? match[1] : null;
}

function parsePrice(priceStr) {
  if (!priceStr) return null;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseCapacityToGB(capacityStr) {
  if (!capacityStr) return null;
  
  // Extract number and unit, e.g. "18 TB x10" → 18 TB, "128 GB" → 128 GB
  const match = capacityStr.match(/([\d.]+)\s*(TB|GB|MB)/i);
  if (!match) return null;
  
  const value = parseFloat(match[1]);
  const unit = match[2].toUpperCase();
  
  if (unit === 'TB') return value * 1000;
  if (unit === 'GB') return value;
  if (unit === 'MB') return value / 1000;
  return null;
}

function main() {
  const htmlPath = path.join(__dirname, '..', 'diskprices.com', 'index.html');
  console.log(`Reading: ${htmlPath}`);
  
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const $ = cheerio.load(html);
  
  const products = [];
  const errors = [];
  
  $('#diskprices-body tr.disk').each((index, row) => {
    try {
      const $row = $(row);
      const tds = $row.find('td');
      
      const productType = $row.attr('data-product-type');
      const condition = $row.attr('data-condition');
      const capacityAttr = parseFloat($row.attr('data-capacity')); // in GB
      
      // Extract text from cells
      const pricePerGbText = $(tds[0]).text().trim();
      const pricePerTbText = $(tds[1]).text().trim();
      const priceText = $(tds[2]).text().trim();
      const capacityText = $(tds[3]).text().trim();
      const warrantyText = $(tds[4]).text().trim();
      const formFactorText = $(tds[5]).text().trim();
      const technologyText = $(tds[6]).text().trim();
      const conditionText = $(tds[7]).text().trim();
      
      // Extract product name and URL from the last cell
      const nameCell = $(tds[8]);
      const link = nameCell.find('a');
      const productName = link.text().trim();
      const amazonUrl = link.attr('href') || '';
      const asin = extractASIN(amazonUrl);
      
      const category = CATEGORY_MAP[productType] || 'unknown';
      
      const product = {
        asin,
        product_name: productName,
        product_type: productType,
        category,
        condition: condition || conditionText.toLowerCase(),
        capacity_gb: capacityAttr || parseCapacityToGB(capacityText),
        capacity_text: capacityText,
        price: parsePrice(priceText),
        price_per_gb: parsePrice(pricePerGbText),
        price_per_tb: parsePrice(pricePerTbText),
        warranty: warrantyText || null,
        form_factor: formFactorText || null,
        technology: technologyText || null,
        amazon_url: amazonUrl,
        locale: 'us',
      };
      
      products.push(product);
    } catch (err) {
      errors.push({ index, error: err.message });
    }
  });
  
  // Write products to JSON
  const outputPath = path.join(__dirname, '..', 'data', 'products.json');
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(products, null, 2), 'utf-8');
  
  // Stats
  const categories = {};
  products.forEach(p => {
    categories[p.category] = (categories[p.category] || 0) + 1;
  });
  
  console.log('\n=== Extraction Complete ===');
  console.log(`Total products: ${products.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log('\nProducts by category:');
  Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count}`);
    });
  console.log(`\nOutput: ${outputPath}`);
  
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  Row ${e.index}: ${e.error}`));
  }
  
  // Print a sample
  console.log('\nSample product:');
  console.log(JSON.stringify(products[0], null, 2));
}

main();
