/**
 * Data-Driven Optimization Engine
 * 
 * Uses real click_events + x_posts data to:
 * 1. Aggregate analytics (top products, badges, sources, CTR)
 * 2. A/B test tweet variations (hook_type, angle_type, cta_type)
 * 3. Auto-winner logic (boost high performers, suppress low)
 * 4. Smart rank boost (trending products, CTR-based)
 * 5. Campaign boost (override ranking for active campaigns)
 */

const TRENDING_WINDOW_DAYS = 7;
const MIN_CLICKS_FOR_TRENDING = 3;
const AB_MIN_POSTS = 5; // minimum posts before declaring a winner

/**
 * 1. ANALYTICS AGGREGATOR
 * Computes top products, badges, sources, CTR per product
 */
async function getAnalytics(supabase, days = 7) {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Fetch click events
    const { data: events } = await supabase.from('click_events')
        .select('event_type, product_id, product_name, price, badge, source, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000);

    if (!events || events.length === 0) {
        return { period: `${days}d`, total_events: 0, total_clicks: 0, 
            top_products: [], top_badges: [], top_sources: [], ctr_by_product: [], ab_results: {} };
    }

    const clicks = events.filter(e => e.event_type === 'click');
    const compares = events.filter(e => e.event_type === 'compare');
    const visits = events.filter(e => e.event_type === 'visit');

    // Aggregate functions
    const countBy = (arr, key) => {
        const m = {};
        arr.forEach(r => { const v = r[key] || 'unknown'; m[v] = (m[v] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 20)
            .map(([name, count]) => ({ name, count }));
    };

    // CTR per product: clicks / total_visits (rough proxy)
    const totalVisits = Math.max(visits.length, 1);
    const productClicks = {};
    clicks.forEach(c => {
        const key = c.product_name || c.product_id || 'unknown';
        if (!productClicks[key]) productClicks[key] = { clicks: 0, product_id: c.product_id };
        productClicks[key].clicks++;
    });

    const ctrByProduct = Object.entries(productClicks)
        .map(([name, d]) => ({
            name, clicks: d.clicks, product_id: d.product_id,
            ctr: Math.round((d.clicks / totalVisits) * 10000) / 100, // percentage
        }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 30);

    return {
        period: `${days}d`,
        total_events: events.length,
        total_clicks: clicks.length,
        total_compares: compares.length,
        total_visits: visits.length,
        top_products: countBy(clicks, 'product_name'),
        top_badges: countBy(clicks.filter(c => c.badge), 'badge'),
        top_sources: countBy(events, 'source'),
        ctr_by_product: ctrByProduct,
    };
}

/**
 * 2. A/B TEST SYSTEM
 * Compares performance of hook_type, angle_type, cta_type from x_posts
 */
async function getABTestResults(supabase, days = 14) {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // Fetch posted tweets with tracking columns
    const { data: posts } = await supabase.from('x_posts')
        .select('id, tweet_id, hook_type, angle_type, cta_type, product_asin, product_name, posted_at')
        .eq('status', 'posted')
        .gte('posted_at', since)
        .order('posted_at', { ascending: false })
        .limit(200);

    if (!posts || posts.length === 0) {
        return { period: `${days}d`, total_posts: 0, by_hook: [], by_angle: [], by_cta: [], winners: {} };
    }

    // Fetch click events that happened after tweets were posted
    const { data: clicks } = await supabase.from('click_events')
        .select('source, product_name, created_at')
        .eq('source', 'twitter')
        .gte('created_at', since)
        .limit(1000);

    const twitterClicks = clicks?.length || 0;

    // Group posts by variation type
    const groupPerf = (field) => {
        const groups = {};
        posts.forEach(p => {
            const val = p[field] || 'unknown';
            if (!groups[val]) groups[val] = { posts: 0, products: new Set() };
            groups[val].posts++;
            if (p.product_name) groups[val].products.add(p.product_name);
        });

        // Match clicks to groups (approximate: by product name overlap)
        const clicksByProduct = {};
        (clicks || []).forEach(c => {
            const pn = c.product_name || 'unknown';
            clicksByProduct[pn] = (clicksByProduct[pn] || 0) + 1;
        });

        return Object.entries(groups).map(([name, g]) => {
            let matchedClicks = 0;
            g.products.forEach(pn => { matchedClicks += (clicksByProduct[pn] || 0); });
            const engagementRate = g.posts > 0 ? Math.round((matchedClicks / g.posts) * 100) / 100 : 0;
            return { name, posts: g.posts, matched_clicks: matchedClicks, engagement_rate: engagementRate };
        }).sort((a, b) => b.engagement_rate - a.engagement_rate);
    };

    const byHook = groupPerf('hook_type');
    const byAngle = groupPerf('angle_type');
    const byCta = groupPerf('cta_type');

    // Determine winners (only if enough data)
    const findWinner = (arr) => {
        const qualified = arr.filter(a => a.posts >= AB_MIN_POSTS);
        if (qualified.length < 2) return null;
        return qualified[0]; // highest engagement rate
    };

    return {
        period: `${days}d`,
        total_posts: posts.length,
        twitter_clicks: twitterClicks,
        by_hook: byHook,
        by_angle: byAngle,
        by_cta: byCta,
        winners: {
            hook: findWinner(byHook)?.name || null,
            angle: findWinner(byAngle)?.name || null,
            cta: findWinner(byCta)?.name || null,
        },
    };
}

/**
 * 3. AUTO WINNER LOGIC
 * Returns adjusted weights for angle selection based on A/B results
 * Higher engagement → higher weight → selected more often
 */
async function getOptimizedWeights(supabase) {
    const ab = await getABTestResults(supabase, 14);
    const defaultAngles = [
        'scroll_stopper', 'problem_solution', 'beginner',
        'curiosity', 'deal_urgency', 'comparison', 'mistake_avoidance'
    ];

    // Start with equal weights
    const weights = {};
    defaultAngles.forEach(a => { weights[a] = 1.0; });

    if (ab.total_posts < AB_MIN_POSTS * 2) {
        // Not enough data — return equal weights
        return { weights, confidence: 'low', total_posts: ab.total_posts, reason: 'insufficient_data' };
    }

    // Boost winners, suppress losers
    ab.by_angle.forEach(a => {
        if (!weights[a.name]) return;
        if (a.engagement_rate > 0) {
            // Scale weight by relative engagement
            const maxRate = Math.max(...ab.by_angle.map(x => x.engagement_rate), 1);
            weights[a.name] = 0.5 + (a.engagement_rate / maxRate) * 1.5; // range: 0.5 to 2.0
        } else if (a.posts >= AB_MIN_POSTS) {
            // Enough posts but zero engagement — suppress
            weights[a.name] = 0.3;
        }
    });

    return {
        weights,
        confidence: ab.total_posts >= AB_MIN_POSTS * 5 ? 'high' : 'medium',
        total_posts: ab.total_posts,
        winners: ab.winners,
    };
}

/**
 * Select a weighted-random angle based on optimized weights
 */
function selectWeightedAngle(weights) {
    const entries = Object.entries(weights);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (const [angle, weight] of entries) {
        random -= weight;
        if (random <= 0) return angle;
    }
    return entries[0][0]; // fallback
}

/**
 * 4. SMART RANK BOOST
 * Computes trending_score for products based on recent click_events
 * Returns a map: product_id → { trending_score, click_count, badge }
 */
async function getTrendingProducts(supabase) {
    const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 86400000).toISOString();

    const { data: clicks } = await supabase.from('click_events')
        .select('product_id, product_name')
        .eq('event_type', 'click')
        .gte('created_at', since)
        .limit(2000);

    if (!clicks || clicks.length === 0) return {};

    // Count clicks per product
    const productMap = {};
    clicks.forEach(c => {
        const id = c.product_id;
        if (!id) return;
        if (!productMap[id]) productMap[id] = { clicks: 0, name: c.product_name };
        productMap[id].clicks++;
    });

    // Compute trending score (normalized 0-100)
    const maxClicks = Math.max(...Object.values(productMap).map(p => p.clicks), 1);
    const trending = {};

    Object.entries(productMap).forEach(([id, data]) => {
        if (data.clicks >= MIN_CLICKS_FOR_TRENDING) {
            trending[id] = {
                trending_score: Math.round((data.clicks / maxClicks) * 100),
                click_count: data.clicks,
                badge: data.clicks >= maxClicks * 0.5 ? '🔥 Trending' : null,
                name: data.name,
            };
        }
    });

    return trending;
}

/**
 * 5. CAMPAIGN BOOST
 * Products with active campaigns get rank boost + increased X frequency
 */
async function getCampaignBoosts(supabase) {
    const { data: campaigns } = await supabase.from('campaigns')
        .select('id, name, product_id, boost_rank, status')
        .eq('status', 'active')
        .limit(50);

    if (!campaigns || campaigns.length === 0) return {};

    const boosts = {};
    campaigns.forEach(c => {
        if (c.product_id) {
            boosts[c.product_id] = {
                campaign_id: c.id,
                campaign_name: c.name,
                rank_boost: c.boost_rank || 10, // default boost points
                x_frequency_multiplier: 2, // double posting frequency
            };
        }
    });

    return boosts;
}

/**
 * 6. FULL DASHBOARD
 * Combines all analytics into one response
 */
async function getDashboard(supabase) {
    const [analytics, abResults, optimizedWeights, trending, campaignBoosts] = await Promise.all([
        getAnalytics(supabase, 7),
        getABTestResults(supabase, 14),
        getOptimizedWeights(supabase),
        getTrendingProducts(supabase),
        getCampaignBoosts(supabase).catch(() => ({})), // campaigns table may not exist
    ]);

    return {
        generated_at: new Date().toISOString(),
        analytics,
        ab_testing: abResults,
        optimized_weights: optimizedWeights,
        trending_products: Object.values(trending).sort((a, b) => b.trending_score - a.trending_score).slice(0, 20),
        active_campaign_boosts: campaignBoosts,
    };
}

module.exports = {
    getAnalytics,
    getABTestResults,
    getOptimizedWeights,
    selectWeightedAngle,
    getTrendingProducts,
    getCampaignBoosts,
    getDashboard,
};
