/**
 * CTA Optimizer — High-converting call-to-action variants
 */

const CTA_VARIANTS = [
    // Direct action
    { text: "Check live prices here 👇", type: "direct" },
    { text: "See current deals before they change 👇", type: "direct" },
    { text: "Compare prices now 👇", type: "direct" },
    { text: "Find the best price 👇", type: "direct" },
    
    // Curiosity
    { text: "See what it costs right now →", type: "curiosity" },
    { text: "Check if it's still in stock →", type: "curiosity" },
    { text: "See why it's rated {rating}/5 →", type: "curiosity" },
    
    // Urgency
    { text: "Grab it before prices go up 👇", type: "urgency" },
    { text: "Compare now — prices change fast 👇", type: "urgency" },
    { text: "Today's best price 👇", type: "urgency" },
    
    // Social proof
    { text: "Join {review_count}+ makers who rated this {rating}/5 👇", type: "social" },
    { text: "See why makers love this →", type: "social" },
    
    // Value
    { text: "Worth every dollar? You decide 👇", type: "value" },
    { text: "See the full breakdown →", type: "value" },
];

/**
 * Get a random CTA
 * @param {object} product - Product data for template vars
 * @param {string} [preferType] - Preferred CTA type
 * @returns {{ text: string, type: string }}
 */
function getCTA(product, preferType = null) {
    let pool = CTA_VARIANTS;
    if (preferType) {
        const filtered = pool.filter(c => c.type === preferType);
        if (filtered.length) pool = filtered;
    }

    const cta = pool[Math.floor(Math.random() * pool.length)];
    const text = cta.text
        .replace(/{rating}/g, product.rating || '4.5')
        .replace(/{review_count}/g, product.review_count || '100')
        .replace(/{price}/g, product.price || '');

    return { text, type: cta.type };
}

module.exports = { getCTA, CTA_VARIANTS };
