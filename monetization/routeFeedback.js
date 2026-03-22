/**
 * Route Feedback Loop — Tracks route → click → compare → next action chains
 * 
 * Logs the full user journey after a routing decision:
 *   route_chosen → outbound_click → [compare_view] → [next_action]
 * 
 * Feeds into monetization scoring and scaling engine.
 * In-memory ring buffer with aggregated stats per route × source.
 */

const MAX_FEEDBACK_LOG = 1000;

// ═══════════════════════════════════════════════════════════════════════════════
// FEEDBACK STORE
// ═══════════════════════════════════════════════════════════════════════════════

const _feedbackLog = [];           // ring buffer of individual events
let _feedbackCounter = 0;

// Aggregated stats: route × source → { impressions, clicks, compares, conversions }
const _routeStats = {};            // key: `${route}:${source}`

function _statsKey(route, source) {
    return `${route || 'direct_affiliate'}:${source || 'direct'}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOG EVENTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log a feedback event in the route journey
 * @param {Object} event
 *   - session_id: string
 *   - product_id: string
 *   - product_name: string
 *   - route: string (route that was chosen)
 *   - source: string (traffic source)
 *   - action: 'impression' | 'click' | 'compare_view' | 'product_view' | 'outbound_click' | 'bounce'
 *   - page: string (page context)
 *   - metadata: any extra info
 */
function logFeedback(event) {
    _feedbackCounter++;
    const entry = {
        id: _feedbackCounter,
        timestamp: new Date().toISOString(),
        session_id: event.session_id,
        product_id: event.product_id,
        product_name: event.product_name || '',
        route: event.route || 'direct_affiliate',
        source: event.source || 'direct',
        action: event.action || 'impression',
        page: event.page || 'unknown',
        metadata: event.metadata || null,
    };

    _feedbackLog.unshift(entry);
    if (_feedbackLog.length > MAX_FEEDBACK_LOG) _feedbackLog.length = MAX_FEEDBACK_LOG;

    // Update aggregated stats
    _updateStats(entry.route, entry.source, entry.action);

    return entry;
}

function _updateStats(route, source, action) {
    const key = _statsKey(route, source);
    if (!_routeStats[key]) {
        _routeStats[key] = {
            route, source,
            impressions: 0,
            clicks: 0,
            compare_views: 0,
            product_views: 0,
            outbound_clicks: 0,
            bounces: 0,
        };
    }
    const s = _routeStats[key];
    switch (action) {
        case 'impression': s.impressions++; break;
        case 'click': s.clicks++; break;
        case 'compare_view': s.compare_views++; break;
        case 'product_view': s.product_views++; break;
        case 'outbound_click': s.outbound_clicks++; break;
        case 'bounce': s.bounces++; break;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOURNEY RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the full journey for a session + product
 * Returns ordered list of actions taken
 */
function getJourney(sessionId, productId) {
    return _feedbackLog
        .filter(e => e.session_id === sessionId && e.product_id === productId)
        .reverse(); // chronological order
}

/**
 * Get journeys that resulted in an outbound click (success)
 */
function getSuccessfulJourneys(limit = 20) {
    const sessions = new Set();
    const successes = _feedbackLog.filter(e => e.action === 'outbound_click');
    
    return successes.slice(0, limit).map(s => ({
        session_id: s.session_id,
        product_id: s.product_id,
        route: s.route,
        source: s.source,
        journey: getJourney(s.session_id, s.product_id),
    }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE PERFORMANCE STATS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get aggregated stats per route
 */
function getRoutePerformance() {
    // Aggregate by route (across all sources)
    const byRoute = {};
    Object.values(_routeStats).forEach(s => {
        if (!byRoute[s.route]) {
            byRoute[s.route] = { route: s.route, impressions: 0, clicks: 0, compare_views: 0, outbound_clicks: 0, bounces: 0 };
        }
        const r = byRoute[s.route];
        r.impressions += s.impressions;
        r.clicks += s.clicks;
        r.compare_views += s.compare_views;
        r.outbound_clicks += s.outbound_clicks;
        r.bounces += s.bounces;
    });

    // Calculate click-through rates
    return Object.values(byRoute).map(r => ({
        ...r,
        ctr: r.impressions > 0 ? Math.round((r.clicks / r.impressions) * 10000) / 100 : 0,
        outbound_rate: r.clicks > 0 ? Math.round((r.outbound_clicks / r.clicks) * 10000) / 100 : 0,
        bounce_rate: r.clicks > 0 ? Math.round((r.bounces / r.clicks) * 10000) / 100 : 0,
    })).sort((a, b) => b.outbound_rate - a.outbound_rate);
}

/**
 * Get raw stats per route × source combo
 */
function getDetailedStats() {
    return Object.values(_routeStats).sort((a, b) => b.outbound_clicks - a.outbound_clicks);
}

/**
 * Get feedback log entries
 */
function getFeedbackLog(limit = 50) {
    return _feedbackLog.slice(0, limit);
}

function getStats() {
    return {
        total_events: _feedbackCounter,
        logged_events: _feedbackLog.length,
        route_source_combos: Object.keys(_routeStats).length,
    };
}

module.exports = {
    logFeedback,
    getJourney,
    getSuccessfulJourneys,
    getRoutePerformance,
    getDetailedStats,
    getFeedbackLog,
    getStats,
};
