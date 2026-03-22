/**
 * A/B Testing Framework — Routing Experiment Engine
 * 
 * Manages experiments on routing strategies:
 *   - Define experiments with variants (control + treatment)
 *   - Deterministic variant assignment per session (hash-based)
 *   - Track impressions, clicks, outbound clicks per variant
 *   - Statistical significance testing (chi-square)
 *   - Auto-promote winning variants when confidence threshold met
 * 
 * In-memory store with ring buffer for experiment history.
 */

const config = require('../revenue/config');

// ═══════════════════════════════════════════════════════════════════════════════
// EXPERIMENT STORE
// ═══════════════════════════════════════════════════════════════════════════════

const _experiments = {};   // id → experiment object
const _history = [];       // completed/promoted experiments
const MAX_HISTORY = 100;

// ═══════════════════════════════════════════════════════════════════════════════
// SEED EXPERIMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// Pre-defined routing experiments
const SEED_EXPERIMENTS = [
    {
        id: 'route_strategy_v1',
        name: 'Routing Strategy: Smart vs Direct',
        description: 'Test smart routing against always-direct-affiliate baseline',
        status: 'active',
        variants: [
            { id: 'control', name: 'Direct Affiliate Only', weight: 50, route_override: 'direct_affiliate' },
            { id: 'treatment', name: 'Smart Routing (AI)', weight: 50, route_override: null }, // null = use router logic
        ],
        metric: 'outbound_click_rate',  // primary success metric
        min_sample_size: 100,           // min impressions per variant before analysis
        confidence_threshold: 0.95,     // 95% confidence to auto-promote
        auto_promote: true,
        created_at: new Date().toISOString(),
    },
    {
        id: 'compare_vs_direct',
        name: 'Compare Page vs Direct Link',
        description: 'Test if routing to compare page increases conversions',
        status: 'paused',
        variants: [
            { id: 'control', name: 'Direct Affiliate', weight: 50, route_override: 'direct_affiliate' },
            { id: 'treatment', name: 'Compare Page', weight: 50, route_override: 'compare_page' },
        ],
        metric: 'outbound_click_rate',
        min_sample_size: 200,
        confidence_threshold: 0.95,
        auto_promote: true,
        created_at: new Date().toISOString(),
    },
    {
        id: 'campaign_priority',
        name: 'Campaign Link Priority',
        description: 'Test if prioritizing campaign links over direct affiliate improves revenue',
        status: 'paused',
        variants: [
            { id: 'control', name: 'Standard Routing', weight: 50, route_override: null },
            { id: 'treatment', name: 'Campaign First', weight: 50, route_override: 'campaign_link' },
        ],
        metric: 'outbound_click_rate',
        min_sample_size: 150,
        confidence_threshold: 0.95,
        auto_promote: true,
        created_at: new Date().toISOString(),
    },
];

// Initialize seed experiments
function _initSeeds() {
    SEED_EXPERIMENTS.forEach(exp => {
        if (!_experiments[exp.id]) {
            _experiments[exp.id] = {
                ...exp,
                stats: {},
            };
            // Initialize stats for each variant
            exp.variants.forEach(v => {
                _experiments[exp.id].stats[v.id] = {
                    impressions: 0,
                    clicks: 0,
                    outbound_clicks: 0,
                    bounces: 0,
                    total_products: 0,
                };
            });
        }
    });
}
_initSeeds();

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT ASSIGNMENT (deterministic hash-based)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple FNV-1a hash for deterministic assignment
 */
function _hash(str) {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i);
        hash = (hash * 16777619) >>> 0;
    }
    return hash;
}

/**
 * Assign a session to a variant deterministically
 * Same session always gets same variant (consistent experience)
 */
