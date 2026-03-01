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
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
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
