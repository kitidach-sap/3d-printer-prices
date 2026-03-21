/**
 * Routing Policy — Safety Rules and Constraints
 * 
 * Defines strict rules for when routing overrides are allowed.
 * Ensures safe, reversible, confidence-aware routing decisions.
 * 
 * Smart Routing Engine — Module 2
 */

const config = require('../revenue/config');

// ═══════════════════════════════════════════════════════════════════════════════
// POLICY CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

function getPolicy() {
    return {
        // Minimum confidence for routing override
        min_confidence: config.ROUTE_MIN_CONFIDENCE || 'medium',

        // Maximum % of traffic that can be routed (0–1)
        max_traffic_percentage: config.ROUTE_MAX_TRAFFIC_PCT || 0.20,

        // Per-product routing cooldown (ms)
        product_cooldown_ms: config.ROUTE_PRODUCT_COOLDOWN_MS || 60 * 60 * 1000, // 1 hour

        // Minimum uplift % required to justify routing change
        min_uplift_required: config.ROUTE_MIN_UPLIFT || 10, // 10% minimum improvement

        // Maximum routes per hour (rate limit)
        max_routes_per_hour: config.ROUTE_MAX_PER_HOUR || 100,

        // Campaign priority: if campaign is expiring, allow higher priority
        campaign_expiry_boost_days: config.CAMPAIGN_EXPIRY_BOOST_DAYS || 3,

        // Source-specific restrictions
        source_restrictions: {
            search: { prefer: ['compare_page', 'product_page'], avoid: [] },
            twitter: { prefer: ['article_page', 'product_page'], avoid: [] },
            direct: { prefer: ['direct_affiliate'], avoid: [] },
            referral: { prefer: ['compare_page'], avoid: [] },
        },

        // Routes that should not be used as overrides (can only be default)
        restricted_routes: [],
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATE TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

const _routeState = {
    routes_this_hour: 0,
    routes_by_product: {},   // { product_name: last_route_time }
    hour_start: Date.now(),
    total_requests: 0,
    routed_requests: 0,
};

function resetHourlyCounters() {
    const now = Date.now();
    if (now - _routeState.hour_start > 3600000) {
        _routeState.routes_this_hour = 0;
        _routeState.hour_start = now;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POLICY CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a routing override is allowed
 * @param {Object} params
 *   - product_name
 *   - source
 *   - confidence: 'low' | 'medium' | 'high'
 *   - uplift: number (% improvement)
 *   - route: proposed route
 * @returns {{ allowed: boolean, reasons: string[] }}
 */
function checkPolicy(params) {
    const policy = getPolicy();
    const reasons = [];
    resetHourlyCounters();

    // 1. Feature flag check
    if (!config.SMART_ROUTING_ENABLED) {
        return { allowed: false, reasons: ['SMART_ROUTING_ENABLED is OFF'] };
    }

    // 2. Confidence check
    const confLevels = { low: 1, medium: 2, high: 3 };
    const minConfLevel = confLevels[policy.min_confidence] || 2;
    const actualConfLevel = confLevels[params.confidence] || 1;
    if (actualConfLevel < minConfLevel) {
        reasons.push(`Confidence ${params.confidence} below minimum ${policy.min_confidence}`);
    }

    // 3. Uplift check
    if ((params.uplift || 0) < policy.min_uplift_required) {
        reasons.push(`Uplift ${params.uplift}% below minimum ${policy.min_uplift_required}%`);
    }

    // 4. Rate limit
    if (_routeState.routes_this_hour >= policy.max_routes_per_hour) {
        reasons.push(`Hourly rate limit reached (${policy.max_routes_per_hour})`);
    }

    // 5. Traffic percentage cap
    _routeState.total_requests++;
    const currentPct = _routeState.total_requests > 0
        ? _routeState.routed_requests / _routeState.total_requests : 0;
    if (currentPct > policy.max_traffic_percentage) {
        reasons.push(`Traffic cap reached (${(currentPct * 100).toFixed(1)}% > ${(policy.max_traffic_percentage * 100)}%)`);
    }

    // 6. Product cooldown
    const lastRouteTime = _routeState.routes_by_product[params.product_name] || 0;
    if (Date.now() - lastRouteTime < policy.product_cooldown_ms) {
        reasons.push(`Product cooldown active (${Math.round((policy.product_cooldown_ms - (Date.now() - lastRouteTime)) / 60000)}m remaining)`);
    }

    // 7. Restricted route check
    if (policy.restricted_routes.includes(params.route)) {
        reasons.push(`Route "${params.route}" is restricted`);
    }

    const allowed = reasons.length === 0;
    return { allowed, reasons };
}

/**
 * Record that a routing decision was made
 */
function recordRoute(productName) {
    resetHourlyCounters();
    _routeState.routes_this_hour++;
    _routeState.routed_requests++;
    _routeState.routes_by_product[productName] = Date.now();
}

/**
 * Get preferred routes for a source
 */
function getSourcePreferences(source) {
    const policy = getPolicy();
    const s = (source || 'direct').toLowerCase();
    for (const [key, pref] of Object.entries(policy.source_restrictions)) {
        if (s.includes(key)) return pref;
    }
    return { prefer: [], avoid: [] };
}

function getStatus() {
    resetHourlyCounters();
    return {
        policy: getPolicy(),
        state: {
            routes_this_hour: _routeState.routes_this_hour,
            total_requests: _routeState.total_requests,
            routed_requests: _routeState.routed_requests,
            traffic_pct: _routeState.total_requests > 0
                ? Math.round((_routeState.routed_requests / _routeState.total_requests) * 10000) / 100 : 0,
            cooldown_products: Object.keys(_routeState.routes_by_product).length,
        },
    };
}

module.exports = {
    checkPolicy,
    recordRoute,
    getSourcePreferences,
    getPolicy,
    getStatus,
};
