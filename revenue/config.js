/**
 * Revenue Config — Feature Flags & Safety Thresholds
 * 
 * Controls all auto-optimization and scaling behavior.
 * 
 * ⚡ ACTIVATED 2026-03-22 — Conservative rollout
 *    AUTO_BOOST: ON (1.2x max, 0.8x min = ±20% range)
 *    WINNER_CTA: ON (conservative urgency weighting)
 * 
 * 🚀 SCALING FLAGS — recommendation-only by default
 */

module.exports = {
    // ═══════════════════════════════════════════════════════════
    // FEATURE FLAGS — AUTO MONEY SYSTEM (ALL ACTIVE)
    // ═══════════════════════════════════════════════════════════
    AUTO_BOOST_ENABLED: process.env.AUTO_BOOST_ENABLED !== 'false',
    CAMPAIGN_BOOST_ENABLED: process.env.CAMPAIGN_BOOST_ENABLED !== 'false',
    WINNER_CTA_ENABLED: process.env.WINNER_CTA_ENABLED !== 'false',
    BLOG_OPTIMIZATION_ENABLED: process.env.BLOG_OPTIMIZATION_ENABLED !== 'false',
    X_OPTIMIZATION_ENABLED: process.env.X_OPTIMIZATION_ENABLED !== 'false',

    // ═══════════════════════════════════════════════════════════
    // SCALING FLAGS — Full Auto Scaling System
    // ═══════════════════════════════════════════════════════════
    FULL_AUTO_SCALING_ENABLED: process.env.FULL_AUTO_SCALING_ENABLED === 'true' || false,
    PRODUCT_SCALING_ENABLED: process.env.PRODUCT_SCALING_ENABLED === 'true' || false,
    BLOG_SCALING_ENABLED: process.env.BLOG_SCALING_ENABLED === 'true' || false,
    X_SCALING_ENABLED: process.env.X_SCALING_ENABLED === 'true' || false,
    CAMPAIGN_SCALING_ENABLED: process.env.CAMPAIGN_SCALING_ENABLED === 'true' || false,
    SOURCE_OPTIMIZATION_ENABLED: process.env.SOURCE_OPTIMIZATION_ENABLED === 'true' || false,
    DECAY_ENGINE_ENABLED: process.env.DECAY_ENGINE_ENABLED === 'true' || false,
    SCALING_DRY_RUN: process.env.SCALING_DRY_RUN !== 'false',  // ON by default = recommendation-only

    // ═══════════════════════════════════════════════════════════
    // SAFETY THRESHOLDS
    // ═══════════════════════════════════════════════════════════
    MIN_CLICKS_FOR_WINNER: 5,
    MIN_CLICKS_FOR_LOSER: 10,
    MIN_VIEWS_FOR_ARTICLE_SCORE: 3,
    MIN_COMPARE_ACTIONS: 2,
    MIN_CLICKS_FOR_SCALING: 8,          // higher bar for scaling decisions
    MIN_TREND_SAMPLE: 3,               // minimum data points per period for trend

    // ═══════════════════════════════════════════════════════════
    // BOOST LIMITS — ±20% max difference (conservative)
    // ═══════════════════════════════════════════════════════════
    MAX_BOOST_MULTIPLIER: 1.2,
    MIN_BOOST_MULTIPLIER: 0.8,
    CAMPAIGN_OVERRIDE_MAX: 1.2,
    MAX_TRENDING_PRODUCTS: 5,
    MAX_SCALING_WEIGHT: 1.3,            // scaling can push up to 1.3x (stacks with boost)
    MAX_COMBINED_WEIGHT: 1.5,           // absolute max after boost + scaling combined

    // ═══════════════════════════════════════════════════════════
    // DECAY SETTINGS
    // ═══════════════════════════════════════════════════════════
    DECAY_CHECK_DAYS: 7,                // check for falling trend over this window
    DECAY_FULL_RESET_DAYS: 14,          // reset to neutral if no evidence after this
    DECAY_RATE: 0.05,                   // reduce weight by 5% per decay cycle
    DECAY_FLOOR: 0.9,                   // decay never goes below 0.9x (gentle)

    // ═══════════════════════════════════════════════════════════
    // COOLDOWNS
    // ═══════════════════════════════════════════════════════════
    WINNER_RECALC_INTERVAL_MS: 3600000,
    SCALING_RECALC_INTERVAL_MS: 3600000, // scaling also recalcs hourly
    X_POST_COOLDOWN_HOURS: 3,
    SCORE_DECAY_DAYS: 14,

    // ═══════════════════════════════════════════════════════════
    // ANALYTICS PERIODS
    // ═══════════════════════════════════════════════════════════
    DEFAULT_ANALYTICS_DAYS: 7,
    EXTENDED_ANALYTICS_DAYS: 30,
    WINNER_DETECTION_DAYS: 14,
    TREND_RECENT_DAYS: 7,               // "recent" period for trend comparison
    TREND_PREVIOUS_DAYS: 7,             // "previous" period to compare against

    // ═══════════════════════════════════════════════════════════
    // SCORING WEIGHTS
    // ═══════════════════════════════════════════════════════════
    WEIGHT_CLICKS: 1.0,
    WEIGHT_COMPARES: 1.5,
    WEIGHT_BLOG_CLICKS: 1.2,
    WEIGHT_CAMPAIGN: 1.3,
    WEIGHT_TREND: 0.3,                  // trend contributes 30% to global score
    WEIGHT_SOURCE_INTENT: 0.2,          // source intent contributes 20%

    // ═══════════════════════════════════════════════════════════
    // DIVERSITY PROTECTION
    // ═══════════════════════════════════════════════════════════
    MAX_SAME_PRODUCT_ARTICLES: 5,       // max articles featuring same product
    MAX_CAMPAIGN_EXPOSURE_RATIO: 0.4,   // campaigns can't exceed 40% of visibility
    MIN_ORGANIC_DIVERSITY: 0.6,         // 60% of rankings must be organic/unmodified

    // ═══════════════════════════════════════════════════════════
    // GROWTH BRAIN — AI Decision Engine
    // ═══════════════════════════════════════════════════════════
    GROWTH_BRAIN_ENABLED: process.env.GROWTH_BRAIN_ENABLED === 'true' || false,
    BRAIN_AUTO_EXECUTE: process.env.BRAIN_AUTO_EXECUTE === 'true' || false,
    MAX_ACTIONS_PER_HOUR: 10,
    COOLDOWN_PER_ENTITY_MS: 7200000,    // 2 hours between actions on same entity
    MAX_BOOST_DELTA: 0.15,              // max single change ±15%
    MAX_ACTION_HISTORY: 500,

    // ═══════════════════════════════════════════════════════════
    // STRATEGY ENGINE — Opportunity Detection + Forecasting
    // ═══════════════════════════════════════════════════════════
    STRATEGY_ENGINE_ENABLED: process.env.STRATEGY_ENGINE_ENABLED === 'true' || false,
    EXPLORATION_RESERVE_RATIO: 0.15,    // 15% reserved for new/untested
    EXPLORATION_MIN_BUDGET: 2,          // at least 2 exploration slots
    FORECAST_LOOKBACK_DAYS: 14,         // data for forecasting
    FORECAST_PROJECT_DAYS: 7,           // project this far forward
    MIN_CLUSTER_ARTICLES: 3,            // min articles to form a cluster
    CONTENT_GAP_THRESHOLD: 0.3,         // 30% coverage = gap detected
    STRATEGY_RECALC_INTERVAL_MS: 3600000, // hourly recalc

    // ═══════════════════════════════════════════════════════════
    // AUTONOMOUS COMPANY SYSTEM
    // ═══════════════════════════════════════════════════════════
    AUTONOMOUS_ENABLED: process.env.AUTONOMOUS_ENABLED === 'true' || false,

    // Self-Monitoring
    MONITOR_INTERVAL_MS: 1800000,       // check every 30 min
    DEGRADATION_THRESHOLD: -0.2,        // -20% = degradation detected
    TREND_WINDOW_HOURS: 6,              // look at last 6h for trends

    // Auto Rollback
    AUTO_ROLLBACK_ENABLED: process.env.AUTO_ROLLBACK_ENABLED === 'true' || false,
    ROLLBACK_CLICK_DROP_THRESHOLD: -0.3,  // -30% click drop triggers rollback
    ROLLBACK_LOOKBACK_ACTIONS: 10,      // check last 10 actions for culprit
    MAX_ROLLBACKS_PER_HOUR: 3,          // prevent rollback storms

    // KPI Guardrails
    GUARDRAILS_ENABLED: process.env.GUARDRAILS_ENABLED === 'true' || false,
    MIN_CLICK_RATE_HOURLY: 0.5,         // minimum 0.5 clicks/hour expected
    MAX_BOOST_CONCENTRATION: 0.4,       // no single product > 40% of total boost
    MIN_CONTENT_DIVERSITY: 3,           // minimum 3 active clusters
    MAX_DECAY_RATIO: 0.5,              // max 50% of entities decaying

    // Meta-Optimization
    META_OPTIMIZE_ENABLED: process.env.META_OPTIMIZE_ENABLED === 'true' || false,
    META_ADJUST_INTERVAL_MS: 7200000,   // every 2 hours
    META_MAX_ADJUSTMENT: 0.1,           // max ±10% per adjustment cycle

    // Resource Allocation
    RESOURCE_ALLOC_ENABLED: process.env.RESOURCE_ALLOC_ENABLED === 'true' || false,
    RESOURCE_CHANNELS: ['blog', 'social', 'campaign'],
    DEFAULT_CHANNEL_WEIGHTS: { blog: 0.4, social: 0.35, campaign: 0.25 },

    // Long-Term Memory
    MEMORY_ENABLED: process.env.MEMORY_ENABLED === 'true' || false,
    MEMORY_MAX_ENTRIES: 1000,
    MEMORY_FAILURE_PENALTY_DURATION_MS: 604800000,  // 7 days
    MEMORY_SUCCESS_BONUS_DURATION_MS: 2592000000,   // 30 days

    // ═══════════════════════════════════════════════════════════
    // LOGGING
    // ═══════════════════════════════════════════════════════════
    BOOST_LOGGING_ENABLED: true,
    SCALING_LOGGING_ENABLED: true,
    MAX_BOOST_LOG_ENTRIES: 200,
    MAX_SCALING_LOG_ENTRIES: 300,
};
