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
- [ ] Complete product enrichment in Admin until all products have images and ratings
- [ ] Verify all production cron jobs run reliably

**UX & Features**
- [ ] Rewrite homepage hero copy to communicate decision value, not just price comparison.
- [ ] Add rule-based verdict badges to product cards (e.g., `Best for Beginners`, `Budget Pick`, `High Speed`, `Good for ABS`, `Large Build Volume`, `Resin Detail`).
- [ ] Build basic compare feature: Allow users to select 2-3 products and compare them side by side.
- [ ] Build simple recommendation quiz: Ask about budget, use case, materials, experience, noise tolerance, and speed preference.

**SEO & Data Model**
- [ ] Add structured product summary blocks on every product page (Who it is for, Main strengths/weaknesses, Recommended materials, Best alternatives).
- [ ] Define canonical taxonomy for products (`printer_type`, `fdm_or_resin`, `beginner_score`, `speed_score`, `maintenance_score`, `material_support`, etc.).

---

## 🚀 Next (Feature Roadmap)

**Features**
- [ ] Build true cost calculator: Estimate total ownership cost using printer price, filament/resin cost, power consumption, failed prints, and maintenance.
- [ ] Build beginner setup builder / checklist: Show what else the buyer needs besides the printer.

**SEO & Data**
- [ ] Generate model-vs-model landing pages (e.g., "Bambu Lab A1 vs Elegoo Neptune 3").
- [ ] Create database schema for accessories and starter kits (`filaments`, `resins`, `tools`, `replacement parts`, `safety gear`, `enclosures`).
- [ ] Define recommendation engine rules (budget bands, experience level mapping, use-case mapping, material compatibility scoring).
- [ ] Create use-case pages (e.g., "Best 3D printer for beginners", "Best 3D printer for cosplay").

**UX & Trust**
- [ ] Add saved compare list: Persist selected products via `localStorage` first.
- [ ] Add methodology and scoring explanation pages (How products are ranked, How beginner score is calculated).

---

## 🏰 Later (Building the Moat)

**Compatibility & Ecosystem**
- [ ] Build filament compatibility explorer: Map printers to supported materials, difficulty level, required settings, and upgrade requirements.
- [ ] Build upgrade compatibility database: Track hotends, nozzles, beds, extruders, firmware notes, and compatible upgrade paths by printer model.
- [ ] Build printer-material-upgrade knowledge graph (This is the PCPartPicker compatibility engine equivalent).

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
