/**
 * Vercel Cron Job — Auto Blog Post Generator
 * 
 * Uses Gemini or OpenAI to generate and publish blog posts automatically.
 * Checks settings for enabled schedule and available AI API keys.
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

// Load an API key from settings
async function loadKey(keyName) {
    try {
        const { data } = await supabase.from('settings').select('value').eq('key', keyName).single();
        return data?.value || '';
    } catch (e) { return ''; }
}

// Call AI — supports Gemini and OpenAI with auto-fallback
async function callAI(prompt, maxTokens = 8192) {
    const geminiKey = await loadKey('gemini_api_key');
    const openaiKey = await loadKey('openai_api_key');

    // Try Gemini first
    if (geminiKey) {
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.8 },
                    }),
                    signal: AbortSignal.timeout(60000),
                }
            );
            if (res.ok) {
                const json = await res.json();
                const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (text) return text;
            }
            console.log('⚠️ Gemini failed, trying OpenAI...');
        } catch (e) {
            console.log('⚠️ Gemini error:', e.message);
        }
    }

    // Fallback to OpenAI
    if (openaiKey) {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                max_tokens: maxTokens,
                temperature: 0.8,
            }),
            signal: AbortSignal.timeout(90000),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`OpenAI error (${res.status}): ${err.slice(0, 200)}`);
        }
        const json = await res.json();
        return json.choices?.[0]?.message?.content || '';
    }

    throw new Error('No AI API key configured');
}

// Generate slug from title
function slugify(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
}

// Extract title and description from markdown
function extractMeta(markdown) {
    const lines = markdown.split('\n').map(l => l.trim()).filter(Boolean);
    let title = '', description = '';
    for (const line of lines) {
        if (!title && /^#{1,3}\s/.test(line)) {
            title = line.replace(/^#{1,3}\s*/, '').replace(/\*+/g, '').trim();
        } else if (title && !description && !line.startsWith('#') && !line.startsWith('|') && !line.startsWith('-')) {
            description = line.slice(0, 200);
        }
        if (title && description) break;
    }
    return { title: title || 'Untitled Post', description };
}

module.exports = async function handler(req, res) {
    // Verify authorization
    const authHeader = req.headers['authorization'];
    const cronSecret = process.env.CRON_SECRET;
    const adminKey = process.env.ADMIN_KEY;

    const isValidCron = cronSecret && authHeader === `Bearer ${cronSecret}`;
    const isValidAdmin = adminKey && (req.headers['x-admin-key'] === adminKey || req.query.key === adminKey);

    if (!isValidCron && !isValidAdmin) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('📝 Blog auto-generation starting...');

    try {
        // Check if blog schedule is enabled
        let scheduleEnabled = true;
        try {
            const { data } = await supabase.from('settings').select('value').eq('key', 'blog_schedule').single();
            const schedule = data?.value ? JSON.parse(data.value) : {};
            if (schedule.enabled === false) scheduleEnabled = false;
        } catch (e) { }

        // If called manually (admin key), always run regardless of schedule
        if (!isValidAdmin && !scheduleEnabled) {
            console.log('⏸️ Blog schedule is disabled');
            return res.json({ status: 'skipped', reason: 'Blog schedule disabled' });
        }

        // Fetch products for context
        const { data: products } = await supabase.from('products')
            .select('product_name, brand, price, category, product_type, rating, review_count, amazon_url')
            .eq('is_available', true)
            .order('rating', { ascending: false, nullsLast: true })
            .limit(30);

        const productList = (products || []).map(p =>
            `- ${p.product_name} | $${p.price} | ${p.brand || 'Unknown'} | Rating: ${p.rating || 'N/A'} (${p.review_count || 0} reviews) | ${p.amazon_url || ''}`
        ).join('\n');

        // Step 1: Auto-pick a topic
        console.log('   🤖 Generating topic...');
        const topicPrompt = `You are a content strategist for 3D Printer Prices (3d-printer-prices.com), a 3D printer price comparison site.

Based on these products:
${productList.slice(0, 2000)}

Suggest ONE compelling blog post topic that would drive organic traffic. Just reply with the topic title, nothing else. Make it SEO-friendly. Examples:
- "Best Budget 3D Printers Under $300 in 2026"
- "Creality vs Bambu Lab: Which 3D Printer Brand is Better?"
- "Top PLA Filaments Ranked by Print Quality"`;

        let topic = await callAI(topicPrompt, 200);
        topic = topic.replace(/^["'\s]+|["'\s]+$/g, '').trim();
        console.log(`   📌 Topic: ${topic}`);

        // Step 2: Write the blog post
        console.log('   ✍️ Writing article...');
        const blogPrompt = `You are an expert 3D printing content writer for **3D Printer Prices** (3d-printer-prices.com), a price comparison site with affiliate links.

## Task
Write a comprehensive, SEO-optimized blog article.

**Topic:** ${topic}
**Article Type:** buying-guide
**Target Length:** 1500-2000 words

## Product Data (use these real prices)
${productList}

## Guidelines
1. Tone: Friendly, knowledgeable maker community expert
2. SEO: Include keywords in first paragraph, use H2/H3 headings
3. Structure: Intro → H2 sections → Product recommendations with prices → Comparison table → Pros/Cons → Conclusion
4. Include Amazon links from product data
5. End with CTA: "Compare all prices at 3d-printer-prices.com"
6. Format: Markdown
7. Use real product names and prices only

Write the complete article:`;

        const content = await callAI(blogPrompt, 8192);
        const wordCount = content.split(/\s+/).length;
        console.log(`   📄 Generated ${wordCount} words`);

        // Step 3: Save and publish
        const { title, description } = extractMeta(content);
        const slug = slugify(title) || 'auto-blog-' + Date.now();

        const { data: post, error } = await supabase.from('blog_posts')
            .upsert({
                slug,
                title,
                description,
                content,
                article_type: 'buying-guide',
                word_count: wordCount,
                is_published: true,
                published_at: new Date().toISOString(),
            }, { onConflict: 'slug' })
            .select()
            .single();

        if (error) throw error;

        console.log(`✅ Blog published: "${title}" → /blog/${slug}`);
        res.json({
            status: 'success',
            title,
            slug,
            wordCount,
            url: `/blog/${slug}`,
        });

    } catch (err) {
        console.error('❌ Blog auto-generation failed:', err.message);
        res.status(500).json({ error: err.message });
    }
};
