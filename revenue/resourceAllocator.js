/**
 * Resource Allocator
 * 
 * Decides focus allocation across channels: blog vs social vs campaign.
 * Uses performance data to shift resources toward highest-ROI channels.
 */

const config = require('./config');
const monitoring = require('./monitoring');

let _allocation = null;
let _allocationHistory = [];

// ═══════════════════════════════════════════════════════════════════════════════
// COMPUTE ALLOCATION
// ═══════════════════════════════════════════════════════════════════════════════

function computeAllocation(channelPerformance) {
    if (!config.RESOURCE_ALLOC_ENABLED) {
        _allocation = {
            computed_at: new Date().toISOString(),
            enabled: false,
            weights: { ...config.DEFAULT_CHANNEL_WEIGHTS },
            reason: 'disabled — using defaults',
        };
        return _allocation;
    }

    // channelPerformance: { blog: { clicks, ctr, articles }, social: { clicks, posts, engagement }, campaign: { clicks, active } }
    const perf = channelPerformance || {};
    const weights = { ...config.DEFAULT_CHANNEL_WEIGHTS };

    // Calculate channel scores based on efficiency (clicks per unit of effort)
    const scores = {};
    let totalScore = 0;

    config.RESOURCE_CHANNELS.forEach(ch => {
        const data = perf[ch] || {};
        let score = 0;

        switch (ch) {
            case 'blog':
                // clicks per article
                score = (data.articles || 1) > 0 ? (data.clicks || 0) / (data.articles || 1) : 0;
                break;
            case 'social':
                // clicks per post
                score = (data.posts || 1) > 0 ? (data.clicks || 0) / (data.posts || 1) : 0;
                break;
            case 'campaign':
                // clicks per active campaign
                score = (data.active || 1) > 0 ? (data.clicks || 0) / (data.active || 1) : 0;
                break;
        }

        scores[ch] = Math.max(0.1, score); // floor to prevent zero allocation
        totalScore += scores[ch];
    });

    // Normalize to weights
    if (totalScore > 0) {
        config.RESOURCE_CHANNELS.forEach(ch => {
            // Blend: 60% performance-based + 40% default (stability)
            const perfWeight = scores[ch] / totalScore;
            weights[ch] = Math.round((0.6 * perfWeight + 0.4 * config.DEFAULT_CHANNEL_WEIGHTS[ch]) * 100) / 100;
        });

        // Normalize so they sum to 1.0
        const sum = Object.values(weights).reduce((s, w) => s + w, 0);
        config.RESOURCE_CHANNELS.forEach(ch => {
            weights[ch] = Math.round((weights[ch] / sum) * 100) / 100;
        });
    }

    _allocation = {
        computed_at: new Date().toISOString(),
        enabled: true,
        weights,
        scores,
        raw_performance: perf,
        reason: 'performance-blended allocation',
    };

    _allocationHistory.push({
        timestamp: _allocation.computed_at,
        weights: { ...weights },
    });
    while (_allocationHistory.length > 100) _allocationHistory.shift();

    console.log(`📊 Resource allocation: blog=${weights.blog} social=${weights.social} campaign=${weights.campaign}`);
    return _allocation;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET WEIGHT for a specific channel (consumed by schedulers)
// ═══════════════════════════════════════════════════════════════════════════════

function getChannelWeight(channel) {
    if (!_allocation) return config.DEFAULT_CHANNEL_WEIGHTS[channel] || 0.33;
    return _allocation.weights[channel] || config.DEFAULT_CHANNEL_WEIGHTS[channel] || 0.33;
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function getStatus() {
    return {
        enabled: config.RESOURCE_ALLOC_ENABLED,
        current: _allocation || { weights: { ...config.DEFAULT_CHANNEL_WEIGHTS }, reason: 'not yet computed' },
        history: [..._allocationHistory].reverse().slice(0, 20),
    };
}

module.exports = { computeAllocation, getChannelWeight, getStatus };
