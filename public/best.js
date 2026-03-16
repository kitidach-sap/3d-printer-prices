const API_BASE = '/api';

// Pre-defined landing page rules
const useCases = {
    'beginners': {
        title: 'Best 3D Printers for Beginners',
        desc: 'Top-rated entry-level machines that are easy to use, highly reliable, and require minimal assembly or tinkering out of the box.',
        icon: '🎓',
        filters: { category: '3d_printer' },
        sortRules: (a, b) => (b.beginner_score || 0) - (a.beginner_score || 0)
    },
    'resin-detail': {
        title: 'Best Resin Printers for High Detail',
        desc: 'The best LCD and SLA resin 3D printers for printing tabletop miniatures, jewelry, and high-fidelity prototypes.',
        icon: '💧',
        filters: { category: '3d_printer', search: 'resin' }, // Quick filter for resin
        sortRules: (a, b) => (b.rating || 0) - (a.rating || 0)
    },
    'budget': {
        title: 'Best Budget 3D Printers Under $300',
        desc: 'Incredible value for money. These budget-friendly 3D printers offer fantastic performance without breaking the bank.',
        icon: '💰',
        filters: { category: '3d_printer', max_price: 300 },
        sortRules: (a, b) => (b.rating || 0) - (a.rating || 0)
    },
    'speed': {
        title: 'Fastest CoreXY 3D Printers',
        desc: 'Need speed? These high-speed CoreXY 3D printers deliver rapid prototyping without sacrificing print quality.',
        icon: '⚡',
        filters: { category: '3d_printer' },
        preFilter: (p) => {
            // Check if speed_score exists and is high or if AI strengths mentions speed
            if (p.speed_score && p.speed_score >= 8) return true;
            if (p.ai_strengths && p.ai_strengths.toLowerCase().includes('speed')) return true;
            if (p.labels && p.labels.includes('High Speed')) return true;
            return false;
        },
        sortRules: (a, b) => (b.speed_score || b.rating || 0) - (a.speed_score || a.rating || 0)
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Enable same dark theme loading
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', savedTheme);

    const params = new URLSearchParams(window.location.search);
    const type = params.get('type');
    
    if (!type || !useCases[type]) {
        // Fallback to budget if not found
        window.location.href = '/best.html?type=budget';
        return;
    }
    
    const useCase = useCases[type];
    
    document.getElementById('page-title').textContent = `${useCase.title} - 3D Printer Prices`;
    document.getElementById('page-desc').setAttribute('content', useCase.desc);
    document.getElementById('hero-title').textContent = `${useCase.icon} ${useCase.title}`;
    document.getElementById('hero-desc').textContent = useCase.desc;
    
    fetchRankingData(useCase);
});

async function fetchRankingData(useCase) {
    try {
        const queryParams = new URLSearchParams({
            limit: 100, // Fetch top 100, then we do JS side filtering/sorting since our API might not support complex scoring
            ...useCase.filters
        });
        
        const res = await fetch(`${API_BASE}/products?${queryParams}`);
        const { data } = await res.json();
        
        if (!data || data.length === 0) {
            showEmpty();
            return;
        }
        
        // 1. Pre-filter (e.g., speed rules)
        let filteredData = data;
        if (useCase.preFilter) {
            filteredData = data.filter(useCase.preFilter);
        }
        
        // 2. Sort custom rules
        filteredData.sort(useCase.sortRules);
        
        // 3. Take top 5
        const top5 = filteredData.slice(0, 5);
        
        if (top5.length === 0) {
            showEmpty();
            return;
        }
        
        renderRankings(top5);
        
    } catch (err) {
        console.error('Error fetching best-for rankings:', err);
        showError("We couldn't load the rankings right now.");
    }
}

function showEmpty() {
    document.getElementById('loader-wrapper').style.display = 'none';
    document.getElementById('rankings-content').style.display = 'none';
    document.getElementById('error-state').style.display = 'none';
    document.getElementById('empty-state').style.display = 'block';
}

function showError(msg) {
    document.getElementById('loader-wrapper').style.display = 'none';
    document.getElementById('rankings-content').style.display = 'none';
    document.getElementById('empty-state').style.display = 'none';
    document.getElementById('error-state').style.display = 'block';
    if (msg) {
        document.querySelector('#error-state p').textContent = msg;
    }
}

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return String(unsafe)
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}

function tryParseList(arrStr) {
    if (!arrStr) return [];
    try {
        return JSON.parse(arrStr) || [];
    } catch {
        return [];
    }
}

function renderRankings(products) {
    document.getElementById('loader-wrapper').style.display = 'none';
    const container = document.getElementById('rankings-content');
    container.style.display = 'flex';
    
    let html = '';
    
    products.forEach((p, idx) => {
        const rank = idx + 1;
        const strengths = tryParseList(p.ai_strengths);
        
        html += `
            <article class="rank-card">
                <div class="rank-badge">#${rank}</div>
                
                <div class="rank-image-col">
                    <img src="${p.image_url}" alt="${escapeHtml(p.product_name)}" loading="lazy" onerror="this.style.display='none'">
                </div>
                
                <div class="rank-details-col">
                    <h2 class="rank-title">
                        <a href="/product.html?id=${p.id}">${escapeHtml(p.product_name)}</a>
                    </h2>
                    
                    <div class="rank-price">$${p.price?.toFixed(2) || '---'} 
                        <span style="font-size:1rem; color:var(--text-muted); font-weight:normal; margin-left: var(--sp-2);">⭐ ${p.rating || 'N/A'} (${p.review_count || 0})</span>
                    </div>
                    
                    <div class="rank-specs">
                        <div class="rank-spec-item">
                            <span>Type</span>
                            <span>${escapeHtml(p.printer_type || '3D Printer')}</span>
                        </div>
                        <div class="rank-spec-item">
                            <span>Build Volume</span>
                            <span>${escapeHtml(p.build_volume || 'Standard')}</span>
                        </div>
                        <div class="rank-spec-item">
                            <span>Brand</span>
                            <span>${escapeHtml(p.brand || 'Unknown')}</span>
                        </div>
                        <div class="rank-spec-item">
                            <span>Beginner Score</span>
                            <span>${p.beginner_score ? p.beginner_score + '/10' : 'N/A'}</span>
                        </div>
                    </div>
                    
                    <div class="rank-pros">
                        <b style="color:var(--text-primary);">Why it ranks well:</b>
                        <ul>
                            ${strengths.slice(0, 3).map(str => `<li><span style="color:var(--success);">✓</span> ${escapeHtml(str)}</li>`).join('')}
                            ${!strengths.length && p.ai_who_for ? `<li>${escapeHtml(p.ai_who_for)}</li>` : ''}
                        </ul>
                    </div>
                    
                    <div class="rank-actions-grid">
                        <a href="${p.amazon_url ? (p.amazon_url.includes('?') ? p.amazon_url + '&tag=kiti09-20' : p.amazon_url + '?tag=kiti09-20') : '#'}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-lg w-full">Check Price</a>
                        <a href="/product.html?id=${p.id}" class="btn btn-secondary btn-md w-full" style="display:flex; align-items:center; justify-content:center;">View Details</a>
                    </div>
                </div>
            </article>
        `;
    });
    
    container.innerHTML = html;
}
