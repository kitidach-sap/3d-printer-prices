/**
 * Cron Auto-Triggers
 * Runs prediction engine + auto-scaling triggers on schedule
 * Can be triggered via Vercel Cron or external scheduler
 */

module.exports = async function cronTriggerHandler(req, res) {
    const key = req.query.key || req.headers['x-admin-key'] || req.headers['authorization'];
    const adminKey = process.env.ADMIN_KEY;
    if (key !== adminKey && key !== `Bearer ${adminKey}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const prediction = require('../../revenue/prediction');
        const triggers = require('../../revenue/autoTriggers');
        
        // Get Supabase client
        let supabase = null;
        try {
            const { createClient } = require('@supabase/supabase-js');
            supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
        } catch (e) { /* no supabase */ }

        // Run prediction cycle
        const predictionData = await prediction.runPredictionCycle(supabase);

        // Get optional modules
        let boosters = null, contentExpander = null;
        try { boosters = require('../../revenue/boosters'); } catch (e) {}
        try { contentExpander = require('../../monetization/contentExpander'); } catch (e) {}

        // Determine dry_run mode from config
        const dryRun = req.query.live !== 'true';

        // Run triggers
        const result = triggers.runTriggerCycle(predictionData, {
            dryRun,
            boosters,
            contentExpander,
        });

        console.log(`[CRON TRIGGERS] ${result.total_triggered} triggered, ${result.total_skipped} skipped (dry_run=${dryRun})`);

        res.json({
            ok: true,
            mode: dryRun ? 'dry_run' : 'live',
            ...result,
        });
    } catch (e) {
        console.error('[CRON TRIGGERS] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
};
