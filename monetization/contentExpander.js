/**
 * Content Auto-Expander — Monetization-Driven Blog Content Engine
 * 
 * Uses monetization data (clicks, EPC, routes, trending products)
 * to automatically identify high-value content gaps and generate
 * revenue-optimized blog topics.
 * 
 * Feeds into the existing blog cron system (api/cron/blog.js).
 */

const config = require('../revenue/config');

const SITE_URL = 'https://3d-printer-prices.com';

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT STRATEGY TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

const STRATEGY_TEMPLATES = [
    // ── High-click product deep dives ──
    {
        id: 'product_deep_dive',
        trigger: 'high_clicks',
        titleTemplate: (p) => `${p.display_name || p.product_name} Review ${new Date().getFullYear()} — Is It Worth It?`,
        descTemplate: (p) => `In-depth review of the ${p.display_name || p.product_name}. Price tracking, real user reviews, pros & cons, and our verdict.`,
        articleType: 'review',
        priority: 10,
    },
    // ── Price drop alerts ──
    {
        id: 'price_drop_alert',
        trigger: 'price_drop',
        titleTemplate: (p) => `${p.display_name || p.product_name} Price Drop — Now $${p.price} (${p.discount_percent}% Off)`,
        descTemplate: (p) => `The ${p.display_name || p.product_name} just dropped to $${p.price}. Is this the lowest price? See our price history.`,
        articleType: 'deal-alert',
        priority: 9,
    },
    // ── Brand roundups for trending brands ──
    {
        id: 'brand_roundup',
        trigger: 'trending_brand',
        titleTemplate: (b) => `Best ${b.brand} 3D Printers ${new Date().getFullYear()} — Complete Brand Guide`,
        descTemplate: (b) => `Everything you need to know about ${b.brand} 3D printers. Compare all models by price, features, and user ratings.`,
        articleType: 'buying-guide',
        priority: 8,
    },
    // ── Price range guides based on click clusters ──
    {
        id: 'price_range_guide',
        trigger: 'price_cluster',
        titleTemplate: (r) => `Best 3D Printers ${r.label} in ${new Date().getFullYear()}`,
        descTemplate: (r) => `Top picks in the ${r.label} range, ranked by value, features, and user ratings.`,
        articleType: 'buying-guide',
        priority: 7,
    },
    // ── Comparison posts for competing products ──
    {
        id: 'head_to_head',
        trigger: 'compared_pair',
        titleTemplate: (pair) => `${pair.a} vs ${pair.b} — Which Is Better?`,
        descTemplate: (pair) => `Direct comparison: ${pair.a} vs ${pair.b}. Price, features, print quality, and value compared side by side.`,
        articleType: 'comparison',
        priority: 9,
    },
    // ── Seasonal/trending content ──
    {
        id: 'trending_picks',
        trigger: 'trending',
        titleTemplate: () => `Trending 3D Printers Right Now — What People Are Buying ${new Date().toLocaleString('en-US', { month: 'long' })} ${new Date().getFullYear()}`,
        descTemplate: () => `The most-clicked 3D printers this week based on real user interest. See what's trending right now.`,
        articleType: 'review',
        priority: 6,
    },
];

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT GAP ANALYZER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze monetization data to find content gaps
 * @param {Object} data
 *   - products: array of product objects with click/conversion data
 *   - clickEvents: recent click events
 *   - existingSlugs: set of existing blog post slugs
 *   - routeFeedback: route performance data
 * @returns {Array} sorted content opportunities
 */
