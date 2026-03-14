# AI Workflow for 3D Printer Prices

> **Version:** 1.0.0  
> **Purpose:** Safe, structured workflow for AI agents modifying this project.  
> **Scope:** All HTML, CSS, JS, and design system documentation.

---

## 1. Pre-Modification Checklist

Before making **any** changes, the AI agent must:

1. **Read the design system docs** — Always start by reading the relevant JSON docs in `docs/ui/`:
   - `DESIGN_SYSTEM.json` — Tokens, spacing, colors, typography, theme rules
   - `UI_RULES.json` — Core UI principles and interaction patterns
   - `CTA_SPEC.json` — Button hierarchy, CTA placement, and copy rules
   - `STATE_SYSTEM.json` — UI state categories and their required patterns
   - `TABLE_SYSTEM.json` — Data table structure and behavior rules
   - `FORM_SYSTEM.json` — Form structure, validation, and layout rules
   - `ARTICLE_SYSTEM.json` — Long-form content layout and typography rules
   - `CONTENT_SYSTEM.json` — Content writing guidelines
   - `ADMIN_UI_RULES.json` — Admin dashboard-specific rules

2. **Read the architecture files**:
   - `COMPONENT_MAP.json` — All components, their CSS selectors, states, and duplication risks
   - `PAGE_BLUEPRINTS.json` — Page structures, CTA hierarchy, component stacks

3. **Identify the scope** — Which pages and components are affected?

4. **Check for duplication risks** — Consult `COMPONENT_MAP.json > duplication_candidates` before adding new CSS.

5. **Never assume — always verify** — Read the actual source files before modifying.

---

## 2. Safe Modification Workflow

### Step 1: Understand Scope
```
For each file I plan to modify:
- [ ] Which component does it affect? (check COMPONENT_MAP.json)
- [ ] Which pages use this component? (check PAGE_BLUEPRINTS.json)
- [ ] What states does this component have? (check STATE_SYSTEM.json)
- [ ] Are there any duplication risks? (check COMPONENT_MAP.json)
```

### Step 2: Plan Changes
```
Before writing code:
- [ ] Document what will change and why
- [ ] Verify changes align with design system tokens (DESIGN_SYSTEM.json)
- [ ] Verify CTA hierarchy is preserved (CTA_SPEC.json)
- [ ] Verify state coverage is maintained (STATE_SYSTEM.json)
```

### Step 3: Implement
```
While writing code:
- [ ] Use ONLY design tokens (--sp-*, --text-*, --bg-*, --accent, etc.)
- [ ] Follow existing CSS naming patterns
- [ ] Preserve existing responsive breakpoints (600px, 768px, 850px, 900px)
- [ ] Never hardcode colors, spacing, or font sizes
- [ ] Maintain existing class naming conventions
```

### Step 4: Verify
```
After writing code:
- [ ] Visual check on all affected pages
- [ ] Test responsive behavior at 600px, 768px, 900px
- [ ] Test dark/light theme toggle
- [ ] Verify all states still work (loading, empty, error, success)
- [ ] Check accessibility (focus-visible, aria-labels, alt text)
```

### Step 5: Document
```
After verification:
- [ ] Update COMPONENT_MAP.json if new components were added
- [ ] Update PAGE_BLUEPRINTS.json if page structure changed
- [ ] Note any new duplication risks
```

---

## 3. CSS Modification Rules

### Token Usage — MANDATORY
| Category | MUST USE | NEVER USE |
|----------|----------|-----------|
| **Spacing** | `var(--sp-1)` to `var(--sp-16)` | Raw `px`/`rem` values |
| **Colors** | `var(--bg-*)`, `var(--text-*)`, `var(--accent)`, etc. | Hex codes, `rgb()`, `hsl()` |
| **Typography** | `var(--text-xs)` to `var(--text-3xl)` | Arbitrary font sizes |
| **Borders** | `var(--border)` | `#ccc`, `rgba(...)` |
| **Radius** | `var(--radius)`, `var(--radius-sm)` | Arbitrary radius values |
| **Shadows** | `var(--shadow)` | Custom box-shadow (unless truly unique) |

