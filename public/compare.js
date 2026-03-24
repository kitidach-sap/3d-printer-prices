const API_BASE = '/api';

document.addEventListener('DOMContentLoaded', () => {
    // Enable same dark theme loading
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);

    const params = new URLSearchParams(window.location.search);
    const idsString = params.get('ids');
    
    if (!idsString) {
        showEmpty();
        return;
    }
    
    const ids = idsString.split(',').filter(id => id.trim() !== '');
    if (ids.length === 0) {
        showEmpty();
        return;
    }
    
    fetchComparisonData(ids);
});

function showEmpty() {
    document.getElementById('loader-wrapper').style.display = 'none';
    document.getElementById('compare-content').style.display = 'none';
    document.getElementById('error-state').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
}

function showError(msg) {
    document.getElementById('loader-wrapper').style.display = 'none';
    document.getElementById('compare-content').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    if (msg) {
        document.querySelector('#error-state p').textContent = msg;
    }
}

async function fetchComparisonData(ids) {
    try {
        const res = await fetch(`${API_BASE}/products?ids=${ids.join(',')}`);
        const result = await res.json();
        
        if (!result.data || result.data.length === 0) {
            showEmpty();
            return;
        }
        
        // Reorder results to match the 'ids' array order
        let products = ids.map(id => result.data.find(p => p.id === id)).filter(p => p !== null);
        
        if (products.length === 0) {
            showEmpty();
            return;
        }
        
        renderComparison(products);
        
    } catch (err) {
        console.error('Error fetching comparison details:', err);
        showError("We couldn't load the comparison data right now.");
    }
}

