# Project Roadmap & Tasks (`TODO.md`)

This living document tracks our journey from being a simple affiliate catalog to a **PCPartPicker-style Decision Platform** for the 3D printing ecosystem.

---

## ✅ Done (Foundation)
- [x] Initial scraper engine (Search scraping + products DB insertion)
- [x] Detailed product scraper (`fetchProductDetails` for images, ratings, etc.)
- [x] Vercel cron setup (`/api/cron/scrape`)
- [x] Supabase database integration
- [x] Admin dashboard UI (`admin.html`)
- [x] Update Prices timeout fix (Chunked to 20 products per run to avoid Vercel 10s timeout, shows remaining count)
- [x] Auto-blog generator (GPT / Gemini via `/api/cron/blog`)
- [x] X (Twitter) auto-poster (OAuth 1.0a via `/api/cron/twitter`)
- [x] Project documentation foundation (`README.md`, `architecture.md`, `TEMPLATE.md`, `PROMPTS.md`)
- [x] Initial `PROJECT.md` vision document

---

## ⚡ Now (Immediate Priorities)

**Ops & Data**
- [ ] Add Vercel env variables for X integration (`X_API_KEY`, `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`)
- [ ] Test X auto-poster from Admin panel
- [x] Complete product enrichment in Admin (Backend API and UI are built, user just needs to run it)
- [ ] Verify all production cron jobs run reliably

**UX & Features**
- [x] Rewrite homepage hero copy to communicate decision value, not just price comparison.
- [x] Add rule-based verdict badges to product cards (e.g., `Best for Beginners`, `Budget Pick`, `High Speed`, `Good for ABS`, `Large Build Volume`, `Resin Detail`).
- [x] Build basic compare feature: Allow users to select 2-3 products and compare them side by side.
- [x] Build simple recommendation quiz: Ask about budget, use case, materials, experience, noise tolerance, and speed preference.

**SEO & Data Model**
- [x] Add structured product summary blocks on every product page (Who it is for, Main strengths/weaknesses, Recommended materials, Best alternatives).
- [x] Define canonical taxonomy for products (`printer_type`, `fdm_or_resin`, `beginner_score`, `speed_score`, `maintenance_score`, `material_support`, etc.).

---

## 🚀 Next (Feature Roadmap)

**Features**
- [x] Build true cost calculator: Estimate total ownership cost using printer price, filament/resin cost, power consumption, failed prints, and maintenance.
- [x] Build beginner setup builder / checklist: Show what else the buyer needs besides the printer.

**SEO & Data**
- [x] Generate model-vs-model landing pages (`compare.html`)
- [x] Create database schema for accessories and starter kits (tables: `starter_kits`, `starter_kit_items`, `material_compatibility`).
- [x] Product tagging system: 10 dimensions (technology, product_type, material, price_range, brand, rating_tier, use_case, accessory_type, deal, popularity). Auto-tags new products.
- [x] Define recommendation engine rules (`/api/recommendations`): 5-factor scoring — price fit 30%, rating 25%, experience 20%, use-case 15%, popularity 10%. Supports 5 budget bands, 4 experience levels, 9 use cases.
- [x] Create use-case pages (`best.html?type=beginners` etc).

**UX & Trust**
- [x] Add saved compare list: Persist selected products via `localStorage` first.
- [x] Add methodology and scoring explanation pages (`methodology.html`).
- [x] Recommended gear per printer: Dynamic API (`/api/products/:id/recommended-gear`) with essential + optional items.

---

## 🏰 Later (Building the Moat)

**Compatibility & Ecosystem**
- [x] Build filament compatibility explorer (`compatibility.html`): Browse by Material (11 types) or Browse by Printer.
- [x] Build upgrade compatibility database: 17 upgrades (hotends, nozzles, beds, extruders) mapped to 51 printers (537 entries). APIs: `/api/upgrades`, `/api/products/:id/upgrades`.
- [x] Build printer-material-upgrade knowledge graph: `compatibility_graph` table with 537 entries linking printers ↔ upgrades. API: `/api/compatibility-graph/:id`.

**Community & Retention**
- [ ] Add saved lists and price alerts (Start with localStorage, later add Auth + Email capture).
- [ ] Add owner notes / user-submitted settings (recommended slicer settings, common problems, successful materials).
- [ ] Add shared setup pages: Allow users to save and share a beginner / budget / cosplay / miniatures setup.
- [ ] Add print farm planner: Estimate economics for multiple printers and production use.
- [ ] Add email capture for watchlists and buyer guides.

---

## 🔧 Technical Debt / Maintenance

**Reliability & Ops**
- [ ] Reduce scraper fragility.
- [ ] Improve cron logging and run visibility.
- [ ] Add retry handling for failed product fetches.
- [ ] Show failed / skipped products in Admin Dashboard.

**Performance & SEO**
- [ ] Reduce loading-state first impression issues on homepage.
- [ ] Track data freshness timestamps for every product.
- [ ] Add confidence / completeness score for product records.
- [ ] Audit thin or low-differentiation programmatic pages regularly.

**Architecture (For Templating Future Sites)**
- [ ] Separate reusable template logic from niche-specific content.
- [ ] Create a niche-template config file (`site_name`, `product_category`, `taxonomy_labels`, `scoring_rules`, `blog_prompts`).
- [ ] Abstract category-specific logic away from scraper and UI.
- [ ] Define generic scoring framework and reusable compare-page generator.
