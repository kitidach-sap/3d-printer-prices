/**
 * Vercel Cron Job — X (Twitter) Affiliate Revenue Engine v3
 * 
 * Architecture:
 *   /marketing/hooks.js      — Hook library (7 angles, 40+ templates)
 *   /marketing/cta.js        — CTA optimizer (15 variants)
 *   /marketing/urgency.js    — Urgency engine (12 FOMO lines)
 *   /marketing/generators.js — Multi-angle tweet generator
 *   /marketing/scheduler.js  — Product selection + cooldown + dedup
 *   api/cron/twitter.js      — THIS FILE: main engine
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const { generateMarketingTweets, generateAITweet, buildSiteLink } = require('../../marketing/generators');
const { selectProduct, selectAngle, isDuplicate, getCampaignProduct } = require('../../marketing/scheduler');
const { getAngles } = require('../../marketing/hooks');
const { MarketingLogger } = require('../../marketing/logger');
const { getOptimizedWeights, selectWeightedAngle } = require('../../marketing/optimizer');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// X API credentials
const X_API_KEY = process.env.X_API_KEY;
const X_API_SECRET = process.env.X_API_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

// ─── OAuth 1.0a ──────────────────────────────────────────────────────────────
function oauthSign(method, url, params, consumerSecret, tokenSecret) {
    const sortedParams = Object.keys(params).sort().map(k =>
        `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
    ).join('&');
    const base = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    return crypto.createHmac('sha1', signingKey).update(base).digest('base64');
}

function buildOAuthHeader(method, url) {
    const oauthParams = {
        oauth_consumer_key: X_API_KEY,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: X_ACCESS_TOKEN,
        oauth_version: '1.0',
    };
    oauthParams.oauth_signature = oauthSign(method, url, oauthParams, X_API_SECRET, X_ACCESS_TOKEN_SECRET);
    return 'OAuth ' + Object.keys(oauthParams)
        .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
        .join(', ');
}

// ─── Upload Image to X ────────────────────────────────────────────────────────
async function uploadImageToX(imageUrl) {
    try {
        const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
        if (!imgRes.ok) return null;
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
        const base64 = imgBuffer.toString('base64');

        const uploadUrl = 'https://upload.twitter.com/1.1/media/upload.json';
        const boundary = '----FormBoundary' + crypto.randomBytes(8).toString('hex');
        const body = `--${boundary}\r\nContent-Disposition: form-data; name="media_data"\r\n\r\n${base64}\r\n--${boundary}--`;

        const auth = buildOAuthHeader('POST', uploadUrl);
        const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'Authorization': auth,
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
            },
            body,
            signal: AbortSignal.timeout(30000),
        });

        if (!res.ok) { console.log('   ⚠️ Image upload failed:', res.status); return null; }
        const json = await res.json();
        console.log('   🖼️ Image uploaded:', json.media_id_string);
        return json.media_id_string;
    } catch (e) {
        console.log('   ⚠️ Image upload error:', e.message);
        return null;
    }
}

// ─── Post Tweet ──────────────────────────────────────────────────────────────
async function postTweet(text, mediaId = null) {
    const url = 'https://api.twitter.com/2/tweets';
    const auth = buildOAuthHeader('POST', url);
    const body = { text };
    if (mediaId) body.media = { media_ids: [mediaId] };

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`X API error (${res.status}): ${JSON.stringify(json)}`);
    return json;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
    // Auth check
    const cronSecret = process.env.CRON_SECRET;
    const adminKey = process.env.ADMIN_KEY;
    const isValidCron = cronSecret && req.headers['authorization'] === `Bearer ${cronSecret}`;
    const isValidAdmin = adminKey && (req.headers['x-admin-key'] === adminKey || req.query.key === adminKey);
    if (!isValidCron && !isValidAdmin) return res.status(401).json({ error: 'Unauthorized' });

    if (!X_API_KEY || !X_ACCESS_TOKEN) {
        return res.status(500).json({ error: 'X API credentials not configured' });
    }

    // Check if enabled
    try {
        const { data: setting } = await supabase.from('settings').select('value').eq('key', 'x_post_enabled').single();
        const enabled = setting?.value === 'true' || setting?.value === true;
        if (!enabled && !isValidAdmin) {
            return res.json({ status: 'skipped', reason: 'X auto-post disabled' });
        }
    } catch (e) { }

    const logger = new MarketingLogger(supabase, 'x_engine');
    logger.log('Affiliate Revenue Engine v3 starting');

    try {
        let targetProduct = null;
        let isCampaign = false;
        let campaignDetails = null;
        let usedAngles = [];

        // Step 1: Check for campaign products (ALWAYS priority)
        const campaign = await getCampaignProduct(supabase);
        if (campaign.isCampaign && campaign.product) {
            targetProduct = campaign.product;
            campaignDetails = campaign.campaign;
            isCampaign = true;
            logger.log('Campaign product found', { name: targetProduct.display_name || targetProduct.product_name, campaign_id: campaignDetails?.id });
        }

        // Step 2: Smart product selection (if no campaign)
        if (!targetProduct) {
            const selection = await selectProduct(supabase);
            targetProduct = selection.product;
            usedAngles = selection.usedAngles;
        }

        // Normalize product data
        const product = {
            id: targetProduct.id,
            name: targetProduct.display_name || targetProduct.product_name.split(',')[0].trim().substring(0, 60),
            brand: targetProduct.brand || '',
            price: targetProduct.price,
            rating: targetProduct.rating,
            review_count: targetProduct.review_count,
            category: targetProduct.category || '3d_printer',
            image_url: targetProduct.image_url,
            amazon_asin: targetProduct.amazon_asin,
        };

        // Step 3: Pick best angle — data-driven (A/B weighted) or random fallback
        let angle;
        try {
            const { weights, confidence } = await getOptimizedWeights(supabase);
            // Filter out recently used angles
            const available = { ...weights };
            usedAngles.forEach(a => delete available[a]);
            if (Object.keys(available).length > 0) {
                angle = selectWeightedAngle(available);
            } else {
                angle = selectAngle(getAngles(), usedAngles);
            }
            logger.log('Angle selected (optimizer)', { angle, confidence });
        } catch (e) {
            angle = selectAngle(getAngles(), usedAngles);
            logger.log('Angle selected (fallback)', { angle });
        }
        logger.log('Product selected', { name: product.name, price: product.price, category: product.category, angle, usedAngles });

        // Step 4: Generate tweet (AI-first, template fallback)
        let tweetText = await generateAITweet(product, angle, supabase);

        // Step 5: Duplicate check
        if (await isDuplicate(supabase, tweetText)) {
            logger.warn('Duplicate detected, regenerating with different angle');
            // Try a different angle
            const altAngle = selectAngle(getAngles(), [...usedAngles, angle]);
            tweetText = await generateAITweet(product, altAngle, supabase);
        }

        // Final safety
        if (!tweetText || tweetText.length < 20) throw new Error('Generated tweet too short');
        if (tweetText.length > 280) tweetText = tweetText.substring(0, 277) + '...';

        logger.log('Tweet generated', { chars: tweetText.length, preview: tweetText.substring(0, 80) + '...' });

        // Step 6: Upload image
        let mediaId = null;
        if (product.image_url) {
            mediaId = await uploadImageToX(product.image_url);
        }

        // Step 7: Post to X
        const tweetResult = await postTweet(tweetText, mediaId);
        const tweetId = tweetResult?.data?.id;
        logger.success('Tweet posted to X', { tweet_id: tweetId, has_image: !!mediaId, chars: tweetText.length });

        // Step 8: Save to DB with metadata
        const siteLink = buildSiteLink(product);
        const { error: insertErr } = await supabase.from('x_posts').insert({
            tweet_id: tweetId,
            content: tweetText,
            product_asin: product.amazon_asin,
            product_name: product.name,
            product_url: siteLink,
            status: 'posted',
            posted_at: new Date().toISOString(),
            hook_type: angle,
            angle_type: angle,
            cta_type: 'auto',
        });
        if (insertErr) logger.warn('DB save failed', { error: insertErr.message });
        else logger.success('Saved to x_posts');

        // Step 9: Update campaign if applicable
        if (isCampaign && campaignDetails) {
            try {
                await supabase.from('campaign_posts').insert({
                    campaign_id: campaignDetails.id,
                    platform: 'X',
                    platform_post_id: tweetId,
                    post_url: `https://x.com/mybrandsave/status/${tweetId}`,
                    post_text: tweetText,
                    is_auto_posted: true,
                    proof_status: 'pending_submission',
                });
                await supabase.from('creator_campaigns')
                    .update({ last_promoted_at: new Date().toISOString() })
                    .eq('id', campaignDetails.id);
            } catch (e) { console.log('   Campaign DB error:', e.message); }
        }

        // Save execution log
        await logger.save();

        res.json({
            status: 'success',
            tweetId,
            product: product.name,
            category: product.category,
            angle,
            hasImage: !!mediaId,
            isCampaign,
            charCount: tweetText.length,
            content: tweetText,
            log: logger.toJSON(),
        });

    } catch (err) {
        logger.error('Engine failed', { error: err.message });
        try {
            await supabase.from('x_posts').insert({
                content: err.message,
                status: 'failed',
                error_message: err.message,
                posted_at: new Date().toISOString(),
            });
        } catch (e) { }
        await logger.save();
        res.status(500).json({ error: err.message, log: logger.toJSON() });
    }
};
