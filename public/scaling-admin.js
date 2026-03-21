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
        return localStorage.getItem('admin_key') || '';
    }
    function hdr() {
        return { 'Content-Type': 'application/json', 'x-admin-key': adminKey() };
    }
    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function pct(v) { return (v * 100).toFixed(0) + '%'; }
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
            // Re-read settings to revert checkbox
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
