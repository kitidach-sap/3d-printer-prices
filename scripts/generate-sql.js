const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'products.json');
const products = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

const BATCH_SIZE = 100;
const outputDir = path.join(__dirname, '..', 'data', 'sql-batches');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

function escapeSQL(str) {
    if (str === null || str === undefined) return 'NULL';
    return "'" + String(str).replace(/'/g, "''") + "'";
}

function numOrNull(val) {
    if (val === null || val === undefined || isNaN(val)) return 'NULL';
    return val;
}

for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const values = batch.map(p => {
        return `(${escapeSQL(p.asin)}, ${escapeSQL(p.product_name)}, ${escapeSQL(p.product_type)}, ${escapeSQL(p.category)}, ${escapeSQL(p.condition)}, ${numOrNull(p.capacity_gb)}, ${escapeSQL(p.capacity_text)}, ${numOrNull(p.price)}, ${numOrNull(p.price_per_gb)}, ${numOrNull(p.price_per_tb)}, ${escapeSQL(p.warranty)}, ${escapeSQL(p.form_factor)}, ${escapeSQL(p.technology)}, ${escapeSQL(p.amazon_url)}, 'us')`;
    }).join(',\n');

    const sql = `INSERT INTO disk_products (asin, product_name, product_type, category, condition, capacity_gb, capacity_text, price, price_per_gb, price_per_tb, warranty, form_factor, technology, amazon_url, locale)
VALUES
${values};`;

    fs.writeFileSync(path.join(outputDir, `batch_${String(batchNum).padStart(2, '0')}.sql`), sql);
}

console.log(`Generated ${Math.ceil(products.length / BATCH_SIZE)} SQL batch files`);
