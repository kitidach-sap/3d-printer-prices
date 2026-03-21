/**
 * Route Simulator — Revenue Outcome Estimation per Route
 * 
 * Simulates expected revenue for each possible destination route
 * (direct affiliate, campaign link, compare page, product page, article page).
 * 
 * Smart Routing Engine — Module 1
 */

const config = require('../revenue/config');
const revenueModel = require('./revenueModel');

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE ASSUMPTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getRouteMultipliers() {
    return {
        // Each route modifies conversion probability
        direct_affiliate: {
            conversion_multiplier: 1.0,    // baseline
            description: 'Direct Amazon affiliate link',
        },
        campaign_link: {
            conversion_multiplier: config.CAMPAIGN_CONVERSION_BOOST || 1.2,
            commission_multiplier: config.CAMPAIGN_COMMISSION_PREMIUM || 1.5,
            description: 'Creator Connections campaign link',
        },
        compare_page: {
            conversion_multiplier: config.COMPARE_INTENT_MULTIPLIER || 1.8,
            description: 'Compare page (high purchase intent)',
        },
        product_page: {
            conversion_multiplier: config.PRODUCT_PAGE_MULTIPLIER || 1.3,
            description: 'Product detail page first',
        },
        article_page: {
            conversion_multiplier: config.BLOG_INTENT_MULTIPLIER || 1.3,
            description: 'Blog article funnel',
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIMULATE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simulate revenue outcomes for each possible route
 * @param {Object} product - { product_name, price, clicks, compare_count }
 * @param {string} source - traffic source
 * @param {Object} context - { page, campaign_available, campaign_budget }
 * @returns {Object} route simulations
 */
function simulateRoutes(product, source, context = {}) {
    const multipliers = getRouteMultipliers();
    const price = product.price || 200;
    const baseConversion = revenueModel.getConversionRate(price, revenueModel.getAssumptions());
    const baseCommission = revenueModel.getCommissionRate(price, revenueModel.getAssumptions());
    const sourceMultiplier = revenueModel.getSourceMultiplier(source, revenueModel.getAssumptions());

    const routes = {};

    Object.entries(multipliers).forEach(([route, rm]) => {
        const convMult = rm.conversion_multiplier * sourceMultiplier;
        const commMult = rm.commission_multiplier || 1.0;
        const effectiveConversion = baseConversion * convMult;
        const effectiveCommission = baseCommission * commMult;
        const estimatedRevenue = effectiveConversion * price * effectiveCommission;

        // Availability checks
        let available = true;
        let reason = null;

        if (route === 'campaign_link') {
            if (!context.campaign_available) {
                available = false;
                reason = 'No active campaign';
            }
        }

        routes[route] = {
            route,
            estimated_epc: Math.round(estimatedRevenue * 10000) / 10000,
            conversion_rate: Math.round(effectiveConversion * 10000) / 10000,
            commission_rate: Math.round(effectiveCommission * 10000) / 10000,
            description: rm.description,
            available,
            unavailable_reason: reason,
            uplift_vs_direct: route === 'direct_affiliate' ? 0 :
                Math.round(((estimatedRevenue / (baseConversion * sourceMultiplier * price * baseCommission)) - 1) * 10000) / 100,
        };
    });

    // Sort by estimated EPC descending
    const sorted = Object.values(routes)
        .filter(r => r.available)
        .sort((a, b) => b.estimated_epc - a.estimated_epc);

    return {
        product_name: product.product_name,
        price,
        source: source || 'direct',
        context: context.page || 'unknown',
        routes,
        best_route: sorted[0]?.route || 'direct_affiliate',
        best_epc: sorted[0]?.estimated_epc || 0,
        default_epc: routes.direct_affiliate.estimated_epc,
        potential_uplift: sorted[0] ? sorted[0].uplift_vs_direct : 0,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH SIMULATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simulate best routes for multiple products
 */
function simulateBatch(products, source, context = {}) {
    return products.map(p => simulateRoutes(p, source, context));
}

module.exports = {
    simulateRoutes,
    simulateBatch,
    getRouteMultipliers,
};
