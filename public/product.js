const AMAZON_AFFILIATE_TAG = 'kiti09-20';

function affiliateUrl(url) {
    if (!url) return '#';
    try {
        const u = new URL(url);
        u.searchParams.set('tag', AMAZON_AFFILIATE_TAG);
        return u.toString();
    } catch {
        return url + (url.includes('?') ? '&' : '?') + 'tag=' + AMAZON_AFFILIATE_TAG;
    }
}

function escapeHtml(unsafe) {
    if(!unsafe) return '';
    return unsafe
         .toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    
    if (!id) {
        showError('No product ID specified.');
        return;
    }

    try {
        // Fetch specific product by ID
        const res = await fetch(`/api/products?ids=${id}`);
        const result = await res.json();
        
        if (!result.data || result.data.length === 0) {
            throw new Error('Product not found.');
        }

        const product = result.data[0];
        renderProduct(product);
        injectJsonLd(product);
        fetchAlternatives(product);
        
        document.getElementById('loader-wrapper').style.display = 'none';
        document.getElementById('product-content').style.display = 'block';
    } catch (err) {
        console.error(err);
        showError('Product could not be loaded.');
    }
});

function showError(msg) {
    document.getElementById('loader-wrapper').innerHTML = `<p style="color:var(--danger); font-size:1.2rem;">${msg}</p><a href="/" style="color:var(--accent);">Return to Homepage</a>`;
}

function renderProduct(p) {
    // Basic Details
    document.title = `${p.product_name} - Specs & Price`;
    document.querySelector('meta[name="description"]').setAttribute('content', `Read specs, find alternatives, and check the latest price for the ${p.brand ? p.brand + ' ' : ''}${p.product_name}.`);

    document.getElementById('pd-image').src = p.image_url || '';
    document.getElementById('pd-title').textContent = p.product_name;
    document.getElementById('pd-brand').textContent = p.brand || p.category.replace('_', ' ');
    
    document.getElementById('pd-rating').textContent = p.rating ? p.rating.toFixed(1) : 'No Rating';
    document.getElementById('pd-reviews').textContent = p.review_count || 0;
    
    document.getElementById('pd-price').textContent = p.price ? `$${p.price.toFixed(2)}` : 'Check Price on Amazon';
    if (p.original_price && p.discount_percent) {
        document.getElementById('pd-orig-price').innerHTML = `<s>$${p.original_price.toFixed(2)}</s> <span class="badge" style="background:var(--danger); color:#fff;">-${p.discount_percent}%</span>`;
    }

    // Affilate Link
    document.getElementById('pd-buy-btn').href = affiliateUrl(p.amazon_url);

    // Badges
    const badgeContainer = document.getElementById('pd-badges');
    let html = '';
    if (p.printer_type) html += `<span class="badge" style="background:var(--bg-hover);">${escapeHtml(p.printer_type)}</span>`;
    if (p.beginner_score) html += `<span class="badge" style="background:var(--accent); color:#000;">Beginner Score: ${p.beginner_score}/10</span>`;
    
    if (p.labels && p.labels.length > 0) {
        p.labels.forEach(l => {
            html += `<span class="badge" style="border: 1px solid var(--border);">${escapeHtml(l)}</span>`;
        });
    }
    badgeContainer.innerHTML = html;

    // Rich Data (If we have AI json)
    if (p.specs_json) {
        document.getElementById('summary-section').style.display = 'grid';
        
        // Mocking the structured data if AI didn't explicitly separate strengths and weaknesses yet
        // A generic mapping based on specs JSON
        
        let whoFor = p.specs_json["Target Audience"] || 
            (p.beginner_score > 7 ? "Perfect for beginners looking to get started easily without troubleshooting." : "Best for intermediate users or hobbyists who don't mind tinkering.");
        document.getElementById('pd-who-for').textContent = whoFor;

        // Auto-generate Strengths based on data
        let strengths = [];
        if (p.price < 250) strengths.push("Very affordable price point");
        if (p.rating > 4.4) strengths.push(`Highly rated by ${p.review_count} users`);
        if (p.labels) strengths.push(...p.labels.slice(0, 2));
        
        if (strengths.length === 0) strengths.push("Solid all-around specifications");
        document.getElementById('pd-strengths').innerHTML = strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('');

        // Drawbacks
        let drawbacks = [];
        if (p.rating && p.rating < 4.0) drawbacks.push("Overall user rating is slightly below average");
        if (!p.brand) drawbacks.push("Lesser-known brand support");
        if (p.price > 1000) drawbacks.push("High initial investment cost");
        if (drawbacks.length === 0) drawbacks.push("No major red flags detected");
        
        document.getElementById('pd-weaknesses').innerHTML = drawbacks.map(s => `<li>${escapeHtml(s)}</li>`).join('');

        // Specs Table
        let specTable = '<div style="display:grid; grid-template-columns: 1fr 1fr; gap:0.5rem;">';
        for (const [key, value] of Object.entries(p.specs_json)) {
            specTable += `
                <div style="border-bottom: 1px solid var(--border); padding-bottom:0.25rem;">
                    <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(key)}</div>
                    <div style="font-weight:500;">${escapeHtml(value)}</div>
                </div>
            `;
        }
        specTable += '</div>';
        document.getElementById('pd-specs-table').innerHTML = specTable;
    }
}

