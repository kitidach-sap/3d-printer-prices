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
 * 7. BLOG CTA PERFORMANCE ANALYTICS
 * Aggregate blog_click events by cta_variant, cta_position, article_slug
 */
async function getBlogCTAPerformance(supabase, days = 7) {
    const since = new Date(Date.now() - days * 86400000).toISOString();

    // All blog events (clicks + views)
    const { data: events } = await supabase.from('click_events')
        .select('event_type, product_name, cta_variant, article_slug, cta_position, created_at')
        .in('event_type', ['blog_click', 'blog_view'])
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000);

    if (!events || events.length === 0) {
        return { period: `${days}d`, total_views: 0, total_clicks: 0,
            by_variant: [], by_position: [], by_article: [], by_product: [] };
    }

    const views = events.filter(e => e.event_type === 'blog_view');
    const clicks = events.filter(e => e.event_type === 'blog_click');

    const countBy = (arr, key) => {
        const m = {};
        arr.forEach(r => { const v = r[key]; if (v) m[v] = (m[v] || 0) + 1; });
        return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 20)
            .map(([name, count]) => ({ name, count }));
    };

    // CTR by article: clicks / views for each article
    const articleViews = {};
    const articleClicks = {};
    views.forEach(v => { if (v.article_slug) articleViews[v.article_slug] = (articleViews[v.article_slug] || 0) + 1; });
    clicks.forEach(c => { if (c.article_slug) articleClicks[c.article_slug] = (articleClicks[c.article_slug] || 0) + 1; });

    const articleCTR = Object.keys(articleViews).map(slug => ({
        slug,
        views: articleViews[slug] || 0,
        clicks: articleClicks[slug] || 0,
        ctr: articleViews[slug] > 0 ? Math.round((articleClicks[slug] || 0) / articleViews[slug] * 10000) / 100 : 0,
    })).sort((a, b) => b.ctr - a.ctr);

    return {
        period: `${days}d`,
        total_views: views.length,
        total_clicks: clicks.length,
        overall_ctr: views.length > 0 ? Math.round(clicks.length / views.length * 10000) / 100 : 0,
        by_variant: countBy(clicks, 'cta_variant'),
        by_position: countBy(clicks, 'cta_position'),
        by_article: articleCTR.slice(0, 20),
        by_product: countBy(clicks, 'product_name'),
    };
}

/**
 * 8. BLOG WINNERS — identify best CTA variants, positions, articles
 * Used by generator to weight selection toward high performers
 */
async function getBlogWinners(supabase) {
    const perf = await getBlogCTAPerformance(supabase, 14);
    const MIN_CLICKS = 3;

    // Best urgency variants
    const qualifiedVariants = perf.by_variant.filter(v => v.count >= MIN_CLICKS);
    const winnerVariant = qualifiedVariants.length > 0 ? qualifiedVariants[0].name : null;

    // Best positions
    const qualifiedPositions = perf.by_position.filter(p => p.count >= MIN_CLICKS);
    const winnerPosition = qualifiedPositions.length > 0 ? qualifiedPositions[0].name : null;

    // Best articles (by CTR, min 2 views)
    const qualifiedArticles = perf.by_article.filter(a => a.views >= 2 && a.clicks >= 1);
    const topArticles = qualifiedArticles.slice(0, 5).map(a => a.slug);

    // Compute variant weights for generator
    const variantWeights = {};
    const defaultVariants = [
        '(Updated today ⚠️)', '(Lower than usual 📉)', '(Limited stock ⚡)',
        '(Selling fast)', '(Lowest in 30 days 🔥)', '(Stock running low)',
        "(Today's best price)", '(Price may increase)', '(3 stores compared)', '(Just restocked 📦)'
    ];
    defaultVariants.forEach(v => { variantWeights[v] = 1.0; });

    if (perf.total_clicks >= MIN_CLICKS * 2) {
        const maxCount = Math.max(...perf.by_variant.map(v => v.count), 1);
        perf.by_variant.forEach(v => {
            if (variantWeights[v.name] !== undefined) {
                variantWeights[v.name] = 0.5 + (v.count / maxCount) * 1.5; // range 0.5–2.0
            }
        });
    }

    return {
        confidence: perf.total_clicks >= MIN_CLICKS * 5 ? 'high' : perf.total_clicks >= MIN_CLICKS ? 'medium' : 'low',
        total_clicks: perf.total_clicks,
        total_views: perf.total_views,
        winner_variant: winnerVariant,
        winner_position: winnerPosition,
        top_articles: topArticles,
        variant_weights: variantWeights,
        position_performance: perf.by_position,
    };
}

/**
 * 9. BLOG PRODUCT BOOSTS — products with high blog CTR get trending badge
 */
async function getBlogProductBoosts(supabase) {
    const perf = await getBlogCTAPerformance(supabase, 7);
    const MIN_BLOG_CLICKS = 2;

    const boosts = {};
    perf.by_product.forEach(p => {
        if (p.count >= MIN_BLOG_CLICKS) {
            const maxClicks = Math.max(...perf.by_product.map(x => x.count), 1);
            boosts[p.name] = {
                blog_clicks: p.count,
                trending_score: Math.round((p.count / maxClicks) * 100),
                badge: p.count >= maxClicks * 0.5 ? '🔥 Trending' : '📈 Rising',
            };
        }
    });

    return boosts;
}

/**
 * 6. FULL DASHBOARD (extended with blog analytics)
 * Combines all analytics into one response
 */
async function getDashboard(supabase) {
    const [analytics, abResults, optimizedWeights, trending, campaignBoosts, blogPerf, blogWinners, blogBoosts] = await Promise.all([
        getAnalytics(supabase, 7),
        getABTestResults(supabase, 14),
        getOptimizedWeights(supabase),
        getTrendingProducts(supabase),
        getCampaignBoosts(supabase).catch(() => ({})),
        getBlogCTAPerformance(supabase, 7).catch(() => ({})),
        getBlogWinners(supabase).catch(() => ({})),
        getBlogProductBoosts(supabase).catch(() => ({})),
    ]);

    return {
        generated_at: new Date().toISOString(),
        analytics,
        ab_testing: abResults,
        optimized_weights: optimizedWeights,
        trending_products: Object.values(trending).sort((a, b) => b.trending_score - a.trending_score).slice(0, 20),
        active_campaign_boosts: campaignBoosts,
        blog: {
            cta_performance: blogPerf,
            winners: blogWinners,
            product_boosts: blogBoosts,
        },
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
    getBlogCTAPerformance,
    getBlogWinners,
    getBlogProductBoosts,
};
