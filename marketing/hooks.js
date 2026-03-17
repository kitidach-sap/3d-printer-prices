/**
 * Hook Library — Proven scroll-stopping openers
 * Rotated randomly to avoid repetition
 */

const HOOK_TEMPLATES = {
    scroll_stopper: [
        "Stop scrolling — this {category} is {superlative}.",
        "This changes everything about {category}.",
        "I can't believe this only costs ${price}.",
        "This is the {category} everyone's been waiting for.",
        "Forget everything you know about {category}.",
        "${price}. That's it. For THIS level of quality.",
        "The {brand} {name} just broke the price barrier.",
    ],
    problem_solution: [
        "Tired of {pain_point}? The {name} fixes that.",
        "Still dealing with {pain_point}? There's a better way.",
        "If {pain_point} is killing your workflow, read this.",
        "Most {category} users struggle with {pain_point}. Not anymore.",
        "{pain_point}? The {name} was built to solve exactly that.",
        "The #1 complaint about {category}? {pain_point}. The {name} eliminates it.",
    ],
    beginner: [
        "New to 3D printing? Start here.",
        "Your first {category}? Make it count.",
        "Beginner mistake: spending $500+ on your first printer. You don't have to.",
        "If you're just getting started with 3D printing, this is the one.",
        "Don't overthink your first {category}. The {name} makes it easy.",
        "Zero experience needed. The {name} is truly plug-and-play.",
    ],
    curiosity: [
        "Why is everyone suddenly talking about the {name}?",
        "What makes the {name} different from everything else?",
        "There's a reason this has {review_count}+ reviews.",
        "The {name} has a secret most people don't know about.",
        "Why did {brand} price this so low? Here's what I found.",
        "Everyone's sleeping on this {category}. Not for long.",
    ],
    deal_urgency: [
        "Prices change daily. Right now the {name} is ${price}.",
        "Lowest price I've seen on the {name}: ${price}",
        "This won't stay at ${price} for long.",
        "${price} for the {name}? This feels like a pricing error.",
        "If you've been eyeing the {name}, now's the time. ${price}.",
        "Price alert: {name} dropped to ${price} 🚨",
    ],
    comparison: [
        "Before you buy {competitor}, look at this first.",
        "Is the {name} better than {competitor}? Let's find out.",
        "I compared 5 {category} options. The {name} won.",
        "{name} vs everything else in the ${price} range — no contest.",
        "Why choose the {name} over {competitor}? One word: value.",
    ],
    mistake_avoidance: [
        "Don't buy a {category} before reading this.",
        "Most people buy the wrong {category}. Here's how to avoid that.",
        "3 mistakes beginners make when buying a {category}.",
        "Don't waste money on the wrong {category}.",
        "The biggest regret new makers have? Not buying the right printer first.",
        "I wish someone told me this before I bought my first {category}.",
    ],
};

// Pain points by category
const PAIN_POINTS = {
    '3d_printer': [
        'failed prints', 'bed adhesion issues', 'endless calibration',
        'slow print speeds', 'noisy printers', 'complicated setup',
        'stringing and oozing', 'warping on large prints',
    ],
    'filament': [
        'inconsistent filament diameter', 'tangled spools',
        'brittle prints', 'moisture-damaged filament',
    ],
    'accessories': [
        'spaghetti prints', 'poor bed adhesion', 'messy workspaces',
        'hard-to-remove supports',
    ],
};

// Competitors by category
const COMPETITORS = {
    '3d_printer': ['Ender 3', 'Prusa MK4', 'Bambu Lab A1', 'ELEGOO Neptune', 'Creality K1'],
    'filament': ['generic PLA', 'cheap filament', 'no-name brands'],
    'accessories': ['basic tools', 'cheap alternatives'],
};

const SUPERLATIVES = [
    'underrated', 'overlooked', 'a game-changer', 'worth every penny',
    'better than printers twice its price', 'the best value I\'ve seen',
];

/**
 * Get a random hook for a specific angle
 * @param {string} angle - Hook angle type
 * @param {object} product - Product data
 * @returns {{ text: string, type: string }}
 */
function getHook(angle, product) {
    const templates = HOOK_TEMPLATES[angle];
    if (!templates?.length) return { text: '', type: angle };

    const template = templates[Math.floor(Math.random() * templates.length)];
    const category = product.category === '3d_printer' ? '3D printer' : product.category;
    const painPoints = PAIN_POINTS[product.category] || PAIN_POINTS['3d_printer'];
    const competitors = COMPETITORS[product.category] || COMPETITORS['3d_printer'];
    // Filter out self from competitors
    const filteredCompetitors = competitors.filter(c => 
        !product.name?.toLowerCase().includes(c.toLowerCase())
    );

    const text = template
        .replace(/{name}/g, product.name)
        .replace(/{brand}/g, product.brand || '')
        .replace(/{price}/g, product.price)
        .replace(/{category}/g, category)
        .replace(/{rating}/g, product.rating)
        .replace(/{review_count}/g, product.review_count || '100')
        .replace(/{pain_point}/g, painPoints[Math.floor(Math.random() * painPoints.length)])
        .replace(/{competitor}/g, filteredCompetitors[Math.floor(Math.random() * filteredCompetitors.length)] || 'the competition')
        .replace(/{superlative}/g, SUPERLATIVES[Math.floor(Math.random() * SUPERLATIVES.length)]);

    return { text, type: angle };
}

/**
 * Get all available angles
 */
function getAngles() {
    return Object.keys(HOOK_TEMPLATES);
}

module.exports = { getHook, getAngles, HOOK_TEMPLATES };
