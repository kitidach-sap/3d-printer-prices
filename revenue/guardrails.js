/**
 * KPI Guardrails
 * 
 * Enforces minimum performance thresholds.
 * Blocks actions that would violate guardrails.
 * Raises alerts when KPIs are breached.
 */

const config = require('./config');
const monitoring = require('./monitoring');

const _violations = [];

// ═══════════════════════════════════════════════════════════════════════════════
// GUARDRAIL CHECKS
// ═══════════════════════════════════════════════════════════════════════════════

function checkGuardrails(boostData) {
    if (!config.GUARDRAILS_ENABLED) return { passed: true, violations: [] };

    const violations = [];

    // 1. Boost concentration — no single product dominates
    const products = boostData.products || {};
    const totalBoost = Object.values(products).reduce((s, p) => s + (p.rank_weight || 1), 0);
    if (totalBoost > 0) {
        Object.entries(products).forEach(([name, p]) => {
            const share = (p.rank_weight || 1) / totalBoost;
            if (share > config.MAX_BOOST_CONCENTRATION) {
                violations.push({
                    type: 'boost_concentration',
                    severity: 'warning',
                    entity: name,
                    value: share,
                    threshold: config.MAX_BOOST_CONCENTRATION,
                    message: `"${name}" has ${(share * 100).toFixed(0)}% of total boost (max ${config.MAX_BOOST_CONCENTRATION * 100}%)`,
                    action: 'reduce_boost',
                });
            }
        });
    }

    // 2. Content diversity — enough active clusters
    const clusters = new Set();
    Object.keys(boostData.articles || {}).forEach(slug => {
        const parts = (slug || '').split('-');
        clusters.add(parts.slice(0, 2).join('-'));
    });
    if (clusters.size < config.MIN_CONTENT_DIVERSITY && Object.keys(boostData.articles || {}).length > 0) {
        violations.push({
            type: 'content_diversity',
            severity: 'warning',
            value: clusters.size,
            threshold: config.MIN_CONTENT_DIVERSITY,
            message: `Only ${clusters.size} active content clusters (min ${config.MIN_CONTENT_DIVERSITY})`,
            action: 'expand_content',
        });
    }

    // 3. Check against monitoring data for click rate
    const monStatus = monitoring.getStatus();
    const latest = monStatus.latest_snapshot;
    if (latest) {
        // Check if avg boost is getting too high (risk)
        if (latest.avg_boost > config.MAX_COMBINED_WEIGHT * 0.9) {
            violations.push({
                type: 'excessive_boost',
                severity: 'critical',
                value: latest.avg_boost,
                threshold: config.MAX_COMBINED_WEIGHT,
                message: `Average boost ${latest.avg_boost.toFixed(2)}x approaching cap ${config.MAX_COMBINED_WEIGHT}x`,
                action: 'reduce_boosts',
            });
        }
    }

    // Log violations
    if (violations.length > 0) {
        violations.forEach(v => {
            _violations.push({ ...v, timestamp: new Date().toISOString() });
        });
        while (_violations.length > 200) _violations.shift();

        monitoring.raiseAlert('guardrail_violation', violations.some(v => v.severity === 'critical') ? 'critical' : 'warning',
            `${violations.length} guardrail violation(s): ${violations.map(v => v.type).join(', ')}`,
            { violations });
    }

    return {
        passed: violations.length === 0,
        violations,
        checked_at: new Date().toISOString(),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-ACTION GATE — check before brain executes an action
// ═══════════════════════════════════════════════════════════════════════════════

function canExecuteAction(actionType, entity, proposedWeight, currentBoostData) {
    if (!config.GUARDRAILS_ENABLED) return { allowed: true };

    // Check if this action would violate concentration limit
    const products = { ...(currentBoostData?.products || {}) };
    if (actionType === 'product_boost') {
        products[entity] = { rank_weight: proposedWeight };
        const totalBoost = Object.values(products).reduce((s, p) => s + (p.rank_weight || 1), 0);
        const share = proposedWeight / totalBoost;

        if (share > config.MAX_BOOST_CONCENTRATION) {
            return {
                allowed: false,
                reason: `Would exceed concentration limit: ${(share * 100).toFixed(0)}% > ${config.MAX_BOOST_CONCENTRATION * 100}%`,
            };
        }
    }

    return { allowed: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function getStatus() {
    const recent = [..._violations].reverse().slice(0, 30);
    const active = recent.filter(v => (Date.now() - new Date(v.timestamp).getTime()) < 3600000);
    return {
        enabled: config.GUARDRAILS_ENABLED,
        total_violations: _violations.length,
        active_violations: active.length,
        recent_violations: recent,
        thresholds: {
            max_boost_concentration: config.MAX_BOOST_CONCENTRATION,
            min_content_diversity: config.MIN_CONTENT_DIVERSITY,
            min_click_rate_hourly: config.MIN_CLICK_RATE_HOURLY,
            max_decay_ratio: config.MAX_DECAY_RATIO,
        },
    };
}

module.exports = { checkGuardrails, canExecuteAction, getStatus };
