// ============================================
// 3D Printer Prices — Frontend App
// ============================================

const API_BASE = '/api';
const PAGE_SIZE = 100;

// Amazon Affiliate Tag — replace with your Associates tag
// สมัครได้ที่: https://affiliate-program.amazon.com
const AMAZON_AFFILIATE_TAG = 'kiti09-20';

let currentPage = 0;
let totalProducts = 0;
let activeFilters = { category: '3d_printer' };  // Show printers first by default

// Compare feature state
let compareList = JSON.parse(localStorage.getItem('compareList')) || [];

// ============================================
// URL Parameter Handling
// ============================================
function readUrlFilters() {
    // 1. Check for server-injected preset filters (use-case landing pages)
    if (window.__PRESET_FILTERS) {
        activeFilters = { ...window.__PRESET_FILTERS };
        return;
    }

    // 2. Check URL query parameters
    const params = new URLSearchParams(window.location.search);
    const urlFilters = {};

    // Read filter params from URL
    ['category', 'search', 'brand', 'condition', 'min_price', 'max_price', 'product_type'].forEach(key => {
        if (params.has(key)) urlFilters[key] = params.get(key);
    });

    // Read sort from URL
    if (params.has('sort')) {
        const sortEl = document.getElementById('sort-select');
        if (sortEl) sortEl.value = params.get('sort');
    }

    // If URL has any filters, use them; otherwise use default
    if (Object.keys(urlFilters).length > 0) {
        activeFilters = urlFilters;
    }
}

function updateUrl() {
    const params = new URLSearchParams();

    // Add active filters to URL (skip default category=3d_printer to keep URL clean)
    Object.entries(activeFilters).forEach(([key, val]) => {
        if (val) params.set(key, val);
    });

    // Add sort if not default
    const sortVal = document.getElementById('sort-select')?.value;
    if (sortVal && sortVal !== 'rating:desc') {
        params.set('sort', sortVal);
    }

    const queryStr = params.toString();
    const newUrl = queryStr ? `${window.location.pathname}?${queryStr}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
}

function syncUiFromFilters() {
    // Sync search input
    const searchEl = document.getElementById('search-input');
    if (searchEl) searchEl.value = activeFilters.search || '';

    // Sync price inputs
    const minEl = document.getElementById('min-price');
    const maxEl = document.getElementById('max-price');
    if (minEl) minEl.value = activeFilters.min_price || '';
    if (maxEl) maxEl.value = activeFilters.max_price || '';

    // Sync checkboxes (after they load)
    setTimeout(() => syncSidebarCheckboxes(), 500);
}

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    readUrlFilters();
    loadStats();
    loadFilters();
    loadFeaturedCampaigns();
    loadProducts();
    setupEventListeners();
    setupTheme();
    setupMobileNav();
    syncUiFromFilters();
    renderCompareTray();
});

// ============================================
// Theme Toggle
// ============================================
function setupTheme() {
    const saved = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);

    document.getElementById('theme-toggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        updateThemeIcon(next);
    });
}

function updateThemeIcon(theme) {
    document.getElementById('theme-toggle').textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ============================================
// Mobile Navigation
// ============================================
function setupMobileNav() {
    const toggle = document.getElementById('mobile-menu-toggle');
    const nav = document.getElementById('mobile-nav');
    const overlay = document.getElementById('mobile-nav-overlay');
    const close = document.getElementById('mobile-nav-close');
    if (!toggle || !nav) return;

    function openNav() { nav.classList.add('open'); overlay?.classList.add('open'); document.body.style.overflow = 'hidden'; }
    function closeNav() { nav.classList.remove('open'); overlay?.classList.remove('open'); document.body.style.overflow = ''; }

    toggle.addEventListener('click', openNav);
    close?.addEventListener('click', closeNav);
    overlay?.addEventListener('click', closeNav);
}

// ============================================
// Load Stats
// ============================================
async function loadStats() {
    try {
        const res = await fetch(`${API_BASE}/products/stats`);
        const stats = await res.json();

        const elTotal = document.getElementById('stat-total');
        if (elTotal) elTotal.textContent = stats.total?.toLocaleString() || '0';

        const printerCount = (stats.byCategory?.['3d_printer']?.count || 0);
        const elPrinters = document.getElementById('stat-printers');
        if (elPrinters) elPrinters.textContent = printerCount.toLocaleString();

        const filamentCount = (stats.byCategory?.['filament']?.count || 0) + (stats.byCategory?.['resin']?.count || 0);
        const elFilament = document.getElementById('stat-filament');
        if (elFilament) elFilament.textContent = filamentCount.toLocaleString();

        // Fetch last scrape time
        try {
            const scrapeRes = await fetch(`${API_BASE}/scrape-status`);
            const scrapeData = await scrapeRes.json();
            const elUpdated = document.getElementById('stat-updated');
            if (elUpdated) {
                if (scrapeData.lastScrape) {
                    elUpdated.textContent = timeAgo(scrapeData.lastScrape);
                    elUpdated.title = new Date(scrapeData.lastScrape).toLocaleString();
                } else {
                    elUpdated.textContent = '—';
                }
            }
        } catch (e) {
            const elUpdated = document.getElementById('stat-updated');
            if (elUpdated) elUpdated.textContent = '—';
        }
    } catch (err) {
        console.error('Stats error:', err);
    }
}

function timeAgo(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
}

// ============================================
// Load Filters
// ============================================
async function loadFilters() {
    try {
        const res = await fetch(`${API_BASE}/filters`);
        const filters = await res.json();

        // Categories
        const categoryContainer = document.getElementById('category-filters');
        const categoryLabels = {
            '3d_printer': '🖨️ 3D Printers',
            'filament': '🧵 Filament',
            'resin': '💧 Resin',
            'accessories': '🔧 Accessories',
            '3d_pen': '✏️ 3D Pens',
        };
        (filters.categories || []).forEach(cat => {
            const label = document.createElement('label');
            const checked = cat === '3d_printer' ? 'checked' : '';
            label.innerHTML = `<input type="checkbox" name="category" value="${cat}" ${checked}> ${categoryLabels[cat] || cat}`;
            categoryContainer.appendChild(label);
        });

        // Brands
        const brandContainer = document.getElementById('brand-filters');
        (filters.brands || []).slice(0, 15).forEach(brand => {
            if (!brand) return;
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" name="brand" value="${brand}"> ${brand}`;
            brandContainer.appendChild(label);
        });

        // Conditions
        const conditionContainer = document.getElementById('condition-filters');
        (filters.conditions || []).forEach(cond => {
            const label = document.createElement('label');
            const icon = cond === 'new' ? '✨' : '♻️';
            label.innerHTML = `<input type="checkbox" name="condition" value="${cond}"> ${icon} ${cond.charAt(0).toUpperCase() + cond.slice(1)}`;
            conditionContainer.appendChild(label);
        });
    } catch (err) {
        console.error('Filters error:', err);
    }
}

