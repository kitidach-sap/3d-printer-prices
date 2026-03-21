/**
 * Revenue Config — Feature Flags & Safety Thresholds
 * 
 * Controls all auto-optimization behavior.
 * 
 * ⚡ ACTIVATED 2026-03-22 — Conservative rollout
 *    AUTO_BOOST: ON (1.2x max, 0.8x min = ±20% range)
 *    WINNER_CTA: ON (conservative urgency weighting)
 */

module.exports = {
    // ═══════════════════════════════════════════════════════════
    // FEATURE FLAGS — ALL ACTIVE
    // ═══════════════════════════════════════════════════════════
    AUTO_BOOST_ENABLED: process.env.AUTO_BOOST_ENABLED !== 'false',      // ✅ ON — product rank boosting
    CAMPAIGN_BOOST_ENABLED: process.env.CAMPAIGN_BOOST_ENABLED !== 'false', // ✅ ON — campaign visibility
    WINNER_CTA_ENABLED: process.env.WINNER_CTA_ENABLED !== 'false',      // ✅ ON — urgency variant weighting
    BLOG_OPTIMIZATION_ENABLED: process.env.BLOG_OPTIMIZATION_ENABLED !== 'false', // ✅ ON
    X_OPTIMIZATION_ENABLED: process.env.X_OPTIMIZATION_ENABLED !== 'false', // ✅ ON

    // ═══════════════════════════════════════════════════════════
    // SAFETY THRESHOLDS — Conservative for initial rollout
    // ═══════════════════════════════════════════════════════════
    MIN_CLICKS_FOR_WINNER: 5,           // minimum clicks before winner classification
    MIN_CLICKS_FOR_LOSER: 10,           // minimum impressions before marking as underperformer
    MIN_VIEWS_FOR_ARTICLE_SCORE: 3,     // minimum blog views before article can be scored
    MIN_COMPARE_ACTIONS: 2,             // minimum compare events before compare score counts

    // ═══════════════════════════════════════════════════════════
    // BOOST LIMITS — ±20% max difference (conservative)
    // ═══════════════════════════════════════════════════════════
    MAX_BOOST_MULTIPLIER: 1.2,          // ⚠️ max +20% weight for winners
    MIN_BOOST_MULTIPLIER: 0.8,          // ⚠️ max -20% weight for losers (never hidden)
    CAMPAIGN_OVERRIDE_MAX: 1.2,         // max +20% for campaign products
    MAX_TRENDING_PRODUCTS: 5,           // conservative: only top 5 can be trending

    // ═══════════════════════════════════════════════════════════
    // COOLDOWNS
    // ═══════════════════════════════════════════════════════════
    WINNER_RECALC_INTERVAL_MS: 3600000, // recalculate winners every 1 hour
    X_POST_COOLDOWN_HOURS: 3,           // minimum hours between posts about same product
    SCORE_DECAY_DAYS: 14,               // older data weighs less after this many days

    // ═══════════════════════════════════════════════════════════
    // ANALYTICS PERIODS
    // ═══════════════════════════════════════════════════════════
    DEFAULT_ANALYTICS_DAYS: 7,
    EXTENDED_ANALYTICS_DAYS: 30,
    WINNER_DETECTION_DAYS: 14,

    // ═══════════════════════════════════════════════════════════
    // SCORING WEIGHTS
    // ═══════════════════════════════════════════════════════════
    WEIGHT_CLICKS: 1.0,
    WEIGHT_COMPARES: 1.5,               // compare intent = higher purchase intent
    WEIGHT_BLOG_CLICKS: 1.2,            // blog clicks slightly higher than raw clicks
    WEIGHT_CAMPAIGN: 1.3,               // campaign products get slight inherent boost

    // ═══════════════════════════════════════════════════════════
    // LOGGING
    // ═══════════════════════════════════════════════════════════
    BOOST_LOGGING_ENABLED: true,        // log all boost decisions
    MAX_BOOST_LOG_ENTRIES: 200,         // keep last 200 decisions in memory
};
