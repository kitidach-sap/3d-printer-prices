/**
 * Revenue Winners — Winner/Loser Detection & Recommendations
 * 
 * Phase B of the Auto Money System.
 * Identifies winners (top 20%) and losers (bottom 20%) across all dimensions.
 * Produces actionable recommendations for future boosting phases.
 * 
 * This module is READ-ONLY — it does not change any behavior.
 * It produces structured data that future modules (boosters, scheduler) will consume.
 */

const config = require('./config');
const analytics = require('./analytics');
const scoring = require('./scoring');

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT WINNERS
// ═══════════════════════════════════════════════════════════════════════════════

async function detectProductWinners(supabase, days = config.WINNER_DETECTION_DAYS) {
    const topProducts = await analytics.getTopProducts(supabase, days, 100);
    const compareUsage = await analytics.getCompareUsage(supabase, days, 100);

    if (!topProducts.length) return { winners: [], losers: [], all: [] };

    const allClicks = topProducts.map(p => p.clicks);
    const avg = allClicks.reduce((s, c) => s + c, 0) / allClicks.length;
    const threshold = config.MIN_CLICKS_FOR_WINNER;

    const compareMap = {};
    compareUsage.forEach(c => { compareMap[c.name] = c.count; });

    const scored = topProducts.map(p => {
        const compareCount = compareMap[p.product_name] || 0;
        const clickScore = scoring.percentileScore(p.clicks, allClicks);
        const compositeScore = Math.min(100, Math.round(
            clickScore * config.WEIGHT_CLICKS +
            (compareCount >= config.MIN_COMPARE_ACTIONS ? 10 : 0) * config.WEIGHT_COMPARES
        ));

        return {
            product_name: p.product_name,
            product_id: p.product_id,
            clicks: p.clicks,
            compare_count: compareCount,
            score: compositeScore,
            sources: p.sources,
            verdict: p.clicks >= threshold
                ? (compositeScore >= 70 ? 'winner' : compositeScore <= 30 ? 'loser' : 'average')
                : 'insufficient_data',
        };
    });

    const winners = scored.filter(p => p.verdict === 'winner');
    const losers = scored.filter(p => p.verdict === 'loser');

    return { winners, losers, all: scored, avg_clicks: Math.round(avg) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT WINNERS (urgency, position, badge)
// ═══════════════════════════════════════════════════════════════════════════════

async function detectVariantWinners(supabase, days = config.WINNER_DETECTION_DAYS) {
    const scores = await scoring.scoreVariantPerformance(supabase, days);

    const extract = (items) => ({
        winners: items.filter(v => v.verdict === 'winner'),
        losers: items.filter(v => v.verdict === 'loser'),
        all: items,
    });

    return {
        urgency: extract(scores.urgency),
        position: extract(scores.position),
        badge: extract(scores.badge),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE WINNERS
// ═══════════════════════════════════════════════════════════════════════════════

async function detectArticleWinners(supabase, days = config.WINNER_DETECTION_DAYS) {
    const scores = await scoring.scoreArticlePerformance(supabase, days);

    if (!scores.length) return { winners: [], losers: [], all: [] };

    return {
        winners: scores.filter(a => a.verdict === 'winner'),
        losers: scores.filter(a => a.verdict === 'loser'),
        all: scores,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN WINNERS
// ═══════════════════════════════════════════════════════════════════════════════

async function detectCampaignWinners(supabase) {
    const scores = await scoring.scoreCampaignPerformance(supabase);

    return {
        winners: scores.filter(c => c.verdict === 'winner'),
        underperforming: scores.filter(c => c.verdict === 'underperforming'),
        all: scores,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// X POST WINNERS
// ═══════════════════════════════════════════════════════════════════════════════

async function detectXPostWinners(supabase) {
    const scores = await scoring.scoreXPostVariants(supabase);

    const extract = (items) => ({
        winners: items.filter(v => v.verdict === 'winner'),
        all: items,
    });

    return {
        hooks: extract(scores.hooks),
        angles: extract(scores.angles),
        ctas: extract(scores.ctas),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOST RECOMMENDATIONS (read-only — for future use by boosters.js)
// ═══════════════════════════════════════════════════════════════════════════════

async function getBoostRecommendations(supabase) {
    const [products, variants, articles, campaigns, xPosts] = await Promise.all([
        detectProductWinners(supabase),
        detectVariantWinners(supabase),
        detectArticleWinners(supabase),
        detectCampaignWinners(supabase),
        detectXPostWinners(supabase),
    ]);

    const recommendations = [];

    // Product boost candidates
    products.winners.forEach(p => {
        recommendations.push({
            type: 'product_boost',
            target: p.product_name,
            score: p.score,
            action: `Boost visibility — ${p.clicks} clicks, score ${p.score}/100`,
            badge_suggestion: p.score >= 85 ? '🔥 Trending' : '📈 Rising',
        });
    });

    // Urgency variant boost candidates
    variants.urgency.winners.forEach(v => {
        recommendations.push({
            type: 'urgency_boost',
            target: v.name,
            score: v.score,
            action: `Increase frequency — ${v.clicks} clicks (winner)`,
        });
    });

    // Urgency variant demotion candidates
    variants.urgency.losers.forEach(v => {
        recommendations.push({
            type: 'urgency_demote',
            target: v.name,
            score: v.score,
            action: `Reduce frequency — ${v.clicks} clicks (underperformer)`,
        });
    });

    // Article boost candidates
    articles.winners.forEach(a => {
        recommendations.push({
            type: 'article_boost',
            target: a.slug,
            score: a.score,
            action: `Feature article — ${a.ctr}% CTR, ${a.clicks} clicks`,
        });
    });

    // Campaign boost candidates
    campaigns.winners.forEach(c => {
        recommendations.push({
            type: 'campaign_boost',
            target: c.campaign_name,
            score: c.score,
            action: `Campaign outperforms organic by ${Math.round((c.clicks / Math.max(c.avg_organic_clicks, 1) - 1) * 100)}%`,
        });
    });

    // X post hook winners
    xPosts.hooks.winners.forEach(h => {
        recommendations.push({
            type: 'x_hook_boost',
            target: h.name,
            score: h.score,
            action: `Use more often — avg engagement ${h.avg_engagement}`,
        });
    });

    return {
        generated_at: new Date().toISOString(),
        summary: {
            product_winners: products.winners.length,
            product_losers: products.losers.length,
            urgency_winners: variants.urgency.winners.length,
            article_winners: articles.winners.length,
            campaign_winners: campaigns.winners.length,
            x_hook_winners: xPosts.hooks.winners.length,
            total_recommendations: recommendations.length,
        },
        products,
        variants,
        articles,
        campaigns,
        x_posts: xPosts,
        recommendations: recommendations.sort((a, b) => b.score - a.score),
        feature_flags: {
            AUTO_BOOST_ENABLED: config.AUTO_BOOST_ENABLED,
            CAMPAIGN_BOOST_ENABLED: config.CAMPAIGN_BOOST_ENABLED,
            WINNER_CTA_ENABLED: config.WINNER_CTA_ENABLED,
            BLOG_OPTIMIZATION_ENABLED: config.BLOG_OPTIMIZATION_ENABLED,
            X_OPTIMIZATION_ENABLED: config.X_OPTIMIZATION_ENABLED,
        },
    };
}

module.exports = {
    detectProductWinners,
    detectVariantWinners,
    detectArticleWinners,
    detectCampaignWinners,
    detectXPostWinners,
    getBoostRecommendations,
};
