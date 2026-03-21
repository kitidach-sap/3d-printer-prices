/**
 * Action Pipeline — Execution Layer for Growth Brain
 * 
 * Handles: recommendation → decision → execution → logging
 * Every action is:
 *   - ID'd for audit trail
 *   - Reversible via revert()
 *   - Stored in history ring buffer
 *   - Rate-limited and cooldown-gated
 */

const config = require('./config');

// In-memory stores
const _actionHistory = [];       // { id, timestamp, type, entity, before, after, confidence, reverted }
const _cooldowns = {};           // { "type:entity": lastActionTime }
let _actionsThisHour = 0;
let _hourStart = Date.now();
let _nextActionId = 1;

// Override stores consumed by boosters
if (!global._brainOverrides) global._brainOverrides = {
    products: {},    // { entity: weight }
    variants: {},    // { entity: weight }
    campaigns: {},   // { entity: weight }
    x: { hooks: {}, angles: {}, ctas: {} },
    blogQueue: [],   // [{ cluster, reason, queuedAt }]
};

// ═══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING
// ═══════════════════════════════════════════════════════════════════════════════

function resetHourIfNeeded() {
    if (Date.now() - _hourStart > 3600000) {
        _actionsThisHour = 0;
        _hourStart = Date.now();
    }
}

function canExecute() {
    resetHourIfNeeded();
    return _actionsThisHour < config.MAX_ACTIONS_PER_HOUR;
}

function isOnCooldown(type, entity) {
    const key = `${type}:${entity}`;
    const last = _cooldowns[key];
    if (!last) return false;
    return (Date.now() - last) < config.COOLDOWN_PER_ENTITY_MS;
}

function setCooldown(type, entity) {
    _cooldowns[`${type}:${entity}`] = Date.now();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACTION EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

function applyProductBoost(entity, weight, confidence, reason) {
    const before = global._brainOverrides.products[entity] || 1.0;
    const clamped = Math.max(config.DECAY_FLOOR, Math.min(config.MAX_COMBINED_WEIGHT, weight));
    global._brainOverrides.products[entity] = clamped;
    setCooldown('product', entity);
    return logAction('product_boost', entity, before, clamped, confidence, reason);
}

function applyVariantWeight(entity, type, weight, confidence, reason) {
    const before = global._brainOverrides.variants[entity] || 1.0;
    const clamped = Math.max(config.DECAY_FLOOR, Math.min(config.MAX_COMBINED_WEIGHT, weight));
    global._brainOverrides.variants[entity] = clamped;
    setCooldown('variant', entity);
    return logAction(`variant_${type}`, entity, before, clamped, confidence, reason);
}

function applyCampaignBoost(entity, weight, confidence, reason) {
    const before = global._brainOverrides.campaigns[entity] || 1.0;
    const clamped = Math.max(config.DECAY_FLOOR, Math.min(config.MAX_COMBINED_WEIGHT, weight));
    global._brainOverrides.campaigns[entity] = clamped;
    setCooldown('campaign', entity);
    return logAction('campaign_boost', entity, before, clamped, confidence, reason);
}

function adjustXStrategy(dimension, entity, weight, confidence, reason) {
    if (!global._brainOverrides.x[dimension]) global._brainOverrides.x[dimension] = {};
    const before = global._brainOverrides.x[dimension][entity] || 1.0;
    const clamped = Math.max(config.DECAY_FLOOR, Math.min(config.MAX_COMBINED_WEIGHT, weight));
    global._brainOverrides.x[dimension][entity] = clamped;
    setCooldown('x_' + dimension, entity);
    return logAction(`x_${dimension}`, entity, before, clamped, confidence, reason);
}

function queueBlogGeneration(cluster, reason, confidence) {
    global._brainOverrides.blogQueue.push({
        cluster,
        reason,
        confidence,
        queuedAt: new Date().toISOString(),
    });
    // Keep queue manageable
    while (global._brainOverrides.blogQueue.length > 20) global._brainOverrides.blogQueue.shift();
    return logAction('blog_generate', cluster, null, null, confidence, reason);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVERT
// ═══════════════════════════════════════════════════════════════════════════════

function revertAction(actionId) {
    const action = _actionHistory.find(a => a.id === actionId);
    if (!action) return { ok: false, error: 'Action not found' };
    if (action.reverted) return { ok: false, error: 'Already reverted' };

    // Restore previous value
    if (action.type === 'product_boost') {
        if (action.before === 1.0) delete global._brainOverrides.products[action.entity];
        else global._brainOverrides.products[action.entity] = action.before;
    } else if (action.type.startsWith('variant_')) {
        if (action.before === 1.0) delete global._brainOverrides.variants[action.entity];
        else global._brainOverrides.variants[action.entity] = action.before;
    } else if (action.type === 'campaign_boost') {
        if (action.before === 1.0) delete global._brainOverrides.campaigns[action.entity];
        else global._brainOverrides.campaigns[action.entity] = action.before;
    } else if (action.type.startsWith('x_')) {
        const dim = action.type.replace('x_', '');
        if (global._brainOverrides.x[dim]) {
            if (action.before === 1.0) delete global._brainOverrides.x[dim][action.entity];
            else global._brainOverrides.x[dim][action.entity] = action.before;
        }
    }

    action.reverted = true;
    action.revertedAt = new Date().toISOString();
    console.log(`🧠 Reverted action #${actionId}: ${action.type} on ${action.entity}`);
    return { ok: true, action };
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

function logAction(type, entity, before, after, confidence, reason) {
    _actionsThisHour++;
    const entry = {
        id: _nextActionId++,
        timestamp: new Date().toISOString(),
        type,
        entity,
        before,
        after,
        confidence,
        reason,
        reverted: false,
    };
    _actionHistory.push(entry);
    while (_actionHistory.length > (config.MAX_ACTION_HISTORY || 500)) _actionHistory.shift();
    console.log(`🧠 Action #${entry.id}: ${type} → ${entity} (${before} → ${after}) [${confidence}] ${reason}`);
    return entry;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESSORS
// ═══════════════════════════════════════════════════════════════════════════════

function getOverrides() { return global._brainOverrides; }

function getHistory(limit = 50) {
    return [..._actionHistory].reverse().slice(0, limit);
}

function getStatus() {
    resetHourIfNeeded();
    return {
        actions_this_hour: _actionsThisHour,
        max_actions_per_hour: config.MAX_ACTIONS_PER_HOUR,
        capacity_remaining: config.MAX_ACTIONS_PER_HOUR - _actionsThisHour,
        total_actions: _actionHistory.length,
        active_overrides: {
            products: Object.keys(global._brainOverrides.products).length,
            variants: Object.keys(global._brainOverrides.variants).length,
            campaigns: Object.keys(global._brainOverrides.campaigns).length,
            x_hooks: Object.keys(global._brainOverrides.x.hooks).length,
            x_angles: Object.keys(global._brainOverrides.x.angles).length,
            x_ctas: Object.keys(global._brainOverrides.x.ctas).length,
            blog_queue: global._brainOverrides.blogQueue.length,
        },
        cooldowns_active: Object.keys(_cooldowns).filter(k => (Date.now() - _cooldowns[k]) < config.COOLDOWN_PER_ENTITY_MS).length,
    };
}

module.exports = {
    canExecute,
    isOnCooldown,
    applyProductBoost,
    applyVariantWeight,
    applyCampaignBoost,
    adjustXStrategy,
    queueBlogGeneration,
    revertAction,
    getOverrides,
    getHistory,
    getStatus,
};
