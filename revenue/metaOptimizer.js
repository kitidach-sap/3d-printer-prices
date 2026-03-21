/**
 * Meta-Optimizer
 * 
 * Adjusts the system's own parameters based on observed performance:
 *   - boost limits (MAX_BOOST_MULTIPLIER)
 *   - confidence thresholds
 *   - cooldown timing
 *   - decay rate
 * 
 * Runs periodically and makes small, safe adjustments.
 */

const config = require('./config');
const monitoring = require('./monitoring');

let _lastAdjustment = 0;
const _adjustmentLog = [];

// ═══════════════════════════════════════════════════════════════════════════════
// META-OPTIMIZATION CYCLE
// ═══════════════════════════════════════════════════════════════════════════════

function optimize() {
    if (!config.META_OPTIMIZE_ENABLED) return { adjusted: false, reason: 'disabled' };

    const now = Date.now();
    if ((now - _lastAdjustment) < config.META_ADJUST_INTERVAL_MS && _lastAdjustment > 0) {
        return { adjusted: false, reason: 'too soon' };
    }
    _lastAdjustment = now;

    const monStatus = monitoring.getStatus();
    const trends = monStatus.trends || {};
    const adjustments = [];

    // 1. If clicks are improving, slightly increase boost limits to capitalize
    if (trends.total_clicks === 'improving') {
        const newMax = Math.min(2.0, config.MAX_COMBINED_WEIGHT + config.META_MAX_ADJUSTMENT);
        if (newMax !== config.MAX_COMBINED_WEIGHT) {
            adjustments.push({
                param: 'MAX_COMBINED_WEIGHT',
                from: config.MAX_COMBINED_WEIGHT,
                to: Math.round(newMax * 100) / 100,
                reason: 'Clicks improving — allow slightly higher boost ceiling',
            });
            config.MAX_COMBINED_WEIGHT = Math.round(newMax * 100) / 100;
        }
    }

    // 2. If clicks are degrading, reduce boost ceiling to be cautious
    if (trends.total_clicks === 'degrading') {
        const newMax = Math.max(1.1, config.MAX_COMBINED_WEIGHT - config.META_MAX_ADJUSTMENT);
        if (newMax !== config.MAX_COMBINED_WEIGHT) {
            adjustments.push({
                param: 'MAX_COMBINED_WEIGHT',
                from: config.MAX_COMBINED_WEIGHT,
                to: Math.round(newMax * 100) / 100,
                reason: 'Clicks degrading — reduce boost ceiling for safety',
            });
            config.MAX_COMBINED_WEIGHT = Math.round(newMax * 100) / 100;
        }
    }

    // 3. If avg_boost is too high, increase cooldown to slow down
    if (trends.avg_boost === 'degrading' || (monStatus.latest_snapshot?.avg_boost || 1) > 1.3) {
        const newCooldown = Math.min(14400000, config.COOLDOWN_PER_ENTITY_MS + 600000); // +10 min, max 4h
        if (newCooldown !== config.COOLDOWN_PER_ENTITY_MS) {
            adjustments.push({
                param: 'COOLDOWN_PER_ENTITY_MS',
                from: config.COOLDOWN_PER_ENTITY_MS,
                to: newCooldown,
                reason: 'High avg boost — increase cooldown to slow action rate',
            });
            config.COOLDOWN_PER_ENTITY_MS = newCooldown;
        }
    }

    // 4. If things are stable and healthy, slightly reduce cooldown to allow more agility
    if (monStatus.health === 'healthy' && trends.total_clicks !== 'degrading') {
        const newCooldown = Math.max(1800000, config.COOLDOWN_PER_ENTITY_MS - 300000); // -5 min, min 30min
        if (newCooldown !== config.COOLDOWN_PER_ENTITY_MS) {
            adjustments.push({
                param: 'COOLDOWN_PER_ENTITY_MS',
                from: config.COOLDOWN_PER_ENTITY_MS,
                to: newCooldown,
                reason: 'System healthy — reduce cooldown for faster optimization',
            });
            config.COOLDOWN_PER_ENTITY_MS = newCooldown;
        }
    }

    // 5. If system is degrading badly, reduce max actions per hour
    if (monStatus.health === 'critical') {
        const newMax = Math.max(3, config.MAX_ACTIONS_PER_HOUR - 2);
        if (newMax !== config.MAX_ACTIONS_PER_HOUR) {
            adjustments.push({
                param: 'MAX_ACTIONS_PER_HOUR',
                from: config.MAX_ACTIONS_PER_HOUR,
                to: newMax,
                reason: 'Critical health — reduce action rate',
            });
            config.MAX_ACTIONS_PER_HOUR = newMax;
        }
    }

    if (adjustments.length > 0) {
        _adjustmentLog.push({
            timestamp: new Date().toISOString(),
            health: monStatus.health,
            trends: { ...trends },
            adjustments,
        });
        while (_adjustmentLog.length > 100) _adjustmentLog.shift();
        console.log(`🔧 Meta-optimizer: ${adjustments.length} adjustments (${adjustments.map(a => a.param).join(', ')})`);
    }

    return { adjusted: adjustments.length > 0, adjustments, health: monStatus.health };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function getStatus() {
    return {
        enabled: config.META_OPTIMIZE_ENABLED,
        last_adjustment: _lastAdjustment ? new Date(_lastAdjustment).toISOString() : null,
        total_adjustments: _adjustmentLog.length,
        recent: [..._adjustmentLog].reverse().slice(0, 20),
        current_params: {
            MAX_COMBINED_WEIGHT: config.MAX_COMBINED_WEIGHT,
            MAX_ACTIONS_PER_HOUR: config.MAX_ACTIONS_PER_HOUR,
            COOLDOWN_PER_ENTITY_MS: config.COOLDOWN_PER_ENTITY_MS,
            MAX_BOOST_DELTA: config.MAX_BOOST_DELTA,
            DECAY_RATE: config.DECAY_RATE,
        },
    };
}

module.exports = { optimize, getStatus };
