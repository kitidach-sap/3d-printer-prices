/**
 * Revenue Scaling — Central Scaling Decision Engine
 * 
 * The BRAIN of the Full Auto Scaling System.
 * Consumes winners + analytics to produce scaling decisions with:
 *   - trend analysis (rising / falling / stable)
 *   - confidence levels (low / medium / high)
 *   - global composite scores
 *   - structured recommendations
 * 
 * Pipeline: analytics → scoring → winners → SCALING → boosters → consumers
 */

const config = require('./config');
const analytics = require('./analytics');
const winners = require('./winners');
const scoring = require('./scoring');

// In-memory cache
let _scalingCache = null;
let _scalingCacheTime = 0;
const _scalingLog = [];

function logScaling(type, details) {
    if (!config.SCALING_LOGGING_ENABLED) return;
    _scalingLog.push({ timestamp: new Date().toISOString(), type, ...details });
    while (_scalingLog.length > (config.MAX_SCALING_LOG_ENTRIES || 300)) _scalingLog.shift();
}

function getScalingLog() {
    return {
        total_entries: _scalingLog.length,
        entries: [..._scalingLog].reverse(),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TREND DETECTION — compare recent vs previous period
// ═══════════════════════════════════════════════════════════════════════════════

async function computeTrends(supabase) {
    const recentDays = config.TREND_RECENT_DAYS;
    const previousDays = config.TREND_PREVIOUS_DAYS;

    // Get product clicks for recent and previous periods
    const [recentProducts, previousProducts] = await Promise.all([
        analytics.getTopProducts(supabase, recentDays, 100),
        analytics.getTopProducts(supabase, recentDays + previousDays, 100),
    ]);

    // Approximate previous-period clicks = extended - recent
    const recentMap = {};
    recentProducts.forEach(p => { recentMap[p.product_name] = p.clicks; });

    const previousMap = {};
    previousProducts.forEach(p => {
        const recent = recentMap[p.product_name] || 0;
        previousMap[p.product_name] = Math.max(0, p.clicks - recent);
    });

    // Compute trend for each product
    const allNames = new Set([...Object.keys(recentMap), ...Object.keys(previousMap)]);
    const trends = {};

    allNames.forEach(name => {
        const recent = recentMap[name] || 0;
        const previous = previousMap[name] || 0;

        let trend = 'stable';
        let trendDelta = 0;

        if (previous >= config.MIN_TREND_SAMPLE && recent >= config.MIN_TREND_SAMPLE) {
            trendDelta = previous > 0 ? Math.round((recent / previous - 1) * 100) : 0;
            if (trendDelta > 20) trend = 'rising';
            else if (trendDelta < -20) trend = 'falling';
        } else if (recent >= config.MIN_TREND_SAMPLE && previous < config.MIN_TREND_SAMPLE) {
            trend = 'new';
            trendDelta = 100;
        }

        trends[name] = { recent, previous, trend, trendDelta };
    });

    return trends;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIDENCE LEVELS
// ═══════════════════════════════════════════════════════════════════════════════

function getConfidence(clicks) {
    if (clicks >= 20) return 'high';
    if (clicks >= config.MIN_CLICKS_FOR_SCALING) return 'medium';
    if (clicks >= config.MIN_CLICKS_FOR_WINNER) return 'low';
    return 'insufficient';
}

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL SCORE — composite of product + trend + source + campaign
// ═══════════════════════════════════════════════════════════════════════════════

function computeGlobalScore(baseScore, trend, sourceIntent) {
    const trendBonus = trend === 'rising' ? 15 : trend === 'falling' ? -10 : trend === 'new' ? 5 : 0;
    const sourceBonus = sourceIntent === 'high' ? 10 : sourceIntent === 'medium' ? 5 : 0;

    const global = Math.max(0, Math.min(100, Math.round(
        baseScore * (1 - config.WEIGHT_TREND - config.WEIGHT_SOURCE_INTENT) +
        (50 + trendBonus) * config.WEIGHT_TREND +
        (50 + sourceBonus) * config.WEIGHT_SOURCE_INTENT
    )));

    return global;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCALING CANDIDATES — central function
// ═══════════════════════════════════════════════════════════════════════════════

async function getScalingCandidates(supabase, forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _scalingCache && (now - _scalingCacheTime) < config.SCALING_RECALC_INTERVAL_MS) {
        return _scalingCache;
    }

    try {
        const [productWinners, variantWinners, articleWinners, campaignWinners, xWinners, trends, sourceData] = await Promise.all([
            winners.detectProductWinners(supabase).catch(() => ({ all: [] })),
            winners.detectVariantWinners(supabase).catch(() => ({ urgency: { all: [] }, position: { all: [] }, badge: { all: [] } })),
            winners.detectArticleWinners(supabase).catch(() => ({ all: [] })),
            winners.detectCampaignWinners(supabase).catch(() => ({ all: [] })),
            winners.detectXPostWinners(supabase).catch(() => ({ hooks: { all: [] }, angles: { all: [] }, ctas: { all: [] } })),
            computeTrends(supabase).catch(() => ({})),
            analytics.getTopSources(supabase).catch(() => ({ all: [] })),
        ]);

        // Source intent map
        const sourceIntentMap = buildSourceIntentMap(sourceData);

        // Build scaling candidates for each dimension
        const products = buildProductCandidates(productWinners.all || [], trends, sourceIntentMap);
        const articles = buildArticleCandidates(articleWinners.all || [], trends);
        const variants = buildVariantCandidates(variantWinners);
        const campaigns = buildCampaignCandidates(campaignWinners.all || [], trends);
        const xPosts = buildXPostCandidates(xWinners);
        const sources = buildSourceCandidates(sourceData);

        // Generate recommendations
        const recommendations = generateRecommendations(products, articles, variants, campaigns, xPosts, sources);

        _scalingCache = {
            generated_at: new Date().toISOString(),
            dry_run: config.SCALING_DRY_RUN,
            mode: config.FULL_AUTO_SCALING_ENABLED ? 'auto' : 'recommendation',
            products,
            articles,
            variants,
            campaigns,
            x_posts: xPosts,
            sources,
            recommendations,
            flags: {
                FULL_AUTO_SCALING_ENABLED: config.FULL_AUTO_SCALING_ENABLED,
                PRODUCT_SCALING_ENABLED: config.PRODUCT_SCALING_ENABLED,
                BLOG_SCALING_ENABLED: config.BLOG_SCALING_ENABLED,
                X_SCALING_ENABLED: config.X_SCALING_ENABLED,
                CAMPAIGN_SCALING_ENABLED: config.CAMPAIGN_SCALING_ENABLED,
                SOURCE_OPTIMIZATION_ENABLED: config.SOURCE_OPTIMIZATION_ENABLED,
                DECAY_ENGINE_ENABLED: config.DECAY_ENGINE_ENABLED,
                SCALING_DRY_RUN: config.SCALING_DRY_RUN,
            },
        };
        _scalingCacheTime = now;

        logScaling('computation', {
            products: products.length,
            articles: articles.length,
            recommendations: recommendations.length,
            mode: _scalingCache.mode,
        });

    } catch (e) {
        console.log('Scaling computation error:', e.message);
        _scalingCache = _scalingCache || getEmptyScaling();
    }

    return _scalingCache;
}

function getEmptyScaling() {
    return {
        generated_at: new Date().toISOString(),
        dry_run: true,
        mode: 'recommendation',
        products: [], articles: [], variants: { urgency: [], position: [], badge: [] },
        campaigns: [], x_posts: { hooks: [], angles: [], ctas: [] },
        sources: [], recommendations: [], flags: {},
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CANDIDATE BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildProductCandidates(products, trends, sourceIntentMap) {
    return products.map(p => {
        const trend = trends[p.product_name] || { trend: 'stable', trendDelta: 0, recent: 0, previous: 0 };
        const confidence = getConfidence(p.clicks);
        const topSource = Object.entries(p.sources || {}).sort((a, b) => b[1] - a[1])[0];
        const sourceIntent = topSource ? (sourceIntentMap[topSource[0]] || 'unknown') : 'unknown';
        const globalScore = computeGlobalScore(p.score, trend.trend, sourceIntent);

        let action = 'maintain';
        let weightDelta = 0;

        if (confidence !== 'insufficient') {
            if (globalScore >= 75 && trend.trend !== 'falling') {
                action = 'scale_up';
                weightDelta = Math.min(config.MAX_SCALING_WEIGHT - 1.0, (globalScore - 50) / 200);
            } else if (globalScore <= 25 || trend.trend === 'falling') {
                action = 'deprioritize';
                weightDelta = -Math.min(1.0 - config.DECAY_FLOOR, (50 - globalScore) / 200);
            } else if (trend.trend === 'rising') {
                action = 'scale_up';
                weightDelta = 0.05;
            }
        }

        return {
            entity: p.product_name,
            type: 'product',
            base_score: p.score,
            global_score: globalScore,
            clicks: p.clicks,
            trend: trend.trend,
            trend_delta: trend.trendDelta + '%',
            confidence,
            source_intent: sourceIntent,
            verdict: p.verdict,
            action,
            weight_delta: Math.round(weightDelta * 100) / 100,
            scaling_weight: Math.round((1.0 + weightDelta) * 100) / 100,
        };
    }).sort((a, b) => b.global_score - a.global_score);
}

function buildArticleCandidates(articles, trends) {
    return articles.map(a => {
        const confidence = getConfidence(a.clicks);
        const trend = trends[a.slug] || { trend: 'stable', trendDelta: 0 };

        // Detect article cluster (first segment of slug)
        const cluster = (a.slug || '').split('-').slice(0, 2).join('-');

        let action = 'maintain';
        if (confidence !== 'insufficient' && a.score >= 70) action = 'feature';
        if (confidence !== 'insufficient' && a.score <= 30) action = 'deprioritize';

        return {
            entity: a.slug,
            type: 'article',
            cluster,
            base_score: a.score,
            clicks: a.clicks,
            views: a.views,
            ctr: a.ctr,
            trend: trend.trend,
            confidence,
            verdict: a.verdict,
            action,
            top_positions: a.top_positions,
            top_products: a.top_products,
        };
    }).sort((a, b) => b.base_score - a.base_score);
}

function buildVariantCandidates(variantWinners) {
    const process = (items, type) => (items || []).map(v => ({
        entity: v.name,
        type,
        score: v.score,
        clicks: v.clicks,
        confidence: getConfidence(v.clicks),
        verdict: v.verdict,
        action: v.verdict === 'winner' ? 'scale_up' : v.verdict === 'loser' ? 'deprioritize' : 'maintain',
        weight: v.verdict === 'winner'
            ? Math.min(config.MAX_SCALING_WEIGHT, 1.0 + (v.score - 50) / 200)
            : v.verdict === 'loser' ? config.DECAY_FLOOR : 1.0,
    }));

    return {
        urgency: process(variantWinners.urgency?.all, 'urgency'),
        position: process(variantWinners.position?.all, 'position'),
        badge: process(variantWinners.badge?.all, 'badge'),
    };
}

function buildCampaignCandidates(campaigns, trends) {
    return campaigns.map(c => {
        const confidence = getConfidence(c.clicks);
        let action = 'maintain';

        if (c.verdict === 'winner' && confidence !== 'insufficient') {
            action = c.status === 'active' ? 'scale_up' : 'maintain';
        } else if (c.verdict === 'underperforming') {
            action = 'review';
        }

        return {
            entity: c.campaign_name,
            type: 'campaign',
            campaign_id: c.campaign_id,
            product_id: c.product_id,
            status: c.status,
            score: c.score,
            clicks: c.clicks,
            avg_organic: c.avg_organic_clicks,
            confidence,
            verdict: c.verdict,
            action,
        };
    });
}

function buildXPostCandidates(xWinners) {
    const process = (items, type) => (items || []).map(v => ({
        entity: v.name,
        type,
        score: v.score,
        posts: v.posts,
        avg_engagement: v.avg_engagement,
        confidence: v.posts >= 5 ? 'high' : v.posts >= 3 ? 'medium' : 'low',
        verdict: v.verdict,
        action: v.verdict === 'winner' ? 'scale_up' : 'maintain',
        weight: v.verdict === 'winner'
            ? Math.min(config.MAX_SCALING_WEIGHT, 1.0 + (v.score - 50) / 200)
            : 1.0,
    }));

    return {
        hooks: process(xWinners.hooks?.all, 'x_hook'),
        angles: process(xWinners.angles?.all, 'x_angle'),
        ctas: process(xWinners.ctas?.all, 'x_cta'),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE OPTIMIZATION
// ═══════════════════════════════════════════════════════════════════════════════

function buildSourceIntentMap(sourceData) {
    const intentMap = {};
    const all = sourceData?.all || [];
    if (all.length === 0) return intentMap;

    const maxCount = Math.max(...all.map(s => s.count), 1);
    all.forEach(s => {
        const ratio = s.count / maxCount;
        intentMap[s.name] = ratio >= 0.5 ? 'high' : ratio >= 0.2 ? 'medium' : 'low';
    });

    return intentMap;
}

function buildSourceCandidates(sourceData) {
    const all = sourceData?.all || [];
    const byType = sourceData?.by_type || {};

    return all.map(s => {
        // Calculate intent breakdown per source
        const clickCount = (byType.click || {})[s.name] || 0;
        const compareCount = (byType.compare || {})[s.name] || 0;
        const blogClickCount = (byType.blog_click || {})[s.name] || 0;

        const affiliateIntent = clickCount + blogClickCount;
        const compareIntent = compareCount;
        const totalEvents = s.count;

        return {
            source: s.name,
            total_events: totalEvents,
            affiliate_clicks: affiliateIntent,
            compare_actions: compareIntent,
            affiliate_ratio: totalEvents > 0 ? Math.round(affiliateIntent / totalEvents * 100) : 0,
            compare_ratio: totalEvents > 0 ? Math.round(compareIntent / totalEvents * 100) : 0,
            intent: affiliateIntent > compareIntent ? 'affiliate' : compareIntent > 0 ? 'compare' : 'browse',
            priority: affiliateIntent >= 5 ? 'high' : affiliateIntent >= 2 ? 'medium' : 'low',
        };
    }).sort((a, b) => b.affiliate_clicks - a.affiliate_clicks);
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECOMMENDATIONS — structured, actionable
// ═══════════════════════════════════════════════════════════════════════════════

function generateRecommendations(products, articles, variants, campaigns, xPosts, sources) {
    const recs = [];

    // Product scaling recommendations
    products.filter(p => p.action === 'scale_up').forEach(p => {
        recs.push({
            priority: p.global_score,
            type: 'product',
            action: 'boost',
            target: p.entity,
            message: `Boost "${p.entity}" by ${Math.round(p.weight_delta * 100)}% — ${p.trend} trend, ${p.confidence} confidence`,
            weight: p.scaling_weight,
        });
    });

    products.filter(p => p.action === 'deprioritize').forEach(p => {
        recs.push({
            priority: 100 - p.global_score,
            type: 'product',
            action: 'reduce',
            target: p.entity,
            message: `Reduce "${p.entity}" by ${Math.abs(Math.round(p.weight_delta * 100))}% — ${p.trend} trend`,
            weight: p.scaling_weight,
        });
    });

    // Article recommendations
    const winningClusters = {};
    articles.filter(a => a.action === 'feature').forEach(a => {
        winningClusters[a.cluster] = (winningClusters[a.cluster] || 0) + 1;
        recs.push({
            priority: a.base_score,
            type: 'article',
            action: 'feature',
            target: a.entity,
            message: `Feature article "${a.entity}" — ${a.ctr}% CTR, cluster "${a.cluster}"`,
        });
    });

    // Cluster recommendations
    Object.entries(winningClusters).forEach(([cluster, count]) => {
        if (count >= 2) {
            recs.push({
                priority: 80,
                type: 'blog_cluster',
                action: 'generate_more',
                target: cluster,
                message: `Generate more "${cluster}" articles — ${count} winners in this cluster`,
            });
        }
    });

    // Variant recommendations
    [...(variants.urgency || []), ...(variants.position || []), ...(variants.badge || [])]
        .filter(v => v.action === 'scale_up')
        .forEach(v => {
            recs.push({
                priority: v.score,
                type: v.type,
                action: 'increase_frequency',
                target: v.entity,
                message: `Increase "${v.entity}" (${v.type}) — winner with ${v.clicks} clicks`,
                weight: v.weight,
            });
        });

    // Campaign recommendations
    campaigns.filter(c => c.action === 'scale_up').forEach(c => {
        recs.push({
            priority: c.score,
            type: 'campaign',
            action: 'boost',
            target: c.entity,
            message: `Boost campaign "${c.entity}" — outperforms organic by ${Math.round((c.clicks / Math.max(c.avg_organic, 1) - 1) * 100)}%`,
        });
    });

    campaigns.filter(c => c.action === 'review').forEach(c => {
        recs.push({
            priority: 60,
            type: 'campaign',
            action: 'review',
            target: c.entity,
            message: `Review campaign "${c.entity}" — underperforming vs organic`,
        });
    });

    // X post recommendations
    [...(xPosts.hooks || []), ...(xPosts.angles || []), ...(xPosts.ctas || [])]
        .filter(v => v.action === 'scale_up')
        .forEach(v => {
            recs.push({
                priority: v.score,
                type: v.type,
                action: 'increase_usage',
                target: v.entity,
                message: `Use more "${v.entity}" (${v.type}) — avg engagement ${v.avg_engagement}`,
                weight: v.weight,
            });
        });

    // Source recommendations
    sources.filter(s => s.priority === 'high').forEach(s => {
        recs.push({
            priority: 70,
            type: 'source',
            action: 'optimize_for',
            target: s.source,
            message: `Optimize for "${s.source}" — ${s.affiliate_ratio}% affiliate intent, ${s.affiliate_clicks} clicks`,
        });
    });

    return recs.sort((a, b) => b.priority - a.priority);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONVENIENCE ACCESSORS
// ═══════════════════════════════════════════════════════════════════════════════

async function rankScalingOpportunities(supabase) {
    const data = await getScalingCandidates(supabase);
    return data.recommendations.filter(r => r.action === 'boost' || r.action === 'increase_frequency' || r.action === 'increase_usage');
}

async function getDeprioritizationCandidates(supabase) {
    const data = await getScalingCandidates(supabase);
    return data.recommendations.filter(r => r.action === 'reduce' || r.action === 'deprioritize' || r.action === 'review');
}

async function getRisingItems(supabase) {
    const data = await getScalingCandidates(supabase);
    return data.products.filter(p => p.trend === 'rising' || p.trend === 'new');
}

/**
 * Get scaling weights for boosters to consume.
 * Returns: { products: { name: weight }, variants: { name: weight }, x: { hooks, angles, ctas } }
 */
async function getScalingWeights(supabase) {
    if (config.SCALING_DRY_RUN && !config.FULL_AUTO_SCALING_ENABLED) {
        return { products: {}, variants: {}, x: { hooks: {}, angles: {}, ctas: {} }, campaigns: {} };
    }

    const data = await getScalingCandidates(supabase);

    const productWeights = {};
    if (config.PRODUCT_SCALING_ENABLED) {
        data.products.forEach(p => {
            if (p.action !== 'maintain' && p.confidence !== 'insufficient') {
                productWeights[p.entity] = p.scaling_weight;
            }
        });
    }

    const variantWeights = {};
    if (config.X_SCALING_ENABLED || config.BLOG_SCALING_ENABLED) {
        [...(data.variants.urgency || []), ...(data.variants.position || []), ...(data.variants.badge || [])]
            .forEach(v => {
                if (v.confidence !== 'insufficient') {
                    variantWeights[v.entity] = Math.round(v.weight * 100) / 100;
                }
            });
    }

    const xWeights = { hooks: {}, angles: {}, ctas: {} };
    if (config.X_SCALING_ENABLED) {
        (data.x_posts.hooks || []).forEach(h => { if (h.confidence !== 'low') xWeights.hooks[h.entity] = Math.round(h.weight * 100) / 100; });
        (data.x_posts.angles || []).forEach(a => { if (a.confidence !== 'low') xWeights.angles[a.entity] = Math.round(a.weight * 100) / 100; });
        (data.x_posts.ctas || []).forEach(c => { if (c.confidence !== 'low') xWeights.ctas[c.entity] = Math.round(c.weight * 100) / 100; });
    }

    const campaignWeights = {};
    if (config.CAMPAIGN_SCALING_ENABLED) {
        data.campaigns.forEach(c => {
            if (c.action === 'scale_up' && c.status === 'active') {
                campaignWeights[String(c.product_id)] = Math.min(config.MAX_SCALING_WEIGHT, 1.0 + (c.score - 50) / 200);
            }
        });
    }

    return { products: productWeights, variants: variantWeights, x: xWeights, campaigns: campaignWeights };
}

module.exports = {
    getScalingCandidates,
    getScalingWeights,
    rankScalingOpportunities,
    getDeprioritizationCandidates,
    getRisingItems,
    computeTrends,
    getScalingLog,
    getEmptyScaling,
};
