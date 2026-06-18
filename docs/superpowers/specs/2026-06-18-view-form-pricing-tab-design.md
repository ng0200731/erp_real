# Pricing Mini-Tab in Quotation/Outsourcing View Form — Design

**Date:** 2026-06-18
**Status:** Approved (pending spec review)
**Scope:** `public/index.html` only — no backend changes.

## Problem

The quotation create form (`generateQuotationContent`, ~19057) renders a full pricing area: a `#pricingModeSelect` dropdown (`none`/`brand`/`factory`), brand/garment-factory tier-table pickers, a flat Quantity/Unit/Total section, and an editable tier grid. A saved quotation stores its pricing in `productDetails.pricing = { tierScopeMode, brandTierTableId?, customerTierTableId?, tiers }`.

The quotation/outsourcing **view** form (`generateQuotationContentForView`, ~18884) — shared by both quotation and outsourcing views via `viewQuotationDetails` (~16619) — renders **only** a static flat "Quantity & Pricing" block. It cannot display or edit:

- the pricing mode that was used,
- which tier table was selected, or
- the saved tier rows.

So tier-saved quotations are effectively blind in the view form: the user sees three flat fields and none of the tier context.

## Goal

Make the view form's pricing area fully editable in-place, mirroring the create flow's pricing controls — while keeping the view form's existing **single-scroll** layout (no mini-tab buttons). In read-only **view** mode the saved pricing is displayed (mode + fetched tier-table name + tier rows); in **edit** mode (the existing inline-edit flow) the user can change mode, re-pick a tier table, and edit tier rows, and the change persists through the **existing, unchanged** save path.

## Key findings (why this is low-risk)

1. `saveInlineQuotationEdit` (~17050) **already calls** `collectProductDetailsFromForm(editProductType)` at ~17114, and `collectProductDetailsFromForm` (~19414 region) **already collects** the new `pricing` shape (`tierScopeMode`/tiers) for all 8 product types.
2. `getActiveQuotationContainer()` (~17765) **already returns `quotationViewFormContainer` first** when the view modal is open — so `collectProductDetailsFromForm` reads from the view form during inline edit, not the create panels behind the modal.
3. `initPricingMode(scope)` (~19415) is **scope-aware** and operates purely on element IDs (`#pricingModeSelect`, `#flatPricingSection`, `#tierPricingSection`, `#tierRows`, `#brandTierTableSelect`, `#customerTierTableSelect`). It will work on the view container unchanged once those elements exist there.
4. The only missing piece is **rendering** the controls in `generateQuotationContentForView`, plus two small seeding/population helpers. No new save logic, no backend, no API changes.

## Design

### HTML changes — `generateQuotationContentForView` (single-scroll inline)

Replace the existing standalone "Quantity & Pricing" block (~18976-18992) with an expanded inline section that mirrors the create flow's pricing *contents* **without** the mini-tab buttons or `#miniTabDetails`/`#miniTabPricing` wrappers:

```
Quantity & Pricing
├─ Pricing Mode:  [ None (flat) ▾ ]            ← #pricingModeSelect
├─ Brand tier table: [ Select… ▾ ]              ← #brandTierWrap / #brandTierTableSelect  (display:none unless mode=brand)
├─ Garment-factory tier table: [ Select… ▾ ]    ← #customerTierWrap / #customerTierTableSelect (display:none unless mode=factory)
├─ [ Quantity ] [ Unit Price ] [ Total ]        ← #flatPricingSection (always visible; current fields, unchanged IDs)
└─ Tiers grid (qty/unit/total per row + Add)    ← #tierPricingSection / #tierRows / #addTierRowBtn (display:none unless mode=brand/factory)
```

Constraints:

- **No mini-tab buttons.** `initMiniQuotationTabs` is NOT used. The view form stays single-scroll.
- Flat fields keep their existing IDs (`#quotationQuantity` / `#quotationUnitPrice` / `#quotationTotal`) and move into `#flatPricingSection`. No duplicate IDs anywhere in the form.
- The picker and grid markup match the create flow byte-for-byte so `initPricingMode` behaves identically.

### View mode — read-only display (`populateViewPricing(quotation, viewContainer)`)

Runs after the modal HTML is injected in `viewQuotationDetails`. It renders static read-only markup directly and does **not** call `initPricingMode` (which attaches live handlers — unwanted while locked):

