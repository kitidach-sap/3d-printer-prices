/**
 * Revenue Source Optimizer — Traffic Source Intelligence
 * 
 * Ranks traffic sources by affiliate intent and behavior patterns.
 * Informs content strategy and posting decisions.
 * 
 * Does NOT buy traffic.
 * Optimizes owned/organic distribution decisions only.
 */

const config = require('./config');
const analytics = require('./analytics');

/**
 * Get full source rankings with intent analysis.
 * Returns: [{ source, total, affiliate_clicks, compare_actions, intent, priority, recommendations }]
 */
async function getSourceRankings(supabase) {
    const sourceData = await analytics.getTopSources(supabase, config.EXTENDED_ANALYTICS_DAYS);
    const all = sourceData?.all || [];
    const byType = sourceData?.by_type || {};

    if (all.length === 0) return [];

    return all.map(s => {
        const clickCount = (byType.click || {})[s.name] || 0;
        const compareCount = (byType.compare || {})[s.name] || 0;
        const blogClickCount = (byType.blog_click || {})[s.name] || 0;
        const blogViewCount = (byType.blog_view || {})[s.name] || 0;
        const totalEvents = s.count;

        const affiliateClicks = clickCount + blogClickCount;
        const blogConversion = blogViewCount > 0 ? Math.round(blogClickCount / blogViewCount * 100) : 0;

        // Source-specific recommendations
        const recommendations = [];
        if (affiliateClicks >= 5) {
            recommendations.push(`High affiliate intent — prioritize content for ${s.name} visitors`);
        }
        if (compareCount >= 3) {
            recommendations.push(`Strong compare behavior — add compare prompts for ${s.name} traffic`);
        }
        if (blogConversion >= 5) {
            recommendations.push(`Good blog conversion (${blogConversion}%) — increase blog exposure on ${s.name}`);
        }

        return {
            source: s.name,
            total_events: totalEvents,
            affiliate_clicks: affiliateClicks,
            compare_actions: compareCount,
            blog_views: blogViewCount,
            blog_clicks: blogClickCount,
            blog_conversion_rate: blogConversion,
            affiliate_ratio: totalEvents > 0 ? Math.round(affiliateClicks / totalEvents * 100) : 0,
            intent: affiliateClicks > compareCount ? 'affiliate' : compareCount > 0 ? 'compare' : 'browse',
            priority: affiliateClicks >= 5 ? 'high' : affiliateClicks >= 2 ? 'medium' : 'low',
            recommendations,
        };
    }).sort((a, b) => b.affiliate_clicks - a.affiliate_clicks);
}

/**
 * Get sources with highest affiliate purchase intent.
 */
async function getHighIntentSources(supabase) {
    const rankings = await getSourceRankings(supabase);
    return rankings.filter(s => s.priority === 'high');
}

/**
 * Get source-aware behavior recommendations for content/posting.
 * Returns suggestions on what hooks, CTAs, and content angles to use per source.
 */
async function getSourceBehavior(supabase) {
    if (!config.SOURCE_OPTIMIZATION_ENABLED) {
        return { enabled: false, recommendations: [] };
    }

    const rankings = await getSourceRankings(supabase);
    const behavior = {};

    rankings.forEach(s => {
        const prefs = {
            source: s.source,
            priority: s.priority,
        };

        // Source-specific content preferences
        if (s.source === 'twitter' || s.source === 'x') {
            prefs.preferred_hooks = ['deal_alert', 'price_drop', 'comparison'];
            prefs.preferred_ctas = ['check_price', 'compare_now'];
            prefs.content_angle = s.compare_actions > s.affiliate_clicks * 0.3 ? 'comparison' : 'deal';
        } else if (s.source === 'search' || s.source === 'organic' || s.source === 'google') {
            prefs.preferred_hooks = ['review', 'guide', 'best_of'];
            prefs.preferred_ctas = ['see_details', 'read_review'];
            prefs.content_angle = 'informational';
        } else if (s.source === 'reddit') {
            prefs.preferred_hooks = ['honest_take', 'comparison', 'budget'];
            prefs.preferred_ctas = ['check_price', 'compare'];
            prefs.content_angle = 'value';
        } else if (s.source === 'campaign') {
            prefs.preferred_hooks = ['exclusive', 'limited'];
            prefs.preferred_ctas = ['claim_deal', 'check_price'];
            prefs.content_angle = 'urgency';
        } else {
            prefs.preferred_hooks = ['deal_alert'];
            prefs.preferred_ctas = ['check_price'];
            prefs.content_angle = 'general';
        }

        behavior[s.source] = prefs;
    });

    return {
        enabled: true,
        sources: rankings.length,
        behavior,
        top_source: rankings[0]?.source || null,
        recommendations: rankings.filter(s => s.recommendations.length > 0)
            .flatMap(s => s.recommendations),
    };
}

module.exports = {
    getSourceRankings,
    getHighIntentSources,
    getSourceBehavior,
};
