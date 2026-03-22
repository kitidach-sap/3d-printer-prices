/**
 * Scaling Dashboard — Admin Control Panel
 * Handles all scaling tab logic: fetch data, render tables, actions, settings
 */

(function () {
    'use strict';

    const API_BASE = '';
    let _scalingData = null;
    let _currentSubTab = 'sc-overview';

    // ═══════════════════════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════════════════════

    function adminKey() {
        // adminKey is a global var set by admin.html's inline login script
        return window.adminKey || '';
    }
    function hdr() {
        return { 'Content-Type': 'application/json', 'x-admin-key': adminKey() };
    }
    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function pct(v) { return (v * 100).toFixed(0) + '%'; }

    // ── Chart Utilities (pure inline SVG — no external deps) ──────────────

    /**
     * Mini vertical bar chart
     * @param {number[]} values - data points
     * @param {object} opts - { width, height, color, label }
     */
    function miniBar(values, opts = {}) {
        const w = opts.width || 220, h = opts.height || 60;
        const color = opts.color || '#818cf8';
        const max = Math.max(...values, 1);
        const barW = Math.max(2, Math.floor((w - 4) / values.length) - 2);
        let bars = '';
        values.forEach((v, i) => {
            const bh = Math.max(1, (v / max) * (h - 14));
            const x = 2 + i * (barW + 2);
            const y = h - 12 - bh;
            bars += `<rect x="${x}" y="${y}" width="${barW}" height="${bh}" rx="1" fill="${color}" opacity="0.8"><title>${v}</title></rect>`;
        });
        const label = opts.label ? `<text x="${w / 2}" y="${h - 1}" text-anchor="middle" font-size="8" fill="var(--text-muted)">${opts.label}</text>` : '';
        return `<svg width="${w}" height="${h}" style="display:block">${bars}${label}</svg>`;
    }

    /**
     * Sparkline (trend line)
     */
    function sparkline(values, opts = {}) {
        const w = opts.width || 120, h = opts.height || 30;
        const color = opts.color || '#22d3ee';
        if (!values.length) return '';
        const max = Math.max(...values, 1);
        const min = Math.min(...values, 0);
        const range = max - min || 1;
        const points = values.map((v, i) => {
            const x = (i / (values.length - 1 || 1)) * w;
            const y = h - ((v - min) / range) * (h - 4) - 2;
            return `${x},${y}`;
        }).join(' ');
        return `<svg width="${w}" height="${h}" style="display:inline-block;vertical-align:middle"><polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    }

    /**
     * Donut chart
     */
    function donut(segments, opts = {}) {
        const size = opts.size || 80;
        const r = size / 2 - 6;
        const cx = size / 2, cy = size / 2;
        const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
        let angle = -90;
        let paths = '';
        const colors = ['#818cf8', '#22d3ee', '#f59e0b', '#10b981', '#f97316', '#ef4444', '#a78bfa', '#6366f1'];
        segments.forEach((seg, i) => {
            const pct = seg.value / total;
            const sweep = pct * 360;
            const startRad = (angle * Math.PI) / 180;
            const endRad = ((angle + sweep) * Math.PI) / 180;
            const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad);
            const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad);
            const largeArc = sweep > 180 ? 1 : 0;
            const c = seg.color || colors[i % colors.length];
            paths += `<path d="M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${largeArc},1 ${x2},${y2} Z" fill="${c}" opacity="0.85"><title>${seg.label}: ${seg.value} (${(pct * 100).toFixed(0)}%)</title></path>`;
            angle += sweep;
        });
        // White center for donut effect
        paths += `<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="var(--bg-card)"/>`;
        return `<svg width="${size}" height="${size}" style="display:block">${paths}</svg>`;
    }

    /**
     * Horizontal bar chart (e.g. for allocation %)
     */
    function hBar(items, opts = {}) {
        const w = opts.width || 200;
        const colors = ['#818cf8', '#22d3ee', '#f59e0b', '#10b981', '#f97316', '#ef4444'];
        const max = Math.max(...items.map(i => i.value), 1);
        let html = '<div style="display:flex;flex-direction:column;gap:4px;font-size:0.7rem">';
        items.forEach((item, i) => {
            const pctW = Math.max(2, (item.value / max) * 100);
            const c = item.color || colors[i % colors.length];
            html += `<div style="display:flex;align-items:center;gap:6px">`;
            html += `<span style="min-width:60px;text-align:right;color:var(--text-muted)">${esc(item.label)}</span>`;
            html += `<div style="flex:1;height:12px;background:var(--bg-body);border-radius:3px;overflow:hidden">`;
            html += `<div style="width:${pctW}%;height:100%;background:${c};border-radius:3px;transition:width 0.3s" title="${item.value}"></div>`;
            html += `</div>`;
            html += `<span style="min-width:30px;color:var(--text-secondary);font-weight:600">${item.value}${item.unit || ''}</span>`;
            html += `</div>`;
        });
        html += '</div>';
        return html;
    }


    function badge(text, type) {
        const colors = {
            winner: 'var(--success)', loser: 'var(--danger)', normal: 'var(--text-muted)',
            rising: '#22d3ee', falling: '#f97316', stable: 'var(--text-muted)',
            new: '#a78bfa', boosted: 'var(--primary)', decaying: '#f59e0b',
            high: 'var(--success)', medium: 'var(--warning)', low: 'var(--text-muted)',
            active: 'var(--success)', completed: 'var(--text-muted)', expired: 'var(--danger)',
            auto: 'var(--primary)', recommendation: 'var(--warning)', review: '#f97316',
        };
        const c = colors[text] || 'var(--text-muted)';
        return `<span style="display:inline-block;padding:0.1rem 0.4rem;border-radius:4px;font-size:0.68rem;font-weight:600;background:${c}20;color:${c};border:1px solid ${c}40">${esc(text)}</span>`;
    }
    function timeAgo(iso) {
        if (!iso) return '—';
        const d = new Date(iso);
        const s = Math.floor((Date.now() - d) / 1000);
        if (s < 60) return s + 's ago';
        if (s < 3600) return Math.floor(s / 60) + 'm ago';
        if (s < 86400) return Math.floor(s / 3600) + 'h ago';
        return Math.floor(s / 86400) + 'd ago';
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SUB-TABS
    // ═══════════════════════════════════════════════════════════════════════════

    function initSubTabs() {
        document.querySelectorAll('.sc-subtab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sc-subtab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const target = btn.dataset.sctab;
                document.querySelectorAll('.sc-tab-content').forEach(el => {
                    el.style.display = el.id === target ? 'block' : 'none';
                });
                _currentSubTab = target;
                loadSubTab(target);
            });
        });
    }

    function loadSubTab(tab) {
        switch (tab) {
            case 'sc-overview': loadOverview(); break;
            case 'sc-products': loadProducts(); break;
            case 'sc-articles': loadArticles(); break;
            case 'sc-variants': loadVariants(); break;
            case 'sc-campaigns': loadCampaigns(); break;
            case 'sc-sources': loadSources(); break;
            case 'sc-recs': loadRecommendations(); break;
            case 'sc-brain': loadBrain(); break;
            case 'sc-strategy': loadStrategy(); break;
            case 'sc-monitor': loadMonitor(); break;
            case 'sc-guard': loadGuardrails(); break;
            case 'sc-memory': loadMemory(); break;
            case 'sc-money': loadMonetization(); break;
            case 'sc-routes': loadRoutes(); break;
            case 'sc-ab': loadABTest(); break;
            case 'sc-predict': loadPredict(); break;
            case 'sc-settings': loadSettings(); break;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // OVERVIEW TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadOverview() {
        const el = $('sc-overview');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading scaling overview...</div>';
        try {
            const [overview, scaling, boostLog] = await Promise.all([
                fetch(`/api/admin/analytics/overview?key=${adminKey()}`).then(r => r.json()),
                fetch(`/api/admin/scaling/overview?key=${adminKey()}`).then(r => r.json()),
                fetch(`/api/admin/analytics/boost-log?key=${adminKey()}`).then(r => r.json()),
            ]);
            _scalingData = scaling;

            const mode = scaling.mode === 'auto' ? 'Full Auto' : scaling.dry_run ? 'Recommendation Only' : 'Partial Auto';
            const modeColor = scaling.mode === 'auto' ? 'var(--success)' : scaling.dry_run ? 'var(--warning)' : 'var(--primary)';

            // Top 5 products
            const topProducts = (scaling.products || []).slice(0, 5);
            const topArticles = (scaling.articles || []).slice(0, 5);
            const topVariant = [...(scaling.variants?.urgency || []), ...(scaling.variants?.position || []), ...(scaling.variants?.badge || [])]
                .sort((a, b) => (b.score || 0) - (a.score || 0))[0];
            const topSource = (scaling.sources || [])[0];
            const activeCampaigns = (scaling.campaigns || []).filter(c => c.status === 'active').length;
            const boostedCount = (scaling.products || []).filter(p => p.action === 'scale_up').length;

            el.innerHTML = `
                <div class="admin-card" style="border-left:3px solid ${modeColor}">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
                        <h3 style="margin:0">📈 System Status</h3>
                        <div style="display:flex;align-items:center;gap:0.5rem">
                            <span style="font-size:0.75rem;color:var(--text-muted)">Mode:</span>
                            <span style="font-weight:700;color:${modeColor};font-size:0.85rem">${mode}</span>
                            <span style="font-size:0.68rem;color:var(--text-muted)">· Updated ${timeAgo(scaling.generated_at)}</span>
                        </div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.75rem;margin-bottom:1rem">
                    ${metricCard('Total Clicks (7d)', overview.total_clicks_7d ?? overview.totalClicks7d ?? '—', '🖱️')}
                    ${metricCard('Total Clicks (24h)', overview.total_clicks_24h ?? overview.totalClicks24h ?? '—', '⚡')}
                    ${metricCard('Active Campaigns', activeCampaigns, '📢')}
                    ${metricCard('Boosted Items', boostedCount, '🚀')}
                    ${metricCard('Recommendations', (scaling.recommendations || []).length, '💡')}
                    ${metricCard('Tracked Sources', (scaling.sources || []).length, '🌐')}
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:0.75rem">
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">🏆 Top 5 Products</h4>
                        <table class="admin-table" style="font-size:0.72rem"><thead><tr><th>Product</th><th>Score</th><th>Trend</th><th>Action</th></tr></thead>
                        <tbody>${topProducts.map(p => `<tr>
                            <td>${esc(p.entity)}</td>
                            <td><strong>${p.global_score}</strong></td>
                            <td>${badge(p.trend, p.trend)}</td>
                            <td>${badge(p.action, p.action)}</td>
                        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No data yet</td></tr>'}</tbody></table>
                    </div>
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">📝 Top 5 Articles</h4>
                        <table class="admin-table" style="font-size:0.72rem"><thead><tr><th>Article</th><th>Score</th><th>Clicks</th><th>CTR</th></tr></thead>
                        <tbody>${topArticles.map(a => `<tr>
                            <td>${esc((a.entity || '').slice(0, 35))}${(a.entity || '').length > 35 ? '...' : ''}</td>
                            <td><strong>${a.base_score}</strong></td>
                            <td>${a.clicks}</td>
                            <td>${a.ctr || 0}%</td>
                        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No data yet</td></tr>'}</tbody></table>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;margin-top:0.75rem">
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">📊 Product Scores</h4>
                        ${topProducts.length ? miniBar(topProducts.map(p => p.global_score || 0), { color: '#818cf8', label: topProducts.map(p => (p.entity || '').slice(0, 6)).join(' · ') }) : '<p style="color:var(--text-muted);font-size:0.72rem">No data</p>'}
                    </div>
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">🌐 Source Distribution</h4>
                        <div style="display:flex;align-items:center;gap:1rem">
                            ${(scaling.sources || []).length ? donut((scaling.sources || []).slice(0, 6).map(s => ({ label: s.source || '?', value: s.affiliate_clicks || 1 })), { size: 70 }) : ''}
                            <div style="font-size:0.65rem;color:var(--text-muted)">${(scaling.sources || []).slice(0, 4).map(s => `<div>${esc(s.source)}: ${s.affiliate_clicks}</div>`).join('')}</div>
                        </div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.75rem;margin-top:0.75rem">
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">🏷️ Top Variant</h4>
                        <p style="font-size:0.82rem;margin:0">${topVariant ? `${esc(topVariant.entity)} ${badge(topVariant.verdict, topVariant.verdict)}` : 'No data yet'}</p>
                    </div>
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">🌐 Top Source</h4>
                        <p style="font-size:0.82rem;margin:0">${topSource ? `${esc(topSource.source)} — ${topSource.affiliate_clicks} affiliate clicks` : 'No data yet'}</p>
                    </div>
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">🔧 Feature Flags</h4>
                        <div style="font-size:0.72rem">${Object.entries(scaling.flags || {}).map(([k, v]) =>
                `<div style="display:flex;justify-content:space-between;padding:0.1rem 0"><span>${k.replace(/_/g, ' ')}</span><span style="color:${v ? 'var(--success)' : 'var(--danger)'}; font-weight:600">${v ? 'ON' : 'OFF'}</span></div>`
            ).join('')}</div>
                    </div>
                </div>
            `;
        } catch (e) {
            el.innerHTML = `<div class="admin-card"><p style="color:var(--danger)">Error loading overview: ${esc(e.message)}</p></div>`;
        }
    }

    function metricCard(label, value, emoji) {
        return `<div class="admin-card" style="text-align:center;padding:0.75rem">
            <div style="font-size:1.5rem">${emoji}</div>
            <div style="font-size:1.4rem;font-weight:800;color:var(--text-primary)">${value}</div>
            <div style="font-size:0.68rem;color:var(--text-muted);margin-top:0.2rem">${label}</div>
        </div>`;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRODUCTS TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadProducts() {
        const el = $('sc-products');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading products...</div>';
        try {
            const data = await fetch(`/api/admin/scaling/products?key=${adminKey()}`).then(r => r.json());
            const products = data.products || [];
            el.innerHTML = `
                <div class="admin-card">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
                        <h3 style="margin:0">📦 Product Scaling (${products.length})</h3>
                        <span style="font-size:0.72rem;color:var(--text-muted)">Mode: ${data.dry_run ? 'Dry Run' : data.mode}</span>
                    </div>
                    <div class="admin-table-wrapper">
                        <table class="admin-table" style="font-size:0.72rem">
                            <thead><tr>
                                <th>Product</th><th>Clicks</th><th>Score</th><th>Global</th>
                                <th>Trend</th><th>Boost</th><th>Confidence</th><th>Action</th><th>Controls</th>
                            </tr></thead>
                            <tbody>${products.map(p => `<tr>
                                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(p.entity)}">${esc(p.entity)}</td>
                                <td>${p.clicks}</td>
                                <td>${p.base_score}</td>
                                <td><strong>${p.global_score}</strong></td>
                                <td>${badge(p.trend, p.trend)} <span style="font-size:0.65rem">${p.trend_delta}</span></td>
                                <td>${p.scaling_weight}x</td>
                                <td>${badge(p.confidence, p.confidence)}</td>
                                <td>${badge(p.action, p.action)}</td>
                                <td style="white-space:nowrap">
                                    <button class="btn btn-sm" style="font-size:0.65rem;padding:0.15rem 0.3rem" 
                                        onclick="window._scBoost('${esc(p.entity)}','product',1.2)">⬆️</button>
                                    <button class="btn btn-sm" style="font-size:0.65rem;padding:0.15rem 0.3rem" 
                                        onclick="window._scBoost('${esc(p.entity)}','product',1.0)">Reset</button>
                                </td>
                            </tr>`).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text-muted)">No product data</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
                ${data.rising && data.rising.length ? `<div class="admin-card"><h4 style="margin-top:0;font-size:0.85rem">📈 Rising Products (${data.rising.length})</h4>
                <div style="display:flex;flex-wrap:wrap;gap:0.4rem">${data.rising.map(p =>
                    `<span style="background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;padding:0.3rem 0.5rem;font-size:0.72rem">${esc(p.entity)} ${badge(p.trend, p.trend)}</span>`
                ).join('')}</div></div>` : ''}
            `;
        } catch (e) {
            el.innerHTML = `<div class="admin-card"><p style="color:var(--danger)">Error: ${esc(e.message)}</p></div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ARTICLES TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadArticles() {
        const el = $('sc-articles');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading articles...</div>';
        try {
            const data = await fetch(`/api/admin/scaling/articles?key=${adminKey()}`).then(r => r.json());
            const articles = data.articles || [];
            const clusters = data.clusters || [];
            el.innerHTML = `
                ${clusters.length ? `<div class="admin-card">
                    <h3 style="margin-top:0">📊 Article Clusters</h3>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.5rem">
                        ${clusters.map(c => `<div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;padding:0.5rem">
                            <div style="font-weight:700;font-size:0.82rem">${esc(c.cluster)}</div>
                            <div style="font-size:0.68rem;color:var(--text-muted)">${c.articles} articles · ${c.winners} winners · ${c.total_clicks} clicks</div>
                        </div>`).join('')}
                    </div>
                </div>` : ''}
                <div class="admin-card">
                    <h3 style="margin-top:0">📝 Article Performance (${articles.length})</h3>
                    <div class="admin-table-wrapper">
                        <table class="admin-table" style="font-size:0.72rem">
                            <thead><tr><th>Article</th><th>Cluster</th><th>Clicks</th><th>CTR</th><th>Score</th><th>Verdict</th><th>Action</th></tr></thead>
                            <tbody>${articles.map(a => `<tr>
                                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(a.entity)}"><a href="/blog/${a.entity}" target="_blank" style="color:var(--primary)">${esc((a.entity || '').slice(0, 40))}</a></td>
                                <td style="font-size:0.65rem">${esc(a.cluster)}</td>
                                <td>${a.clicks}</td>
                                <td>${a.ctr || 0}%</td>
                                <td><strong>${a.base_score}</strong></td>
                                <td>${badge(a.verdict, a.verdict)}</td>
                                <td>${badge(a.action, a.action)}</td>
                            </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No article data</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
                ${(data.blog_recommendations || []).length ? `<div class="admin-card">
                    <h4 style="margin-top:0;font-size:0.85rem">💡 Blog Recommendations</h4>
                    ${data.blog_recommendations.map(r => `<div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;padding:0.4rem 0.6rem;margin-bottom:0.3rem;font-size:0.75rem">${esc(r.message)}</div>`).join('')}
                </div>` : ''}
            `;
        } catch (e) {
            el.innerHTML = `<div class="admin-card"><p style="color:var(--danger)">Error: ${esc(e.message)}</p></div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VARIANTS TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadVariants() {
        const el = $('sc-variants');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading variants...</div>';
        try {
            const data = await fetch(`/api/admin/scaling/variants?key=${adminKey()}`).then(r => r.json());
            const sections = [
                { title: '⚠️ Urgency Variants', items: data.variants?.urgency || [], type: 'urgency' },
                { title: '📍 Position Variants', items: data.variants?.position || [], type: 'position' },
                { title: '🏷️ Badge Variants', items: data.variants?.badge || [], type: 'badge' },
                { title: '🪝 X Hooks', items: data.x_posts?.hooks || [], type: 'x_hook' },
                { title: '📐 X Angles', items: data.x_posts?.angles || [], type: 'x_angle' },
                { title: '🔗 X CTAs', items: data.x_posts?.ctas || [], type: 'x_cta' },
            ];
            el.innerHTML = sections.map(s => `
                <div class="admin-card">
                    <h3 style="margin-top:0">${s.title} (${s.items.length})</h3>
                    <div class="admin-table-wrapper">
                        <table class="admin-table" style="font-size:0.72rem">
                            <thead><tr><th>Variant</th><th>Type</th><th>Clicks/Posts</th><th>Score</th><th>Confidence</th><th>Verdict</th><th>Weight</th></tr></thead>
                            <tbody>${s.items.map(v => `<tr>
                                <td>${esc(v.entity)}</td>
                                <td>${esc(v.type)}</td>
                                <td>${v.clicks || v.posts || 0}</td>
                                <td><strong>${v.score}</strong></td>
                                <td>${badge(v.confidence, v.confidence)}</td>
                                <td>${badge(v.verdict, v.verdict)}</td>
                                <td>${(v.weight || 1.0).toFixed(2)}x</td>
                            </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No data</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            el.innerHTML = `<div class="admin-card"><p style="color:var(--danger)">Error: ${esc(e.message)}</p></div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CAMPAIGNS TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadCampaigns() {
        const el = $('sc-campaigns');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading campaigns...</div>';
        try {
            const data = await fetch(`/api/admin/scaling/campaigns?key=${adminKey()}`).then(r => r.json());
            const campaigns = data.campaigns || [];
            el.innerHTML = `
                <div class="admin-card">
                    <h3 style="margin-top:0">📢 Campaign Scaling (${campaigns.length})</h3>
                    <div class="admin-table-wrapper">
                        <table class="admin-table" style="font-size:0.72rem">
                            <thead><tr><th>Campaign</th><th>Status</th><th>Clicks</th><th>Avg Organic</th><th>Score</th><th>Confidence</th><th>Verdict</th><th>Action</th></tr></thead>
                            <tbody>${campaigns.map(c => `<tr>
                                <td>${esc(c.entity)}</td>
                                <td>${badge(c.status, c.status)}</td>
                                <td>${c.clicks}</td>
                                <td>${c.avg_organic || 0}</td>
                                <td><strong>${c.score}</strong></td>
                                <td>${badge(c.confidence, c.confidence)}</td>
                                <td>${badge(c.verdict, c.verdict)}</td>
                                <td>${badge(c.action, c.action)}</td>
                            </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted)">No campaign data</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
                ${(data.campaign_recommendations || []).length ? `<div class="admin-card">
                    <h4 style="margin-top:0;font-size:0.85rem">💡 Campaign Recommendations</h4>
                    ${data.campaign_recommendations.map(r => `<div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;padding:0.4rem 0.6rem;margin-bottom:0.3rem;font-size:0.75rem">${esc(r.message)}</div>`).join('')}
                </div>` : ''}
            `;
        } catch (e) {
            el.innerHTML = `<div class="admin-card"><p style="color:var(--danger)">Error: ${esc(e.message)}</p></div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SOURCES TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadSources() {
        const el = $('sc-sources');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading sources...</div>';
        try {
            const data = await fetch(`/api/admin/scaling/sources?key=${adminKey()}`).then(r => r.json());
            const sources = data.source_rankings || [];
            const behavior = data.source_behavior || {};
            el.innerHTML = `
                <div class="admin-card">
                    <h3 style="margin-top:0">🌐 Traffic Source Rankings (${sources.length})</h3>
                    <div class="admin-table-wrapper">
                        <table class="admin-table" style="font-size:0.72rem">
                            <thead><tr><th>Source</th><th>Events</th><th>Affiliate Clicks</th><th>Compares</th><th>Affiliate %</th><th>Intent</th><th>Priority</th></tr></thead>
                            <tbody>${sources.map(s => `<tr>
                                <td><strong>${esc(s.source)}</strong></td>
                                <td>${s.total_events}</td>
                                <td>${s.affiliate_clicks}</td>
                                <td>${s.compare_actions}</td>
                                <td>${s.affiliate_ratio}%</td>
                                <td>${badge(s.intent, s.intent)}</td>
                                <td>${badge(s.priority, s.priority)}</td>
                            </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">No source data</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
                ${behavior.recommendations && behavior.recommendations.length ? `<div class="admin-card">
                    <h4 style="margin-top:0;font-size:0.85rem">💡 Source Optimization Recommendations</h4>
                    ${behavior.recommendations.map(r => `<div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;padding:0.4rem 0.6rem;margin-bottom:0.3rem;font-size:0.75rem">${esc(r)}</div>`).join('')}
                </div>` : ''}
            `;
        } catch (e) {
            el.innerHTML = `<div class="admin-card"><p style="color:var(--danger)">Error: ${esc(e.message)}</p></div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // RECOMMENDATIONS TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadRecommendations() {
        const el = $('sc-recs');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading recommendations...</div>';
        try {
            const data = await fetch(`/api/admin/scaling/overview?key=${adminKey()}`).then(r => r.json());
            const recs = data.recommendations || [];
            el.innerHTML = `
                <div class="admin-card">
                    <h3 style="margin-top:0">💡 System Recommendations (${recs.length})</h3>
                    ${recs.length === 0 ? '<p style="color:var(--text-muted);font-size:0.82rem">No recommendations yet. System needs more data to generate suggestions.</p>' : ''}
                    ${recs.map((r, i) => `
                        <div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:0.6rem 0.8rem;margin-bottom:0.5rem" id="rec-${i}">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem">
                                <div style="flex:1">
                                    <div style="font-size:0.82rem;font-weight:600;margin-bottom:0.2rem">${esc(r.message)}</div>
                                    <div style="font-size:0.68rem;color:var(--text-muted)">
                                        Type: ${badge(r.type, r.type)} · Action: ${badge(r.action, r.action)} · Priority: <strong>${r.priority}</strong>
                                        ${r.weight ? ` · Weight: ${r.weight.toFixed(2)}x` : ''}
                                    </div>
                                </div>
                                <div style="display:flex;gap:0.3rem;flex-shrink:0">
                                    <button class="btn btn-sm" style="font-size:0.65rem;padding:0.15rem 0.4rem;background:var(--success)20;color:var(--success);border-color:var(--success)40"
                                        onclick="window._scAcceptRec(${i})">✓ Accept</button>
                                    <button class="btn btn-sm" style="font-size:0.65rem;padding:0.15rem 0.4rem"
                                        onclick="document.getElementById('rec-${i}').style.opacity='0.3'">✕ Ignore</button>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } catch (e) {
            el.innerHTML = `<div class="admin-card"><p style="color:var(--danger)">Error: ${esc(e.message)}</p></div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // SETTINGS TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadSettings() {
        const el = $('sc-settings');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading settings...</div>';
        try {
            const data = await fetch(`/api/admin/scaling/overview?key=${adminKey()}`).then(r => r.json());
            const flags = data.flags || {};

            const flagDefs = [
                { key: 'FULL_AUTO_SCALING_ENABLED', label: 'Full Auto Scaling', desc: 'Master switch for all scaling automation' },
                { key: 'PRODUCT_SCALING_ENABLED', label: 'Product Scaling', desc: 'Scale product rank weights based on performance' },
                { key: 'BLOG_SCALING_ENABLED', label: 'Blog Scaling', desc: 'Auto-scale article visibility by performance' },
                { key: 'X_SCALING_ENABLED', label: 'X/Twitter Scaling', desc: 'Scale X posting hook/angle/CTA weights' },
                { key: 'CAMPAIGN_SCALING_ENABLED', label: 'Campaign Scaling', desc: 'Scale campaign exposure based on performance' },
                { key: 'SOURCE_OPTIMIZATION_ENABLED', label: 'Source Optimization', desc: 'Source-aware behavior recommendations' },
                { key: 'DECAY_ENGINE_ENABLED', label: 'Decay Engine', desc: 'Reduce stale winners over time (gentle, floor 0.9x)' },
                { key: 'SCALING_DRY_RUN', label: 'Dry Run Mode', desc: 'ON = recommendation only, OFF = apply weights' },
                { key: 'GROWTH_BRAIN_ENABLED', label: '🧠 Growth Brain', desc: 'Enable AI decision engine (evaluates recommendations)' },
                { key: 'BRAIN_AUTO_EXECUTE', label: '⚡ Brain Auto-Execute', desc: 'Let brain auto-apply high-confidence decisions' },
                { key: 'STRATEGY_ENGINE_ENABLED', label: '🎯 Strategy Engine', desc: 'Enable opportunity detection, forecasting, exploration' },
                { key: 'AUTONOMOUS_ENABLED', label: '🤖 Autonomous System', desc: 'Master switch for self-monitoring and auto-optimization' },
                { key: 'AUTO_ROLLBACK_ENABLED', label: '⏪ Auto Rollback', desc: 'Automatically revert harmful changes on degradation' },
                { key: 'GUARDRAILS_ENABLED', label: '🛡️ KPI Guardrails', desc: 'Enforce performance thresholds and block violations' },
                { key: 'META_OPTIMIZE_ENABLED', label: '🔧 Meta-Optimizer', desc: 'Auto-tune boost limits, cooldowns, action rates' },
                { key: 'RESOURCE_ALLOC_ENABLED', label: '📊 Resource Allocator', desc: 'Auto-balance blog vs social vs campaign focus' },
                { key: 'MEMORY_ENABLED', label: '💾 Long-Term Memory', desc: 'Remember successes/failures to avoid repeating mistakes' },
                { key: 'MONETIZATION_ENABLED', label: '💰 Monetization Layer', desc: 'Enable revenue estimation and value scoring' },
                { key: 'MONETIZATION_BRAIN_ENABLED', label: '🧠💰 Monetization Brain', desc: 'Revenue-weighted recommendations engine' },
                { key: 'REVENUE_WEIGHTED_BOOSTING_ENABLED', label: '📊 Revenue Boosting', desc: 'Weight boosts by revenue potential, not just clicks' },
                { key: 'SMART_ROUTING_ENABLED', label: '🔀 Smart Routing', desc: 'Dynamic destination selection for highest EPC' },
                { key: 'ROUTE_SIMULATION_ENABLED', label: '🎯 Route Simulation', desc: 'Simulate revenue outcomes per route' },
                { key: 'CAMPAIGN_ROUTE_ENABLED', label: '📢 Campaign Routing', desc: 'Allow routing to campaign links when profitable' },
                { key: 'COMPARE_ROUTE_ENABLED', label: '🔍 Compare Routing', desc: 'Route high-intent traffic to compare pages' },
                { key: 'SOURCE_AWARE_ROUTING_ENABLED', label: '🌐 Source-Aware Routing', desc: 'Adjust routing based on traffic source' },
                { key: 'AB_TESTING_ENABLED', label: '🧪 A/B Testing', desc: 'Enable routing experiments with auto-promotion' },
            ];

            el.innerHTML = `
                <div class="admin-card">
                    <h3 style="margin-top:0">🔧 Scaling Feature Flags</h3>
                    <p style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.75rem">Toggle scaling features. Changes take effect on next scaling computation (~1 hour or on boost cache refresh).</p>
                    ${flagDefs.map(f => `
                        <div class="setting-item" style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-primary);padding:0.75rem;border-radius:6px;border:1px solid var(--border);margin-bottom:0.4rem">
                            <div>
                                <strong style="font-size:0.82rem">${f.label}</strong>
                                <div style="font-size:0.68rem;color:var(--text-muted);margin-top:0.1rem">${f.desc}</div>
                                <code style="font-size:0.62rem;color:var(--primary)">${f.key}</code>
                            </div>
                            <label class="switch">
                                <input type="checkbox" ${flags[f.key] ? 'checked' : ''} onchange="window._scToggleFlag('${f.key}', this.checked)">
                                <span class="slider round"></span>
                            </label>
                        </div>
                    `).join('')}
                </div>

                <div class="admin-card">
                    <h3 style="margin-top:0">⚙️ Safety Thresholds</h3>
                    <p style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.75rem">These are configured via environment variables. Showing current values:</p>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0.5rem">
                        ${[
                            ['MAX_BOOST_MULTIPLIER', '1.2', 'Max base boost'],
                            ['MIN_BOOST_MULTIPLIER', '0.8', 'Min base boost'],
                            ['MAX_SCALING_WEIGHT', '1.3', 'Max scaling weight'],
                            ['MAX_COMBINED_WEIGHT', '1.5', 'Max after boost+scaling'],
                            ['DECAY_FLOOR', '0.9', 'Min decay weight'],
                            ['DECAY_RATE', '0.05', '5% per decay cycle'],
                        ].map(([key, val, desc]) => `
                            <div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;padding:0.5rem">
                                <div style="font-weight:600;font-size:0.78rem">${key}</div>
                                <div style="font-size:1.1rem;font-weight:800;color:var(--primary)">${val}</div>
                                <div style="font-size:0.65rem;color:var(--text-muted)">${desc}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="admin-card">
                    <h3 style="margin-top:0">🗄️ Decay Engine State</h3>
                    <div id="sc-decay-state" style="font-size:0.72rem;color:var(--text-muted)">
                        ${data.decay ? `
                            <p>Enabled: <strong style="color:${data.decay.enabled ? 'var(--success)' : 'var(--danger)'}">${data.decay.enabled ? 'YES' : 'NO'}</strong> · Tracked entities: ${data.decay.tracked_entities}</p>
                            <pre style="background:var(--bg-primary);border:1px solid var(--border);border-radius:4px;padding:0.5rem;max-height:200px;overflow:auto;font-size:0.65rem">${JSON.stringify(data.decay.settings, null, 2)}</pre>
                        ` : 'No decay data'}
                    </div>
                </div>
            `;
        } catch (e) {
            el.innerHTML = `<div class="admin-card"><p style="color:var(--danger)">Error: ${esc(e.message)}</p></div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ACTIONS (global, called from onclick)
    // ═══════════════════════════════════════════════════════════════════════════

    window._scBoost = async function (entity, type, weight) {
        if (!confirm(`Set ${type} boost for "${entity}" to ${weight}x?`)) return;
        try {
            const res = await fetch('/api/admin/scaling/boost', {
                method: 'POST', headers: hdr(),
                body: JSON.stringify({ entity, type, weight, action: weight > 1 ? 'boost' : 'reset' })
            });
            const d = await res.json();
            alert(d.ok ? 'Boost applied!' : 'Error: ' + (d.error || 'Unknown'));
            loadSubTab(_currentSubTab);
        } catch (e) { alert('Error: ' + e.message); }
    };

    window._scAcceptRec = async function (index) {
        if (!confirm('Accept this recommendation and apply it?')) return;
        try {
            const res = await fetch('/api/admin/scaling/override', {
                method: 'POST', headers: hdr(),
                body: JSON.stringify({ recommendation_index: index, action: 'accept' })
            });
            const d = await res.json();
            alert(d.ok ? 'Recommendation accepted!' : d.message || 'Logged for review');
            loadSubTab(_currentSubTab);
        } catch (e) { alert('Error: ' + e.message); }
    };

    window._scToggleFlag = async function (flag, value) {
        if (!confirm(`Set ${flag} to ${value ? 'ON' : 'OFF'}?`)) {
            loadSettings();
            return;
        }
        try {
            const res = await fetch('/api/admin/scaling/settings', {
                method: 'POST', headers: hdr(),
                body: JSON.stringify({ flag, value })
            });
            const d = await res.json();
            if (!d.ok) alert('Error: ' + (d.error || 'Unknown'));
        } catch (e) { alert('Error: ' + e.message); }
    };

    window._scRevert = async function (actionId) {
        if (!confirm(`Revert brain action #${actionId}?`)) return;
        try {
            const res = await fetch('/api/admin/brain/revert', {
                method: 'POST', headers: hdr(),
                body: JSON.stringify({ actionId })
            });
            const d = await res.json();
            alert(d.ok ? `Reverted action #${actionId}` : 'Error: ' + (d.error || 'Revert failed'));
            loadBrain();
        } catch (e) { alert('Error: ' + e.message); }
    };

    window._scAckAlert = async function (index) {
        try {
            await fetch('/api/admin/autonomous/acknowledge', {
                method: 'POST', headers: hdr(),
                body: JSON.stringify({ index })
            });
            loadMonitor();
        } catch (e) { alert('Error: ' + e.message); }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // BRAIN TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadBrain() {
        const el = $('sc-brain');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading brain status...</div>';
        try {
            const [status, history] = await Promise.all([
                fetch(`/api/admin/brain/status?key=${adminKey()}`).then(r => r.json()),
                fetch(`/api/admin/brain/history?key=${adminKey()}&limit=30`).then(r => r.json()),
            ]);

            const modeColor = status.mode === 'auto_execute' ? 'var(--success)' : status.mode === 'observe_only' ? 'var(--warning)' : 'var(--danger)';
            const pipe = status.pipeline || {};
            const lastEval = status.last_evaluation;
            const hist = (history.history || []);

            el.innerHTML = `
                <div class="admin-card" style="border-left:3px solid ${modeColor}">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
                        <h3 style="margin:0">🧠 Growth Brain</h3>
                        <div>
                            <span style="font-size:0.72rem;color:var(--text-muted)">Mode:</span>
                            <span style="font-weight:700;color:${modeColor};font-size:0.85rem">${status.mode?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN'}</span>
                        </div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.75rem;margin-bottom:1rem">
                    ${metricCard('Actions / Hour', `${pipe.actions_this_hour || 0}/${pipe.max_actions_per_hour || 10}`, '⚡')}
                    ${metricCard('Capacity Left', pipe.capacity_remaining ?? '—', '📊')}
                    ${metricCard('Total Actions', pipe.total_actions || 0, '🔢')}
                    ${metricCard('Active Overrides', Object.values(pipe.active_overrides || {}).reduce((a,b)=>a+b,0), '🎛️')}
                    ${metricCard('Cooldowns', pipe.cooldowns_active || 0, '⏳')}
                </div>

                ${lastEval ? `<div class="admin-card">
                    <h4 style="margin-top:0;font-size:0.85rem">📋 Last Evaluation — ${timeAgo(lastEval.timestamp)}</h4>
                    <div style="display:flex;gap:1rem;font-size:0.75rem;flex-wrap:wrap">
                        <span>✅ Executed: <strong>${lastEval.executed}</strong></span>
                        <span>⏸️ Deferred: <strong>${lastEval.deferred}</strong></span>
                        <span>⏭️ Skipped: <strong>${lastEval.skipped}</strong></span>
                        <span>📦 Total: <strong>${lastEval.total_recommendations}</strong></span>
                    </div>
                    ${(lastEval.decisions || []).length ? `
                        <div class="admin-table-wrapper" style="margin-top:0.5rem">
                            <table class="admin-table" style="font-size:0.68rem">
                                <thead><tr><th>Type</th><th>Target</th><th>Confidence</th><th>Outcome</th><th>Reason</th></tr></thead>
                                <tbody>${lastEval.decisions.slice(0, 15).map(d => `<tr>
                                    <td>${badge(d.type, d.type)}</td>
                                    <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.target)}</td>
                                    <td>${d.confidence ? badge(d.confidence, d.confidence) : '—'}</td>
                                    <td>${badge(d.outcome, d.outcome === 'executed' ? 'winner' : d.outcome === 'deferred' ? 'medium' : 'low')}</td>
                                    <td style="font-size:0.62rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.reason)}">${esc(d.reason)}</td>
                                </tr>`).join('')}</tbody>
                            </table>
                        </div>` : ''}
                </div>` : '<div class="admin-card"><p style="color:var(--text-muted);font-size:0.82rem">No evaluations yet. Brain will evaluate on next boost recalc.</p></div>'}

                <div class="admin-card">
                    <h4 style="margin-top:0;font-size:0.85rem">📜 Action History (${hist.length})</h4>
                    ${hist.length === 0 ? '<p style="color:var(--text-muted);font-size:0.82rem">No actions taken yet.</p>' : `
                        <div class="admin-table-wrapper">
                            <table class="admin-table" style="font-size:0.68rem">
                                <thead><tr><th>ID</th><th>Time</th><th>Type</th><th>Entity</th><th>Before</th><th>After</th><th>Confidence</th><th>Actions</th></tr></thead>
                                <tbody>${hist.map(a => `<tr style="${a.reverted ? 'opacity:0.4' : ''}">
                                    <td>#${a.id}</td>
                                    <td>${timeAgo(a.timestamp)}</td>
                                    <td>${badge(a.type, a.type)}</td>
                                    <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.entity)}</td>
                                    <td>${a.before != null ? a.before + 'x' : '—'}</td>
                                    <td>${a.after != null ? a.after + 'x' : '—'}</td>
                                    <td>${a.confidence ? badge(a.confidence, a.confidence) : '—'}</td>
                                    <td>${a.reverted ? '<span style="color:var(--text-muted);font-size:0.6rem">reverted</span>' : `<button class="btn btn-sm" style="font-size:0.6rem;padding:0.1rem 0.3rem" onclick="window._scRevert(${a.id})">↩ Revert</button>`}</td>
                                </tr>`).join('')}</tbody>
                            </table>
                        </div>`}
                </div>
            `;
        } catch (e) {
            el.innerHTML = `<div class="admin-card"><p style="color:var(--danger)">Error: ${esc(e.message)}</p></div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // STRATEGY TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadStrategy() {
        const el = $('sc-strategy');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading strategy...</div>';
        try {
            const data = await fetch(`/api/admin/strategy?key=${adminKey()}`).then(r => r.json());

            if (!data.enabled) {
                el.innerHTML = `<div class="admin-card"><p style="color:var(--warning);font-size:0.85rem">Strategy Engine is disabled. Enable <code>STRATEGY_ENGINE_ENABLED</code> in Settings to activate.</p></div>`;
                return;
            }

            const opps = data.opportunities || [];
            const gaps = data.content_gaps || [];
            const forecast = data.forecast || {};
            const explore = data.exploration || {};
            const recs = data.strategic_recommendations || [];

            el.innerHTML = `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.75rem;margin-bottom:1rem">
                    ${metricCard('Opportunities', opps.length, '🔍')}
                    ${metricCard('Content Gaps', gaps.length, '📝')}
                    ${metricCard('Projected 7d', forecast.summary?.projected_7d || 0, '📈')}
                    ${metricCard('Explore Budget', explore.budget || 0, '🧪')}
                    ${metricCard('Strategies', recs.length, '🎯')}
                </div>

                ${recs.length ? `<div class="admin-card">
                    <h3 style="margin-top:0">🎯 Strategic Recommendations</h3>
                    ${recs.map(r => `
                        <div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:8px;padding:0.6rem 0.8rem;margin-bottom:0.4rem">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:0.5rem">
                                <div style="flex:1">
                                    <div style="font-size:0.82rem;font-weight:600">${esc(r.title)}</div>
                                    <div style="font-size:0.68rem;color:var(--text-muted);margin-top:0.15rem">${esc(r.detail)}</div>
                                </div>
                                <div style="display:flex;gap:0.3rem;align-items:center">
                                    ${badge(r.type, r.type)}
                                    ${badge(r.confidence, r.confidence)}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>` : ''}

                ${opps.length ? `<div class="admin-card">
                    <h3 style="margin-top:0">🔍 Opportunities (${opps.length})</h3>
                    <div class="admin-table-wrapper">
                        <table class="admin-table" style="font-size:0.72rem">
                            <thead><tr><th>Type</th><th>Category</th><th>Signal</th><th>Score</th><th>Potential</th><th>Action</th></tr></thead>
                            <tbody>${opps.map(o => `<tr>
                                <td>${badge(o.type, o.type)}</td>
                                <td>${esc(o.category)}</td>
                                <td style="font-size:0.65rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(o.signal)}">${esc(o.signal)}</td>
                                <td><strong>${o.score}</strong></td>
                                <td>${badge(o.potential, o.potential)}</td>
                                <td style="font-size:0.65rem">${esc(o.action)}</td>
                            </tr>`).join('')}</tbody>
                        </table>
                    </div>
                </div>` : ''}

                ${gaps.length ? `<div class="admin-card">
                    <h3 style="margin-top:0">📝 Content Gaps (${gaps.length})</h3>
                    <div class="admin-table-wrapper">
                        <table class="admin-table" style="font-size:0.72rem">
                            <thead><tr><th>Product</th><th>Clicks</th><th>Coverage</th><th>Missing</th><th>Action</th></tr></thead>
                            <tbody>${gaps.map(g => `<tr>
                                <td>${esc(g.entity)}</td>
                                <td>${g.clicks}</td>
                                <td>${esc(g.coverage)}</td>
                                <td>${(g.missing_types || []).map(m => badge(m, 'review')).join(' ')}</td>
                                <td style="font-size:0.65rem">${esc(g.action)}</td>
                            </tr>`).join('')}</tbody>
                        </table>
                    </div>
                </div>` : ''}

                ${(forecast.products || []).length ? `<div class="admin-card">
                    <h3 style="margin-top:0">📈 Revenue Forecast (${forecast.summary?.lookback_days || 14}d → ${forecast.summary?.projection_days || 7}d)</h3>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.5rem">
                        Avg daily: <strong>${forecast.summary?.avg_daily_clicks || 0}</strong> clicks · Projected 7d: <strong>${forecast.summary?.projected_7d || 0}</strong> · Top grower: <strong>${esc(forecast.summary?.top_grower || 'none')}</strong>
                    </div>
                    <div class="admin-table-wrapper">
                        <table class="admin-table" style="font-size:0.72rem">
                            <thead><tr><th>Product</th><th>Current</th><th>Daily Rate</th><th>Projected 7d</th><th>Growth</th><th>Revenue</th></tr></thead>
                            <tbody>${forecast.products.map(p => `<tr>
                                <td>${esc(p.entity)}</td>
                                <td>${p.current_clicks}</td>
                                <td>${p.daily_rate}</td>
                                <td><strong>${p.projected_clicks_7d}</strong></td>
                                <td>${badge(p.growth_trend, p.growth_trend === 'growing' ? 'rising' : p.growth_trend === 'stable' ? 'stable' : 'low')}</td>
                                <td>${badge(p.revenue_potential, p.revenue_potential)}</td>
                            </tr>`).join('')}</tbody>
                        </table>
                    </div>
                </div>` : ''}

                ${explore.candidates?.length || explore.topic_suggestions?.length ? `<div class="admin-card">
                    <h3 style="margin-top:0">🧪 Exploration Mode</h3>
                    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:0.5rem">
                        Budget: <strong>${explore.budget}</strong> slots · Used: ${explore.used} · Remaining: <strong>${explore.remaining}</strong>
                    </div>
                    ${explore.candidates?.length ? `<h4 style="font-size:0.78rem">Unexplored Products</h4>
                    <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.5rem">${explore.candidates.map(c => 
                        `<span style="background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;padding:0.25rem 0.5rem;font-size:0.7rem">${esc(c.entity)} (${c.clicks} clicks)</span>`
                    ).join('')}</div>` : ''}
                    ${explore.topic_suggestions?.length ? `<h4 style="font-size:0.78rem">Topic Suggestions</h4>
                    <div style="display:flex;flex-wrap:wrap;gap:0.4rem">${explore.topic_suggestions.map(t => 
                        `<span style="background:#a78bfa15;border:1px solid #a78bfa30;border-radius:6px;padding:0.25rem 0.5rem;font-size:0.7rem;color:#a78bfa">${esc(t.topic)}</span>`
                    ).join('')}</div>` : ''}
                </div>` : ''}
            `;
        } catch (e) {
            el.innerHTML = `<div class="admin-card"><p style="color:var(--danger)">Error: ${esc(e.message)}</p></div>`;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MONITOR TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadMonitor() {
        const el = $('sc-monitor');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading autonomous status...</div>';
        try {
            const data = await fetch(`/api/admin/autonomous/status?key=${adminKey()}`).then(r => r.json());
            const mon = data.monitoring || {};
            const rb = data.rollback || {};
            const meta = data.meta_optimizer || {};
            const res = data.resources || {};

            const healthColor = mon.health === 'healthy' ? 'var(--success)' : mon.health === 'warning' ? 'var(--warning)' : 'var(--danger)';

            el.innerHTML = `
                <div class="admin-card" style="border-left:3px solid ${healthColor}">
                    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
                        <h3 style="margin:0">📡 Autonomous System</h3>
                        <div>
                            <span style="font-size:0.72rem;color:var(--text-muted)">Health:</span>
                            <span style="font-weight:700;color:${healthColor};font-size:0.85rem">${(mon.health || 'unknown').toUpperCase()}</span>
                            <span style="font-size:0.68rem;color:var(--text-muted);margin-left:0.5rem">Last: ${timeAgo(mon.last_check)}</span>
                        </div>
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.75rem;margin-bottom:1rem">
                    ${metricCard('Snapshots', mon.snapshots_recorded || 0, '📸')}
                    ${metricCard('Alerts', mon.alerts?.unacknowledged || 0, '🚨')}
                    ${metricCard('Rollbacks', rb.total_rollbacks || 0, '⏪')}
                    ${metricCard('Meta Adj.', meta.total_adjustments || 0, '🔧')}
                    ${metricCard('Degrading', (mon.degrading_metrics || []).length, '⚠️')}
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0.75rem">
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">📉 Trends</h4>
                        ${Object.keys(mon.trends || {}).length === 0 ? '<p style="color:var(--text-muted);font-size:0.75rem">Collecting data...</p>' :
                        Object.entries(mon.trends || {}).map(([metric, trend]) =>
                            '<div style="display:flex;justify-content:space-between;padding:0.2rem 0;font-size:0.75rem"><span>' + metric.replace(/_/g, ' ') + '</span>' + badge(trend, trend === 'improving' ? 'rising' : trend === 'degrading' ? 'falling' : 'stable') + '</div>'
                        ).join('')}
                    </div>
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">📊 Resources</h4>
                        ${Object.entries((res.current || {}).weights || {}).map(([ch, w]) =>
                            '<div style="display:flex;justify-content:space-between;padding:0.2rem 0;font-size:0.75rem"><span>' + ch + '</span><strong>' + (w * 100).toFixed(0) + '%</strong></div>'
                        ).join('') || '<p style="color:var(--text-muted);font-size:0.75rem">Not computed</p>'}
                    </div>
                </div>

                ${meta.recent?.length ? '<div class="admin-card"><h4 style="margin-top:0;font-size:0.85rem">🔧 Meta-Optimizations</h4>' +
                    meta.recent.slice(0, 5).map(m =>
                        '<div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;padding:0.4rem 0.6rem;margin-bottom:0.3rem;font-size:0.7rem"><span style="color:var(--text-muted)">' + timeAgo(m.timestamp) + '</span>' + (m.adjustments || []).map(a => ' • ' + a.param + ': ' + a.from + ' → ' + a.to).join('') + '</div>'
                    ).join('') + '</div>' : ''}

                ${(mon.alerts?.recent || []).length ? '<div class="admin-card"><h4 style="margin-top:0;font-size:0.85rem">🚨 Alerts (' + (mon.alerts.unacknowledged || 0) + ' unread)</h4>' +
                    mon.alerts.recent.map((a, i) =>
                        '<div style="background:var(--bg-primary);border:1px solid ' + (a.severity === 'critical' ? 'var(--danger)' : 'var(--warning)') + '40;border-radius:6px;padding:0.4rem 0.6rem;margin-bottom:0.3rem;font-size:0.72rem;opacity:' + (a.acknowledged ? '0.4' : '1') + '"><div style="display:flex;justify-content:space-between;align-items:center">' + badge(a.severity, a.severity === 'critical' ? 'loser' : 'medium') + ' ' + esc(a.message) + (!a.acknowledged ? ' <button class="btn btn-sm" style="font-size:0.6rem;padding:0.1rem 0.3rem" onclick="window._scAckAlert(' + i + ')">Ack</button>' : '') + '</div><div style="font-size:0.62rem;color:var(--text-muted)">' + timeAgo(a.timestamp) + ' • ' + a.type + '</div></div>'
                    ).join('') + '</div>' : ''}
            `;
        } catch (e) {
            el.innerHTML = '<div class="admin-card"><p style="color:var(--danger)">Error: ' + esc(e.message) + '</p></div>';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // GUARDRAILS TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadGuardrails() {
        const el = $('sc-guard');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading guardrails...</div>';
        try {
            const data = await fetch(`/api/admin/autonomous/guardrails?key=${adminKey()}`).then(r => r.json());

            let thresholdCards = '';
            Object.entries(data.thresholds || {}).forEach(([k, v]) => {
                thresholdCards += '<div style="background:var(--bg-primary);border:1px solid var(--border);border-radius:6px;padding:0.5rem"><div style="font-size:0.72rem;color:var(--text-muted)">' + k.replace(/_/g, ' ') + '</div><div style="font-size:1.1rem;font-weight:800;color:var(--primary)">' + (typeof v === 'number' && v < 1 ? (v * 100) + '%' : v) + '</div></div>';
            });

            let violationRows = '';
            (data.recent_violations || []).forEach(v => {
                violationRows += '<tr><td>' + timeAgo(v.timestamp) + '</td><td>' + badge(v.type, v.type) + '</td><td>' + badge(v.severity, v.severity === 'critical' ? 'loser' : 'medium') + '</td><td style="font-size:0.62rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(v.message) + '</td><td>' + (typeof v.value === 'number' ? v.value.toFixed(2) : v.value) + '</td><td>' + v.threshold + '</td></tr>';
            });

            el.innerHTML = `
                <div class="admin-card">
                    <h3 style="margin-top:0">🛡️ KPI Guardrails</h3>
                    <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem">
                        ${data.enabled ? badge('ENABLED', 'active') : badge('DISABLED', 'low')}
                        · ${data.active_violations || 0} active · ${data.total_violations || 0} total
                    </div>
                </div>

                <div class="admin-card">
                    <h4 style="margin-top:0;font-size:0.85rem">📏 Thresholds</h4>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:0.5rem">
                        ${thresholdCards}
                    </div>
                </div>

                ${violationRows ? '<div class="admin-card"><h4 style="margin-top:0;font-size:0.85rem">⚠️ Violations (' + (data.recent_violations || []).length + ')</h4><div class="admin-table-wrapper"><table class="admin-table" style="font-size:0.68rem"><thead><tr><th>Time</th><th>Type</th><th>Severity</th><th>Message</th><th>Value</th><th>Threshold</th></tr></thead><tbody>' + violationRows + '</tbody></table></div></div>' : '<div class="admin-card"><p style="color:var(--success);font-size:0.82rem">✅ All guardrails passing.</p></div>'}
            `;
        } catch (e) {
            el.innerHTML = '<div class="admin-card"><p style="color:var(--danger)">Error: ' + esc(e.message) + '</p></div>';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MEMORY TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadMemory() {
        const el = $('sc-memory');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading memory...</div>';
        try {
            const data = await fetch(`/api/admin/autonomous/memory?key=${adminKey()}`).then(r => r.json());

            let successChips = (data.summary?.success_entities || []).map(e => '<span style="background:#22c55e15;border:1px solid #22c55e30;border-radius:6px;padding:0.25rem 0.5rem;font-size:0.7rem;color:#22c55e">' + esc(e) + '</span>').join('');
            let failChips = (data.summary?.failure_entities || []).map(e => '<span style="background:#ef444415;border:1px solid #ef444430;border-radius:6px;padding:0.25rem 0.5rem;font-size:0.7rem;color:#ef4444">' + esc(e) + '</span>').join('');

            let memRows = '';
            (data.entries || []).slice(0, 25).forEach(m => {
                memRows += '<tr><td>#' + m.id + '</td><td>' + timeAgo(m.timestamp) + '</td><td>' + badge(m.type, m.type) + '</td><td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(m.entity) + '</td><td>' + badge(m.outcome, m.outcome === 'success' ? 'winner' : m.outcome === 'failure' ? 'loser' : 'stable') + '</td><td>' + m.score + '</td><td style="font-size:0.6rem">' + timeAgo(m.expiresAt) + '</td></tr>';
            });

            el.innerHTML = `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.75rem;margin-bottom:1rem">
                    ${metricCard('Active', data.active_entries || 0, '🧠')}
                    ${metricCard('Successes', data.successes || 0, '✅')}
                    ${metricCard('Failures', data.failures || 0, '❌')}
                    ${metricCard('Total', data.total_entries || 0, '💾')}
                </div>

                ${successChips ? '<div class="admin-card"><h4 style="margin-top:0;font-size:0.85rem">✅ Successes</h4><div style="display:flex;flex-wrap:wrap;gap:0.4rem">' + successChips + '</div></div>' : ''}

                ${failChips ? '<div class="admin-card"><h4 style="margin-top:0;font-size:0.85rem">❌ Failures (penalized)</h4><div style="display:flex;flex-wrap:wrap;gap:0.4rem">' + failChips + '</div></div>' : ''}

                ${memRows ? '<div class="admin-card"><h4 style="margin-top:0;font-size:0.85rem">📜 Memory Log (' + (data.entries || []).length + ')</h4><div class="admin-table-wrapper"><table class="admin-table" style="font-size:0.68rem"><thead><tr><th>ID</th><th>Time</th><th>Type</th><th>Entity</th><th>Outcome</th><th>Score</th><th>Expires</th></tr></thead><tbody>' + memRows + '</tbody></table></div></div>' : '<div class="admin-card"><p style="color:var(--text-muted);font-size:0.82rem">No memories stored yet.</p></div>'}
            `;
        } catch (e) {
            el.innerHTML = '<div class="admin-card"><p style="color:var(--danger)">Error: ' + esc(e.message) + '</p></div>';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // MONETIZATION TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadMonetization() {
        const el = $('sc-money');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading monetization data...</div>';
        try {
            const [overview, recs] = await Promise.all([
                fetch(`/api/admin/monetization/overview?key=${adminKey()}`).then(r => r.json()),
                fetch(`/api/admin/monetization/recommendations?key=${adminKey()}`).then(r => r.json()),
            ]);

            const s = overview.summary || {};
            const metricCard = (label, value, icon) => `<div class="admin-card" style="text-align:center;padding:0.75rem"><div style="font-size:1.4rem">${icon}</div><div style="font-size:1.2rem;font-weight:700;color:var(--text-primary)">${value}</div><div style="font-size:0.68rem;color:var(--text-muted)">${label}</div></div>`;

            const prodRows = (overview.top_revenue_products || []).slice(0, 10).map(p => `<tr style="font-size:0.72rem"><td>${esc(p.product_name)}</td><td>$${(p.price||0).toFixed(0)}</td><td>${p.clicks}</td><td>$${(p.epc||0).toFixed(4)}</td><td>$${(p.estimated_revenue||0).toFixed(2)}</td><td>${p.value_score}</td><td>${badge(p.verdict)}</td><td>${p.is_click_trap ? '⚠️' : p.is_hidden_gem ? '💎' : ''}${badge(p.confidence)}</td></tr>`).join('');

            const recCards = (recs.recommendations || []).slice(0, 8).map(r => `<div class="admin-card" style="padding:0.6rem;border-left:3px solid ${r.priority === 'high' ? 'var(--success)' : r.priority === 'medium' ? 'var(--warning)' : 'var(--text-muted)'}">
                <div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:0.78rem">${esc(r.entity)}</strong>${badge(r.priority)}</div>
                <div style="font-size:0.72rem;color:var(--text-muted);margin-top:0.2rem">${esc(r.action)}</div>
                <div style="font-size:0.65rem;color:var(--text-muted);margin-top:0.1rem">💡 ${esc(r.reason)}</div>
            </div>`).join('');

            const srcCards = (overview.top_revenue_sources || []).slice(0, 6).map(s => `<div class="admin-card" style="text-align:center;padding:0.6rem"><div style="font-weight:600;font-size:0.82rem">${esc(s.source)}</div><div style="font-size:0.7rem;color:var(--text-muted)">${s.clicks} clicks · EPC $${(s.epc||0).toFixed(4)}</div><div style="font-size:0.65rem">${badge(s.value_tier)}</div></div>`).join('');

            const insightCards = (recs.insights || []).map(i => `<div style="font-size:0.72rem;padding:0.3rem 0;border-bottom:1px solid var(--border)">${i.type === 'error' ? '❌' : '💡'} ${esc(i.message)}</div>`).join('');

            // Revenue chart
            const topRevProducts = (overview.top_revenue_products || []).slice(0, 8);
            const revChart = topRevProducts.length ? miniBar(topRevProducts.map(p => p.estimated_revenue || 0), { color: '#10b981', label: 'Est. Revenue' }) : '';
            const epcChart = (overview.top_revenue_sources || []).length ? hBar((overview.top_revenue_sources || []).slice(0, 5).map(s => ({ label: s.source, value: Math.round((s.epc || 0) * 10000) / 100, unit: '¢' }))) : '';

            el.innerHTML = `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.5rem;margin-bottom:0.75rem">
                    ${metricCard('Est. Revenue', '$' + (s.total_estimated_revenue||0).toFixed(2), '💰')}
                    ${metricCard('Avg EPC', '$' + (s.avg_epc||0).toFixed(4), '📊')}
                    ${metricCard('Products', s.products_tracked||0, '📦')}
                    ${metricCard('Click Traps', s.click_traps||0, '⚠️')}
                    ${metricCard('Hidden Gems', s.hidden_gems||0, '💎')}
                    ${metricCard('Recommendations', recs.total_recommendations||0, '💡')}
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;margin-bottom:0.75rem">
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">📊 Revenue Distribution</h4>
                        ${revChart || '<p style="color:var(--text-muted);font-size:0.72rem">No data</p>'}
                    </div>
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">💹 Source EPC</h4>
                        ${epcChart || '<p style="color:var(--text-muted);font-size:0.72rem">No data</p>'}
                    </div>
                </div>

                <div class="admin-card">
                    <h4 style="margin-top:0;font-size:0.85rem">💰 Top Revenue Products</h4>
                    ${prodRows ? '<div class="admin-table-wrapper"><table class="admin-table" style="font-size:0.72rem"><thead><tr><th>Product</th><th>Price</th><th>Clicks</th><th>EPC</th><th>Est. Rev</th><th>Value</th><th>Verdict</th><th>Notes</th></tr></thead><tbody>' + prodRows + '</tbody></table></div>' : '<p style="color:var(--text-muted);font-size:0.78rem">No product data yet.</p>'}
                </div>

                ${recCards ? '<div class="admin-card"><h4 style="margin-top:0;font-size:0.85rem">💡 Monetization Recommendations</h4><div style="display:grid;gap:0.4rem">' + recCards + '</div></div>' : ''}

                <div class="admin-card">
                    <h4 style="margin-top:0;font-size:0.85rem">🌐 Source Revenue Quality</h4>
                    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:0.4rem">${srcCards || '<p style="color:var(--text-muted);font-size:0.78rem">No source data.</p>'}</div>
                </div>

                ${insightCards ? '<div class="admin-card"><h4 style="margin-top:0;font-size:0.85rem">🧠 Insights</h4>' + insightCards + '</div>' : ''}
            `;
        } catch (e) {
            el.innerHTML = '<div class="admin-card"><p style="color:var(--danger)">Error: ' + esc(e.message) + '</p></div>';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ROUTES TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadRoutes() {
        const el = $('sc-routes');
        if (!el) return;
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading routing data...</div>';
        try {
            const [overview, recs, sources, decisions] = await Promise.all([
                fetch(`/api/admin/routing/overview?key=${adminKey()}`).then(r => r.json()),
                fetch(`/api/admin/routing/recommendations?key=${adminKey()}`).then(r => r.json()),
                fetch(`/api/admin/routing/sources?key=${adminKey()}`).then(r => r.json()),
                fetch(`/api/admin/routing/decisions?key=${adminKey()}`).then(r => r.json()),
            ]);

            const enabled = overview.enabled;
            const metricCard = (label, value, icon) => `<div class="admin-card" style="text-align:center;padding:0.75rem"><div style="font-size:1.4rem">${icon}</div><div style="font-size:1.2rem;font-weight:700;color:var(--text-primary)">${value}</div><div style="font-size:0.68rem;color:var(--text-muted)">${label}</div></div>`;

            const recRows = (recs.recommendations || []).slice(0, 15).map(r => `<tr style="font-size:0.72rem"><td>${esc(r.product_name)}</td><td>${badge(r.current_route)}</td><td>${badge(r.recommended_route)}</td><td>$${(r.current_epc||0).toFixed(4)}</td><td>$${(r.recommended_epc||0).toFixed(4)}</td><td style="color:var(--success);font-weight:600">+${(r.uplift_pct||0).toFixed(1)}%</td><td>${badge(r.confidence)}</td></tr>`).join('');

            const srcRows = (sources.source_analysis || []).map(sa => {
                const sim = sa.simulation || {};
                return `<tr style="font-size:0.72rem"><td>${esc(sa.source)}</td><td>${sim.best_route || '—'}</td><td>$${(sim.best_epc||0).toFixed(4)}</td><td>$${(sim.default_epc||0).toFixed(4)}</td><td style="color:var(--success)">+${(sim.potential_uplift||0).toFixed(1)}%</td><td>${(sa.preferences?.prefer || []).map(p => badge(p)).join(' ')}</td></tr>`;
            }).join('');

            const decRows = (decisions.decisions || []).slice(0, 10).map(d => `<tr style="font-size:0.68rem"><td>${timeAgo(d.timestamp)}</td><td>${esc(d.product_name || '—')}</td><td>${badge(d.route_chosen || d.type)}</td><td>${badge(d.confidence || '—')}</td><td style="font-size:0.65rem">${esc(d.reason || '—')}</td></tr>`).join('');

            const stats = decisions.stats || {};
            const policyState = overview.policy?.state || {};

            // Route distribution donut + uplift chart
            const routeTypes = {};
            (decisions.decisions || []).forEach(d => { const rt = d.route_chosen || d.type || 'unknown'; routeTypes[rt] = (routeTypes[rt] || 0) + 1; });
            const routeDonut = Object.keys(routeTypes).length ? donut(Object.entries(routeTypes).map(([k, v]) => ({ label: k, value: v })), { size: 80 }) : '';
            const upliftChart = (recs.recommendations || []).slice(0, 6).length ? hBar((recs.recommendations || []).slice(0, 6).map(r => ({ label: (r.product_name || '').slice(0, 12), value: Math.round(r.uplift_pct || 0), unit: '%' }))) : '';

            el.innerHTML = `
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:0.5rem;margin-bottom:0.75rem">
                    ${metricCard('Routing', enabled ? 'ENABLED' : 'DISABLED', '🔀')}
                    ${metricCard('Total Decisions', stats.total_decisions || 0, '📝')}
                    ${metricCard('Routes/Hour', policyState.routes_this_hour || 0, '⏱️')}
                    ${metricCard('Traffic Routed', (policyState.traffic_pct || 0) + '%', '📊')}
                    ${metricCard('Recs Available', recs.total || 0, '💡')}
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:0.75rem;margin-bottom:0.75rem">
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">🔀 Route Distribution</h4>
                        <div style="display:flex;align-items:center;gap:1rem">
                            ${routeDonut}
                            <div style="font-size:0.65rem;color:var(--text-muted)">${Object.entries(routeTypes).slice(0, 5).map(([k, v]) => `<div>${esc(k)}: ${v}</div>`).join('')}</div>
                        </div>
                    </div>
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">📈 Potential Uplift</h4>
                        ${upliftChart || '<p style="color:var(--text-muted);font-size:0.72rem">No uplift data</p>'}
                    </div>
                </div>

                <div class="admin-card">
                    <h4 style="margin-top:0;font-size:0.85rem">🔀 Routing Recommendations</h4>
                    <p style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.5rem">Products where a different route could improve revenue</p>
                    ${recRows ? '<div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>Product</th><th>Current</th><th>Recommended</th><th>Current EPC</th><th>Best EPC</th><th>Uplift</th><th>Confidence</th></tr></thead><tbody>' + recRows + '</tbody></table></div>' : '<p style="color:var(--text-muted);font-size:0.78rem">No routing improvements found.</p>'}
                </div>

                <div class="admin-card">
                    <h4 style="margin-top:0;font-size:0.85rem">🌐 Source Routing Analysis</h4>
                    <p style="font-size:0.68rem;color:var(--text-muted);margin-bottom:0.5rem">Best destination by traffic source (simulated $250 product)</p>
                    ${srcRows ? '<div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>Source</th><th>Best Route</th><th>Best EPC</th><th>Default EPC</th><th>Uplift</th><th>Preferences</th></tr></thead><tbody>' + srcRows + '</tbody></table></div>' : '<p style="color:var(--text-muted)">No source data.</p>'}
                </div>

                ${decRows ? '<div class="admin-card"><h4 style="margin-top:0;font-size:0.85rem">📝 Recent Routing Decisions</h4><div class="admin-table-wrapper"><table class="admin-table"><thead><tr><th>Time</th><th>Product</th><th>Route</th><th>Confidence</th><th>Reason</th></tr></thead><tbody>' + decRows + '</tbody></table></div></div>' : '<div class="admin-card"><p style="color:var(--text-muted);font-size:0.78rem">No routing decisions yet. Enable Smart Routing to start.</p></div>'}
            `;
        } catch (e) {
            el.innerHTML = '<div class="admin-card"><p style="color:var(--danger)">Error: ' + esc(e.message) + '</p></div>';
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // A/B TESTING TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadABTest() {
        const el = document.getElementById('sc-ab');
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Loading A/B tests...</div>';
        try {
            const res = await fetch(`/api/admin/ab/experiments?key=${adminKey}`);
            const data = await res.json();
            const exps = data.experiments || [];
            const status = data.status || {};

            let cardsHtml = '';
            for (const exp of exps) {
                // Fetch analysis for each
                let analysis = null;
                try {
                    const aRes = await fetch(`/api/admin/ab/experiments/${exp.id}/analyze?key=${adminKey}`);
                    analysis = await aRes.json();
                } catch {}

                const statusBadge = exp.status === 'active' ? '<span style="color:var(--success)">● Active</span>'
                    : exp.status === 'completed' ? '<span style="color:var(--info)">✓ Completed</span>'
                    : '<span style="color:var(--text-muted)">⏸ Paused</span>';

                let variantsHtml = '';
                if (analysis && analysis.variants) {
                    variantsHtml = '<table class="admin-table" style="font-size:0.75rem;margin-top:0.5rem"><thead><tr><th>Variant</th><th>Impressions</th><th>Successes</th><th>Rate</th></tr></thead><tbody>';
                    analysis.variants.forEach(v => {
                        const isWinner = analysis.winner === v.id;
                        variantsHtml += `<tr style="${isWinner ? 'background:rgba(0,200,100,0.08)' : ''}">`;
                        variantsHtml += `<td>${esc(v.name)} ${isWinner ? '🏆' : ''}</td>`;
                        variantsHtml += `<td>${v.impressions}</td>`;
                        variantsHtml += `<td>${v.successes}</td>`;
                        variantsHtml += `<td><b>${v.rate}%</b></td>`;
                        variantsHtml += '</tr>';
                    });
                    variantsHtml += '</tbody></table>';
                }

                let sigHtml = '';
                if (analysis) {
                    const sigColor = analysis.significance >= 95 ? 'var(--success)' : analysis.significance >= 90 ? 'var(--warning)' : 'var(--text-muted)';
                    sigHtml = `<div style="margin-top:0.5rem;font-size:0.78rem">`;
                    sigHtml += `<span>Significance: <b style="color:${sigColor}">${analysis.significance}%</b></span>`;
                    sigHtml += analysis.winner ? ` &nbsp;|&nbsp; Winner: <b style="color:var(--success)">${esc(analysis.winner_name)}</b> (+${analysis.lift_pct}%)` : '';
                    sigHtml += ` &nbsp;|&nbsp; Data: ${analysis.has_enough_data ? '✅ Enough' : '⏳ Collecting'}`;
                    sigHtml += `</div>`;
                }

                let actionsHtml = '<div style="margin-top:0.5rem;display:flex;gap:0.5rem">';
                if (exp.status === 'paused') {
                    actionsHtml += `<button class="btn btn-primary" style="font-size:0.7rem;padding:0.2rem 0.5rem" onclick="abAction('${exp.id}','activate')">▶ Activate</button>`;
                } else if (exp.status === 'active') {
                    actionsHtml += `<button class="btn btn-secondary" style="font-size:0.7rem;padding:0.2rem 0.5rem" onclick="abAction('${exp.id}','pause')">⏸ Pause</button>`;
                }
                actionsHtml += `<button class="btn btn-tertiary" style="font-size:0.7rem;padding:0.2rem 0.5rem" onclick="abAction('${exp.id}','reset')">🔄 Reset</button>`;
                actionsHtml += '</div>';

                cardsHtml += `
                    <div class="admin-card" style="margin-bottom:1rem">
                        <div style="display:flex;justify-content:space-between;align-items:center">
                            <h4 style="margin:0;font-size:0.85rem">🧪 ${esc(exp.name)}</h4>
                            ${statusBadge}
                        </div>
                        <p style="font-size:0.75rem;color:var(--text-muted);margin:0.3rem 0">Metric: ${esc(exp.metric)} | Variants: ${exp.variants} | Auto-promote: ${exp.auto_promote ? '✅' : '❌'}</p>
                        ${variantsHtml}
                        ${sigHtml}
                        ${actionsHtml}
                    </div>
                `;
            }

            el.innerHTML = `
                <div class="admin-card" style="margin-bottom:1rem">
                    <h4 style="margin-top:0;font-size:0.85rem">🧪 A/B Testing Overview</h4>
                    <div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:0.78rem">
                        <div>Status: <b>${status.enabled ? '✅ Enabled' : '❌ Disabled'}</b></div>
                        <div>Experiments: <b>${status.total || 0}</b></div>
                        <div>Active: <b style="color:var(--success)">${status.active || 0}</b></div>
                        <div>Completed: <b>${status.completed || 0}</b></div>
                    </div>
                </div>
                ${cardsHtml || '<div class="admin-card"><p style="color:var(--text-muted);font-size:0.78rem">No experiments defined.</p></div>'}
            `;
        } catch (e) {
            el.innerHTML = '<div class="admin-card"><p style="color:var(--danger)">Error: ' + esc(e.message) + '</p></div>';
        }
    }

    // A/B Test action helper
    window.abAction = async function(expId, action) {
        try {
            if (action === 'activate' || action === 'pause') {
                await fetch(`/api/admin/ab/experiments/${expId}/status?key=${adminKey}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: action === 'activate' ? 'active' : 'paused' }),
                });
            } else if (action === 'reset') {
                await fetch(`/api/admin/ab/experiments/${expId}/reset?key=${adminKey}`, { method: 'POST' });
            }
            loadABTest();
        } catch (e) { alert('Error: ' + e.message); }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // PREDICTION TAB
    // ═══════════════════════════════════════════════════════════════════════════

    async function loadPredict() {
        const el = document.getElementById('sc-predict');
        el.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted)">Running predictions...</div>';
        try {
            const res = await fetch(`/api/admin/predict/full?key=${adminKey}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            const plan = data.plan || {};
            const risks = data.risks || { risks: [], summary: {} };
            const allocation = data.allocation || { channels: [] };
            const investment = data.investment || { investments: [], summary: {} };
            const predictions = data.predictions || { summary: {} };
            const summary = predictions.summary || {};

            // Trend color
            const trendColor = summary.overall_trend === 'growing' ? 'var(--success)'
                : summary.overall_trend === 'declining' ? 'var(--danger)' : 'var(--text-muted)';

            // Risk cards
            let riskHtml = '';
            if (risks.risks.length > 0) {
                riskHtml = '<div class="admin-card" style="margin-bottom:1rem"><h4 style="margin-top:0;font-size:0.85rem">⚠️ Risk Alerts</h4>';
                risks.risks.slice(0, 5).forEach(r => {
                    const sevColor = r.severity === 'critical' ? 'var(--danger)' : 'var(--warning)';
                    riskHtml += `<div style="padding:0.3rem 0;font-size:0.75rem;border-bottom:1px solid var(--border)">`;
                    riskHtml += `<span style="color:${sevColor};font-weight:bold">${r.severity.toUpperCase()}</span> `;
                    riskHtml += `${esc(r.message)} → <b>${esc(r.action)}</b></div>`;
                });
                riskHtml += '</div>';
            }

            // Channel allocation table
            let chHtml = '<table class="admin-table" style="font-size:0.75rem"><thead><tr><th>Channel</th><th>Efficiency</th><th>Allocation</th><th>EPC</th><th>ROI</th></tr></thead><tbody>';
            allocation.channels.forEach(ch => {
                chHtml += `<tr><td>${esc(ch.channel)}</td><td>${ch.efficiency_score}/100</td><td><b>${ch.allocation_pct}%</b></td><td>$${ch.epc}</td><td>${ch.roi}%</td></tr>`;
            });
            chHtml += '</tbody></table>';

            // Product investment table (top 10)
            let invHtml = '<table class="admin-table" style="font-size:0.75rem"><thead><tr><th>Product</th><th>Tier</th><th>Score</th><th>Boost</th><th>Content</th></tr></thead><tbody>';
            investment.investments.slice(0, 10).forEach(inv => {
                const tierColor = inv.tier === 'star' ? 'var(--success)' : inv.tier === 'growth' ? 'var(--info)' : inv.tier === 'monitor' ? 'var(--danger)' : 'var(--text-muted)';
                invHtml += `<tr><td>${esc(inv.name)}</td><td style="color:${tierColor}"><b>${inv.tier}</b></td><td>${inv.investment_score}</td><td>${inv.boost_level}</td><td>${inv.content_action}</td></tr>`;
            });
            invHtml += '</tbody></table>';

            // Weekly plan actions
            let planHtml = '';
            if (plan.priority_actions && plan.priority_actions.length > 0) {
                planHtml = '<div class="admin-card" style="margin-bottom:1rem"><h4 style="margin-top:0;font-size:0.85rem">📋 Weekly Plan — Priority Actions</h4>';
                plan.priority_actions.slice(0, 8).forEach(a => {
                    const pColor = a.priority === 'P0' ? 'var(--danger)' : a.priority === 'P1' ? 'var(--warning)' : 'var(--info)';
                    planHtml += `<div style="padding:0.3rem 0;font-size:0.75rem;border-bottom:1px solid var(--border)">`;
                    planHtml += `<span style="color:${pColor};font-weight:bold">${a.priority}</span> `;
                    planHtml += `<b>${esc(a.action)}</b> → ${esc(a.target)} — <i>${esc(a.reason)}</i></div>`;
                });
                planHtml += '</div>';
            }

            // Top product forecasts with sparklines
            const topPredProducts = (predictions.products || []).slice(0, 8);
            let forecastHtml = '';
            if (topPredProducts.length) {
                forecastHtml = '<table class="admin-table" style="font-size:0.72rem"><thead><tr><th>Product</th><th>Current</th><th>Predicted</th><th>Change</th><th>Forecast</th><th>Trend</th></tr></thead><tbody>';
                topPredProducts.forEach(p => {
                    const changeColor = p.change_pct > 0 ? 'var(--success)' : p.change_pct < 0 ? 'var(--danger)' : 'var(--text-muted)';
                    const trendIcon = p.trend === 'rising' ? '↗' : p.trend === 'declining' ? '↘' : '→';
                    forecastHtml += `<tr><td>${esc((p.name || '').slice(0, 30))}</td><td>$${p.current_weekly}</td><td><b>$${p.predicted_weekly}</b></td>`;
                    forecastHtml += `<td style="color:${changeColor};font-weight:600">${p.change_pct > 0 ? '+' : ''}${p.change_pct}%</td>`;
                    forecastHtml += `<td>${sparkline(p.daily_forecast || [], { width: 80, height: 20, color: changeColor })}</td>`;
                    forecastHtml += `<td>${trendIcon}</td></tr>`;
                });
                forecastHtml += '</tbody></table>';
            }

            // Channel allocation donut + hBar
            const chDonut = allocation.channels.length ? donut(allocation.channels.map(c => ({ label: c.channel, value: c.allocation_pct || 1 })), { size: 90 }) : '';
            const chBar = allocation.channels.length ? hBar(allocation.channels.map(c => ({ label: c.channel, value: c.allocation_pct, unit: '%' }))) : '';

            // Investment scores bar chart
            const invScores = investment.investments.slice(0, 10).map(i => i.investment_score || 0);
            const invBar = invScores.length ? miniBar(invScores, { color: '#10b981', width: 250, height: 50, label: 'Investment Scores' }) : '';

            el.innerHTML = `
                <div class="admin-card" style="margin-bottom:1rem">
                    <h4 style="margin-top:0;font-size:0.85rem">📈 Revenue Prediction</h4>
                    <div style="display:flex;gap:1.5rem;flex-wrap:wrap;font-size:0.78rem;margin-bottom:0.75rem">
                        <div>Current Weekly: <b>$${summary.current_weekly_total || 0}</b></div>
                        <div>Predicted Weekly: <b>$${summary.predicted_weekly_total || 0}</b></div>
                        <div>Trend: <b style="color:${trendColor}">${summary.overall_trend || 'N/A'}</b></div>
                        <div>Risks: <b style="color:${risks.summary.critical > 0 ? 'var(--danger)' : 'var(--success)'}">${risks.summary.total || 0}</b></div>
                    </div>
                    ${forecastHtml}
                </div>
                ${riskHtml}
                ${planHtml}
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:0.75rem;margin-bottom:1rem">
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">📡 Channel Allocation</h4>
                        <div style="display:flex;align-items:flex-start;gap:1rem">
                            ${chDonut}
                            <div style="flex:1">${chBar}</div>
                        </div>
                        ${chHtml}
                    </div>
                    <div class="admin-card">
                        <h4 style="margin-top:0;font-size:0.85rem">🏷️ Product Investment</h4>
                        <div style="display:flex;gap:1rem;flex-wrap:wrap;font-size:0.75rem;margin-bottom:0.5rem">
                            <span>⭐ Stars: <b>${investment.summary.stars || 0}</b></span>
                            <span>📈 Growth: <b>${investment.summary.growth || 0}</b></span>
                            <span>🔄 Maintain: <b>${investment.summary.maintain || 0}</b></span>
                            <span>👁 Monitor: <b>${investment.summary.monitor || 0}</b></span>
                        </div>
                        ${invBar}
                        ${invHtml}
                    </div>
                </div>

                <div class="admin-card" style="margin-bottom:1rem">
                    <h4 style="margin-top:0;font-size:0.85rem">⚡ Auto-Scaling Triggers</h4>
                    <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;flex-wrap:wrap">
                        <button onclick="window._runTriggers(true)" style="padding:0.3rem 0.8rem;font-size:0.72rem;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);cursor:pointer;color:var(--text-secondary)">🧪 Dry Run</button>
                        <button onclick="window._runTriggers(false)" style="padding:0.3rem 0.8rem;font-size:0.72rem;border:1px solid var(--danger);border-radius:4px;background:var(--bg-card);cursor:pointer;color:var(--danger)">🚀 Run Live</button>
                        <button onclick="window._resetTriggerCD()" style="padding:0.3rem 0.8rem;font-size:0.72rem;border:1px solid var(--border);border-radius:4px;background:var(--bg-card);cursor:pointer;color:var(--text-muted)">🔄 Reset Cooldowns</button>
                    </div>
                    <div id="trigger-status"></div>
                    <div id="trigger-results" style="margin-top:0.5rem"></div>
                </div>
            `;

            // Load trigger status
            _loadTriggerStatus();
        } catch (e) {
            el.innerHTML = '<div class="admin-card"><p style="color:var(--danger)">Error: ' + esc(e.message) + '</p></div>';
        }
    }

    // Trigger helpers
    async function _loadTriggerStatus() {
        try {
            const res = await fetch(`/api/admin/triggers/status?key=${adminKey()}`);
            const data = await res.json();
            const el = document.getElementById('trigger-status');
            if (!el) return;
            let html = '<table class="admin-table" style="font-size:0.7rem"><thead><tr><th>Rule</th><th>Severity</th><th>Cooldown</th><th>Status</th><th>Last Run</th></tr></thead><tbody>';
            (data.rules || []).forEach(r => {
                const cdColor = r.cooldown_active ? 'var(--warning)' : 'var(--success)';
                html += `<tr><td>${esc(r.name)}</td><td>${badge(r.severity)}</td><td>${r.cooldown_minutes}m</td>`;
                html += `<td style="color:${cdColor};font-weight:600">${r.cooldown_active ? '⏳ Cooling' : '✅ Ready'}</td>`;
                html += `<td style="font-size:0.65rem">${r.last_triggered ? timeAgo(r.last_triggered) : '—'}</td></tr>`;
            });
            html += '</tbody></table>';
            el.innerHTML = html;
        } catch (e) { /* silent */ }
    }

    window._runTriggers = async function(dryRun) {
        const el = document.getElementById('trigger-results');
        if (!el) return;
        el.innerHTML = '<div style="color:var(--text-muted);font-size:0.72rem">Running triggers...</div>';
        try {
            const res = await fetch(`/api/admin/triggers/run?key=${adminKey()}&dry_run=${dryRun}`, { method: 'POST', headers: hdr() });
            const data = await res.json();
            let html = `<div style="font-size:0.72rem;margin-bottom:0.4rem"><b>${data.total_triggered}</b> triggered, <b>${data.total_skipped}</b> skipped ${data.dry_run ? '<span style="color:var(--warning)">(DRY RUN)</span>' : '<span style="color:var(--success)">(LIVE)</span>'}</div>`;
            if (data.triggered && data.triggered.length > 0) {
                html += '<table class="admin-table" style="font-size:0.68rem"><thead><tr><th>Rule</th><th>Severity</th><th>Actions</th></tr></thead><tbody>';
                data.triggered.forEach(t => {
                    const actions = (t.results || []).map(r => `${r.type}: ${esc(r.detail)}`).join('<br>');
                    html += `<tr><td>${esc(t.rule_name)}</td><td>${badge(t.severity)}</td><td>${actions}</td></tr>`;
                });
                html += '</tbody></table>';
            }
            el.innerHTML = html;
            _loadTriggerStatus();
        } catch (e) { el.innerHTML = '<div style="color:var(--danger);font-size:0.72rem">Error: ' + esc(e.message) + '</div>'; }
    };

    window._resetTriggerCD = async function() {
        try {
            await fetch(`/api/admin/triggers/reset?key=${adminKey()}`, { method: 'POST', headers: hdr() });
            _loadTriggerStatus();
        } catch (e) { alert('Error: ' + e.message); }
    };

    // ═══════════════════════════════════════════════════════════════════════════
    // INIT — hook into admin tabs system
    // ═══════════════════════════════════════════════════════════════════════════

    function init() {
        initSubTabs();
        // Hook: when the main scaling tab is activated, load overview
        const observer = new MutationObserver(() => {
            const scalingTab = $('tab-scaling');
            if (scalingTab && scalingTab.classList.contains('active')) {
                loadOverview();
            }
        });
        const tabScaling = $('tab-scaling');
        if (tabScaling) observer.observe(tabScaling, { attributes: true, attributeFilter: ['class'] });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
