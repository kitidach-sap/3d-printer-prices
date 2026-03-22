/**
 * Route Lock — Session-Based Route Persistence
 * 
 * Ensures route consistency across refreshes/navigation within a session.
 * Once a route is chosen for a session+product, it stays locked.
 * 
 * In-memory store keyed by session_id:product_id → { route, url, timestamp }
 * TTL: 30 minutes (session lifetime)
 */

const config = require('../revenue/config');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const LOCK_TTL_MS = 30 * 60 * 1000;   // 30 minutes
const MAX_LOCKS = 5000;                // max entries to prevent memory bloat
const CLEANUP_INTERVAL = 5 * 60 * 1000; // cleanup every 5 min

// ═══════════════════════════════════════════════════════════════════════════════
// LOCK STORE
// ═══════════════════════════════════════════════════════════════════════════════

const _locks = new Map(); // key: `${session_id}:${product_id}` → { route, url, created, source, confidence }

function _makeKey(sessionId, productId) {
    return `${sessionId || 'anon'}:${productId || 'unknown'}`;
}

function _isExpired(entry) {
    return Date.now() - entry.created > LOCK_TTL_MS;
}

// Periodic cleanup
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of _locks) {
        if (now - val.created > LOCK_TTL_MS) _locks.delete(key);
    }
}, CLEANUP_INTERVAL);

// ═══════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if a locked route exists for this session + product
 * @returns {Object|null} { route, url, confidence } or null
 */
function getLockedRoute(sessionId, productId) {
    const key = _makeKey(sessionId, productId);
    const entry = _locks.get(key);
    if (!entry) return null;
    if (_isExpired(entry)) {
        _locks.delete(key);
        return null;
    }
    return {
        route: entry.route,
        url: entry.url,
        confidence: entry.confidence,
        locked_at: entry.created,
        source: entry.source,
    };
}

/**
 * Lock a route for this session + product
 */
function lockRoute(sessionId, productId, route, url, meta = {}) {
    const key = _makeKey(sessionId, productId);
    
    // Enforce max size
    if (_locks.size >= MAX_LOCKS) {
        // Evict oldest 20%
        const entries = [..._locks.entries()].sort((a, b) => a[1].created - b[1].created);
        const evictCount = Math.floor(MAX_LOCKS * 0.2);
        entries.slice(0, evictCount).forEach(([k]) => _locks.delete(k));
    }

    _locks.set(key, {
        route,
        url,
        source: meta.source || 'unknown',
        confidence: meta.confidence || 'low',
        created: Date.now(),
    });
}

/**
 * Remove lock (e.g., on explicit re-evaluation)
 */
function unlockRoute(sessionId, productId) {
    _locks.delete(_makeKey(sessionId, productId));
}

/**
 * Get diagnostics
 */
function getStatus() {
    let active = 0;
    let expired = 0;
    const now = Date.now();
    for (const [, val] of _locks) {
        if (now - val.created > LOCK_TTL_MS) expired++; else active++;
    }
    return { total: _locks.size, active, expired, max: MAX_LOCKS, ttl_ms: LOCK_TTL_MS };
}

module.exports = { getLockedRoute, lockRoute, unlockRoute, getStatus };
