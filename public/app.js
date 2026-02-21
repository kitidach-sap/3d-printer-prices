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

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadFilters();
    loadProducts();
    setupEventListeners();
    setupTheme();
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
// Load Stats
// ============================================
async function loadStats() {
    try {
        const res = await fetch(`${API_BASE}/products/stats`);
        const stats = await res.json();

        document.getElementById('stat-total').textContent = stats.total?.toLocaleString() || '0';

        const printerCount = (stats.byCategory?.['3d_printer']?.count || 0);
        document.getElementById('stat-printers').textContent = printerCount.toLocaleString();

        const filamentCount = (stats.byCategory?.['filament']?.count || 0) + (stats.byCategory?.['resin']?.count || 0);
        document.getElementById('stat-filament').textContent = filamentCount.toLocaleString();

        const brandCount = stats.topBrands?.length || 0;
        document.getElementById('stat-brands').textContent = brandCount;
    } catch (err) {
        console.error('Stats error:', err);
    }
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
// Load Products
// ============================================
async function loadProducts() {
    const tbody = document.getElementById('products-body');
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Loading...</td></tr>';

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

        const res = await fetch(`${API_BASE}/products?${params}`);
        const { data, pagination } = await res.json();

        totalProducts = pagination.total;
        document.getElementById('result-count').textContent = `${totalProducts.toLocaleString()} products found`;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading">No products found</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(p => `
            <tr>
                <td class="product-name">
                    <a href="${affiliateUrl(p.amazon_url)}" target="_blank" rel="noopener nofollow">
                        ${escapeHtml(p.product_name)}
                    </a>
                </td>
                <td>${p.brand ? `<span class="brand-badge">${escapeHtml(p.brand)}</span>` : '—'}</td>
                <td class="price-cell">$${p.price?.toFixed(2) || '—'}</td>
                <td>${p.build_volume ? escapeHtml(p.build_volume) : '—'}</td>
                <td class="rating-cell">${formatRating(p.rating, p.review_count)}</td>
                <td><span class="type-badge">${formatType(p.product_type)}</span></td>
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
