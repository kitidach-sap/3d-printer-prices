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
    document.getElementById('empty-state').style.display = 'block';
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
        showEmpty();
    }
}

function renderComparison(products) {
    document.getElementById('loader-wrapper').style.display = 'none';
    document.getElementById('compare-content').style.display = 'block';
    
    const table = document.getElementById('compare-table');
    
    const rows = [
        { label: '', key: 'header', render: (p) => `
            <img src="${p.image_url}" class="compare-img" onerror="this.style.display='none'">
            <div class="compare-title"><a href="/product.html?id=${p.id}" target="_blank" style="color:inherit; text-decoration:none;">${escapeHtml(p.product_name)}</a></div>
            <div class="compare-price">$${p.price?.toFixed(2) || '---'}</div>
            <a href="${p.amazon_url}" target="_blank" class="btn btn-primary" style="text-decoration:none; display:inline-block; margin-bottom: 0.5rem; width:100%; box-sizing:border-box;">View on Amazon</a><br>
            <button class="compare-remove" onclick="removeCompareItem('${p.id}')">Remove</button>
        `},
        { label: 'Type', key: 'category', render: (p) => `<span style="text-transform:uppercase; font-size:0.9rem; font-weight:600; color:var(--accent);">${escapeHtml(p.printer_type || (p.product_type ? p.product_type.replace(/_/g, ' ') : '—'))}</span>` },
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
            html += `<th>${row.label}</th>`;
        } else {
            html += `<th></th>`;
        }
        products.forEach(p => {
            html += `<td>${row.render(p)}</td>`;
        });
        html += `</tr>`;
    });
    
    table.innerHTML = html;
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
