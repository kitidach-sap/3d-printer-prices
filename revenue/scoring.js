/**
 * Revenue Scoring — Performance Scoring Engine
 * 
 * Phase B of the Auto Money System.
 * Scores products, variants, articles, and campaigns by performance.
 * 
 * Scoring is relative: scores compare against the population average.
 * Score range: 0–100 (50 = average)
 */

const config = require('./config');
const analytics = require('./analytics');

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute percentile score (0–100) for a value within a distribution
 * 50 = median, 100 = top performer
 */
function percentileScore(value, allValues) {
    if (allValues.length === 0) return 50;
    const sorted = [...allValues].sort((a, b) => a - b);
    const idx = sorted.findIndex(v => v >= value);
    if (idx === -1) return 100;
    return Math.round((idx / sorted.length) * 100);
}

/**
 * Normalize a score to 0–100 range with min/max
 */
function normalize(value, min, max) {
    if (max === min) return 50;
    return Math.round(Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT SCORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score a product's performance based on click data
 * Returns: { score, clicks, compare_count, blog_clicks, verdict }
 */
async function scoreProductPerformance(supabase, productName, days = config.WINNER_DETECTION_DAYS) {
    const topProducts = await analytics.getTopProducts(supabase, days, 100);
    const compareUsage = await analytics.getCompareUsage(supabase, days, 100);

    const product = topProducts.find(p => p.product_name === productName);
    const compare = compareUsage.find(c => c.name === productName);

    const clicks = product ? product.clicks : 0;
    const compareCount = compare ? compare.count : 0;

    // Score relative to all products
    const allClicks = topProducts.map(p => p.clicks);
    const clickScore = percentileScore(clicks, allClicks);

    // Weighted composite score
    const score = Math.round(
        clickScore * config.WEIGHT_CLICKS +
        (compareCount >= config.MIN_COMPARE_ACTIONS ? 10 : 0) * config.WEIGHT_COMPARES
    );

    const normalizedScore = Math.min(100, score);

    return {
        product_name: productName,
        score: normalizedScore,
        clicks,
        compare_count: compareCount,
        sources: product ? product.sources : {},
        verdict: normalizedScore >= 70 ? 'winner' : normalizedScore <= 30 ? 'loser' : 'average',
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT SCORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score a CTA variant (urgency text, badge, position) by click performance
 * Returns: { variant, score, clicks, verdict }
 */
async function scoreVariantPerformance(supabase, days = config.WINNER_DETECTION_DAYS) {
    const ctrData = await analytics.getCTRByVariant(supabase, days);

    const scoreList = (items, type) => {
        if (!items?.length) return [];
        const allCounts = items.map(i => i.count);
        return items.map(item => ({
            type,
            name: item.name,
            clicks: item.count,
            score: percentileScore(item.count, allCounts),
            verdict: item.count >= config.MIN_CLICKS_FOR_WINNER
                ? (percentileScore(item.count, allCounts) >= 70 ? 'winner' : percentileScore(item.count, allCounts) <= 30 ? 'loser' : 'average')
                : 'insufficient_data',
        }));
    };

    return {
        urgency: scoreList(ctrData.by_urgency, 'urgency'),
        position: scoreList(ctrData.by_position, 'position'),
        badge: scoreList(ctrData.by_badge, 'badge'),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE SCORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score a blog article's conversion performance
 * Returns: { slug, score, views, clicks, ctr, verdict }
 */
async function scoreArticlePerformance(supabase, days = config.WINNER_DETECTION_DAYS) {
    const articles = await analytics.getTopArticles(supabase, days, 50);

    if (!articles.length) return [];

    // Only score articles with enough data
    const qualified = articles.filter(a => a.views >= config.MIN_VIEWS_FOR_ARTICLE_SCORE);
    const allCTRs = qualified.map(a => a.ctr);
    const allClicks = qualified.map(a => a.clicks);

    return qualified.map(a => {
        const ctrScore = percentileScore(a.ctr, allCTRs);
        const clickScore = percentileScore(a.clicks, allClicks);
        // 60% CTR weight + 40% volume weight
        const compositeScore = Math.round(ctrScore * 0.6 + clickScore * 0.4);

        return {
            slug: a.slug,
            score: compositeScore,
            views: a.views,
            clicks: a.clicks,
            ctr: a.ctr,
            top_positions: a.top_positions,
            top_products: a.top_products,
            verdict: compositeScore >= 70 ? 'winner' : compositeScore <= 30 ? 'loser' : 'average',
        };
    }).sort((a, b) => b.score - a.score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN SCORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score campaign product performance vs organic products
 * Returns: { campaign_name, product_id, score, clicks, outperforms_organic }
 */
async function scoreCampaignPerformance(supabase) {
    const campaignPerf = await analytics.getCampaignPerformance(supabase);
    const topProducts = await analytics.getTopProducts(supabase, config.EXTENDED_ANALYTICS_DAYS, 100);

    if (!campaignPerf.length) return [];

    // Average clicks for organic products
    const organicClicks = topProducts.map(p => p.clicks);
    const avgOrganic = organicClicks.length > 0
        ? organicClicks.reduce((s, c) => s + c, 0) / organicClicks.length
        : 0;

    return campaignPerf.map(c => {
        const clicks = c.clicks?.total || 0;
        const outperforms = clicks > avgOrganic * 1.2;

        return {
            campaign_name: c.campaign_name,
            campaign_id: c.id,
            product_id: c.product_id,
            status: c.status,
            clicks,
            avg_organic_clicks: Math.round(avgOrganic),
            outperforms_organic: outperforms,
            score: avgOrganic > 0 ? Math.round((clicks / avgOrganic) * 50) : 50,
            verdict: outperforms ? 'winner' : clicks >= avgOrganic * 0.8 ? 'average' : 'underperforming',
        };
    }).sort((a, b) => b.score - a.score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// X POST SCORING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score X post variant types by engagement
 */
async function scoreXPostVariants(supabase) {
    const xPerf = await analytics.getXPostPerformance(supabase);

    const scoreVariantList = (items) => {
        if (!items?.length) return [];
        const allEngagements = items.map(i => i.avg_engagement);
        return items.map(item => ({
            name: item.name,
            posts: item.count,
            avg_engagement: item.avg_engagement,
            total_clicks: item.total_clicks,
            score: percentileScore(item.avg_engagement, allEngagements),
            verdict: item.count >= 3
                ? (percentileScore(item.avg_engagement, allEngagements) >= 70 ? 'winner' : 'average')
                : 'insufficient_data',
        }));
    };

    return {
        hooks: scoreVariantList(xPerf.by_hook),
        angles: scoreVariantList(xPerf.by_angle),
        ctas: scoreVariantList(xPerf.by_cta),
    };
}

module.exports = {
    scoreProductPerformance,
    scoreVariantPerformance,
    scoreArticlePerformance,
    scoreCampaignPerformance,
    scoreXPostVariants,
    percentileScore,
    normalize,
};
