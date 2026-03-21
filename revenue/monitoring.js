/**
 * Self-Monitoring Engine
 * 
 * Tracks performance trends and detects degradation.
 * Runs periodically, compares current vs recent performance,
 * and raises alerts when things go wrong.
 */

const config = require('./config');

const _snapshots = [];          // { timestamp, clicks, compares, sources, boosted, decaying }
const _alerts = [];             // { timestamp, type, severity, message, data }
const _trends = {};             // { metric: 'improving'|'stable'|'degrading' }
let _lastCheck = 0;

// ═══════════════════════════════════════════════════════════════════════════════
// SNAPSHOT — called from boosters.js on each recalc
// ═══════════════════════════════════════════════════════════════════════════════

function recordSnapshot(data) {
    const snap = {
        timestamp: Date.now(),
        iso: new Date().toISOString(),
        total_clicks: data.total_clicks || 0,
        total_compares: data.total_compares || 0,
        active_sources: data.active_sources || 0,
        boosted_products: data.boosted_products || 0,
        decaying_products: data.decaying_products || 0,
        active_campaigns: data.active_campaigns || 0,
        brain_actions: data.brain_actions || 0,
        avg_boost: data.avg_boost || 1.0,
    };
    _snapshots.push(snap);
    while (_snapshots.length > 200) _snapshots.shift();
    return snap;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TREND DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

function detectTrends() {
    if (_snapshots.length < 3) return _trends;

    const windowMs = config.TREND_WINDOW_HOURS * 3600000;
    const now = Date.now();
    const recent = _snapshots.filter(s => (now - s.timestamp) < windowMs);
    const older = _snapshots.filter(s => (now - s.timestamp) >= windowMs && (now - s.timestamp) < windowMs * 2);

    if (recent.length < 2 || older.length < 1) return _trends;

    const metrics = ['total_clicks', 'total_compares', 'boosted_products', 'avg_boost'];
    metrics.forEach(m => {
        const recentAvg = recent.reduce((s, x) => s + x[m], 0) / recent.length;
        const olderAvg = older.reduce((s, x) => s + x[m], 0) / older.length;

        if (olderAvg === 0) {
            _trends[m] = recentAvg > 0 ? 'improving' : 'stable';
            return;
        }

        const change = (recentAvg - olderAvg) / olderAvg;
        if (change <= config.DEGRADATION_THRESHOLD) {
            _trends[m] = 'degrading';
            raiseAlert('degradation', 'warning', `${m} degrading: ${(change * 100).toFixed(1)}% drop`, { metric: m, change, recentAvg, olderAvg });
        } else if (change >= 0.1) {
            _trends[m] = 'improving';
        } else {
            _trends[m] = 'stable';
        }
    });

    return _trends;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

function checkHealth() {
    if (!config.AUTONOMOUS_ENABLED) return getStatus();

    const now = Date.now();
    if ((now - _lastCheck) < config.MONITOR_INTERVAL_MS && _lastCheck > 0) return getStatus();
    _lastCheck = now;

    detectTrends();

    // Check for zero-activity
    const latest = _snapshots[_snapshots.length - 1];
    if (latest && latest.total_clicks === 0 && _snapshots.length > 5) {
        raiseAlert('zero_activity', 'critical', 'No clicks detected — possible system failure', { snapshot: latest });
    }

    // Check for excessive decay
    if (latest && latest.decaying_products > 0 && latest.boosted_products > 0) {
        const decayRatio = latest.decaying_products / (latest.boosted_products + latest.decaying_products);
        if (decayRatio > config.MAX_DECAY_RATIO) {
            raiseAlert('excessive_decay', 'warning', `${(decayRatio * 100).toFixed(0)}% of entities decaying — may need attention`, { ratio: decayRatio });
        }
    }

    console.log(`📡 Monitor: ${Object.values(_trends).filter(t => t === 'degrading').length} degrading, ${_alerts.length} total alerts`);
    return getStatus();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALERTS
// ═══════════════════════════════════════════════════════════════════════════════

function raiseAlert(type, severity, message, data = {}) {
    // Deduplicate within 30 min
    const recent = _alerts.find(a => a.type === type && (Date.now() - new Date(a.timestamp).getTime()) < 1800000);
    if (recent) return;

    _alerts.push({
        timestamp: new Date().toISOString(),
        type,
        severity,
        message,
        data,
        acknowledged: false,
    });
    while (_alerts.length > 100) _alerts.shift();
    console.log(`🚨 Alert [${severity}]: ${message}`);
}

function acknowledgeAlert(index) {
    if (_alerts[index]) {
        _alerts[index].acknowledged = true;
        return { ok: true };
    }
    return { ok: false, error: 'Alert not found' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function getStatus() {
    const unacknowledged = _alerts.filter(a => !a.acknowledged);
    const degrading = Object.entries(_trends).filter(([, v]) => v === 'degrading').map(([k]) => k);
    return {
        enabled: config.AUTONOMOUS_ENABLED,
        snapshots_recorded: _snapshots.length,
        latest_snapshot: _snapshots[_snapshots.length - 1] || null,
        trends: { ..._trends },
        degrading_metrics: degrading,
        health: degrading.length === 0 ? 'healthy' : degrading.length <= 1 ? 'warning' : 'critical',
        alerts: {
            total: _alerts.length,
            unacknowledged: unacknowledged.length,
            recent: [..._alerts].reverse().slice(0, 20),
        },
        last_check: _lastCheck ? new Date(_lastCheck).toISOString() : null,
    };
}

function getSnapshots(limit = 50) {
    return [..._snapshots].reverse().slice(0, limit);
}

module.exports = {
    recordSnapshot,
    detectTrends,
    checkHealth,
    raiseAlert,
    acknowledgeAlert,
    getStatus,
    getSnapshots,
};
