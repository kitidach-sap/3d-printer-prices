/**
 * Strategy Engine — Opportunity Detection, Forecasting, Exploration
 * 
 * Extends the Growth Brain beyond optimization into DISCOVERY:
 *   - Detect new product categories and blog topics
 *   - Forecast click growth and revenue potential
 *   - Reserve exploration budget for untested content
 *   - Generate strategic recommendations
 * 
 * This is NOT a redesign — it reads from existing analytics/winners/scaling
 * and produces actionable strategy output.
 */

const config = require('./config');
const analytics = require('./analytics');
const winners = require('./winners');

let _strategyCache = null;
let _strategyCacheTime = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN STRATEGY COMPUTATION
// ═══════════════════════════════════════════════════════════════════════════════

async function getStrategy(supabase, forceRefresh = false) {
    if (!config.STRATEGY_ENGINE_ENABLED) {
        return getEmptyStrategy('disabled');
    }

    const now = Date.now();
    if (!forceRefresh && _strategyCache && (now - _strategyCacheTime) < config.STRATEGY_RECALC_INTERVAL_MS) {
        return _strategyCache;
    }

    try {
        const [topProducts, topArticles, topSources, productWinners, articleWinners] = await Promise.all([
            analytics.getTopProducts(supabase, config.FORECAST_LOOKBACK_DAYS, 100).catch(() => []),
            analytics.getTopArticles(supabase, config.FORECAST_LOOKBACK_DAYS, 100).catch(() => []),
            analytics.getTopSources(supabase).catch(() => ({ all: [] })),
            winners.detectProductWinners(supabase).catch(() => ({ winners: [], losers: [], all: [] })),
            winners.detectArticleWinners(supabase).catch(() => ({ winners: [], losers: [], all: [] })),
        ]);

        const opportunities = detectOpportunities(topProducts, topArticles, productWinners, articleWinners);
        const contentGaps = detectContentGaps(topProducts, topArticles);
        const forecast = computeForecast(topProducts, topArticles);
        const exploration = computeExploration(topProducts, topArticles, productWinners);
        const strategic = generateStrategicRecommendations(opportunities, contentGaps, forecast, exploration, topSources);

        _strategyCache = {
            generated_at: new Date().toISOString(),
            enabled: true,
            opportunities,
            content_gaps: contentGaps,
            forecast,
            exploration,
            strategic_recommendations: strategic,
        };
        _strategyCacheTime = now;

        console.log(`🎯 Strategy: ${opportunities.length} opportunities, ${contentGaps.length} gaps, ${strategic.length} recommendations`);
    } catch (e) {
        console.log('Strategy Engine error:', e.message);
        _strategyCache = _strategyCache || getEmptyStrategy('error: ' + e.message);
    }

    return _strategyCache;
}