// -----------------------------------------
// SEO: JSON-LD Injection
// -----------------------------------------
function injectJsonLd(p) {
    if (!p.price) return;

    const schema = {
        "@context": "https://schema.org/",
        "@type": "Product",
        "name": p.product_name,
        "image": p.image_url,
        "description": p.specs_json ? JSON.stringify(p.specs_json) : "High quality 3D printing equipment.",
        "brand": {
            "@type": "Brand",
            "name": p.brand || p.category
        },
        "offers": {
            "@type": "Offer",
            "url": window.location.href, // Or affiliate URL
            "priceCurrency": "USD",
            "price": p.price.toFixed(2),
            "availability": "https://schema.org/InStock"
        }
    };

    if (p.rating && p.review_count) {
        schema.aggregateRating = {
            "@type": "AggregateRating",
            "ratingValue": p.rating,
            "reviewCount": p.review_count
        };
    }

    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schema);
    document.head.appendChild(script);
}

// -----------------------------------------
// Best Alternatives
// -----------------------------------------
async function fetchAlternatives(currentProduct) {
    if (!currentProduct.price || !currentProduct.category) return;
    
    // Find alternatives: +- 30% price, same category
    const minP = currentProduct.price * 0.7;
    const maxP = currentProduct.price * 1.3;
    
    try {
        const res = await fetch(`/api/products?category=${currentProduct.category}&min_price=${minP}&max_price=${maxP}&limit=4&sort=rating:desc`);
        let json = await res.json();
        
        if (json.data) {
            // Filter out current product
            const alts = json.data.filter(p => p.id !== currentProduct.id).slice(0, 3);
            
            if (alts.length > 0) {
                document.getElementById('alternatives-section').style.display = 'block';
                const grid = document.getElementById('alternatives-grid');
                grid.innerHTML = alts.map(p => `
                    <a href="/product.html?id=${p.id}" class="product-card" style="text-decoration:none;">
                        <div class="product-thumb">
                            <img src="${p.image_url}" loading="lazy" onerror="this.style.display='none'">
                        </div>
                        <div class="product-info">
                            <h3 class="product-title" style="-webkit-line-clamp: 2;">${escapeHtml(p.product_name)}</h3>
                            <div class="product-price">
                                <span class="price-current">$${p.price.toFixed(2)}</span>
                            </div>
                            <div class="product-meta" style="margin-top:0.5rem; color:var(--text-muted); font-size:0.8rem;">
                                ⭐ ${p.rating ? p.rating.toFixed(1) : ''} | ${p.brand || ''}
                            </div>
                        </div>
                    </a>
                `).join('');
            }
        }
    } catch (e) {
        console.error("Failed to load alternatives", e);
    }
}
