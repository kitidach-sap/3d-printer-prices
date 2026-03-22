/**
 * Revenue Prediction & Allocation Engine
 * 
 * Predicts future revenue per product/campaign/article/source,
 * allocates resources across channels, detects risk, and outputs
 * weekly strategy plans.
 * 
 * Data-driven, safe, non-blocking — reads from existing analytics
 * without modifying any upstream systems.
 */

// ═══════════════════════════════════════════════════════════════════════════════
// 1. REVENUE PREDICTION — Forecasts revenue per entity
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple exponential moving average (EMA) for time-series prediction
 */
function ema(values, alpha = 0.3) {
    if (!values.length) return 0;
    let result = values[0];
    for (let i = 1; i < values.length; i++) {
        result = alpha * values[i] + (1 - alpha) * result;
    }
    return result;
}

/**
 * Linear trend: slope from simple linear regression
 */
function linearTrend(values) {
    const n = values.length;
    if (n < 2) return { slope: 0, intercept: values[0] || 0 };
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX) || 0;
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
}

/**
 * Predict next N periods from historical data
 */
function predictTimeSeries(values, periods = 7) {
    if (values.length === 0) return { forecast: Array(periods).fill(0), confidence: 0, trend: 'flat' };

    const { slope, intercept } = linearTrend(values);
    const n = values.length;
    const emaValue = ema(values);

    // Blend: 60% trend-based, 40% EMA
    const forecast = [];
    for (let i = 0; i < periods; i++) {
        const trendVal = intercept + slope * (n + i);
        const blended = 0.6 * trendVal + 0.4 * emaValue;
        forecast.push(Math.max(0, Math.round(blended * 100) / 100));
    }

    // Confidence: based on data volume and variance
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 1; // coefficient of variation
    const dataScore = Math.min(1, n / 14); // more data = more confidence (cap at 14 days)
    const stabilityScore = Math.max(0, 1 - cv); // less variance = more confidence
    const confidence = Math.round(((dataScore * 0.5 + stabilityScore * 0.5) * 100));

    const trend = slope > 0.05 ? 'rising' : slope < -0.05 ? 'declining' : 'flat';

    return { forecast, confidence, trend, slope: Math.round(slope * 1000) / 1000 };
}

/**
 * Predict revenue for all entities
 * @param {Object} data — { products, campaigns, articles, sources }
 *   each: array of { id, name, daily_revenue: number[] (last 14 days) }
 */