function renderComparison(products) {
    document.getElementById('loader-wrapper').style.display = 'none';
    document.getElementById('compare-content').style.display = 'block';
    
    const table = document.getElementById('compare-table');
    
    const rows = [
        { label: '', key: 'header', render: (p) => `
            <img src="${p.image_url}" class="compare-img" alt="${escapeHtml(p.product_name)}" loading="lazy" onerror="this.style.display='none'">
            <div class="compare-title"><a href="/product.html?id=${p.id}" target="_blank" style="color:inherit; text-decoration:none;">${escapeHtml(p.display_name || p.product_name)}</a></div>
            <div class="compare-price">$${p.price?.toFixed(2) || '---'}</div>
            <div style="display: flex; flex-direction: column; gap: var(--sp-2);">
                <a href="${p.amazon_url ? (p.amazon_url.includes('?') ? p.amazon_url + '&tag=kiti09-20' : p.amazon_url + '?tag=kiti09-20') : '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-md w-full" data-product-id="${p.id}" data-smart-link="1">Check Price</a>
                <button class="btn btn-tertiary btn-sm text-danger w-full" onclick="removeCompareItem('${p.id}')">Remove</button>
            </div>
        `},
        { label: 'Type', key: 'category', render: (p) => `<span style="text-transform:uppercase; font-size:0.9rem; font-weight:600; color:var(--accent);">${escapeHtml(p.category === '3d_printer' ? (p.printer_type && p.printer_type !== 'Unknown' ? p.printer_type : 'FDM / Resin') : (p.category ? p.category.replace('_', ' ') : p.product_type || '—'))}</span>` },
        { label: 'Rating', key: 'rating', render: (p) => `⭐ ${p.rating || 'N/A'} <span style="font-size:0.8rem;color:var(--text-muted);">(${p.review_count || 0} revs)</span>` },
        { label: 'Build Volume', key: 'build_volume', render: (p) => p.build_volume ? `📏 ${escapeHtml(p.build_volume)}` : '—' },
        { label: 'Beginner Score', key: 'beginner_score', render: (p) => p.beginner_score ? `<b style="font-size:1.2rem;color:var(--success);">${p.beginner_score}/10</b>` : '—' },
        { label: 'Who is it for?', key: 'who_for', render: (p) => {
            let who = p.ai_who_for || (p.specs_json && p.specs_json["Target Audience"]) || (p.beginner_score > 7 ? 'Perfect for beginners looking to get started easily without troubleshooting.' : (p.beginner_score ? "Best for intermediate users or hobbyists who don't mind tinkering." : null));
            return who ? `<p style="line-height:1.5; font-size:0.9rem;">${escapeHtml(who)}</p>` : '—';
        }},
        { label: 'Key Strengths', key: 'strengths', render: (p) => {
            let s = p.ai_strengths;
            if (!s && p.category === '3d_printer') {
                let arr = [];
                if (p.price && p.price < 250) arr.push("Very affordable price point");
                if (p.rating && p.rating > 4.4) arr.push(`Highly rated by ${p.review_count || 0} users`);
                if (p.labels && p.labels.length > 0) arr.push(...p.labels.slice(0, 2));
                if (arr.length === 0 && p.price) arr.push("Solid all-around specifications");
                if (arr.length > 0) s = JSON.stringify(arr);
            }
            return formatList(s, '✓', 'yes');
        }},
        { label: 'Drawbacks', key: 'weaknesses', render: (p) => {
            let w = p.ai_weaknesses;
            if (!w && p.category === '3d_printer') {
                let arr = [];
                if (p.rating && p.rating < 4.0) arr.push("Overall user rating is slightly below average");
                if (!p.brand) arr.push("Lesser-known brand support");
                if (p.price && p.price > 1000) arr.push("High initial investment cost");
                if (arr.length === 0 && p.price) arr.push("No major red flags detected");
                if (arr.length > 0) w = JSON.stringify(arr);
            }
            return formatList(w, '✗', 'no');
        }},
        { label: 'Supported Materials', key: 'materials', render: (p) => {
            let m = p.ai_materials;
            if (!m) {
                if (p.specs_json && (p.specs_json["Supported Materials"] || p.specs_json["Materials"])) {
                    const matStr = p.specs_json["Supported Materials"] || p.specs_json["Materials"];
                    m = JSON.stringify(matStr.split(',').map(s => s.trim()));
                } else if (p.product_type) {
                     if (p.product_type.includes('fdm') || p.product_type.includes('pla')) m = JSON.stringify(['PLA', 'PETG', 'ABS', 'TPU']);
                     else if (p.product_type.includes('resin')) m = JSON.stringify(['Standard Resin', 'ABS-Like Resin', 'Water Washable']);
                }
            }
            return formatList(m, '•', 'bullet');
        }}
    ];
    
    let html = '';
    
    rows.forEach(row => {
        let trClass = row.key === 'header' ? 'class="compare-header-row"' : '';
        html += `<tr ${trClass}>`;
        if (row.key !== 'header') {
            html += `<th scope="row">${row.label}</th>`;
        } else {
            html += `<th></th>`;
        }
        products.forEach(p => {
            html += `<td>${row.render(p)}</td>`;
        });
        html += `</tr>`;
    });
    
    table.innerHTML = html;

    // Smart routing — upgrade links async (non-blocking)
    if (window.smartLink) window.smartLink.upgradeAll('compare');

    // Winner Highlight
    renderWinnerHighlight(products);

    // Decision Loop CTAs
    renderCompareDecisionCTAs();
}

