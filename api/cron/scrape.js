/**
 * Vercel Cron Job — Lightweight Product Scraper
 * 
 * Uses Cheerio (no browser) to scrape Amazon search results.
 * Triggered by Vercel Cron schedule defined in vercel.json.
 * 
 * For heavier scraping, run the full Playwright agent locally:
 *   node scraper/agent.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const SEARCHES = [
    { query: '3D+printer+FDM', category: '3d_printer', productType: 'fdm' },
    { query: 'resin+3D+printer', category: '3d_printer', productType: 'resin_sla' },
    { query: '3D+printer+filament+PLA', category: 'filament', productType: 'pla' },
    { query: '3D+printer+accessories', category: 'accessories', productType: 'tools' },
    { query: '3D+pen', category: '3d_pen', productType: '3d_pen' },
];

const AFFILIATE_TAG = 'kiti09-20';

function parsePrice(text) {
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/(\d+\.?\d*)/);
    return match ? parseFloat(match[1]) : null;
}

function detectBrand(title) {
    const brands = [
        'Bambu Lab', 'Creality', 'ELEGOO', 'Anycubic', 'FLASHFORGE',
        'Phrozen', 'Prusa', 'Longer', 'SUNLU', 'HATCHBOX', 'eSUN',
        'Polymaker', 'Overture', 'JAYO', 'Sovol', 'Comgrow', 'QIDI',
        'Voxelab', 'BIGTREETECH', 'Artillery',
    ];
    const upper = title.toUpperCase();
    return brands.find(b => upper.includes(b.toUpperCase())) || null;
}

async function scrapeAmazonSearch(search) {
    const url = `https://www.amazon.com/s?k=${search.query}&tag=${AFFILIATE_TAG}`;

    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        if (!res.ok) {
            console.log(`   ⚠️ Amazon returned ${res.status} for "${search.query}"`);
            return [];
        }

        const html = await res.text();

        // Use regex-based extraction (lightweight, no cheerio dependency needed on Vercel)
        const products = [];
        const asinPattern = /data-asin="([A-Z0-9]{10})"/g;
        const asins = new Set();
        let match;

        while ((match = asinPattern.exec(html)) !== null) {
            asins.add(match[1]);
        }

        for (const asin of asins) {
            if (products.length >= 20) break;

            // Extract title for this ASIN
            const titleRegex = new RegExp(`data-asin="${asin}"[\\s\\S]*?<span[^>]*class="a-size-[^"]*a-text-normal"[^>]*>([^<]+)</span>`, 'i');
            const titleMatch = html.match(titleRegex);

            // Extract price
            const priceRegex = new RegExp(`data-asin="${asin}"[\\s\\S]*?<span class="a-price"[^>]*>[\\s\\S]*?<span[^>]*>\\$([\\d,.]+)</span>`, 'i');
            const priceMatch = html.match(priceRegex);

            if (titleMatch && titleMatch[1]) {
                const title = titleMatch[1].trim();
                const price = priceMatch ? parsePrice('$' + priceMatch[1]) : null;

                if (title.length > 10 && price && price > 0) {
                    products.push({
                        amazon_asin: asin,
                        product_name: title,
                        price,
                        brand: detectBrand(title),
                        category: search.category,
                        product_type: search.productType,
                        condition: 'new',
                        locale: 'us',
                        amazon_url: `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`,
                    });
                }
            }
        }

        return products;
    } catch (err) {
        console.error(`   ❌ Fetch error for "${search.query}":`, err.message);
        return [];
    }
}

module.exports = async function handler(req, res) {
    // Verify cron secret or admin key
    const authHeader = req.headers['authorization'];
    const cronSecret = process.env.CRON_SECRET;
    const adminKey = process.env.ADMIN_KEY;

    const isValidCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isValidAdmin = adminKey && (req.headers['x-admin-key'] === adminKey || req.query.key === adminKey);

    if (!isValidCron && !isValidAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🚀 Cron scrape starting...');
    const startedAt = new Date().toISOString();
    let totalFound = 0;
    let totalSaved = 0;
    let errorsCount = 0;

    try {
        for (const search of SEARCHES) {
            console.log(`   🔍 Scraping: ${search.query}`);
            const products = await scrapeAmazonSearch(search);
            totalFound += products.length;

            if (products.length > 0) {
                const { error } = await supabase.from('products').upsert(products, {
                    onConflict: 'amazon_asin',
                    ignoreDuplicates: false,
                });

                if (error) {
                    console.error(`   ❌ Save error:`, error.message);
                    errorsCount += products.length;
                } else {
                    totalSaved += products.length;
                }
            }

            // Small delay between searches
            await new Promise(r => setTimeout(r, 1000));
        }

        // Log the scrape run
        await supabase.from('scrape_logs').insert({
            status: errorsCount > 0 ? 'partial' : 'success',
            products_found: totalFound,
            products_saved: totalSaved,
            errors_count: errorsCount,
            started_at: startedAt,
            completed_at: new Date().toISOString(),
        });

        console.log(`✅ Cron scrape done: ${totalFound} found, ${totalSaved} saved`);
        res.json({
            status: 'success',
            productsFound: totalFound,
            productsSaved: totalSaved,
            errorsCount,
        });
    } catch (err) {
        console.error('❌ Cron scrape failed:', err.message);

        await supabase.from('scrape_logs').insert({
            status: 'failed',
            products_found: totalFound,
            products_saved: totalSaved,
            errors_count: errorsCount + 1,
            error_details: err.message,
            started_at: startedAt,
            completed_at: new Date().toISOString(),
        });

        res.status(500).json({ error: err.message });
    }
};
