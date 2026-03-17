/**
 * Tweet Generator Engine — Multi-angle marketing tweet generation
 * 
 * Generates 5-10 variations per product using different marketing angles.
 * Each tweet follows: HOOK → CONTEXT → PRODUCT → PROOF → CTA
 */

const { getHook, getAngles } = require('./hooks');
const { getCTA } = require('./cta');
const { getUrgency } = require('./urgency');

const SITE_URL = 'https://3d-printer-prices.com';

/**
 * Build a site link for a product
 */
function buildSiteLink(product) {
    const searchQuery = (product.name || '').split(' ').slice(0, 4).join(' ');
    return `${SITE_URL}/?search=${encodeURIComponent(searchQuery)}`;
}

/**
 * Assemble a tweet from parts, ensuring it fits 280 chars
 */
function assembleTweet(parts, link) {
    // Join non-empty parts with double newline
    let tweet = parts.filter(Boolean).join('\n\n');
    
    // Add link if not present
    if (!tweet.includes('http')) {
        tweet += '\n\n' + link;
    }
    
    // Add hashtag if there's room
    const hashtags = ['#3DPrinting', '#3DPrinter', '#3Dprint', '#Makers', '#AdditiveManufacturing'];
    const hashtag = hashtags[Math.floor(Math.random() * 3)]; // bias toward top 3
    if (tweet.length + hashtag.length + 2 <= 280) {
        tweet += '\n\n' + hashtag;
    }

    // Hard truncate safety
    if (tweet.length > 280) {
        // Try removing hashtag
        tweet = tweet.replace(/\n\n#\w+$/g, '');
    }
    if (tweet.length > 280) {
        tweet = tweet.substring(0, 277) + '...';
    }

    return tweet;
}

/**
 * Generate a single tweet variation for a specific angle
 */
function generateVariation(product, angle) {
    const link = buildSiteLink(product);
    const hook = getHook(angle, product);
    const urgency = getUrgency(product);
    const cta = getCTA(product);

    // Build proof element
    const proofOptions = [
        `Rated ${product.rating}/5`,
        `${product.rating}/5 stars`,
        `${product.review_count || '100'}+ reviews, ${product.rating}/5 rating`,
        `Rated ${product.rating}/5 by real users`,
    ];
    const proof = proofOptions[Math.floor(Math.random() * proofOptions.length)];

    // Build context (varies by angle)
    let context = '';
    switch (angle) {
        case 'scroll_stopper':
            context = `The ${product.name} at $${product.price}. ${proof}.`;
            break;
        case 'problem_solution':
            context = `${proof}. Only $${product.price}.`;
            break;
        case 'beginner':
            context = `The ${product.name} — $${product.price}, ${proof}. Perfect for getting started.`;
            break;
        case 'curiosity':
            context = `$${product.price}. ${proof}.`;
            break;
        case 'deal_urgency':
            context = urgency;
            break;
        case 'comparison':
            context = `$${product.price} with ${proof}.`;
            break;
        case 'mistake_avoidance':
            context = `The ${product.name} at $${product.price} checks every box. ${proof}.`;
            break;
    }

    const tweet = assembleTweet([
        hook.text,
        context,
        cta.text,
    ], link);

    return {
        text: tweet,
        angle: angle,
        hook_type: hook.type,
        cta_type: cta.type,
        char_count: tweet.length,
    };
}

/**
 * Generate multiple tweet variations for a product
 * @param {object} product - Product data { name, brand, price, rating, review_count, category }
 * @param {number} count - Number of variations (default: 5)
 * @returns {Array<{text, angle, hook_type, cta_type, char_count}>}
 */
function generateMarketingTweets(product, count = 5) {
    const angles = getAngles();
    const variations = [];
    const usedTexts = new Set();

    // Ensure we use different angles
    const shuffledAngles = [...angles].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < Math.min(count, 10); i++) {
        const angle = shuffledAngles[i % shuffledAngles.length];
        let attempt = 0;
        let variation;

        // Try up to 3 times to get a unique tweet
        do {
            variation = generateVariation(product, angle);
            attempt++;
        } while (usedTexts.has(variation.text) && attempt < 3);

        if (!usedTexts.has(variation.text) && variation.text.length >= 30) {
            usedTexts.add(variation.text);
            variations.push(variation);
        }
    }

    return variations;
}

/**
 * Generate tweet using AI (Gemini/GPT) with marketing angle
 */
async function generateAITweet(product, angle, supabase) {
    const link = buildSiteLink(product);
    const cta = getCTA(product);
    const urgency = getUrgency(product);
    
    const prompt = `You are a senior affiliate marketing copywriter for 3D printing products.

Write ONE high-converting tweet (max 250 chars) using this angle: ${angle.toUpperCase().replace('_', ' ')}

PRODUCT:
- Name: ${product.name}
- Brand: ${product.brand || 'N/A'}
- Price: $${product.price}
- Rating: ${product.rating}/5 (${product.review_count || '100'}+ reviews)
- Category: ${product.category}

STRUCTURE (follow this exactly):
1. HOOK — Start with a scroll-stopping opener
2. CONTEXT — 1 line of relevant info
3. PROOF — Rating or review count
4. CTA — "${cta.text}"

LINK (MUST include at the end): ${link}

RULES:
- Max 250 characters total
- Sound like a real maker, not a bot
- No excessive emojis (max 2)
- No misleading claims
- Include exactly 1 hashtag
- Output ONLY the tweet text, no quotes or labels

Write the tweet now:`;

    // Try Gemini
    try {
        const { data: geminiKey } = await supabase.from('settings').select('value').eq('key', 'gemini_api_key').single();
        if (geminiKey?.value) {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey.value}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: 150, temperature: 0.9 },
                    }),
                    signal: AbortSignal.timeout(20000),
                }
            );
            if (res.ok) {
                const j = await res.json();
                let text = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim().replace(/^["']|["']$/g, '') || '';
                if (text.length >= 30 && text.length <= 280) {
                    // Ensure link is present
                    if (!text.includes('http')) text += '\n\n' + link;
                    if (text.length <= 280) return text;
                }
            }
        }
    } catch (e) { console.log('   Gemini error:', e.message); }

    // Try GPT
    try {
        const { data: gptKey } = await supabase.from('settings').select('value').eq('key', 'openai_api_key').single();
        if (gptKey?.value) {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${gptKey.value}` },
                body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 150, temperature: 0.9 }),
                signal: AbortSignal.timeout(20000),
            });
            if (res.ok) {
                const j = await res.json();
                let text = j.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') || '';
                if (text.length >= 30 && text.length <= 280) {
                    if (!text.includes('http')) text += '\n\n' + link;
                    if (text.length <= 280) return text;
                }
            }
        }
    } catch (e) { console.log('   GPT error:', e.message); }

    // Fallback: use template generator
    const fallback = generateVariation(product, angle);
    return fallback.text;
}

module.exports = { generateMarketingTweets, generateAITweet, generateVariation, buildSiteLink, assembleTweet };
