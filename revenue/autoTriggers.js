/**
 * Auto-Scaling Triggers
 * 
 * Reads prediction data (revenue forecasts, risks, allocations, investments)
 * and automatically triggers scaling actions:
 * - Auto-boost star products
 * - Auto-reduce exposure for declining products
 * - Auto-queue content for high-click products
 * - Auto-adjust channel focus
 * - Auto-respond to risk alerts
 * 
 * Safety: dry-run by default, rate-limited, logged, reversible
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TRIGGER RULES
// ═══════════════════════════════════════════════════════════════════════════════

const TRIGGER_RULES = [
    {
        id: 'boost_star_products',
        name: 'Auto-Boost Star Products',
        description: 'Boost products with star investment tier',
        condition: (ctx) => {
            const stars = (ctx.investment?.investments || []).filter(i => i.tier === 'star');
            return stars.length > 0 ? stars : null;
        },
        action: 'boost',
        severity: 'low',
        cooldown_minutes: 60,
    },
    {
        id: 'reduce_declining_products',
        name: 'Reduce Declining Exposure',
        description: 'Reduce boost for products with declining revenue',
        condition: (ctx) => {
            const declining = (ctx.predictions?.products || []).filter(p => p.trend === 'declining' && p.change_pct < -30);
            return declining.length > 0 ? declining : null;
        },
        action: 'reduce_exposure',
        severity: 'medium',
        cooldown_minutes: 120,
    },
    {
        id: 'content_for_high_click',
        name: 'Queue Content for High-Click Products',
        description: 'Auto-queue blog content for rising products',
        condition: (ctx) => {
            const rising = (ctx.predictions?.products || []).filter(p => p.trend === 'rising' && p.predicted_weekly > 0.5);
            return rising.length > 0 ? rising.slice(0, 3) : null;
        },
        action: 'queue_content',
        severity: 'low',
        cooldown_minutes: 360,
    },
    {
        id: 'respond_critical_risk',
        name: 'Respond to Critical Risks',
        description: 'Auto-reduce exposure for critical risk products',
        condition: (ctx) => {
            const critical = (ctx.risks?.risks || []).filter(r => r.severity === 'critical' && r.entity === 'product');
            return critical.length > 0 ? critical : null;
        },
        action: 'risk_response',
        severity: 'high',
        cooldown_minutes: 30,
    },
    {
        id: 'scale_high_epc_channel',
        name: 'Scale High-EPC Channel',
        description: 'Increase investment in channel with highest efficiency',
        condition: (ctx) => {
            const top = (ctx.allocation?.channels || []).find(c => c.efficiency_score >= 60 && c.allocation_pct >= 25);
            return top || null;
        },
        action: 'scale_channel',
        severity: 'low',
        cooldown_minutes: 1440, // daily
    },
    {
        id: 'pause_negative_roi',
        name: 'Pause Negative ROI Channels',
        description: 'Flag channels with negative ROI for review',
        condition: (ctx) => {
            const bad = (ctx.allocation?.channels || []).filter(c => c.roi < -20);
            return bad.length > 0 ? bad : null;
        },
        action: 'flag_review',
        severity: 'high',
        cooldown_minutes: 1440,
    },
];

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTION LOG + COOLDOWN
// ═══════════════════════════════════════════════════════════════════════════════

const _triggerLog = [];
const _cooldowns = {};
const MAX_LOG = 200;

function isCooldownActive(ruleId, cooldownMin) {
    const last = _cooldowns[ruleId];
    if (!last) return false;
    return (Date.now() - last) < cooldownMin * 60 * 1000;
}

function setCooldown(ruleId) {
    _cooldowns[ruleId] = Date.now();
}

function logTrigger(entry) {
    _triggerLog.unshift(entry);
    if (_triggerLog.length > MAX_LOG) _triggerLog.length = MAX_LOG;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION EXECUTORS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Execute a trigger action
 * @param {string} action - action type
 * @param {any} matchData - data from condition
 * @param {object} ctx - full prediction context
 * @param {boolean} dryRun - if true, only log without executing
 * @returns {object} action result
 */
