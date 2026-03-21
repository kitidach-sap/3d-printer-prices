/**
 * Revenue Decay — Time-Aware Decay Engine
 * 
 * Prevents stale winners from dominating forever.
 * 
 * Logic:
 *   - If a winner's performance falls for DECAY_CHECK_DAYS, reduce weight
 *   - If no evidence remains after DECAY_FULL_RESET_DAYS, reset to neutral
 *   - Decay rate is DECAY_RATE per cycle (default 5%)
 *   - Decay floor is DECAY_FLOOR (default 0.9x — gentle)
 */

const config = require('./config');

// In-memory decay state (persists across requests within same process)
const _decayState = {};  // { productName: { lastWinnerAt, currentDecay, decayCycles } }

/**
 * Process decay for a list of product scaling candidates.
 * Mutates candidates' scaling_weight if decay applies.
 * Returns: { decayed: [...], reset: [...] }
 */
function processDecay(candidates) {
    if (!config.DECAY_ENGINE_ENABLED) {
        return { decayed: [], reset: [], state: {} };
    }

    const now = Date.now();
    const decayed = [];
    const reset = [];

    candidates.forEach(c => {
        const name = c.entity;
        
        if (c.verdict === 'winner' || c.action === 'scale_up') {
            // Winner — record timestamp, no decay
            _decayState[name] = {
                lastWinnerAt: now,
                currentDecay: 0,
                decayCycles: 0,
            };
            return;
        }

        const state = _decayState[name];
        if (!state) return; // never was a winner, no decay needed

        const daysSinceWinner = (now - state.lastWinnerAt) / 86400000;

        if (daysSinceWinner >= config.DECAY_FULL_RESET_DAYS) {
            // Full reset — no evidence for too long
            c.scaling_weight = 1.0;
            c.action = 'decay_reset';
            state.currentDecay = 0;
            state.decayCycles = 0;
            reset.push({ entity: name, days_since_winner: Math.round(daysSinceWinner), action: 'reset_to_neutral' });
        } else if (daysSinceWinner >= config.DECAY_CHECK_DAYS && c.trend === 'falling') {
            // Gradual decay
            state.decayCycles++;
            const decayAmount = config.DECAY_RATE * state.decayCycles;
            const decayedWeight = Math.max(config.DECAY_FLOOR, (c.scaling_weight || 1.0) - decayAmount);
            
            c.scaling_weight = Math.round(decayedWeight * 100) / 100;
            c.action = 'decaying';
            state.currentDecay = decayAmount;
            decayed.push({
                entity: name,
                days_since_winner: Math.round(daysSinceWinner),
                decay_cycles: state.decayCycles,
                new_weight: c.scaling_weight,
            });
        }
    });

    return {
        decayed,
        reset,
        state: { ...Object.fromEntries(Object.entries(_decayState).map(([k, v]) => [k, {
            ...v,
            lastWinnerAt: new Date(v.lastWinnerAt).toISOString(),
        }])) },
    };
}

/**
 * Get current decay state for admin visibility
 */
function getDecayState() {
    return {
        enabled: config.DECAY_ENGINE_ENABLED,
        settings: {
            DECAY_CHECK_DAYS: config.DECAY_CHECK_DAYS,
            DECAY_FULL_RESET_DAYS: config.DECAY_FULL_RESET_DAYS,
            DECAY_RATE: config.DECAY_RATE,
            DECAY_FLOOR: config.DECAY_FLOOR,
        },
        tracked_entities: Object.keys(_decayState).length,
        state: Object.fromEntries(Object.entries(_decayState).map(([k, v]) => [k, {
            ...v,
            lastWinnerAt: new Date(v.lastWinnerAt).toISOString(),
            age_days: Math.round((Date.now() - v.lastWinnerAt) / 86400000),
        }])),
    };
}

module.exports = {
    processDecay,
    getDecayState,
};
