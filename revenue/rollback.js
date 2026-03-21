/**
 * Auto-Rollback System
 * 
 * Detects harmful changes and reverts them automatically.
 * Monitors click performance after brain actions;
 * if a significant click drop is detected, identifies the likely culprit action
 * and reverts it via the action pipeline.
 */

const config = require('./config');
const pipeline = require('./actionPipeline');
const monitoring = require('./monitoring');

let _rollbacksThisHour = 0;
let _rollbackHourStart = Date.now();
const _rollbackLog = [];

// ═══════════════════════════════════════════════════════════════════════════════
// ROLLBACK EVALUATION — called after monitoring detects degradation
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateRollback() {
    if (!config.AUTO_ROLLBACK_ENABLED) return { triggered: false, reason: 'disabled' };

    // Rate limit rollbacks
    if (Date.now() - _rollbackHourStart > 3600000) {
        _rollbacksThisHour = 0;
        _rollbackHourStart = Date.now();
    }
    if (_rollbacksThisHour >= config.MAX_ROLLBACKS_PER_HOUR) {
        return { triggered: false, reason: 'max rollbacks/hour reached' };
    }

    const monitorStatus = monitoring.getStatus();

    // Only rollback if health is critical or click metrics degrading
    if (monitorStatus.health === 'healthy') return { triggered: false, reason: 'system healthy' };

    const isDegrading = monitorStatus.degrading_metrics.includes('total_clicks');
    if (!isDegrading) return { triggered: false, reason: 'clicks not degrading' };

    // Find recent brain actions that might be the culprit
    const recentActions = pipeline.getHistory(config.ROLLBACK_LOOKBACK_ACTIONS);
    const unrevertedActions = recentActions.filter(a => !a.reverted);

    if (unrevertedActions.length === 0) return { triggered: false, reason: 'no recent actions to rollback' };

    // Rollback the most recent unreverted action
    const culprit = unrevertedActions[0];
    const result = pipeline.revertAction(culprit.id);

    if (result.ok) {
        _rollbacksThisHour++;
        const entry = {
            timestamp: new Date().toISOString(),
            action_id: culprit.id,
            type: culprit.type,
            entity: culprit.entity,
            reason: `Auto-rollback: click degradation detected`,
            health_at_time: monitorStatus.health,
            degrading: monitorStatus.degrading_metrics,
        };
        _rollbackLog.push(entry);
        while (_rollbackLog.length > 100) _rollbackLog.shift();

        monitoring.raiseAlert('auto_rollback', 'warning',
            `Auto-rolled back action #${culprit.id} (${culprit.type} on ${culprit.entity})`,
            { action: culprit, entry });

        console.log(`⏪ Auto-rollback: reverted action #${culprit.id} (${culprit.type} → ${culprit.entity})`);
        return { triggered: true, action: culprit, result };
    }

    return { triggered: false, reason: 'revert failed', error: result.error };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function getStatus() {
    return {
        enabled: config.AUTO_ROLLBACK_ENABLED,
        rollbacks_this_hour: _rollbacksThisHour,
        max_rollbacks_per_hour: config.MAX_ROLLBACKS_PER_HOUR,
        total_rollbacks: _rollbackLog.length,
        recent: [..._rollbackLog].reverse().slice(0, 20),
        thresholds: {
            click_drop: config.ROLLBACK_CLICK_DROP_THRESHOLD,
            lookback_actions: config.ROLLBACK_LOOKBACK_ACTIONS,
        },
    };
}

module.exports = { evaluateRollback, getStatus };
