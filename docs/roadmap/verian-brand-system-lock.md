# Verian Brand System Lock

**Status:** LOCKED  
**Effective from:** Phase 3X  
**Supersedes:** Phase 3W Slice 3 temporary logo treatment  
**All Claude and Codex prompts must reference this document for brand decisions.**

---

## 1. Official Logo Requirement

The **official Verian logo** is the only permitted branding asset.

- The temporary `public/brand/logo-mark.svg` introduced in Phase 3W Slice 3 must be replaced by the official Verian logo asset in the next branding correction slice (Phase 3X Slice 1).
- Do **not** recreate the logo.
- Do **not** generate substitute logos or approximations.
- Do **not** alter the logo geometry or letterforms.
- Preserve official logo proportions exactly.
- Maintain clear space around the logo on all sides.

Until the official asset file is delivered by the operator and committed to the repository, do **not** reference a non-existent official file. Placeholder code that imports the official asset path is acceptable in the implementation slice, provided the asset delivery is noted as a prerequisite.

---

## 2. Approved Color Palette

| Role | Name | Hex |
|------|------|-----|
| Dominant brand | Deep Navy | `#1D2B4B` |
| Primary actions | Verian Teal | `#3098A7` |
| Success / growth / intelligence | Sage Green | `#9FC898` |
| Page background | Background | `#F4F7F6` |
| Primary text | Dark Text | `#243041` |
| Secondary text / labels | Secondary Text | `#6B7280` |

All UI tokens (`--sidebar`, `--primary`, `--background`, etc.) must map to this palette. The current `oklch(0.22 0.04 248)` sidebar token approximates Deep Navy and should be replaced with exact `#1D2B4B` (oklch-converted) during the brand correction slice.

---

## 3. Design Philosophy

Verian BIOS is a **premium enterprise business intelligence platform** for operators and owners.

Every screen must feel like:

> "An executive-grade business intelligence platform built for operators and owners."

Reference design quality bars:
- **Spacing:** Apple-quality — generous, intentional whitespace
- **Simplicity:** Stripe-quality — no visual noise, clear hierarchy
- **Dashboards:** Ramp-quality — data-forward, scannable, professional

### Principles

1. **Information hierarchy first.** The most important data is always the most visually prominent.
2. **Minimal clutter.** Fewer elements, more meaning.
3. **Professional executive appearance.** No toys, no playfulness, no cuteness.
4. **Deep Navy dominant.** The primary brand color anchors the chrome.
5. **Teal for action.** Buttons, links, interactive elements, CTAs.
6. **Sage Green for signal.** Success states, growth metrics, positive trends, intelligence indicators.

### Prohibited visual patterns

- Bright neon colors
- Generic SaaS gradients
- Excessive rounded corners (prefer subtle, consistent radius)
- Visual clutter or decorative elements without information value
- Heavy shadows or neumorphic effects
- Multiple competing accent colors on a single screen

---

## 4. Logo Usage Rules

| Context | Rule |
|---------|------|
| Sidebar/navbar | Official logo; maintain clear space; use on Deep Navy background |
| Login page | Official logo; centered; on light or navy background |
| Reports (PDF, exported documents) | Official logo in header; maintain proportions |
| Executive exports | Official logo; professional document header |
| Favicon/app icon | Derived from official logo; do not invent an alternate mark |
| Email templates | Official logo in email header |

**Never:**
- Resize the logo disproportionately
- Apply color filters, gradients, or effects to the logo
- Place the logo on a background without sufficient contrast
- Use the Phase 3W Slice 3 `logo-mark.svg` SVG polygon approximation in any forward-facing context after the brand correction slice ships

---

## 5. Application Screen Branding Rules

- Sidebar chrome: Deep Navy background (`#1D2B4B`), near-white text, Teal accent for active nav items
- Top header/navbar: consistent with sidebar treatment or clean white with navy logo
- Page backgrounds: `#F4F7F6` (Background) or white — never dark content areas
- Primary buttons: Verian Teal (`#3098A7`) fill, white label
- Success/positive indicators: Sage Green (`#9FC898`)
- Destructive/error states: standard red (`#DC2626` / Tailwind `red-600`)
- Card borders: subtle gray (`#E5E7EB` / Tailwind `gray-200`)
- All status badges must use the approved color differentiation pattern (teal/active, blue/prospect, red/churned, gray/default)

---

## 6. Dashboard Branding Rules

- Metric cards: white background, Deep Navy text for primary values, Secondary Text (`#6B7280`) for labels
- Trend indicators (positive): Sage Green
- Trend indicators (negative): red
- Chart accent colors: Teal primary, Sage secondary, Navy tertiary — no arbitrary rainbow palettes
- Table headers: `#F4F7F6` background, `#6B7280` text
- Empty states: centered, minimal, no illustrations unless operator-approved

---

## 7. Report / PDF / Export Branding Rules

- Every exported document (PDF, CSV header, executive summary) must include the official Verian logo
- Document header: logo left-aligned, document title right-aligned, date/workspace info below
- Body: Dark Text (`#243041`) on white
- Section dividers: light gray rule
- Data highlights: Teal or Sage Green — never arbitrary colors
- Footer: Verian branding, page number, workspace name
- Font stack: system sans-serif (Inter or equivalent); no decorative fonts

---

## 8. Explicit Transition Note: Slice 3 Temporary Asset

Phase 3W Slice 3 introduced `public/brand/logo-mark.svg` as a temporary teal polygon V letterform. This asset:

- Was explicitly marked temporary in the Slice 3 plan
- Does **not** represent the official Verian logo
- **Must be replaced** in Phase 3X Slice 1 (Brand Correction & Product Usability Acceleration Bundle)
- Should not be referenced in any new UI work after Phase 3X Slice 1 ships

The replacement must use the official Verian logo asset delivered by the operator.

---

## 9. Claude / Codex Reference Requirement

All future implementation prompts and Codex review prompts must include:

> "Brand: follow `docs/roadmap/verian-brand-system-lock.md`. Use official Verian logo only. Deep Navy `#1D2B4B` dominant. Teal `#3098A7` for actions. Sage Green `#9FC898` for success/intelligence. No substitute logos. No neon colors. No SaaS gradients."

Codex must reject any implementation slice that:
- Introduces a non-official logo asset
- Applies colors outside the approved palette without operator authorization
- Violates the logo usage rules above
