/**
 * Revenue Boosters — Auto-Boost Engine
 * 
 * Phase D of the Auto Money System.
 * Consumes winner data from winners.js to produce actionable boost decisions.
 * 
 * This module is the BRIDGE between analytics and behavior:
 *   analytics → scoring → winners → BOOSTERS → scheduler / generator / server
 * 
 * All boosts respect safety thresholds from config.js.
 * All boosts are gated by feature flags.
 */

const config = require('./config');
const winners = require('./winners');
const analytics = require('./analytics');

// In-memory cache (recalculated periodically)
let _cache = null;
let _cacheTime = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN BOOST COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Compute all boosts from current winner data.
 * Cached for WINNER_RECALC_INTERVAL_MS (default 1 hour).
 * Returns: { products, urgency_weights, position_weights, featured_articles, campaign_boosts, x_post_weights }
 */
async function getBoosts(supabase, forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && _cache && (now - _cacheTime) < config.WINNER_RECALC_INTERVAL_MS) {
        return _cache;
    }

    try {
        const [productWinners, variantWinners, articleWinners, campaignWinners, xWinners] = await Promise.all([
            winners.detectProductWinners(supabase).catch(() => ({ winners: [], losers: [], all: [] })),
            winners.detectVariantWinners(supabase).catch(() => ({ urgency: { all: [] }, position: { all: [] }, badge: { all: [] } })),
            winners.detectArticleWinners(supabase).catch(() => ({ winners: [], all: [] })),
            winners.detectCampaignWinners(supabase).catch(() => ({ winners: [], all: [] })),
            winners.detectXPostWinners(supabase).catch(() => ({ hooks: { all: [] }, angles: { all: [] }, ctas: { all: [] } })),
        ]);

        _cache = {
            generated_at: new Date().toISOString(),
            products: computeProductBoosts(productWinners),
            urgency_weights: computeUrgencyWeights(variantWinners.urgency),
            position_weights: computePositionWeights(variantWinners.position),
            badge_overrides: computeBadgeOverrides(productWinners),
            featured_articles: computeFeaturedArticles(articleWinners),
            campaign_boosts: computeCampaignBoosts(campaignWinners),
            x_post_weights: computeXPostWeights(xWinners),
        };
        _cacheTime = now;
    } catch (e) {
        console.log('Boost computation error:', e.message);
        _cache = _cache || getEmptyBoosts();
    }

    return _cache;
}

