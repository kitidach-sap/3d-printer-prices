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
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// ============================================
// SITE CONFIG (Template Abstraction)
// ============================================
const SITE_CONFIG = {
    site_name: '3D Printer Prices',
    site_tagline: 'Find the perfect 3D printer for your needs',
    product_category: '3d_printer',
    taxonomy_labels: {
        printer_type: ['FDM', 'Resin', 'Resin/SLA'],
        categories: ['3d_printer', 'filament', 'resin', 'accessories', '3d_pen'],
        experience_levels: ['beginner', 'intermediate', 'advanced', 'professional'],
        use_cases: ['prototyping', 'miniatures', 'functional', 'cosplay', 'education', 'business', 'hobby', 'jewelry', 'dental']
    },
    scoring_rules: {
        beginner_score_max: 10,
        speed_score_max: 10,
        completeness_weights: { display_name: 10, brand: 10, price: 15, image_url: 10, rating: 10, review_count: 5, printer_type: 10, specs_json: 15, beginner_score: 5, labels: 5, tags: 5 }
    },
    affiliate_tag: 'kiti09-20',
    scraper: { max_retries: 3, retry_delay_ms: 2000, batch_size: 3 }
};

// ============================================
// UTILITY: Completeness Score
// ============================================
function computeCompletenessScore(product) {
    const weights = SITE_CONFIG.scoring_rules.completeness_weights;
    let score = 0;
    let maxScore = 0;

    for (const [field, weight] of Object.entries(weights)) {
        maxScore += weight;
        const val = product[field];
        if (val !== null && val !== undefined && val !== '' && val !== 'Unknown') {
            if (typeof val === 'object' && Object.keys(val).length === 0) continue;
            if (Array.isArray(val) && val.length === 0) continue;
            score += weight;
        }
    }
    return Math.round((score / maxScore) * 100);
}

// ============================================
// UTILITY: Retry with backoff
// ============================================
async function fetchWithRetry(url, options = {}, retries = SITE_CONFIG.scraper.max_retries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
            if (res.ok || attempt === retries) return res;
            console.warn(`Retry ${attempt}/${retries} for ${url} (status: ${res.status})`);
        } catch (err) {
            console.warn(`Retry ${attempt}/${retries} for ${url}: ${err.message}`);
            if (attempt === retries) throw err;
        }
        await new Promise(r => setTimeout(r, SITE_CONFIG.scraper.retry_delay_ms * attempt));
    }
}
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
            beginner_only,
            printer_type
        } = req.query;

        let query = supabase
            .from('products')
            .select('*', { count: 'exact' });

        // Filters
        if (req.query.ids) {
            const idsList = req.query.ids.split(',');
            query = query.in('id', idsList);
        }
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
        if (beginner_only === 'true') {
            query = query.gte('beginner_score', 8);
        }
        if (printer_type) {
            query = query.eq('printer_type', printer_type);
        }

        // Visibility rule: hide junk-title products unless recovered
        // Show if: is_junk_title = false OR (is_junk_title = true AND display_name IS NOT NULL)
        query = query.or('is_junk_title.eq.false,is_junk_title.is.null,display_name.not.is.null');

        // Sorting
        const validSortFields = ['price', 'product_name', 'brand', 'created_at', 'rating', 'review_count', 'beginner_score'];
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
            .order('started_at', { ascending: false })
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
            .order('started_at', { ascending: false })
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
    { query: '3D+printer+FDM', category: '3d_printer', productType: 'fdm', label: '3D Printer FDM' },
    { query: 'Bambu+Lab+3D+printer', category: '3d_printer', productType: 'fdm', label: 'Bambu Lab' },
    { query: 'Creality+3D+printer', category: '3d_printer', productType: 'fdm', label: 'Creality' },
    { query: 'resin+3D+printer', category: '3d_printer', productType: 'resin_sla', label: 'Resin Printer' },
    { query: '3D+printer+filament+PLA', category: 'filament', productType: 'pla', label: 'PLA Filament' },
    { query: '3D+printer+filament+PETG', category: 'filament', productType: 'petg', label: 'PETG Filament' },
    { query: '3D+printer+filament+ABS', category: 'filament', productType: 'abs', label: 'ABS Filament' },
    { query: '3D+printer+filament+TPU+flexible', category: 'filament', productType: 'tpu', label: 'TPU Filament' },
    { query: 'UV+resin+for+3D+printer', category: 'resin', productType: 'uv_resin', label: 'UV Resin' },
    { query: '3D+printer+wash+cure+resin', category: 'resin', productType: 'uv_resin', label: 'Wash & Cure Resin' },
    { query: '3D+printer+accessories+nozzle+bed', category: 'accessories', productType: 'tools', label: 'Accessories' },
    { query: '3D+printer+tools+kit+scraper', category: 'accessories', productType: 'tools', label: 'Tools Kit' },
    { query: '3D+pen', category: '3d_pen', productType: '3d_pen', label: '3D Pen' },
];

const AFFILIATE_TAG = 'kiti09-20';
let SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '';

// Load saved API key from Supabase on startup
(async () => {
    try {
        const { data } = await supabase
            .from('settings')
            .select('value')
            .eq('key', 'scraper_api_key')
            .single();
        if (data?.value && !SCRAPER_API_KEY) {
            SCRAPER_API_KEY = data.value;
            console.log('[Scraper] Loaded API key from Supabase settings');
        }
    } catch (e) {
        console.log('[Scraper] No saved API key found (settings table may not exist)');
    }
})();

// Fetch Amazon page — uses ScraperAPI proxy if configured, else direct fetch
async function fetchAmazonPage(amazonUrl, stepLabel) {
    if (SCRAPER_API_KEY) {
        // Route through ScraperAPI proxy (bypasses CAPTCHA/bot detection)
        const proxyUrl = `http://api.scraperapi.com?api_key=${SCRAPER_API_KEY}&url=${encodeURIComponent(amazonUrl)}&country_code=us`;
        logProgress('search', `${stepLabel} — via ScraperAPI proxy...`);
        const res = await fetch(proxyUrl, { headers: { 'Accept': 'text/html' } });
        return res;
    } else {
        // Direct fetch with realistic browser headers
        const userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        ];
        const res = await fetch(amazonUrl, {
            headers: {
                'User-Agent': userAgents[Math.floor(Math.random() * userAgents.length)],
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1',
            },
        });
        return res;
    }
}

// Progress tracking
let scrapeProgress = [];
function logProgress(type, message, data = {}) {
    const entry = { time: new Date().toISOString(), type, message, ...data };
    scrapeProgress.push(entry);
    console.log(`[Scraper] ${type}: ${message}`, data.error || '');
}

function detectBrandFromTitle(title) {
    const brands = [
        'Bambu Lab', 'Creality', 'ELEGOO', 'Anycubic', 'FLASHFORGE',
        'Phrozen', 'Prusa', 'Longer', 'SUNLU', 'HATCHBOX', 'eSUN',
        'Polymaker', 'Overture', 'JAYO', 'Sovol', 'QIDI', 'Voxelab',
    ];
    const upper = title.toUpperCase();
    return brands.find(b => upper.includes(b.toUpperCase())) || null;
}

// ============================================
// Fetch full product details from /dp/ASIN
// ============================================
async function fetchProductDetails(asin, label = '') {
    const productUrl = `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`;
    try {
        const res = await fetchAmazonPage(productUrl, label);
        if (!res.ok) return null;
        const html = await res.text();
        if (html.includes('captcha') || html.includes('automated access') || html.length < 5000) return null;

        const details = {};

        // Image URL (main product image)
        const imgMatch = html.match(/id="landingImage"[^>]*src="([^"]+)"/i)
            || html.match(/id="imgBlkFront"[^>]*src="([^"]+)"/i)
            || html.match(/"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i)
            || html.match(/"large"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/i);
        if (imgMatch?.[1] && !imgMatch[1].includes('transparent-pixel')) {
            details.image_url = imgMatch[1].split('._')[0] + '._AC_SL500_.jpg';
        }

        // Rating
        const ratingMatch = html.match(/(\d+\.\d+)\s*out of 5 stars/i);
        if (ratingMatch?.[1]) details.rating = parseFloat(ratingMatch[1]);

        // Review Count
        const reviewMatch = html.match(/([\d,]+)\s*(?:global )?ratings?/i);
        if (reviewMatch?.[1]) details.review_count = parseInt(reviewMatch[1].replace(/,/g, ''));

        // Current Price
        const priceMatch = html.match(/class="a-price-whole"[^>]*>(\d+[,\d]*)</);
        if (priceMatch?.[1]) details.price = parseFloat(priceMatch[1].replace(/[,$]/g, ''));

        // Original / Was Price + Discount
        const origMatch = html.match(/class="a-text-strike"[^>]*>\$?([\d,.]+)/)
            || html.match(/List Price[^<]*<[^>]+>\$?([\d,.]+)/i);
        if (origMatch?.[1]) {
            details.original_price = parseFloat(origMatch[1].replace(/[,$]/g, ''));
            if (details.original_price && details.price && details.original_price > details.price) {
                details.discount_percent = Math.round((1 - details.price / details.original_price) * 100);
            }
        }

        // Prime
        details.is_prime = html.includes('a-icon-prime') || html.includes('FREE delivery');

        // Brand from byline (more accurate than title detection)
        const brandMatch = html.match(/id="bylineInfo"[^>]*>[^<]*(?:by\s+)?<[^>]*>([^<]+)</i)
            || html.match(/class="contributorNameID"[^>]*>([^<]+)</i);
        if (brandMatch?.[1] && brandMatch[1].trim().length > 1) {
            details.brand = brandMatch[1].trim();
        }

        return details;
    } catch (e) {
        return null;
    }
}