### Breakpoint Reference
- **Mobile:** `@media (max-width: 600px)`
- **Tablet:** `@media (max-width: 768px)`, `@media (max-width: 900px)`
- **Desktop-only content:** `@media (min-width: 768px)`, `@media (min-width: 850px)`

### Class Naming Conventions
- **Layout:** `.main-layout`, `.admin-wrap`, `.calc-container`, `.compat-container`
- **Components:** `.rank-card`, `.material-card`, `.top-pick-card`, `.admin-card`
- **Modifiers:** `.active`, `.open`, `.visible`, `.disabled`
- **Utilities:** `.sr-only`, `.mobile-only`, `.desktop-only`, `.w-full`, `.text-danger`
- **Admin-specific:** `.admin-*` prefix
- **Article-specific:** `.article-*` prefix

---

## 4. Button System Rules

### Hierarchy (NEVER violate)
1. **Primary** (`.btn-primary`) — Maximum 1 per visible area
2. **Secondary** (`.btn-secondary`) — Supporting actions
3. **Tertiary** (`.btn-tertiary`) — Low-emphasis actions
4. **Semantic** (`.btn-success`, `.btn-warning`, `.btn-danger`) — Admin only

### Sizes
- `.btn-sm` (32px) — Table actions, compact contexts
- `.btn-md` (40px) — Default, most buttons
- `.btn-lg` (48px) — Hero CTAs, prominent actions

---

## 5. State Management Rules

Every dynamic component MUST handle these states as applicable:

| State | CSS Pattern | When |
|-------|------------|------|
| **Loading** | `.skeleton` / `.skeleton-box` shimmer | Data fetching |
| **Empty** | `.empty-state` with icon + message + CTA | No data |
| **Error** | Red border + descriptive message | Validation/API failure |
| **Success** | Green text/badge + brief message | Completed action |
| **Disabled** | `opacity: 0.5; cursor: not-allowed; pointer-events: none` | Not available |

---

## 6. Form Rules

| Rule | Details |
|------|---------|
| **Labels** | Every input MUST have a visible label OR `aria-label` |
| **Validation** | Use `:invalid` state + descriptive error text |
| **Focus** | All inputs must show `border-color: var(--accent)` on focus |
| **Grouping** | Related fields grouped with `.form-row` (2-col grid) |
| **Admin density** | Use `.form-group` + `.form-input` (smaller, denser) |
| **Calculator** | Use `.input-group` + standard inputs (larger, spacious) |

---

## 7. Table Rules

| Rule | Details |
|------|---------|
| **Public tables** | Use `.table-container` + standard `table` + `thead th.sortable` |
| **Admin tables** | Use `.admin-table-wrapper` + `.admin-table` |
| **Headers** | Sticky, uppercase, muted color, with 2px bottom border |
| **Rows** | Hover highlight, 1px bottom border |
| **Actions** | Right-aligned in `.actions-cell` with `.btn-sm` |
| **Sorting** | Column headers with `.sortable` class, highlighted on hover |

---

## 8. Accessibility Baseline

### Focus States
- All interactive elements use global `:focus-visible` rule (defined in style.css lines 87-100)
- Focus ring: `outline: 2px solid var(--accent); outline-offset: 2px`

### ARIA Requirements
- All inputs: `aria-label` if no visible `<label>`
- Toggle buttons: `aria-pressed="true/false"`
- Modals: `aria-modal="true"`, focus trap
- Images: meaningful `alt` text

### Keyboard Navigation
- Tabs: Left/Right arrow navigation
- Enter/Space: activate selected tab/button
- Escape: close modals/overlays
- Focus must stay inside modal while open

