/**
 * Amazon 3D Printer Scraper Agent
 * 
 * Uses Playwright to scrape Amazon search results for 3D printers & accessories.
 * Stores results in Supabase.
 */

const { chromium } = require('playwright');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// ============================================
// Configuration
// ============================================
const CONFIG = {
    searches: [
        { query: '3D printer FDM', category: '3d_printer', productType: 'fdm' },
        { query: '3D printer resin SLA', category: '3d_printer', productType: 'resin_sla' },
        { query: '3D printer filament PLA', category: 'filament', productType: 'pla' },
        { query: '3D printer filament ABS', category: 'filament', productType: 'abs' },
        { query: '3D printer filament PETG', category: 'filament', productType: 'petg' },
        { query: '3D printer resin UV', category: 'resin', productType: 'uv_resin' },
        { query: '3D printer nozzle set', category: 'accessories', productType: 'nozzle' },
        { query: '3D printer build plate PEI', category: 'accessories', productType: 'build_plate' },
        { query: '3D printer enclosure', category: 'accessories', productType: 'enclosure' },
        { query: '3D pen', category: '3d_pen', productType: '3d_pen' },
    ],

    maxPages: 2,
    maxProducts: 40,
    delayMin: 2000,
    delayMax: 5000,
    locale: 'us',
    headless: true,
};

// ============================================
// Supabase
// ============================================
const supabaseKey = process.env.SUPABASE_SERVICE_KEY !== 'your-service-role-key-here'
    ? process.env.SUPABASE_SERVICE_KEY
    : process.env.SUPABASE_ANON_KEY;

const supabase = createClient(process.env.SUPABASE_URL, supabaseKey);