function assignVariant(experimentId, sessionId) {
    const exp = _experiments[experimentId];
    if (!exp || exp.status !== 'active') return null;

    const key = `${experimentId}:${sessionId}`;
    const hashVal = _hash(key);
    
    // Weighted assignment
    const totalWeight = exp.variants.reduce((sum, v) => sum + v.weight, 0);
    const bucket = hashVal % totalWeight;
    
    let cumulative = 0;
    for (const variant of exp.variants) {
        cumulative += variant.weight;
        if (bucket < cumulative) {
            return variant;
        }
    }
    
    return exp.variants[0]; // fallback to first
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTING INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get A/B test route override for the current session (if any)
 * Called by router before choosing a route.
 * 
 * @returns {Object|null} { experiment_id, variant_id, route_override } or null
 */
function getRouteOverride(sessionId) {
    if (!config.AB_TESTING_ENABLED) return null;

    // Find first active experiment
    for (const exp of Object.values(_experiments)) {
        if (exp.status !== 'active') continue;

        const variant = assignVariant(exp.id, sessionId);
        if (!variant) continue;

        return {
            experiment_id: exp.id,
            variant_id: variant.id,
            variant_name: variant.name,
            route_override: variant.route_override, // null = use normal routing
        };
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Record an event for a specific experiment + variant
 * @param {string} experimentId
 * @param {string} variantId
 * @param {string} action - 'impression' | 'click' | 'outbound_click' | 'bounce'
 * @param {Object} meta - { product_id, source, etc. }
 */
function trackEvent(experimentId, variantId, action, meta = {}) {
    const exp = _experiments[experimentId];
    if (!exp || !exp.stats[variantId]) return;

    const stats = exp.stats[variantId];
    switch (action) {
        case 'impression': stats.impressions++; break;
        case 'click': stats.clicks++; break;
        case 'outbound_click': stats.outbound_clicks++; break;
        case 'bounce': stats.bounces++; break;
    }
    if (meta.product_id) stats.total_products++;
    
    // Auto-check for promotion after enough data
    _checkAutoPromote(experimentId);
}

/**
 * Track from session context (auto-detect experiment+variant)
 */
function trackFromSession(sessionId, action, meta = {}) {
    if (!config.AB_TESTING_ENABLED) return;

    for (const exp of Object.values(_experiments)) {
        if (exp.status !== 'active') continue;
        const variant = assignVariant(exp.id, sessionId);
        if (variant) {
            trackEvent(exp.id, variant.id, action, meta);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATISTICAL ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Chi-square test for independence (2×2 contingency table)
 * Tests if the difference between variants is statistically significant
 */
function _chiSquareP(observed, expected) {
    if (expected === 0) return 0;
    return ((observed - expected) ** 2) / expected;
}

function analyzeExperiment(experimentId) {
    const exp = _experiments[experimentId];
    if (!exp) return null;

    const variants = exp.variants.map(v => {
        const stats = exp.stats[v.id];
        const impressions = stats.impressions || 0;
        const successes = stats[exp.metric === 'outbound_click_rate' ? 'outbound_clicks' : 'clicks'] || 0;
        const rate = impressions > 0 ? successes / impressions : 0;

        return {
            id: v.id,
            name: v.name,
            impressions,
            successes,
            rate: Math.round(rate * 10000) / 100, // e.g., 12.34%
            route_override: v.route_override,
        };
    });

    // Check if we have enough data
    const hasEnoughData = variants.every(v => v.impressions >= exp.min_sample_size);

    // Chi-square test (only with 2 variants)
    let significance = 0;
    let winner = null;
    let confidence = 'low';

    if (variants.length === 2 && hasEnoughData) {
        const [a, b] = variants;
        const totalSuccesses = a.successes + b.successes;
        const totalImpressions = a.impressions + b.impressions;
        const expectedRate = totalImpressions > 0 ? totalSuccesses / totalImpressions : 0;

        const expectedA = a.impressions * expectedRate;
        const expectedAFail = a.impressions * (1 - expectedRate);
        const expectedB = b.impressions * expectedRate;
        const expectedBFail = b.impressions * (1 - expectedRate);

        const chiSq =
            _chiSquareP(a.successes, expectedA) +
            _chiSquareP(a.impressions - a.successes, expectedAFail) +
            _chiSquareP(b.successes, expectedB) +
            _chiSquareP(b.impressions - b.successes, expectedBFail);

        // Chi-square to p-value approximation (1 degree of freedom)
        // χ² > 3.84 → p < 0.05
        // χ² > 6.63 → p < 0.01
        // χ² > 10.83 → p < 0.001
        if (chiSq >= 10.83) significance = 0.999;
        else if (chiSq >= 6.63) significance = 0.99;
        else if (chiSq >= 3.84) significance = 0.95;
        else if (chiSq >= 2.71) significance = 0.90;
        else significance = Math.min(chiSq / 3.84 * 0.90, 0.89);

        // Determine winner
        const bestVariant = a.rate >= b.rate ? a : b;
        const liftPct = Math.abs(a.rate - b.rate);

        if (significance >= exp.confidence_threshold) {
            winner = bestVariant.id;
            confidence = 'high';
        } else if (significance >= 0.90) {
            confidence = 'medium';
        }

        return {
            experiment_id: exp.id,
            name: exp.name,
            status: exp.status,
            metric: exp.metric,
            variants,
            chi_square: Math.round(chiSq * 1000) / 1000,
            significance: Math.round(significance * 1000) / 10,  // e.g., 95.0%
            winner,
            winner_name: winner ? variants.find(v => v.id === winner)?.name : null,
            lift_pct: Math.round(liftPct * 100) / 100,
            confidence,
            has_enough_data: hasEnoughData,
            min_sample_size: exp.min_sample_size,
            auto_promote: exp.auto_promote,
        };
    }

    return {
        experiment_id: exp.id,
        name: exp.name,
        status: exp.status,
        metric: exp.metric,
        variants,
        chi_square: 0,
        significance: 0,
        winner: null,
        winner_name: null,
        lift_pct: 0,
        confidence: 'low',
        has_enough_data: hasEnoughData,
        min_sample_size: exp.min_sample_size,
        auto_promote: exp.auto_promote,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-PROMOTION
// ═══════════════════════════════════════════════════════════════════════════════

function _checkAutoPromote(experimentId) {
    const exp = _experiments[experimentId];
    if (!exp || !exp.auto_promote || exp.status !== 'active') return;

    const analysis = analyzeExperiment(experimentId);
    if (!analysis || !analysis.winner || analysis.confidence !== 'high') return;

    // Promote the winner
    promoteVariant(experimentId, analysis.winner, 'auto');
}

/**
 * Promote a winning variant — end experiment and apply winner as default
 * @param {string} experimentId
 * @param {string} variantId
 * @param {string} promotedBy - 'auto' | 'admin'
 */
function promoteVariant(experimentId, variantId, promotedBy = 'admin') {
    const exp = _experiments[experimentId];
    if (!exp) return null;

    const analysis = analyzeExperiment(experimentId);
    
    exp.status = 'completed';
    exp.completed_at = new Date().toISOString();
    exp.winner = variantId;
    exp.promoted_by = promotedBy;
    exp.final_analysis = analysis;

    // Archive to history
    _history.unshift({ ...exp });
    if (_history.length > MAX_HISTORY) _history.length = MAX_HISTORY;

    return {
        promoted: true,
        experiment: exp.name,
        winner: variantId,
        winner_name: exp.variants.find(v => v.id === variantId)?.name,
        route_override: exp.variants.find(v => v.id === variantId)?.route_override,
        promoted_by: promotedBy,
        significance: analysis?.significance,
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPERIMENT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

function createExperiment(data) {
    const id = data.id || 'exp_' + Date.now();
    if (_experiments[id]) return { error: 'Experiment already exists' };

    _experiments[id] = {
        id,
        name: data.name || 'Unnamed Experiment',
        description: data.description || '',
        status: data.status || 'paused',
        variants: data.variants || [
            { id: 'control', name: 'Control', weight: 50, route_override: 'direct_affiliate' },
            { id: 'treatment', name: 'Treatment', weight: 50, route_override: null },
        ],
        metric: data.metric || 'outbound_click_rate',
        min_sample_size: data.min_sample_size || 100,
        confidence_threshold: data.confidence_threshold || 0.95,
        auto_promote: data.auto_promote !== false,
        created_at: new Date().toISOString(),
        stats: {},
    };

    // Initialize stats
    _experiments[id].variants.forEach(v => {
        _experiments[id].stats[v.id] = {
            impressions: 0, clicks: 0, outbound_clicks: 0, bounces: 0, total_products: 0,
        };
    });

    return _experiments[id];
}

function updateExperimentStatus(experimentId, status) {
    const exp = _experiments[experimentId];
    if (!exp) return null;
    if (!['active', 'paused', 'completed'].includes(status)) return null;
    exp.status = status;
    if (status === 'active') exp.activated_at = new Date().toISOString();
    return exp;
}

function resetExperiment(experimentId) {
    const exp = _experiments[experimentId];
    if (!exp) return null;
    exp.variants.forEach(v => {
        exp.stats[v.id] = {
            impressions: 0, clicks: 0, outbound_clicks: 0, bounces: 0, total_products: 0,
        };
    });
    exp.status = 'paused';
    exp.winner = null;
    exp.completed_at = null;
    exp.promoted_by = null;
    exp.final_analysis = null;
    return exp;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function listExperiments() {
    return Object.values(_experiments).map(exp => ({
        id: exp.id,
        name: exp.name,
        status: exp.status,
        variants: exp.variants.length,
        metric: exp.metric,
        auto_promote: exp.auto_promote,
        winner: exp.winner || null,
    }));
}

function getExperiment(experimentId) {
    const exp = _experiments[experimentId];
    if (!exp) return null;
    return {
        ...exp,
        analysis: analyzeExperiment(experimentId),
    };
}

function getHistory() {
    return _history.slice(0, 50);
}

function getStatus() {
    const active = Object.values(_experiments).filter(e => e.status === 'active').length;
    const completed = Object.values(_experiments).filter(e => e.status === 'completed').length;
    return {
        enabled: !!config.AB_TESTING_ENABLED,
        total: Object.keys(_experiments).length,
        active,
        completed,
        history_count: _history.length,
    };
}

module.exports = {
    getRouteOverride,
    assignVariant,
    trackEvent,
    trackFromSession,
    analyzeExperiment,
    promoteVariant,
    createExperiment,
    updateExperimentStatus,
    resetExperiment,
    listExperiments,
    getExperiment,
    getHistory,
    getStatus,
};