function getEmptyBoosts() {
    return {
        generated_at: new Date().toISOString(),
        products: {},
        urgency_weights: {},
        position_weights: {},
        badge_overrides: {},
        featured_articles: [],
        campaign_boosts: {},
        x_post_weights: { hooks: {}, angles: {}, ctas: {} },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCT BOOSTS — rank weight + badge override
// ═══════════════════════════════════════════════════════════════════════════════

function computeProductBoosts(productWinners) {
    if (!config.AUTO_BOOST_ENABLED) return {};

    const boosts = {};
    const allProducts = productWinners.all || [];
    if (allProducts.length === 0) return boosts;

    let trendingCount = 0;

    allProducts.forEach(p => {
        if (p.verdict === 'winner' && trendingCount < config.MAX_TRENDING_PRODUCTS) {
            // Boost weight: score 70–100 maps to 1.2–2.0x
            const weight = Math.min(config.MAX_BOOST_MULTIPLIER,
                1.0 + (p.score - 50) / 100 * config.MAX_BOOST_MULTIPLIER
            );
            boosts[p.product_name] = {
                rank_weight: Math.round(weight * 100) / 100,
                badge: p.score >= 85 ? '🔥 Trending' : '📈 Rising',
                reason: `${p.clicks} clicks, score ${p.score}`,
            };
            trendingCount++;
        } else if (p.verdict === 'loser') {
            // Soft demotion: never below MIN_BOOST_MULTIPLIER
            boosts[p.product_name] = {
                rank_weight: config.MIN_BOOST_MULTIPLIER,
                badge: null,
                reason: `Low performance: ${p.clicks} clicks, score ${p.score}`,
            };
        }
    });

    return boosts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// URGENCY WEIGHTS — for blog generator priceUrgency()
// ═══════════════════════════════════════════════════════════════════════════════

function computeUrgencyWeights(urgencyData) {
    if (!config.WINNER_CTA_ENABLED) return {};

    const items = urgencyData?.all || [];
    if (items.length === 0) return {};

    const weights = {};
    const maxClicks = Math.max(...items.map(v => v.clicks), 1);

    items.forEach(v => {
        if (v.verdict === 'winner') {
            // Winners get up to MAX_BOOST_MULTIPLIER
            weights[v.name] = Math.min(config.MAX_BOOST_MULTIPLIER,
                1.0 + (v.clicks / maxClicks) * (config.MAX_BOOST_MULTIPLIER - 1)
            );
        } else if (v.verdict === 'loser') {
            // Losers get reduced but never fully removed
            weights[v.name] = config.MIN_BOOST_MULTIPLIER;
        } else {
            weights[v.name] = 1.0; // neutral
        }
    });

    return weights;
}

// ═══════════════════════════════════════════════════════════════════════════════
// POSITION WEIGHTS — which CTA positions convert best
// ═══════════════════════════════════════════════════════════════════════════════

function computePositionWeights(positionData) {
    const items = positionData?.all || [];
    if (items.length === 0) return {};

    const weights = {};
    items.forEach(p => {
        weights[p.name] = {
            clicks: p.clicks,
            score: p.score,
            verdict: p.verdict,
        };
    });
    return weights;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BADGE OVERRIDES — winning products get trending badges
// ═══════════════════════════════════════════════════════════════════════════════

function computeBadgeOverrides(productWinners) {
    const overrides = {};
    const allProducts = productWinners.all || [];

    let count = 0;
    allProducts.forEach(p => {
        if (p.verdict === 'winner' && count < config.MAX_TRENDING_PRODUCTS) {
            overrides[p.product_name] = p.score >= 85 ? '🔥 Trending' : '📈 Rising';
            count++;
        }
    });

    return overrides;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEATURED ARTICLES — top converting articles to feature/promote
// ═══════════════════════════════════════════════════════════════════════════════

function computeFeaturedArticles(articleWinners) {
    if (!config.BLOG_OPTIMIZATION_ENABLED) return [];

    return (articleWinners.winners || []).slice(0, 5).map(a => ({
        slug: a.slug,
        score: a.score,
        ctr: a.ctr,
        clicks: a.clicks,
    }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN BOOSTS — active campaigns get visibility override
// ═══════════════════════════════════════════════════════════════════════════════

function computeCampaignBoosts(campaignWinners) {
    if (!config.CAMPAIGN_BOOST_ENABLED) return {};

    const boosts = {};
    (campaignWinners.all || []).forEach(c => {
        if (c.status === 'active') {
            boosts[String(c.product_id)] = {
                campaign_id: c.campaign_id,
                campaign_name: c.campaign_name,
                weight: c.verdict === 'winner'
                    ? config.CAMPAIGN_OVERRIDE_MAX
                    : 1.2, // baseline boost for active campaigns
                reason: c.verdict === 'winner'
                    ? `Campaign outperforms organic (${c.clicks} clicks)`
                    : `Active campaign (${c.clicks} clicks)`,
            };
        }
    });

    return boosts;
}

// ═══════════════════════════════════════════════════════════════════════════════
// X POST WEIGHTS — winning hooks/angles/CTAs
// ═══════════════════════════════════════════════════════════════════════════════

function computeXPostWeights(xWinners) {
    if (!config.X_OPTIMIZATION_ENABLED) return { hooks: {}, angles: {}, ctas: {} };

    const weightify = (items) => {
        const weights = {};
        const allItems = items?.all || [];
        if (allItems.length === 0) return weights;
        const maxEng = Math.max(...allItems.map(i => i.avg_engagement || 0), 0.01);

        allItems.forEach(item => {
            if (item.verdict === 'winner') {
                weights[item.name] = Math.min(config.MAX_BOOST_MULTIPLIER,
                    1.0 + (item.avg_engagement / maxEng) * (config.MAX_BOOST_MULTIPLIER - 1)
                );
            } else if (item.posts >= 3) {
                // Enough data to slightly reduce poor performers
                weights[item.name] = Math.max(config.MIN_BOOST_MULTIPLIER,
                    0.8 + (item.avg_engagement / maxEng) * 0.4
                );
            } else {
                weights[item.name] = 1.0;
            }
        });
        return weights;
    };

    return {
        hooks: weightify(xWinners.hooks),
        angles: weightify(xWinners.angles),
        ctas: weightify(xWinners.ctas),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC HELPERS — for consumers (scheduler, generator, server)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get rank weight for a product (for listing/ranking pages)
 */
async function getProductRankWeight(supabase, productName) {
    const boosts = await getBoosts(supabase);
    const boost = boosts.products[productName];
    const campaign = Object.values(boosts.campaign_boosts).find(c => c.campaign_name === productName);
    
    let weight = 1.0;
    if (boost) weight *= boost.rank_weight;
    if (campaign) weight *= campaign.weight;
    return Math.min(config.MAX_BOOST_MULTIPLIER * config.CAMPAIGN_OVERRIDE_MAX, weight);
}

/**
 * Get badge override for a product (if any)
 */
async function getProductBadge(supabase, productName) {
    const boosts = await getBoosts(supabase);
    return boosts.badge_overrides[productName] || null;
}

/**
 * Get urgency weights for blog generator
 */
async function getUrgencyWeights(supabase) {
    const boosts = await getBoosts(supabase);
    return boosts.urgency_weights;
}

/**
 * Get featured articles for internal linking
 */
async function getFeaturedArticles(supabase) {
    const boosts = await getBoosts(supabase);
    return boosts.featured_articles;
}

/**
 * Get X post weights for scheduler
 */
async function getXPostWeights(supabase) {
    const boosts = await getBoosts(supabase);
    return boosts.x_post_weights;
}

/**
 * Get campaign boost for a product ID
 */
async function getCampaignBoost(supabase, productId) {
    const boosts = await getBoosts(supabase);
    return boosts.campaign_boosts[String(productId)] || null;
}

module.exports = {
    getBoosts,
    getProductRankWeight,
    getProductBadge,
    getUrgencyWeights,
    getFeaturedArticles,
    getXPostWeights,
    getCampaignBoost,
    getEmptyBoosts,
};