function getEmptyStrategy(reason) {
    return {
        generated_at: new Date().toISOString(),
        enabled: false,
        reason,
        opportunities: [],
        content_gaps: [],
        forecast: { products: [], articles: [], summary: {} },
        exploration: { budget: 0, candidates: [] },
        strategic_recommendations: [],
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPPORTUNITY DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function detectOpportunities(products, articles, productWinners, articleWinners) {
    const opportunities = [];
    const existingCategories = new Set();
    const existingTopics = new Set();

    // Map existing product categories (approximate from names)
    products.forEach(p => {
        const cat = extractCategory(p.product_name);
        existingCategories.add(cat);
    });

    // Detect rising products not yet well-covered
    const winners = productWinners.winners || [];
    winners.forEach(w => {
        const cat = extractCategory(w.product_name);
        const articlesInCat = articles.filter(a => 
            (a.slug || '').toLowerCase().includes(cat.toLowerCase())
        ).length;

        if (articlesInCat < config.MIN_CLUSTER_ARTICLES) {
            opportunities.push({
                type: 'product_expansion',
                category: cat,
                entity: w.product_name,
                signal: 'Winner product with thin content coverage',
                score: w.score,
                clicks: w.clicks,
                current_articles: articlesInCat,
                potential: 'high',
                action: `Create ${config.MIN_CLUSTER_ARTICLES - articlesInCat} more articles about ${cat}`,
            });
        }
    });

    // Detect rising article clusters
    const clusterPerf = {};
    articles.forEach(a => {
        const cluster = extractCluster(a.slug);
        if (!clusterPerf[cluster]) clusterPerf[cluster] = { clicks: 0, count: 0, articles: [] };
        clusterPerf[cluster].clicks += a.clicks || 0;
        clusterPerf[cluster].count++;
        clusterPerf[cluster].articles.push(a.slug);
    });

    Object.entries(clusterPerf).forEach(([cluster, data]) => {
        const avgClicks = data.count > 0 ? data.clicks / data.count : 0;
        if (avgClicks > 3 && data.count < 5) {
            opportunities.push({
                type: 'content_expansion',
                category: cluster,
                signal: 'High-performing cluster with room to grow',
                score: Math.round(avgClicks * 10),
                clicks: data.clicks,
                current_articles: data.count,
                potential: avgClicks > 5 ? 'high' : 'medium',
                action: `Expand "${cluster}" cluster — avg ${avgClicks.toFixed(1)} clicks/article`,
            });
        }
    });

    // Detect new/trending topics from recent clicks
    const recentProducts = products.filter(p => (p.clicks || 0) >= 2);
    const coveredProducts = new Set(articles.map(a => {
        const parts = (a.slug || '').split('-');
        return parts.slice(0, 3).join('-');
    }));

    recentProducts.forEach(p => {
        const nameKey = p.product_name.toLowerCase().replace(/\s+/g, '-').slice(0, 20);
        const hasCoverage = [...coveredProducts].some(slug => slug.includes(nameKey.slice(0, 10)));
        if (!hasCoverage && p.clicks >= 3) {
            opportunities.push({
                type: 'new_topic',
                category: extractCategory(p.product_name),
                entity: p.product_name,
                signal: 'Clicked product with no blog coverage',
                score: p.clicks * 5,
                clicks: p.clicks,
                current_articles: 0,
                potential: p.clicks >= 5 ? 'high' : 'medium',
                action: `Create blog content for "${p.product_name}"`,
            });
        }
    });

    return opportunities.sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 20);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTENT GAP DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function detectContentGaps(products, articles) {
    const gaps = [];
    const articleSlugs = articles.map(a => (a.slug || '').toLowerCase());

    // Products with clicks but no dedicated review/comparison articles
    products.forEach(p => {
        if ((p.clicks || 0) < 2) return;
        const name = p.product_name.toLowerCase();
        const nameTokens = name.split(/[\s-]+/).filter(t => t.length > 3);

        const hasReview = articleSlugs.some(s => nameTokens.some(t => s.includes(t)) && s.includes('review'));
        const hasComparison = articleSlugs.some(s => nameTokens.some(t => s.includes(t)) && (s.includes('vs') || s.includes('compare')));
        const hasBuyingGuide = articleSlugs.some(s => nameTokens.some(t => s.includes(t)) && (s.includes('guide') || s.includes('best')));

        const missing = [];
        if (!hasReview) missing.push('review');
        if (!hasComparison) missing.push('comparison');
        if (!hasBuyingGuide) missing.push('buying guide');

        if (missing.length > 0) {
            const coverage = 1 - (missing.length / 3);
            if (coverage <= config.CONTENT_GAP_THRESHOLD) {
                gaps.push({
                    entity: p.product_name,
                    clicks: p.clicks,
                    coverage: Math.round(coverage * 100) + '%',
                    missing_types: missing,
                    priority: p.clicks * missing.length,
                    action: `Create ${missing.join(' + ')} for "${p.product_name}"`,
                });
            }
        }
    });

    return gaps.sort((a, b) => b.priority - a.priority).slice(0, 15);
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE FORECAST
// ═══════════════════════════════════════════════════════════════════════════════

function computeForecast(products, articles) {
    // Simple linear projection based on recent performance
    const productForecasts = products.slice(0, 10).map(p => {
        const dailyRate = (p.clicks || 0) / config.FORECAST_LOOKBACK_DAYS;
        const projected = Math.round(dailyRate * config.FORECAST_PROJECT_DAYS);
        const growth = dailyRate > 0.5 ? 'growing' : dailyRate > 0.1 ? 'stable' : 'minimal';

        return {
            entity: p.product_name,
            current_clicks: p.clicks,
            daily_rate: Math.round(dailyRate * 100) / 100,
            projected_clicks_7d: projected,
            growth_trend: growth,
            revenue_potential: growth === 'growing' ? 'high' : growth === 'stable' ? 'medium' : 'low',
        };
    });

    const articleForecasts = articles.slice(0, 10).map(a => {
        const dailyRate = (a.clicks || 0) / config.FORECAST_LOOKBACK_DAYS;
        const projected = Math.round(dailyRate * config.FORECAST_PROJECT_DAYS);

        return {
            entity: a.slug,
            current_clicks: a.clicks,
            daily_rate: Math.round(dailyRate * 100) / 100,
            projected_clicks_7d: projected,
            growth_trend: dailyRate > 0.3 ? 'growing' : dailyRate > 0.05 ? 'stable' : 'minimal',
        };
    });

    const totalCurrentClicks = products.reduce((sum, p) => sum + (p.clicks || 0), 0);
    const totalDailyRate = totalCurrentClicks / config.FORECAST_LOOKBACK_DAYS;
    const projected7d = Math.round(totalDailyRate * 7);

    return {
        products: productForecasts,
        articles: articleForecasts,
        summary: {
            total_clicks_lookback: totalCurrentClicks,
            avg_daily_clicks: Math.round(totalDailyRate * 100) / 100,
            projected_7d: projected7d,
            top_grower: productForecasts.find(p => p.growth_trend === 'growing')?.entity || 'none',
            lookback_days: config.FORECAST_LOOKBACK_DAYS,
            projection_days: config.FORECAST_PROJECT_DAYS,
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPLORATION MODE — reserve budget for new/untested content
// ═══════════════════════════════════════════════════════════════════════════════

function computeExploration(products, articles, productWinners) {
    const totalSlots = products.length || 10;
    const exploreBudget = Math.max(config.EXPLORATION_MIN_BUDGET, Math.round(totalSlots * config.EXPLORATION_RESERVE_RATIO));

    // Find underexplored products (few clicks, not yet categorized)
    const winnerNames = new Set((productWinners.winners || []).map(w => w.product_name));
    const loserNames = new Set((productWinners.losers || []).map(l => l.product_name));

    const unexplored = products
        .filter(p => !winnerNames.has(p.product_name) && !loserNames.has(p.product_name))
        .filter(p => (p.clicks || 0) < config.MIN_CLICKS_FOR_SCALING)
        .slice(0, exploreBudget);

    // Find article topics not yet covered
    const existingSlugs = new Set(articles.map(a => extractCluster(a.slug)));
    const potentialTopics = [
        'best-budget', 'fastest', 'comparison', 'review', 'guide',
        'beginner', 'professional', 'industrial', 'resin', 'filament'
    ].filter(t => !existingSlugs.has(t));

    return {
        budget: exploreBudget,
        used: unexplored.length,
        remaining: Math.max(0, exploreBudget - unexplored.length),
        candidates: unexplored.map(p => ({
            entity: p.product_name,
            clicks: p.clicks,
            status: 'unexplored',
            action: 'Test with blog content or X posts',
        })),
        topic_suggestions: potentialTopics.slice(0, 5).map(t => ({
            topic: t,
            status: 'uncovered',
            action: `Create articles in "${t}" niche`,
        })),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRATEGIC RECOMMENDATIONS — high-level actionable advice
// ═══════════════════════════════════════════════════════════════════════════════

function generateStrategicRecommendations(opportunities, gaps, forecast, exploration, sources) {
    const recs = [];

    // From opportunities
    const highOps = opportunities.filter(o => o.potential === 'high');
    if (highOps.length > 0) {
        recs.push({
            priority: 90,
            type: 'expansion',
            title: `Expand into ${highOps.length} high-potential ${highOps.length === 1 ? 'area' : 'areas'}`,
            detail: highOps.map(o => o.action).join('; '),
            data: { count: highOps.length, top: highOps[0]?.category },
            confidence: 'high',
        });
    }

    // From content gaps
    if (gaps.length >= 3) {
        recs.push({
            priority: 85,
            type: 'content_gap',
            title: `Fill ${gaps.length} content gaps for clicked products`,
            detail: `Top gap: ${gaps[0]?.entity} (missing ${gaps[0]?.missing_types?.join(', ')})`,
            data: { total_gaps: gaps.length, top_entity: gaps[0]?.entity },
            confidence: 'high',
        });
    }

    // From forecast
    const growers = forecast.products.filter(p => p.growth_trend === 'growing');
    if (growers.length > 0) {
        recs.push({
            priority: 80,
            type: 'forecast',
            title: `${growers.length} products showing growth — increase content investment`,
            detail: `Top grower: "${growers[0]?.entity}" at ${growers[0]?.daily_rate} clicks/day`,
            data: { growers: growers.length, projected_7d: forecast.summary.projected_7d },
            confidence: 'medium',
        });
    }

    // Exploration
    if (exploration.remaining > 0) {
        recs.push({
            priority: 70,
            type: 'exploration',
            title: `Use ${exploration.remaining} exploration slots for new products/topics`,
            detail: exploration.topic_suggestions.map(t => `"${t.topic}"`).join(', '),
            data: { budget: exploration.budget, remaining: exploration.remaining },
            confidence: 'medium',
        });
    }

    // Source dependency warning
    const sourceList = sources?.all || [];
    if (sourceList.length > 0) {
        const topSource = sourceList[0];
        const topRatio = topSource.count / Math.max(1, sourceList.reduce((s, x) => s + x.count, 0));
        if (topRatio > 0.6) {
            recs.push({
                priority: 75,
                type: 'risk',
                title: `Reduce dependency on "${topSource.name}" (${Math.round(topRatio * 100)}% of traffic)`,
                detail: 'Diversify traffic sources to reduce single-source risk',
                data: { source: topSource.name, ratio: Math.round(topRatio * 100) },
                confidence: 'high',
            });
        }
    }

    // Cluster expansion
    const expansionOps = opportunities.filter(o => o.type === 'content_expansion');
    expansionOps.forEach(op => {
        recs.push({
            priority: op.score,
            type: 'cluster_expansion',
            title: `Create ${config.MIN_CLUSTER_ARTICLES - op.current_articles} more articles in "${op.category}"`,
            detail: op.action,
            data: { cluster: op.category, current: op.current_articles, target: config.MIN_CLUSTER_ARTICLES },
            confidence: op.potential === 'high' ? 'high' : 'medium',
        });
    });

    return recs.sort((a, b) => b.priority - a.priority).slice(0, 15);
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function extractCategory(name) {
    // Extract brand/category from product name (first 1-2 words)
    const parts = (name || '').split(/[\s-]+/);
    return parts.slice(0, 2).join(' ').toUpperCase() || 'UNKNOWN';
}

function extractCluster(slug) {
    const parts = (slug || '').split('-');
    return parts.slice(0, 2).join('-');
}

module.exports = {
    getStrategy,
    getEmptyStrategy,
};
