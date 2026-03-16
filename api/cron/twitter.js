/**
 * Vercel Cron Job — X (Twitter) Auto-Post
 * Generates a tweet using GPT about a top product and posts it to X.
 * Uses OAuth 1.0a for posting (required for user context).
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// X API credentials
const X_API_KEY = process.env.X_API_KEY;
const X_API_SECRET = process.env.X_API_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_TOKEN_SECRET = process.env.X_ACCESS_TOKEN_SECRET;

// Affiliate tag
const AFFILIATE_TAG = process.env.AMAZON_AFFILIATE_TAG || 'diskprices03-20';

// ─── OAuth 1.0a Signature Helper ─────────────────────────────────────────────
function oauthSign(method, url, params, consumerSecret, tokenSecret) {
    const sortedParams = Object.keys(params).sort().map(k =>
        `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`
    ).join('&');
    const base = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
    const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
    return crypto.createHmac('sha1', signingKey).update(base).digest('base64');
}

function buildOAuthHeader(method, url, extraParams = {}) {
    const oauthParams = {
        oauth_consumer_key: X_API_KEY,
        oauth_nonce: crypto.randomBytes(16).toString('hex'),
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
        oauth_token: X_ACCESS_TOKEN,
        oauth_version: '1.0',
    };
    const allParams = { ...oauthParams, ...extraParams };
    oauthParams.oauth_signature = oauthSign(method, url, allParams, X_API_SECRET, X_ACCESS_TOKEN_SECRET);
    const headerStr = Object.keys(oauthParams)
        .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
        .join(', ');
    return `OAuth ${headerStr}`;
}

// ─── Post Tweet ───────────────────────────────────────────────────────────────
async function postTweet(text) {
    const url = 'https://api.twitter.com/2/tweets';
    const auth = buildOAuthHeader('POST', url);
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': auth,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(15000),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`X API error (${res.status}): ${JSON.stringify(json)}`);
    return json;
}

// ─── Generate Tweet via GPT / Gemini ──────────────────────────────────────────
async function generateTweet(product, style, customLink) {
    const productUrl = `https://3d-printer-prices.com`;
    const productLink = `${productUrl}/?search=${encodeURIComponent(product.product_name.split(' ').slice(0, 3).join(' '))}`;
    const amazonLink = customLink || product.amazon_url || `https://www.amazon.com/dp/${product.amazon_asin}?tag=${AFFILIATE_TAG}`;

    const styles = {
        deal: `Write a short, exciting deal alert tweet (under 240 chars) for this 3D printer product targeting US hobbyists. Include price, 1-2 hashtags (#3DPrinting #3DPrinter), and this link: ${productLink}`,
        tip: `Write a helpful tip tweet (under 240 chars) referencing this product, for US 3D printing enthusiasts. End with: "Find best prices → ${productLink}" and 1-2 hashtags.`,
        review: `Write a review-style tweet (under 240 chars) highlighting this product's rating and value for US makers. Include 1-2 hashtags and: ${productLink}`,
    };

    const prompt = `${styles[style] || styles.deal}

Product: ${product.product_name}
Price: $${product.price}
Brand: ${product.brand || 'Unknown'}
Rating: ${product.rating ? product.rating + '/5' : 'N/A'}
Amazon: ${amazonLink}

Rules:
- Keep under 240 characters TOTAL (including links)
- Casual, enthusiastic US tone
- No quotes around the tweet
- Output ONLY the tweet text, nothing else`;

    // Try GPT first (if key stored in settings)
    const { data: openaiSetting } = await supabase.from('settings').select('value').eq('key', 'openai_api_key').single();
    const { data: geminiSetting } = await supabase.from('settings').select('value').eq('key', 'gemini_api_key').single();

    if (openaiSetting?.value) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiSetting.value}` },
            body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 120 }),
            signal: AbortSignal.timeout(30000),
        });
        if (res.ok) {
            const j = await res.json();
            return j.choices?.[0]?.message?.content?.trim() || '';
        }
    }

    if (geminiSetting?.value) {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiSetting.value}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 120 } }),
                signal: AbortSignal.timeout(30000),
            }
        );
        if (res.ok) {
            const j = await res.json();
            return j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        }
    }

    throw new Error('No AI API key configured');
}

// ─── Main Handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
    // Auth check
    const cronSecret = process.env.CRON_SECRET;
    const adminKey = process.env.ADMIN_KEY;
    const isValidCron = cronSecret && req.headers['authorization'] === `Bearer ${cronSecret}`;
    const isValidAdmin = adminKey && (req.headers['x-admin-key'] === adminKey || req.query.key === adminKey);
    if (!isValidCron && !isValidAdmin) return res.status(401).json({ error: 'Unauthorized' });

    // Check X API keys configured
    if (!X_API_KEY || !X_ACCESS_TOKEN) {
        return res.status(500).json({ error: 'X API credentials not configured' });
    }

    // Check if X auto-post is enabled
    try {
        const { data: setting } = await supabase.from('settings').select('value').eq('key', 'x_post_enabled').single();
        const enabled = setting?.value === 'true' || setting?.value === true;
        if (!enabled && !isValidAdmin) {
            console.log('⏸️ X auto-post is disabled');
            return res.json({ status: 'skipped', reason: 'X auto-post disabled' });
        }
    } catch (e) { }

    console.log('🐦 X auto-post starting...');

    try {
        let targetProduct = null;
        let isCampaign = false;
        let campaignDetails = null;

        // 1. Try to pick a Creator Campaign that needs promotion
        const { data: campaigns } = await supabase
            .from('vw_campaigns_needing_promotion')
            .select('*')
            .limit(1);

        if (campaigns && campaigns.length > 0) {
            campaignDetails = campaigns[0];
            const { data: cp } = await supabase.from('products').select('*').eq('id', campaignDetails.product_id).single();
            if (cp) {
                targetProduct = cp;
                isCampaign = true;
                console.log(`   🎯 Selected Creator Campaign: ${campaignDetails.id} (Urgency: ${campaignDetails.urgency_score})`);
            }
        }

        // 2. Fallback to normal product rotation if no campaign is matched
        if (!targetProduct) {
            const recentlyPosted = await supabase.from('x_posts')
                .select('product_asin')
                .eq('status', 'posted')
                .gte('posted_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()); // last 7 days

            const recentAsins = (recentlyPosted.data || []).map(r => r.product_asin).filter(Boolean);

            let { data: products } = await supabase.from('products')
                .select('amazon_asin, product_name, brand, price, rating, review_count, amazon_url, image_url, category')
                .eq('is_available', true)
                .not('price', 'is', null)
                .gte('rating', 4.0)
                .order('rating', { ascending: false })
                .limit(50);

            if (!products?.length) throw new Error('No suitable products found');

            const candidates = products.filter(p => !recentAsins.includes(p.amazon_asin));
            const pool = candidates.length > 0 ? candidates : products;
            targetProduct = pool[Math.floor(Math.random() * Math.min(pool.length, 10))];
        }

        // Pick style
        const styles = ['deal', 'tip', 'review'];
        const hour = new Date().getUTCHours();
        const style = styles[Math.floor(hour / 8) % 3]; // rotate by time of day

        console.log(`   📦 Product: ${targetProduct.product_name} | $${targetProduct.price} | Style: ${style}`);

        // Generate tweet
        const customLink = isCampaign ? campaignDetails.campaign_url : null;
        const tweetText = await generateTweet(targetProduct, style, customLink);
        if (!tweetText || tweetText.length < 20) throw new Error('Generated tweet too short');
        console.log(`   📝 Tweet (${tweetText.length} chars): ${tweetText}`);

        // Post to X
        const tweetResult = await postTweet(tweetText);
        const tweetId = tweetResult?.data?.id;
        const tweetUrl = `https://twitter.com/mybrandsave/status/${tweetId}`;
        console.log(`   ✅ Posted! tweet_id: ${tweetId}`);

        // Save to DB
        if (isCampaign) {
            await supabase.from('campaign_posts').insert({
                campaign_id: campaignDetails.id,
                platform: 'X',
                platform_post_id: tweetId,
                post_url: tweetUrl,
                post_text: tweetText,
                is_auto_posted: true,
                proof_status: 'pending_submission'
            });

            await supabase.from('creator_campaigns')
                .update({ last_promoted_at: new Date().toISOString() })
                .eq('id', campaignDetails.id);
            
            await supabase.from('campaign_events').insert({
                campaign_id: campaignDetails.id,
                event_type: 'auto_post_success',
                actor_id: null,
                notes: `Auto-posted to X. Tweet ID: ${tweetId}`
            });
            
            res.json({ status: 'success', tweetId, product: targetProduct.product_name, content: tweetText, isCampaign: true });
        } else {
            await supabase.from('x_posts').insert({
                tweet_id: tweetId,
                content: tweetText,
                product_asin: targetProduct.amazon_asin,
                product_name: targetProduct.product_name,
                product_url: targetProduct.amazon_url,
                status: 'posted',
                posted_at: new Date().toISOString(),
            });
            res.json({ status: 'success', tweetId, product: targetProduct.product_name, content: tweetText });
        }

    } catch (err) {
        console.error('❌ X post failed:', err.message);
        // Log failure
        await supabase.from('x_posts').insert({
            content: err.message,
            status: 'failed',
            error_message: err.message,
            posted_at: new Date().toISOString(),
        }).catch(() => { });
        res.status(500).json({ error: err.message });
    }
};
