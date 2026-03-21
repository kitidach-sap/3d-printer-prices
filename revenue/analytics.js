/**
 * Revenue Analytics — Unified Data Aggregation Layer
 * 
 * Phase A of the Auto Money System.
 * Aggregates all tracking data from click_events into reusable functions.
 * 
 * Data sources:
 *   - click_events (event_type: click, blog_click, blog_view, compare, etc.)
 *   - products (for enrichment)
 *   - x_posts (for variant performance)
 *   - blog_posts (for article metrics)
 */

const config = require('./config');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function sinceDate(days) {
    return new Date(Date.now() - days * 86400000).toISOString();
}

function countBy(arr, key) {
    const m = {};
    arr.forEach(r => { const v = r[key]; if (v) m[v] = (m[v] || 0) + 1; });
    return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));
}

function countByMulti(arr, keys) {
    const m = {};
    arr.forEach(r => {
        const k = keys.map(key => r[key] || 'unknown').join('||');
        m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m)
        .sort((a, b) => b[1] - a[1])
        .map(([composite, count]) => {
            const parts = composite.split('||');
            const obj = { count };
            keys.forEach((key, i) => { obj[key] = parts[i]; });
            return obj;
        });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP PRODUCTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get top clicked products across all surfaces
 * Returns: [{ product_name, product_id, clicks, sources: { twitter, search, ... } }]
 */
async function getTopProducts(supabase, days = config.DEFAULT_ANALYTICS_DAYS, limit = 30) {
    const { data: events } = await supabase.from('click_events')
        .select('product_name, product_id, source, event_type')
        .in('event_type', ['click', 'blog_click'])
        .gte('created_at', sinceDate(days))
        .not('product_name', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000);

    if (!events?.length) return [];

    const products = {};
    events.forEach(e => {
        const name = e.product_name;
        if (!products[name]) products[name] = { product_name: name, product_id: e.product_id, clicks: 0, sources: {} };
        products[name].clicks++;
        const src = e.source || 'direct';
        products[name].sources[src] = (products[name].sources[src] || 0) + 1;
    });

    return Object.values(products)
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP BADGES
// ═══════════════════════════════════════════════════════════════════════════════

async function getTopBadges(supabase, days = config.DEFAULT_ANALYTICS_DAYS, limit = 20) {
    const { data: events } = await supabase.from('click_events')
        .select('badge')
        .eq('event_type', 'click')
        .not('badge', 'is', null)
        .gte('created_at', sinceDate(days))
        .limit(3000);

    return countBy(events || [], 'badge').slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP SOURCES
// ═══════════════════════════════════════════════════════════════════════════════

async function getTopSources(supabase, days = config.DEFAULT_ANALYTICS_DAYS, limit = 15) {
    const { data: events } = await supabase.from('click_events')
        .select('source, event_type')
        .gte('created_at', sinceDate(days))
        .limit(5000);

    if (!events?.length) return { all: [], by_type: {} };

    const all = countBy(events, 'source').slice(0, limit);

    // Break down by event type (click vs blog)
    const byType = {};
    events.forEach(e => {
        const t = e.event_type || 'unknown';
        if (!byType[t]) byType[t] = {};
        const src = e.source || 'direct';
        byType[t][src] = (byType[t][src] || 0) + 1;
    });

    return { all, by_type: byType };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TOP ARTICLES (blog performance)
// ═══════════════════════════════════════════════════════════════════════════════

async function getTopArticles(supabase, days = config.DEFAULT_ANALYTICS_DAYS, limit = 20) {
    const { data: events } = await supabase.from('click_events')
        .select('event_type, article_slug, cta_position, cta_variant, product_name')
        .in('event_type', ['blog_click', 'blog_view'])
        .gte('created_at', sinceDate(days))
        .not('article_slug', 'is', null)
        .order('created_at', { ascending: false })
        .limit(5000);

    if (!events?.length) return [];

    const articles = {};
    events.forEach(e => {
        const slug = e.article_slug;
        if (!articles[slug]) articles[slug] = { slug, views: 0, clicks: 0, top_positions: {}, top_variants: {}, top_products: {} };
        if (e.event_type === 'blog_view') articles[slug].views++;
        if (e.event_type === 'blog_click') {
            articles[slug].clicks++;
            if (e.cta_position) articles[slug].top_positions[e.cta_position] = (articles[slug].top_positions[e.cta_position] || 0) + 1;
            if (e.cta_variant) articles[slug].top_variants[e.cta_variant] = (articles[slug].top_variants[e.cta_variant] || 0) + 1;
            if (e.product_name) articles[slug].top_products[e.product_name] = (articles[slug].top_products[e.product_name] || 0) + 1;
        }
    });

    return Object.values(articles)
        .map(a => ({
            ...a,
            ctr: a.views > 0 ? Math.round(a.clicks / a.views * 10000) / 100 : 0,
            top_positions: Object.entries(a.top_positions).sort((x, y) => y[1] - x[1]).slice(0, 5),
            top_variants: Object.entries(a.top_variants).sort((x, y) => y[1] - x[1]).slice(0, 5),
            top_products: Object.entries(a.top_products).sort((x, y) => y[1] - x[1]).slice(0, 5),
        }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CTR BY PRODUCT (clicks / page views)
// ═══════════════════════════════════════════════════════════════════════════════

async function getCTRByProduct(supabase, days = config.DEFAULT_ANALYTICS_DAYS, limit = 30) {
    const { data: events } = await supabase.from('click_events')
        .select('product_name, event_type')
        .in('event_type', ['click', 'blog_click', 'view', 'page_view'])
        .gte('created_at', sinceDate(days))
        .not('product_name', 'is', null)
        .limit(5000);

    if (!events?.length) return [];

    const products = {};
    events.forEach(e => {
        const name = e.product_name;
        if (!products[name]) products[name] = { product_name: name, clicks: 0, views: 0 };
        if (e.event_type === 'click' || e.event_type === 'blog_click') products[name].clicks++;
        else products[name].views++;
    });

    return Object.values(products)
        .map(p => ({ ...p, ctr: p.views > 0 ? Math.round(p.clicks / p.views * 10000) / 100 : 0 }))
        .filter(p => p.clicks >= config.MIN_CLICKS_FOR_WINNER)
        .sort((a, b) => b.ctr - a.ctr)
        .slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CTR BY VARIANT (urgency text, CTA text, badge)
// ═══════════════════════════════════════════════════════════════════════════════

async function getCTRByVariant(supabase, days = config.DEFAULT_ANALYTICS_DAYS) {
    const { data: events } = await supabase.from('click_events')
        .select('cta_variant, cta_position, badge, event_type')
        .in('event_type', ['blog_click', 'blog_view', 'click'])
        .gte('created_at', sinceDate(days))
        .limit(5000);

    if (!events?.length) return { by_urgency: [], by_position: [], by_badge: [] };

    const clicks = events.filter(e => e.event_type === 'blog_click' || e.event_type === 'click');

    return {
        by_urgency: countBy(clicks.filter(e => e.cta_variant), 'cta_variant').slice(0, 15),
        by_position: countBy(clicks.filter(e => e.cta_position), 'cta_position').slice(0, 10),
        by_badge: countBy(clicks.filter(e => e.badge), 'badge').slice(0, 15),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPARE USAGE — products people actively compare
// ═══════════════════════════════════════════════════════════════════════════════

async function getCompareUsage(supabase, days = config.DEFAULT_ANALYTICS_DAYS, limit = 20) {
    const { data: events } = await supabase.from('click_events')
        .select('product_name, product_id')
        .eq('event_type', 'compare')
        .gte('created_at', sinceDate(days))
        .limit(3000);

    return countBy(events || [], 'product_name').slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// X POST VARIANT PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════

async function getXPostPerformance(supabase, days = config.EXTENDED_ANALYTICS_DAYS) {
    const { data: posts } = await supabase.from('x_posts')
        .select('id, hook_type, angle_type, cta_type, product_asin, engagement_rate, clicks, impressions, status')
        .eq('status', 'posted')
        .gte('posted_at', sinceDate(days))
        .order('posted_at', { ascending: false })
        .limit(200);

    if (!posts?.length) return { total: 0, by_hook: [], by_angle: [], by_cta: [] };

    // Engagement rate by variant type
    const avgBy = (arr, key) => {
        const m = {};
        arr.forEach(r => {
            const v = r[key];
            if (!v) return;
            if (!m[v]) m[v] = { name: v, total_engagement: 0, count: 0, total_clicks: 0 };
            m[v].total_engagement += r.engagement_rate || 0;
            m[v].total_clicks += r.clicks || 0;
            m[v].count++;
        });
        return Object.values(m)
            .map(v => ({ ...v, avg_engagement: Math.round(v.total_engagement / v.count * 100) / 100 }))
            .sort((a, b) => b.avg_engagement - a.avg_engagement);
    };

    return {
        total: posts.length,
        by_hook: avgBy(posts, 'hook_type'),
        by_angle: avgBy(posts, 'angle_type'),
        by_cta: avgBy(posts, 'cta_type'),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN PERFORMANCE
// ═══════════════════════════════════════════════════════════════════════════════

async function getCampaignPerformance(supabase) {
    try {
        const { data: campaigns } = await supabase.from('creator_campaigns')
            .select('id, campaign_name, product_id, status, total_posts, total_budget, created_at')
            .in('status', ['active', 'completed'])
            .order('created_at', { ascending: false })
            .limit(20);

        if (!campaigns?.length) return [];

        // Get click data for campaign products
        const productIds = campaigns.map(c => c.product_id).filter(Boolean);
        const { data: clicks } = await supabase.from('click_events')
            .select('product_id, event_type, source')
            .in('product_id', productIds)
            .in('event_type', ['click', 'blog_click'])
            .gte('created_at', sinceDate(config.EXTENDED_ANALYTICS_DAYS))
            .limit(3000);

        const clicksByProduct = {};
        (clicks || []).forEach(c => {
            const pid = String(c.product_id);
            if (!clicksByProduct[pid]) clicksByProduct[pid] = { total: 0, by_source: {} };
            clicksByProduct[pid].total++;
            const src = c.source || 'direct';
            clicksByProduct[pid].by_source[src] = (clicksByProduct[pid].by_source[src] || 0) + 1;
        });

        return campaigns.map(c => ({
            ...c,
            clicks: clicksByProduct[String(c.product_id)] || { total: 0, by_source: {} },
        }));
    } catch (e) {
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FULL ANALYTICS OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════

async function getFullAnalytics(supabase, days = config.DEFAULT_ANALYTICS_DAYS) {
    const [topProducts, topBadges, topSources, topArticles, ctrByVariant, compareUsage, xPostPerf, campaignPerf] = await Promise.all([
        getTopProducts(supabase, days),
        getTopBadges(supabase, days),
        getTopSources(supabase, days),
        getTopArticles(supabase, days),
        getCTRByVariant(supabase, days),
        getCompareUsage(supabase, days),
        getXPostPerformance(supabase),
        getCampaignPerformance(supabase),
    ]);

    return {
        generated_at: new Date().toISOString(),
        period: `${days}d`,
        products: { top: topProducts.slice(0, 20), total_tracked: topProducts.length },
        badges: topBadges,
        sources: topSources,
        articles: topArticles,
        variants: ctrByVariant,
        compare: compareUsage,
        x_posts: xPostPerf,
        campaigns: campaignPerf,
    };
}

module.exports = {
    getTopProducts,
    getTopBadges,
    getTopSources,
    getTopArticles,
    getCTRByProduct,
    getCTRByVariant,
    getCompareUsage,
    getXPostPerformance,
    getCampaignPerformance,
    getFullAnalytics,
};