async function runLightScrape(filterCategories = null, maxPerQuery = 30) {
    let totalFound = 0, totalSaved = 0, totalSkipped = 0, errorsCount = 0;
    const startedAt = new Date().toISOString();
    scrapeProgress = []; // Reset progress

    // Filter searches by selected categories (if provided)
    const searches = filterCategories && filterCategories.length > 0
        ? SCRAPE_SEARCHES.filter(s => filterCategories.includes(s.category))
        : SCRAPE_SEARCHES;

    const mode = SCRAPER_API_KEY ? '🔑 ScraperAPI' : '⚡ Direct (may be blocked)';
    logProgress('start', `Starting scrape: ${searches.length} queries, max ${maxPerQuery}/query — Mode: ${mode}`);

    if (!SCRAPER_API_KEY) {
        logProgress('warn', '⚠️ No SCRAPER_API_KEY set — using direct fetch. Amazon may block with 503.');
    }

    // === Step 1: Pre-load all existing ASINs from database ===
    logProgress('parse', '📦 Loading existing ASINs from database...');
    const existingAsins = new Set();
    try {
        let page = 0, pageSize = 1000, hasMore = true;
        while (hasMore) {
            const { data, error } = await supabase
                .from('products')
                .select('amazon_asin')
                .range(page * pageSize, (page + 1) * pageSize - 1);
            if (error) throw error;
            if (data) data.forEach(r => { if (r.amazon_asin) existingAsins.add(r.amazon_asin); });
            hasMore = data && data.length === pageSize;
            page++;
        }
        logProgress('parse', `📦 Found ${existingAsins.size} existing products in DB — will skip these`);
    } catch (e) {
        logProgress('warn', `⚠️ Could not load existing ASINs: ${e.message} — will use upsert fallback`);
    }

    // === Step 2: Scrape each query ===
    for (let i = 0; i < searches.length; i++) {
        const search = searches[i];
        const stepLabel = `[${i + 1}/${searches.length}] ${search.label}`;

        try {
            logProgress('search', `${stepLabel} — Searching Amazon...`, { query: search.query });

            // Try page 1
            const amazonUrl = `https://www.amazon.com/s?k=${search.query}&tag=${AFFILIATE_TAG}`;
            const res = await fetchAmazonPage(amazonUrl, stepLabel);

            if (!res.ok) {
                logProgress('error', `${stepLabel} — HTTP ${res.status} (${res.statusText})`, { status: res.status });
                errorsCount++;
                continue;
            }

            const html = await res.text();

            // Check for CAPTCHA / bot detection
            if (html.includes('captcha') || html.includes('automated access') || html.length < 5000) {
                logProgress('warn', `${stepLabel} — Amazon blocked (CAPTCHA/bot detection). HTML len: ${html.length}`);
                errorsCount++;
                continue;
            }

            logProgress('parse', `${stepLabel} — Got ${html.length.toLocaleString()} chars, parsing...`);

            // Extract all ASINs from page
            const allAsins = new Set();
            const asinPattern = /data-asin="([A-Z0-9]{10})"/g;
            let m;
            while ((m = asinPattern.exec(html)) !== null) allAsins.add(m[1]);

            // Filter out existing ASINs
            const newAsins = [...allAsins].filter(a => !existingAsins.has(a));
            const skippedCount = allAsins.size - newAsins.length;
            totalSkipped += skippedCount;

            logProgress('parse', `${stepLabel} — Found ${allAsins.size} ASINs, ${newAsins.length} NEW, ${skippedCount} skipped (already in DB)`);

            // Extract product details only for NEW ASINs
            const products = [];
            for (const asin of newAsins) {
                if (products.length >= maxPerQuery) break;

                // Extract the product block for this ASIN
                const blockStart = html.indexOf(`data-asin="${asin}"`);
                if (blockStart === -1) continue;
                // Find the end of this product block (next data-asin or end)
                const nextAsin = html.indexOf('data-asin="', blockStart + 20);
                const block = html.substring(blockStart, nextAsin > 0 ? nextAsin : blockStart + 5000);

                // Helper: is this a garbage/non-product title?
                const isGarbageTitle = (t) => {
                    if (!t || t.length < 10) return true;
                    if (/^\d[\d.]* out of \d/i.test(t)) return true; // "4.2 out of 5 stars"
                    if (t.includes('Check each product')) return true;
                    if (t.includes('buying options')) return true;
                    if (t.includes('Sponsored')) return true;
                    if (t.includes('Best Seller')) return true;
                    if (/^[\d\s.$,]+$/.test(t)) return true; // just numbers/prices
                    return false;
                };

                // Extract title — try multiple patterns within this block only
                let title = null;

                // Pattern 1: span with a-text-normal class inside h2 (most reliable)
                const normalSpans = block.match(/<span[^>]*class="[^"]*a-text-normal[^"]*"[^>]*>([^<]+)<\/span>/gi);
                if (normalSpans) {
                    for (const s of normalSpans) {
                        const m = s.match(/>([^<]+)</);
                        if (m?.[1] && !isGarbageTitle(m[1].trim())) { title = m[1].trim(); break; }
                    }
                }

                // Pattern 2: aria-label on the product link (usually full title)
                if (!title) {
                    const ariaMatches = [...block.matchAll(/<a[^>]*aria-label="([^"]{15,})"[^>]*>/gi)];
                    for (const am of ariaMatches) {
                        if (!isGarbageTitle(am[1].trim())) { title = am[1].trim(); break; }
                    }
                }

                // Pattern 3: h2 > a > span content (fallback)
                if (!title) {
                    const h2Spans = [...block.matchAll(/<h2[^>]*>[\s\S]*?<span[^>]*>([^<]{15,})<\/span>/gi)];
                    for (const hs of h2Spans) {
                        if (!isGarbageTitle(hs[1].trim())) { title = hs[1].trim(); break; }
                    }
                }

                // Final check
                if (!title || isGarbageTitle(title)) continue;

                // Extract price within this block
                const priceMatch = block.match(/<span class="a-price"[^>]*>[\s\S]*?<span[^>]*>\$([0-9,]+\.\d{2})<\/span>/i);
                if (!priceMatch?.[1]) continue;
                const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                if (price <= 0) continue;

                // Extract rating if available
                const ratingMatch = block.match(/<span[^>]*aria-label="([0-9.]+) out of 5 stars"/i);
                const reviewMatch = block.match(/(\d[\d,]*)\s*(?:ratings?|reviews?)/i);

                products.push({
                    amazon_asin: asin,
                    product_name: title,
                    price,
                    brand: detectBrandFromTitle(title),
                    rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
                    review_count: reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : null,
                    category: search.category,
                    product_type: search.productType,
                    condition: 'new',
                    locale: 'us',
                    is_available: true,
                    amazon_url: `https://www.amazon.com/dp/${asin}?tag=${AFFILIATE_TAG}`,
                    updated_at: new Date().toISOString(),
                });
            }

            totalFound += products.length;
            logProgress('extract', `${stepLabel} — Extracted ${products.length} NEW products with price`);

            // === Step 3: Enrich each product with full details from /dp/ASIN page ===
            if (products.length > 0) {
                logProgress('extract', `${stepLabel} — Fetching full details for ${products.length} products...`);
                for (let pi = 0; pi < products.length; pi++) {
                    const p = products[pi];
                    const details = await fetchProductDetails(p.amazon_asin, stepLabel);
                    if (details) {
                        if (details.image_url) p.image_url = details.image_url;
                        if (details.rating !== undefined) p.rating = details.rating;
                        if (details.review_count !== undefined) p.review_count = details.review_count;
                        if (details.price !== undefined && details.price > 0) p.price = details.price;
                        if (details.original_price !== undefined) p.original_price = details.original_price;
                        if (details.discount_percent !== undefined) p.discount_percent = details.discount_percent;
                        if (details.brand) p.brand = details.brand;
                        // Small delay between product page requests
                        await new Promise(r => setTimeout(r, 800 + Math.random() * 500));
                    }
                }
                logProgress('extract', `${stepLabel} — ✅ Enriched ${products.filter(p => p.image_url).length}/${products.length} products with images`);
            }

            if (products.length > 0) {
                const { error } = await supabase.from('products').insert(products);
                if (error) {
                    logProgress('error', `${stepLabel} — Supabase error: ${error.message}`, { error: error.message });
                    errorsCount += products.length;
                } else {
                    totalSaved += products.length;
                    // Add to existingAsins so next queries also skip them
                    products.forEach(p => existingAsins.add(p.amazon_asin));
                    logProgress('save', `${stepLabel} — ✅ Saved ${products.length} NEW products`);
                }
            } else if (newAsins.length === 0) {
                logProgress('warn', `${stepLabel} — All ${allAsins.size} products already in DB — no new products`);
            } else {
                logProgress('warn', `${stepLabel} — ${newAsins.length} new ASINs but no price data found`);
            }


            // Random delay 2-4s between queries to avoid rate limiting
            const delay = 2000 + Math.floor(Math.random() * 2000);
            await new Promise(r => setTimeout(r, delay));
        } catch (e) {
            logProgress('error', `${stepLabel} — Exception: ${e.message}`, { error: e.message });
            errorsCount++;
        }
    }

    const status = errorsCount === searches.length ? 'failed' : errorsCount > 0 ? 'partial' : 'success';
    logProgress('done', `Scrape complete: ${totalFound} new found, ${totalSaved} saved, ${totalSkipped} skipped (existing), ${errorsCount} errors`, {
        totalFound, totalSaved, totalSkipped, errorsCount, status,
    });

    await supabase.from('scrape_logs').insert({
        status,
        products_found: totalFound,
        products_saved: totalSaved,
        errors_count: errorsCount,
        started_at: startedAt,
        completed_at: new Date().toISOString(),
    });

    return { totalFound, totalSaved, errorsCount };
}

// GET /api/admin/scraper-mode — check scraper configuration
app.get('/api/admin/scraper-mode', (req, res) => {
    const masked = SCRAPER_API_KEY
        ? SCRAPER_API_KEY.slice(0, 8) + '••••••' + SCRAPER_API_KEY.slice(-4)
        : '';
    res.json({
        mode: SCRAPER_API_KEY ? 'scraperapi' : 'direct',
        hasApiKey: !!SCRAPER_API_KEY,
        maskedKey: masked,
    });
});

// POST /api/admin/scraper-key — save & validate ScraperAPI key
app.post('/api/admin/scraper-key', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    const { apiKey } = req.body;

    if (!apiKey || apiKey.length < 10) {
        return res.status(400).json({ error: 'Invalid API key format' });
    }

    // Test the key with a simple request
    try {
        const testUrl = `http://api.scraperapi.com?api_key=${apiKey}&url=${encodeURIComponent('https://httpbin.org/ip')}`;
        const testRes = await fetch(testUrl, { signal: AbortSignal.timeout(15000) });

        if (testRes.status === 401 || testRes.status === 403) {
            return res.json({ valid: false, error: 'API key is invalid or expired' });
        }
        if (!testRes.ok) {
            return res.json({ valid: false, error: `API returned HTTP ${testRes.status}` });
        }

        const body = await testRes.text();

        // Key is valid — save to Supabase settings and activate
        SCRAPER_API_KEY = apiKey;

        // Try to save to Supabase settings table
        try {
            await supabase.from('settings').upsert(
                { key: 'scraper_api_key', value: apiKey },
                { onConflict: 'key' }
            );
        } catch (e) {
            // Table might not exist — that's OK, key still works in memory
        }

        res.json({
            valid: true,
            message: '✅ API Key is valid and activated!',
            testResult: body.slice(0, 200),
        });
    } catch (e) {
        res.json({ valid: false, error: 'Connection failed: ' + e.message });
    }
});

// ===== Unified API Key Management =====

// Helper: mask a key for display
function maskKey(key) {
    if (!key) return '';
    if (key.length <= 12) return key.slice(0, 4) + '••••';
    return key.slice(0, 8) + '••••••' + key.slice(-4);
}

// Valid key types we support
const VALID_KEY_TYPES = [
    'scraper_api_key', 'gemini_api_key', 'openai_api_key',
    'x_api_key', 'x_api_secret', 'x_access_token', 'x_access_secret',
];

// POST /api/admin/save-api-key — save any API key to Supabase settings
app.post('/api/admin/save-api-key', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    const { keyType, value } = req.body;

    if (!VALID_KEY_TYPES.includes(keyType)) {
        return res.status(400).json({ error: `Invalid key type: ${keyType}` });
    }
    if (!value || value.length < 5) {
        return res.status(400).json({ error: 'Key too short' });
    }

    try {
        // Special validation for ScraperAPI
        if (keyType === 'scraper_api_key') {
            const testUrl = `http://api.scraperapi.com?api_key=${value}&url=${encodeURIComponent('https://httpbin.org/ip')}`;
            const testRes = await fetch(testUrl, { signal: AbortSignal.timeout(15000) });
            if (testRes.status === 401 || testRes.status === 403) {
                return res.json({ success: false, error: 'ScraperAPI key is invalid or expired' });
            }
            SCRAPER_API_KEY = value; // Activate immediately
        }

        // Special validation for Gemini
        if (keyType === 'gemini_api_key') {
            const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${value}`, {
                signal: AbortSignal.timeout(10000),
            });
            if (!testRes.ok) {
                return res.json({ success: false, error: `Gemini key invalid (HTTP ${testRes.status})` });
            }
        }

        // Special validation for OpenAI
        if (keyType === 'openai_api_key') {
            const testRes = await fetch('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${value}` },
                signal: AbortSignal.timeout(10000),
            });
            if (!testRes.ok) {
                return res.json({ success: false, error: `OpenAI key invalid (HTTP ${testRes.status})` });
            }
        }

        // Save to Supabase
        await supabase.from('settings').upsert(
            { key: keyType, value, updated_at: new Date().toISOString() },
            { onConflict: 'key' }
        );

        res.json({ success: true, masked: maskKey(value) });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// GET /api/admin/api-keys-status — status of all API keys
app.get('/api/admin/api-keys-status', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { data } = await supabase.from('settings')
            .select('key, value, updated_at')
            .in('key', VALID_KEY_TYPES);

        const keys = {};
        for (const type of VALID_KEY_TYPES) {
            const row = data?.find(r => r.key === type);
            keys[type] = {
                configured: !!row?.value,
                masked: row?.value ? maskKey(row.value) : '',
                updatedAt: row?.updated_at || null,
            };
        }
        // Overlay in-memory ScraperAPI key (could be from .env)
        if (SCRAPER_API_KEY && !keys.scraper_api_key.configured) {
            keys.scraper_api_key = { configured: true, masked: maskKey(SCRAPER_API_KEY), updatedAt: null };
        }
        res.json(keys);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/delete-api-key — remove an API key
app.delete('/api/admin/delete-api-key/:keyType', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    const { keyType } = req.params;
    if (!VALID_KEY_TYPES.includes(keyType)) return res.status(400).json({ error: 'Invalid key type' });
    try {
        await supabase.from('settings').delete().eq('key', keyType);
        if (keyType === 'scraper_api_key') SCRAPER_API_KEY = '';
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== Blog & X Schedule =====

// POST /api/admin/save-schedule — save any schedule config
app.post('/api/admin/save-schedule', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    const { scheduleType, cron, enabled } = req.body;
    if (!['blog_schedule', 'x_schedule'].includes(scheduleType)) {
        return res.status(400).json({ error: 'Invalid schedule type' });
    }
    try {
        await supabase.from('settings').upsert(
            { key: scheduleType, value: JSON.stringify({ cron, enabled }), updated_at: new Date().toISOString() },
            { onConflict: 'key' }
        );
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/get-schedule/:type
app.get('/api/admin/get-schedule/:type', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    const type = req.params.type + '_schedule';
    try {
        const { data } = await supabase.from('settings').select('value').eq('key', type).single();
        res.json(data?.value ? JSON.parse(data.value) : { cron: '', enabled: false });
    } catch (e) {
        res.json({ cron: '', enabled: false });
    }
});

// ===== AI Generation (Gemini + OpenAI) =====

// Helper: load an API key from settings
async function loadKey(keyName) {
    try {
        const { data } = await supabase.from('settings').select('value').eq('key', keyName).single();
        return data?.value || '';
    } catch (e) { return ''; }
}

// Helper: call AI — supports 'gemini', 'openai', or 'auto' (tries both)
async function callAI(prompt, { maxTokens = 8192, provider = 'auto' } = {}) {
    const geminiKey = (provider === 'gemini' || provider === 'auto') ? await loadKey('gemini_api_key') : '';
    const openaiKey = (provider === 'openai' || provider === 'auto') ? await loadKey('openai_api_key') : '';

    // Decide which to use
    let useProvider = provider;
    if (provider === 'auto') {
        useProvider = geminiKey ? 'gemini' : openaiKey ? 'openai' : '';
    }
    if (useProvider === 'gemini' && !geminiKey) throw new Error('Gemini API Key not configured — go to Settings');
    if (useProvider === 'openai' && !openaiKey) throw new Error('OpenAI API Key not configured — go to Settings');
    if (!useProvider) throw new Error('No AI API Key configured — set Gemini or OpenAI key in Settings');

    if (useProvider === 'gemini') {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 },
                }),
                signal: AbortSignal.timeout(60000),
            }
        );
        if (!res.ok) {
            const err = await res.text();
            // If auto mode and Gemini fails, try OpenAI fallback
            if (provider === 'auto' && openaiKey) {
                console.log('Gemini failed, falling back to OpenAI...');
                return callAI(prompt, { maxTokens, provider: 'openai' });
            }
            throw new Error(`Gemini API error (${res.status}): ${err.slice(0, 200)}`);
        }
        const json = await res.json();
        return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    // OpenAI
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: maxTokens,
            temperature: 0.8,
        }),
        signal: AbortSignal.timeout(90000),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${err.slice(0, 200)}`);
    }
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
}

// POST /api/admin/generate-blog — AI generate blog post
app.post('/api/admin/generate-blog', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    const { topic, articleType, length, instructions, autoTopic, aiProvider } = req.body;

    try {
        // Fetch top products for context
        const { data: products } = await supabase.from('products')
            .select('product_name, brand, price, category, product_type, rating, review_count, amazon_url')
            .eq('is_available', true)
            .order('rating', { ascending: false, nullsLast: true })
            .limit(30);

        const productList = (products || []).map(p =>
            `- ${p.product_name} | $${p.price} | ${p.brand || 'Unknown'} | Rating: ${p.rating || 'N/A'} (${p.review_count || 0} reviews) | ${p.amazon_url || ''}`
        ).join('\n');

        const lengthMap = { short: '800-1000', medium: '1500-2000', long: '2500-3500' };
        const wordCount = lengthMap[length] || '1500-2000';

        let topicText = topic;
        if (autoTopic) {
            // Auto-pick a topic based on product data
            const topicPrompt = `You are a content strategist for 3D Printer Prices (3d-printer-prices.com), a price comparison site for 3D printers, filaments, and accessories.

