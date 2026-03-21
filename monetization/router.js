/**
 * Smart Router — Core Routing Engine + Safe Link Wrapper
 * 
 * Selects the highest-value destination for each click.
 * Wraps all outbound links with intelligent routing.
 * 
 * Smart Routing Engine — Module 3 (core)
 */

const config = require('../revenue/config');
const simulator = require('./routeSimulator');
const policy = require('./routingPolicy');
const attribution = require('./attribution');
const revenueModel = require('./revenueModel');

const AFFILIATE_TAG = 'kiti09-20';

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE CHOOSER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Choose the best route for a product/source/context
 * @param {Object} product - { product_name, price, clicks, compare_count, amazon_url }
 * @param {string} source
 * @param {Object} context - { page, campaign_available, campaign_url }
 * @returns {Object} { route, url, reason, confidence, uplift, simulated }
 */
function chooseBestRoute(product, source, context = {}) {
    // Default fallback
    const defaultUrl = buildAffiliateUrl(product.amazon_url || product.amazon_asin);
    const defaultResult = {
        route: 'direct_affiliate',
        url: defaultUrl,
        reason: 'default',
        confidence: 'low',
        uplift: 0,
        overridden: false,
    };

    // If routing disabled, return default
    if (!config.SMART_ROUTING_ENABLED) {
        return defaultResult;
    }

    try {
        // 1. Simulate all routes
        const sim = simulator.simulateRoutes(product, source, context);

        // 2. Get confidence from data volume
        const confidence = revenueModel.getConfidence(
            product.clicks || 0,
            (revenueModel.getAssumptions()).min_clicks_for_estimate
        );

        // 3. Check if override is allowed by policy
        const policyCheck = policy.checkPolicy({
            product_name: product.product_name,
            source,
            confidence,
            uplift: sim.potential_uplift,
            route: sim.best_route,
        });

        if (!policyCheck.allowed) {
            // Log the blocked decision
            attribution.logDecision({
                type: 'route_blocked',
                product_name: product.product_name,
                source,
                context: context.page,
                route_chosen: 'direct_affiliate',
                simulated_best: sim.best_route,
                confidence,
                reason: policyCheck.reasons.join('; '),
                expected_uplift: sim.potential_uplift,
            });

            return defaultResult;
        }

        // 4. Build URL for chosen route
        const chosenRoute = sim.best_route;
        const url = buildRouteUrl(chosenRoute, product, context);

        // 5. Record the routing decision
        policy.recordRoute(product.product_name);

        // 6. Log attribution
        attribution.logDecision({
            type: 'route_choice',
            product_name: product.product_name,
            source,
            context: context.page,
            route_chosen: chosenRoute,
            simulated_values: Object.fromEntries(
                Object.entries(sim.routes).map(([k, v]) => [k, v.estimated_epc])
            ),
            confidence,
            reason: `Best EPC: $${sim.best_epc} (${chosenRoute})`,
            expected_uplift: sim.potential_uplift,
        });

        return {
            route: chosenRoute,
            url,
            reason: `Best EPC: $${sim.best_epc.toFixed(4)} (+${sim.potential_uplift.toFixed(1)}%)`,
            confidence,
            uplift: sim.potential_uplift,
            overridden: chosenRoute !== 'direct_affiliate',
            simulated: sim.routes,
        };
    } catch (err) {
        return defaultResult;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAFE LINK WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the smartest link for a product. Safe wrapper:
 * - returns original affiliate link if routing disabled
 * - returns chosen route if enabled + policy allows
 * - never returns a broken link
 *
 * @param {Object} product
 * @param {string} source
 * @param {Object} context
 * @returns {string} URL
 */
function getSmartLink(product, source, context = {}) {
    if (!config.SMART_ROUTING_ENABLED) {
        return buildAffiliateUrl(product.amazon_url || product.amazon_asin);
    }

    const result = chooseBestRoute(product, source, context);
    return result.url || buildAffiliateUrl(product.amazon_url || product.amazon_asin);
}

// ═══════════════════════════════════════════════════════════════════════════════
// URL BUILDERS
// ═══════════════════════════════════════════════════════════════════════════════

function buildAffiliateUrl(urlOrAsin) {
    if (!urlOrAsin) return '#';
    if (urlOrAsin.startsWith('http')) {
        try {
            const u = new URL(urlOrAsin);
            u.searchParams.set('tag', AFFILIATE_TAG);
            return u.toString();
        } catch {
            return urlOrAsin + (urlOrAsin.includes('?') ? '&' : '?') + 'tag=' + AFFILIATE_TAG;
        }
    }
    return `https://www.amazon.com/dp/${urlOrAsin}?tag=${AFFILIATE_TAG}`;
}

function buildRouteUrl(route, product, context) {
    switch (route) {
        case 'direct_affiliate':
            return buildAffiliateUrl(product.amazon_url || product.amazon_asin);

        case 'campaign_link':
            return context.campaign_url || buildAffiliateUrl(product.amazon_url || product.amazon_asin);

        case 'compare_page':
            return `/compare.html?highlight=${encodeURIComponent(product.product_name || '')}`;

        case 'product_page':
            return `/product.html?id=${product.id || product.product_id || ''}`;

        case 'article_page':
            // Route to best-performing article for this product
            return context.article_url || `/blog/`;

        default:
            return buildAffiliateUrl(product.amazon_url || product.amazon_asin);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH ROUTING RECOMMENDATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get routing recommendations for multiple products (admin view)
 */
function getRoutingRecommendations(products, source = 'direct', context = {}) {
    return products.map(p => {
        const sim = simulator.simulateRoutes(p, source, context);
        const confidence = revenueModel.getConfidence(
            p.clicks || 0,
            (revenueModel.getAssumptions()).min_clicks_for_estimate
        );

        return {
            product_name: p.product_name,
            current_route: 'direct_affiliate',
            recommended_route: sim.best_route,
            current_epc: sim.routes.direct_affiliate?.estimated_epc || 0,
            recommended_epc: sim.best_epc,
            uplift_pct: sim.potential_uplift,
            confidence,
            routes: sim.routes,
        };
    }).filter(r => r.uplift_pct > 0)
      .sort((a, b) => b.uplift_pct - a.uplift_pct);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function getStatus() {
    return {
        enabled: !!config.SMART_ROUTING_ENABLED,
        policy: policy.getStatus(),
        attribution: attribution.getStats(),
        route_multipliers: simulator.getRouteMultipliers(),
    };
}

module.exports = {
    chooseBestRoute,
    getSmartLink,
    getRoutingRecommendations,
    getStatus,
    buildAffiliateUrl,
    buildRouteUrl,
};
