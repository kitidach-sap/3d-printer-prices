/**
 * Urgency Engine — Creates FOMO without misleading
 */

const URGENCY_LINES = [
    // Price volatility
    "⚠️ Prices change daily — check the latest.",
    "⚠️ Amazon prices fluctuate — compare now.",
    "💰 Today's price: ${price}. Tomorrow? No guarantees.",
    
    // Stock scarcity
    "🔥 Popular choice — stock varies by region.",
    "📦 Limited availability in some areas.",
    "⏳ Selling fast — compare options while available.",
    
    // Time-based
    "🕐 Best time to compare 3D printer prices.",
    "⏰ Don't wait for prices to go back up.",
    "📉 Price just dropped. Compare now.",
    
    // Social proof urgency
    "🏃 Makers are moving on this one.",
    "👀 Trending in the 3D printing community.",
    "🔥 One of the most compared products this week.",
];

/**
 * Get a random urgency line
 * @param {object} product - Product data
 * @returns {string}
 */
function getUrgency(product) {
    const line = URGENCY_LINES[Math.floor(Math.random() * URGENCY_LINES.length)];
    return line.replace(/{price}/g, product.price || '');
}

module.exports = { getUrgency, URGENCY_LINES };
