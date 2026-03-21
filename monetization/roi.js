/**
 * ROI — Return on Investment Calculations
 * 
 * Aggregates revenue estimates into ROI views for products, campaigns, sources.
 * Phase A of the Monetization Max Layer.
 */

const revenueModel = require('./revenueModel');
const valueScoring = require('./valueScoring');

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Full monetization overview combining all dimensions
 */
function getMonetizationOverview(products, campaigns, articles, sources, productPrices = {}) {
    const prodScores = valueScoring.scoreProductValues(products);
    const campScores = valueScoring.scoreCampaignValues(campaigns, productPrices);
    const artScores = valueScoring.scoreArticleValues(articles, productPrices);
    const srcScores = valueScoring.scoreSourceValues(sources);

    const totalEstRevenue = prodScores.reduce((s, p) => s + p.estimated_revenue, 0);
    const totalClicks = prodScores.reduce((s, p) => s + p.clicks, 0);
    const avgEPC = totalClicks > 0 ? totalEstRevenue / totalClicks : 0;

    const clickTraps = prodScores.filter(p => p.is_click_trap);
    const hiddenGems = prodScores.filter(p => p.is_hidden_gem);
    const highValue = prodScores.filter(p => p.verdict === 'high_value');
    const lowValue = prodScores.filter(p => p.verdict === 'low_value');

    return {
        generated_at: new Date().toISOString(),
        summary: {
            total_estimated_revenue: Math.round(totalEstRevenue * 100) / 100,
            total_clicks: totalClicks,
            avg_epc: Math.round(avgEPC * 10000) / 10000,
            products_tracked: prodScores.length,
            campaigns_tracked: campScores.length,
            articles_tracked: artScores.length,
            sources_tracked: srcScores.length,
            click_traps: clickTraps.length,
            hidden_gems: hiddenGems.length,
            high_value_products: highValue.length,
            low_value_products: lowValue.length,
        },
        top_revenue_products: prodScores.slice(0, 10),
        top_revenue_campaigns: campScores.slice(0, 5),
        top_revenue_articles: artScores.slice(0, 10),
        top_revenue_sources: srcScores.slice(0, 8),
        click_traps: clickTraps.slice(0, 5),
        hidden_gems: hiddenGems.slice(0, 5),
        assumptions: revenueModel.getAssumptions(),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT ROI
// ═══════════════════════════════════════════════════════════════════════════════

function getProductROI(products) {
    return valueScoring.scoreProductValues(products);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN ROI
// ═══════════════════════════════════════════════════════════════════════════════

function getCampaignROI(campaigns, productPrices = {}) {
    return valueScoring.scoreCampaignValues(campaigns, productPrices);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE ROI
// ═══════════════════════════════════════════════════════════════════════════════

function getSourceROI(sources, avgProductPrice = 200) {
    return valueScoring.scoreSourceValues(sources, avgProductPrice);
}

module.exports = {
    getMonetizationOverview,
    getProductROI,
    getCampaignROI,
    getSourceROI,
};
