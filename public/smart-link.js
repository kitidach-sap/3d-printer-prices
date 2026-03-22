/**
 * Smart Link — Client-Side Routing Wrapper
 * 
 * Non-blocking, fast, backward-compatible.
 * 
 * Pattern:
 *   1. Render page with standard affiliateUrl() as default (instant)
 *   2. After render, call upgradeSmartLinks() to asynchronously upgrade links
 *   3. If API is slow (>200ms) or fails → keep original link, no UX impact
 *
 * Session cache prevents duplicate API calls.
 */

(function () {
    'use strict';

    // ── Config ──
    const TIMEOUT_MS = 200;     // max wait for smart link API
    const CACHE_KEY = '_slc';   // sessionStorage key

    // ── Session Cache ──
    function _getCache() {
        try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || '{}'); } catch { return {}; }
    }
    function _setCache(cache) {
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* silent */ }
    }
    function _getCached(productId) {
        const c = _getCache();
        const entry = c[productId];
        if (!entry) return null;
        // Expire after 30 min
        if (Date.now() - entry.ts > 30 * 60 * 1000) { delete c[productId]; _setCache(c); return null; }
        return entry;
    }
    function _setCached(productId, url, route) {
        const c = _getCache();
        c[productId] = { url, route, ts: Date.now() };
        _setCache(c);
    }

    // ── Detect traffic source (reuse from session if already set) ──
    function _getSource() {
        return sessionStorage.getItem('_src') || 'direct';
    }

    // ── Get session ID ──
    function _getSessionId() {
        return localStorage.getItem('_sid') || 'anon';
    }

    // ── Fetch smart link with timeout ──
    async function fetchSmartLink(productId, fallbackUrl, page) {
        // Check session cache first
        const cached = _getCached(productId);
        if (cached) return cached.url;

        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

            const params = new URLSearchParams({
                product_id: productId,
                source: _getSource(),
                page: page || 'index',
                session_id: _getSessionId(),
            });

            const res = await fetch(`/api/smart-link?${params}`, {
                signal: controller.signal,
            });
            clearTimeout(timer);

            if (!res.ok) return fallbackUrl;

            const data = await res.json();
            if (data.url) {
                _setCached(productId, data.url, data.route);
                return data.url;
            }
            return fallbackUrl;
        } catch {
            // Timeout or network error — silent fallback
            return fallbackUrl;
        }
    }

    /**
     * Upgrade all affiliate links on the page with smart routing
     * 
     * Looks for links with [data-product-id] attribute and upgrades their href.
     * Non-blocking — renders instantly with default links, then upgrades async.
     * 
     * @param {string} page - page context ('index', 'product', 'compare', 'best', 'blog')
     */
    async function upgradeSmartLinks(page) {
        const links = document.querySelectorAll('a[data-product-id][data-smart-link]');
        if (links.length === 0) return;

        // Batch upgrade — parallel but non-blocking
        const promises = Array.from(links).map(async (link) => {
            const productId = link.getAttribute('data-product-id');
            const fallback = link.href;

            try {
                const smartUrl = await fetchSmartLink(productId, fallback, page);
                if (smartUrl && smartUrl !== fallback) {
                    link.href = smartUrl;
                    link.setAttribute('data-route-upgraded', 'true');
                }
            } catch {
                // Silent — keep original link
            }
        });

        await Promise.allSettled(promises);
    }

    /**
     * Upgrade a single link by product ID
     */
    async function upgradeOneLink(productId, linkElement, page) {
        if (!linkElement || !productId) return;
        const fallback = linkElement.href;
        try {
            const smartUrl = await fetchSmartLink(productId, fallback, page);
            if (smartUrl && smartUrl !== fallback) {
                linkElement.href = smartUrl;
                linkElement.setAttribute('data-route-upgraded', 'true');
            }
        } catch {
            // Silent
        }
    }

    // ── Expose globally ──
    window.smartLink = {
        fetch: fetchSmartLink,
        upgradeAll: upgradeSmartLinks,
        upgradeOne: upgradeOneLink,
    };

})();
