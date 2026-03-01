const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    const start = Date.now();
    console.log(`→ ${req.method} ${req.url}`);
    res.on('finish', () => {
        console.log(`← ${req.method} ${req.url} ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
});

// Serve sitemap.xml and robots.txt with correct content types
app.get('/sitemap.xml', (req, res) => {
    res.setHeader('Content-Type', 'application/xml');
    res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

app.get('/robots.txt', (req, res) => {
    res.setHeader('Content-Type', 'text/plain');
    res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});

// ============================================
// Use-Case Landing Pages (SEO)
// ============================================
const fs = require('fs');
const USE_CASE_PAGES = {
    '/budget-3d-printers': {
        title: 'Best Budget 3D Printers Under $300 — Compare Prices',
        description: 'Find the best affordable 3D printers under $300. Compare prices, ratings, and specs from top brands like Bambu Lab, Creality, and ELEGOO.',
        filters: { category: '3d_printer', max_price: '300' },
        h1: '🎮 Budget 3D Printers Under $300'
    },
    '/professional-3d-printers': {
        title: 'Professional 3D Printers $300+ — Compare Prices',
        description: 'Compare professional-grade 3D printers starting from $300. High-speed, large format, and multi-material printers for serious makers.',
        filters: { category: '3d_printer', min_price: '300' },
        h1: '🏗️ Professional 3D Printers'
    },
    '/resin-3d-printers': {
        title: 'Resin 3D Printers — Best MSLA/SLA Printers for Detail',
        description: 'Compare resin 3D printer prices. Perfect for miniatures, jewelry, and high-detail prints. ELEGOO, Anycubic, Phrozen and more.',
        filters: { category: '3d_printer', search: 'resin' },
        h1: '🎨 Resin 3D Printers'
    },
    '/3d-pens': {
        title: '3D Pens — Best 3D Printing Pens for Kids & Adults',
        description: 'Compare 3D pen prices. Fun and creative 3D drawing tools for kids, students, and artists. Find the best deals on Amazon.',
        filters: { category: '3d_pen' },
        h1: '✏️ 3D Pens'
    },
    '/filament': {
        title: '3D Printer Filament & Resin — Compare Material Prices',
        description: 'Compare prices for PLA, ABS, PETG filament and UV resin. Find the best deals on 3D printing materials from top brands.',
        filters: { category: 'filament,resin' },
        h1: '🧵 3D Printing Materials'
    },
    '/accessories': {
        title: '3D Printer Accessories — Tools, Parts & Upgrades',
        description: 'Compare prices for 3D printer accessories, tools, nozzles, build plates, and upgrades. Find everything you need to improve your 3D printing.',
        filters: { category: 'accessories' },
        h1: '🔧 3D Printer Accessories'
    }
};

let indexTemplate = null;
function getIndexTemplate() {
    if (!indexTemplate) {
        indexTemplate = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf-8');
    }
    return indexTemplate;
}

// Register use-case routes
Object.entries(USE_CASE_PAGES).forEach(([route, page]) => {
    app.get(route, (req, res) => {
        let html = getIndexTemplate();

        // Replace title
        html = html.replace(
            /<title>.*?<\/title>/,
            `<title>${page.title}</title>`
        );

        // Replace meta description
        html = html.replace(
            /<meta name="description"[\s\S]*?>/,
            `<meta name="description" content="${page.description}">`
        );

        // Replace OG title and description
        html = html.replace(
            /<meta property="og:title".*?>/,
            `<meta property="og:title" content="${page.title}">`
        );
        html = html.replace(
            /<meta property="og:description"[\s\S]*?>/,
            `<meta property="og:description" content="${page.description}">`
        );
        html = html.replace(
            /<meta property="og:url".*?>/,
            `<meta property="og:url" content="https://3d-printer-prices.com${route}">`
        );
        html = html.replace(
            /<link rel="canonical".*?>/,
            `<link rel="canonical" href="https://3d-printer-prices.com${route}">`
        );

        // Inject pre-set filters before app.js loads
        const filterScript = `<script>window.__PRESET_FILTERS = ${JSON.stringify(page.filters)};</script>`;
        html = html.replace('</head>', `${filterScript}\n</head>`);

        res.send(html);
    });
});

app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// API Routes
// ============================================

// GET /api/products — list products with filters
app.get('/api/products', async (req, res) => {
    try {
        const {
            category,       // '3d_printer', 'filament', 'resin', 'accessories', '3d_pen'
            product_type,   // 'fdm', 'resin_sla', 'pla', 'abs', etc.
            condition,      // 'new', 'used'
            brand,          // 'Creality', 'Bambu Lab', etc.
            min_price,
            max_price,
            sort_by = 'price',
            sort_order = 'asc',
            limit = 100,
            offset = 0,
            locale = 'us',
            search,
        } = req.query;

        let query = supabase
            .from('products')
            .select('*', { count: 'exact' });

        // Filters
        if (category) {
            const categories = category.split(',');
            query = query.in('category', categories);
        }
        if (product_type) {
            const types = product_type.split(',');
            query = query.in('product_type', types);
        }
        if (condition) {
            const conditions = condition.split(',');
            query = query.in('condition', conditions);
        }
        if (brand) {
            const brands = brand.split(',');
            query = query.in('brand', brands);
        }
        if (min_price) {
            query = query.gte('price', parseFloat(min_price));
        }
        if (max_price) {
            query = query.lte('price', parseFloat(max_price));
        }
        if (locale) {
            query = query.eq('locale', locale);
        }
        if (search) {
            query = query.ilike('product_name', `%${search}%`);
        }

        // Sorting
        const validSortFields = ['price', 'product_name', 'brand', 'created_at', 'rating', 'review_count'];
        const sortField = validSortFields.includes(sort_by) ? sort_by : 'price';
        const ascending = sort_order !== 'desc';
        query = query.order(sortField, { ascending });

        // Pagination
        const limitNum = Math.min(parseInt(limit) || 100, 500);
        const offsetNum = parseInt(offset) || 0;
        query = query.range(offsetNum, offsetNum + limitNum - 1);

        const { data, error, count } = await query;

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json({
            data,
            pagination: {
                total: count,
                limit: limitNum,
                offset: offsetNum,
                hasMore: offsetNum + limitNum < count,
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/products/stats — summary statistics
app.get('/api/products/stats', async (req, res) => {
    try {
        const { locale = 'us' } = req.query;
        const { data, error } = await supabase.rpc('get_product_stats', { p_locale: locale });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/filters — get available filter options
app.get('/api/filters', async (req, res) => {
    try {
        const { locale = 'us' } = req.query;
        const { data, error } = await supabase.rpc('get_product_filters', { p_locale: locale });
        if (error) return res.status(500).json({ error: error.message });
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/scrape-logs — view scrape history
app.get('/api/scrape-logs', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('scrape_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            return res.status(500).json({ error: error.message });
        }

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/scrape-status — last scrape time for frontend display
app.get('/api/scrape-status', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('scrape_logs')
            .select('completed_at, status, products_found, products_saved')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error || !data) {
            return res.json({ lastScrape: null });
        }

        res.json({
            lastScrape: data.completed_at,
            status: data.status,
            productsFound: data.products_found,
            productsSaved: data.products_saved,
        });
    } catch (err) {
        res.json({ lastScrape: null });
    }
});

// ============================================
// Admin — Manual Scrape Trigger
// ============================================
let scraperRunning = false;

const ADMIN_KEY_DEFAULT = '3dprinter-admin-2026';

function verifyAdmin(req, res) {
    const adminKey = req.headers['x-admin-key'] || req.query.key;
    const expectedKey = process.env.ADMIN_KEY || ADMIN_KEY_DEFAULT;
    if (adminKey !== expectedKey) {
        res.status(401).json({ error: 'Unauthorized — invalid admin key' });
        return false;
    }
    return true;
}

// Lightweight inline scraper (works on Vercel — no Playwright needed)
const SCRAPE_SEARCHES = [
    { query: '3D+printer+FDM', category: '3d_printer', productType: 'fdm' },
    { query: 'Bambu+Lab+3D+printer', category: '3d_printer', productType: 'fdm' },
    { query: 'Creality+3D+printer', category: '3d_printer', productType: 'fdm' },
    { query: 'resin+3D+printer', category: '3d_printer', productType: 'resin_sla' },
    { query: '3D+printer+filament+PLA', category: 'filament', productType: 'pla' },
    { query: '3D+printer+filament+PETG', category: 'filament', productType: 'petg' },
    { query: '3D+printer+accessories', category: 'accessories', productType: 'tools' },
    { query: '3D+pen', category: '3d_pen', productType: '3d_pen' },
];

const AFFILIATE_TAG = 'kiti09-20';

function detectBrandFromTitle(title) {
    const brands = [
        'Bambu Lab', 'Creality', 'ELEGOO', 'Anycubic', 'FLASHFORGE',
        'Phrozen', 'Prusa', 'Longer', 'SUNLU', 'HATCHBOX', 'eSUN',
        'Polymaker', 'Overture', 'JAYO', 'Sovol', 'QIDI', 'Voxelab',
    ];
    const upper = title.toUpperCase();
    return brands.find(b => upper.includes(b.toUpperCase())) || null;
}

async function runLightScrape() {
    let totalFound = 0, totalSaved = 0, errorsCount = 0;
    const startedAt = new Date().toISOString();

    for (const search of SCRAPE_SEARCHES) {
        try {
            const url = `https://www.amazon.com/s?k=${search.query}&tag=${AFFILIATE_TAG}`;
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html',
                    'Accept-Language': 'en-US,en;q=0.9',
                },
            });
            if (!res.ok) continue;

            const html = await res.text();
            const products = [];
            const asinPattern = /data-asin="([A-Z0-9]{10})"/g;
            const asins = new Set();
            let m;
            while ((m = asinPattern.exec(html)) !== null) asins.add(m[1]);

            for (const asin of asins) {
                if (products.length >= 30) break;
                const titleRx = new RegExp(`data-asin="${asin}"[\\s\\S]*?<span[^>]*class="a-size-[^"]*a-text-normal"[^>]*>([^<]+)</span>`, 'i');
                const priceRx = new RegExp(`data-asin="${asin}"[\\s\\S]*?<span class="a-price"[^>]*>[\\s\\S]*?<span[^>]*>\\$([\\d,.]+)</span>`, 'i');
                const tMatch = html.match(titleRx);
                const pMatch = html.match(priceRx);
                if (tMatch?.[1] && pMatch?.[1]) {
                    const price = parseFloat(pMatch[1].replace(/,/g, ''));
                    if (price > 0) {
                        products.push({
                            amazon_asin: asin,
                            product_name: tMatch[1].trim(),
                            price,
                            brand: detectBrandFromTitle(tMatch[1]),
                            category: search.category,
                            product_type: search.productType,
                            condition: 'new',
                            locale: 'us',
                            amazon_url: `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`,
                        });
                    }
                }
            }

            totalFound += products.length;
            if (products.length > 0) {
                const { error } = await supabase.from('products').upsert(products, {
                    onConflict: 'amazon_asin', ignoreDuplicates: false,
                });
                if (error) { errorsCount += products.length; }
                else { totalSaved += products.length; }
            }
            await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
            errorsCount++;
        }
    }

    await supabase.from('scrape_logs').insert({
        status: errorsCount > 0 ? 'partial' : 'success',
        products_found: totalFound,
        products_saved: totalSaved,
        errors_count: errorsCount,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
    });

    return { totalFound, totalSaved, errorsCount };
}

