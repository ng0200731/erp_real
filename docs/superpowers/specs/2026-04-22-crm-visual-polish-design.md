---
name: CRM Visual Polish - Minimal & Clean
description: Systematic CSS polish for monochrome, professional look across all CRM pages
type: project
---

## Summary

Apply systematic visual polish to the CRM application using a Minimal & Clean style approach. The goal is a professional, cohesive monochrome aesthetic with soft borders, subtle shadows, and smooth interactions.

## Style Direction

**Minimal & Clean (Apple-inspired):**
- Keep strict monochrome palette (black/white/gray)
- Soften harsh borders from `#000` to `#e0e0e0`
- Add subtle shadows for depth instead of hard borders
- Unified border-radius across all elements
- Smooth, consistent hover/active transitions

## Design Tokens (CSS Variables)

Add these at the top of each `<style>` block:

```css
:root {
  /* Borders */
  --border-light: #e8e8e8;
  --border: #e0e0e0;
  --border-dark: #d0d0d0;

  /* Backgrounds */
  --bg-white: #fff;
  --bg-subtle: #fafafa;
  --bg-muted: #f5f5f5;

  /* Radius */
  --radius-sm: 4px;   /* inputs, badges, small buttons */
  --radius-md: 6px;   /* buttons, cards, dropdowns */
  --radius-lg: 8px;   /* modals, panels, containers */

  /* Shadows */
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.06);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.12);
  --shadow-focus: 0 0 0 3px rgba(0,0,0,0.08);

  /* Transitions */
  --transition: 0.2s ease;

  /* Z-index scale */
  --z-dropdown: 10;
  --z-sticky: 20;
  --z-modal: 30;
  --z-overlay: 40;
  --z-toast: 50;
}
```

## Changes by Element Type

### 1. Inputs & Textareas
- Border: `1px solid var(--border)` (was `1px solid #000`)
- Border-radius: `var(--radius-sm)` (was `0`)
- Focus: `border-color: #000; box-shadow: var(--shadow-focus)`
- Background: `var(--bg-white)` on subtle backgrounds

### 2. Buttons
- Primary (black): Keep `#000` background, add `var(--radius-md)`
- Secondary: Border `1px solid var(--border)`, radius `var(--radius-md)`
- Hover: Add `var(--transition)` to all, consistent background shift
- Active: Add pressed state (slightly darker or transform scale 0.98)

### 3. Cards & Panels
- Border: `1px solid var(--border)` (was harsh `#000` or none)
- Border-radius: `var(--radius-lg)`
- Shadow: `var(--shadow-sm)` for elevated cards
- Background: `var(--bg-white)` when on gray backgrounds

### 4. Modals & Overlays
- Border-radius: `var(--radius-lg)` (was `0`)
- Shadow: `var(--shadow-lg)` (was inconsistent heavy shadows)
- Remove hard border, use shadow for separation

### 5. Dropdown Menus
- Border-radius: `var(--radius-md)`
- Shadow: `var(--shadow-md)` (was no shadow, flat appearance)
- Border: `1px solid var(--border)`
- Hover items: Consistent background transition

### 6. Lists (email list, customer list, etc.)
- Border: `1px solid var(--border)` on container
- Item border-bottom: `1px solid var(--border-light)`
- Hover: Smooth background transition `var(--transition)`
- Container radius: `var(--radius-lg)` when standalone

### 7. Dashboard Quadrants
- Border: Keep grid separator as `1px solid var(--border-dark)`
- Radius: `0` is fine for grid layout
- Hover background: Keep subtle, add transition

### 8. Status Badges
- Border-radius: `var(--radius-sm)` (was inconsistent `0` or inline)
- Padding: Consistent `4px 8px`
- Font: `10-11px`, uppercase, letter-spacing `0.1em`

### 9. Sidebar
- Border-right: `1px solid var(--border)` (was `#000`)
- Keep expand animation, add transition to hover states

### 10. Tables
- Header border: `1px solid var(--border)`
- Row border: `1px solid var(--border-light)`
- Container radius when standalone: `var(--radius-lg)`

## Files to Modify

1. **`public/index.html`** — Main CRM (largest file, most changes)
2. **`public/supplier-portal.html`** — Supplier portal
3. **`public/supplier-sampling.html`** — Sampling interface

## Z-index Normalization

Current chaotic values: 50, 100, 1000, 9999, 10002

Normalize to:
- Dropdowns: `z-index: 10`
- Sticky headers: `z-index: 20`
- Modals: `z-index: 30`
- Overlays/backdrops: `z-index: 40`
- Toasts/loading: `z-index: 50`

## Implementation Order

1. Add CSS variables at top of each file's `<style>` block
2. Update inputs/buttons (most visible, most frequent)
3. Update cards/panels/modals
4. Update dropdowns and lists
5. Normalize z-index values
6. Verify all hover states have transitions
7. Test across all three files

## What NOT to Change

- Keep the monochrome palette — no new accent colors
- Keep existing layout structure (flexbox, grid)
- Keep font family and sizing scale
- Don't add animations beyond hover/active transitions
- Don't refactor inline styles to external CSS file (scope is polish only)

## Success Criteria

- All inputs have consistent border-radius and focus states
- All buttons have smooth hover/active feedback
- All cards/modals have soft shadows instead of hard borders
- All dropdowns feel elevated (not flat)
- Visual hierarchy is clear without harsh borders
- Consistent transitions across all interactive elements
- Z-index values are predictable and documented