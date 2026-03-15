# Refactor Log

## 2026-03-16 — CSS Refactoring + Component Normalization + State Surface Hardening

### Phase 1: CSS Refactoring (Stages A–H)

Full CSS refactoring pass across `public/style.css` — removed orphaned rules, converted hardcoded values to design tokens, and consolidated duplicates.

| Stage | Description | Impact | Commit |
|-------|------------|--------|--------|
| A | Remove orphaned/duplicate CSS rules | −124 lines | `ba1e518` |
| B | Article/blog CSS tokenization (24 values) | 24 → tokens | `42f6f1a` |
| C | Product page CSS tokenization (20 values) | 20 → tokens | `d6aa0de` |
| D+E | Table/card/CTA/form tokenization (18 values) | 18 → tokens | `3a46f3b` |
| F+G | Ranking/discovery CSS tokenization (10 values) | 10 → tokens | `be9078b` |
| H | Admin + methodology CSS tokenization (15 values) | 15 → tokens | `9ff0a06` |

**Total: −157 lines removed, 80+ hardcoded values → design tokens, 6 commits**

---

### Phase 2: Component Normalization (Parts 1–5)

Post-refactor consistency pass — tokenized remaining sub-scale values and fixed a class mismatch bug.

| Part | Description | Commit |
|------|------------|--------|
| 1 | P1/P2 audit fixes: `.compare-item-remove` 14px → `var(--text-sm)`, footer mobile padding → `var(--sp-4)` | `93b6bcd` |
| 2 | Footer class mismatch: mobile override targeted `.footer` but HTML used `.site-footer` (dead code fix). Removed orphaned `.footer-links`. | `5704420` |
| 3 | Chip/filter spacing: 5 hardcoded gaps/padding → tokens | `542a50b` |
| 4 | Quiz component: 5 hardcoded values → tokens | `022e889` |
| 5 | Article font-size: 1.05rem → `var(--text-base)` | `03df209` |

**Total: 17 token replacements, 1 dead-code bug fix, 5 commits**

---

### Phase 3: State Surface Hardening (Batches 1–2)

Added proper error state UI to pages that previously masked API failures as empty states.

| Batch | Pages | Description | Commit |
|-------|-------|------------|--------|
| 1 | `compare.html`, `best.html` | Added `#error-state` div (reuses `.empty-state` class), `showError()` function. Catch blocks now call `showError()` instead of `showEmpty()`. Recovery CTAs: Browse Printers + Try Again. | `e90b043` |
| 2 | `product.html` | Normalized inline `showError()` to use `#error-state` div instead of replacing `#loader-wrapper` innerHTML. Same recovery CTAs. | `fb465a2` |

**Files changed:** `compare.html`, `compare.js`, `best.html`, `best.js`, `product.html`, `product.js`

**Architecture doc updated:** `STATE_FLOW_MAP.json` — error state entries for compare, best, and product pages now reflect new UI feedback and recovery transitions.

---

### Summary

| Phase | Commits | Lines Removed | Tokens Added | Bug Fixes |
|-------|---------|---------------|--------------|-----------|
| CSS Refactoring | 6 | 157 | 80+ | 0 |
| Component Normalization | 5 | 4 | 17 | 1 (footer mismatch) |
| State Surface Hardening | 2 | 2 | 0 | 3 (error masking) |
| **Total** | **13** | **163** | **97+** | **4** |

### Verification

All changes verified via browser testing:
- Empty states still work correctly
- Success paths render without regression
- Error states show contextual messages with recovery CTAs
- Loader hides before showing any state surface
- Theme support intact across all pages
