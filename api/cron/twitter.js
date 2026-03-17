/**
 * Vercel Cron Job — X (Twitter) Auto-Post v2
 * 
 * Features:
 * - 80% 3D printers, 20% accessories/filament product mix
 * - Uses display_name (short names) when available
 * - Links to our site (not Amazon) for better engagement + avoid shadowban
 * - Hook-based prompts that drive engagement (questions, opinions, tips)
 * - Image upload support via X API v1.1 media endpoint
 * - Uses OAuth 1.0a for posting (required for user context)
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

// Site URL
const SITE_URL = 'https://3d-printer-prices.com';

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

// ─── Upload Image to X ────────────────────────────────────────────────────────
async function uploadImageToX(imageUrl) {
    try {
        // Download image from URL
        const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
        if (!imgRes.ok) return null;
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
        const base64 = imgBuffer.toString('base64');

        // Upload to X media endpoint (v1.1)
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

        if (!res.ok) {
            console.log('   ⚠️ Image upload failed:', res.status);
            return null;
        }
        const json = await res.json();
        console.log('   🖼️ Image uploaded, media_id:', json.media_id_string);
        return json.media_id_string;
    } catch (e) {
        console.log('   ⚠️ Image upload error:', e.message);
        return null;
    }
}

// ─── Post Tweet (with optional media) ─────────────────────────────────────────
async function postTweet(text, mediaId = null) {
    const url = 'https://api.twitter.com/2/tweets';
    const auth = buildOAuthHeader('POST', url);
    const body = { text };
    if (mediaId) {
        body.media = { media_ids: [mediaId] };
    }
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': auth,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`X API error (${res.status}): ${JSON.stringify(json)}`);
    return json;
}

// ─── Select Product (80% printers, 20% accessories/filament) ──────────────────
async function selectProduct() {
    // Get recently posted ASINs (last 7 days)
    const recentlyPosted = await supabase.from('x_posts')
        .select('product_asin')
        .eq('status', 'posted')
        .gte('posted_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString());
    const recentAsins = (recentlyPosted.data || []).map(r => r.product_asin).filter(Boolean);

    // 80% chance = 3D printers, 20% = accessories/filament
    const isPrinter = Math.random() < 0.8;
    const categoryFilter = isPrinter ? '3d_printer' : null;

    let query = supabase.from('products')
        .select('amazon_asin, product_name, display_name, brand, price, rating, review_count, amazon_url, image_url, category')
        .eq('is_available', true)
        .not('price', 'is', null)
        .gte('rating', 4.0)
        .order('rating', { ascending: false })
        .limit(50);

    if (categoryFilter) {
        query = query.eq('category', categoryFilter);
    } else {
        query = query.in('category', ['accessories', 'filament']);
    }

    const { data: products } = await query;
    if (!products?.length) {
        // Fallback to any category
        const { data: fallback } = await supabase.from('products')
            .select('amazon_asin, product_name, display_name, brand, price, rating, review_count, amazon_url, image_url, category')
            .eq('is_available', true).not('price', 'is', null).gte('rating', 4.0)
            .order('rating', { ascending: false }).limit(50);
        if (!fallback?.length) throw new Error('No products found');
        return fallback[Math.floor(Math.random() * Math.min(fallback.length, 10))];
    }

    // Filter out recently posted
    const candidates = products.filter(p => !recentAsins.includes(p.amazon_asin));
    const pool = candidates.length > 0 ? candidates : products;
    return pool[Math.floor(Math.random() * Math.min(pool.length, 10))];
}

// ─── Generate Tweet with Hooks ────────────────────────────────────────────────
async function generateTweet(product, style) {
    // Use display_name (short) or truncate product_name
    const name = product.display_name || product.product_name.split(',')[0].split('(')[0].trim().substring(0, 60);
    const brand = product.brand || '';
    const price = product.price;
    const rating = product.rating;

    // Link to OUR site (not Amazon) — better engagement, no shadowban
    const searchQuery = name.split(' ').slice(0, 4).join(' ');
    const siteLink = `${SITE_URL}/?search=${encodeURIComponent(searchQuery)}`;

    const hookStyles = {
        deal: `Write an engaging deal alert tweet (max 250 chars) about a 3D printing product.

IMPORTANT RULES:
- Start with a HOOK (question, bold claim, or surprising fact)
- Include the price
- End with the link: ${siteLink}
- Add 1-2 relevant hashtags
- Sound like a real person, NOT a bot
- DO NOT wrap in quotes

GOOD EXAMPLES of hooks:
- "Under $200 for a printer this good? Yep."
- "Why are people switching to the ${name}? Here's the deal..."  
- "This $${price} printer is outselling machines 3x its price 👀"

Product: ${name} by ${brand}, $${price}, rated ${rating}/5`,

        tip: `Write a helpful maker tip tweet (max 250 chars) that naturally mentions a product.

IMPORTANT RULES:
- Lead with a USEFUL TIP or insight about 3D printing
- Mention the product naturally (not as a sales pitch)  
- End with: "Compare prices → ${siteLink}"
- Add 1 hashtag
- Sound like a knowledgeable friend giving advice

GOOD EXAMPLES:
- "Pro tip: If your first layer isn't sticking, upgrade to a PEI bed. The ${name} ships with one built in 🔥"
- "Noise complaint from your printer? The ${name} runs at just 48dB — quieter than a conversation"

Product: ${name} by ${brand}, $${price}, ${rating}/5`,

        review: `Write a mini-review tweet (max 250 chars) that shares a real opinion.

IMPORTANT RULES:
- Share a strong OPINION (not generic praise)
- Mention ONE specific thing that makes this product stand out
- End with: ${siteLink}
- Add 1-2 hashtags
- Be genuine — mention a trade-off if relevant

GOOD EXAMPLES:
- "Tested the ${name} for 2 weeks. Best part? Auto-calibration that actually works. Not cheap at $${price}, but worth every penny for beginners."
- "${rating}/5 stars and I get why — the ${name} just prints. No tinkering, no drama. ${siteLink}"

Product: ${name} by ${brand}, $${price}, ${rating}/5 with ${product.review_count || '?'} reviews`,

        question: `Write an engaging question tweet (max 250 chars) about 3D printing that references a product.

IMPORTANT RULES:
- Start with a POLL or QUESTION that drives replies
- Mention the product naturally
- End with: ${siteLink}
- Add 1-2 hashtags

GOOD EXAMPLES:
- "What's the first thing you'd print with a $${price} printer? 🤔 The ${name} is turning heads right now → ${siteLink}"
- "Unpopular opinion: You don't need to spend $500+ on a 3D printer anymore. The ${name} at $${price} proves it. Agree or disagree? ${siteLink}"

Product: ${name} by ${brand}, $${price}, ${rating}/5`,
    };

    const prompt = hookStyles[style] || hookStyles.deal;

    // Try Gemini first
    const { data: geminiSetting } = await supabase.from('settings').select('value').eq('key', 'gemini_api_key').single();
    if (geminiSetting?.value) {
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiSetting.value}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 150 }
                    }),
                    signal: AbortSignal.timeout(30000),
                }
            );
            if (res.ok) {
                const j = await res.json();
                const text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/^["']|["']$/g, '') || '';
                if (text.length >= 30 && text.length <= 280) return { text, siteLink };
            }
        } catch (e) { console.log('Gemini error:', e.message); }
    }

    // Try GPT
    const { data: openaiSetting } = await supabase.from('settings').select('value').eq('key', 'openai_api_key').single();
    if (openaiSetting?.value) {
        try {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openaiSetting.value}` },
                body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 150 }),
                signal: AbortSignal.timeout(30000),
            });
            if (res.ok) {
                const j = await res.json();
                const text = j.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') || '';
                if (text.length >= 30 && text.length <= 280) return { text, siteLink };
            }
        } catch (e) { console.log('GPT error:', e.message); }
    }

    // Fallback templates with hooks
    const fallbacks = {
        deal: [
            `Under $${price} for the ${name}? Yep, and it's rated ${rating}/5 ⭐\n\nCompare prices → ${siteLink}\n\n#3DPrinting`,
            `The ${name} at $${price} is one of the best deals in 3D printing right now 🔥\n\nSee why → ${siteLink}\n\n#3DPrinter`,
        ],
        tip: [
            `Pro tip: The ${name} is a solid choice if you want quality without breaking the bank ($${price}) 💡\n\nCompare → ${siteLink}\n\n#3DPrinting`,
            `Looking to level up your prints? The ${name} (${rating}/5) might be what you need.\n\nCheck it → ${siteLink}\n\n#3DPrinter`,
        ],
        review: [
            `${rating}/5 stars — the ${name} delivers. At $${price}, it's hard to beat for the value 🎯\n\n${siteLink}\n\n#3DPrinting`,
            `Real talk: the ${name} just works. ${rating}/5, $${price}. No gimmicks.\n\n${siteLink}\n\n#3DPrinter`,
        ],
        question: [
            `What would you print first with the ${name}? 🤔 At $${price}, it's tempting...\n\n${siteLink}\n\n#3DPrinting`,
            `Is $${price} a good price for the ${name}? It's rated ${rating}/5 — what do you think?\n\n${siteLink}\n\n#3DPrinter`,
        ],
    };

    const templates = fallbacks[style] || fallbacks.deal;
    const text = templates[Math.floor(Math.random() * templates.length)];
    return { text, siteLink };
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

    console.log('🐦 X auto-post v2 starting...');

    try {
        let targetProduct = null;
        let isCampaign = false;
        let campaignDetails = null;

        // 1. Try Creator Campaign first
        try {
            const { data: campaigns } = await supabase
                .from('vw_campaigns_needing_promotion')
                .select('*')
                .limit(1);
            if (campaigns?.length > 0) {
                campaignDetails = campaigns[0];
                const { data: cp } = await supabase.from('products').select('*').eq('id', campaignDetails.product_id).single();
                if (cp) {
                    targetProduct = cp;
                    isCampaign = true;
                    console.log(`   🎯 Campaign: ${campaignDetails.id}`);
                }
            }
        } catch (e) { /* No campaigns view, skip */ }

        // 2. Smart product selection (80% printers, 20% accessories)
        if (!targetProduct) {
            targetProduct = await selectProduct();
        }

        // Pick style — 4 styles rotating by day of week
        const styles = ['deal', 'tip', 'review', 'question'];
        const dayOfWeek = new Date().getDay();
        const hour = new Date().getUTCHours();
        const styleIdx = (dayOfWeek + Math.floor(hour / 6)) % styles.length;
        const style = styles[styleIdx];

        const displayName = targetProduct.display_name || targetProduct.product_name.split(',')[0].substring(0, 50);
        console.log(`   📦 ${displayName} | $${targetProduct.price} | ${targetProduct.category} | Style: ${style}`);

        // Generate tweet
        const { text: tweetText, siteLink } = await generateTweet(targetProduct, style);

        if (!tweetText || tweetText.length < 10) throw new Error('Generated tweet too short');

        // Safety: ensure link is present
        let finalTweet = tweetText;
        if (!finalTweet.includes('http')) {
            finalTweet += `\n\n${siteLink}`;
        }

        // Truncate if over 280
        if (finalTweet.length > 280) {
            finalTweet = finalTweet.substring(0, 277) + '...';
        }

        console.log(`   📝 Tweet (${finalTweet.length} chars):\n${finalTweet}`);

        // Upload image if available
        let mediaId = null;
        if (targetProduct.image_url) {
            mediaId = await uploadImageToX(targetProduct.image_url);
        }

        // Post to X
        const tweetResult = await postTweet(finalTweet, mediaId);
        const tweetId = tweetResult?.data?.id;
        console.log(`   ✅ Posted! tweet_id: ${tweetId}${mediaId ? ' (with image)' : ''}`);

        // Save to DB
        if (isCampaign) {
            await supabase.from('campaign_posts').insert({
                campaign_id: campaignDetails.id,
                platform: 'X',
                platform_post_id: tweetId,
                post_url: `https://x.com/3dprinterprice/status/${tweetId}`,
                post_text: finalTweet,
                is_auto_posted: true,
                proof_status: 'pending_submission'
            });
            await supabase.from('creator_campaigns')
                .update({ last_promoted_at: new Date().toISOString() })
                .eq('id', campaignDetails.id);
        }

        await supabase.from('x_posts').insert({
            tweet_id: tweetId,
            content: finalTweet,
            product_asin: targetProduct.amazon_asin,
            product_name: displayName,
            product_url: siteLink,
            status: 'posted',
            posted_at: new Date().toISOString(),
        });

        res.json({
            status: 'success',
            tweetId,
            product: displayName,
            category: targetProduct.category,
            style,
            content: finalTweet,
            hasImage: !!mediaId,
            isCampaign,
        });

    } catch (err) {
        console.error('❌ X post failed:', err.message);
        try {
            await supabase.from('x_posts').insert({
                content: err.message,
                status: 'failed',
                error_message: err.message,
                posted_at: new Date().toISOString(),
            });
        } catch (dbErr) {
            console.error('Failed to log error:', dbErr.message);
        }
        res.status(500).json({ error: err.message });
    }
};
