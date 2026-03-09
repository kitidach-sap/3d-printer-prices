# Project Tasks (`TODO.md`)

This file tracks what has been done, what is currently pending, and long-term features derived from our site analysis.

## ✅ Completed (Recent Setup)
- [x] Initial Scraper Engine (Search scraping & `products` DB insertion)
- [x] Detailed Product Scraper (`fetchProductDetails` for images, ratings, etc.)
- [x] Vercel Cron Setup (`/api/cron/scrape`)
- [x] Supabase Database Integration
- [x] Admin Dashboard UI (`admin.html`)
- [x] **"Update Prices"** fix: Chunked to 20 products per run to prevent Vercel 10s timeout. Added remaining count.
- [x] Auto-Blog Generator with GPT/Gemini (`/api/cron/blog`)
- [x] X (Twitter) Auto-Poster using OAuth 1.0a (`/api/cron/twitter`)
- [x] Knowledge Base documentation (`README.md`, `architecture.md`, `TEMPLATE.md`, `PROMPTS.md`)

## ⏳ Pending / Immediate Next Steps (To Do Now)
- [ ] **Vercel Env Variables:** User needs to add `X_API_KEY`, etc. to Vercel and test the Twitter auto-poster in the Admin panel.
- [ ] **Data Enrichment:** User needs to repeatedly click "Update Prices" in the Admin panel until all 130+ products have images and ratings (Remaining count reaches 0).

---

## 🚀 Phase 1: Quick Wins (Next 30 Days)
*Focus: Improve Homepage Value & Quick Comparisons*
- [ ] **Update Homepage Copywrighting:** Change the hero section from simple "compare prices" to a stronger value proposition (e.g., "Find the right 3D printer faster. Compare real prices, beginner-friendliness, and total setup cost").
- [ ] **Structured Product Summaries:** Add AI-generated or rule-based badges directly to product cards/tables (e.g., `Best for Beginners`, `High Speed`, `Resin Detail`).
- [ ] **Basic "Compare" Feature:** Add checkboxes to products, allowing users to select 2-3 models and view them side-by-side in a dedicated table.
- [ ] **Simple Recommendation Quiz:** A floating widget or top banner with 3-4 questions (Budget? Material? Experience?) that suggests the top 3 printers.

## 🛠️ Phase 2: Decision Tools (60-90 Days)
*Focus: Real utility that Amazon lacks*
- [ ] **True Cost Calculator:** A tool page that calculates total ownership cost (Printer Price + Filament + Power) over a year based on print volume.
- [ ] **Beginner Setup Builder / Checklist:** "What else do you need?" page showing recommended starter filament, tools, and accessories based on the chosen printer type.
- [ ] **Model-vs-Model Pages (Programmatic):** Generate comparison pages for highly searched head-to-head queries (e.g., "Bambu Lab A1 vs Elegoo Neptune 3").

## 📈 Phase 3: The Moat (3-6 Months)
*Focus: Deep ecosystem data*
- [ ] **Filament Compatibility Explorer:** Which printers work best with which filaments and what upgrades are needed (e.g., enclosures for ABS).
- [ ] **Upgrade Compatibility Database:** Tracking compatible hotends, physical upgrades, and firmwares for specific budget printers (Ender 3, Neptune).
- [ ] **Saved Lists / Price Alerts:** Allow users to save their "builds", watch specific printers for price drops (Needs user auth or localStorage + email capture).