- Reads `quotation.productDetails.pricing` (absent on old quotations).
- **`tierScopeMode === 'none'` or no pricing block:** leave flat fields pre-filled with `quantity`/`unitPrice`/`total` (today's behavior); `#pricingModeSelect` disabled and showing "None"; `#tierPricingSection` hidden.
- **`tierScopeMode === 'brand'` or `'customer'`:**
  - `#pricingModeSelect` rendered **disabled**, set to the mode (saved `customer` shown as `factory`).
  - **Table name shown as a read-only text label** (e.g. *"Brand tier table: Spring 2026"*), NOT as a select — because the picker options are not populated until edit mode. The label is a dedicated element (e.g. `#viewTierTableLabel`) that edit mode hides. Name is fetched by saved ID: `GET /api/pricing-tier-tables/:id` → `.table.name`. One extra API call per quotation open. If the fetch fails (table deleted), render the label as *"Brand tier table: (table no longer available)"* and still show the tiers.
  - Tier grid rendered as **static readonly rows** from `pricing.tiers` (saved tiers are the source of truth — never re-fetch from the table). `#addTierRowBtn` and per-row Remove buttons are **not rendered** in view mode.
- All pricing controls render **disabled/readonly** in view mode, consistent with the rest of the view form.

### Edit mode — seeding (`seedPricingFromSaved(savedPricing, viewContainer)`)

Called from `enableInlineEdit`, after it enables fields (`enableInlineEdit` already flips `disabled=false`/`readOnly=false` on all `input,select,textarea` within the container at ~16852-16859):

1. Hide `#viewTierTableLabel` (view-mode name label) and reveal the live pickers.
2. `initPricingMode(viewContainer)` — wires the mode dropdown, pickers, tier-grid helpers (`addTierRow`, `syncBaseFromTiers`, `recalcRowTotal`, remove).
3. **Seed the saved selection** (must run after `initPricingMode`'s async picker population completes — see sequencing note):
   - Set the mode dropdown to the saved mode (`customer` → `factory`).
   - Populate the relevant picker by fetching tables for the current brand/customer (same filtered endpoint the create flow uses), then **pre-select** the saved `brandTierTableId` / `customerTierTableId`.
   - **Clear the grid and repopulate** tier rows from `pricing.tiers` as editable rows, so the user sees their saved tiers. (Do not call the picker's auto-load — saved tiers take precedence over the table's current breakpoints.)
4. The user may now switch mode, pick a different table (which loads that table's tiers via the existing `loadTierTableIntoGrid`), or hand-edit rows.

**Sequencing note (for the implementation plan):** `initPricingMode` ends by calling `populateModeOptions()` + the async `onModeChange()` (which fetches the picker list). `seedPricingFromSaved` must wait for that fetch before pre-selecting, OR seed the picker independently and set the mode after, to avoid a race that would leave the picker unselected or the grid double-populated. The plan should pick one approach explicitly.

### Save (unchanged)

On **Save Changes** → `saveInlineQuotationEdit` → `collectProductDetailsFromForm` (already invoked at ~17114) reads the `pricing` shape from the view container → `PUT /api/quotations/:id` persists it. The `factory`→`customer` mapping on save is already implemented in `collectProductDetailsFromForm`. **No change to this path.**

## Backward compatibility & edge cases

- **Old quotation (no `pricing` block):** view shows flat fields (today's behavior); edit defaults to "None" mode; user may switch to brand/factory if brand/customer are set.
- **Saved tier mode but brand/customer later removed:** view still shows saved tiers + the fetched table name (or "(table no longer available)") since tiers are stored, not derived; in edit mode the picker shows "(no tier table)" if no table matches the current filter — saved tiers remain editable in the grid.
- **`customer` ↔ `factory` mapping** preserved exactly as the create flow (UI `factory` ⇄ stored `customer`).
- **Outsourcing quotations:** identical treatment — same function, same container. Pricing is independent of product type; the `effectiveProductType` logic for product fields is unaffected.
- **Add/Remove buttons in view mode:** not rendered (view mode builds static readonly rows); they only appear once edit mode runs `initPricingMode`, which creates editable rows via `addTierRow`. No inert-button state to manage.

## Out of scope

- No mini-tab buttons (single-scroll preserved by decision).
- No new backend endpoints; no changes to `routes/quotations.js` or `routes/emails.js`.
- No changes to the create flow or the supplier-portal email flow.
- The send-to-supplier spinner bug and SMTP diagnosis are tracked separately (spinner cleanup already applied).

## Testing

Playwright (project's test tool — `npx playwright test … --project=chromium`, server on :5999). New file `tests/unit-pricing-view.spec.js`:

1. Seed a brand + brand-scoped tier table via API.
2. Create a quotation saved in `brand` tier mode with known tiers (via the create flow or a direct `POST`).
3. Open the quotation view → assert: mode label shows "Brand", the fetched tier-table name is rendered, and the saved tier rows appear as readonly rows with the expected quantities.
4. Click Edit → assert: `#pricingModeSelect`, the brand picker, and tier rows are enabled; the brand picker is pre-selected to the saved table.
5. Edit a tier unit price → Save Changes → re-fetch the quotation → assert `productDetails.pricing.tiers` reflects the edited unit price and `tierScopeMode` is unchanged.

A second test covers the backward-compat path: open an old quotation with no `pricing` block → view shows flat fields only; entering edit mode defaults to "None".

## Files touched

- `public/index.html`:
  - `generateQuotationContentForView` (~18884) — replace flat block with inline pricing section.
  - `viewQuotationDetails` (~16619) — call `populateViewPricing` after injecting HTML.
  - `enableInlineEdit` (~16820) — call `initPricingMode` + `seedPricingFromSaved` after enabling fields.
  - New helpers: `populateViewPricing(quotation, viewContainer)`, `seedPricingFromSaved(savedPricing, viewContainer)`.
- `tests/unit-pricing-view.spec.js` — new Playwright test.
