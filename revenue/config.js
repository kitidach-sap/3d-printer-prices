/**
 * Revenue Config — Feature Flags & Safety Thresholds
 * 
 * Controls all auto-optimization behavior.
 * Safe defaults: everything conservative.
 */

module.exports = {
    // ═══════════════════════════════════════════════════════════
    // FEATURE FLAGS
    // ═══════════════════════════════════════════════════════════
    AUTO_BOOST_ENABLED: process.env.AUTO_BOOST_ENABLED === 'true' || false,
    CAMPAIGN_BOOST_ENABLED: process.env.CAMPAIGN_BOOST_ENABLED !== 'false', // default ON
    WINNER_CTA_ENABLED: process.env.WINNER_CTA_ENABLED === 'true' || false,
    BLOG_OPTIMIZATION_ENABLED: process.env.BLOG_OPTIMIZATION_ENABLED !== 'false', // default ON (already active)
    X_OPTIMIZATION_ENABLED: process.env.X_OPTIMIZATION_ENABLED !== 'false', // default ON (already active)

    // ═══════════════════════════════════════════════════════════
    // SAFETY THRESHOLDS
    // ═══════════════════════════════════════════════════════════
    MIN_CLICKS_FOR_WINNER: 5,           // minimum clicks before a product/variant can be classified as winner
    MIN_CLICKS_FOR_LOSER: 10,           // minimum impressions before marking as underperformer
    MIN_VIEWS_FOR_ARTICLE_SCORE: 3,     // minimum blog views before article can be scored
    MIN_COMPARE_ACTIONS: 2,             // minimum compare events before product compare score counts

    // ═══════════════════════════════════════════════════════════
    // BOOST LIMITS
    // ═══════════════════════════════════════════════════════════
    MAX_BOOST_MULTIPLIER: 2.0,          // maximum weight increase for winners (2x normal)
    MIN_BOOST_MULTIPLIER: 0.5,          // minimum weight for losers (never fully hidden)
    CAMPAIGN_OVERRIDE_MAX: 1.5,         // max boost for campaign products
    MAX_TRENDING_PRODUCTS: 10,          // number of products that can be "trending" at once

    // ═══════════════════════════════════════════════════════════
    // COOLDOWNS
    // ═══════════════════════════════════════════════════════════
    WINNER_RECALC_INTERVAL_MS: 3600000, // recalculate winners every 1 hour max
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
};
