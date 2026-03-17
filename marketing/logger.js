/**
 * Marketing Logger — Structured logging for the Affiliate Revenue Engine
 * 
 * Stores logs in Supabase x_posts table (status='log') and console.
 * Each run creates a complete execution log that's viewable in admin panel.
 */

class MarketingLogger {
    constructor(supabase, source = 'x_engine') {
        this.supabase = supabase;
        this.source = source;
        this.entries = [];
        this.startTime = Date.now();
    }

    log(message, data = null) {
        const entry = {
            time: new Date().toISOString(),
            level: 'info',
            message,
            data,
        };
        this.entries.push(entry);
        console.log(`   ℹ️ ${message}`, data ? JSON.stringify(data).substring(0, 100) : '');
    }

    warn(message, data = null) {
        const entry = {
            time: new Date().toISOString(),
            level: 'warn',
            message,
            data,
        };
        this.entries.push(entry);
        console.log(`   ⚠️ ${message}`, data ? JSON.stringify(data).substring(0, 100) : '');
    }

    error(message, data = null) {
        const entry = {
            time: new Date().toISOString(),
            level: 'error',
            message,
            data,
        };
        this.entries.push(entry);
        console.error(`   ❌ ${message}`, data ? JSON.stringify(data).substring(0, 100) : '');
    }

    success(message, data = null) {
        const entry = {
            time: new Date().toISOString(),
            level: 'success',
            message,
            data,
        };
        this.entries.push(entry);
        console.log(`   ✅ ${message}`, data ? JSON.stringify(data).substring(0, 100) : '');
    }

    /**
     * Save the complete execution log to Supabase
     * Stored as an x_posts entry with status='log'
     */
    async save() {
        const duration = Date.now() - this.startTime;
        const hasErrors = this.entries.some(e => e.level === 'error');
        const summary = this.entries.map(e => `[${e.level.toUpperCase()}] ${e.message}`).join('\n');

        try {
            await this.supabase.from('x_posts').insert({
                content: summary.substring(0, 1000),
                status: hasErrors ? 'error_log' : 'run_log',
                error_message: hasErrors ? this.entries.filter(e => e.level === 'error').map(e => e.message).join('; ') : null,
                posted_at: new Date().toISOString(),
            });
        } catch (e) {
            console.error('Failed to save log:', e.message);
        }

        return {
            duration_ms: duration,
            entries: this.entries.length,
            has_errors: hasErrors,
            summary,
        };
    }

    /**
     * Get all entries as JSON for API response
     */
    toJSON() {
        return {
            source: this.source,
            duration_ms: Date.now() - this.startTime,
            entries: this.entries,
        };
    }
}

module.exports = { MarketingLogger };