Based on these current products in our database:
${productList.slice(0, 2000)}

Suggest ONE compelling blog post topic that would drive organic traffic. Just reply with the topic title, nothing else. Make it SEO-friendly with specific keywords. Examples of good topics:
- "Best Budget 3D Printers Under $300 in 2026"
- "Creality vs Bambu Lab: Which 3D Printer is Worth Your Money?"
- "Top 5 PLA Filaments for Beginners (Tested & Ranked)"`;
            topicText = await callAI(topicPrompt, { maxTokens: 200, provider: aiProvider || 'auto' });
            topicText = topicText.replace(/^["'\s]+|["'\s]+$/g, '');
        }

        const blogPrompt = `You are an expert 3D printing content writer for **3D Printer Prices** (3d-printer-prices.com), a price comparison website that aggregates 3D printer, filament, and accessory prices from Amazon with affiliate links.

## Your Task
Write a comprehensive, SEO-optimized blog article.

**Topic:** ${topicText}
**Article Type:** ${articleType || 'buying-guide'}
**Target Length:** ${wordCount} words
${instructions ? `**Special Instructions:** ${instructions}` : ''}

## Product Data (use these real prices and products)
${productList}

## Writing Guidelines
1. **Tone:** Friendly, knowledgeable, helpful — like a maker community expert talking to friends
2. **SEO:** Include the main keyword in the first paragraph, use H2/H3 headings, include "3D Printer Prices" brand mentions naturally
3. **Structure:**
   - Compelling intro with hook
   - Clear H2 sections (use ## in markdown)
   - Product recommendations with REAL prices from the data above
   - Comparison tables where relevant (markdown tables)
   - Pros/Cons lists
   - "Bottom Line" or "Our Pick" conclusion
4. **Affiliate:** When mentioning specific products, include their Amazon links from the data
5. **CTA:** End with a call-to-action like "Compare all 3D printer prices at 3d-printer-prices.com"
6. **Format:** Output in clean Markdown format
7. **Authenticity:** Use real product names and prices from the data. Don't make up products.

Write the complete article now:`;

        const content = await callAI(blogPrompt, { maxTokens: 8192, provider: aiProvider || 'auto' });
        res.json({ success: true, topic: topicText, content, wordCount: content.split(/\s+/).length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/generate-x-post — AI generate X/Twitter post
app.post('/api/admin/generate-x-post', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    const { postType, customPrompt, aiProvider } = req.body;

    try {
        let contextData = '';
        let typeInstruction = '';

        if (postType === 'new_products' || postType === 'deals') {
            const { data: products } = await supabase.from('products')
                .select('product_name, brand, price, category, rating, amazon_url')
                .eq('is_available', true)
                .order('created_at', { ascending: false })
                .limit(10);

            contextData = (products || []).map(p =>
                `${p.product_name} — $${p.price} (${p.brand || ''}) ${p.amazon_url || ''}`
            ).join('\n');

            if (postType === 'new_products') {
                typeInstruction = 'Create an engaging tweet about NEW 3D printer products just added to our site. Highlight the best one or two with prices.';
            } else {
                typeInstruction = 'Create an engaging tweet about 3D printer DEALS and price drops. Make it feel urgent and valuable.';
            }
        } else if (postType === 'blog_links') {
            typeInstruction = 'Create an engaging tweet promoting our latest 3D printing content/guide. Drive clicks to 3d-printer-prices.com';
            contextData = 'Latest blog topics: Best 3D Printers Under $300, FDM vs Resin Guide, Best Filament for Beginners';
        }

        const xPrompt = `You are the social media manager for **3D Printer Prices** (3d-printer-prices.com), a 3D printer price comparison website.

## Task
Write ONE engaging X (Twitter) post. ${typeInstruction}

## Context Data
${contextData}

${customPrompt ? `## Additional Instructions: ${customPrompt}` : ''}

## Rules
1. MAX 280 characters (Twitter limit)
2. Include 2-3 relevant hashtags: #3DPrinting #3DPrinter #MakerCommunity #3DPrinterDeals
3. Include a link: https://3d-printer-prices.com
4. Use emojis strategically (🖨️ 🔥 💰 ✨ 🎯 ⬇️)
5. Create urgency or curiosity
6. Be conversational, not salesy
7. Include a real product name and price from the data if available

## Format
Output ONLY the tweet text, nothing else. No quotes around it.`;

        const tweet = await callAI(xPrompt, { maxTokens: 400, provider: aiProvider || 'auto' });
        // Clean up — remove quotes, ensure within 280 chars
        let cleanTweet = tweet.replace(/^["'\s\n]+|["'\s\n]+$/g, '').trim();
        if (cleanTweet.length > 280) cleanTweet = cleanTweet.slice(0, 277) + '...';

        res.json({ success: true, tweet: cleanTweet, charCount: cleanTweet.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== Blog Publishing =====

// Helper: generate slug from title
function slugify(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
}

// Helper: extract first heading and first paragraph from markdown
function extractMeta(markdown) {
    const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
    let title = '', description = '';
    for (const line of lines) {
        if (!title && /^#{1,3}\s/.test(line)) {
            title = line.replace(/^#{1,3}\s*/, '').replace(/\*+/g, '').trim();
        } else if (title && !description && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('-')) {
            description = line.slice(0, 200);
        }
        if (title && description) break;
    }
    return { title: title || 'Untitled Post', description };
}

// POST /api/admin/publish-blog — save generated blog post to DB
app.post('/api/admin/publish-blog', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    const { content, articleType, publishNow } = req.body;

    if (!content || content.length < 50) {
        return res.status(400).json({ error: 'Content too short' });
    }

    try {
        const { title, description } = extractMeta(content);
        const baseSlug = slugify(title);
        const slug = baseSlug || 'blog-post-' + Date.now();
        const wordCount = content.split(/\s+/).length;

        const post = {
            slug,
            title,
            description,
            content,
            article_type: articleType || 'buying-guide',
            word_count: wordCount,
            is_published: !!publishNow,
            published_at: publishNow ? new Date().toISOString() : null,
        };

        const { data, error } = await supabase.from('blog_posts')
            .upsert(post, { onConflict: 'slug' })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            post: data,
            url: `/blog/${data.slug}`,
            message: publishNow ? '✅ Published!' : '✅ Saved as draft',
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/blog/posts — public: list published blog posts
app.get('/api/blog/posts', async (req, res) => {
    try {
        const { data } = await supabase.from('blog_posts')
            .select('id, slug, title, description, article_type, word_count, published_at')
            .eq('is_published', true)
            .order('published_at', { ascending: false });
        res.json(data || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/blog/posts/:slug — public: get single blog post
app.get('/api/blog/posts/:slug', async (req, res) => {
    try {
        const { data } = await supabase.from('blog_posts')
            .select('*')
            .eq('slug', req.params.slug)
            .eq('is_published', true)
            .single();
        if (!data) return res.status(404).json({ error: 'Post not found' });
        res.json(data);
    } catch (e) {
        res.status(404).json({ error: 'Post not found' });
    }
});

// GET /api/admin/blog/list — admin: list all posts (including drafts)
app.get('/api/admin/blog/list', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { data } = await supabase.from('blog_posts')
            .select('id, slug, title, article_type, word_count, is_published, published_at, created_at')
            .order('created_at', { ascending: false });
        res.json(data || []);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/admin/blog/:id/toggle — toggle publish status
app.patch('/api/admin/blog/:id/toggle', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { data: post } = await supabase.from('blog_posts').select('is_published').eq('id', req.params.id).single();
        const newStatus = !post.is_published;
        await supabase.from('blog_posts').update({
            is_published: newStatus,
            published_at: newStatus ? new Date().toISOString() : null,
        }).eq('id', req.params.id);
        res.json({ success: true, is_published: newStatus });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/blog/:id — delete blog post
app.delete('/api/admin/blog/:id', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        await supabase.from('blog_posts').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// GET /api/admin/scrape-progress — live progress feed
app.get('/api/admin/scrape-progress', (req, res) => {
    res.json({
        running: scraperRunning,
        progress: scrapeProgress,
        total: scrapeProgress.length,
    });
});

// POST /api/admin/scrape — trigger scraper manually
app.post('/api/admin/scrape', async (req, res) => {
    if (!verifyAdmin(req, res)) return;

    if (scraperRunning) {
        return res.status(409).json({ error: 'Scraper is already running' });
    }

    scraperRunning = true;
    const categories = req.body?.categories || null;
    const maxPerQuery = Math.min(parseInt(req.body?.maxPerQuery) || 30, 100);
    res.json({ message: 'Scraper started', startedAt: new Date().toISOString(), categories, maxPerQuery });

    // Run async
    try {
        const result = await runLightScrape(categories, maxPerQuery);
        console.log('Scraper completed:', result);
    } catch (err) {
        logProgress('error', `Fatal error: ${err.message}`, { error: err.message });
        console.error('Scraper error:', err.message);
    } finally {
        scraperRunning = false;
    }
});

// POST /api/admin/update-prices — re-check prices + enrich existing products with full details
let priceUpdateRunning = false;
let priceUpdateResult = null;
app.post('/api/admin/update-prices', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    if (priceUpdateRunning) return res.status(409).json({ error: 'Price update is already running' });

    priceUpdateRunning = true;
    priceUpdateResult = null;
    const startedAt = new Date().toISOString();
    res.json({ message: 'Price update started' });

    try {
        // Prioritize products without image_url first (most need enrichment)
        // Limit to 20 per run to stay within Vercel's 10s function timeout
        const LIMIT = 20;
        let query = supabase.from('products')
            .select('id, amazon_asin, price')
            .not('amazon_asin', 'like', 'MANUAL%');

        // First try products without images
        const { data: noImageProducts } = await query
            .is('image_url', null)
            .limit(LIMIT);

        // If we have enough no-image products use those, else fallback to oldest updated
        let products;
        if (noImageProducts && noImageProducts.length >= 5) {
            products = noImageProducts;
        } else {
            const { data: oldProducts } = await supabase
                .from('products')
                .select('id, amazon_asin, price')
                .not('amazon_asin', 'like', 'MANUAL%')
                .order('updated_at', { ascending: true })
                .limit(LIMIT);
            products = oldProducts || [];
        }

        const total = products.length;
        if (!total) { priceUpdateRunning = false; return; }

        let updated = 0, unavailable = 0, errors = 0;

        // Process 3 at a time to avoid rate limiting
        const BATCH = 3;
        for (let i = 0; i < products.length; i += BATCH) {
            const batch = products.slice(i, i + BATCH);
            const promises = batch.map(async (product) => {
                try {
                    const details = await fetchProductDetails(product.amazon_asin, `[Update ${i + 1}]`);

                    if (!details) {
                        // Could not fetch — mark unavailable
                        await supabase.from('products').update({ is_available: false, updated_at: new Date().toISOString() }).eq('id', product.id);
                        unavailable++;
                        return;
                    }

                    // Build update payload — only include fields that were actually fetched
                    const updatePayload = {
                        is_available: true,
                        updated_at: new Date().toISOString(),
                    };
                    if (details.price > 0) updatePayload.price = details.price;
                    if (details.original_price > 0) updatePayload.original_price = details.original_price;
                    if (details.discount_percent !== undefined) updatePayload.discount_percent = details.discount_percent;
                    if (details.rating !== undefined) updatePayload.rating = details.rating;
                    if (details.review_count !== undefined) updatePayload.review_count = details.review_count;
                    if (details.image_url) updatePayload.image_url = details.image_url;
                    if (details.brand) updatePayload.brand = details.brand;

                    await supabase.from('products').update(updatePayload).eq('id', product.id);
                    updated++;
                } catch (e) {
                    errors++;
                }
            });

            await Promise.all(promises);
            await new Promise(r => setTimeout(r, 1500)); // Rate limit between batches
        }

        const completedAt = new Date().toISOString();
        const status = errors === total ? 'failed' : (errors > 0 || unavailable > 0) ? 'partial' : 'success';

        // Count remaining products without image
        const { count: remaining } = await supabase.from('products')
            .select('id', { count: 'exact', head: true })
            .not('amazon_asin', 'like', 'MANUAL%')
            .is('image_url', null);

        priceUpdateResult = { updated, unavailable, errors, total, status, remaining: remaining || 0 };

        // Log to scrape_logs
        await supabase.from('scrape_logs').insert({
            status,
            products_found: total,
            products_saved: updated,
            errors_count: errors,
            started_at: startedAt,
            completed_at: completedAt,
            notes: `[Price Update] ${updated} updated, ${unavailable} unavailable, ${errors} errors. ${remaining || 0} still need images.`,
        });
        console.log(`Price update done: ${updated} updated, ${unavailable} unavailable, ${errors} errors. ${remaining || 0} remaining without image.`);
    } catch (err) {
        console.error('Price update error:', err.message);
        priceUpdateResult = { error: err.message };
    } finally {
        priceUpdateRunning = false;
    }
});


// GET /api/admin/update-prices-running
app.get('/api/admin/update-prices-running', (req, res) => {
    res.json({ running: priceUpdateRunning, result: priceUpdateResult });
});

// GET /api/admin/scrape-running — check if scraper is active
app.get('/api/admin/scrape-running', (req, res) => {
    res.json({ running: scraperRunning });
});

// ===== Product Management =====

// GET /api/admin/products — paginated product list with search
app.get('/api/admin/products', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const search = req.query.search || '';
    const category = req.query.category || '';
    const sort = req.query.sort || 'created_at';
    const order = req.query.order === 'asc' ? true : false;

    try {
        let query = supabase.from('products')
            .select('id, product_name, brand, price, category, product_type, amazon_asin, amazon_url, rating, review_count, is_available, created_at, updated_at, printer_type, labels, beginner_score', { count: 'exact' });

        if (search) query = query.ilike('product_name', `%${search}%`);
        if (category) query = query.eq('category', category);

        const { data, count, error } = await query
            .order(sort, { ascending: order })
            .range((page - 1) * limit, page * limit - 1);

        if (error) return res.status(500).json({ error: error.message });
        res.json({ products: data, total: count, page, limit, totalPages: Math.ceil((count || 0) / limit) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/admin/products/:id — delete single product
app.delete('/api/admin/products/:id', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { error } = await supabase.from('products').delete().eq('id', req.params.id);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// POST /api/admin/products/bulk-delete — delete multiple products
app.post('/api/admin/products/bulk-delete', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ error: 'No IDs provided' });
    try {
        const { error } = await supabase.from('products').delete().in('id', ids);
        if (error) return res.status(500).json({ error: error.message });
        res.json({ success: true, deleted: ids.length });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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

// POST /api/admin/product — add product manually
app.post('/api/admin/product', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { product_name, price, brand, category, product_type, condition, amazon_url, image_url } = req.body;
        if (!product_name || !price || !category) {
            return res.status(400).json({ error: 'product_name, price, and category are required' });
        }

        // Generate a pseudo-ASIN for manually added products
        const amazon_asin = 'MANUAL' + Date.now().toString(36).toUpperCase();

        const product = {
            amazon_asin,
            product_name,
            price: parseFloat(price),
            brand: brand || null,
            category,
            product_type: product_type || null,
            condition: condition || 'new',
            locale: 'us',
            amazon_url: amazon_url || null,
            image_url: image_url || null,
        };

        const { data, error } = await supabase.from('products').insert(product).select();
        if (error) return res.status(500).json({ error: error.message });

        res.json({ success: true, product: data?.[0] || product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/product — delete product by id
app.delete('/api/admin/product', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'id is required' });

        const { error } = await supabase.from('products').delete().eq('id', id);
        if (error) return res.status(500).json({ error: error.message });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/schedule — get current schedule settings
app.get('/api/admin/schedule', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { data } = await supabase
            .from('scrape_logs')
            .select('completed_at')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        // Calculate next run based on cron (daily 6AM UTC)
        const now = new Date();
        const nextRun = new Date(now);
        nextRun.setUTCHours(6, 0, 0, 0);
        if (nextRun <= now) nextRun.setUTCDate(nextRun.getUTCDate() + 1);

        res.json({
            cronExpression: '0 6 * * *',
            frequency: 'daily',
            lastRun: data?.completed_at || null,
            nextRun: nextRun.toISOString(),
        });
    } catch (err) {
        res.json({ cronExpression: '0 6 * * *', frequency: 'daily', lastRun: null, nextRun: null });
    }
});

// GET /blog/:slug — serve blog post as HTML page
app.get('/blog/:slug', async (req, res, next) => {
    const slug = req.params.slug;
    // Skip if it looks like a file (has extension)
    if (path.extname(slug)) return next();

    try {
        const { data } = await supabase.from('blog_posts')
            .select('*')
            .eq('slug', slug)
            .eq('is_published', true)
            .single();

        if (!data) return next();

        // Convert markdown to basic HTML
        let html = data.content
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/^### (.+)$/gm, '<h3>$1</h3>')
            .replace(/^## (.+)$/gm, '<h2>$1</h2>')
            .replace(/^# (.+)$/gm, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
            .replace(/^- (.+)$/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        html = '<p>' + html + '</p>';
        html = html.replace(/<p><h([123])>/g, '<h$1>').replace(/<\/h([123])><\/p>/g, '</h$1>');
        html = html.replace(/<p><ul>/g, '<ul>').replace(/<\/ul><\/p>/g, '</ul>');

        const readTime = Math.max(1, Math.round(data.word_count / 250));
        const pubDate = data.published_at ? new Date(data.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

        res.send(`<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title} — 3D Printer Prices</title>
    <meta name="description" content="${(data.description || '').replace(/"/g, '&quot;')}">
    <link rel="canonical" href="https://3d-printer-prices.com/blog/${data.slug}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${data.title}">
    <meta property="og:description" content="${(data.description || '').replace(/"/g, '&quot;')}">
    <meta property="og:url" content="https://3d-printer-prices.com/blog/${data.slug}">
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Article","headline":"${data.title}","description":"${(data.description || '').replace(/"/g, '\\"')}","datePublished":"${data.published_at || ''}","author":{"@type":"Organization","name":"3D Printer Prices"},"publisher":{"@type":"Organization","name":"3D Printer Prices"}}
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/style.css">
    <link rel="stylesheet" href="/blog/blog.css">
    <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
    <header class="header">
        <div class="header-content">
            <div class="logo">
                <a href="/" class="logo-link">
                    <span class="logo-icon">🖨️</span>
                    <div>
                        <h1>3D Printer Prices</h1>
                        <p class="tagline">${data.article_type || 'Blog'}</p>
                    </div>
                </a>
            </div>
            <nav class="header-actions">
                <a href="/blog/" class="nav-link">← Blog</a>
                <a href="/" class="nav-link">Compare Prices</a>
            </nav>
        </div>
    </header>
    <article class="blog-article">
        <div class="article-meta">
            <span>📅 ${pubDate}</span>
            <span>⏱️ ${readTime} min read</span>
            <span>📝 ${data.word_count} words</span>
        </div>
        <div class="article-body">${html}</div>
        <div class="article-cta">
            <p>🔍 <strong>Compare all 3D printer prices at <a href="/">3d-printer-prices.com</a></strong></p>
        </div>
    </article>
    <footer class="footer">
        <p class="footer-links">
            <a href="/">Home</a> · <a href="/blog/">Blog</a> · <a href="/privacy.html">Privacy Policy</a> · <a href="/terms.html">Terms of Service</a>
        </p>
    </footer>
</body>
</html>`);
    } catch (e) {
        next();
    }
});

// Fallback to index.html for SPA — skip files with extensions and API routes
app.get('/{*path}', (req, res, next) => {
    if (path.extname(req.path) || req.path.startsWith('/api/')) {
        return next(); // Let API handlers or static middleware handle these
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// X Auto-Post Endpoints
app.get('/api/admin/system/x-post-status', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { data, error } = await supabase
            .from('settings')
            .select('value')
        res.json({ enabled: data ? (data.value === 'true' || data.value === true) : false });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// START NEW AI PRODUCT ENRICHMENT SCRIPT
app.post('/api/admin/enrich-products', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        console.log("Starting batched AI product enrichment...");

        // Fetch products missing basic AI enrichment
        const { data: productsToEnrich, error } = await supabase
            .from('products')
            .select('*')
            .is('last_enriched_at', null)
            .order('created_at', { ascending: false })
            .limit(3); // Small batch to fit Vercel timeout

        if (error) {
            console.error("Error fetching products:", error);
            return res.status(500).json({ error: error.message });
        }

        if (!productsToEnrich || productsToEnrich.length === 0) {
            return res.json({ success: true, message: "All products are enriched!", count: 0, activeEnrichment: false });
        }

        const enrichedResults = [];

        // Build the prompt request for all chunked items
        const promptsList = productsToEnrich.map(p => `ID: ${p.amazon_asin}\nProduct Name: ${p.product_name}\nCurrent Category: ${p.category}\nCurrent Brand: ${p.brand || 'unknown'}\nPrice: $${p.price || 'unknown'}\n---`).join('\n');

        const systemPrompt = `You are an expert 3D printing e-commerce data specialist.
Analyze each product and return structured data. You MUST be 100% accurate.

ANTI-HALLUCINATION RULES (CRITICAL):
- Do NOT guess specs that are not explicitly in the product title.
- If you cannot determine the brand, return brand as null.
- If unsure about the model name, shorten conservatively — do NOT invent details.
- Focus on NORMALIZE, not INVENT.
- Do NOT add dimensions, speeds, or features that are not in the title.
- Only remove duplicate brand prefixes (e.g. "Creality Creality K1" → "Creality K1").
- Never remove the only brand mention from a title.

For each product, determine:
1. "clean_name": A short, correct product name. Extract Brand + Model only.
   - Example: "Official Creality Ender 3 V3 KE 3D Printer High Speed..." → "Creality Ender 3 V3 KE"
   - Example: "ELEGOO Neptune 4 Pro FDM 3D Printer..." → "ELEGOO Neptune 4 Pro"
   - Example: "JAYO PLA 3D Printer Filament 1.75mm 1KG Spool..." → "JAYO PLA Filament 1kg"
   - If title is gibberish/junk (e.g. "Check each product page for other buying options"), return clean_name as null.
2. "brand": The verified brand name. If cannot be determined from title, return null.
3. "is_junk_title": true ONLY if the raw title is NOT a real product name (e.g. "Check each product page...", nonsensical text, placeholder text). Normal long Amazon titles are NOT junk — just messy.
4. "category": Exactly one of: "3d_printer", "filament", "resin", "accessories", "3d_pen", "scanner", "other".
   - Spool of plastic/wire = "filament". Bottle of liquid = "resin".
   - Parts/nozzles/build plates/tools = "accessories". Machine that prints = "3d_printer".
5. "printer_type": If "3d_printer" → "FDM" or "Resin". If "accessories" → brief type (e.g. "Nozzle"). Otherwise empty string.
6. "labels": Array of 1-3 UI badges. Valid: "Best for Beginners", "High Speed", "Large Build Volume", "Budget Pick", "Multi-Color", "Ultra Detail".
7. "beginner_score": Int 1-10. Accessories/filament = 0.
8. "speed_score": Int 1-10.
9. "maintenance_score": Int 1-10.
10. "material_support": Array of material strings.
11. "specs_json": Key-value specs extracted ONLY from what is in the title. Do not invent.

Return as JSON Array:
{ "amazon_asin": "string", "clean_name": "string|null", "brand": "string|null", "is_junk_title": boolean, "category": "string", "printer_type": "string", "labels": [], "beginner_score": number, "speed_score": number, "maintenance_score": number, "material_support": [], "specs_json": {} }

CRITICAL: Return ONLY valid JSON array, no markdown.`;

        let rawResponse = '';

        try {
            // Get settings helper
            const getSupabaseSetting = async (key) => {
                try {
                    const { data } = await supabase.from('settings').select('value').eq('key', key).single();
                    return data?.value || '';
                } catch (e) { return ''; }
            };

            // 1. Try Gemini
            const geminiKey = await getSupabaseSetting('gemini_api_key');
            if (geminiKey) {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: systemPrompt + '\n\n' + promptsList }] }],
                        generationConfig: {
                            responseMimeType: "application/json"
                        }
                    })
                });
                const data = await response.json();
                if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
                    rawResponse = data.candidates[0].content.parts[0].text;
                }
            } else {
                // 2. Try OpenAI
                const openAiKey = await getSupabaseSetting('openai_api_key');
                if (openAiKey) {
                    const OpenAI = require('openai');
                    const openai = new OpenAI({ apiKey: openAiKey });
                    const completion = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: promptsList }
                        ],
                        response_format: { type: "json_object" }
                    });
                    rawResponse = completion.choices[0].message.content;
                } else {
                    throw new Error("No Gemini or OpenAI key found in DB settings.");
                }
            }

            // Parse response
            let parsedData = [];
            try {
                let cleanStr = rawResponse.replace(/```json/g, '').replace(/```/g, '').trim();
                const jsonDoc = JSON.parse(cleanStr);
                parsedData = Array.isArray(jsonDoc) ? jsonDoc : (jsonDoc.products || jsonDoc.items || Object.values(jsonDoc)[0]);
                if (!Array.isArray(parsedData)) throw new Error("Parsed data is not an array");
            } catch (e) {
                console.error("Failed to parse AI response:", rawResponse);
                throw new Error("Invalid JSON from AI generation");
            }

            // Update DB with source-aware overwrite rules
            for (let ai of parsedData) {
                if (!ai.amazon_asin) continue;

                // Find the original product for source-aware decisions
                const original = productsToEnrich.find(p => p.amazon_asin === ai.amazon_asin);
                if (!original) continue;

                // Build update object
                const updateObj = {
                    category: ai.category || original.category,
                    printer_type: ai.printer_type || 'Unknown',
                    labels: ai.labels || [],
                    beginner_score: ai.beginner_score || 0,
                    speed_score: ai.speed_score || null,
                    maintenance_score: ai.maintenance_score || null,
                    material_support: ai.material_support || [],
                    specs_json: ai.specs_json || {},
                    is_junk_title: ai.is_junk_title === true,
                    last_enriched_at: new Date().toISOString(),
                };

                // --- Brand overwrite decision tree ---
                const existingBrandSource = original.brand_source;
                const aiBrand = ai.brand;
                // Only write if AI returned a non-empty brand
                if (aiBrand && aiBrand.trim() !== '') {
                    if (!existingBrandSource || existingBrandSource === 'unknown' || existingBrandSource === 'ai') {
                        // Safe to overwrite: no trusted source exists
                        updateObj.brand = aiBrand.trim();
                        updateObj.brand_source = 'ai';
                    }
                    // If brand_source is 'manual', 'detail', or 'trusted_seed' → SKIP, never overwrite
                }

                // --- Display name overwrite decision tree ---
                const existingNameSource = original.display_name_source;
                const aiCleanName = ai.clean_name;
                if (aiCleanName && aiCleanName.trim() !== '') {
                    if (!existingNameSource || existingNameSource === 'raw' || existingNameSource === 'ai') {
                        // Safe to overwrite: no 'manual' or 'detail' source
                        updateObj.display_name = aiCleanName.trim();
                        updateObj.display_name_source = 'ai';
                    }
                    // If display_name_source is 'manual' or 'detail' → SKIP
                }

                // Auto-detect material_type for filaments/resins (for compatibility explorer)
                const rawName = (product.product_name || '').toUpperCase();
                if ((product.category === 'filament' || product.category === 'resin') && !product.material_type) {
                    const matRules = [
                        ['PLA', /\bPLA\b/], ['PETG', /\bPETG\b/], ['ABS', /\bABS\b/],
                        ['TPU', /\bTPU\b/], ['Nylon', /\bNYLON\b/], ['ASA', /\bASA\b/],
                        ['Silk', /\bSILK\b/], ['Wood', /\bWOOD\b/],
                        ['Carbon Fiber', /\bCARBON\s*FIBER\b|\bCF\b/],
                        ['PC', /\bPOLYCARBONATE\b/],
                    ];
                    for (const [mat, regex] of matRules) {
                        if (regex.test(rawName)) { updateObj.material_type = mat; break; }
                    }
                    if (!updateObj.material_type && product.category === 'resin') {
                        updateObj.material_type = 'Resin';
                    }
                }

                // Auto-compute tags for this product (using updated fields)
                const mergedProduct = { ...product, ...updateObj };
                updateObj.tags = computeProductTags(mergedProduct);

                const { error: updateErr } = await supabase
                    .from('products')
                    .update(updateObj)
                    .eq('amazon_asin', ai.amazon_asin);

                if (!updateErr) {
                    enrichedResults.push(ai.amazon_asin);
                } else {
                    console.error(`Failed to update ${ai.amazon_asin}:`, updateErr.message);
                }
            }

            // Re-check count
            const { count: remainingCount } = await supabase.from('products').select('*', { count: 'exact', head: true }).is('last_enriched_at', null);

            res.json({
                success: true,
                message: `Enriched ${enrichedResults.length} products.`,
                count: enrichedResults.length,
                activeEnrichment: remainingCount > 0,
                remainingCount: remainingCount
            });

        } catch (genError) {
            console.error("AI Generation Error:", genError);
            res.status(500).json({ error: "Failed to generate structured data from AI: " + genError.message });
        }

    } catch (err) {
        console.error("Enrichment Route Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// END NEW AI PRODUCT ENRICHMENT SCRIPT

// ============================================
// DETAIL PAGE SCRAPER
// ============================================
app.post('/api/admin/fetch-details', async (req, res) => {
    if (!verifyAdmin(req, res)) return;

    const cheerio = require('cheerio');
    const AFFILIATE_TAG = 'kiti09-20';
    const FETCH_TIMEOUT = 30000; // 30 seconds per product (render=true is slower)

    try {
        console.log("🔍 Starting detail page scraper...");

        // Load ScraperAPI key
        let scraperApiKey = process.env.SCRAPER_API_KEY || null;
        if (!scraperApiKey) {
            try {
                const { data } = await supabase.from('settings').select('value').eq('key', 'scraper_api_key').single();
                if (data?.value && data.value.length > 10) scraperApiKey = data.value;
            } catch (e) { /* no key */ }
        }

        if (!scraperApiKey) {
            return res.status(400).json({ error: "ScraperAPI key not configured. Set it in Admin settings or .env." });
        }

        // Atomic row claiming via RPC (FOR UPDATE SKIP LOCKED)
        const { data: batch, error: claimErr } = await supabase.rpc('claim_detail_scrape_batch', { batch_size: 3 });

        if (claimErr) {
            console.error("Claim error:", claimErr);
            return res.status(500).json({ error: "Failed to claim batch: " + claimErr.message });
        }

        if (!batch || batch.length === 0) {
            // Count remaining
            const { count } = await supabase.from('products').select('*', { count: 'exact', head: true })
                .is('detail_scraped_at', null)
                .not('amazon_asin', 'is', null);
            return res.json({ success: true, message: "No eligible products for detail scrape.", processed: 0, remaining: count || 0 });
        }

        console.log(`   📦 Claimed ${batch.length} products for detail scraping`);

        const results = { success: 0, failed: 0, skipped: 0, details: [] };

        for (const product of batch) {
            const asin = product.amazon_asin;
            if (!asin) {
                // Mark as skipped
                await supabase.from('products').update({
                    detail_scrape_status: 'skipped',
                    detail_last_error: 'Missing ASIN'
                }).eq('id', product.id);
                results.skipped++;
                continue;
            }

            // Use ScraperAPI Structured Data API (purpose-built for Amazon, returns JSON)
            const scraperUrl = `https://api.scraperapi.com/structured/amazon/product/${asin}?api_key=${scraperApiKey}&country=us&tld=.com`;

            try {
                console.log(`   🌐 Fetching: ${asin} (structured API)...`);

                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

                const response = await fetch(scraperUrl, { signal: controller.signal });
                clearTimeout(timeout);

                const httpStatus = response.status;

                if (!response.ok) {
                    throw { type: 'fetch', httpStatus, message: `HTTP ${httpStatus}` };
                }

                const data = await response.json();

                // --- Map structured API fields ---
                const detailTitle = data.name || null;
                const detailBrand = data.brand || null;
                const imageUrl = data.images && data.images.length > 0 ? data.images[0] : (data.image || null);

                // Price parsing
                let price = null;
                if (data.pricing) {
                    price = parseFloat(data.pricing) || null;
                } else if (data.price) {
                    const priceStr = String(data.price).replace(/[^0-9.]/g, '');
                    price = parseFloat(priceStr) || null;
                }

                let originalPrice = null;
                if (data.initial_price) {
                    const origStr = String(data.initial_price).replace(/[^0-9.]/g, '');
                    originalPrice = parseFloat(origStr) || null;
                } else if (data.list_price) {
                    const origStr = String(data.list_price).replace(/[^0-9.]/g, '');
                    originalPrice = parseFloat(origStr) || null;
                }

                // Rating & reviews
                const rating = data.average_rating ? parseFloat(data.average_rating) : null;
                const reviewCount = data.total_reviews ? parseInt(String(data.total_reviews).replace(/[^0-9]/g, '')) : null;

                // Features
                const features = data.feature_bullets || [];

                // Specs
                let specsFromPage = {};
                if (data.product_information && typeof data.product_information === 'object') {
                    specsFromPage = data.product_information;
                }

                // Build volume from specs
                let buildVolume = null;
                const bvSpec = specsFromPage['Build Volume'] || specsFromPage['Print Size'] || specsFromPage['Printing Size'];
                if (bvSpec) {
                    buildVolume = bvSpec;
                } else {
                    for (const f of features) {
                        const bvMatch = f.match(/(\d+\s*[xX×]\s*\d+\s*[xX×]\s*\d+\s*mm)/);
                        if (bvMatch) { buildVolume = bvMatch[1]; break; }
                    }
                }

                // --- Build update object with per-field merge rules ---
                const updateObj = {
                    detail_scrape_status: 'success',
                    detail_scraped_at: new Date().toISOString(),
                    detail_http_status: httpStatus,
                    detail_last_error: null,
                    detail_page_url: `https://www.amazon.com/dp/${asin}`,
                    detail_title: detailTitle,
                    detail_brand: detailBrand,
                    price_last_seen_at: new Date().toISOString(),
                };

                // Display name: overwrite if source is NOT 'manual'
                if (detailTitle) {
                    const existingNameSource = product.display_name_source;
                    if (existingNameSource !== 'manual') {
                        updateObj.display_name = detailTitle;
                        updateObj.display_name_source = 'detail';
                    }
                }

                // Brand: overwrite if source is NOT 'manual'
                if (detailBrand && detailBrand.trim() !== '') {
                    const existingBrandSource = product.brand_source;
                    if (existingBrandSource !== 'manual') {
                        updateObj.brand = detailBrand.trim();
                        updateObj.brand_source = 'detail';
                    }
                }

                // Image: overwrite if current is NULL or placeholder
                if (imageUrl && (!product.image_url || product.image_url.includes('placeholder'))) {
                    updateObj.image_url = imageUrl;
                }

                // Price: update if we got a valid one
                if (price && price > 0) {
                    updateObj.price = price;
                }
                if (originalPrice && originalPrice > 0) {
                    updateObj.original_price = originalPrice;
                    if (price && price > 0) {
                        updateObj.discount_percent = Math.round(((originalPrice - price) / originalPrice) * 100);
                    }
                }

                // Rating & reviews: always update (latest is best)
                if (rating) updateObj.rating = rating;
                if (reviewCount) updateObj.review_count = reviewCount;

                // Build volume: overwrite if current is NULL
                if (buildVolume && !product.build_volume) {
                    updateObj.build_volume = buildVolume;
                }

                // Specs: merge field-by-field
                if (Object.keys(specsFromPage).length > 0) {
                    const existingSpecs = product.specs_json || {};
                    updateObj.specs_json = { ...existingSpecs, ...specsFromPage };
                }

                await supabase.from('products').update(updateObj).eq('id', product.id);
                results.success++;
                results.details.push({ asin, status: 'success', title: detailTitle, brand: detailBrand });
                console.log(`   ✅ ${asin}: "${detailTitle}" (${detailBrand})`);

            } catch (err) {
                // Per-product error isolation
                const isAbort = err.name === 'AbortError';
                const errorType = err.type === 'fetch' ? 'fetch' : (isAbort ? 'timeout' : 'parse');
                const errorMsg = isAbort ? 'Request timed out (30s)' : (err.message || String(err));
                const httpStatus = err.httpStatus || null;

                await supabase.from('products').update({
                    detail_scrape_status: 'failed',
                    detail_scrape_retries: (product.detail_scrape_retries || 0) + 1,
                    detail_http_status: httpStatus,
                    detail_last_error: `${errorType}: ${errorMsg}`,
                }).eq('id', product.id);

                results.failed++;
                results.details.push({ asin, status: 'failed', error: `${errorType}: ${errorMsg}` });
                console.error(`   ❌ ${asin}: ${errorType} - ${errorMsg}`);
            }

            // Small delay between requests to be polite
            await new Promise(r => setTimeout(r, 1500));
        }

        // Count remaining
        const { count: remaining } = await supabase.from('products').select('*', { count: 'exact', head: true })
            .is('detail_scraped_at', null)
            .not('amazon_asin', 'is', null);

        console.log(`🏁 Detail scrape batch done: ${results.success} success, ${results.failed} failed, ${results.skipped} skipped`);

        res.json({
            success: true,
            processed: batch.length,
            results,
            remaining: remaining || 0,
            hasMore: (remaining || 0) > 0,
        });

    } catch (err) {
        console.error("Detail scraper error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// COMPATIBILITY EXPLORER DATA
// ============================================
app.get('/api/compatibility-data', async (req, res) => {
    try {
        // Fetch all filaments/resins with material_type
        const { data: materials, error: matErr } = await supabase
            .from('products')
            .select('id, product_name, display_name, brand, price, image_url, rating, review_count, amazon_asin, amazon_url, category, material_type, printer_type')
            .in('category', ['filament', 'resin'])
            .not('material_type', 'is', null)
            .order('rating', { ascending: false, nullsFirst: false });

        if (matErr) throw matErr;

        // Fetch all printers
        const { data: printers, error: prnErr } = await supabase
            .from('products')
            .select('id, product_name, display_name, brand, price, image_url, rating, review_count, amazon_asin, amazon_url, category, printer_type')
            .eq('category', '3d_printer')
            .order('rating', { ascending: false, nullsFirst: false });

        if (prnErr) throw prnErr;

        res.json({ materials: materials || [], printers: printers || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// PRODUCT TAGS API
// ============================================

// Auto-tag logic: compute tags from product fields
function computeProductTags(product) {
    const tags = {};
    const name = (product.product_name || '').toUpperCase();

    // 1. Product type
    const catMap = { '3d_printer': '3D Printer', 'filament': 'Filament', 'resin': 'Resin Material', 'accessories': 'Accessory', '3d_pen': '3D Pen' };
    tags.product_type = [catMap[product.category] || 'Other'];

    // 2. Technology
    if (product.category === '3d_printer') {
        if (product.printer_type === 'FDM') tags.technology = ['FDM'];
        else if (['Resin', 'Resin/SLA'].includes(product.printer_type)) tags.technology = ['Resin', 'SLA'];
    }

    // 3. Material (for filaments/resins)
    if (product.material_type) tags.material = [product.material_type];

    // 4. Price range
    const p = product.price;
    if (p == null) tags.price_range = ['Unknown'];
    else if (p < 100) tags.price_range = ['Under $100', 'Budget'];
    else if (p < 300) tags.price_range = ['$100-$300', 'Mid-Range'];
    else if (p < 500) tags.price_range = ['$300-$500', 'Premium'];
    else if (p < 1000) tags.price_range = ['$500-$1000', 'Professional'];
    else tags.price_range = ['$1000+', 'Industrial'];

    // 5. Brand
    if (product.brand) tags.brand = [product.brand];

    // 6. Rating tier
    const r = product.rating;
    if (r == null) tags.rating_tier = ['Unrated'];
    else if (r >= 4.5) tags.rating_tier = ['Top Rated', '⭐⭐⭐⭐⭐'];
    else if (r >= 4.0) tags.rating_tier = ['Highly Rated', '⭐⭐⭐⭐'];
    else if (r >= 3.5) tags.rating_tier = ['Average', '⭐⭐⭐'];
    else tags.rating_tier = ['Below Average'];

    // 7. Use case (from name keywords)
    const useCases = [];
    if (/BEGINNER|STARTER|EASY/.test(name) || (product.beginner_score && product.beginner_score >= 8)) useCases.push('Beginner-Friendly');
    if (/HIGH.?SPEED|FAST|500MM/.test(name) || (product.speed_score && product.speed_score >= 8)) useCases.push('High-Speed');
    if (/LARGE|BIG|300X300|400X400/.test(name)) useCases.push('Large Format');
    if (/ENCLOS/.test(name)) useCases.push('Enclosed');
    if (/MULTI.?COLOR|AMS|4.?COLOR/.test(name)) useCases.push('Multi-Color');
    if (/DIRECT.?DRIVE/.test(name)) useCases.push('Direct Drive');
    if (/AUTO.?LEVEL/.test(name)) useCases.push('Auto-Leveling');
    if (/WIFI|WI-FI|WIRELESS/.test(name)) useCases.push('WiFi');
    if (/TOUCHSCREEN|TOUCH SCREEN/.test(name)) useCases.push('Touchscreen');
    if (/DUAL.?EXTRU/.test(name)) useCases.push('Dual Extruder');
    if (/PORTABLE|COMPACT|MINI/.test(name)) useCases.push('Compact');
    if (/PROFESSIONAL|INDUSTRIAL|COMMERCIAL/.test(name)) useCases.push('Professional');
    if (/GLOW/.test(name)) useCases.push('Glow-in-Dark');
    if (/MULTI.?PACK|BUNDLE|\dKG/.test(name)) useCases.push('Multi-Pack');
    if (/MATTE/.test(name)) useCases.push('Matte Finish');
    if (/SILK|SHINY|SHIMMER/.test(name)) useCases.push('Silk/Shiny');
    if (useCases.length > 0) tags.use_case = useCases;

    // 8. Accessory type
    if (product.category === 'accessories' && product.printer_type && product.printer_type !== 'Unknown') {
        tags.accessory_type = [product.printer_type];
    }

    // 9. Deal
    if (product.discount_percent && product.discount_percent >= 10) {
        tags.deal = product.discount_percent >= 30 ? ['Big Sale', 'On Sale'] : ['On Sale'];
    }

    // 10. Popularity
    const rc = product.review_count;
    if (rc >= 1000) tags.popularity = ['Bestseller', 'Popular'];
    else if (rc >= 500) tags.popularity = ['Popular'];
    else if (rc >= 100) tags.popularity = ['Well-Reviewed'];

    return tags;
}

// GET all unique tags with counts
app.get('/api/tags', async (req, res) => {
    try {
        const { data, error } = await supabase.from('products')
            .select('tags')
            .not('tags', 'is', null);

        if (error) throw error;

        // Aggregate all tags
        const tagCounts = {};
        (data || []).forEach(row => {
            const tags = row.tags || {};
            Object.entries(tags).forEach(([category, values]) => {
                if (!tagCounts[category]) tagCounts[category] = {};
                (Array.isArray(values) ? values : [values]).forEach(v => {
                    tagCounts[category][v] = (tagCounts[category][v] || 0) + 1;
                });
            });
        });

        res.json(tagCounts);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET products by tag filter
// Usage: /api/products/by-tag?use_case=Beginner-Friendly&price_range=Budget
app.get('/api/products/by-tag', async (req, res) => {
    try {
        let query = supabase.from('products')
            .select('id, product_name, display_name, brand, price, image_url, rating, review_count, amazon_asin, amazon_url, category, printer_type, material_type, tags')
            .order('rating', { ascending: false, nullsFirst: false });

        // Build JSONB containment filter from query params
        const tagFilters = {};
        const reserved = ['limit', 'offset', 'sort_by', 'sort_order'];
        Object.entries(req.query).forEach(([key, value]) => {
            if (!reserved.includes(key)) {
                tagFilters[key] = [value];
            }
        });

        if (Object.keys(tagFilters).length > 0) {
            query = query.contains('tags', tagFilters);
        }

        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;
        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        res.json({ data: data || [], count: (data || []).length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Refresh all product tags
app.post('/api/admin/tags/refresh', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { data: products, error } = await supabase.from('products').select('*');
        if (error) throw error;

        let updated = 0;
        for (const product of (products || [])) {
            const newTags = computeProductTags(product);
            const { error: upErr } = await supabase.from('products')
                .update({ tags: newTags })
                .eq('id', product.id);
            if (!upErr) updated++;
        }

        res.json({ success: true, updated, total: (products || []).length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RECOMMENDED GEAR (per printer)
// ============================================
app.get('/api/products/:id/recommended-gear', async (req, res) => {
    try {
        // 1. Get the printer
        const { data: printer, error: pErr } = await supabase
            .from('products')
            .select('id, category, printer_type, brand')
            .eq('id', req.params.id)
            .single();

        if (pErr || !printer || printer.category !== '3d_printer') {
            return res.json({ essentials: [], optionals: [] });
        }

        const isResin = ['Resin', 'Resin/SLA'].includes(printer.printer_type);

        // 2. Find matching accessories
        let accessoryQuery = supabase.from('products')
            .select('id, product_name, display_name, brand, price, image_url, rating, review_count, amazon_asin, amazon_url, category, printer_type, material_type')
            .eq('category', 'accessories')
            .not('price', 'is', null)
            .order('rating', { ascending: false, nullsFirst: false })
            .limit(10);

        const { data: accessories } = await accessoryQuery;

        // 3. Find matching filaments/resins
        const matCategory = isResin ? 'resin' : 'filament';
        const { data: materials } = await supabase.from('products')
            .select('id, product_name, display_name, brand, price, image_url, rating, review_count, amazon_asin, amazon_url, category, printer_type, material_type')
            .eq('category', matCategory)
            .not('price', 'is', null)
            .order('rating', { ascending: false, nullsFirst: false })
            .limit(10);

        // 4. Categorize into essentials vs optionals
        const essentials = [];
        const optionals = [];

        if (isResin) {
            // Resin essentials: wash & cure, tools
            const washCure = (accessories || []).find(a => 
                (a.printer_type || '').match(/wash.*cure/i));
            const toolSet = (accessories || []).find(a => 
                (a.printer_type || '').match(/tool/i));
            const resinMat = (materials || [])[0]; // top rated resin

            if (washCure) essentials.push({ ...washCure, role: 'tool', label: 'Wash & Cure Station', is_required: true });
            if (toolSet) essentials.push({ ...toolSet, role: 'tool', label: 'Resin Tool Kit', is_required: true });
            if (resinMat) essentials.push({ ...resinMat, role: 'material', label: 'UV Resin', is_required: true });

            // Custom essentials (not in DB)
            essentials.push({ role: 'safety', label: 'Nitrile Gloves', is_required: true, custom_name: 'Nitrile Gloves (100 pack)', custom_price: 9.99, custom_url: 'https://www.amazon.com/s?k=nitrile+gloves+disposable' });
            essentials.push({ role: 'safety', label: 'Respirator Mask', is_required: true, custom_name: '3M Half Facepiece Respirator', custom_price: 19.99, custom_url: 'https://www.amazon.com/s?k=3m+respirator+mask+organic+vapor' });
            essentials.push({ role: 'consumable', label: 'Isopropyl Alcohol 99%', is_required: true, custom_name: 'IPA 99% (1 Gallon)', custom_price: 24.99, custom_url: 'https://www.amazon.com/s?k=99+isopropyl+alcohol+gallon' });

            // Optionals
            (accessories || []).filter(a => a.id !== washCure?.id && a.id !== toolSet?.id).slice(0, 3)
                .forEach(a => optionals.push({ ...a, role: 'accessory', label: a.display_name || a.product_name, is_required: false }));

        } else {
            // FDM essentials
            const scraper = (accessories || []).find(a => 
                (a.printer_type || '').match(/scraper/i));
            const toolKit = (accessories || []).find(a => 
                (a.printer_type || '').match(/tool/i));
            const plaMat = (materials || []).find(m => m.material_type === 'PLA');
            const nozzle = (accessories || []).find(a => 
                (a.printer_type || '').match(/nozzle/i) && !(a.printer_type || '').match(/brush|clean/i));

            if (plaMat) essentials.push({ ...plaMat, role: 'material', label: 'PLA Filament', is_required: true });
            if (scraper) essentials.push({ ...scraper, role: 'tool', label: 'Scraper / Removal Tool', is_required: true });
            if (toolKit) essentials.push({ ...toolKit, role: 'tool', label: '3D Printer Tool Kit', is_required: true });

            // Optionals
            if (nozzle) optionals.push({ ...nozzle, role: 'upgrade', label: 'Spare Nozzles', is_required: false });
            
            const petg = (materials || []).find(m => m.material_type === 'PETG');
            if (petg) optionals.push({ ...petg, role: 'material', label: 'PETG Filament (stronger)', is_required: false });

            const nozzleBrush = (accessories || []).find(a => 
                (a.printer_type || '').match(/nozzle.*clean|clean.*nozzle|brush/i));
            if (nozzleBrush) optionals.push({ ...nozzleBrush, role: 'tool', label: 'Nozzle Cleaning Kit', is_required: false });

            // Catch-all optionals (filter out resin-specific items for FDM)
            const resinNamePattern = /resin|uv\s|cure|sla/i;
            (accessories || []).filter(a => 
                ![scraper?.id, toolKit?.id, nozzle?.id, nozzleBrush?.id].includes(a.id)
                && !resinNamePattern.test(a.display_name || a.product_name || '')
                && !resinNamePattern.test(a.printer_type || '')
            ).slice(0, 2)
                .forEach(a => optionals.push({ ...a, role: 'accessory', label: a.display_name || a.product_name, is_required: false }));
        }

        res.json({ essentials, optionals, printer_type: printer.printer_type });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// RECOMMENDATION ENGINE
// ============================================

// Budget bands mapping
const BUDGET_BANDS = {
    'under-100':  { min: 0,    max: 100,  label: 'Budget' },
    '100-300':    { min: 100,  max: 300,  label: 'Entry-Level' },
    '300-500':    { min: 300,  max: 500,  label: 'Mid-Range' },
    '500-1000':   { min: 500,  max: 1000, label: 'Premium' },
    '1000-plus':  { min: 1000, max: 99999, label: 'Professional' }
};

// Experience level → what properties matter
const EXPERIENCE_WEIGHTS = {
    'beginner':     { beginner_score: 3.0, rating: 2.0, review_count: 1.5 },
    'intermediate': { rating: 2.0, speed_score: 1.5, material_support: 1.5 },
    'advanced':     { speed_score: 2.0, material_support: 2.0, maintenance_score: 1.0 },
    'professional': { speed_score: 1.5, material_support: 2.5, rating: 1.5 }
};

// Use case → keywords to match in tags
const USE_CASE_MAP = {
    'prototyping':  ['FDM', 'Beginner-Friendly', 'High-Speed'],
    'miniatures':   ['Resin', 'SLA'],
    'functional':   ['FDM', 'PETG', 'ABS', 'Nylon', 'Direct Drive'],
    'cosplay':      ['FDM', 'Large Format', 'PLA'],
    'education':    ['FDM', 'Beginner-Friendly', 'Enclosed', 'Compact'],
    'business':     ['High-Speed', 'Enclosed', 'Professional', 'Multi-Color'],
    'hobby':        ['FDM', 'Beginner-Friendly', 'Budget'],
    'jewelry':      ['Resin', 'SLA'],
    'dental':       ['Resin', 'SLA', 'Professional']
};

app.get('/api/recommendations', async (req, res) => {
    try {
        const { budget, experience, use_case, materials, printer_type, limit: lim } = req.query;
        const resultLimit = Math.min(parseInt(lim) || 10, 30);

        // 1. Fetch candidate products
        let query = supabase.from('products')
            .select('id, product_name, display_name, brand, price, image_url, rating, review_count, amazon_asin, amazon_url, category, printer_type, material_type, tags, beginner_score, speed_score, maintenance_score, labels')
            .not('price', 'is', null)
            .order('rating', { ascending: false, nullsFirst: false });

        // Filter by category
        if (printer_type === 'FDM' || printer_type === 'Resin') {
            query = query.eq('category', '3d_printer').eq('printer_type', printer_type);
        } else if (req.query.category) {
            query = query.eq('category', req.query.category);
        } else {
            query = query.eq('category', '3d_printer');
        }

        // Budget filter (allow ±20% wiggle room)
        const band = BUDGET_BANDS[budget];
        if (band) {
            query = query.gte('price', band.min * 0.8).lte('price', band.max * 1.2);
        }

        query = query.limit(50); // Get a pool of candidates
        const { data: candidates, error } = await query;
        if (error) throw error;

        if (!candidates || candidates.length === 0) {
            return res.json({ recommendations: [], query: req.query, message: 'No products match your criteria. Try adjusting your budget or filters.' });
        }

        // 2. Score each candidate
        const scored = candidates.map(product => {
            let score = 0;
            const reasons = [];
            const tags = product.tags || {};

            // --- Price fit (30% weight) ---
            if (band) {
                const midPoint = (band.min + band.max) / 2;
                const priceDiff = Math.abs(product.price - midPoint) / midPoint;
                const priceScore = Math.max(0, 1 - priceDiff) * 30;
                score += priceScore;
                if (priceScore > 20) reasons.push(`Great value in your ${band.label} budget`);
            } else {
                score += 15; // neutral
            }

            // --- Rating (25% weight) ---
            if (product.rating) {
                const ratingScore = (product.rating / 5) * 25;
                score += ratingScore;
                if (product.rating >= 4.5) reasons.push(`Top rated (${product.rating}⭐)`);
            }

            // --- Experience match (20% weight) ---
            const expWeights = EXPERIENCE_WEIGHTS[experience];
            if (expWeights) {
                let expScore = 0;
                let maxPossible = 0;
                if (expWeights.beginner_score && product.beginner_score) {
                    expScore += (product.beginner_score / 10) * expWeights.beginner_score;
                    maxPossible += expWeights.beginner_score;
                    if (product.beginner_score >= 8) reasons.push('Beginner-friendly');
                }
                if (expWeights.speed_score && product.speed_score) {
                    expScore += (product.speed_score / 10) * expWeights.speed_score;
                    maxPossible += expWeights.speed_score;
                    if (product.speed_score >= 8) reasons.push('High-speed printing');
                }
                if (expWeights.rating && product.rating) {
                    expScore += (product.rating / 5) * expWeights.rating;
                    maxPossible += expWeights.rating;
                }
                if (expWeights.review_count && product.review_count) {
                    const revScore = Math.min(product.review_count / 2000, 1);
                    expScore += revScore * expWeights.review_count;
                    maxPossible += expWeights.review_count;
                    if (product.review_count >= 1000) reasons.push('Community-proven');
                }
                score += maxPossible > 0 ? (expScore / maxPossible) * 20 : 10;
            } else {
                score += 10;
            }

            // --- Use case match (15% weight) ---
            const useCaseKeywords = USE_CASE_MAP[use_case] || [];
            if (useCaseKeywords.length > 0) {
                const allTagValues = Object.values(tags).flat();
                const matches = useCaseKeywords.filter(kw => allTagValues.includes(kw));
                const useCaseScore = (matches.length / useCaseKeywords.length) * 15;
                score += useCaseScore;
                if (matches.length > 0) reasons.push(`Matches ${use_case}: ${matches.join(', ')}`);
            } else {
                score += 7;
            }

            // --- Material preference match (bonus) ---
            if (materials) {
                const wantedMaterials = materials.split(',');
                const supportedMaterials = tags.material || [];
                const matTech = tags.technology || [];
                const matMatches = wantedMaterials.filter(m => 
                    supportedMaterials.includes(m) || matTech.includes(m)
                );
                if (matMatches.length > 0) {
                    score += 5;
                    reasons.push(`Supports ${matMatches.join(', ')}`);
                }
            }

            // --- Popularity bonus (10% weight) ---
            if (product.review_count) {
                const popScore = Math.min(product.review_count / 5000, 1) * 10;
                score += popScore;
            }

            return {
                ...product,
                recommendation_score: Math.round(score * 10) / 10,
                reasons: reasons.length > 0 ? reasons : ['Solid overall choice']
            };
        });

        // 3. Sort by score, return top N
        scored.sort((a, b) => b.recommendation_score - a.recommendation_score);
        const topPicks = scored.slice(0, resultLimit);

        // 4. Add badges
        if (topPicks.length > 0) topPicks[0].badge = '🏆 Top Pick';
        if (topPicks.length > 1) topPicks[1].badge = '🥈 Runner Up';
        const bestValue = topPicks.reduce((a, b) => 
            (a.price && b.price && a.recommendation_score / a.price > b.recommendation_score / b.price) ? a : b, topPicks[0]);
        if (bestValue && bestValue !== topPicks[0]) bestValue.badge = bestValue.badge || '💰 Best Value';

        res.json({
            recommendations: topPicks,
            query: { budget, experience, use_case, materials, printer_type },
            scoring: {
                price_fit: '30%',
                rating: '25%',
                experience_match: '20%',
                use_case_match: '15%',
                popularity: '10%'
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// UPGRADE COMPATIBILITY API
// ============================================

// List all upgrade categories with counts
app.get('/api/upgrades', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('printer_upgrades')
            .select('*')
            .order('category')
            .order('estimated_cost', { ascending: true });
        if (error) throw error;

        // Group by category
        const grouped = {};
        (data || []).forEach(u => {
            if (!grouped[u.category]) grouped[u.category] = [];
            grouped[u.category].push(u);
        });

        res.json({ upgrades: data, by_category: grouped, total: data?.length || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get compatible upgrades for a specific printer
app.get('/api/products/:id/upgrades', async (req, res) => {
    try {
        const { data: compatEntries, error } = await supabase
            .from('upgrade_compatibility')
            .select('*, upgrade:printer_upgrades(*)')
            .eq('printer_id', req.params.id)
            .order('priority');

        if (error) throw error;

        // Group by priority
        const essential = [];
        const recommended = [];
        const optional = [];
        const advanced = [];

        (compatEntries || []).forEach(entry => {
            const item = {
                ...entry.upgrade,
                compatibility: entry.compatibility,
                install_difficulty: entry.install_difficulty,
                priority: entry.priority,
                notes: entry.notes
            };
            switch (entry.priority) {
                case 'essential': essential.push(item); break;
                case 'recommended': recommended.push(item); break;
                case 'advanced': advanced.push(item); break;
                default: optional.push(item);
            }
        });

        res.json({ essential, recommended, optional, advanced, total: compatEntries?.length || 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Knowledge Graph: get all connections for a product
app.get('/api/compatibility-graph/:id', async (req, res) => {
    try {
        const productId = req.params.id;

        // Get all connections where this product is source or target
        const { data: asSource, error: e1 } = await supabase
            .from('compatibility_graph')
            .select('*')
            .eq('source_id', productId);

        const { data: asTarget, error: e2 } = await supabase
            .from('compatibility_graph')
            .select('*')
            .eq('target_id', productId);

        if (e1) throw e1;
        if (e2) throw e2;

        // Collect unique connected IDs to resolve names
        const connectedIds = new Set();
        [...(asSource || []), ...(asTarget || [])].forEach(e => {
            connectedIds.add(e.source_id);
            connectedIds.add(e.target_id);
        });
        connectedIds.delete(productId);

        // Fetch names for connected products and upgrades
        const resolvedNames = {};
        if (connectedIds.size > 0) {
            const ids = Array.from(connectedIds);
            const { data: products } = await supabase
                .from('products')
                .select('id, display_name, product_name, category')
                .in('id', ids);
            const { data: upgrades } = await supabase
                .from('printer_upgrades')
                .select('id, name, category')
                .in('id', ids);

            (products || []).forEach(p => resolvedNames[p.id] = p.display_name || p.product_name);
            (upgrades || []).forEach(u => resolvedNames[u.id] = u.name);
        }

        res.json({
            product_id: productId,
            outgoing: (asSource || []).map(e => ({
                ...e,
                target_name: resolvedNames[e.target_id] || e.target_id
            })),
            incoming: (asTarget || []).map(e => ({
                ...e,
                source_name: resolvedNames[e.source_id] || e.source_id
            })),
            total_connections: (asSource?.length || 0) + (asTarget?.length || 0)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// STARTER KITS API
// ============================================

// List all published starter kits
app.get('/api/starter-kits', async (req, res) => {
    try {
        const { use_case, printer_type } = req.query;
        let query = supabase.from('starter_kits')
            .select('*')
            .eq('is_published', true)
            .order('estimated_total', { ascending: true });

        if (use_case) query = query.eq('use_case', use_case);
        if (printer_type) query = query.eq('printer_type', printer_type);

        const { data, error } = await query;
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get single starter kit with items + product details
app.get('/api/starter-kits/:slug', async (req, res) => {
    try {
        const { data: kit, error: kitErr } = await supabase
            .from('starter_kits')
            .select('*')
            .eq('slug', req.params.slug)
            .eq('is_published', true)
            .single();

        if (kitErr || !kit) return res.status(404).json({ error: 'Kit not found' });

        // Get items with product details
        const { data: items, error: itemErr } = await supabase
            .from('starter_kit_items')
            .select('*, products(id, product_name, display_name, brand, price, image_url, rating, review_count, amazon_asin, amazon_url)')
            .eq('kit_id', kit.id)
            .order('sort_order', { ascending: true });

        if (itemErr) throw itemErr;

        // Calculate total from actual prices
        let total = 0;
        const enrichedItems = (items || []).map(item => {
            const price = item.products?.price || item.custom_price || 0;
            total += price;
            return {
                ...item,
                resolved_name: item.products?.display_name || item.products?.product_name || item.custom_name || item.label,
                resolved_price: price,
                resolved_image: item.products?.image_url || null,
                resolved_url: item.products?.amazon_url || item.custom_url || null,
            };
        });

        res.json({ ...kit, items: enrichedItems, calculated_total: total });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get material compatibility for a product
app.get('/api/products/:id/compatibility', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('material_compatibility')
            .select('*')
            .eq('product_id', req.params.id)
            .order('difficulty', { ascending: true });

        if (error) throw error;
        res.json(data || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Create/update starter kit
app.post('/api/admin/starter-kits', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { kit, items } = req.body;
        if (!kit || !kit.name || !kit.slug) {
            return res.status(400).json({ error: 'Kit name and slug required' });
        }

        // Upsert kit
        const { data: savedKit, error: kitErr } = await supabase
            .from('starter_kits')
            .upsert({ ...kit, updated_at: new Date().toISOString() }, { onConflict: 'slug' })
            .select()
            .single();

        if (kitErr) throw kitErr;

        // Replace items if provided
        if (items && Array.isArray(items)) {
            await supabase.from('starter_kit_items').delete().eq('kit_id', savedKit.id);
            const itemsWithKit = items.map((item, i) => ({ ...item, kit_id: savedKit.id, sort_order: i }));
            const { error: itemErr } = await supabase.from('starter_kit_items').insert(itemsWithKit);
            if (itemErr) throw itemErr;
        }

        res.json({ success: true, kit: savedKit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: Add material compatibility
app.post('/api/admin/material-compatibility', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const entries = req.body;
        if (!Array.isArray(entries) || entries.length === 0) {
            return res.status(400).json({ error: 'Array of compatibility entries required' });
        }
        const { data, error } = await supabase
            .from('material_compatibility')
            .upsert(entries, { onConflict: 'product_id,material' })
            .select();
        if (error) throw error;
        res.json({ success: true, count: data.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/admin/system/x-post-status', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { enabled } = req.body;
        const { error } = await supabase
            .from('settings')
            .upsert({ key: 'x_post_enabled', value: enabled ? 'true' : 'false' }, { onConflict: 'key' });
        if (error) throw error;
        res.json({ success: true, enabled });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/admin/system/x-post-history', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    try {
        const { data, error } = await supabase
            .from('x_posts')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) throw error;
        res.json({ posts: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ============================================
// DATA HEALTH & FRESHNESS API
// ============================================
app.get('/api/admin/data-health', async (req, res) => {
    try {
        // 1. Get all products
        const { data: products, error } = await supabase.from('products')
            .select('id, product_name, display_name, brand, price, image_url, rating, review_count, printer_type, specs_json, beginner_score, labels, tags, category, scraped_at, updated_at, detail_scraped_at, last_enriched_at, detail_scrape_status');
        if (error) throw error;

        const now = new Date();
        const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
        const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
        const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

        // 2. Calculate completeness scores
        const scores = products.map(p => ({ id: p.id, name: p.display_name || p.product_name, score: computeCompletenessScore(p), category: p.category }));
        scores.sort((a, b) => a.score - b.score);

        const avgScore = Math.round(scores.reduce((s, p) => s + p.score, 0) / scores.length);
        const incomplete = scores.filter(s => s.score < 50);
        const partial = scores.filter(s => s.score >= 50 && s.score < 80);
        const complete = scores.filter(s => s.score >= 80);

        // 3. Data freshness
        const freshToday = products.filter(p => p.updated_at && new Date(p.updated_at) > oneDayAgo).length;
        const freshWeek = products.filter(p => p.updated_at && new Date(p.updated_at) > oneWeekAgo).length;
        const stale = products.filter(p => !p.updated_at || new Date(p.updated_at) < oneMonthAgo).length;

        // 4. Scraper status
        const pendingScrape = products.filter(p => p.detail_scrape_status === 'pending').length;
        const failedScrape = products.filter(p => p.detail_scrape_status === 'failed').length;
        const notEnriched = products.filter(p => !p.last_enriched_at).length;
        const noPrices = products.filter(p => !p.price).length;

        // 5. Cron log - most recent
        const { data: recentLogs } = await supabase.from('scrape_logs')
            .select('*').order('started_at', { ascending: false }).limit(5);

        res.json({
            overview: {
                total_products: products.length,
                average_completeness: avgScore + '%',
                complete: complete.length,
                partial: partial.length,
                incomplete: incomplete.length
            },
            freshness: {
                updated_today: freshToday,
                updated_this_week: freshWeek,
                stale_30d: stale,
                no_price: noPrices
            },
            scraper: {
                pending: pendingScrape,
                failed: failedScrape,
                not_enriched: notEnriched,
                failed_products: products.filter(p => p.detail_scrape_status === 'failed').map(p => ({
                    id: p.id, name: p.display_name || p.product_name
                })).slice(0, 10)
            },
            needs_attention: incomplete.slice(0, 15),
            recent_cron_logs: recentLogs || [],
            site_config: SITE_CONFIG
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Completeness score for a single product
app.get('/api/products/:id/completeness', async (req, res) => {
    try {
        const { data, error } = await supabase.from('products')
            .select('*').eq('id', req.params.id).single();
        if (error) throw error;

        const score = computeCompletenessScore(data);
        const weights = SITE_CONFIG.scoring_rules.completeness_weights;
        const breakdown = {};
        for (const [field, weight] of Object.entries(weights)) {
            const val = data[field];
            const filled = val !== null && val !== undefined && val !== '' && val !== 'Unknown' 
                && !(typeof val === 'object' && Object.keys(val).length === 0)
                && !(Array.isArray(val) && val.length === 0);
            breakdown[field] = { weight, filled, value: filled ? (typeof val === 'object' ? 'set' : val) : null };
        }

        res.json({ score, breakdown, max: 100 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// COMMUNITY & RETENTION APIs
// ============================================

// --- Email Subscribers ---
app.post('/api/subscribe', async (req, res) => {
    try {
        const { email, name, interests, source } = req.body;
        if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });

        const { data, error } = await supabase.from('email_subscribers')
            .upsert({ email: email.toLowerCase().trim(), name, interests: interests || ['deals', 'new-products'], source: source || 'website', is_active: true, updated_at: new Date().toISOString() }, { onConflict: 'email' })
            .select().single();
        if (error) throw error;
        res.json({ success: true, subscriber: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/unsubscribe', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });
        await supabase.from('email_subscribers').update({ is_active: false }).eq('email', email.toLowerCase().trim());
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Price Alerts ---
app.post('/api/price-alerts', async (req, res) => {
    try {
        const { email, product_id, target_price } = req.body;
        if (!email || !product_id) return res.status(400).json({ error: 'Email and product_id required' });

        // Get current price
        const { data: product } = await supabase.from('products').select('price').eq('id', product_id).single();

        const { data, error } = await supabase.from('price_alerts').insert({
            email: email.toLowerCase().trim(),
            product_id,
            target_price: target_price || (product?.price ? product.price * 0.9 : null),
            current_price: product?.price
        }).select().single();
        if (error) throw error;

        // Auto-subscribe email
        await supabase.from('email_subscribers')
            .upsert({ email: email.toLowerCase().trim(), interests: ['price-alerts'], source: 'price-alert', is_active: true }, { onConflict: 'email' });

        res.json({ success: true, alert: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/price-alerts', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: 'Email required' });

        const { data, error } = await supabase.from('price_alerts')
            .select('*, product:products(id, product_name, display_name, price, image_url, amazon_url)')
            .eq('email', email.toLowerCase().trim())
            .eq('is_triggered', false)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ alerts: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/price-alerts/:id', async (req, res) => {
    try {
        await supabase.from('price_alerts').delete().eq('id', req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Shared Setups ---
function generateSlug() {
    return Math.random().toString(36).substring(2, 8) + Date.now().toString(36).slice(-4);
}

app.post('/api/shared-setups', async (req, res) => {
    try {
        const { title, description, use_case, creator_name, creator_email, items } = req.body;
        if (!title || !items || items.length === 0) return res.status(400).json({ error: 'Title and items required' });

        // Calculate total cost
        let totalCost = 0;
        for (const item of items) {
            if (item.custom_price) totalCost += Number(item.custom_price);
            else if (item.product_id) {
                const { data: p } = await supabase.from('products').select('price').eq('id', item.product_id).single();
                if (p?.price) totalCost += Number(p.price);
            }
        }

        const { data, error } = await supabase.from('shared_setups').insert({
            slug: generateSlug(),
            title, description, use_case,
            creator_name: creator_name || 'Anonymous',
            creator_email,
            items,
            total_cost: totalCost
        }).select().single();
        if (error) throw error;
        res.json({ success: true, setup: data, share_url: `/setup/${data.slug}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shared-setups', async (req, res) => {
    try {
        const { use_case, sort } = req.query;
        let query = supabase.from('shared_setups')
            .select('*')
            .eq('is_published', true);
        if (use_case) query = query.eq('use_case', use_case);
        query = query.order(sort === 'popular' ? 'upvotes' : 'created_at', { ascending: false }).limit(20);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ setups: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/shared-setups/:slug', async (req, res) => {
    try {
        const { data, error } = await supabase.from('shared_setups')
            .select('*')
            .eq('slug', req.params.slug)
            .eq('is_published', true)
            .single();
        if (error) throw error;

        // Increment views
        await supabase.from('shared_setups').update({ views: (data.views || 0) + 1 }).eq('id', data.id);

        // Resolve product details for items
        const resolvedItems = [];
        for (const item of (data.items || [])) {
            if (item.product_id) {
                const { data: p } = await supabase.from('products')
                    .select('id, product_name, display_name, brand, price, image_url, amazon_url, rating')
                    .eq('id', item.product_id).single();
                resolvedItems.push({ ...item, product: p });
            } else {
                resolvedItems.push(item);
            }
        }

        res.json({ ...data, items: resolvedItems });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/shared-setups/:slug/upvote', async (req, res) => {
    try {
        const { data } = await supabase.from('shared_setups').select('upvotes').eq('slug', req.params.slug).single();
        if (data) {
            await supabase.from('shared_setups').update({ upvotes: (data.upvotes || 0) + 1 }).eq('slug', req.params.slug);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Print Farm Planner ---
app.post('/api/farm-planner', async (req, res) => {
    try {
        const { title, printers, settings, creator_email } = req.body;
        if (!printers || printers.length === 0) return res.status(400).json({ error: 'At least one printer required' });

        const s = {
            electricity_cost: settings?.electricity_cost || 0.12,  // $/kWh
            filament_cost_per_kg: settings?.filament_cost_per_kg || 20,
            avg_print_weight_g: settings?.avg_print_weight_g || 50,
            avg_print_time_h: settings?.avg_print_time_h || 4,
            sell_price: settings?.sell_price || 15,
            failure_rate: settings?.failure_rate || 0.05,
            hours_per_day: settings?.hours_per_day || 12,
            power_watts: settings?.power_watts || 200
        };

        // Calculate for each printer
        let totalPrinterCost = 0;
        let totalMonthlyPrints = 0;

        for (const p of printers) {
            const qty = p.quantity || 1;
            const hpd = p.hours_per_day || s.hours_per_day;
            const printsPerDay = (hpd / s.avg_print_time_h) * qty;
            totalMonthlyPrints += printsPerDay * 30;
            if (p.price) totalPrinterCost += p.price * qty;
        }

        const successfulPrints = totalMonthlyPrints * (1 - s.failure_rate);
        const monthlyRevenue = successfulPrints * s.sell_price;
        const monthlyFilamentCost = (totalMonthlyPrints * s.avg_print_weight_g / 1000) * s.filament_cost_per_kg;
        const monthlyElectricity = (totalMonthlyPrints * s.avg_print_time_h * s.power_watts / 1000) * s.electricity_cost;
        const monthlyProfit = monthlyRevenue - monthlyFilamentCost - monthlyElectricity;
        const roiMonths = monthlyProfit > 0 ? Math.ceil(totalPrinterCost / monthlyProfit) : null;

        const results = {
            total_printer_cost: Math.round(totalPrinterCost),
            monthly_prints: Math.round(totalMonthlyPrints),
            successful_prints: Math.round(successfulPrints),
            monthly_revenue: Math.round(monthlyRevenue),
            monthly_filament_cost: Math.round(monthlyFilamentCost),
            monthly_electricity: Math.round(monthlyElectricity),
            monthly_profit: Math.round(monthlyProfit),
            roi_months: roiMonths,
            break_even_prints: monthlyProfit > 0 ? Math.ceil(totalPrinterCost / (s.sell_price - (s.avg_print_weight_g / 1000 * s.filament_cost_per_kg))) : null
        };

        const { data, error } = await supabase.from('farm_plans').insert({
            slug: generateSlug(),
            title: title || 'My Print Farm',
            printers, settings: s, results,
            creator_email
        }).select().single();
        if (error) throw error;

        res.json({ success: true, plan: data, share_url: `/farm/${data.slug}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/farm-planner/:slug', async (req, res) => {
    try {
        const { data, error } = await supabase.from('farm_plans')
            .select('*').eq('slug', req.params.slug).single();
        if (error) throw error;
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// ============================================
// OWNER NOTES / USER-SUBMITTED SETTINGS
// ============================================

// Submit a note (email-based, goes to moderation)
app.post('/api/products/:id/notes', async (req, res) => {
    try {
        const { author_email, author_name, note_type, title, content, metadata } = req.body;
        if (!author_email || !content) return res.status(400).json({ error: 'Email and content required' });

        const { data, error } = await supabase.from('product_notes').insert({
            product_id: req.params.id,
            author_email: author_email.toLowerCase().trim(),
            author_name: author_name || 'Anonymous',
            note_type: note_type || 'tip',
            title,
            content,
            metadata: metadata || {},
            is_approved: false // moderation required
        }).select().single();
        if (error) throw error;

        res.json({ success: true, note: data, message: 'Your note has been submitted for review. It will appear after moderation.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get approved notes for a product
app.get('/api/products/:id/notes', async (req, res) => {
    try {
        const { note_type } = req.query;
        let query = supabase.from('product_notes')
            .select('id, author_name, note_type, title, content, metadata, upvotes, created_at')
            .eq('product_id', req.params.id)
            .eq('is_approved', true)
            .order('upvotes', { ascending: false });
        if (note_type) query = query.eq('note_type', note_type);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ notes: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upvote a note
app.post('/api/notes/:id/upvote', async (req, res) => {
    try {
        const { data } = await supabase.from('product_notes').select('upvotes').eq('id', req.params.id).single();
        if (data) {
            await supabase.from('product_notes').update({ upvotes: (data.upvotes || 0) + 1 }).eq('id', req.params.id);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: list pending notes for moderation
app.get('/api/admin/notes/pending', async (req, res) => {
    try {
        const { data, error } = await supabase.from('product_notes')
            .select('*, product:products(id, display_name, product_name)')
            .eq('is_approved', false)
            .order('created_at', { ascending: false });
        if (error) throw error;
        res.json({ notes: data || [] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Admin: approve/reject a note
app.patch('/api/admin/notes/:id', async (req, res) => {
    try {
        const { is_approved } = req.body;
        if (is_approved) {
            await supabase.from('product_notes').update({ is_approved: true, updated_at: new Date().toISOString() }).eq('id', req.params.id);
        } else {
            await supabase.from('product_notes').delete().eq('id', req.params.id);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// THIN PAGE AUDIT (Automated)
// ============================================
app.get('/api/admin/thin-page-audit', async (req, res) => {
    try {
        const { data: products, error } = await supabase.from('products')
            .select('id, product_name, display_name, brand, price, rating, review_count, category, printer_type, specs_json, beginner_score, labels, tags, image_url');
        if (error) throw error;

        const thinPages = [];
        const lowDiffPages = {};

        products.forEach(p => {
            const score = computeCompletenessScore(p);
            const name = p.display_name || p.product_name || '';

            // Thin: low completeness = thin content
            if (score < 40) {
                thinPages.push({ id: p.id, name, score, issue: 'Very incomplete data — thin content' });
            } else if (score < 60 && !p.specs_json) {
                thinPages.push({ id: p.id, name, score, issue: 'Missing specs — limited differentiation' });
            }

            // Low differentiation: group by brand+category and flag if >3 similar products
            const key = `${(p.brand || 'unknown').toLowerCase()}_${p.category || 'unknown'}`;
            if (!lowDiffPages[key]) lowDiffPages[key] = [];
            lowDiffPages[key].push({ id: p.id, name, score });
        });

        // Find clusters with low differentiation
        const duplicateClusters = Object.entries(lowDiffPages)
            .filter(([, items]) => items.length > 3)
            .map(([key, items]) => ({
                group: key,
                count: items.length,
                products: items.slice(0, 5),
                risk: 'Multiple similar products may create thin/duplicate content'
            }));

        res.json({
            summary: {
                total_products: products.length,
                thin_pages: thinPages.length,
                duplicate_clusters: duplicateClusters.length
            },
            thin_pages: thinPages.slice(0, 30),
            duplicate_clusters: duplicateClusters,
            recommendations: [
                thinPages.length > 10 ? 'Consider enriching or hiding products with completeness < 40%' : null,
                duplicateClusters.length > 0 ? 'Consider consolidating or differentiating products in large brand clusters' : null,
                'Run this audit monthly to catch new thin pages'
            ].filter(Boolean)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
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
