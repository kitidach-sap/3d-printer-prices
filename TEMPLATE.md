# Project Cloning Template

This document serves as a blueprint for cloning this Amazon Affiliate Aggregator architecture into a new niche (e.g., "Gaming Monitors", "Air Purifiers", "Mechanical Keyboards").

When opening a new AI chat to build a new site, provide the AI with `architecture.md` and this `TEMPLATE.md` file.

## Expected Setup Flow for a New Site

### 1. Identify the Niche & Keywords
- **Topic:** (e.g., Gaming Monitors)
- **Domain:** (e.g., gaming-monitor-prices.com)
- **Target Audience:** (e.g., Gamers, e-sports players, budget PC builders)

### 2. Update Search URLs in Backend
In `server.js` (specifically inside `runLightScrape` or the main scrape loop), update the Amazon search URLs to target the new niche.

**Example Change:**
```javascript
// Old (3D Printers)
const searchUrls = [
    'https://www.amazon.com/s?k=3d+printer',
    'https://www.amazon.com/s?k=resin+3d+printer'
];

// New (Gaming Monitors)
const searchUrls = [
    'https://www.amazon.com/s?k=gaming+monitor+144hz',
    'https://www.amazon.com/s?k=4k+gaming+monitor'
];
```

### 3. Update Branding & UI (Frontend)
Update the following files in `/public`:
- `index.html`: Change the `<title>`, header `<h1>`, and meta descriptions to fit the new niche.
- `style.css`: Adjust color CSS variables (e.g., `--primary`) to match the new brand identity.
- `admin.html`: Update the generic topics in the "Generate Blog" dropdown.
- `app.js`: Verify if any hardcoded filter categories (e.g., "Resin", "FDM") exist and replace them (e.g., "144Hz", "OLED", "Ultrawide").

### 4. Database Setup (Supabase)
Create a new Supabase project for the new niche. You can run the exact same SQL schema used in the original project to generate the `products`, `scrape_logs`, `blog_posts`, `x_posts`, and `settings` tables. (Ask the AI to read `architecture.md` for the schema definitions).

### 5. Environment Variables
In your Vercel project, set up the identical environment variables:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `ADMIN_KEY`
- `CRON_SECRET`
- `AMAZON_AFFILIATE_TAG` (Ensure you use a new tracking ID for the new site to track revenue properly)
- `SCRAPER_API_KEY`
- `X_API_KEY`, etc. (If doing Twitter auto-posting for the new brand)

### 6. Adjust AI Prompts (`PROMPTS.md`)
Update the system prompts used in `/api/cron/blog.js` and `/api/cron/twitter.js`. Tell the AI that it is now an expert in the new niche, not "3D Printers".

### 7. Initial Data Seed
Once deployed:
1. Hit the "Scrape Now" endpoint in the admin panel to populate initial ASINs.
2. Hit the "Update Prices" button repeatedly until all new products have their images and detailed ratings fetched.
