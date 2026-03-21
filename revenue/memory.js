/**
 * Long-Term Memory
 * 
 * Stores historical performance results to:
 *   - Avoid repeating failed experiments
 *   - Accelerate winning patterns
 *   - Build institutional knowledge
 * 
 * Memory entries expire after their duration elapses.
 */

const config = require('./config');

const _memory = [];  // { id, timestamp, type, entity, outcome, score, reason, expiresAt }
let _nextMemoryId = 1;

// ═══════════════════════════════════════════════════════════════════════════════
// REMEMBER — store an outcome
// ═══════════════════════════════════════════════════════════════════════════════

function remember(type, entity, outcome, score, reason) {
    if (!config.MEMORY_ENABLED) return null;

    const durationMs = outcome === 'failure'
        ? config.MEMORY_FAILURE_PENALTY_DURATION_MS
        : config.MEMORY_SUCCESS_BONUS_DURATION_MS;

    const entry = {
        id: _nextMemoryId++,
        timestamp: new Date().toISOString(),
        type,       // 'product_boost', 'blog_topic', 'campaign_strategy', etc.
        entity,     // the thing we tried
        outcome,    // 'success', 'failure', 'neutral'
        score,      // numeric impact
        reason,     // why we remember this
        expiresAt: new Date(Date.now() + durationMs).toISOString(),
    };

    _memory.push(entry);
    while (_memory.length > config.MEMORY_MAX_ENTRIES) _memory.shift();

    console.log(`🧠💾 Memory: ${outcome} for ${type}:${entity} (score: ${score}, expires: ${Math.round(durationMs / 86400000)}d)`);
    return entry;
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECALL — check if we have memory about an entity
// ═══════════════════════════════════════════════════════════════════════════════

function recall(type, entity) {
    const now = Date.now();
    return _memory.filter(m =>
        m.type === type &&
        m.entity === entity &&
        new Date(m.expiresAt).getTime() > now
    );
}

function hasFailure(type, entity) {
    return recall(type, entity).some(m => m.outcome === 'failure');
}

function hasSuccess(type, entity) {
    return recall(type, entity).some(m => m.outcome === 'success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEIGH — get a memory-based weight modifier for an entity
// ═══════════════════════════════════════════════════════════════════════════════

function getMemoryWeight(type, entity) {
    if (!config.MEMORY_ENABLED) return 1.0;

    const memories = recall(type, entity);
    if (memories.length === 0) return 1.0;

    let modifier = 1.0;
    memories.forEach(m => {
        if (m.outcome === 'failure') {
            modifier *= 0.7;  // -30% penalty per failure
        } else if (m.outcome === 'success') {
            modifier *= 1.15; // +15% bonus per success
        }
    });

    // Clamp
    return Math.max(0.3, Math.min(1.5, modifier));
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEARN FROM ACTIONS — called after brain actions resolve
// ═══════════════════════════════════════════════════════════════════════════════

function learnFromAction(action, wasReverted, clickDelta) {
    if (!config.MEMORY_ENABLED) return;

    let outcome = 'neutral';
    if (wasReverted) {
        outcome = 'failure';
    } else if (clickDelta > 0) {
        outcome = 'success';
    } else if (clickDelta < -2) {
        outcome = 'failure';
    }

    remember(action.type, action.entity, outcome, clickDelta || 0,
        wasReverted ? 'Reverted — caused degradation' : `Click delta: ${clickDelta}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP — remove expired entries
// ═══════════════════════════════════════════════════════════════════════════════

function cleanup() {
    const now = Date.now();
    const before = _memory.length;
    const active = _memory.filter(m => new Date(m.expiresAt).getTime() > now);
    _memory.length = 0;
    _memory.push(...active);
    return { removed: before - active.length, remaining: active.length };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function getStatus() {
    const now = Date.now();
    const active = _memory.filter(m => new Date(m.expiresAt).getTime() > now);
    const failures = active.filter(m => m.outcome === 'failure');
    const successes = active.filter(m => m.outcome === 'success');

    return {
        enabled: config.MEMORY_ENABLED,
        total_entries: _memory.length,
        active_entries: active.length,
        failures: failures.length,
        successes: successes.length,
        entries: [...active].reverse().slice(0, 50),
        summary: {
            failure_entities: [...new Set(failures.map(m => m.entity))].slice(0, 10),
            success_entities: [...new Set(successes.map(m => m.entity))].slice(0, 10),
        },
    };
}

module.exports = {
    remember,
    recall,
    hasFailure,
    hasSuccess,
    getMemoryWeight,
    learnFromAction,
    cleanup,
    getStatus,
};
