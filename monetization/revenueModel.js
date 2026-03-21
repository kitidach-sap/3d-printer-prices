/**
 * Revenue Model — Monetization Estimation Engine
 * 
 * Estimates revenue for products, campaigns, articles, and sources
 * using configurable assumptions (conversion rates, commission rates, intent multipliers).
 * 
 * Phase A of the Monetization Max Layer.
 */

const config = require('../revenue/config');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURABLE ASSUMPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getAssumptions() {
    return {
        // Amazon affiliate commission tiers (approximate)
        commission_rate: config.AMAZON_COMMISSION_RATE || 0.04,          // 4% default
        commission_tiers: config.COMMISSION_TIERS || {
            under_100: 0.04,
            under_500: 0.035,
            under_1000: 0.03,
            over_1000: 0.025,
        },

        // Conversion rate assumptions by price tier
        conversion_rates: config.CONVERSION_RATES || {
            under_100: 0.08,     // 8% — impulse buys
            under_300: 0.05,     // 5% — considered
            under_600: 0.03,     // 3% — researched
            under_1000: 0.02,    // 2% — high ticket
            over_1000: 0.012,    // 1.2% — very high ticket
        },

        // Intent multipliers
        compare_intent_multiplier: config.COMPARE_INTENT_MULTIPLIER || 1.8,  // compare users convert 1.8x
        blog_intent_multiplier: config.BLOG_INTENT_MULTIPLIER || 1.3,       // blog readers 1.3x
        search_intent_multiplier: config.SEARCH_INTENT_MULTIPLIER || 1.5,   // search traffic 1.5x
        social_intent_multiplier: config.SOCIAL_INTENT_MULTIPLIER || 0.6,   // social traffic 0.6x
        direct_intent_multiplier: config.DIRECT_INTENT_MULTIPLIER || 1.0,

        // Campaign assumptions
        campaign_commission_premium: config.CAMPAIGN_COMMISSION_PREMIUM || 1.5, // campaigns pay ~1.5x normal
        campaign_conversion_boost: config.CAMPAIGN_CONVERSION_BOOST || 1.2,     // campaigns drive slightly higher conversion

        // Minimum data for confidence
        min_clicks_for_estimate: config.MIN_CLICKS_FOR_ESTIMATE || 5,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getConversionRate(price, assumptions) {
    if (!price || price <= 0) return assumptions.conversion_rates.under_300;
    if (price < 100) return assumptions.conversion_rates.under_100;
    if (price < 300) return assumptions.conversion_rates.under_300;
    if (price < 600) return assumptions.conversion_rates.under_600;
    if (price < 1000) return assumptions.conversion_rates.under_1000;
    return assumptions.conversion_rates.over_1000;
}

function getCommissionRate(price, assumptions) {
    if (!price || price <= 0) return assumptions.commission_rate;
    if (price < 100) return assumptions.commission_tiers.under_100;
    if (price < 500) return assumptions.commission_tiers.under_500;
    if (price < 1000) return assumptions.commission_tiers.under_1000;
    return assumptions.commission_tiers.over_1000;
}

function getSourceMultiplier(source, assumptions) {
    if (!source) return assumptions.direct_intent_multiplier;
    const s = source.toLowerCase();
    if (s.includes('search') || s.includes('google') || s.includes('bing')) return assumptions.search_intent_multiplier;
    if (s.includes('twitter') || s.includes('x.com') || s.includes('reddit') || s.includes('social')) return assumptions.social_intent_multiplier;
    if (s.includes('compare')) return assumptions.compare_intent_multiplier;
    if (s.includes('blog') || s.includes('article')) return assumptions.blog_intent_multiplier;
    return assumptions.direct_intent_multiplier;
}

function getConfidence(clicks, minClicks) {
    if (clicks < minClicks) return 'low';
    if (clicks < minClicks * 3) return 'medium';
    return 'high';
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT REVENUE ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Estimate revenue for a single product
 * @param {Object} product - { product_name, price, clicks, compare_count, sources }
 * @returns {Object} revenue estimate
 */
function estimateProductRevenue(product) {
    const assumptions = getAssumptions();
    const price = product.price || 0;
    const clicks = product.clicks || 0;
    const compareCount = product.compare_count || 0;

    const baseConversion = getConversionRate(price, assumptions);
    const commission = getCommissionRate(price, assumptions);

    // Apply compare-intent boost if product has compare activity
    const compareBoost = compareCount > 0 ? (1 + (assumptions.compare_intent_multiplier - 1) * Math.min(1, compareCount / Math.max(1, clicks))) : 1;
    const effectiveConversion = baseConversion * compareBoost;

    const estimatedConversions = clicks * effectiveConversion;
    const estimatedRevenue = estimatedConversions * price * commission;
    const epc = clicks > 0 ? estimatedRevenue / clicks : 0;

    return {
        product_name: product.product_name,
        price,
        clicks,
        compare_count: compareCount,
        base_conversion_rate: baseConversion,
        compare_boost: Math.round(compareBoost * 100) / 100,
        effective_conversion_rate: Math.round(effectiveConversion * 10000) / 10000,
        commission_rate: commission,
        estimated_conversions: Math.round(estimatedConversions * 100) / 100,
        estimated_revenue: Math.round(estimatedRevenue * 100) / 100,
        epc: Math.round(epc * 10000) / 10000,
        confidence: getConfidence(clicks, assumptions.min_clicks_for_estimate),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN REVENUE ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Estimate revenue for a campaign
 * @param {Object} campaign - { campaign_name, product_id, clicks, total_budget, status }
 * @param {number} productPrice - price of associated product
 */
function estimateCampaignRevenue(campaign, productPrice = 0) {
    const assumptions = getAssumptions();
    const clicks = campaign.clicks?.total || campaign.clicks || 0;
    const budget = campaign.total_budget || 0;
    const price = productPrice || 200; // fallback assumption

    const baseConversion = getConversionRate(price, assumptions) * assumptions.campaign_conversion_boost;
    const commission = getCommissionRate(price, assumptions) * assumptions.campaign_commission_premium;

    const estimatedConversions = clicks * baseConversion;
    const estimatedRevenue = estimatedConversions * price * commission;
    const epc = clicks > 0 ? estimatedRevenue / clicks : 0;
    const roi = budget > 0 ? (estimatedRevenue - budget) / budget : 0;

    return {
        campaign_name: campaign.campaign_name,
        status: campaign.status,
        clicks,
        budget,
        product_price: price,
        conversion_rate: Math.round(baseConversion * 10000) / 10000,
        commission_rate: Math.round(commission * 10000) / 10000,
        estimated_revenue: Math.round(estimatedRevenue * 100) / 100,
        epc: Math.round(epc * 10000) / 10000,
        roi: Math.round(roi * 100) / 100,
        roi_verdict: roi > 0.5 ? 'strong' : roi > 0 ? 'positive' : roi > -0.3 ? 'weak' : 'negative',
        confidence: getConfidence(clicks, assumptions.min_clicks_for_estimate),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ARTICLE REVENUE ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Estimate revenue contribution of an article
 * @param {Object} article - { slug, views, clicks, ctr, top_products }
 * @param {Object} productPrices - { product_name: price }
 */
function estimateArticleRevenue(article, productPrices = {}) {
    const assumptions = getAssumptions();
    const clicks = article.clicks || 0;

    // Average price of products featured in this article
    const linkedProducts = article.top_products || [];
    let avgPrice = 200; // default
    if (linkedProducts.length > 0) {
        const prices = linkedProducts
            .map(tp => productPrices[tp[0]] || productPrices[tp] || 0)
            .filter(p => p > 0);
        if (prices.length > 0) avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
    }

    const baseConversion = getConversionRate(avgPrice, assumptions) * assumptions.blog_intent_multiplier;
    const commission = getCommissionRate(avgPrice, assumptions);

    const estimatedConversions = clicks * baseConversion;
    const estimatedRevenue = estimatedConversions * avgPrice * commission;
    const epc = clicks > 0 ? estimatedRevenue / clicks : 0;
    const rpm = article.views > 0 ? (estimatedRevenue / article.views) * 1000 : 0;

    return {
        slug: article.slug,
        views: article.views || 0,
        clicks,
        ctr: article.ctr || 0,
        avg_product_price: Math.round(avgPrice),
        estimated_revenue: Math.round(estimatedRevenue * 100) / 100,
        epc: Math.round(epc * 10000) / 10000,
        rpm: Math.round(rpm * 100) / 100,
        confidence: getConfidence(clicks, assumptions.min_clicks_for_estimate),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOURCE VALUE ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Estimate value of a traffic source
 * @param {Object} source - { name, clicks, compare_count, blog_clicks }
 * @param {number} avgProductPrice
 */
function estimateSourceValue(source, avgProductPrice = 200) {
    const assumptions = getAssumptions();
    const clicks = source.clicks || 0;
    const compareCount = source.compare_count || 0;
    const blogClicks = source.blog_clicks || 0;

    const intentMultiplier = getSourceMultiplier(source.name, assumptions);
    const compareBoost = compareCount > 0 ? (1 + (assumptions.compare_intent_multiplier - 1) * Math.min(1, compareCount / Math.max(1, clicks))) : 1;

    const baseConversion = getConversionRate(avgProductPrice, assumptions);
    const effectiveConversion = baseConversion * intentMultiplier * compareBoost;
    const commission = getCommissionRate(avgProductPrice, assumptions);

    const estimatedConversions = clicks * effectiveConversion;
    const estimatedRevenue = estimatedConversions * avgProductPrice * commission;
    const epc = clicks > 0 ? estimatedRevenue / clicks : 0;

    return {
        source: source.name,
        clicks,
        compare_count: compareCount,
        blog_clicks: blogClicks,
        intent_multiplier: intentMultiplier,
        compare_boost: Math.round(compareBoost * 100) / 100,
        effective_conversion: Math.round(effectiveConversion * 10000) / 10000,
        estimated_revenue: Math.round(estimatedRevenue * 100) / 100,
        epc: Math.round(epc * 10000) / 10000,
        value_tier: epc > 0.10 ? 'high' : epc > 0.03 ? 'medium' : 'low',
        confidence: getConfidence(clicks, assumptions.min_clicks_for_estimate),
    };
}

module.exports = {
    estimateProductRevenue,
    estimateCampaignRevenue,
    estimateArticleRevenue,
    estimateSourceValue,
    getAssumptions,
    getConversionRate,
    getCommissionRate,
    getSourceMultiplier,
    getConfidence,
};