// POST /api/admin/scrape — trigger scraper manually
app.post('/api/admin/scrape', async (req, res) => {
    if (!verifyAdmin(req, res)) return;

    if (scraperRunning) {
        return res.status(409).json({ error: 'Scraper is already running' });
    }

    scraperRunning = true;
    res.json({ message: 'Scraper started', startedAt: new Date().toISOString() });

    // Run async
    try {
        const result = await runLightScrape();
        console.log('Scraper completed:', result);
    } catch (err) {
        console.error('Scraper error:', err.message);
    } finally {
        scraperRunning = false;
    }
});

// GET /api/admin/scrape-running — check if scraper is active
app.get('/api/admin/scrape-running', (req, res) => {
    res.json({ running: scraperRunning });
});

// GET /api/admin/product-stats — detailed product stats for admin
app.get('/api/admin/product-stats', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { data: totalData } = await supabase.from('products').select('*', { count: 'exact', head: true });
        const { count: totalCount } = await supabase.from('products').select('*', { count: 'exact', head: true });

        const { data: cats } = await supabase.rpc('get_product_filters', { p_locale: 'us' });
        const { data: recentProducts } = await supabase
            .from('products')
            .select('product_name, price, brand, category, created_at')
            .order('created_at', { ascending: false })
            .limit(10);

        res.json({
            totalProducts: totalCount || 0,
            categories: cats?.categories || [],
            brands: cats?.brands || [],
            recentProducts: recentProducts || [],
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fallback to index.html for SPA — skip files with extensions (.xml, .txt, etc.)
app.get('/{*path}', (req, res, next) => {
    if (path.extname(req.path)) {
        return next(); // Let static middleware handle real files
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
// Start server (only when running locally, not on Vercel)
if (process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`🚀 3D Printer Prices API running at http://localhost:${PORT}`);
        console.log(`   API: http://localhost:${PORT}/api/products`);
        console.log(`   Stats: http://localhost:${PORT}/api/products/stats`);
        console.log(`   Frontend: http://localhost:${PORT}`);
    });
}

// Export for Vercel serverless
module.exports = app;
