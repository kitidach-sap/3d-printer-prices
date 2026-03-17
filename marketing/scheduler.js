/**
 * Scheduler — Cooldown, rotation, and deduplication logic
 * 
 * Instead of: 1 product = 1 post
 * Now:        1 product = 3-5 posts over time (different angles)
 */

/**
 * Select the best product to post about
 * Rules:
 * 1. Campaign products get absolute priority
 * 2. 80% 3D printers, 20% accessories/filament
 * 3. Cooldown: don't re-post same product within 3 days
 * 4. Prefer high-rated, high-value products
 * 5. Rotate through products evenly
 */
async function selectProduct(supabase) {
    // Get products posted in last 3 days (cooldown)
    const cooldownDate = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const { data: recentPosts } = await supabase.from('x_posts')
        .select('product_asin, angle_type')
        .eq('status', 'posted')
        .gte('posted_at', cooldownDate);
    
    const recentAsins = new Set((recentPosts || []).map(r => r.product_asin).filter(Boolean));
    const recentAngles = {};
    (recentPosts || []).forEach(r => {
        if (r.product_asin) {
            if (!recentAngles[r.product_asin]) recentAngles[r.product_asin] = [];
            recentAngles[r.product_asin].push(r.angle_type);
        }
    });

    // 80% chance = 3D printers, 20% = accessories/filament
    const isPrinter = Math.random() < 0.8;
    const categories = isPrinter ? ['3d_printer'] : ['accessories', 'filament'];

    const { data: products } = await supabase.from('products')
        .select('amazon_asin, product_name, display_name, brand, price, rating, review_count, amazon_url, image_url, category')
        .eq('is_available', true)
        .not('price', 'is', null)
        .gte('rating', 4.0)
        .in('category', categories)
        .order('rating', { ascending: false })
        .limit(50);

    if (!products?.length) {
        // Fallback: any available product
        const { data: fallback } = await supabase.from('products')
            .select('amazon_asin, product_name, display_name, brand, price, rating, review_count, amazon_url, image_url, category')
            .eq('is_available', true).not('price', 'is', null).gte('rating', 4.0)
            .order('rating', { ascending: false }).limit(50);
        if (!fallback?.length) throw new Error('No products available');
        return { product: fallback[0], usedAngles: [] };
    }

    // Prefer products NOT in cooldown
    const fresh = products.filter(p => !recentAsins.has(p.amazon_asin));
    const pool = fresh.length > 0 ? fresh : products;

    // Weighted random: higher-rated products get picked more
    const weighted = pool.map((p, i) => ({
        product: p,
        weight: (p.rating || 4) * 10 + (pool.length - i),
    }));
    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    let rand = Math.random() * totalWeight;
    let selected = weighted[0].product;
    for (const w of weighted) {
        rand -= w.weight;
        if (rand <= 0) { selected = w.product; break; }
    }

    return {
        product: selected,
        usedAngles: recentAngles[selected.amazon_asin] || [],
    };
}

/**
 * Pick the best angle for a product (avoid recently used angles)
 */
function selectAngle(availableAngles, usedAngles = []) {
    // Filter out recently used angles
    const fresh = availableAngles.filter(a => !usedAngles.includes(a));
    const pool = fresh.length > 0 ? fresh : availableAngles;
    return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Check if tweet text is a duplicate of recent posts
 */
async function isDuplicate(supabase, tweetText) {
    // Check last 20 posts for similarity
    const { data: recent } = await supabase.from('x_posts')
        .select('content')
        .eq('status', 'posted')
        .order('posted_at', { ascending: false })
        .limit(20);
    
    if (!recent?.length) return false;

    const normalize = (t) => t.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 60);
    const newNorm = normalize(tweetText);

    for (const post of recent) {
        const oldNorm = normalize(post.content || '');
        // Simple similarity check: if first 60 chars (normalized) match 80%+
        let matches = 0;
        for (let i = 0; i < Math.min(newNorm.length, oldNorm.length); i++) {
            if (newNorm[i] === oldNorm[i]) matches++;
        }
        const similarity = matches / Math.max(newNorm.length, oldNorm.length, 1);
        if (similarity > 0.8) return true;
    }

    return false;
}

/**
 * Check campaign products — always prioritize active campaigns
 */
async function getCampaignProduct(supabase) {
    try {
        const { data: campaigns } = await supabase
            .from('vw_campaigns_needing_promotion')
            .select('*')
            .limit(1);
        
        if (campaigns?.length > 0) {
            const campaign = campaigns[0];
            const { data: product } = await supabase.from('products')
                .select('amazon_asin, product_name, display_name, brand, price, rating, review_count, amazon_url, image_url, category')
                .eq('id', campaign.product_id)
                .single();
            
            if (product) {
                return { product, campaign, isCampaign: true };
            }
        }
    } catch (e) {
        // View might not exist, skip
    }
    return { product: null, campaign: null, isCampaign: false };
}

module.exports = { selectProduct, selectAngle, isDuplicate, getCampaignProduct };
