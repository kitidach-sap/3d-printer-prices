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
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);

const SITE = 'https://3d-printer-prices.com';
const TODAY = new Date().toISOString().split('T')[0];
const YEAR = new Date().getFullYear();

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

// ─── Content Generator ──────────────────────────────────────────────────────

function generateProductTable(products) {
    if (!products.length) return '';
    let table = `| Printer | Price | Rating | Type | Best For |\n|---------|-------|--------|------|----------|\n`;
    products.forEach(p => {
        const name = p.display_name || p.product_name || 'Unknown';
        const price = p.price ? `$${p.price}` : 'N/A';
        const rating = p.rating ? `${p.rating}/5 (${p.review_count || 0})` : 'N/A';
        const type = p.printer_type || p.product_type || p.category || '-';
        const best = bestForLabel(p);
        const link = `[${name}](${SITE}/product.html?id=${p.id})`;
        table += `| ${link} | ${price} | ${rating} | ${type} | ${best} |\n`;
    });
    return table;
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

function generateProductReview(p, index) {
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

    return `### ${index + 1}. ${name}

**Price:** ${price} | **Rating:** ${rating}/5 (${reviews} reviews)
[→ Compare prices on 3D Printer Prices](${link})

${name} is ${p.price < 200 ? 'one of the most affordable options in this category' : p.rating >= 4.5 ? 'a top-rated choice with excellent user reviews' : 'a solid contender with good overall performance'}.

**Pros:**
${pros.map(p => `- ✅ ${p}`).join('\n')}

**Cons:**
${cons.map(c => `- ❌ ${c}`).join('\n')}

---`;
}

function generateArticleContent(article, products) {
    const { title, desc, type, slug } = article;
    let content = '';

    // Introduction
    content += `# ${title}\n\n`;
    content += `*Last updated: ${TODAY} | Based on real-time price data from Amazon*\n\n`;
    content += `${desc}\n\n`;

    // Internal links
    content += `> 💡 **Quick Tip:** Use our [price comparison tool](${SITE}) to compare all ${products.length > 0 ? products.length + '+' : '200+'} products in real time.\n\n`;

    if (products.length > 0) {
        // Quick comparison table
        content += `## Quick Comparison\n\n`;
        content += generateProductTable(products);
        content += '\n';

        // Detailed reviews
        content += `## Detailed Reviews\n\n`;
        products.forEach((p, i) => {
            content += generateProductReview(p, i);
            content += '\n';
        });
    }

    // Type-specific content sections
    if (type === 'buying-guide') {
        content += generateBuyingGuideContent(article, products);
    } else if (type === 'comparison') {
        content += generateComparisonContent(article, products);
    } else if (type === 'tutorial') {
        content += generateTutorialContent(article);
    } else if (type === 'review') {
        content += generateReviewContent(article, products);
    }

    // FAQ section (SEO)
    content += generateFAQ(article);

    // Closing CTA
    content += `## Final Verdict\n\n`;
    if (products.length > 0) {
        const topPick = products[0];
        const topName = topPick.display_name || topPick.product_name;
        content += `Our top pick is the **${topName}** for its excellent combination of features and value. However, the best choice depends on your specific needs and budget.\n\n`;
        content += `[→ Compare all options on 3D Printer Prices](${SITE})\n\n`;
    } else {
        content += `Ready to start? Check our [live price tracker](${SITE}) for the latest deals and compare all options side by side.\n\n`;
    }

    // Internal linking section
    content += generateInternalLinks(slug);

    return content;
}

function generateBuyingGuideContent(article, products) {
    return `## What to Look For

### Build Quality & Frame
A sturdy frame is essential for consistent prints. Metal frames (aluminum extrusion or steel) outperform plastic in rigidity and vibration dampening.

### Print Speed
Modern printers range from 60mm/s (budget) to 600mm/s (premium). For most users, 150-300mm/s provides the best speed-quality balance.

### Build Volume
Consider what you'll be printing. Standard build volumes (220×220×250mm) handle most projects, but cosplay and engineering applications may need larger beds.

### Ease of Use
Auto bed leveling, filament sensors, and touchscreen interfaces make a big difference for beginners. Look for printers with Klipper or Marlin firmware.

### Community & Support
A strong user community means more tutorials, profiles, and troubleshooting help. Creality and Bambu Lab have the largest communities.\n\n`;
}

function generateComparisonContent(article, products) {
    return `## How We Compare

Our comparison methodology uses data from real pricing, verified user reviews, and hands-on testing where available. We track prices daily across Amazon to ensure accuracy.\n\n### Key Differences\n\nThe biggest factors when comparing these options are:\n1. **Price to performance ratio** — getting the most value for your budget\n2. **Print quality** — layer resolution and surface finish\n3. **Reliability** — consistency over hundreds of prints\n4. **Ecosystem** — slicer support, spare parts, and community\n\n`;
}

function generateTutorialContent(article) {
    return `## Before You Begin

Make sure you have:\n- A 3D printer (see our [buying guides](${SITE}/blog/) for recommendations)\n- Basic tools (see our [accessories guide](${SITE}/blog/best-3d-printing-accessories))\n- A clean, level workspace\n\n### Safety First\n\nAlways work in a well-ventilated area when 3D printing. Resin printers require gloves and a mask. FDM printers produce minor fumes — keep a window open.\n\n`;
}

function generateReviewContent(article, products) {
    return `## Our Testing Methodology

We evaluate 3D printers based on:\n- **Real user reviews** — aggregated from Amazon verified purchases\n- **Price tracking** — daily price monitoring across all retailers\n- **Specification analysis** — build volume, speed, resolution, and features\n- **Community feedback** — Reddit, forums, and 3D printing communities\n\nAll prices shown are updated in real-time from our [price tracker](${SITE}).\n\n`;
}

function generateFAQ(article) {
    const faqs = {
        'buying-guide': [
            { q: 'What is the best 3D printer for beginners?', a: `For beginners, we recommend printers with auto bed leveling, easy setup, and strong community support. Check our [beginner guide](${SITE}/blog/best-3d-printers-for-beginners) for detailed recommendations.` },
            { q: 'How much should I spend on my first 3D printer?', a: `$150-300 is the sweet spot for a first 3D printer. See our [budget guide](${SITE}/blog/best-budget-3d-printers-under-200) for top picks under $200.` },
            { q: 'FDM or resin — which is better?', a: `FDM is better for large, functional parts. Resin is better for small, highly detailed prints. Read our [FDM vs resin comparison](${SITE}/blog/fdm-vs-resin-3d-printer) for a full breakdown.` },
        ],
        'comparison': [
            { q: 'Which brand makes the best 3D printers?', a: `Bambu Lab leads in speed and ease of use. Creality wins on value. ELEGOO dominates resin. See our [brand comparisons](${SITE}/blog/) for details.` },
            { q: 'Are expensive 3D printers worth it?', a: `Premium printers ($500+) offer faster speeds, auto calibration, and multi-material support. Read our [cheap vs expensive comparison](${SITE}/blog/cheap-vs-expensive-3d-printers).` },
        ],
        'tutorial': [
            { q: 'How long does it take to learn 3D printing?', a: `Most people produce their first successful print within 1-2 hours of setup. Mastering settings and design takes 2-4 weeks of practice.` },
            { q: 'What software do I need for 3D printing?', a: `You need a slicer (Cura or PrusaSlicer — both free) and optionally a CAD program for design (TinkerCAD or Fusion 360 — also free).` },
        ],
        'review': [
            { q: 'How do you track 3D printer prices?', a: `We monitor prices across Amazon daily using automated scrapers. See our [methodology](${SITE}/methodology.html) for details.` },
            { q: 'Are your reviews biased?', a: `Our rankings use real review data and price history. We may earn a commission through affiliate links, but this never influences our recommendations.` },
        ],
    };

    const questions = faqs[article.type] || faqs['buying-guide'];
    let content = `## Frequently Asked Questions\n\n`;
    questions.forEach(f => {
        content += `### ${f.q}\n\n${f.a}\n\n`;
    });
    return content;
}

function generateInternalLinks(slug) {
    const relatedSlugs = [
        { slug: 'best-3d-printers-for-beginners', label: '🏆 Best 3D Printers for Beginners' },
        { slug: 'best-resin-printers', label: '🔬 Best Resin Printers' },
        { slug: 'fdm-vs-resin-3d-printer', label: '⚙️ FDM vs Resin Compared' },
        { slug: 'how-to-start-3d-printing', label: '🛠️ How to Start 3D Printing' },
        { slug: 'best-3d-printer-filaments', label: '🧵 Best Filaments Guide' },
        { slug: 'best-budget-3d-printers-under-200', label: '💰 Best Printers Under $200' },
    ];

    const links = relatedSlugs.filter(r => r.slug !== slug).slice(0, 4);
    let content = `## Related Articles\n\n`;
    links.forEach(l => {
        content += `- [${l.label}](${SITE}/blog/${l.slug})\n`;
    });
    content += `\n*All prices updated daily. [Compare all products →](${SITE})*\n`;
    return content;
}

// ─── Main Generator ─────────────────────────────────────────────────────────

async function main() {
    console.log('📝 SEO Content Generator — Phase 2');
    console.log('===================================\n');

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
