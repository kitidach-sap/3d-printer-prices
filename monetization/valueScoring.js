/**
 * Value Scoring — Revenue-Weighted Performance Scores
 * 
 * Combines behavioral signals (clicks, CTR, compare usage)
 * with monetization signals (EPC, conversion rate, commission)
 * to produce revenue-aware scores (0–100).
 * 
 * Phase A of the Monetization Max Layer.
 */

const config = require('../revenue/config');
const revenueModel = require('./revenueModel');
const { percentileScore } = require('../revenue/scoring');

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT VALUE SCORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score products by revenue potential, not just clicks
 * @param {Array} products - [{ product_name, clicks, compare_count, price, sources }]
 * @returns {Array} scored products sorted by valueScore desc
 */
function scoreProductValues(products) {
    if (!products.length) return [];

    const estimates = products.map(p => ({
        ...p,
        revenue: revenueModel.estimateProductRevenue(p),
    }));

    const allEPCs = estimates.map(e => e.revenue.epc);
    const allRevenues = estimates.map(e => e.revenue.estimated_revenue);
    const allClicks = estimates.map(e => e.clicks || 0);

    return estimates.map(e => {
        const epcScore = percentileScore(e.revenue.epc, allEPCs);
        const revenueScore = percentileScore(e.revenue.estimated_revenue, allRevenues);
        const clickScore = percentileScore(e.clicks || 0, allClicks);

        // 40% EPC + 35% revenue + 25% clicks
        const valueScore = Math.round(epcScore * 0.40 + revenueScore * 0.35 + clickScore * 0.25);

        return {
            product_name: e.product_name,
            clicks: e.clicks || 0,
            price: e.price || 0,
            compare_count: e.compare_count || 0,
            epc: e.revenue.epc,
            estimated_revenue: e.revenue.estimated_revenue,
            click_score: clickScore,
            epc_score: epcScore,
            revenue_score: revenueScore,
            value_score: Math.min(100, valueScore),
            confidence: e.revenue.confidence,
            verdict: valueScore >= 70 ? 'high_value' : valueScore <= 30 ? 'low_value' : 'medium_value',
            // Flag products with high clicks but low value (traps)
            is_click_trap: clickScore >= 60 && epcScore <= 30,
            // Flag underrated high-value products
            is_hidden_gem: clickScore <= 40 && epcScore >= 60,
        };
    }).sort((a, b) => b.value_score - a.value_score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN VALUE SCORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score campaigns by revenue ROI, not just click volume
 * @param {Array} campaigns - from analytics.getCampaignPerformance
 * @param {Object} productPrices - { product_id: price }
 */
function scoreCampaignValues(campaigns, productPrices = {}) {
    if (!campaigns.length) return [];

    const estimates = campaigns.map(c => ({
        ...c,
        revenue: revenueModel.estimateCampaignRevenue(c, productPrices[c.product_id] || 0),
    }));

    const allEPCs = estimates.map(e => e.revenue.epc);
    const allROIs = estimates.map(e => e.revenue.roi);

    return estimates.map(e => {
        const epcScore = percentileScore(e.revenue.epc, allEPCs);
        const roiScore = percentileScore(e.revenue.roi, allROIs);

        // 50% EPC + 50% ROI
        const valueScore = Math.round(epcScore * 0.50 + roiScore * 0.50);

        return {
            campaign_name: e.campaign_name,
            campaign_id: e.id,
            product_id: e.product_id,
            status: e.status,
            clicks: e.revenue.clicks,
            budget: e.revenue.budget,
            epc: e.revenue.epc,
            roi: e.revenue.roi,
            estimated_revenue: e.revenue.estimated_revenue,
            epc_score: epcScore,
            roi_score: roiScore,
            value_score: Math.min(100, valueScore),
            confidence: e.revenue.confidence,
            verdict: e.revenue.roi_verdict,
        };
    }).sort((a, b) => b.value_score - a.value_score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE VALUE SCORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score articles by monetization performance
 * @param {Array} articles - from analytics.getTopArticles
 * @param {Object} productPrices - { product_name: price }
 */
function scoreArticleValues(articles, productPrices = {}) {
    if (!articles.length) return [];

    const estimates = articles.map(a => ({
        ...a,
        revenue: revenueModel.estimateArticleRevenue(a, productPrices),
    }));

    const allEPCs = estimates.map(e => e.revenue.epc);
    const allRPMs = estimates.map(e => e.revenue.rpm);
    const allClicks = estimates.map(e => e.clicks || 0);

    return estimates.map(e => {
        const epcScore = percentileScore(e.revenue.epc, allEPCs);
        const rpmScore = percentileScore(e.revenue.rpm, allRPMs);
        const clickScore = percentileScore(e.clicks || 0, allClicks);

        // 35% EPC + 35% RPM + 30% clicks
        const valueScore = Math.round(epcScore * 0.35 + rpmScore * 0.35 + clickScore * 0.30);

        return {
            slug: e.slug,
            views: e.views,
            clicks: e.clicks,
            ctr: e.ctr,
            epc: e.revenue.epc,
            rpm: e.revenue.rpm,
            estimated_revenue: e.revenue.estimated_revenue,
            value_score: Math.min(100, valueScore),
            confidence: e.revenue.confidence,
            verdict: valueScore >= 70 ? 'high_value' : valueScore <= 30 ? 'low_value' : 'medium_value',
        };
    }).sort((a, b) => b.value_score - a.value_score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE VALUE SCORE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Score traffic sources by revenue quality
 * @param {Object} sourceData - from analytics.getTopSources
 * @param {number} avgProductPrice
 */
function scoreSourceValues(sourceData, avgProductPrice = 200) {
    const sources = sourceData.all || [];
    if (!sources.length) return [];

    const compareBySource = sourceData.by_type?.compare || {};
    const blogBySource = sourceData.by_type?.blog_click || {};

    const enriched = sources.map(s => ({
        name: s.name,
        clicks: s.count,
        compare_count: compareBySource[s.name] || 0,
        blog_clicks: blogBySource[s.name] || 0,
    }));

    const estimates = enriched.map(s => ({
        ...s,
        revenue: revenueModel.estimateSourceValue(s, avgProductPrice),
    }));

    const allEPCs = estimates.map(e => e.revenue.epc);

    return estimates.map(e => {
        const epcScore = percentileScore(e.revenue.epc, allEPCs);

        return {
            source: e.name,
            clicks: e.clicks,
            compare_count: e.compare_count,
            blog_clicks: e.blog_clicks,
            epc: e.revenue.epc,
            estimated_revenue: e.revenue.estimated_revenue,
            value_tier: e.revenue.value_tier,
            intent_multiplier: e.revenue.intent_multiplier,
            value_score: epcScore,
            confidence: e.revenue.confidence,
        };
    }).sort((a, b) => b.value_score - a.value_score);
}

module.exports = {
    scoreProductValues,
    scoreCampaignValues,
    scoreArticleValues,
    scoreSourceValues,
};
