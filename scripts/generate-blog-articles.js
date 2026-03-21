/**
 * SEO Blog Content Generator — Phase 2
 * 
 * Generates 50 SEO-optimized articles for 3d-printer-prices.com
 * Uses real product data from Supabase to create affiliate-linked content.
 * 
 * Usage: node scripts/generate-blog-articles.js
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY env vars
 */

const { createClient } = require('@supabase/supabase-js');
const { getBlogWinners, getBlogProductBoosts, getTrendingProducts, getCampaignBoosts } = require('../marketing/optimizer');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const SITE = 'https://3d-printer-prices.com';
const TODAY = new Date().toISOString().split('T')[0];
const YEAR = new Date().getFullYear();

// Self-optimization data — populated before generation
let OPT_DATA = { variant_weights: {}, trending: {}, product_boosts: {}, campaign_boosts: {} };

// ─── Article Template Definitions ────────────────────────────────────────────

const ARTICLES = [
    // === BUYING GUIDES (15) ===
    { slug: 'best-3d-printers-for-beginners', type: 'buying-guide',
      title: `Best 3D Printers for Beginners in ${YEAR} — Complete Guide`,
      desc: `New to 3D printing? Our expert guide helps you choose the perfect beginner-friendly printer. Compare top picks by price, ease of use, and print quality.`,
      filter: p => p.category === '3d_printer' && (p.beginner_score >= 7 || p.price < 300), limit: 8 },
    { slug: 'best-resin-printers', type: 'buying-guide',
      title: `Best Resin 3D Printers in ${YEAR} — Ultra Detail Picks`,
      desc: `Looking for incredible detail? We compare the top resin (SLA/MSLA) printers for miniatures, jewelry, dental, and engineering applications.`,
      filter: p => p.printer_type === 'Resin' || (p.product_type || '').toLowerCase().includes('resin'), limit: 8 },
    { slug: 'best-fdm-printers', type: 'buying-guide',
      title: `Best FDM 3D Printers in ${YEAR} — Filament Printer Guide`,
      desc: `FDM printers offer the best value for hobbyists and makers. We compare the top FDM options across all price ranges.`,
      filter: p => p.printer_type === 'FDM' || (p.product_type || '').toLowerCase().includes('fdm'), limit: 8 },
    { slug: 'best-budget-3d-printers-under-200', type: 'buying-guide',
      title: `Best 3D Printers Under $200 in ${YEAR}`,
      desc: `Great 3D printing doesn't have to break the bank. These sub-$200 printers deliver excellent value with solid print quality.`,
      filter: p => p.category === '3d_printer' && p.price && p.price < 200, limit: 8 },
    { slug: 'best-3d-printers-under-500', type: 'buying-guide',
      title: `Best 3D Printers Under $500 in ${YEAR} — Mid-Range Picks`,
      desc: `The $300-500 range offers the sweet spot of features and quality. See which printers deliver the best performance at this price point.`,
      filter: p => p.category === '3d_printer' && p.price && p.price >= 200 && p.price < 500, limit: 8 },
    { slug: 'best-3d-printers-under-1000', type: 'buying-guide',
      title: `Best 3D Printers Under $1000 — Premium Picks ${YEAR}`,
      desc: `Ready to invest in a serious 3D printer? These sub-$1000 models offer professional features at hobbyist prices.`,
      filter: p => p.category === '3d_printer' && p.price && p.price >= 500 && p.price < 1000, limit: 8 },
    { slug: 'best-3d-printers-for-miniatures', type: 'buying-guide',
      title: `Best 3D Printers for Miniatures & Tabletop Gaming ${YEAR}`,
      desc: `Whether you play D&D, Warhammer, or paint custom miniatures — these printers deliver stunning detail at scale.`,
      filter: p => p.printer_type === 'Resin' && p.price && p.price < 600, limit: 6 },
    { slug: 'best-high-speed-3d-printers', type: 'buying-guide',
      title: `Fastest 3D Printers in ${YEAR} — Speed Test Rankings`,
      desc: `Speed matters. We rank the fastest 3D printers by actual print speed, from 300mm/s to 600mm/s models.`,
      filter: p => p.category === '3d_printer' && (p.speed_score >= 7 || (p.labels || []).some(l => l.toLowerCase().includes('speed'))), limit: 8 },
    { slug: 'best-large-format-3d-printers', type: 'buying-guide',
      title: `Best Large Format 3D Printers ${YEAR} — Big Build Volume`,
      desc: `Need to print big? These large-format 3D printers offer massive build volumes for cosplay props, prototypes, and functional parts.`,
      filter: p => p.category === '3d_printer' && (p.labels || []).some(l => l.toLowerCase().includes('large')), limit: 6 },
    { slug: 'best-3d-printers-for-kids', type: 'buying-guide',
      title: `Best 3D Printers for Kids & Education ${YEAR}`,
      desc: `Safe, easy-to-use 3D printers perfect for classrooms, STEM education, and curious kids. No toxic fumes, minimal setup.`,
      filter: p => p.category === '3d_printer' && p.beginner_score >= 8 && p.price && p.price < 300, limit: 6 },
    { slug: 'best-3d-printer-filaments', type: 'buying-guide',
      title: `Best 3D Printer Filaments in ${YEAR} — PLA, PETG, ABS & More`,
      desc: `Choosing the right filament is crucial. We compare PLA, PETG, ABS, TPU and specialty filaments across brands and prices.`,
      filter: p => p.category === 'filament', limit: 10 },
    { slug: 'best-3d-printing-accessories', type: 'buying-guide',
      title: `Essential 3D Printing Accessories ${YEAR}`,
      desc: `Level up your 3D printing setup with these must-have accessories — from bed adhesion helpers to removal tools and enclosures.`,
      filter: p => p.category === 'accessories', limit: 10 },
    { slug: 'best-elegoo-3d-printers', type: 'buying-guide',
      title: `Best ELEGOO 3D Printers ${YEAR} — Full Brand Guide`,
      desc: `ELEGOO makes some of the best value printers available. Compare every ELEGOO model from the Mars series to the Neptune and Saturn.`,
      filter: p => (p.brand || '').toLowerCase() === 'elegoo', limit: 8 },
    { slug: 'best-creality-3d-printers', type: 'buying-guide',
      title: `Best Creality 3D Printers ${YEAR} — Ender, K1, CR Series`,
      desc: `Creality dominates the budget 3D printer market. From the legendary Ender 3 to the speedy K1 — find your perfect Creality model.`,
      filter: p => (p.brand || '').toLowerCase() === 'creality', limit: 8 },
    { slug: 'best-anycubic-3d-printers', type: 'buying-guide',
      title: `Best Anycubic 3D Printers ${YEAR} — Kobra & Photon Series`,
      desc: `Anycubic offers excellent resin and FDM printers. Compare Kobra, Photon Mono, and their latest models.`,
      filter: p => (p.brand || '').toLowerCase() === 'anycubic', limit: 8 },

    // === COMPARISONS (10) ===
    { slug: 'fdm-vs-resin-3d-printer', type: 'comparison',
      title: `FDM vs Resin 3D Printers — Which Should You Choose?`,
      desc: `The ultimate comparison: FDM filament printers vs resin SLA/MSLA printers. Cost, quality, speed, safety, and best use cases compared.`,
      filter: p => p.category === '3d_printer', limit: 4, special: 'fdm-vs-resin' },
    { slug: 'ender-3-v3-vs-bambu-lab-a1', type: 'comparison',
      title: `Ender 3 V3 vs Bambu Lab A1 — Which Budget Printer Wins?`,
      desc: `Two of the most popular budget 3D printers go head to head. Speed, quality, features, and value compared in detail.`,
      filter: p => (p.display_name || p.product_name || '').match(/ender 3 v3|bambu.*a1/i), limit: 2 },
    { slug: 'pla-vs-petg-vs-abs', type: 'comparison',
      title: `PLA vs PETG vs ABS — 3D Printing Filament Comparison ${YEAR}`,
      desc: `Which filament is best? Compare PLA, PETG, and ABS across strength, temperature resistance, ease of use, and cost.`,
      filter: p => p.category === 'filament', limit: 6, special: 'filament-compare' },
    { slug: 'bambu-lab-vs-creality', type: 'comparison',
      title: `Bambu Lab vs Creality — Brand Showdown ${YEAR}`,
      desc: `The new king vs the established giant. Compare Bambu Lab and Creality across price, speed, reliabilty, and ecosystem.`,
      filter: p => ['bambu lab', 'creality'].includes((p.brand || '').toLowerCase()), limit: 6 },
    { slug: 'elegoo-vs-anycubic-resin', type: 'comparison',
      title: `ELEGOO vs Anycubic — Best Resin Printer Brand ${YEAR}`,
      desc: `The two biggest names in resin printing compared: ELEGOO Mars/Saturn vs Anycubic Photon/Mono series.`,
      filter: p => ['elegoo', 'anycubic'].includes((p.brand || '').toLowerCase()) && p.printer_type === 'Resin', limit: 6 },
    { slug: 'direct-drive-vs-bowden-extruder', type: 'comparison',
      title: `Direct Drive vs Bowden Extruder — Which Is Better?`,
      desc: `Understand the key difference in FDM 3D printer extruder types. When to choose direct drive vs Bowden for flexible filaments, speed, and quality.`,
      filter: p => p.category === '3d_printer' && p.printer_type === 'FDM', limit: 4, special: 'extruder' },
    { slug: 'corexy-vs-bedslinger', type: 'comparison',
      title: `CoreXY vs Bedslinger — 3D Printer Motion Systems Explained`,
      desc: `Why CoreXY printers dominate speed benchmarks and what bedslingers still do better. Motion system comparison for makers.`,
      filter: p => p.category === '3d_printer' && p.printer_type === 'FDM', limit: 4, special: 'motion' },
    { slug: 'wifi-3d-printers-vs-usb', type: 'comparison',
      title: `WiFi vs USB 3D Printers — Remote Printing Comparison`,
      desc: `Is WiFi/cloud printing worth it? Compare wireless vs USB-only 3D printers and the best options for remote monitoring.`,
      filter: p => p.category === '3d_printer', limit: 4 },
    { slug: 'enclosed-vs-open-frame', type: 'comparison',
      title: `Enclosed vs Open Frame 3D Printers — Pros and Cons`,
      desc: `Should you buy an enclosed 3D printer? Benefits of enclosures for ABS, ASA, and temperature-sensitive materials.`,
      filter: p => p.category === '3d_printer', limit: 4 },
    { slug: 'cheap-vs-expensive-3d-printers', type: 'comparison',
      title: `$200 vs $800 3D Printers — Is Expensive Worth It?`,
      desc: `We compare budget and premium 3D printers side by side. Are expensive printers worth the extra cost?`,
      filter: p => p.category === '3d_printer' && p.price, limit: 6, special: 'price-tier' },

    // === TUTORIALS (15) ===
    { slug: 'how-to-start-3d-printing', type: 'tutorial',
      title: `How to Start 3D Printing — Complete Beginner Guide ${YEAR}`,
      desc: `Everything you need to know to start 3D printing: choosing a printer, first print setup, slicing software, and troubleshooting.`,
      filter: p => p.category === '3d_printer' && p.beginner_score >= 7, limit: 3 },
    { slug: '3d-printer-bed-adhesion-guide', type: 'tutorial',
      title: `3D Printer Bed Adhesion Guide — Fix Prints That Won't Stick`,
      desc: `Stop failed prints! Master bed adhesion with these proven techniques for glass, PEI, and textured build plates.`,
      filter: p => p.category === '3d_printer', limit: 0 },
    { slug: 'how-to-calibrate-3d-printer', type: 'tutorial',
      title: `How to Calibrate Your 3D Printer — Step by Step`,
      desc: `Perfect prints start with perfect calibration. Learn e-steps, flow rate, PID tuning, and first layer calibration.`,
      filter: p => p.category === '3d_printer', limit: 0 },
    { slug: 'best-cura-settings-for-3d-printing', type: 'tutorial',
      title: `Best Cura Settings for 3D Printing ${YEAR}`,
      desc: `Optimize your Cura slicer settings for better print quality. Layer height, speed, temperature, retraction, and support settings explained.`,
      filter: p => p.category === '3d_printer', limit: 0 },
    { slug: '3d-printing-troubleshooting-guide', type: 'tutorial',
      title: `3D Printing Troubleshooting — Fix Every Common Problem`,
      desc: `Layer shifting? Stringing? Under-extrusion? This comprehensive guide covers every common 3D printing problem and its solution.`,
      filter: p => p.category === '3d_printer', limit: 0 },
    { slug: 'how-to-use-supports-in-3d-printing', type: 'tutorial',
      title: `3D Printing Supports Guide — When & How to Use Them`,
      desc: `Master support structures: when you need them, tree vs linear supports, support settings in Cura and PrusaSlicer.`,
      filter: p => p.category === '3d_printer', limit: 0 },
    { slug: 'resin-printing-safety-guide', type: 'tutorial',
      title: `Resin 3D Printing Safety Guide — Protect Yourself`,
      desc: `Resin is toxic. Learn essential safety practices: ventilation, gloves, curing, disposal, and protecting your health.`,
      filter: p => p.printer_type === 'Resin', limit: 3 },
    { slug: 'how-to-paint-3d-prints', type: 'tutorial',
      title: `How to Paint 3D Prints — From Primer to Final Coat`,
      desc: `Transform your 3D prints with professional painting techniques. Sanding, priming, painting, and finishing guide.`,
      filter: p => p.category === '3d_printer', limit: 0 },
    { slug: 'how-to-post-process-resin-prints', type: 'tutorial',
      title: `Post-Processing Resin Prints — Washing, Curing & Finishing`,
      desc: `Step-by-step guide to post-processing resin prints: washing in IPA, UV curing times, sanding, and painting.`,
      filter: p => p.printer_type === 'Resin', limit: 3 },
    { slug: 'best-free-3d-models-websites', type: 'tutorial',
      title: `Best Free 3D Model Websites for 3D Printing ${YEAR}`,
      desc: `Where to find free STL files: Thingiverse, Printables, MyMiniFactory, and more — curated list of the best sources.`,
      filter: p => p.category === '3d_printer', limit: 0 },
    { slug: 'how-to-design-3d-prints', type: 'tutorial',
      title: `How to Design Your Own 3D Prints — Free CAD Software Guide`,
      desc: `Learn to create your own 3D models using free software: TinkerCAD, Fusion 360, Blender, and FreeCAD for beginners.`,
      filter: p => p.category === '3d_printer', limit: 0 },
    { slug: 'how-to-print-tpu-flexible-filament', type: 'tutorial',
      title: `How to Print TPU & Flexible Filament — Settings Guide`,
      desc: `TPU is tricky. Master flexible filament printing with our temperature, speed, retraction, and extruder settings guide.`,
      filter: p => p.category === 'filament' || p.category === '3d_printer', limit: 0 },
    { slug: 'best-filament-storage-solutions', type: 'tutorial',
      title: `How to Store 3D Printer Filament — Dry Box Guide ${YEAR}`,
      desc: `Moisture ruins filament. Learn the best storage solutions: dry boxes, vacuum bags, desiccant, and filament dryers.`,
      filter: p => p.category === 'filament' || p.category === 'accessories', limit: 4 },
    { slug: 'how-to-use-octoprint', type: 'tutorial',
      title: `OctoPrint Setup Guide — Remote 3D Printer Control`,
      desc: `Set up OctoPrint on a Raspberry Pi for remote monitoring, webcam feeds, and wireless printing. Step-by-step installation guide.`,
      filter: p => p.category === '3d_printer', limit: 0 },
    { slug: 'abs-printing-guide', type: 'tutorial',
      title: `How to Print ABS Without Warping — Complete Guide`,
      desc: `ABS warps, curls, and cracks. Fix every ABS issue with proper enclosure, temperature, and adhesion settings.`,
      filter: p => p.category === '3d_printer' || p.category === 'filament', limit: 0 },

    // === REVIEWS & ROUND-UPS (10) ===
    { slug: 'flashforge-3d-printers-guide', type: 'review',
      title: `FlashForge 3D Printers — Complete Brand Review ${YEAR}`,
      desc: `From the Adventurer to the Creator Pro — a complete review of FlashForge's 3D printer lineup for creators and professionals.`,
      filter: p => (p.brand || '').toLowerCase() === 'flashforge', limit: 8 },
    { slug: '3d-printer-price-tracker', type: 'review',
      title: `3D Printer Price Tracker — How We Monitor ${(264)} Products Daily`,
      desc: `Behind the scenes: how 3D Printer Prices tracks prices across Amazon daily, and how to use our tools to find the best deals.`,
      filter: p => p.category === '3d_printer', limit: 5 },
    { slug: 'top-rated-3d-printers', type: 'review',
      title: `Top Rated 3D Printers on Amazon ${YEAR}`,
      desc: `The highest-rated 3D printers based on thousands of verified Amazon reviews. Only printers with 4.5+ stars and 100+ reviews.`,
      filter: p => p.category === '3d_printer' && p.rating >= 4.5 && p.review_count >= 100, limit: 10 },
    { slug: 'most-popular-3d-printers', type: 'review',
      title: `Most Popular 3D Printers in ${YEAR} — What People Are Actually Buying`,
      desc: `Based on real sales data and review counts — the most popular 3D printers people are actually purchasing right now.`,
      filter: p => p.category === '3d_printer' && p.review_count >= 500, limit: 10 },
    { slug: 'best-3d-printer-deals', type: 'review',
      title: `Best 3D Printer Deals & Discounts ${YEAR}`,
      desc: `Currently discounted 3D printers and accessories. Updated daily with the latest Amazon deals and price drops.`,
      filter: p => p.discount_percent && p.discount_percent > 5, limit: 10 },
    { slug: '3d-printing-for-cosplay', type: 'review',
      title: `Best 3D Printers for Cosplay ${YEAR}`,
      desc: `Make helmets, armor, props and weapons. The best 3D printers for cosplay from budget to professional builds.`,
      filter: p => p.category === '3d_printer' && p.printer_type === 'FDM', limit: 6 },
    { slug: '3d-printing-for-business', type: 'review',
      title: `Best 3D Printers for Small Business & Side Hustle ${YEAR}`,
      desc: `Start a 3D printing business: the best printers for Etsy sellers, prototypers, and on-demand manufacturing.`,
      filter: p => p.category === '3d_printer' && p.price && p.price >= 200, limit: 6 },
    { slug: '3d-printer-maintenance-guide', type: 'review',
      title: `3D Printer Maintenance Guide — Keep Your Printer Perfect`,
      desc: `Regular maintenance prevents failures. Learn how to clean, lubricate, and maintain your FDM and resin 3D printers.`,
      filter: p => p.category === '3d_printer', limit: 0 },
    { slug: '3d-printing-materials-guide', type: 'review',
      title: `Complete 3D Printing Materials Guide ${YEAR}`,
      desc: `PLA, ABS, PETG, TPU, Nylon, Carbon Fiber, Wood — every 3D printing material explained with pros, cons, and applications.`,
      filter: p => p.category === 'filament', limit: 8 },
    { slug: '3d-printing-cost-calculator-guide', type: 'review',
      title: `How Much Does 3D Printing Cost? Complete Cost Breakdown ${YEAR}`,
      desc: `Electricity, filament, resin, maintenance — the real cost of 3D printing per hour and per project with our calculator.`,
      filter: p => p.category === '3d_printer' || p.category === 'filament', limit: 4 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// HIGH-CONVERSION AFFILIATE FUNNEL — Pure Markdown Output
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. PRICE PSYCHOLOGY SYSTEM ──────────────────────────────────────────────

const URGENCY_VARIANTS = [
    '(Updated today ⚠️)',
    '(Lower than usual 📉)',
    '(Limited stock ⚡)',
    '(3 stores compared)',
    '(Price may increase)',
    '(Lowest in 30 days 🔥)',
    '(Selling fast)',
    '(Updated 2h ago)',
    '(Today\'s best price)',
    '(Stock running low)',
];

function priceUrgency() {
    // Weighted selection — winners get picked more often
    const w = OPT_DATA.variant_weights;
    if (Object.keys(w).length > 0) {
        const entries = URGENCY_VARIANTS.map(v => [v, w[v] || 1.0]);
        const total = entries.reduce((s, [, wt]) => s + wt, 0);
        let r = Math.random() * total;
        for (const [variant, weight] of entries) {
            r -= weight;
            if (r <= 0) return variant;
        }
    }
    return URGENCY_VARIANTS[Math.floor(Math.random() * URGENCY_VARIANTS.length)];
}

function priceDisplay(p) {
    if (!p || !p.price) return 'Check price';
    return `**$${p.price}** *${priceUrgency()}*`;
}

function priceDisplayPlain(p) {
    if (!p || !p.price) return 'Check price';
    return `$${p.price} ${priceUrgency()}`;
}

// ─── 2. PRODUCT BADGES ──────────────────────────────────────────────────────

function bestForBadge(p) {
    const name = p.display_name || p.product_name || '';
    // Data-driven trending override
    if (OPT_DATA.product_boosts[name] && OPT_DATA.product_boosts[name].badge) {
        return OPT_DATA.product_boosts[name].badge;
    }
    const pid = String(p.id);
    if (OPT_DATA.trending[pid] && OPT_DATA.trending[pid].badge) {
        return OPT_DATA.trending[pid].badge;
    }
    // Campaign boost override
    if (OPT_DATA.campaign_boosts[pid]) {
        return '🔥 Featured Deal';
    }
    // Default badge logic
    if (p.beginner_score >= 8) return '🎯 Best for Beginners';
    if (p.price && p.price < 150) return '💰 Best Budget Pick';
    if (p.price && p.price < 200) return '💰 Great Value';
    if (p.price && p.price >= 500) return '👔 Best Professional';
    if (p.speed_score >= 8) return '⚡ High Speed Pick';
    if (p.printer_type === 'Resin') return '🔬 Best Detail';
    if (p.rating >= 4.7) return '⭐ Top Rated';
    if (p.review_count >= 1000) return '🔥 Most Popular';
    if (p.review_count >= 500) return '📈 Trending';
    return '✅ Recommended';
}

function bestForLabel(p) {
    if (p.beginner_score >= 8) return 'Beginners';
    if (p.price < 200) return 'Budget buyers';
    if (p.price >= 500) return 'Professionals';
    if (p.speed_score >= 8) return 'Speed';
    if (p.printer_type === 'Resin') return 'Detail work';
    if (p.rating >= 4.7) return 'Quality';
    return 'General use';
}

// ─── 3. SCROLL HOOKS ────────────────────────────────────────────────────────

const SCROLL_HOOKS = [
    { icon: '⏳', text: 'Still deciding? Check real-time prices for all models', cta: 'Compare Prices Now →' },
    { icon: '📊', text: 'Not sure which to pick? See them side by side', cta: 'Open Comparison Tool →' },
    { icon: '💡', text: 'Want the best deal? We track prices across 3+ stores', cta: 'Check Latest Deals →' },
    { icon: '🤔', text: 'Need help choosing? Start with our #1 recommendation', cta: 'See #1 Pick →' },
    { icon: '⚡', text: 'Prices change daily — some dropped in the last 24h', cta: 'Check Today\'s Prices →' },
];

function scrollHook(variantIdx, linkTarget) {
    const hook = SCROLL_HOOKS[variantIdx % SCROLL_HOOKS.length];
    const link = linkTarget || `${SITE}/compare.html`;
    return `\n> ${hook.icon} **${hook.text}**\n> \n> [**${hook.cta}**](${link})\n\n`;
}

// ─── 4. INLINE COMPARE TRIGGER ──────────────────────────────────────────────

function compareTrigger(product) {
    if (!product) return '';
    const name = product.display_name || product.product_name;
    const searchTerm = name.split(' ').slice(0, 3).join(' ');
    const link = `${SITE}/?search=${encodeURIComponent(searchTerm)}`;
    return `→ [Compare **${name}** with other options](${link})\n\n`;
}

// ─── 5. CONTEXT-AWARE CTA (TOP / MID / END) ─────────────────────────────────

function getContextCTA(article, product, position) {
    const name = product ? (product.display_name || product.product_name) : 'this printer';
    const price = product?.price ? `$${product.price}` : '';
    const link = product ? `${SITE}/product.html?id=${product.id}` : SITE;
    const compareLink = `${SITE}/compare.html`;
    const urgency = priceUrgency();

    const ctaMap = {
        beginner: { label: '🎯 SAFE CHOICE FOR BEGINNERS', sub: 'Easy setup, great community support. Perfect first printer.' },
        budget: { label: '💰 BEST VALUE PICK', sub: `At ${price} ${urgency}, this is hard to beat.` },
        speed: { label: '⚡ PERFORMANCE PICK', sub: 'High-speed printing without quality loss.' },
        resin: { label: '🔬 DETAIL CHAMPION', sub: 'Ultra-fine detail for miniatures, jewelry, and dental.' },
        default: { label: '🏆 EDITOR\'S PICK', sub: `${name} — verified by ${product?.review_count || '100'}+ reviews.` },
    };

    let variant = 'default';
    const slug = article.slug || '';
    if (slug.includes('beginner') || slug.includes('kids') || slug.includes('start')) variant = 'beginner';
    else if (slug.includes('budget') || slug.includes('under-200') || slug.includes('cheap')) variant = 'budget';
    else if (slug.includes('speed') || slug.includes('fast')) variant = 'speed';
    else if (slug.includes('resin') || slug.includes('miniature')) variant = 'resin';

    const cta = ctaMap[variant];

    if (position === 'top') {
        // ABOVE FOLD — aggressive, clear action
        let out = `\n> **${cta.label}**\n> \n`;
        out += `> **${name}** ${price ? `— **${price}** *${urgency}*` : ''}\n> \n`;
        out += `> ${cta.sub}\n> \n`;
        out += `> [**→ Check Price Now**](${link}) | [**Compare All Models →**](${compareLink})\n> \n`;
        out += `> ⏰ *Prices updated today — ${Math.floor(Math.random() * 8) + 3} other buyers checked this today*\n\n`;
        return out;
    }

    if (position === 'mid') {
        // MID CONTENT — re-engagement
        let out = `\n> **⚡ Quick Check: ${name}** is still **${price || 'available'}** *${urgency}*\n> \n`;
        out += `> [**→ Lock In This Price**](${link}) | [**Compare Side by Side →**](${compareLink})\n\n`;
        return out;
    }

    // END — summary + urgency + multiple actions
    let out = `\n> **${cta.label}**\n> \n`;
    out += `> ${cta.sub}\n> \n`;
    out += `> **${name}** — ${price ? `**${price}** *${urgency}*` : 'See current price'}\n> \n`;
    out += `> [**→ Check Final Price**](${link}) | [**→ Compare All Options**](${compareLink})\n> \n`;
    out += `> *Prices pulled from Amazon every 24h. Don't miss today's deal.*\n\n`;
    return out;
}

// ─── 6. INLINE CTA ──────────────────────────────────────────────────────────

function inlineCTA(product, urgencyText) {
    if (!product) return '';
    const name = product.display_name || product.product_name;
    const price = product.price ? `$${product.price}` : 'Check price';
    const link = `${SITE}/product.html?id=${product.id}`;
    const urg = priceUrgency();
    return `\n> 🔥 **${name}** is currently **${price}** *${urg}* — [Check latest price →](${link})\n> *${urgencyText || 'Prices change daily. Compare before you buy.'}*\n\n`;
}

// ─── 7. PRODUCT HIGHLIGHT BLOCK ─────────────────────────────────────────────

function productHighlight(p, badge) {
    const name = p.display_name || p.product_name || 'Unknown';
    const link = `${SITE}/product.html?id=${p.id}`;
    const searchTerm = name.split(' ').slice(0, 3).join(' ');
    const compareLink = `${SITE}/?search=${encodeURIComponent(searchTerm)}`;

    let out = `\n> ${badge || bestForBadge(p)}\n> \n`;
    out += `> **${name}**\n> \n`;
    out += `> ${priceDisplayPlain(p)} ⭐ ${p.rating || 'N/A'}/5 (${p.review_count || 0} reviews)\n> \n`;
    out += `> [**Check Price →**](${link}) | [Compare Options](${compareLink})\n\n`;
    return out;
}

// ─── 8. COMPARISON TABLE ────────────────────────────────────────────────────

function comparisonTable(products) {
    if (!products.length) return '';
    let table = `| # | Printer | Price | Rating | Best For | Action |\n|---|---------|-------|--------|----------|--------|\n`;
    products.forEach((p, i) => {
        const name = p.display_name || p.product_name || 'Unknown';
        const price = p.price ? `**$${p.price}** *${priceUrgency()}*` : 'N/A';
        const rating = p.rating ? `${p.rating}/5 (${p.review_count || 0})` : 'N/A';
        const best = bestForLabel(p);
        const link = `${SITE}/product.html?id=${p.id}`;
        table += `| ${i + 1} | **${name}** | ${price} | ${rating} | ${best} | [Check Price →](${link}) |\n`;
    });
    return table + '\n';
}

// ─── 9. PRODUCT REVIEW ──────────────────────────────────────────────────────

function productReview(p, index, article, totalProducts) {
    const name = p.display_name || p.product_name || 'Unknown';
    const price = p.price ? `$${p.price}` : 'Check price';
    const rating = p.rating || 'N/A';
    const reviews = p.review_count || 0;
    const link = `${SITE}/product.html?id=${p.id}`;

    let pros = [];
    let cons = [];
    if (p.price < 200) pros.push('Very affordable price point');
    if (p.price >= 200 && p.price < 400) pros.push('Excellent value for money');
    if (p.rating >= 4.5) pros.push(`High user satisfaction (${rating}/5)`);
    if (p.beginner_score >= 7) pros.push('Easy to set up and use');
    if (p.speed_score >= 7) pros.push('Fast print speeds');
    if (reviews >= 500) pros.push(`Proven reliability (${reviews}+ reviews)`);
    if (p.printer_type === 'Resin') pros.push('Exceptional detail quality');
    if (p.printer_type === 'FDM') pros.push('Low cost per print');
    if (pros.length === 0) pros.push('Solid performance', 'Good build quality');

    if (p.price >= 500) cons.push('Higher price point');
    if (p.beginner_score && p.beginner_score < 5) cons.push('Steeper learning curve');
    if (p.printer_type === 'Resin') cons.push('Requires post-processing (washing + curing)');
    if (p.printer_type === 'FDM' && p.speed_score && p.speed_score < 5) cons.push('Moderate print speed');
    if (cons.length === 0) cons.push('May need firmware updates');

    let out = `### ${index + 1}. ${name}\n\n`;
    out += productHighlight(p, bestForBadge(p));
    out += `${name} is ${p.price < 200 ? 'one of the most affordable options in this category' : p.rating >= 4.5 ? 'a top-rated choice with excellent user reviews' : 'a solid contender with good overall performance'}.\n\n`;
    out += `**Pros:**\n${pros.map(x => `- ✅ ${x}`).join('\n')}\n\n`;
    out += `**Cons:**\n${cons.map(c => `- ❌ ${c}`).join('\n')}\n\n`;

    // Compare trigger after every product
    out += compareTrigger(p);

    // Inline CTA after every 2nd review
    if ((index + 1) % 2 === 0) {
        out += inlineCTA(p, `Don't wait — ${name} at ${price} is a popular choice.`);
    }

    // Scroll hook after reviews 3 and 5
    if (index === 2 && totalProducts > 4) {
        out += scrollHook(0, `${SITE}/compare.html`);
    }
    if (index === 4 && totalProducts > 6) {
        out += scrollHook(1, `${SITE}/compare.html`);
    }

    out += `---\n`;
    return out;
}

// ─── 10. EXIT CTA (STRONG) ──────────────────────────────────────────────────

function exitCTA(article, topPick) {
    const compareLink = `${SITE}/compare.html`;
    const topName = topPick ? (topPick.display_name || topPick.product_name) : '';
    const topPrice = topPick?.price ? `$${topPick.price}` : '';
    const topLink = topPick ? `${SITE}/product.html?id=${topPick.id}` : `${SITE}/compare.html`;
    const urg = priceUrgency();

    let out = `\n> **🎯 Ready to Choose Your 3D Printer?**\n> \n`;
    if (topPick) {
        out += `> Our #1 Pick: **${topName}** at **${topPrice}** *${urg}*\n> \n`;
        out += `> [**→ Check Final Price for ${topName}**](${topLink})\n> \n`;
    }
    out += `> [**→ Compare All Prices Side by Side**](${compareLink})\n> \n`;
    out += `> ⏰ *${Math.floor(Math.random() * 15) + 5} people compared prices in the last hour*\n\n`;
    return out;
}

// ─── 11. INTERNAL LINK BOOST ────────────────────────────────────────────────

function internalLinkBoost(slug, products) {
    const links = [
        { slug: 'best-3d-printers-for-beginners', label: '🏆 Best Printers for Beginners', desc: 'Top picks for first-time buyers' },
        { slug: 'best-budget-3d-printers-under-200', label: '💰 Best Under $200', desc: 'Great quality on a tight budget' },
        { slug: 'best-resin-printers', label: '🔬 Best Resin Printers', desc: 'Ultra-fine detail for miniatures' },
        { slug: 'fdm-vs-resin-3d-printer', label: '⚙️ FDM vs Resin', desc: 'Which technology is right for you?' },
        { slug: 'how-to-start-3d-printing', label: '🛠️ How to Start', desc: 'Complete beginner walkthrough' },
        { slug: 'best-3d-printer-filaments', label: '🧵 Best Filaments', desc: 'PLA, PETG, ABS compared' },
        { slug: 'top-rated-3d-printers', label: '⭐ Top Rated', desc: 'Highest ratings and reviews' },
        { slug: 'best-3d-printer-deals', label: '🔥 Current Deals', desc: 'Today\'s best discounts' },
    ].filter(l => l.slug !== slug).slice(0, 5);

    let out = `## You Might Also Like\n\n`;
    links.forEach(l => {
        out += `- [${l.label}](${SITE}/blog/${l.slug}) — ${l.desc}\n`;
    });
    out += `\n`;

    if (products.length > 0) {
        out += `### Quick Product Links\n\n`;
        products.slice(0, 5).forEach(p => {
            const name = p.display_name || p.product_name;
            out += `- [**${name}** — ${priceDisplayPlain(p)}](${SITE}/product.html?id=${p.id})\n`;
        });
        out += `\n`;
    }

    out += `*All prices updated daily. [Compare all products →](${SITE}/compare.html)*\n`;
    return out;
}

// ─── Main Article Content Generator ─────────────────────────────────────────

function generateArticleContent(article, products) {
    const { title, desc, type, slug } = article;
    let content = '';

    // ── Header ──
    content += `# ${title}\n\n`;
    content += `*Last updated: ${TODAY} | Based on real-time price data from Amazon*\n\n`;
    content += `${desc}\n\n`;

    // ══════ TOP CTA (ABOVE FOLD) ══════
    if (products.length > 0) {
        content += getContextCTA(article, products[0], 'top');
    }

    // ── Quick Comparison Table ──
    if (products.length > 0) {
        content += `## ⚡ Quick Comparison\n\n`;
        content += comparisonTable(products);
        content += `> 💡 Every price includes urgency status — tap \"Check Price\" to see the latest Amazon price.\n\n`;
    }

    // ── Top 3 Product Highlights ──
    if (products.length >= 3) {
        content += `## 🏆 Our Top 3 Picks\n\n`;
        products.slice(0, 3).forEach(p => {
            content += productHighlight(p, bestForBadge(p));
        });
        content += inlineCTA(products[0], `Our #1 pick — prices change frequently. Lock in today's price.`);
        content += `→ [Compare all ${products.length} options side by side](${SITE}/compare.html)\n\n`;
    }

    // ══════ MID CTA (RE-ENGAGEMENT) ══════
    if (products.length > 0) {
        content += getContextCTA(article, products[0], 'mid');
    }

    // ── Detailed Reviews with embedded CTAs + scroll hooks ──
    if (products.length > 0) {
        content += `## Detailed Reviews\n\n`;
        products.forEach((p, i) => {
            content += productReview(p, i, article, products.length);
        });
    }

    // ── Type-specific content ──
    if (type === 'buying-guide') {
        content += generateBuyingGuideContent(article, products);
    } else if (type === 'comparison') {
        content += generateComparisonContent(article, products);
    } else if (type === 'tutorial') {
        content += generateTutorialContent(article, products);
    } else if (type === 'review') {
        content += generateReviewContent(article, products);
    }

    // ── Scroll hook before FAQ ──
    content += scrollHook(2, `${SITE}/compare.html`);

    // ── FAQ ──
    content += generateFAQ(article);

    // ══════ END CTA (FINAL VERDICT) ══════
    content += `## Final Verdict\n\n`;
    if (products.length > 0) {
        const top = products[0];
        const topName = top.display_name || top.product_name;
        content += `Our top pick is the **${topName}** for its excellent combination of features and value.\n\n`;
        content += getContextCTA(article, top, 'end');
    } else {
        content += `Ready to start? Check our [live price tracker](${SITE}/compare.html) for the latest deals and compare all options side by side.\n\n`;
    }

    // ── EXIT CTA (strong close) ──
    content += exitCTA(article, products[0]);

    // ── Internal Links ──
    content += internalLinkBoost(slug, products);

    return content;
}

// ─── Content Section Generators ─────────────────────────────────────────────

function generateBuyingGuideContent(article, products) {
    let out = `## What to Look For\n\n`;
    out += `### Build Quality & Frame\nA sturdy frame is essential for consistent prints. Metal frames (aluminum extrusion or steel) outperform plastic.\n\n`;

    // INLINE CTA after first section
    if (products.length > 0) out += inlineCTA(products[0], 'See our top pick — great build quality at an unbeatable price.');

    out += `### Print Speed\nModern printers range from 60mm/s (budget) to 600mm/s (premium). For most users, 150-300mm/s provides the best balance.\n\n`;
    out += `### Build Volume\nStandard volumes (220×220×250mm) handle most projects. Cosplay and engineering may need larger beds.\n\n`;

    // INLINE CTA after 3rd section
    if (products.length > 1) out += inlineCTA(products[1], 'Great combination of speed and build volume.');

    out += `### Ease of Use\nAuto bed leveling, filament sensors, and touchscreen interfaces make a big difference for beginners.\n\n`;
    out += `### Community & Support\nA strong community means more tutorials and troubleshooting help. Creality and Bambu Lab lead here.\n\n`;

    // Context-aware CTA after guide
    if (products.length > 0) out += getContextCTA(article, products[Math.min(2, products.length - 1)]);

    return out;
}

function generateComparisonContent(article, products) {
    let out = `## How We Compare\n\n`;
    out += `Our methodology uses real pricing, verified reviews, and community feedback. We track prices daily.\n\n`;
    out += `### Key Differences\n\n1. **Price to performance ratio** — maximum value per dollar\n2. **Print quality** — layer resolution and surface finish\n3. **Reliability** — consistency over hundreds of prints\n4. **Ecosystem** — slicer support, parts, and community\n\n`;

    // Comparison CTA
    if (products.length >= 2) {
        out += `> 🔍 **Side-by-side comparison:** [Compare these models on our tracker →](${SITE}/compare.html)\n\n`;
        out += inlineCTA(products[0], `Currently leading the comparison. Check if the price has dropped.`);
    }

    return out;
}

function generateTutorialContent(article, products) {
    let out = `## Before You Begin\n\n`;
    out += `Make sure you have:\n- A 3D printer (see our [buying guides](${SITE}/blog/) for recommendations)\n- Basic tools (see our [accessories guide](${SITE}/blog/best-3d-printing-accessories))\n- A clean, level workspace\n\n`;

    // Product recommendation for tutorials
    if (products && products.length > 0) {
        out += `### Recommended Printer for This Tutorial\n\n`;
        out += productHighlight(products[0], '🎯 Best for This Guide');
    }

    out += `### Safety First\n\nAlways work in a well-ventilated area. Resin printers require gloves and a mask.\n\n`;

    // Mid-tutorial CTA
    if (products && products.length > 0) {
        out += inlineCTA(products[0], `Need a printer for this? This is our recommended pick.`);
    }

    return out;
}

function generateReviewContent(article, products) {
    let out = `## Our Testing Methodology\n\n`;
    out += `We evaluate based on:\n- **Real user reviews** — Amazon verified purchases\n- **Price tracking** — daily monitoring\n- **Specification analysis** — speed, resolution, features\n- **Community feedback** — Reddit, forums, and maker groups\n\n`;
    out += `All prices are updated in real-time from our [price tracker](${SITE}).\n\n`;

    // Review CTA
    if (products.length > 0) {
        out += `> 🏆 **Current #1:** [${products[0].display_name || products[0].product_name}](${SITE}/product.html?id=${products[0].id}) at $${products[0].price || 'see price'}\n\n`;
    }

    return out;
}

function generateFAQ(article) {
    const faqs = {
        'buying-guide': [
            { q: 'What is the best 3D printer for beginners?', a: `For beginners, we recommend printers with auto bed leveling and great community support. [See our beginner guide →](${SITE}/blog/best-3d-printers-for-beginners)` },
            { q: 'How much should I spend on my first 3D printer?', a: `$150-300 is the sweet spot. [See top picks under $200 →](${SITE}/blog/best-budget-3d-printers-under-200)` },
            { q: 'FDM or resin — which is better?', a: `FDM for large parts, resin for detail. [Full comparison →](${SITE}/blog/fdm-vs-resin-3d-printer)` },
        ],
        'comparison': [
            { q: 'Which brand makes the best 3D printers?', a: `Bambu Lab leads speed, Creality wins value, ELEGOO dominates resin. [Compare brands →](${SITE}/blog/)` },
            { q: 'Are expensive printers worth it?', a: `$500+ printers offer auto calibration and multi-material. [Cheap vs expensive →](${SITE}/blog/cheap-vs-expensive-3d-printers)` },
        ],
        'tutorial': [
            { q: 'How long does it take to learn 3D printing?', a: `First print in 1-2 hours. Mastery in 2-4 weeks. [Start here →](${SITE}/blog/how-to-start-3d-printing)` },
            { q: 'What software do I need?', a: `Cura or PrusaSlicer (free). For design: TinkerCAD or Fusion 360 (free). [Design guide →](${SITE}/blog/how-to-design-3d-prints)` },
        ],
        'review': [
            { q: 'How do you track prices?', a: `Daily automated scraping. [See methodology →](${SITE}/methodology.html)` },
            { q: 'Are your reviews biased?', a: `Rankings use real data. We earn affiliate commissions but never compromise recommendations. [Compare yourself →](${SITE})` },
        ],
    };

    const questions = faqs[article.type] || faqs['buying-guide'];
    let out = `## Frequently Asked Questions\n\n`;
    questions.forEach(f => { out += `### ${f.q}\n\n${f.a}\n\n`; });
    return out;
}

// ─── Main Generator ─────────────────────────────────────────────────────────

async function main() {
    console.log('📝 SEO Content Generator — Self-Optimizing Engine');
    console.log('==================================================\n');

    // Load optimization data from analytics
    try {
        const [winners, blogBoosts, trending, campaignBoosts] = await Promise.all([
            getBlogWinners(supabase).catch(() => ({})),
            getBlogProductBoosts(supabase).catch(() => ({})),
            getTrendingProducts(supabase).catch(() => ({})),
            getCampaignBoosts(supabase).catch(() => ({})),
        ]);
        OPT_DATA.variant_weights = winners.variant_weights || {};
        OPT_DATA.product_boosts = blogBoosts || {};
        OPT_DATA.trending = trending || {};
        OPT_DATA.campaign_boosts = campaignBoosts || {};

        const conf = winners.confidence || 'none';
        console.log(`🧠 Optimization data loaded (confidence: ${conf})`);
        if (winners.winner_variant) console.log(`   Winner variant: ${winners.winner_variant}`);
        if (winners.winner_position) console.log(`   Winner position: ${winners.winner_position}`);

        // Layer revenue boosters on top (Auto Money System Phase F)
        try {
            const boosters = require('../revenue/boosters');
            const boosts = await boosters.getBoosts(supabase);
            
            // Merge urgency weights (booster weights override where present)
            if (boosts.urgency_weights && Object.keys(boosts.urgency_weights).length > 0) {
                Object.assign(OPT_DATA.variant_weights, boosts.urgency_weights);
                console.log(`   💰 Revenue urgency weights: ${Object.keys(boosts.urgency_weights).length} variants`);
            }
            
            // Merge badge overrides (booster badges take priority)
            if (boosts.badge_overrides && Object.keys(boosts.badge_overrides).length > 0) {
                Object.keys(boosts.badge_overrides).forEach(name => {
                    OPT_DATA.product_boosts[name] = OPT_DATA.product_boosts[name] || {};
                    OPT_DATA.product_boosts[name].badge = boosts.badge_overrides[name];
                });
                console.log(`   💰 Revenue badge overrides: ${Object.keys(boosts.badge_overrides).length} products`);
            }
            
            // Merge featured articles for internal linking
            if (boosts.featured_articles?.length > 0) {
                OPT_DATA.featured_articles = boosts.featured_articles;
                console.log(`   💰 Featured articles: ${boosts.featured_articles.length}`);
            }
            
            console.log(`   💰 Revenue boosters loaded successfully`);
        } catch (e) {
            console.log(`   ℹ️  Revenue boosters not available: ${e.message}`);
        }
        console.log(`   Trending products: ${Object.keys(trending).length}`);
        console.log(`   Blog product boosts: ${Object.keys(blogBoosts).length}`);
        console.log(`   Active campaigns: ${Object.keys(campaignBoosts).length}\n`);
    } catch (e) {
        console.log('⚠️  Could not load optimization data, using defaults:', e.message, '\n');
    }

    // Fetch all available products
    const { data: allProducts, error } = await supabase.from('products')
        .select('id, product_name, display_name, brand, price, original_price, discount_percent, category, product_type, printer_type, rating, review_count, image_url, amazon_asin, beginner_score, speed_score, labels, specs_json')
        .eq('is_available', true)
        .order('review_count', { ascending: false });

    if (error) { console.error('❌ Failed to fetch products:', error.message); process.exit(1); }
    console.log(`✅ Loaded ${allProducts.length} products from database\n`);

    // Check which articles already exist
    const { data: existing } = await supabase.from('blog_posts')
        .select('slug');
    const existingSlugs = new Set((existing || []).map(e => e.slug));

    const toInsert = [];
    let skipped = 0;

    for (const article of ARTICLES) {
        if (existingSlugs.has(article.slug)) {
            console.log(`⏩ Skip (exists): ${article.slug}`);
            skipped++;
            continue;
        }

        // Filter products for this article
        let products = [];
        if (article.filter) {
            products = allProducts.filter(article.filter);
            if (article.limit) products = products.slice(0, article.limit);
        }

        const content = generateArticleContent(article, products);
        const wordCount = content.split(/\s+/).length;

        toInsert.push({
            slug: article.slug,
            title: article.title,
            description: article.desc,
            content: content,
            article_type: article.type,
            word_count: wordCount,
            is_published: true,
            published_at: new Date().toISOString(),
        });

        console.log(`✅ Generated: ${article.slug} (${wordCount} words, ${products.length} products)`);
    }

    console.log(`\n📊 Summary: ${toInsert.length} new, ${skipped} skipped`);

    if (toInsert.length === 0) {
        console.log('Nothing to insert. Done!');
        return;
    }

    // Batch insert — Supabase supports up to 1000 rows
    const batchSize = 10;
    let inserted = 0;

    for (let i = 0; i < toInsert.length; i += batchSize) {
        const batch = toInsert.slice(i, i + batchSize);
        const { error: insertErr } = await supabase.from('blog_posts').insert(batch);
        if (insertErr) {
            console.error(`❌ Insert batch ${i / batchSize + 1} failed:`, insertErr.message);
            // Try one by one
            for (const article of batch) {
                const { error: singleErr } = await supabase.from('blog_posts').insert(article);
                if (singleErr) console.error(`  ❌ ${article.slug}: ${singleErr.message}`);
                else { console.log(`  ✅ ${article.slug}`); inserted++; }
            }
        } else {
            inserted += batch.length;
            console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} inserted (${batch.length} articles)`);
        }
    }

    console.log(`\n🎉 Done! Inserted ${inserted} articles into blog_posts`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