function predictRevenue(data) {
    const predictions = {};

    ['products', 'campaigns', 'articles', 'sources'].forEach(category => {
        const items = data[category] || [];
        predictions[category] = items.map(item => {
            const { forecast, confidence, trend, slope } = predictTimeSeries(item.daily_revenue || [], 7);
            const totalForecast = forecast.reduce((s, v) => s + v, 0);
            const currentWeekly = (item.daily_revenue || []).slice(-7).reduce((s, v) => s + v, 0);

            return {
                id: item.id,
                name: item.name,
                current_weekly: Math.round(currentWeekly * 100) / 100,
                predicted_weekly: Math.round(totalForecast * 100) / 100,
                change_pct: currentWeekly > 0
                    ? Math.round(((totalForecast - currentWeekly) / currentWeekly) * 100)
                    : totalForecast > 0 ? 100 : 0,
                trend,
                confidence,
                daily_forecast: forecast,
                slope,
            };
        }).sort((a, b) => b.predicted_weekly - a.predicted_weekly);
    });

    // Summary
    const totalCurrent = Object.values(predictions).flat().reduce((s, p) => s + p.current_weekly, 0) / 4; // deduplicated
    const totalPredicted = Object.values(predictions).flat().reduce((s, p) => s + p.predicted_weekly, 0) / 4;

    return {
        predictions,
        summary: {
            current_weekly_total: Math.round(totalCurrent * 100) / 100,
            predicted_weekly_total: Math.round(totalPredicted * 100) / 100,
            overall_trend: totalPredicted > totalCurrent * 1.05 ? 'growing'
                : totalPredicted < totalCurrent * 0.95 ? 'declining' : 'stable',
            generated_at: new Date().toISOString(),
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. CHANNEL ALLOCATION — Decide focus: blog vs X vs campaign
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate optimal channel allocation based on ROI per channel
 * @param {Object} channelData — { blog, twitter, campaigns, organic, direct }
 *   each: { impressions, clicks, revenue, cost }
 */
function allocateChannels(channelData) {
    const channels = [];

    Object.entries(channelData).forEach(([name, stats]) => {
        const revenue = stats.revenue || 0;
        const cost = stats.cost || 0;
        const clicks = stats.clicks || 0;
        const impressions = stats.impressions || 0;

        const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : (revenue > 0 ? 999 : 0);
        const epc = clicks > 0 ? revenue / clicks : 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

        // Efficiency score: combination of ROI, EPC, and volume
        const volumeScore = Math.min(1, clicks / 100); // more clicks = more data
        const roiScore = Math.min(1, Math.max(0, roi / 200)); // cap ROI score at 200%
        const epcScore = Math.min(1, epc / 0.50); // cap EPC score at $0.50
        const efficiencyScore = Math.round((roiScore * 0.4 + epcScore * 0.4 + volumeScore * 0.2) * 100);

        channels.push({
            channel: name,
            revenue: Math.round(revenue * 100) / 100,
            cost: Math.round(cost * 100) / 100,
            roi: Math.round(roi),
            epc: Math.round(epc * 1000) / 1000,
            ctr: Math.round(ctr * 100) / 100,
            clicks,
            efficiency_score: efficiencyScore,
        });
    });

    // Sort by efficiency
    channels.sort((a, b) => b.efficiency_score - a.efficiency_score);

    // Calculate allocation percentages (proportional to efficiency)
    const totalEfficiency = channels.reduce((s, c) => s + c.efficiency_score, 0) || 1;
    channels.forEach(c => {
        c.allocation_pct = Math.round((c.efficiency_score / totalEfficiency) * 100);
    });

    // Determine recommendations
    const recommendations = [];
    channels.forEach((c, i) => {
        if (i === 0) recommendations.push({ action: 'increase', channel: c.channel, reason: `Highest efficiency (${c.efficiency_score}/100)` });
        if (c.roi < 0) recommendations.push({ action: 'reduce', channel: c.channel, reason: `Negative ROI (${c.roi}%)` });
        if (c.epc > 0.20 && c.clicks < 50) recommendations.push({ action: 'scale', channel: c.channel, reason: `High EPC ($${c.epc}) but low volume — potential for growth` });
        if (c.ctr < 1 && c.impressions > 500) recommendations.push({ action: 'optimize', channel: c.channel, reason: `Low CTR (${c.ctr}%) despite high impressions — improve content` });
    });

    return { channels, recommendations, generated_at: new Date().toISOString() };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PRODUCT INVESTMENT — Allocate boost, content, exposure
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Decide per-product investment: boost, content creation, exposure level
 * @param {Array} products — [{ id, name, clicks, revenue, conversion_rate, trend, confidence }]
 */
function allocateProductInvestment(products) {
    if (!products.length) return { investments: [], summary: {} };

    // Score each product
    const scored = products.map(p => {
        const clicks = p.clicks || 0;
        const revenue = p.revenue || 0;
        const convRate = p.conversion_rate || 0;
        const trend = p.trend || 'flat';

        // Revenue potential score
        const revenueScore = Math.min(10, revenue / 5); // $50 = perfect score
        const clickScore = Math.min(10, clicks / 20); // 200 clicks = max
        const convScore = Math.min(10, convRate * 100); // 10% conv = max
        const trendBonus = trend === 'rising' ? 2 : trend === 'declining' ? -2 : 0;

        const investmentScore = Math.round(
            revenueScore * 0.35 + clickScore * 0.25 + convScore * 0.25 + trendBonus * 0.15
        );

        // Determine allocation tier
        let tier, boostLevel, contentAction, exposureLevel;
        if (investmentScore >= 7) {
            tier = 'star';
            boostLevel = 'max';
            contentAction = 'deep_dive + comparison';
            exposureLevel = 'featured';
        } else if (investmentScore >= 4) {
            tier = 'growth';
            boostLevel = 'medium';
            contentAction = 'review + mention';
            exposureLevel = 'promoted';
        } else if (investmentScore >= 2) {
            tier = 'maintain';
            boostLevel = 'low';
            contentAction = 'mention_only';
            exposureLevel = 'normal';
        } else {
            tier = 'monitor';
            boostLevel = 'none';
            contentAction = 'none';
            exposureLevel = 'reduced';
        }

        return {
            id: p.id,
            name: p.name,
            investment_score: investmentScore,
            tier,
            boost_level: boostLevel,
            content_action: contentAction,
            exposure_level: exposureLevel,
            metrics: { clicks, revenue: Math.round(revenue * 100) / 100, conversion_rate: convRate, trend },
        };
    }).sort((a, b) => b.investment_score - a.investment_score);

    const summary = {
        stars: scored.filter(s => s.tier === 'star').length,
        growth: scored.filter(s => s.tier === 'growth').length,
        maintain: scored.filter(s => s.tier === 'maintain').length,
        monitor: scored.filter(s => s.tier === 'monitor').length,
    };

    return { investments: scored, summary };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. RISK DETECTION — Detect revenue drops, auto-reduce exposure
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Detect revenue risks and generate alerts
 * @param {Object} data — { products, campaigns, channels }
 */
function detectRisks(data) {
    const risks = [];
    const now = new Date();

    // ── Product risks ──
    (data.products || []).forEach(p => {
        const daily = p.daily_revenue || [];
        if (daily.length < 3) return;

        const recent = daily.slice(-3).reduce((s, v) => s + v, 0) / 3;
        const prior = daily.slice(-7, -3).reduce((s, v) => s + v, 0) / Math.max(1, daily.slice(-7, -3).length);

        if (prior > 0 && recent < prior * 0.5) {
            risks.push({
                type: 'revenue_drop',
                entity: 'product',
                id: p.id,
                name: p.name,
                severity: recent < prior * 0.25 ? 'critical' : 'warning',
                drop_pct: Math.round(((prior - recent) / prior) * 100),
                message: `${p.name}: revenue dropped ${Math.round(((prior - recent) / prior) * 100)}% (last 3d vs prior 4d)`,
                action: 'reduce_exposure',
                detected_at: now.toISOString(),
            });
        }

        // Zero revenue for 3+ days
        if (daily.slice(-3).every(v => v === 0) && daily.slice(-7, -3).some(v => v > 0)) {
            risks.push({
                type: 'revenue_zero',
                entity: 'product',
                id: p.id,
                name: p.name,
                severity: 'critical',
                message: `${p.name}: zero revenue for 3+ consecutive days`,
                action: 'investigate',
                detected_at: now.toISOString(),
            });
        }
    });

    // ── Campaign risks ──
    (data.campaigns || []).forEach(c => {
        const daily = c.daily_revenue || [];
        if (daily.length < 3) return;
        const recent = daily.slice(-3).reduce((s, v) => s + v, 0) / 3;
        const prior = daily.slice(-7, -3).reduce((s, v) => s + v, 0) / Math.max(1, daily.slice(-7, -3).length);

        if (prior > 0 && recent < prior * 0.6) {
            risks.push({
                type: 'campaign_decline',
                entity: 'campaign',
                id: c.id,
                name: c.name,
                severity: 'warning',
                drop_pct: Math.round(((prior - recent) / prior) * 100),
                message: `Campaign "${c.name}": declining ${Math.round(((prior - recent) / prior) * 100)}%`,
                action: 'review_campaign',
                detected_at: now.toISOString(),
            });
        }
    });

    // ── Channel risks ──
    (data.channels || []).forEach(ch => {
        if (ch.roi !== undefined && ch.roi < -20) {
            risks.push({
                type: 'negative_roi',
                entity: 'channel',
                name: ch.channel,
                severity: ch.roi < -50 ? 'critical' : 'warning',
                message: `${ch.channel}: negative ROI (${ch.roi}%) — burning money`,
                action: 'pause_or_reduce',
                detected_at: now.toISOString(),
            });
        }
    });

    // Sort by severity
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    risks.sort((a, b) => (severityOrder[a.severity] || 2) - (severityOrder[b.severity] || 2));

    return {
        risks,
        summary: {
            total: risks.length,
            critical: risks.filter(r => r.severity === 'critical').length,
            warnings: risks.filter(r => r.severity === 'warning').length,
        },
        generated_at: now.toISOString(),
    };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. STRATEGY OUTPUT — Weekly plan & recommended actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate weekly strategy plan from all prediction/allocation data
 */
function generateWeeklyPlan(predictionResult, allocationResult, investmentResult, riskResult) {
    const plan = {
        week_of: new Date().toISOString().split('T')[0],
        generated_at: new Date().toISOString(),
        priority_actions: [],
        channel_focus: [],
        product_focus: [],
        risk_mitigations: [],
        metrics_targets: {},
    };

    // ── Priority actions from risks ──
    (riskResult.risks || []).forEach(risk => {
        if (risk.severity === 'critical') {
            plan.priority_actions.push({
                priority: 'P0',
                action: risk.action,
                target: risk.name,
                reason: risk.message,
            });
        } else {
            plan.risk_mitigations.push({
                priority: 'P1',
                action: risk.action,
                target: risk.name,
                reason: risk.message,
            });
        }
    });

    // ── Channel focus ──
    (allocationResult.channels || []).slice(0, 3).forEach(ch => {
        plan.channel_focus.push({
            channel: ch.channel,
            allocation_pct: ch.allocation_pct,
            efficiency_score: ch.efficiency_score,
            recommended: ch.allocation_pct >= 30 ? 'increase_investment' : 'maintain',
        });
    });

    // ── Product focus (top 5 stars/growth) ──
    (investmentResult.investments || []).filter(i => i.tier === 'star' || i.tier === 'growth').slice(0, 5).forEach(inv => {
        plan.product_focus.push({
            product: inv.name,
            tier: inv.tier,
            boost_level: inv.boost_level,
            content_action: inv.content_action,
            score: inv.investment_score,
        });
    });

    // ── Add allocation recommendations as actions ──
    (allocationResult.recommendations || []).forEach(rec => {
        plan.priority_actions.push({
            priority: rec.action === 'reduce' ? 'P1' : 'P2',
            action: rec.action,
            target: rec.channel,
            reason: rec.reason,
        });
    });

    // ── Metrics targets ──
    const summary = predictionResult.summary || {};
    plan.metrics_targets = {
        target_weekly_revenue: summary.predicted_weekly_total || 0,
        current_weekly_revenue: summary.current_weekly_total || 0,
        growth_target_pct: summary.overall_trend === 'growing' ? 10 : summary.overall_trend === 'declining' ? -5 : 5,
        risk_count_target: 0,
    };

    // Sort priority actions
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    plan.priority_actions.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

    return plan;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ORCHESTRATOR — Run full prediction + allocation cycle
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run full prediction cycle using Supabase data
 * @param {Object} supabase — Supabase client
 */
async function runPredictionCycle(supabase) {
    const results = { predictions: null, allocation: null, investment: null, risks: null, plan: null };

    try {
        // ── Fetch data ──
        const [productsRes, clicksRes, campaignsRes, blogRes] = await Promise.all([
            supabase.from('products')
                .select('id, product_name, display_name, brand, price, clicks, category, rating, review_count, discount_percent')
                .eq('is_available', true).order('clicks', { ascending: false }).limit(50),
            supabase.from('click_events')
                .select('product_id, source, timestamp, session_id')
                .order('timestamp', { ascending: false }).limit(2000),
            supabase.from('creator_campaigns')
                .select('id, campaign_name, total_clicks, status')
                .eq('status', 'active').catch(() => ({ data: [] })),
            supabase.from('blog_posts')
                .select('slug, title, is_published')
                .eq('is_published', true).catch(() => ({ data: [] })),
        ]);

        const products = productsRes.data || [];
        const clicks = clicksRes.data || [];
        const campaigns = campaignsRes.data || [];
        const blogPosts = blogRes.data || [];

        // ── Build daily revenue arrays (last 14 days) ──
        const now = new Date();
        const days = 14;

        function buildDaily(events, idField) {
            const daily = {};
            events.forEach(e => {
                const id = e[idField];
                if (!id) return;
                const daysDiff = Math.floor((now - new Date(e.timestamp)) / 86400000);
                if (daysDiff < 0 || daysDiff >= days) return;
                if (!daily[id]) daily[id] = new Array(days).fill(0);
                daily[id][days - 1 - daysDiff] += 0.05; // estimated revenue per click
            });
            return daily;
        }

        const productDaily = buildDaily(clicks, 'product_id');

        // Build per-source daily
        const sourceDailyMap = {};
        clicks.forEach(e => {
            const src = e.source || 'direct';
            const daysDiff = Math.floor((now - new Date(e.timestamp)) / 86400000);
            if (daysDiff < 0 || daysDiff >= days) return;
            if (!sourceDailyMap[src]) sourceDailyMap[src] = new Array(days).fill(0);
            sourceDailyMap[src][days - 1 - daysDiff] += 0.05;
        });

        // ── Prediction ──
        const predictionData = {
            products: products.map(p => ({
                id: p.id,
                name: p.display_name || p.product_name,
                daily_revenue: productDaily[p.id] || [],
            })),
            campaigns: campaigns.map(c => ({
                id: c.id,
                name: c.campaign_name,
                daily_revenue: [], // campaigns don't have daily data yet
            })),
            articles: blogPosts.slice(0, 20).map(b => ({
                id: b.slug,
                name: b.title,
                daily_revenue: [], // articles don't have daily revenue yet
            })),
            sources: Object.entries(sourceDailyMap).map(([src, daily]) => ({
                id: src,
                name: src,
                daily_revenue: daily,
            })),
        };

        results.predictions = predictRevenue(predictionData);

        // ── Channel Allocation ──
        const channelData = {};
        Object.entries(sourceDailyMap).forEach(([src, daily]) => {
            const totalRev = daily.reduce((s, v) => s + v, 0);
            const totalClicks = clicks.filter(c => (c.source || 'direct') === src).length;
            channelData[src] = {
                revenue: totalRev,
                cost: 0, // no cost data yet
                clicks: totalClicks,
                impressions: totalClicks * 10, // rough estimate
            };
        });
        // Add blog channel
        channelData.blog = {
            revenue: Object.values(sourceDailyMap).flat().reduce((s, v) => s + v, 0) * 0.3, // rough blog attribution
            cost: 0,
            clicks: clicks.filter(c => (c.source || '').includes('blog')).length || Math.round(clicks.length * 0.2),
            impressions: blogPosts.length * 100,
        };
        // Add twitter channel
        channelData.twitter = {
            revenue: Object.values(sourceDailyMap).flat().reduce((s, v) => s + v, 0) * 0.1,
            cost: 0,
            clicks: clicks.filter(c => (c.source || '').includes('twitter') || (c.source || '').includes('x.com')).length,
            impressions: 0,
        };

        results.allocation = allocateChannels(channelData);

        // ── Product Investment ──
        const investmentProducts = products.slice(0, 30).map(p => {
            const daily = productDaily[p.id] || [];
            const { trend } = predictTimeSeries(daily);
            const totalClicks = p.clicks || clicks.filter(c => c.product_id === p.id).length;
            const totalRevenue = daily.reduce((s, v) => s + v, 0);

            return {
                id: p.id,
                name: p.display_name || p.product_name,
                clicks: totalClicks,
                revenue: totalRevenue,
                conversion_rate: totalClicks > 0 ? totalRevenue / (totalClicks * 0.05) * 0.01 : 0,
                trend,
            };
        });
        results.investment = allocateProductInvestment(investmentProducts);

        // ── Risk Detection ──
        const riskData = {
            products: products.slice(0, 20).map(p => ({
                id: p.id,
                name: p.display_name || p.product_name,
                daily_revenue: productDaily[p.id] || [],
            })),
            campaigns: campaigns.map(c => ({
                id: c.id,
                name: c.campaign_name,
                daily_revenue: [],
            })),
            channels: results.allocation.channels,
        };
        results.risks = detectRisks(riskData);

        // ── Weekly Plan ──
        results.plan = generateWeeklyPlan(
            results.predictions,
            results.allocation,
            results.investment,
            results.risks
        );

    } catch (error) {
        results.error = error.message;
    }

    return results;
}

module.exports = {
    // Core engines
    predictTimeSeries,
    predictRevenue,
    allocateChannels,
    allocateProductInvestment,
    detectRisks,
    generateWeeklyPlan,
    // Orchestrator
    runPredictionCycle,
    // Helpers
    ema,
    linearTrend,
};