// -----------------------------------------
// Winner Highlight
// -----------------------------------------
function renderWinnerHighlight(products) {
    if (products.length < 2) return;

    // Score: weighted combination of rating and value
    const scored = products.map(p => {
        let s = 0;
        if (p.rating) s += p.rating * 2;
        if (p.review_count > 100) s += 1;
        if (p.price && p.price < 300) s += 0.5;
        if (p.beginner_score) s += p.beginner_score * 0.3;
        return { product: p, score: s };
    }).sort((a, b) => b.score - a.score);

    const winner = scored[0].product;
    const runner = scored.length > 1 ? scored[1].product : null;

    let reason = 'Best combination of rating, value, and features.';
    if (winner.rating > 4.4 && winner.price < 300) reason = 'Top-rated AND budget-friendly — the best of both worlds.';
    else if (winner.rating > 4.4) reason = 'Highest user satisfaction with outstanding reviews.';
    else if (winner.price && runner && runner.price && winner.price < runner.price) reason = 'Best value per dollar with strong community ratings.';

    const winnerHTML = `
        <div style="max-width:900px; margin:var(--sp-6) auto 0; padding:var(--sp-6); background:var(--bg-card); border:2px solid var(--accent); border-radius:var(--radius); position:relative;">
            <span style="position:absolute; top:calc(var(--sp-3) * -1); left:var(--sp-4); padding:0.2rem 0.8rem; background:var(--accent); color:#fff; font-size:0.78rem; font-weight:700; border-radius:999px;">🏆 OUR PICK</span>
            <div style="display:flex; align-items:center; gap:var(--sp-5); flex-wrap:wrap;">
                ${winner.image_url ? `<img src="${winner.image_url}" alt="${escapeHtml(winner.display_name || winner.product_name)}" style="width:120px; height:120px; object-fit:contain; border-radius:var(--radius-sm); background:var(--bg-primary); padding:var(--sp-2);" loading="lazy">` : ''}
                <div style="flex:1; min-width:200px;">
                    <h3 style="margin:0 0 var(--sp-2); font-size:1.1rem;">${escapeHtml(winner.display_name || winner.product_name)}</h3>
                    <p style="margin:0 0 var(--sp-3); font-size:0.85rem; color:var(--text-secondary);">${reason}</p>
                    <div style="display:flex; align-items:center; gap:var(--sp-4); flex-wrap:wrap;">
                        <span style="font-size:1.3rem; font-weight:700; color:var(--success);">$${winner.price?.toFixed(2) || '—'}</span>
                        <span style="font-size:0.85rem; color:var(--warning); font-weight:500;">⭐ ${winner.rating?.toFixed(1) || 'N/A'} (${winner.review_count || 0} reviews)</span>
                        <a href="/product.html?id=${winner.id}" class="btn btn-primary btn-sm">View Full Details →</a>
                    </div>
                </div>
            </div>
        </div>
    `;

    const content = document.getElementById('compare-content');
    if (content) content.insertAdjacentHTML('beforeend', winnerHTML);
}

// -----------------------------------------
// Decision Loop CTAs (Compare Page)
// -----------------------------------------
function renderCompareDecisionCTAs() {
    const content = document.getElementById('compare-content');
    if (!content) return;

    const ctaHTML = `
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--sp-3); max-width:900px; margin:var(--sp-5) auto 0;">
            <a href="/" style="display:flex; align-items:center; gap:var(--sp-3); padding:var(--sp-4); background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); text-decoration:none; color:var(--text-primary); transition:border-color 0.2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                <span style="font-size:1.5rem;">🔍</span>
                <div>
                    <strong style="display:block; font-size:0.85rem;">Browse All Products</strong>
                    <span style="font-size:0.78rem; color:var(--text-muted);">Find more options to compare</span>
                </div>
            </a>
            <a href="/blog/how-to-choose-3d-printer.html" style="display:flex; align-items:center; gap:var(--sp-3); padding:var(--sp-4); background:var(--bg-card); border:1px solid var(--border); border-radius:var(--radius); text-decoration:none; color:var(--text-primary); transition:border-color 0.2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                <span style="font-size:1.5rem;">📖</span>
                <div>
                    <strong style="display:block; font-size:0.85rem;">Read the Buying Guide</strong>
                    <span style="font-size:0.78rem; color:var(--text-muted);">Learn what specs really matter</span>
                </div>
            </a>
        </div>
    `; 

    content.insertAdjacentHTML('beforeend', ctaHTML);
}

function removeCompareItem(id) {
    // 1. Remove from localStorage compareList
    let compareList = JSON.parse(localStorage.getItem('compareList')) || [];
    compareList = compareList.filter(c => c.id !== id);
    localStorage.setItem('compareList', JSON.stringify(compareList));
    
    // 2. Adjust current URL query and reload
    const params = new URLSearchParams(window.location.search);
    let ids = params.get('ids') ? params.get('ids').split(',') : [];
    ids = ids.filter(i => i !== id);
    
    if (ids.length > 0) {
        window.location.href = `/compare.html?ids=${ids.join(',')}`;
    } else {
        window.location.href = `/compare.html`; // will trigger empty state
    }
}

// Helpers
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function formatList(arrStr, bullet, formatClass) {
    if (!arrStr) return '—';
    try {
        const arr = JSON.parse(arrStr);
        if (!arr || !arr.length) return '—';
        return '<ul class="feature-list">' + arr.map(item => `<li><span class="feature-${formatClass}">${bullet}</span> <span>${escapeHtml(item)}</span></li>`).join('') + '</ul>';
    } catch {
        return escapeHtml(arrStr);
    }
}
