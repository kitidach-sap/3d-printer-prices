document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const ids = params.get('ids');
    
    if (!ids) {
        document.getElementById('compare-results').innerHTML = '<p style="text-align:center;">No products selected for comparison.</p>';
        document.getElementById('compare-loader').style.display = 'none';
        return;
    }

    try {
        const res = await fetch(`/api/products?ids=${ids}`);
        const result = await res.json();
        
        if (!result.data || result.data.length === 0) {
            throw new Error('Products not found.');
        }

        renderComparison(result.data);
    } catch (err) {
        console.error(err);
        document.getElementById('compare-results').innerHTML = `<p style="text-align:center; color:red;">Error loading comparison data.</p>`;
    } finally {
        document.getElementById('compare-loader').style.display = 'none';
    }
});

function affiliateUrl(url) {
    const AMAZON_AFFILIATE_TAG = 'kiti09-20';
    if (!url) return '#';
    try {
        const u = new URL(url);
        u.searchParams.set('tag', AMAZON_AFFILIATE_TAG);
        return u.toString();
    } catch {
        return url + (url.includes('?') ? '&' : '?') + 'tag=' + AMAZON_AFFILIATE_TAG;
    }
}

function renderComparison(products) {
    // Collect all spec keys from all products
    const allSpecs = new Set();
    products.forEach(p => {
        if (p.specs_json) {
            Object.keys(p.specs_json).forEach(k => allSpecs.add(k));
        }
    });
    
    const specKeys = Array.from(allSpecs).sort();

    const tableHTML = `
        <table class="compare-table">
            <thead>
                <tr>
                    ${products.map(p => `
                        <th>
                            <img src="${p.image_url}" class="compare-header-img" onerror="this.style.display='none'">
                            <h3>${p.product_name}</h3>
                            <div style="font-size: 1.2rem; color: var(--success); margin-top:0.5rem;">
                                $${p.price?.toFixed(2) || 'N/A'}
                            </div>
                            <!-- Assuming affiliateUrl logic is handled correctly manually or we reproduce it -->
                            <a href="${affiliateUrl(p.amazon_url)}" target="_blank" class="btn btn-primary" style="display:block; margin-top:1rem; text-decoration:none; padding:10px;">Buy on Amazon</a>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
                <!-- Basic Info -->
                <tr>
                    ${products.map(p => `
                        <td>
                            <span class="spec-label">Brand</span>
                            ${p.brand || '—'}
                        </td>
                    `).join('')}
                </tr>
                <tr>
                    ${products.map(p => `
                        <td>
                            <span class="spec-label">Rating</span>
                            ⭐ ${p.rating ? p.rating.toFixed(1) : '—'} (${p.review_count || 0} reviews)
                        </td>
                    `).join('')}
                </tr>
                <tr>
                    ${products.map(p => `
                        <td>
                            <span class="spec-label">Type</span>
                            ${p.printer_type || p.product_type || '—'}
                        </td>
                    `).join('')}
                </tr>
                <tr>
                    ${products.map(p => `
                        <td>
                            <span class="spec-label">AI Beginner Score</span>
                            <span style="color:var(--accent); font-weight:bold;">${p.beginner_score ? p.beginner_score + '/10' : '—'}</span>
                        </td>
                    `).join('')}
                </tr>

                <!-- Specs JSON Loop -->
                ${specKeys.length > 0 ? `
                    <tr><td colspan="${products.length}" style="background:var(--bg-primary); font-weight:bold; padding:0.5rem 1rem; text-align:left;">Detailed Specs</td></tr>
                    ${specKeys.map(key => `
                        <tr>
                            ${products.map(p => `
                                <td>
                                    <span class="spec-label">${key}</span>
                                    ${p.specs_json && p.specs_json[key] ? p.specs_json[key] : '—'}
                                </td>
                            `).join('')}
                        </tr>
                    `).join('')}
                ` : ''}

            </tbody>
        </table>
    `;

    document.getElementById('compare-results').innerHTML = tableHTML;
}