// ============================================
// Utility functions
// ============================================
function randomDelay(min = CONFIG.delayMin, max = CONFIG.delayMax) {
    const ms = Math.floor(Math.random() * (max - min)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parsePrice(text) {
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/\$?([\d.]+)/);
    return match ? parseFloat(match[1]) : null;
}

function parseSpecs(title) {
    if (!title) return {};
    const lower = title.toLowerCase();
    const specs = {};

    // Build volume (e.g. "220x220x250mm", "220 x 220 x 250 mm")
    const volMatch = lower.match(/(\d{2,4})\s*[x×]\s*(\d{2,4})\s*[x×]\s*(\d{2,4})\s*mm/);
    if (volMatch) {
        specs.build_volume = `${volMatch[1]}x${volMatch[2]}x${volMatch[3]}mm`;
    }

    // Filament weight (e.g. "1kg", "1.75mm")
    const kgMatch = lower.match(/([\d.]+)\s*kg/);
    if (kgMatch) specs.weight_kg = parseFloat(kgMatch[1]);

    const diamMatch = lower.match(/(1\.75|2\.85)\s*mm/);
    if (diamMatch) specs.filament_diameter = diamMatch[1] + 'mm';

    // Nozzle size
    const nozzleMatch = lower.match(/(0\.\d)\s*mm\s*nozzle/);
    if (nozzleMatch) specs.nozzle_size = nozzleMatch[1] + 'mm';

    // Resolution
    const resMatch = lower.match(/(\d+)\s*micron/);
    if (resMatch) specs.resolution_micron = parseInt(resMatch[1]);

    return specs;
}

function detectCondition(title, badges) {
    const text = (title + ' ' + (badges || '')).toLowerCase();
    if (text.includes('renewed') || text.includes('refurbished') || text.includes('used')) {
        return 'used';
    }
    return 'new';
}

function detectBrand(title) {
    const brands = [
        'Creality', 'Ender', 'Bambu Lab', 'Bambu', 'Anycubic', 'Elegoo',
        'Prusa', 'FlashForge', 'Sovol', 'Voxelab', 'SUNLU', 'eSUN',
        'Hatchbox', 'Overture', 'Polymaker', 'JAYO', 'Phrozen', 'Qidi',
        'Artillery', 'Comgrow', 'Longer', 'BIQU', 'Kingroon',
    ];
    const lower = title.toLowerCase();
    for (const brand of brands) {
        if (lower.includes(brand.toLowerCase())) return brand;
    }
    return null;
}

// ============================================
// Scraper
// ============================================
async function scrapeSearchPage(page, searchConfig) {
    const products = [];
    const { query, category, productType } = searchConfig;

    console.log(`\n🔍 Searching: "${query}" (${category}/${productType})`);

    for (let pageNum = 1; pageNum <= CONFIG.maxPages; pageNum++) {
        const url = `https://www.amazon.com/s?k=${encodeURIComponent(query)}&page=${pageNum}`;
        console.log(`   Page ${pageNum}: ${url}`);

        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await randomDelay();

            // Check for CAPTCHA
            const captcha = await page.$('#captchacharacters');
            if (captcha) {
                console.log('   ⚠️  CAPTCHA detected! Waiting 30s...');
                await new Promise(r => setTimeout(r, 30000));
                continue;
            }

            // Extract product cards
            const items = await page.$$('div[data-component-type="s-search-result"]');
            console.log(`   Found ${items.length} items on page ${pageNum}`);

            for (const item of items) {
                try {
                    const asin = await item.getAttribute('data-asin');
                    if (!asin) continue;

                    const titleEl = await item.$('h2 a span, h2 span');
                    const title = titleEl ? await titleEl.textContent() : null;
                    if (!title) continue;

                    // Price — use .a-offscreen for the clean formatted price
                    let price = null;
                    const priceEl = await item.$('.a-price .a-offscreen');
                    if (priceEl) {
                        const priceText = await priceEl.textContent();
                        price = parsePrice(priceText);
                    }
                    if (!price || price <= 0) continue;

                    // URL — try multiple selectors and fallback to ASIN
                    let amazonUrl = null;
                    const linkEl = await item.$('h2 a, a.a-link-normal.s-line-clamp-2, a.a-link-normal[href*="/dp/"]');
                    if (linkEl) {
                        const href = await linkEl.getAttribute('href');
                        if (href) {
                            amazonUrl = href.startsWith('http') ? href : `https://www.amazon.com${href}`;
                        }
                    }
                    if (!amazonUrl && asin) {
                        amazonUrl = `https://www.amazon.com/dp/${asin}`;
                    }

                    // Rating
                    const ratingEl = await item.$('.a-icon-alt');
                    const ratingText = ratingEl ? await ratingEl.textContent() : null;
                    const rating = ratingText ? parseFloat(ratingText.match(/([\d.]+)/)?.[1] || 0) : null;

                    // Review count
                    const reviewEl = await item.$('span.a-size-base.s-underline-text');
                    const reviewText = reviewEl ? await reviewEl.textContent() : null;
                    const reviewCount = reviewText ? parseInt(reviewText.replace(/[,.\s]/g, '')) : null;

                    // Badges
                    const badgeEl = await item.$('.a-badge-text, .a-color-secondary');
                    const badges = badgeEl ? await badgeEl.textContent() : '';

                    // Derived fields
                    const condition = detectCondition(title, badges);
                    const brand = detectBrand(title);
                    const specs = parseSpecs(title);

                    // Smart re-categorization: resin liquids in resin_sla search → resin/uv_resin
                    let finalCategory = category;
                    let finalProductType = productType;
                    if (productType === 'resin_sla' && !specs.build_volume && price < 80) {
                        finalCategory = 'resin';
                        finalProductType = 'uv_resin';
                    }

                    products.push({
                        asin,
                        product_name: title.trim(),
                        product_type: finalProductType,
                        category: finalCategory,
                        condition,
                        weight_kg: specs.weight_kg || null,
                        specs_text: specs.build_volume || specs.filament_diameter || null,
                        price,
                        rating,
                        review_count: reviewCount,
                        features: null,
                        build_volume: specs.build_volume || null,
                        brand,
                        amazon_url: amazonUrl,
                        locale: CONFIG.locale,
                    });

                } catch (itemErr) {
                    continue;
                }
            }

            if (products.length >= CONFIG.maxProducts) break;

        } catch (pageErr) {
            console.error(`   ❌ Page ${pageNum} error:`, pageErr.message);
        }

        if (pageNum < CONFIG.maxPages) {
            await randomDelay(3000, 7000);
        }
    }

    console.log(`   ✅ Extracted ${products.length} products for "${query}"`);
    return products;
}

// ============================================
// Save to Supabase
// ============================================
async function saveProducts(products) {
    if (products.length === 0) return { inserted: 0, errors: 0 };

    const BATCH_SIZE = 50;
    let inserted = 0;
    let errors = 0;

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
        const batch = products.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('products').insert(batch);

        if (error) {
            console.error(`   ❌ Insert error:`, error.message);
            errors += batch.length;
        } else {
            inserted += batch.length;
        }
    }

    return { inserted, errors };
}

async function logScrapeRun(status, details) {
    try {
        await supabase.from('scrape_logs').insert({
            status,
            products_found: details.productsFound || 0,
            products_saved: details.productsSaved || 0,
            errors_count: details.errorsCount || 0,
            error_details: details.errorDetails || null,
            started_at: details.startedAt,
            completed_at: new Date().toISOString(),
        });
    } catch (err) {
        console.error('Failed to log scrape run:', err.message);
    }
}

