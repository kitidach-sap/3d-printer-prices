/**
 * Attribution — Monetization Decision Logging
 * 
 * Logs every routing/monetization decision for debugging and optimization.
 * Uses an in-memory ring buffer (no DB needed for Phase A/B).
 */

const MAX_LOG_SIZE = 500;

const _log = [];
let _counter = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// LOG A DECISION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log a monetization or routing decision
 * @param {Object} decision
 *   - type: 'route_choice' | 'recommendation' | 'simulation' | 'override'
 *   - product_name: string
 *   - source: string
 *   - context: string (page context: index/compare/product/blog)
 *   - route_chosen: string (direct_affiliate/campaign_link/compare_page/product_page/article_page)
 *   - simulated_values: { direct, campaign, compare, product, article }
 *   - confidence: 'low' | 'medium' | 'high'
 *   - reason: string
 *   - expected_uplift: number (% improvement over default)
 */
function logDecision(decision) {
    _counter++;
    const entry = {
        id: _counter,
        timestamp: new Date().toISOString(),
        ...decision,
    };

    _log.unshift(entry);
    if (_log.length > MAX_LOG_SIZE) _log.length = MAX_LOG_SIZE;

    return entry;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETRIEVE DECISIONS
// ═══════════════════════════════════════════════════════════════════════════════

function getDecisionLog(limit = 50) {
    return _log.slice(0, limit);
}

function getDecisionsByProduct(productName, limit = 20) {
    return _log.filter(d => d.product_name === productName).slice(0, limit);
}

function getDecisionsBySource(source, limit = 20) {
    return _log.filter(d => d.source === source).slice(0, limit);
}

function getDecisionsByRoute(route, limit = 20) {
    return _log.filter(d => d.route_chosen === route).slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICS
// ═══════════════════════════════════════════════════════════════════════════════

function getStats() {
    const routeCounts = {};
    const confidenceCounts = { low: 0, medium: 0, high: 0 };

    _log.forEach(d => {
        if (d.route_chosen) routeCounts[d.route_chosen] = (routeCounts[d.route_chosen] || 0) + 1;
        if (d.confidence) confidenceCounts[d.confidence]++;
    });

    return {
        total_decisions: _counter,
        logged_decisions: _log.length,
        route_distribution: routeCounts,
        confidence_distribution: confidenceCounts,
        last_decision: _log[0] || null,
    };
}

module.exports = {
    logDecision,
    getDecisionLog,
    getDecisionsByProduct,
    getDecisionsBySource,
    getDecisionsByRoute,
    getStats,
};
