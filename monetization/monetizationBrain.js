/**
 * Monetization Brain — Revenue-Weighted Recommendation Engine
 * 
 * Uses revenue signals to generate actionable recommendations.
 * Phase B: read-only / recommendation mode. Does NOT auto-apply.
 */

const config = require('../revenue/config');
const analytics = require('../revenue/analytics');
const revenueModel = require('./revenueModel');
const valueScoring = require('./valueScoring');

// ═══════════════════════════════════════════════════════════════════════════════
// GENERATE RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate revenue-weighted recommendations
 * @param {Object} supabase
 * @returns {Object} { recommendations, insights, generated_at }
 */
async function getRecommendations(supabase) {
    const days = config.EXTENDED_ANALYTICS_DAYS || 14;
    const recs = [];
    const insights = [];

    try {
        // Fetch all analytics data
        const [topProducts, topSources, topArticles, campaignPerf, compareUsage] = await Promise.all([
            analytics.getTopProducts(supabase, days, 100),
            analytics.getTopSources(supabase, days),
            analytics.getTopArticles(supabase, days, 50),
            analytics.getCampaignPerformance(supabase),
            analytics.getCompareUsage(supabase, days, 50),
        ]);

        // Enrich products with compare data and prices
        const { data: dbProducts } = await supabase.from('products')
            .select('product_name, price')
            .limit(500);

        const priceMap = {};
        (dbProducts || []).forEach(p => { if (p.price) priceMap[p.product_name] = p.price; });

        const enrichedProducts = topProducts.map(p => ({
            ...p,
            price: priceMap[p.product_name] || 0,
            compare_count: (compareUsage.find(c => c.name === p.product_name) || {}).count || 0,
        }));

        // Score everything
        const productScores = valueScoring.scoreProductValues(enrichedProducts);
        const sourceScores = valueScoring.scoreSourceValues(topSources);
        const articleScores = valueScoring.scoreArticleValues(topArticles, priceMap);

        // ─── Product Recommendations ────────────────────────────────

        // High-value products that deserve more exposure
        productScores.filter(p => p.verdict === 'high_value' && p.confidence !== 'low').forEach(p => {
            recs.push({
                type: 'product_boost',
                priority: 'high',
                entity: p.product_name,
                reason: `High EPC ($${p.epc.toFixed(4)}) + value score ${p.value_score}`,
                action: `Boost exposure for "${p.product_name}" — estimated $${p.estimated_revenue.toFixed(2)} revenue`,
                estimated_impact: p.estimated_revenue,
            });
        });

        // Click traps — high clicks but low value
        productScores.filter(p => p.is_click_trap).forEach(p => {
            recs.push({
                type: 'product_reduce',
                priority: 'medium',
                entity: p.product_name,
                reason: `Click trap: ${p.clicks} clicks but EPC only $${p.epc.toFixed(4)}`,
                action: `Reduce prominence of "${p.product_name}" — absorbs clicks with low monetization`,
                estimated_impact: -p.estimated_revenue * 0.3,
            });
        });

        // Hidden gems — high EPC but low clicks
        productScores.filter(p => p.is_hidden_gem).forEach(p => {
            recs.push({
                type: 'product_discover',
                priority: 'high',
                entity: p.product_name,
                reason: `Hidden gem: EPC $${p.epc.toFixed(4)} but only ${p.clicks} clicks`,
                action: `Increase exposure for "${p.product_name}" — high revenue potential if clicks increase`,
                estimated_impact: p.epc * 20,
            });
        });

        // ─── Source Recommendations ─────────────────────────────────

        sourceScores.filter(s => s.value_tier === 'high').forEach(s => {
            recs.push({
                type: 'source_invest',
                priority: 'medium',
                entity: s.source,
                reason: `High-value source: EPC $${s.epc.toFixed(4)}`,
                action: `Invest more in "${s.source}" traffic — high revenue per click`,
                estimated_impact: s.estimated_revenue * 0.2,
            });
        });

        sourceScores.filter(s => s.value_tier === 'low' && s.clicks > 10).forEach(s => {
            recs.push({
                type: 'source_evaluate',
                priority: 'low',
                entity: s.source,
                reason: `Low-value source: ${s.clicks} clicks but EPC only $${s.epc.toFixed(4)}`,
                action: `Evaluate "${s.source}" — consider routing to compare page for higher intent`,
                estimated_impact: 0,
            });
        });

        // ─── Article Recommendations ────────────────────────────────

        articleScores.filter(a => a.verdict === 'high_value').slice(0, 5).forEach(a => {
            recs.push({
                type: 'article_expand',
                priority: 'medium',
                entity: a.slug,
                reason: `High-value article: RPM $${a.rpm.toFixed(2)}, EPC $${a.epc.toFixed(4)}`,
                action: `Create more content in the "${a.slug}" cluster — strong monetization`,
                estimated_impact: a.estimated_revenue * 0.3,
            });
        });

        // ─── Insights ───────────────────────────────────────────────

        const totalEstRevenue = productScores.reduce((s, p) => s + p.estimated_revenue, 0);
        const totalClicks = productScores.reduce((s, p) => s + p.clicks, 0);
        const avgEPC = totalClicks > 0 ? totalEstRevenue / totalClicks : 0;

        insights.push({ type: 'overview', message: `Estimated total revenue: $${totalEstRevenue.toFixed(2)} from ${totalClicks} clicks (avg EPC: $${avgEPC.toFixed(4)})` });
        insights.push({ type: 'traps', message: `${productScores.filter(p => p.is_click_trap).length} click traps detected (high clicks, low money)` });
        insights.push({ type: 'gems', message: `${productScores.filter(p => p.is_hidden_gem).length} hidden gems found (high EPC, low exposure)` });

        if (sourceScores.length > 0) {
            const bestSource = sourceScores[0];
            insights.push({ type: 'source', message: `Best source: "${bestSource.source}" (EPC: $${bestSource.epc.toFixed(4)})` });
        }

    } catch (err) {
        insights.push({ type: 'error', message: `Recommendation error: ${err.message}` });
    }

    return {
        generated_at: new Date().toISOString(),
        recommendations: recs.sort((a, b) => {
            const pri = { high: 3, medium: 2, low: 1 };
            return (pri[b.priority] || 0) - (pri[a.priority] || 0);
        }),
        insights,
        total_recommendations: recs.length,
    };
}

module.exports = {
    getRecommendations,
};
