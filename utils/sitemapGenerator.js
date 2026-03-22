/**
 * Auto-Sitemap Generator
 * Dynamically generates sitemap.xml from:
 * - Static pages (hardcoded)
 * - Blog posts (from Supabase)
 * - Product categories
 */

const BASE_URL = 'https://3d-printer-prices.com';

// Static pages with priorities
const STATIC_PAGES = [
    { path: '/', changefreq: 'daily', priority: 1.0 },
    { path: '/budget-3d-printers', changefreq: 'daily', priority: 0.9 },
    { path: '/professional-3d-printers', changefreq: 'daily', priority: 0.9 },
    { path: '/resin-3d-printers', changefreq: 'daily', priority: 0.9 },
    { path: '/3d-pens', changefreq: 'daily', priority: 0.8 },
    { path: '/filament', changefreq: 'daily', priority: 0.9 },
    { path: '/accessories', changefreq: 'daily', priority: 0.8 },
    { path: '/blog/', changefreq: 'weekly', priority: 0.8 },
    { path: '/compare.html', changefreq: 'daily', priority: 0.8 },
    { path: '/calculator.html', changefreq: 'monthly', priority: 0.7 },
    { path: '/compatibility.html', changefreq: 'monthly', priority: 0.7 },
    { path: '/best.html', changefreq: 'daily', priority: 0.9 },
    { path: '/methodology.html', changefreq: 'monthly', priority: 0.5 },
    { path: '/privacy.html', changefreq: 'monthly', priority: 0.3 },
    { path: '/terms.html', changefreq: 'monthly', priority: 0.3 },
];

/**
 * Generate sitemap XML
 * @param {object} supabase - Supabase client
 * @returns {string} XML sitemap content
 */
async function generateSitemap(supabase) {
    const urls = [];

    // Static pages
    STATIC_PAGES.forEach(page => {
        urls.push({
            loc: `${BASE_URL}${page.path}`,
            changefreq: page.changefreq,
            priority: page.priority,
        });
    });

    // Blog posts from Supabase
    if (supabase) {
        try {
            const { data: posts } = await supabase
                .from('blog_posts')
                .select('slug, published_at, updated_at')
                .eq('status', 'published')
                .order('published_at', { ascending: false })
                .limit(200);

            if (posts && posts.length > 0) {
                posts.forEach(post => {
                    const lastmod = (post.updated_at || post.published_at || '').split('T')[0];
                    urls.push({
                        loc: `${BASE_URL}/blog/${post.slug}`,
                        lastmod: lastmod || undefined,
                        changefreq: 'monthly',
                        priority: 0.8,
                    });
                });
            }
        } catch (e) {
            console.warn('[SITEMAP] Error fetching blog posts:', e.message);
        }
    }

    // Build XML
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    urls.forEach(url => {
        xml += '  <url>\n';
        xml += `    <loc>${escXml(url.loc)}</loc>\n`;
        if (url.lastmod) xml += `    <lastmod>${url.lastmod}</lastmod>\n`;
        if (url.changefreq) xml += `    <changefreq>${url.changefreq}</changefreq>\n`;
        if (url.priority !== undefined) xml += `    <priority>${url.priority}</priority>\n`;
        xml += '  </url>\n';
    });

    xml += '</urlset>\n';
    return xml;
}

function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Get sitemap stats
 */
async function getSitemapStats(supabase) {
    let blogCount = 0;
    if (supabase) {
        try {
            const { count } = await supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published');
            blogCount = count || 0;
        } catch (e) {}
    }
    return {
        static_pages: STATIC_PAGES.length,
        blog_posts: blogCount,
        total_urls: STATIC_PAGES.length + blogCount,
    };
}

module.exports = { generateSitemap, getSitemapStats, STATIC_PAGES };