function executeAction(action, matchData, ctx, dryRun = true) {
    const results = [];

    switch (action) {
        case 'boost': {
            // Auto-boost star products
            const items = Array.isArray(matchData) ? matchData : [matchData];
            items.forEach(item => {
                const name = item.name || item.id;
                results.push({
                    type: 'boost',
                    target: name,
                    detail: `Boost ${name} (tier: ${item.tier}, score: ${item.investment_score})`,
                    executed: !dryRun,
                });
                if (!dryRun && ctx._boosters) {
                    try { ctx._boosters.addBoost(item.id, 'auto_trigger', 1.5, 24); } catch (e) { /* safe */ }
                }
            });
            break;
        }

        case 'reduce_exposure': {
            const items = Array.isArray(matchData) ? matchData : [matchData];
            items.forEach(item => {
                results.push({
                    type: 'reduce_exposure',
                    target: item.name || item.id,
                    detail: `Reduce exposure: ${item.name} (trend: ${item.trend}, change: ${item.change_pct}%)`,
                    executed: !dryRun,
                });
                if (!dryRun && ctx._boosters) {
                    try { ctx._boosters.addBoost(item.id, 'auto_reduce', 0.5, 12); } catch (e) { /* safe */ }
                }
            });
            break;
        }

        case 'queue_content': {
            const items = Array.isArray(matchData) ? matchData : [matchData];
            items.forEach(item => {
                results.push({
                    type: 'queue_content',
                    target: item.name || item.id,
                    detail: `Queue content for ${item.name} (predicted: $${item.predicted_weekly})`,
                    executed: !dryRun,
                });
                if (!dryRun && ctx._contentExpander) {
                    try {
                        ctx._contentExpander.queueContent([{
                            strategy: 'auto_trigger',
                            title: `${item.name} Review — Is It Worth It?`,
                            slug: slugify(`${item.name}-review`),
                            priority: 8,
                            reason: `Auto-triggered: rising product with $${item.predicted_weekly} predicted weekly revenue`,
                        }]);
                    } catch (e) { /* safe */ }
                }
            });
            break;
        }

        case 'risk_response': {
            const items = Array.isArray(matchData) ? matchData : [matchData];
            items.forEach(risk => {
                results.push({
                    type: 'risk_response',
                    target: risk.name || risk.id,
                    detail: `Risk response: ${risk.message} → ${risk.action}`,
                    executed: !dryRun,
                });
                if (!dryRun && risk.action === 'reduce_exposure' && ctx._boosters) {
                    try { ctx._boosters.addBoost(risk.id, 'risk_auto', 0.3, 6); } catch (e) { /* safe */ }
                }
            });
            break;
        }

        case 'scale_channel': {
            const ch = matchData;
            results.push({
                type: 'scale_channel',
                target: ch.channel,
                detail: `Scale channel ${ch.channel} (efficiency: ${ch.efficiency_score}, allocation: ${ch.allocation_pct}%)`,
                executed: !dryRun,
            });
            break;
        }

        case 'flag_review': {
            const items = Array.isArray(matchData) ? matchData : [matchData];
            items.forEach(ch => {
                results.push({
                    type: 'flag_review',
                    target: ch.channel || ch.name,
                    detail: `⚠️ Flag for review: ${ch.channel || ch.name} (ROI: ${ch.roi}%)`,
                    executed: !dryRun,
                });
            });
            break;
        }

        default:
            results.push({ type: action, target: '?', detail: 'Unknown action', executed: false });
    }

    return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN TRIGGER CYCLE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run all triggers against prediction data
 * @param {object} predictionResult - from prediction.runPredictionCycle()
 * @param {object} opts - { dryRun: true, boosters, contentExpander }
 */
function runTriggerCycle(predictionResult, opts = {}) {
    const dryRun = opts.dryRun !== false; // default: dry run
    const ctx = {
        predictions: predictionResult.predictions || {},
        allocation: predictionResult.allocation || {},
        investment: predictionResult.investment || {},
        risks: predictionResult.risks || {},
        plan: predictionResult.plan || {},
        _boosters: opts.boosters || null,
        _contentExpander: opts.contentExpander || null,
    };

    const triggered = [];
    const skipped = [];

    TRIGGER_RULES.forEach(rule => {
        // Check cooldown
        if (isCooldownActive(rule.id, rule.cooldown_minutes)) {
            skipped.push({ rule: rule.id, reason: 'cooldown' });
            return;
        }

        // Evaluate condition
        const matchData = rule.condition(ctx);
        if (!matchData) {
            skipped.push({ rule: rule.id, reason: 'condition_not_met' });
            return;
        }

        // Execute action
        const results = executeAction(rule.action, matchData, ctx, dryRun);
        setCooldown(rule.id);

        const entry = {
            rule_id: rule.id,
            rule_name: rule.name,
            severity: rule.severity,
            action: rule.action,
            dry_run: dryRun,
            results,
            triggered_at: new Date().toISOString(),
        };

        triggered.push(entry);
        logTrigger(entry);
    });

    return {
        triggered,
        skipped,
        total_triggered: triggered.length,
        total_skipped: skipped.length,
        dry_run: dryRun,
        generated_at: new Date().toISOString(),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS + HISTORY
// ═══════════════════════════════════════════════════════════════════════════════

function getStatus() {
    return {
        rules: TRIGGER_RULES.map(r => ({
            id: r.id,
            name: r.name,
            severity: r.severity,
            cooldown_minutes: r.cooldown_minutes,
            cooldown_active: isCooldownActive(r.id, r.cooldown_minutes),
            last_triggered: _cooldowns[r.id] ? new Date(_cooldowns[r.id]).toISOString() : null,
        })),
        log_count: _triggerLog.length,
        last_run: _triggerLog.length > 0 ? _triggerLog[0].triggered_at : null,
    };
}

function getLog(limit = 50) {
    return _triggerLog.slice(0, limit);
}

function resetCooldowns() {
    Object.keys(_cooldowns).forEach(k => delete _cooldowns[k]);
    return { message: 'All cooldowns reset' };
}

function slugify(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 80);
}

module.exports = {
    TRIGGER_RULES,
    runTriggerCycle,
    getStatus,
    getLog,
    resetCooldowns,
};
