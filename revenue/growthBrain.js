/**
 * Growth Brain — AI Decision Engine
 * 
 * The brain of the auto-scaling system.
 * Evaluates scaling recommendations and auto-executes when confidence is high.
 * 
 * Pipeline: scaling candidates → confidence gate → cooldown check → rate limit → EXECUTE → log
 * 
 * Confidence gates:
 *   - low       → skip (no action)
 *   - medium    → recommend only (log for dashboard)
 *   - high      → auto-apply if BRAIN_AUTO_EXECUTE is ON
 *   - insufficient → skip
 */

const config = require('./config');
const pipeline = require('./actionPipeline');

let _lastEvaluation = null;
let _evaluationLog = [];

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EVALUATION — called from boosters.js on each recalc
// ═══════════════════════════════════════════════════════════════════════════════

async function evaluateAll(supabase) {
    if (!config.GROWTH_BRAIN_ENABLED) {
        return { mode: 'disabled', decisions: [], executed: 0, deferred: 0, skipped: 0 };
    }

    try {
        const scaling = require('./scaling');
        const candidates = await scaling.getScalingCandidates(supabase);
        const recommendations = candidates.recommendations || [];

        const decisions = [];
        let executed = 0;
        let deferred = 0;
        let skipped = 0;

        for (const rec of recommendations) {
            const decision = evaluateRecommendation(rec);
            decisions.push(decision);

            if (decision.outcome === 'executed') executed++;
            else if (decision.outcome === 'deferred') deferred++;
            else skipped++;
        }

        // Process decay adjustments separately
        const decayDecisions = evaluateDecayActions(candidates.products || []);
        decisions.push(...decayDecisions);

        _lastEvaluation = {
            timestamp: new Date().toISOString(),
            mode: config.BRAIN_AUTO_EXECUTE ? 'auto_execute' : 'observe_only',
            total_recommendations: recommendations.length,
            executed,
            deferred,
            skipped,
            decisions: decisions.slice(0, 50), // keep last 50 for dashboard
        };

        // Log evaluation
        _evaluationLog.push({
            timestamp: _lastEvaluation.timestamp,
            mode: _lastEvaluation.mode,
            executed,
            deferred,
            skipped,
        });
        while (_evaluationLog.length > 100) _evaluationLog.shift();

        if (executed > 0) {
            console.log(`🧠 Growth Brain: ${executed} executed, ${deferred} deferred, ${skipped} skipped`);
        }

        return _lastEvaluation;
    } catch (e) {
        console.log('Growth Brain evaluation error:', e.message);
        return { mode: 'error', error: e.message, decisions: [], executed: 0, deferred: 0, skipped: 0 };
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INDIVIDUAL RECOMMENDATION EVALUATION
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateRecommendation(rec) {
    const decision = {
        timestamp: new Date().toISOString(),
        type: rec.type,
        action: rec.action,
        target: rec.target,
        priority: rec.priority,
        weight: rec.weight,
        message: rec.message,
        outcome: 'skipped',
        reason: '',
    };

    // 1. Determine confidence from priority score
    const confidence = getConfidenceFromPriority(rec);

    // 2. Confidence gate
    if (confidence === 'low' || confidence === 'insufficient') {
        decision.outcome = 'skipped';
        decision.reason = `Confidence too low (${confidence})`;
        return decision;
    }

    if (confidence === 'medium') {
        decision.outcome = 'deferred';
        decision.reason = 'Medium confidence — recommendation only';
        decision.confidence = 'medium';
        return decision;
    }

    // 3. Auto-execute gate
    if (!config.BRAIN_AUTO_EXECUTE) {
        decision.outcome = 'deferred';
        decision.reason = 'Auto-execute disabled (BRAIN_AUTO_EXECUTE=false)';
        decision.confidence = confidence;
        return decision;
    }

    // 4. Rate limit check
    if (!pipeline.canExecute()) {
        decision.outcome = 'deferred';
        decision.reason = 'Rate limit reached (MAX_ACTIONS_PER_HOUR)';
        decision.confidence = confidence;
        return decision;
    }

    // 5. Cooldown check
    if (pipeline.isOnCooldown(rec.type, rec.target)) {
        decision.outcome = 'deferred';
        decision.reason = 'Entity on cooldown';
        decision.confidence = confidence;
        return decision;
    }

    // 6. Check feature flag for this type
    if (!isFeatureEnabled(rec.type)) {
        decision.outcome = 'deferred';
        decision.reason = `Feature flag disabled for ${rec.type}`;
        decision.confidence = confidence;
        return decision;
    }

    // 7. EXECUTE
    try {
        const result = executeAction(rec, confidence);
        decision.outcome = 'executed';
        decision.reason = `Applied: ${result.type} on ${result.entity}`;
        decision.confidence = confidence;
        decision.actionId = result.id;
    } catch (e) {
        decision.outcome = 'deferred';
        decision.reason = `Execution failed: ${e.message}`;
    }

    return decision;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXECUTE ACTION — dispatch to action pipeline
// ═══════════════════════════════════════════════════════════════════════════════

function executeAction(rec, confidence) {
    const weight = rec.weight || 1.0;
    // Clamp delta to MAX_BOOST_DELTA
    const currentWeight = 1.0;
    const delta = weight - currentWeight;
    const clampedDelta = Math.max(-config.MAX_BOOST_DELTA, Math.min(config.MAX_BOOST_DELTA, delta));
    const safeWeight = Math.round((currentWeight + clampedDelta) * 100) / 100;

    switch (rec.type) {
        case 'product':
            return pipeline.applyProductBoost(rec.target, safeWeight, confidence, rec.message);
        case 'urgency':
        case 'position':
        case 'badge':
            return pipeline.applyVariantWeight(rec.target, rec.type, safeWeight, confidence, rec.message);
        case 'campaign':
            return pipeline.applyCampaignBoost(rec.target, safeWeight, confidence, rec.message);
        case 'x_hook':
        case 'x_angle':
        case 'x_cta':
            const dim = rec.type.replace('x_', '') + 's';
            return pipeline.adjustXStrategy(dim, rec.target, safeWeight, confidence, rec.message);
        case 'blog_cluster':
            return pipeline.queueBlogGeneration(rec.target, rec.message, confidence);
        default:
            throw new Error(`Unknown action type: ${rec.type}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECAY AUTO-ACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function evaluateDecayActions(products) {
    const decisions = [];
    products.filter(p => p.action === 'decaying' || p.action === 'decay_reset').forEach(p => {
        if (p.confidence !== 'insufficient' && config.BRAIN_AUTO_EXECUTE && config.DECAY_ENGINE_ENABLED) {
            if (pipeline.canExecute() && !pipeline.isOnCooldown('decay', p.entity)) {
                pipeline.applyProductBoost(p.entity, p.scaling_weight, 'high', `Decay: ${p.action}`);
                decisions.push({
                    timestamp: new Date().toISOString(),
                    type: 'decay',
                    target: p.entity,
                    outcome: 'executed',
                    reason: `Decay applied: ${p.action} → ${p.scaling_weight}x`,
                    confidence: 'high',
                });
            }
        }
    });
    return decisions;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getConfidenceFromPriority(rec) {
    // Priority is 0-100 composite score
    if (rec.priority >= 70) return 'high';
    if (rec.priority >= 40) return 'medium';
    if (rec.priority >= 20) return 'low';
    return 'insufficient';
}

function isFeatureEnabled(type) {
    switch (type) {
        case 'product': return config.PRODUCT_SCALING_ENABLED;
        case 'urgency': case 'position': case 'badge': return config.X_SCALING_ENABLED || config.BLOG_SCALING_ENABLED;
        case 'campaign': return config.CAMPAIGN_SCALING_ENABLED;
        case 'x_hook': case 'x_angle': case 'x_cta': return config.X_SCALING_ENABLED;
        case 'blog_cluster': case 'article': return config.BLOG_SCALING_ENABLED;
        case 'source': return config.SOURCE_OPTIMIZATION_ENABLED;
        default: return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS for dashboard
// ═══════════════════════════════════════════════════════════════════════════════

function getBrainStatus() {
    const pipelineStatus = pipeline.getStatus();
    return {
        enabled: config.GROWTH_BRAIN_ENABLED,
        auto_execute: config.BRAIN_AUTO_EXECUTE,
        mode: !config.GROWTH_BRAIN_ENABLED ? 'disabled'
            : !config.BRAIN_AUTO_EXECUTE ? 'observe_only'
            : 'auto_execute',
        last_evaluation: _lastEvaluation,
        pipeline: pipelineStatus,
        evaluation_log: [..._evaluationLog].reverse().slice(0, 20),
        flags: {
            GROWTH_BRAIN_ENABLED: config.GROWTH_BRAIN_ENABLED,
            BRAIN_AUTO_EXECUTE: config.BRAIN_AUTO_EXECUTE,
            MAX_ACTIONS_PER_HOUR: config.MAX_ACTIONS_PER_HOUR,
            COOLDOWN_PER_ENTITY_MS: config.COOLDOWN_PER_ENTITY_MS,
            MAX_BOOST_DELTA: config.MAX_BOOST_DELTA,
        },
    };
}

module.exports = {
    evaluateAll,
    getBrainStatus,
};
