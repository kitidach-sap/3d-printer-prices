/**
 * Social Auto-Post Scheduler
 * Uses prediction data to auto-schedule social media content
 * - Star products → feature tweets
 * - Rising products → trending tweets
 * - Price drops → deal alerts
 * - Blog posts → promotion tweets
 */

const _scheduledPosts = [];
const MAX_QUEUE = 100;

// Post templates
const TEMPLATES = {
    star_product: (product) => ({
        text: `🌟 ${product.name} is one of our top-rated picks!\n\n💰 Check the latest price and reviews:\n\n#3DPrinting #3DPrinter #BestDeals`,
        type: 'star_product',
        product: product.name,
        priority: 9,
    }),
    rising_product: (product) => ({
        text: `📈 ${product.name} is trending!\n\nPredicted revenue up ${product.change_pct > 0 ? '+' : ''}${product.change_pct}%\n\nSee why everyone's looking at this printer:\n\n#3DPrinting #Trending`,
        type: 'rising_product',
        product: product.name,
        priority: 7,
    }),
    risk_alert: (risk) => ({
        text: `⚠️ Price alert: ${risk.name || risk.message}\n\nStay informed about 3D printer market changes.\n\n#3DPrinting #PriceAlert`,
        type: 'risk_alert',
        priority: 5,
    }),
    blog_promo: (post) => ({
        text: `📝 New on our blog: ${post.title}\n\n${post.excerpt || 'Read the full article on our site!'}\n\n#3DPrinting #Blog`,
        type: 'blog_promo',
        priority: 6,
    }),
    channel_highlight: (channel) => ({
        text: `📊 Our ${channel.channel} channel is performing at ${channel.efficiency_score}/100 efficiency!\n\nWe're focused on bringing you the best deals.\n\n#3DPrinting`,
        type: 'channel_highlight',
        priority: 3,
    }),
};

/**
 * Generate social posts from prediction data
 * @param {object} predictionData - from runPredictionCycle
 * @returns {object[]} generated posts
 */
function generatePosts(predictionData) {
    const posts = [];
    const predictions = predictionData.predictions || {};
    const investment = predictionData.investment || {};
    const risks = predictionData.risks || {};
    const allocation = predictionData.allocation || {};

    // Star products → feature tweets
    const stars = (investment.investments || []).filter(i => i.tier === 'star').slice(0, 2);
    stars.forEach(p => posts.push(TEMPLATES.star_product(p)));

    // Rising products → trending tweets
    const rising = (predictions.products || []).filter(p => p.trend === 'rising' && p.change_pct > 20).slice(0, 2);
    rising.forEach(p => posts.push(TEMPLATES.rising_product(p)));

    // Critical risks → alerts (conservative)
    const criticalRisks = (risks.risks || []).filter(r => r.severity === 'critical').slice(0, 1);
    criticalRisks.forEach(r => posts.push(TEMPLATES.risk_alert(r)));

    // Top channel → highlight (rare)
    const topChannel = (allocation.channels || []).find(c => c.efficiency_score >= 70);
    if (topChannel) posts.push(TEMPLATES.channel_highlight(topChannel));

    // Sort by priority
    posts.sort((a, b) => b.priority - a.priority);

    return posts;
}

/**
 * Queue posts for scheduling (doesn't actually post — queues for review or auto-post)
 */
function queuePosts(posts) {
    const added = [];
    posts.forEach(post => {
        // Deduplicate by type + product
        const exists = _scheduledPosts.find(sp => sp.type === post.type && sp.product === post.product);
        if (exists) return;

        const entry = {
            ...post,
            id: `sp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            status: 'queued',
            queued_at: new Date().toISOString(),
            scheduled_for: null,
        };
        _scheduledPosts.unshift(entry);
        added.push(entry);
    });

    // Trim queue
    if (_scheduledPosts.length > MAX_QUEUE) _scheduledPosts.length = MAX_QUEUE;

    return { added: added.length, total_queued: _scheduledPosts.length, posts: added };
}

/**
 * Run full social post generation cycle
 */
function runSocialCycle(predictionData) {
    const posts = generatePosts(predictionData);
    const result = queuePosts(posts);
    return {
        generated: posts.length,
        ...result,
        generated_at: new Date().toISOString(),
    };
}

function getQueue(limit = 20) {
    return _scheduledPosts.slice(0, limit);
}

function clearQueue() {
    _scheduledPosts.length = 0;
    return { message: 'Queue cleared' };
}

function markPosted(postId) {
    const post = _scheduledPosts.find(p => p.id === postId);
    if (post) {
        post.status = 'posted';
        post.posted_at = new Date().toISOString();
        return post;
    }
    return null;
}

module.exports = {
    generatePosts,
    queuePosts,
    runSocialCycle,
    getQueue,
    clearQueue,
    markPosted,
};