---

## 9. Theme Support

Both dark and light themes are supported via `data-theme` attribute:
- **Dark (default):** No attribute or `data-theme="dark"`
- **Light:** `data-theme="light"`

### Rules
- Never hardcode colors — always use CSS custom properties
- Test every change in BOTH themes
- Use `[data-theme="dark"]` or `[data-theme="light"]` for theme-specific overrides

---

## 10. Page Type Quick Reference

| Page Type | Template Pattern | Required Components |
|-----------|-----------------|---------------------|
| **Public** | Header + Hero/Content + Footer | SiteHeader, MobileNav, SiteFooter |
| **Comparison** | Header + Breadcrumb + Table + Footer | + PageBreadcrumb, PageTitleSection |
| **Ranking** | Header + Breadcrumb + Cards + Footer | + RankingCard |
| **Utility** | Header + Calculator/Checker + Footer | + SegmentedControl |
| **Article/Legal** | Header + ArticleWrapper + Footer | + ArticleWrapper |
| **Blog** | Header + Cards/Article + Footer | + BlogCard or ArticleWrapper |
| **Admin** | LoginOverlay + Header + Tabs + Footer | + AdminTabs, AdminCard, AdminDataTable |

---

## 11. File Dependency Map

```
style.css (2868 lines) ← ALL pages depend on this
├── Tokens & Reset (lines 1-100)
├── Navigation & Header (lines 100-270)
├── Footer (lines 270-300)
├── Breadcrumb & Page Title (lines 300-345)
├── Hero Section (lines 415-515)
├── Quick Filter Chips (lines 525-585)
├── Main Layout & Sidebar (lines 585-680)
├── Button System (lines 685-770)
├── Data Table (lines 805-970)
├── Pagination (lines 975-990)
├── Ads (lines 990-1025)
├── Policy Pages (lines 1050-1080)
├── Responsive Tablet/Mobile (lines 1085-1330)
├── AI Badges (lines 1330-1370)
├── Quiz Modal (lines 1395-1525)
├── Compare Tray (lines 1525-1650)
├── Skeleton Loaders (lines 1650-1665)
├── Empty States (lines 1665-1695)
├── Ranking Cards (lines 1750-1900)
├── Top Picks (lines 1900-1960)
├── Calculator (lines 1960-2160)
├── Compatibility (lines 2160-2320)
├── Admin Dashboard (lines 2320-2470)
├── Advanced Rules (lines 2500-2630)
├── Article Content (lines 2535-2660)
├── Admin Forms/Login/Progress (lines 2675-2870)
└── blog/blog.css ← blog index page only
```

---

## 12. Anti-Patterns to Avoid

| ❌ Anti-Pattern | ✅ Correct Approach |
|----------------|---------------------|
| Hardcoded `#hex` colors | Use `var(--accent)`, `var(--success)`, etc. |
| Inline styles in HTML | Add CSS classes in style.css |
| Creating duplicate `.btn` rules | Extend existing button system |
| Adding new CSS at random location | Place in correct section by component |
| Changing tokens without checking all pages | Token changes affect ALL pages |
| Skipping empty/loading/error states | Every dynamic component needs state coverage |
| Adding new breakpoints | Use existing 600px / 768px / 900px |
| Placeholder-only labels | Always add visible label or aria-label |
| Huge inline scripts | Extract to dedicated JS file |
| Decorating admin UI | Admin favors density and clarity over decoration |

---

## 13. Emergency Rollback Rules

If a change breaks multiple pages:

1. **Stop immediately** — Do not apply further changes
2. **Check COMPONENT_MAP.json** — Identify which component was affected and all pages using it
3. **Revert the specific change** — Do not try to "fix forward" with more modifications
4. **Re-verify** — Test all affected pages listed in PAGE_BLUEPRINTS.json
5. **Document** — Note what went wrong and update architecture docs if a gap is found