function analyzeContentGaps(data) {
    const { products = [], clickEvents = [], existingSlugs = new Set(), routeFeedback = [] } = data;
    const opportunities = [];
    const year = new Date().getFullYear();

    // ── 1. High-click products without dedicated articles ──
    const clickCounts = {};
    clickEvents.forEach(e => {
        if (e.product_id) clickCounts[e.product_id] = (clickCounts[e.product_id] || 0) + 1;
    });

    products.forEach(p => {
        const clicks = clickCounts[p.id] || p.clicks || 0;
        const slug = slugify(p.display_name || p.product_name);
        if (clicks >= 5 && !existingSlugs.has(slug + '-review')) {
            opportunities.push({
                strategy: 'product_deep_dive',
                title: STRATEGY_TEMPLATES[0].titleTemplate(p),
                description: STRATEGY_TEMPLATES[0].descTemplate(p),
                slug: slug + '-review',
                article_type: 'review',
                priority: Math.min(10, 5 + Math.floor(clicks / 5)),
                product: p,
                reason: `${clicks} clicks — high user interest, no dedicated article`,
                estimated_value: clicks * 0.15, // rough EPC estimate
            });
        }
    });

    // ── 2. Price drop opportunities ──
    products.forEach(p => {
        if (p.discount_percent && p.discount_percent >= 10) {
            const slug = slugify(`${p.display_name || p.product_name}-price-drop`);
            if (!existingSlugs.has(slug)) {
                opportunities.push({
                    strategy: 'price_drop_alert',
                    title: STRATEGY_TEMPLATES[1].titleTemplate(p),
                    description: STRATEGY_TEMPLATES[1].descTemplate(p),
                    slug,
                    article_type: 'deal-alert',
                    priority: 9,
                    product: p,
                    reason: `${p.discount_percent}% off — deal content drives urgency clicks`,
                    estimated_value: (p.clicks || 0) * 0.25,
                });
            }
        }
    });

    // ── 3. Trending brand roundups ──
    const brandClicks = {};
    products.forEach(p => {
        if (p.brand) {
            brandClicks[p.brand] = (brandClicks[p.brand] || 0) + (clickCounts[p.id] || p.clicks || 0);
        }
    });
    Object.entries(brandClicks)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .forEach(([brand, clicks]) => {
            const slug = slugify(`best-${brand}-3d-printers`);
            if (!existingSlugs.has(slug) && clicks >= 10) {
                opportunities.push({
                    strategy: 'brand_roundup',
                    title: STRATEGY_TEMPLATES[2].titleTemplate({ brand }),
                    description: STRATEGY_TEMPLATES[2].descTemplate({ brand }),
                    slug,
                    article_type: 'buying-guide',
                    priority: 8,
                    reason: `${brand} has ${clicks} total clicks — strong brand interest`,
                    estimated_value: clicks * 0.10,
                });
            }
        });

    // ── 4. Price cluster guides ──
    const priceRanges = [
        { label: 'Under $100', min: 0, max: 100 },
        { label: 'Under $200', min: 0, max: 200 },
        { label: 'Under $300', min: 200, max: 300 },
        { label: '$300-$500', min: 300, max: 500 },
        { label: '$500-$1000', min: 500, max: 1000 },
        { label: 'Over $1000', min: 1000, max: 99999 },
    ];
    priceRanges.forEach(range => {
        const matchingProducts = products.filter(p => p.price >= range.min && p.price < range.max);
        const totalClicks = matchingProducts.reduce((sum, p) => sum + (clickCounts[p.id] || p.clicks || 0), 0);
        const slug = slugify(`best-3d-printers-${range.label.toLowerCase().replace(/\$/g, '').replace(/\s+/g, '-')}`);
        if (matchingProducts.length >= 3 && totalClicks >= 10 && !existingSlugs.has(slug)) {
            opportunities.push({
                strategy: 'price_range_guide',
                title: STRATEGY_TEMPLATES[3].titleTemplate(range),
                description: STRATEGY_TEMPLATES[3].descTemplate(range),
                slug,
                article_type: 'buying-guide',
                priority: 7,
                reason: `${matchingProducts.length} products, ${totalClicks} clicks in ${range.label} range`,
                estimated_value: totalClicks * 0.08,
            });
        }
    });

    // ── 5. Head-to-head comparisons for frequently compared products ──
    const comparePairs = {};
    // Build pairs from click events close in time
    const sortedEvents = [...clickEvents].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    for (let i = 1; i < sortedEvents.length; i++) {
        const prev = sortedEvents[i - 1];
        const curr = sortedEvents[i];
        if (prev.session_id === curr.session_id && prev.product_id !== curr.product_id) {
            const key = [prev.product_id, curr.product_id].sort().join(':');
            comparePairs[key] = (comparePairs[key] || 0) + 1;
        }
    }
    Object.entries(comparePairs)
        .filter(([, count]) => count >= 3)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .forEach(([key, count]) => {
            const [idA, idB] = key.split(':');
            const pA = products.find(p => String(p.id) === idA);
            const pB = products.find(p => String(p.id) === idB);
            if (pA && pB) {
                const nameA = pA.display_name || pA.product_name;
                const nameB = pB.display_name || pB.product_name;
                const slug = slugify(`${nameA}-vs-${nameB}`);
                if (!existingSlugs.has(slug)) {
                    opportunities.push({
                        strategy: 'head_to_head',
                        title: STRATEGY_TEMPLATES[4].titleTemplate({ a: nameA, b: nameB }),
                        description: STRATEGY_TEMPLATES[4].descTemplate({ a: nameA, b: nameB }),
                        slug,
                        article_type: 'comparison',
                        priority: 9,
                        reason: `${count} sessions compared these — strong purchase intent`,
                        estimated_value: count * 0.30,
                    });
                }
            }
        });

    // ── 6. Trending products roundup ──
    const trendingSlug = slugify(`trending-3d-printers-${new Date().toLocaleString('en-US', { month: 'long' }).toLowerCase()}-${year}`);
    if (!existingSlugs.has(trendingSlug)) {
        const topClicked = Object.entries(clickCounts).sort(([, a], [, b]) => b - a).slice(0, 10);
        if (topClicked.length >= 3) {
            opportunities.push({
                strategy: 'trending_picks',
                title: STRATEGY_TEMPLATES[5].titleTemplate(),
                description: STRATEGY_TEMPLATES[5].descTemplate(),
                slug: trendingSlug,
                article_type: 'review',
                priority: 6,
                reason: `${topClicked.length} trending products this month`,
                estimated_value: topClicked.reduce((s, [, c]) => s + c, 0) * 0.05,
            });
        }
    }

    // Sort by priority × estimated_value
    return opportunities.sort((a, b) => {
        const scoreA = a.priority * (1 + a.estimated_value);
        const scoreB = b.priority * (1 + b.estimated_value);
        return scoreB - scoreA;
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AI CONTENT GENERATION PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build an AI prompt for generating article content, enriched with monetization data
 */
function buildContentPrompt(opportunity, products, monetizationContext = {}) {
    const { title, description, article_type, strategy, reason } = opportunity;
    const year = new Date().getFullYear();

    // Filter relevant products
    let relevantProducts = products;
    if (opportunity.product) {
        // For single product articles, include the target + top similar
        const target = opportunity.product;
        relevantProducts = [target, ...products.filter(p => 
            p.id !== target.id && 
            (p.brand === target.brand || Math.abs((p.price || 0) - (target.price || 0)) < 100)
        ).slice(0, 7)];
    }

    const productList = relevantProducts.slice(0, 12).map(p =>
        `- ${p.display_name || p.product_name} | $${p.price || 'N/A'} | ${p.brand || 'Unknown'} | Rating: ${p.rating || 'N/A'}/5 (${p.review_count || 0} reviews) | ${p.amazon_url || ''}`
    ).join('\n');

    const siteLinks = `
Site links to include:
- Homepage: ${SITE_URL}
- Compare: ${SITE_URL}/compare.html
- Product pages: ${SITE_URL}/product.html?id={product_id}
- Blog: ${SITE_URL}/blog/
`;

    return `You are an expert 3D printing content writer for **3D Printer Prices** (${SITE_URL}).

## Task
Write a comprehensive, SEO-optimized blog article.

**Title:** ${title}
**Article Type:** ${article_type}
**Target Length:** 1500-2500 words
**Content Strategy:** ${strategy} — ${reason}

## Product Data (use these real prices)
${productList}

${siteLinks}

## Monetization Context
${monetizationContext.topPerformer ? `- Top performer: ${monetizationContext.topPerformer} (emphasize this product)` : ''}
${monetizationContext.highEpcRoute ? `- Best revenue route: ${monetizationContext.highEpcRoute}` : ''}
${monetizationContext.trendingKeywords ? `- Trending keywords: ${monetizationContext.trendingKeywords.join(', ')}` : ''}

## Guidelines
1. **Tone:** Friendly, knowledgeable maker community expert
2. **SEO:** Include primary keyword in H1, first paragraph, and 2-3 H2 headings
3. **Structure:** 
   - Hook intro (2-3 sentences)
   - Quick comparison table with prices
   - Detailed sections with H2/H3
   - Pros/cons for each product
   - FAQ section (3-5 questions)
   - Final verdict with strong CTA
4. **Affiliate integration:**
   - Include product links naturally
   - Add "Check Price →" CTAs after each product section
   - Include comparison table links
5. **Internal linking:**
   - Link to compare page
   - Link to related blog posts
   - Link to product detail pages
6. **Format:** Clean Markdown with proper heading hierarchy
7. **IMPORTANT:** Use ONLY real product names and prices from the data above

Write the complete article now:`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT QUEUE
// ═══════════════════════════════════════════════════════════════════════════════

const _contentQueue = [];
const _generationHistory = [];
const MAX_HISTORY = 100;

/**
 * Queue content opportunities for generation
 */
function queueContent(opportunities, maxQueue = 10) {
    const toQueue = opportunities.slice(0, maxQueue);
    toQueue.forEach(opp => {
        if (!_contentQueue.find(q => q.slug === opp.slug)) {
            _contentQueue.push({
                ...opp,
                queued_at: new Date().toISOString(),
                status: 'pending',
            });
        }
    });
    return _contentQueue.length;
}

/**
 * Get next content item to generate
 */
function getNextContent() {
    return _contentQueue.find(q => q.status === 'pending') || null;
}

/**
 * Mark content as generated
 */
function markGenerated(slug, result) {
    const item = _contentQueue.find(q => q.slug === slug);
    if (item) {
        item.status = 'generated';
        item.generated_at = new Date().toISOString();
        item.result = result;
        _generationHistory.unshift({ ...item });
        if (_generationHistory.length > MAX_HISTORY) _generationHistory.length = MAX_HISTORY;
    }
}

/**
 * Get content expansion status
 */
function getStatus() {
    return {
        queue_size: _contentQueue.filter(q => q.status === 'pending').length,
        generated: _contentQueue.filter(q => q.status === 'generated').length,
        total_queued: _contentQueue.length,
        history: _generationHistory.length,
        strategies: STRATEGY_TEMPLATES.map(s => ({ id: s.id, trigger: s.trigger, priority: s.priority })),
    };
}

function getQueue() {
    return _contentQueue.map(q => ({
        slug: q.slug,
        title: q.title,
        strategy: q.strategy,
        priority: q.priority,
        reason: q.reason,
        estimated_value: q.estimated_value,
        status: q.status,
        queued_at: q.queued_at,
    }));
}

function getHistory() {
    return _generationHistory.slice(0, 50);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function slugify(text) {
    return (text || '').toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
}

module.exports = {
    analyzeContentGaps,
    buildContentPrompt,
    queueContent,
    getNextContent,
    markGenerated,
    getStatus,
    getQueue,
    getHistory,
    STRATEGY_TEMPLATES,
};
