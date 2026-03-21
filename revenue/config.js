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
    // LOGGING
    // ═══════════════════════════════════════════════════════════
    BOOST_LOGGING_ENABLED: true,
    SCALING_LOGGING_ENABLED: true,
    MAX_BOOST_LOG_ENTRIES: 200,
    MAX_SCALING_LOG_ENTRIES: 300,
};
