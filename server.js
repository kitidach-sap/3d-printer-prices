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

                // Extract title — try multiple patterns within this block only
                let title = null;
                // Pattern 1: h2 > a > span (most common)
                const h2Match = block.match(/<h2[^>]*>[\s\S]*?<a[^>]*>[\s\S]*?<span[^>]*>([^<]{10,})<\/span>/i);
                if (h2Match?.[1]) title = h2Match[1].trim();
                // Pattern 2: span with a-text-normal class (within block)
                if (!title) {
                    const spanMatch = block.match(/<span[^>]*class="[^"]*a-text-normal[^"]*"[^>]*>([^<]{10,})<\/span>/i);
                    if (spanMatch?.[1]) title = spanMatch[1].trim();
                }
                // Pattern 3: aria-label on the link
                if (!title) {
                    const ariaMatch = block.match(/<a[^>]*aria-label="([^"]{10,})"[^>]*>/i);
                    if (ariaMatch?.[1]) title = ariaMatch[1].trim();
                }

                // Skip garbage titles
                if (!title || title.includes('Check each product') || title.includes('buying options') || title.length < 10) continue;

                // Extract price within this block
                const priceMatch = block.match(/<span class="a-price"[^>]*>[\s\S]*?<span[^>]*>\$([0-9,]+\.\d{2})<\/span>/i);
                if (!priceMatch?.[1]) continue;
                const price = parseFloat(priceMatch[1].replace(/,/g, ''));
                if (price <= 0) continue;

                // Extract rating if available
                const ratingMatch = block.match(/<span[^>]*aria-label="([0-9.]+) out of 5 stars"/i);
                const reviewMatch = block.match(/(\d[\d,]*)\s*(?:ratings?|reviews?)/i);

                products.push({
                    asin: asin,
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

// POST /api/admin/update-prices — re-check prices of existing products
let priceUpdateRunning = false;
app.post('/api/admin/update-prices', async (req, res) => {
    if (!verifyAdmin(req, res)) return;
    if (priceUpdateRunning) return res.status(409).json({ error: 'Price update is already running' });

    priceUpdateRunning = true;
    res.json({ message: 'Price update started' });

    try {
        // Fetch all products with real ASINs
        const { data: products } = await supabase
            .from('products')
            .select('id, amazon_asin, price')
            .not('amazon_asin', 'like', 'MANUAL%')
            .limit(500);

        if (!products?.length) { priceUpdateRunning = false; return; }

        let updated = 0, unavailable = 0, errors = 0;

        // Process in batches of 5
        for (let i = 0; i < products.length; i += 5) {
            const batch = products.slice(i, i + 5);
            const promises = batch.map(async (product) => {
                try {
                    const url = `https://www.amazon.com/dp/${product.amazon_asin}?tag=${AFFILIATE_TAG}`;
                    const resp = await fetch(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Accept': 'text/html',
                            'Accept-Language': 'en-US,en;q=0.9',
                        },
                        redirect: 'follow',
                    });

                    if (!resp.ok) {
                        // Product might be unavailable
                        await supabase.from('products').update({ is_available: false }).eq('id', product.id);
                        unavailable++;
                        return;
                    }

                    const html = await resp.text();

                    // Check if product is unavailable
                    if (html.includes('Currently unavailable') || html.includes('This item is no longer available')) {
                        await supabase.from('products').update({ is_available: false }).eq('id', product.id);
                        unavailable++;
                        return;
                    }

                    // Extract current price
                    const priceMatch = html.match(/"priceAmount":([\d.]+)/)
                        || html.match(/<span class="a-price"[^>]*>[\s\S]*?<span[^>]*>\$([\d,.]+)<\/span>/i);

                    if (priceMatch) {
                        const newPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
                        if (newPrice > 0 && newPrice !== product.price) {
                            await supabase.from('products').update({
                                price: newPrice,
                                is_available: true,
                            }).eq('id', product.id);
                            updated++;
                        }
                    }
                } catch (e) {
                    errors++;
                }
            });

            await Promise.all(promises);
            await new Promise(r => setTimeout(r, 2000)); // Rate limit
        }

        console.log(`Price update done: ${updated} updated, ${unavailable} unavailable, ${errors} errors`);
    } catch (err) {
        console.error('Price update error:', err.message);
    } finally {
        priceUpdateRunning = false;
    }
});

// GET /api/admin/update-prices-running
app.get('/api/admin/update-prices-running', (req, res) => {
    res.json({ running: priceUpdateRunning });
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
            .select('id, product_name, brand, price, category, product_type, amazon_asin, amazon_url, rating, review_count, is_available, created_at, updated_at', { count: 'exact' });

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
