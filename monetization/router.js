/**
 * Smart Router — Core Routing Engine + Safe Link Wrapper
 * 
 * v2: Route Lock, Fallback Hierarchy, Feedback Loop, Session Stability
 * 
 * Selects the highest-value destination for each click.
 * Wraps all outbound links with intelligent routing.
 */

const config = require('../revenue/config');
const simulator = require('./routeSimulator');
const policy = require('./routingPolicy');
const attribution = require('./attribution');
const revenueModel = require('./revenueModel');
const routeLock = require('./routeLock');
const routeFeedback = require('./routeFeedback');
const abTest = require('./abTest');

const AFFILIATE_TAG = 'kiti09-20';

// ═══════════════════════════════════════════════════════════════════════════════
// FALLBACK HIERARCHY — ordered by expected value
// ═══════════════════════════════════════════════════════════════════════════════

const FALLBACK_ORDER = [
    'campaign_link',     // highest rev if available
    'direct_affiliate',  // baseline safe option
    'compare_page',      // high-intent funnel
    'product_page',      // informational funnel
];

/**
 * Walk the fallback chain until we find a viable route
 */
function resolveFallback(product, context) {
    for (const route of FALLBACK_ORDER) {
        const url = buildRouteUrl(route, product, context);
        if (route === 'campaign_link' && !context.campaign_available) continue;
        if (url && url !== '#') return { route, url };
    }
    return { route: 'direct_affiliate', url: buildAffiliateUrl(product.amazon_url || product.amazon_asin) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE CHOOSER (v2 — with lock + stability + fallback)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Choose the best route for a product/source/context
 * Respects:
 *  - Route Lock (session persistence)
 *  - Route Stability (no mid-session switching)
 *  - Fallback Hierarchy (ordered fallback on failure)
 *  - Policy + safety gates
 *
 * @param {Object} product - { id, product_name, price, clicks, compare_count, amazon_url }
 * @param {string} source
 * @param {Object} context - { page, campaign_available, campaign_url, session_id }
 * @returns {Object} { route, url, reason, confidence, uplift, locked, overridden }
 */
function chooseBestRoute(product, source, context = {}) {
    const productId = product.id || product.product_id || product.product_name || '';
    const sessionId = context.session_id || 'server';
    const defaultFallback = resolveFallback(product, context);

    const baseResult = {
        route: defaultFallback.route,
        url: defaultFallback.url,
        reason: 'fallback',
        confidence: 'low',
        uplift: 0,
        overridden: false,
        locked: false,
    };

    // ── 0. Feature flag check ──
    if (!config.SMART_ROUTING_ENABLED) {
        return baseResult;
    }

    try {
        // ── 1. Route Lock — check if route already locked for this session+product ──
        const locked = routeLock.getLockedRoute(sessionId, productId);
        if (locked) {
            // Log an impression in the feedback loop
            routeFeedback.logFeedback({
                session_id: sessionId,
                product_id: productId,
                product_name: product.product_name,
                route: locked.route,
                source,
                action: 'impression',
                page: context.page,
                metadata: { locked: true },
            });

            return {
                route: locked.route,
                url: locked.url,
                reason: 'locked (session-stable)',
                confidence: locked.confidence,
                uplift: 0,
                overridden: locked.route !== 'direct_affiliate',
                locked: true,
            };
        }

        // ── 2. A/B Test — check if experiment overrides routing ──
        const abOverride = abTest.getRouteOverride(sessionId);
        if (abOverride && abOverride.route_override) {
            const overrideUrl = buildRouteUrl(abOverride.route_override, product, context);
            if (overrideUrl && overrideUrl !== '#') {
                // Track A/B impression
                abTest.trackEvent(abOverride.experiment_id, abOverride.variant_id, 'impression', { product_id: productId });

                // Lock the A/B route for session stability
                routeLock.lockRoute(sessionId, productId, abOverride.route_override, overrideUrl, {
                    source, confidence: 'medium',
                });

                routeFeedback.logFeedback({
                    session_id: sessionId,
                    product_id: productId,
                    product_name: product.product_name,
                    route: abOverride.route_override,
                    source,
                    action: 'impression',
                    page: context.page,
                    metadata: { ab_test: abOverride.experiment_id, variant: abOverride.variant_id },
                });

                return {
                    route: abOverride.route_override,
                    url: overrideUrl,
                    reason: `A/B test: ${abOverride.variant_name}`,
                    confidence: 'medium',
                    uplift: 0,
                    overridden: abOverride.route_override !== 'direct_affiliate',
                    locked: false,
                    ab_test: { experiment_id: abOverride.experiment_id, variant_id: abOverride.variant_id },
                };
            }
        }
        // If A/B test says null route_override → use normal routing (but still track)
        if (abOverride) {
            abTest.trackEvent(abOverride.experiment_id, abOverride.variant_id, 'impression', { product_id: productId });
        }

        // ── 3. Simulate all routes ──
        const sim = simulator.simulateRoutes(product, source, context);

        // ── 3. Confidence from data volume ──
        const confidence = revenueModel.getConfidence(
            product.clicks || 0,
            (revenueModel.getAssumptions()).min_clicks_for_estimate
        );

        // ── 4. Policy gate (confidence, uplift, rate limit, cooldown, traffic cap) ──
        const policyCheck = policy.checkPolicy({
            product_name: product.product_name,
            source,
            confidence,
            uplift: sim.potential_uplift,
            route: sim.best_route,
        });

        if (!policyCheck.allowed) {
            // Use fallback hierarchy instead of hard "direct_affiliate"
            attribution.logDecision({
                type: 'route_blocked',
                product_name: product.product_name,
                source,
                context: context.page,
                route_chosen: defaultFallback.route,
                simulated_best: sim.best_route,
                confidence,
                reason: policyCheck.reasons.join('; '),
                expected_uplift: sim.potential_uplift,
            });

            // Lock the fallback so the user doesn't see flip-flopping
            routeLock.lockRoute(sessionId, productId, defaultFallback.route, defaultFallback.url, {
                source, confidence: 'low',
            });

            return baseResult;
        }

        // ── 5. Build URL for chosen route (with fallback on failure) ──
        const chosenRoute = sim.best_route;
        let url = buildRouteUrl(chosenRoute, product, context);
        let finalRoute = chosenRoute;

        // If the chosen route URL is empty/invalid, walk fallback chain
        if (!url || url === '#') {
            const fb = resolveFallback(product, context);
            url = fb.url;
            finalRoute = fb.route;
        }

        // ── 6. Record + lock ──
        policy.recordRoute(product.product_name);
        routeLock.lockRoute(sessionId, productId, finalRoute, url, {
            source, confidence,
        });

        // ── 7. Attribution log ──
        attribution.logDecision({
            type: 'route_choice',
            product_name: product.product_name,
            source,
            context: context.page,
            route_chosen: finalRoute,
            simulated_values: Object.fromEntries(
                Object.entries(sim.routes).map(([k, v]) => [k, v.estimated_epc])
            ),
            confidence,
            reason: `Best EPC: $${sim.best_epc} (${finalRoute})`,
            expected_uplift: sim.potential_uplift,
        });

        // ── 8. Feedback impression ──
        routeFeedback.logFeedback({
            session_id: sessionId,
            product_id: productId,
            product_name: product.product_name,
            route: finalRoute,
            source,
            action: 'impression',
            page: context.page,
        });

        return {
            route: finalRoute,
            url,
            reason: `Best EPC: $${sim.best_epc.toFixed(4)} (+${sim.potential_uplift.toFixed(1)}%)`,
            confidence,
            uplift: sim.potential_uplift,
            overridden: finalRoute !== 'direct_affiliate',
            locked: false, // first choice, not locked yet (will be locked next time)
            simulated: sim.routes,
        };
    } catch (err) {
        // Absolute safety — fallback hierarchy
        return baseResult;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SAFE LINK WRAPPER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the smartest link for a product. Safe wrapper:
 * - returns fallback if routing disabled
 * - returns locked route if available
 * - returns chosen route if enabled + policy allows
 * - never returns a broken link
 */
function getSmartLink(product, source, context = {}) {
    if (!config.SMART_ROUTING_ENABLED) {
        return buildAffiliateUrl(product.amazon_url || product.amazon_asin);
    }

    const result = chooseBestRoute(product, source, context);
    return result.url || buildAffiliateUrl(product.amazon_url || product.amazon_asin);
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEEDBACK INTEGRATION — log user actions back into the loop
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record a user action that happened after routing
 * Called by the events API when clicks/views come in
 */
function recordUserAction(sessionId, productId, productName, action, source, page) {
    // Look up what route was used for this session+product
    const locked = routeLock.getLockedRoute(sessionId, productId);
    const route = locked ? locked.route : 'direct_affiliate';

    routeFeedback.logFeedback({
        session_id: sessionId,
        product_id: productId,
        product_name: productName,
        route,
        source,
        action,
        page,
    });
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
            return context.article_url || `/blog/`;

        default:
            return buildAffiliateUrl(product.amazon_url || product.amazon_asin);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH ROUTING RECOMMENDATIONS (admin view)
// ═══════════════════════════════════════════════════════════════════════════════

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
// STATUS (v2)
// ═══════════════════════════════════════════════════════════════════════════════

function getStatus() {
    return {
        enabled: !!config.SMART_ROUTING_ENABLED,
        policy: policy.getStatus(),
        attribution: attribution.getStats(),
        route_multipliers: simulator.getRouteMultipliers(),
        route_lock: routeLock.getStatus(),
        feedback: routeFeedback.getStats(),
        fallback_order: FALLBACK_ORDER,
    };
}

module.exports = {
    chooseBestRoute,
    getSmartLink,
    getRoutingRecommendations,
    getStatus,
    buildAffiliateUrl,
    buildRouteUrl,
    recordUserAction,
    // Expose sub-modules for API layer
    routeLock,
    routeFeedback,
    abTest,
};