// ============================================
// Load Featured Campaigns
// ============================================
async function loadFeaturedCampaigns() {
    const container = document.getElementById('featured-campaigns-container');
    if (!container) return;
    
    try {
        const res = await fetch('/api/featured-campaigns');
        const data = await res.json();
        
        if (data.success && data.campaigns && data.campaigns.length > 0) {
            let html = '<h2 class="section-title" style="margin-bottom:1rem;font-size:1.25rem;">🔥 Featured Amazon Deals</h2>';
            html += '<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(300px, 1fr));gap:1rem;">';
            
            data.campaigns.forEach(c => {
                html += `
                    <div style="background:var(--card-bg);border:2px solid var(--primary);border-radius:var(--radius);padding:1rem;display:flex;gap:1rem;align-items:center;">
                        <img src="${c.image_url}" alt="${c.product_name}" style="width:80px;height:80px;object-fit:contain;background:#fff;border-radius:4px;">
                        <div>
                            <div style="font-size:0.75rem;color:var(--primary);font-weight:bold;text-transform:uppercase;margin-bottom:0.25rem;">Special Offer</div>
                            <h3 style="font-size:1rem;margin:0 0 0.5rem 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;">
                                <a href="${c.campaign_url}" target="_blank" rel="nofollow noopener" style="color:var(--text);text-decoration:none;">${c.product_name}</a>
                            </h3>
                            <div style="font-size:1.25rem;font-weight:bold;color:var(--success);">
                                $${parseFloat(c.price).toFixed(2)} 
                                ${c.commission_rate ? `<span style="font-size:0.75rem;color:var(--text-muted);font-weight:normal;">+ ${c.commission_rate}% creator bonus</span>` : ''}
                            </div>
                            <a href="${c.campaign_url}" target="_blank" rel="nofollow noopener" class="btn btn-primary btn-sm" style="margin-top:0.5rem;display:inline-block;">View Deal on Amazon</a>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            container.innerHTML = html;
            container.style.display = 'block';
        } else {
            container.style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to load featured campaigns:', e);
    }
}

// ============================================
// Load Products
// ============================================
async function loadProducts() {
    const tbody = document.getElementById('products-body');
    // Skeleton loading — 6 placeholder rows with shimmer
    tbody.innerHTML = Array.from({ length: 6 }, () => `
        <tr class="skeleton-row">
            <td class="product-name"><div style="display:flex;align-items:center;gap:1rem;">
                <div class="skeleton-box" style="width:50px;height:50px;border-radius:8px;"></div>
                <div style="flex:1;"><div class="skeleton-box" style="width:80%;height:14px;margin-bottom:6px;"></div><div class="skeleton-box" style="width:50%;height:10px;"></div></div>
            </div></td>
            <td><div class="skeleton-box" style="width:60px;height:14px;"></div></td>
            <td><div class="skeleton-box" style="width:50px;height:14px;"></div></td>
            <td><div class="skeleton-box" style="width:70px;height:14px;"></div></td>
            <td><div class="skeleton-box" style="width:40px;height:14px;"></div></td>
            <td><div class="skeleton-box" style="width:40px;height:14px;"></div></td>
            <td><div class="skeleton-box" style="width:80px;height:28px;border-radius:4px;"></div></td>
        </tr>
    `).join('');

    try {
        const params = new URLSearchParams({
            limit: PAGE_SIZE,
            offset: currentPage * PAGE_SIZE,
            ...activeFilters,
        });

        // Sort
        const sortVal = document.getElementById('sort-select').value;
        const [sortBy, sortOrder] = sortVal.split(':');
        params.set('sort_by', sortBy);
        params.set('sort_order', sortOrder);

        // Update URL to match current filters
        updateUrl();

        const res = await fetch(`${API_BASE}/products?${params}`);
        const { data, pagination } = await res.json();

        totalProducts = pagination.total;
        document.getElementById('result-count').textContent = `${totalProducts.toLocaleString()} products found`;

        if (!data || data.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7">
                        <div class="empty-state">
                            <span class="empty-icon">🔍</span>
                            <h3>No matches found</h3>
                            <p>We couldn't find any products matching your current filter combination.</p>
                            <button class="btn btn-primary" onclick="document.getElementById('clear-filters').click()">Clear All Filters</button>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = data.map(p => `
            <tr>
                <td class="product-name">
                    <a href="/product.html?id=${p.id}" class="product-name-link">
                        <img
                            src="${p.image_url || ''}"
                            alt="${escapeHtml(p.display_name || p.product_name)}"
                            class="product-thumb"
                            loading="lazy"
                            onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"
                        />
                        <span class="product-thumb-fallback" style="display:${p.image_url ? 'none' : 'flex'}">
                            ${p.category === 'filament' ? '🧵' : p.category === 'resin' ? '💧' : p.category === '3d_pen' ? '✏️' : p.category === 'accessories' ? '🔧' : '🖨️'}
                        </span>
                        <div style="display:flex; flex-direction:column; gap:0.25rem;">
                            <span class="product-title-text">${escapeHtml(p.display_name || p.product_name)}</span>
                            ${p.labels && p.labels.length > 0 ? `
                            <div class="ai-badges">
                                ${p.labels.map(l => `<span class="${l.toLowerCase().includes('beginner') ? 'badge-beginner' : 'badge-feature'}">${escapeHtml(l)}</span>`).join('')}
                            </div>
                            ` : ''}
                            <div style="margin-top: 0.5rem; display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap;">
                                <a href="${affiliateUrl(p.amazon_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm" onclick="event.stopPropagation()">Check Price</a>
                                <a href="/product.html?id=${p.id}" class="btn btn-secondary btn-sm" onclick="event.stopPropagation()">View Details</a>
                            </div>
                        </div>
                    </a>
                    <div style="margin-top:0.5rem; margin-left: calc(60px + 1rem); /* align with text */">
                        <label class="compare-checkbox-label" style="display:inline-flex; align-items:center; gap:0.3rem; font-size:0.75rem; color:var(--text-muted); cursor:pointer; font-weight: 500;">
                            <input type="checkbox" onchange="toggleCompare('${p.id}', this.dataset.name, this.dataset.image, ${p.price || 0}, this.dataset.url)" data-name="${escapeHtml(p.display_name || p.product_name)}" data-image="${p.image_url || ''}" data-url="${p.amazon_url}" ${compareList.some(c => c.id === p.id) ? 'checked' : ''}>
                            ➕ Compare
                        </label>
                    </div>
                </td>
                <td>${p.brand ? `<span class="brand-badge">${escapeHtml(p.brand)}</span>` : '—'}</td>
                <td class="price-cell">
                    $${p.price?.toFixed(2) || '—'}
                    ${p.original_price && p.discount_percent ? `<br><span class="orig-price">$${p.original_price.toFixed(2)}</span> <span class="discount-badge">-${p.discount_percent}%</span>` : ''}
                </td>
                <td>${p.build_volume ? escapeHtml(p.build_volume) : '—'}</td>
                <td class="rating-cell">
                    ${formatRating(p.rating, p.review_count)}
                    ${p.beginner_score ? `<br><span class="beginner-score">Beg. Score: ${p.beginner_score}/10</span>` : ''}
                </td>
                <td><span class="type-badge">${escapeHtml(
                    p.category === '3d_printer' 
                        ? (p.printer_type && p.printer_type !== 'Unknown' ? p.printer_type : 'FDM / Resin')
                        : (p.category ? p.category.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : formatType(p.product_type))
                )}</span></td>
                <td><span class="condition-${p.condition}">${p.condition === 'new' ? '✨ New' : '♻️ Used'}</span></td>
            </tr>
        `).join('');

        // Pagination
        const totalPages = Math.ceil(totalProducts / PAGE_SIZE);
        document.getElementById('page-info').textContent = `Page ${currentPage + 1} of ${totalPages}`;
        document.getElementById('prev-page').disabled = currentPage === 0;
        document.getElementById('next-page').disabled = !pagination.hasMore;

    } catch (err) {
        console.error('Products error:', err);
        tbody.innerHTML = '<tr><td colspan="7" class="loading">Error loading products</td></tr>';
    }
}

// ============================================
// Helpers
// ============================================
function formatRating(rating, reviewCount) {
    if (!rating) return '—';
    const stars = '★'.repeat(Math.round(rating)) + '☆'.repeat(5 - Math.round(rating));
    const reviews = reviewCount ? ` (${reviewCount.toLocaleString()})` : '';
    return `${stars} ${rating.toFixed(1)}${reviews}`;
}

function formatType(type) {
    if (!type) return '—';
    return type.replace(/_/g, ' ');
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function affiliateUrl(url) {
    if (!url) return '#';
    try {
        const u = new URL(url);
        u.searchParams.set('tag', AMAZON_AFFILIATE_TAG);
        return u.toString();
    } catch {
        return url;
    }
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
    // Search with debounce
    let searchTimeout;
    document.getElementById('search-input').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            if (e.target.value) {
                activeFilters.search = e.target.value;
            } else {
                delete activeFilters.search;
            }
            currentPage = 0;
            loadProducts();
        }, 400);
    });

    // Category/Brand/Condition checkboxes
    document.addEventListener('change', (e) => {
        if (e.target.matches('input[name="category"]')) {
            updateCheckboxFilter('category');
        } else if (e.target.matches('input[name="brand"]')) {
            updateCheckboxFilter('brand');
        } else if (e.target.matches('input[name="condition"]')) {
            updateCheckboxFilter('condition');
        }
    });

    // Price range with debounce
    let priceTimeout;
    ['min-price', 'max-price'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            clearTimeout(priceTimeout);
            priceTimeout = setTimeout(() => {
                const min = document.getElementById('min-price').value;
                const max = document.getElementById('max-price').value;
                if (min) activeFilters.min_price = min; else delete activeFilters.min_price;
                if (max) activeFilters.max_price = max; else delete activeFilters.max_price;
                currentPage = 0;
                loadProducts();
            }, 500);
        });
    });

    // Sort
    document.getElementById('sort-select').addEventListener('change', () => {
        currentPage = 0;
        loadProducts();
    });

    // Pagination
    document.getElementById('prev-page').addEventListener('click', () => {
        if (currentPage > 0) { currentPage--; loadProducts(); }
    });
    document.getElementById('next-page').addEventListener('click', () => {
        currentPage++;
        loadProducts();
    });

    // Clear filters
    document.getElementById('clear-filters').addEventListener('click', () => {
        activeFilters = {};
        currentPage = 0;
        document.getElementById('search-input').value = '';
        document.getElementById('min-price').value = '';
        document.getElementById('max-price').value = '';
        document.querySelectorAll('.filter-group input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('.use-case-chip').forEach(c => c.classList.remove('active'));
        document.getElementById('sort-select').value = 'rating:desc';
        loadProducts();
    });

    // Use-case cards
    document.querySelectorAll('.use-case-chip').forEach(card => {
        card.addEventListener('click', () => {
            const isActive = card.classList.contains('active');

            // Remove active from all cards
            document.querySelectorAll('.use-case-chip').forEach(c => c.classList.remove('active'));

            if (isActive) {
                // Deselect — reset to default
                activeFilters = { category: '3d_printer' };
                document.getElementById('search-input').value = '';
                document.getElementById('min-price').value = '';
                document.getElementById('max-price').value = '';
                syncSidebarCheckboxes();
            } else {
                // Apply this use-case filter
                card.classList.add('active');
                const filter = JSON.parse(card.dataset.filter);

                activeFilters = {};
                if (filter.category) activeFilters.category = filter.category;
                if (filter.min_price) activeFilters.min_price = filter.min_price;
                if (filter.max_price) activeFilters.max_price = filter.max_price;
                if (filter.search) activeFilters.search = filter.search;

                // Sync sidebar UI
                document.getElementById('search-input').value = filter.search || '';
                document.getElementById('min-price').value = filter.min_price || '';
                document.getElementById('max-price').value = filter.max_price || '';
                syncSidebarCheckboxes();
            }

            currentPage = 0;
            loadProducts();

            // Smooth scroll to results
            document.querySelector('.content').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function syncSidebarCheckboxes() {
    const cats = (activeFilters.category || '').split(',').filter(Boolean);
    document.querySelectorAll('input[name="category"]').forEach(cb => {
        cb.checked = cats.includes(cb.value);
    });
    document.querySelectorAll('input[name="brand"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[name="condition"]').forEach(cb => cb.checked = false);
}

function updateCheckboxFilter(name) {
    const checked = Array.from(document.querySelectorAll(`input[name="${name}"]:checked`));
    if (checked.length > 0) {
        activeFilters[name] = checked.map(c => c.value).join(',');
    } else {
        delete activeFilters[name];
    }
    currentPage = 0;
    loadProducts();
}

// ============================================
// Quiz Logic
// ============================================
const quizBtn = document.getElementById('take-quiz-btn-hero');
const quizModal = document.getElementById('quiz-modal');
const closeQuizBtn = document.getElementById('close-quiz');
const quizSteps = document.querySelectorAll('.quiz-step');
const progressBar = document.getElementById('quiz-progress-bar');
let currentStep = 1;
let quizAnswers = {};

if (quizBtn && quizModal) {
    quizBtn.addEventListener('click', () => {
        quizModal.style.display = 'flex';
        currentStep = 1;
        quizAnswers = {};
        updateQuizUI();
    });

    closeQuizBtn.addEventListener('click', () => {
        quizModal.style.display = 'none';
    });

    // Handle clicks outside modal content
    quizModal.addEventListener('click', (e) => {
        if (e.target === quizModal) quizModal.style.display = 'none';
    });

    // Handle option clicks
    document.querySelectorAll('.quiz-option').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const answer = e.target.dataset.answer;
            
            // Store answer based on current step
            if (currentStep === 1) quizAnswers.budget = answer;
            if (currentStep === 2) quizAnswers.experience = answer;
            if (currentStep === 3) quizAnswers.useCase = answer;

            currentStep++;
            updateQuizUI();

            // If finished (reached step 4 loader)
            if (currentStep === 4) {
                setTimeout(() => processQuizResults(), 1200);
            }
        });
    });
}

function updateQuizUI() {
    quizSteps.forEach((step, idx) => {
        step.style.display = (idx + 1 === currentStep) ? 'block' : 'none';
    });
    // Update progress bar
    if (progressBar) {
        const progress = Math.min((currentStep / 3) * 100, 100);
        progressBar.style.width = `${progress}%`;
    }
}

function processQuizResults() {
    activeFilters = { category: '3d_printer' }; // Reset and focus on printers
    
    // 1. Budget
    if (quizAnswers.budget === 'budget_low') {
        activeFilters.max_price = 250;
    } else if (quizAnswers.budget === 'budget_mid') {
        activeFilters.min_price = 200;
        activeFilters.max_price = 600;
    } else if (quizAnswers.budget === 'budget_high') {
        activeFilters.min_price = 600;
    }

    // 2. Experience
    if (quizAnswers.experience === 'exp_beginner') {
        activeFilters.beginner_only = 'true';
    }

    // 3. Use Case
    if (quizAnswers.useCase === 'use_cosplay') {
        activeFilters.printer_type = 'FDM';
    } else if (quizAnswers.useCase === 'use_miniatures') {
        activeFilters.printer_type = 'Resin';
    } else if (quizAnswers.useCase === 'use_functional') {
        activeFilters.printer_type = 'FDM';
    }

    // Apply filters and reload
    currentPage = 0;
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';
    syncSidebarCheckboxes(); // Clear UI checkboxes
    
    // Deselect use-case chips in sidebar
    document.querySelectorAll('.use-case-chip').forEach(c => c.classList.remove('active'));

    loadProducts();

    // Close modal and scroll wrapper
    quizModal.style.display = 'none';
    const contentArea = document.querySelector('.content');
    if (contentArea) {
        contentArea.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ============================================
// Compare Tool Logic
// ============================================
function toggleCompare(id, name, image, price, url) {
    const existingIdx = compareList.findIndex(c => c.id === id);
    if (existingIdx >= 0) {
        compareList.splice(existingIdx, 1);
    } else {
        if (compareList.length >= 3) {
            alert('You can only compare up to 3 printers at a time.');
            const cb = document.querySelector(`input[onchange*="${id}"]`);
            if (cb) cb.checked = false;
            return;
        }
        compareList.push({ id, name, image, price, url });
    }
    localStorage.setItem('compareList', JSON.stringify(compareList));
    renderCompareTray();
}

function removeCompare(id) {
    compareList = compareList.filter(c => c.id !== id);
    localStorage.setItem('compareList', JSON.stringify(compareList));
    const cb = document.querySelector(`input[onchange*="${id}"]`);
    if (cb) cb.checked = false;
    renderCompareTray();
}

function renderCompareTray() {
    let tray = document.getElementById('compare-tray');
    if (!tray) {
        tray = document.createElement('div');
        tray.id = 'compare-tray';
        tray.className = 'compare-tray';
        document.body.appendChild(tray);
    }

    if (compareList.length === 0) {
        tray.classList.remove('active');
        return;
    }
    tray.classList.add('active');

    tray.innerHTML = `
        <div class="compare-tray-content">
            <div class="compare-items">
                ${compareList.map(item => `
                    <div class="compare-item">
                        <img src="${item.image}" alt="${escapeHtml(item.name)}" onerror="this.style.display='none'">
                        <div class="compare-item-details">
                            <span class="compare-item-name">${escapeHtml(item.name)}</span>
                            <span class="compare-item-price">$${item.price.toFixed(2)}</span>
                        </div>
                        <button class="compare-item-remove" onclick="removeCompare('${item.id}')" aria-label="Remove ${escapeHtml(item.name)} from comparison">&times;</button>
                    </div>
                `).join('')}
                ${Array(3 - compareList.length).fill('<div class="compare-placeholder">Add another</div>').join('')}
            </div>
            <div class="compare-actions">
                <button class="btn btn-primary" onclick="openCompareModal()" ${compareList.length < 2 ? 'disabled' : ''}>
                    Compare ${compareList.length} Items
                </button>
                <button class="btn btn-tertiary" style="margin-left:0.5rem;" onclick="clearCompare()">Clear</button>
            </div>
        </div>
    `;
}

function clearCompare() {
    compareList = [];
    localStorage.removeItem('compareList');
    document.querySelectorAll('.compare-checkbox').forEach(cb => cb.checked = false);
    renderCompareTray();
}

function openCompareModal() {
    const ids = compareList.map(c => c.id).join(',');
    window.open(`/compare.html?ids=${ids}`, '_blank');
}