// ============================================
// Main
// ============================================
async function main() {
    const args = process.argv.slice(2);
    const searchFilter = args.find(a => a.startsWith('--search='));
    const limitArg = args.find(a => a.startsWith('--limit='));
    const headless = !args.includes('--visible');
    const dryRun = args.includes('--dry-run');

    CONFIG.headless = headless;
    if (limitArg) CONFIG.maxProducts = parseInt(limitArg.split('=')[1]);

    console.log('🚀 Amazon 3D Printer Scraper');
    console.log(`   Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
    console.log(`   Headless: ${CONFIG.headless}`);
    console.log(`   Max products per search: ${CONFIG.maxProducts}`);
    console.log('');

    const startedAt = new Date().toISOString();
    let allProducts = [];
    let totalInserted = 0;
    let totalErrors = 0;

    const browser = await chromium.launch({
        headless: CONFIG.headless,
        args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1366, height: 768 },
        locale: 'en-US',
        timezoneId: 'America/New_York',
    });

    const page = await context.newPage();

    // Set Amazon delivery location to US (New York 10001) for USD prices
    async function setUSLocation() {
        console.log('🌎 Setting Amazon delivery location to US...');
        try {
            await page.goto('https://www.amazon.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
            await randomDelay(2000, 3000);

            // Click on delivery location
            const locLink = await page.$('#nav-global-location-popover-link, #glow-ingress-block');
            if (locLink) {
                await locLink.click();
                await randomDelay(1500, 2500);

                // Type US zip code
                const zipInput = await page.$('#GLUXZipUpdateInput');
                if (zipInput) {
                    await zipInput.fill('10001');
                    await randomDelay(500, 1000);

                    // Click Apply
                    const applyBtn = await page.$('#GLUXZipUpdate input[type="submit"], #GLUXZipUpdate .a-button-input');
                    if (applyBtn) {
                        await applyBtn.click();
                        await randomDelay(2000, 3000);
                    }

                    // Close popup if still open
                    const doneBtn = await page.$('.a-popover-footer .a-button-primary, #GLUXConfirmClose, .a-button-close');
                    if (doneBtn) {
                        await doneBtn.click();
                        await randomDelay(1000, 2000);
                    }
                }
            }

            // Verify location was set
            const locText = await page.$eval('#glow-ingress-line2', el => el.textContent).catch(() => 'unknown');
            console.log(`   📍 Delivery location: ${locText.trim()}`);
        } catch (err) {
            console.log(`   ⚠️  Could not set location: ${err.message}`);
        }
    }

    await setUSLocation();

    // Now block images for faster scraping (after location is set)
    await page.route('**/*.{png,jpg,jpeg,gif,svg,webp,woff,woff2}', route => route.abort());

    try {
        let searches = CONFIG.searches;
        if (searchFilter) {
            const filterValue = searchFilter.split('=')[1];
            searches = searches.filter(s =>
                s.category === filterValue || s.productType === filterValue
            );
            console.log(`   Filtered to ${searches.length} searches matching "${filterValue}"`);
        }

        for (const searchConfig of searches) {
            const products = await scrapeSearchPage(page, searchConfig);
            allProducts = allProducts.concat(products);

            if (!dryRun && products.length > 0) {
                const result = await saveProducts(products);
                totalInserted += result.inserted;
                totalErrors += result.errors;
                console.log(`   💾 Saved: ${result.inserted} inserted, ${result.errors} errors`);
            }

            await randomDelay(5000, 10000);
        }

        // Summary
        console.log('\n' + '='.repeat(50));
        console.log('📊 SCRAPE COMPLETE');
        console.log(`   Total products found: ${allProducts.length}`);
        console.log(`   Total inserted: ${totalInserted}`);
        console.log(`   Total errors: ${totalErrors}`);
        console.log('='.repeat(50));

        if (dryRun) {
            console.log('\n📋 DRY RUN — Sample products:');
            allProducts.slice(0, 10).forEach((p, i) => {
                console.log(`   ${i + 1}. [${p.category}/${p.product_type}] ${p.product_name.substring(0, 60)}`);
                console.log(`      $${p.price} | ${p.technology || 'N/A'} | ${p.capacity_text || 'N/A'} | ${p.condition}`);
            });
        }

        if (!dryRun) {
            await logScrapeRun('completed', {
                productsFound: allProducts.length,
                productsSaved: totalInserted,
                errorsCount: totalErrors,
                startedAt,
            });
        }

    } catch (err) {
        console.error('\n❌ Scraper error:', err.message);
        if (!dryRun) {
            await logScrapeRun('failed', {
                productsFound: allProducts.length,
                productsSaved: totalInserted,
                errorsCount: totalErrors + 1,
                errorDetails: err.message,
                startedAt,
            });
        }
    } finally {
        await browser.close();
    }

    return allProducts;
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = { main, scrapeSearchPage, parseSpecs, parsePrice };
