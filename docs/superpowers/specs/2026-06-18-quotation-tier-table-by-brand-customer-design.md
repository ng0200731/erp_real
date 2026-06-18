# Quotation Tier Table by Brand / Garment Factory — Design

**Date:** 2026-06-18
**Status:** Approved (brainstormed) — pending implementation plan
**Author:** eric + Claude

## 1. Goal

Let the internal user attach a **pricing tier table** to a quotation, where the
available tier tables are driven by the quotation's **brand** and **customer
(garment factory)**. The selected tier table is sent to the supplier inside the
quotation email; the supplier fills in their **unit cost at each quantity
breakpoint** via the supplier portal, and the filled-in response is linked back
to the quotation's **IP** (`quotationSeq`) or **OS** (`outsourcingSeq`) code.

## 2. Scope

Applies **identically** to all three quotation entry flows:

1. Email → Receive → click **View** → Quotation
2. **Quotation Create**
3. **Outsource**

…and to **all 8 product types**: Hang Tag, Woven Label, Heat Transfer,
Printed Label, Outsource, Silicon Patch, Embroidery Patch, PU Patch.

The feature lives in the existing **Quotation** mini-tab (`miniTabPricing`).
Today only PU Patch and the generic/Outsource product type collect a pricing
block; this design extends the same pricing block to the other 6 types.

## 3. Key decisions (from brainstorming)

| Topic | Decision |
|---|---|
| What the supplier fills | Unit **cost** per quantity breakpoint (tier table sent essentially blank) |
| Brand vs garment-factory table | Two different **quantity-break structures** — the brand's breakpoints vs the factory/customer's breakpoints |
| How tables are chosen | **Auto-show** the single matching table; a **filtered picker** appears only when a brand/factory has more than one tier table |
| Pricing mode dropdown | **Conditional**, based on the Product Details tab (see §5) — `none`, `brand`, `factory`. **No "both"** — one scope at a time |
| Supplier return path | **Portal link** in the email (reuses `supplier-portal.html`); submission auto-links to IP/OS |
| Product coverage | **All 8 types** |

## 4. Existing assets reused (no duplication)

- `pricing_tier_tables` (scope `brand` | `customer`) + `pricing_tier_table_rows`
  (`quantity`, `unitPrice`, `sortOrder`) — the tier breakpoint definitions.
- `brands` (`brandId`) and `customers` (`customerName` → resolved to
  `customerId` via `companyName`) — the link keys.
- `supplier_quotation_tokens` — token → `quotationId` → the quotation's
  `quotationSeq` (IP) / `outsourcingSeq` (OS). **The IP/OS link is already
  inherent** in the portal token.
- `supplier_quotation_responses` — supplier submissions (currently flat
  `unitPrice`/`totalPrice`/`deliveryDays`/`notes`); extended for tiers.
- `quotation_suppliers` — many-to-many quotation↔suppliers; multiple suppliers
  may respond, winner marked by `quotations.selectedSupplierResponseId`.
- The old unfiltered tier picker already loads from `/api/pricing-tier-tables`
  (`getAllPricingTierTables`); it is replaced by scope-aware, filtered pickers.

## 5. In-app UX (Quotation mini-tab)

### 5.1 Conditional pricing-mode dropdown

The dropdown options depend on what is filled in the **Product Details** tab:

| Product Details has… | Dropdown options |
|---|---|
| brand **and** customer (factory) | `none` · `brand` · `factory` (max 3) |
| only brand | `none` · `brand` |
| only customer (factory) | `none` · `factory` |
| neither | `none` (min 1) |

Options are based on **field presence** in Product Details, not on whether a
tier table exists. Selecting an option whose entity has **no** tier table shows
an empty state with a link to create one in the tier-table editor.

- Selecting **brand** → shows the brand quotation tier table.
- Selecting **factory** → shows the garment-factory (customer) quotation tier
  table.
- **One** tier table shows at a time. There is no simultaneous "both" view.

> **Label → value mapping:** the UI option **factory** maps to
> `tierScopeMode: 'customer'` (matching `pricing_tier_tables.scope`). So
> `tierScopeMode ∈ {'none', 'brand', 'customer'}`.

### 5.2 Selection behavior

- Exactly one matching table → **auto-shown**.
- Several matching tables → a small **filtered picker** appears; user chooses.
- Filter rules:
  - Brand picker: `pricing_tier_tables` where `scope='brand'`, `disabled=0`,
    `brandId = quotation.brandId`.
  - Factory picker: `scope='customer'`, `disabled=0`, customer resolved from
    `quotation.customerName` → `customers.id` by **case-insensitive**
    `companyName`; if multiple customers match the name, tables for all matches
    are listed.

### 5.3 Tier grid

- Quantities are loaded from the selected table's
  `pricing_tier_table_rows`, sorted by `sortOrder`.
- Grid stays editable (`+ Add Tier` / remove) so the user can tweak quantities
  without editing the master table.
- **Stale selection:** if the brand/customer is changed after a table was
  picked, the selection is flagged "⚠ no longer matches this brand/customer"
  and **kept** until the user clears it — never silently dropped.

### 5.4 Persistence

Collected by the existing `collectProductDetailsFromForm()` path, extended so
**every** product type spreads the pricing fields **FLAT at the `productDetails`
top level** (today only PU Patch and the generic/Outsource branch do). Stored
FLAT in `productDetails` (top-level JSON keys), matching the historical
`...pricing` spread convention — **not** nested under a `pricing` key:

```json
{
  "material": "...",
  "tierScopeMode": "none | brand | customer",
  "brandTierTableId": 12,
  "customerTierTableId": 7,
  "tiers": [{ "quantity": 1000, "unitPrice": 0 }, { "quantity": 5000, "unitPrice": 0 }]
}
```

Only one of `brandTierTableId` / `customerTierTableId` is active at a time
(the one matching `tierScopeMode`). `unitPrice` here is an optional internal
reference (typically `0`/blank); the supplier's actual cost is captured
**separately** on their response (§6.4), never overwritten by it.

### 5.5 Validation before send-to-supplier

If `tierScopeMode ≠ none`: at least one tier table selected and every visible
tier has `quantity > 0`. Flat mode keeps today's validation.

## 6. Supplier email + portal round-trip + IP/OS linking

### 6.1 Send to supplier (post-save, all 3 flows)

Once the quotation is saved (it now has its IP/OS code), the user picks
supplier(s) via the existing `selectedSuppliersList` and clicks **Send to
supplier**. This reuses the existing token-generation flow
(`routes/supplier-portal.js` `generate-and-notify`), which creates a
`supplier_quotation_tokens` row per supplier member. The only change is the
**email body**.

> **Planning TODO:** confirm the exact composer of the initial
> supplier-invitation email that carries the portal token link (candidates:
> `routes/supplier-portal.js` generate-and-notify, `routes/emails.js`, or the
> outsource send flow). That composer is where the tier table is injected.

### 6.2 Email body

- Today's content (product details, OS ref, sample-ready info, profile image) —
  unchanged.
- **NEW:** the selected tier table rendered as an **inline HTML table** — one
  row per quantity breakpoint, Unit Price column shown blank / `—`.
- A **portal button/link** carrying the token: "Click to fill in your prices".

Default is inline HTML + portal link (no Excel/PDF attachment). An Excel/PDF
copy of the blank tier table is an optional add-on if later requested.

### 6.3 Supplier portal fill page (`public/supplier-portal.html`)

The existing `GET /supplier-portal/:token` already returns the quotation and
parses `productDetails`. Branch on `productDetails.tierScopeMode`:

- **Tier mode (brand or factory):** render the tier grid with **quantities
  pre-filled (read-only)** and a blank **Unit Price** input per row, plus the
  existing Delivery Days + Notes. Supplier enters unit cost at each quantity →
  Submit.
- **None / flat:** today's flat form (`unitPrice`/`totalPrice`/`deliveryDays`/
  `notes`) — unchanged.

### 6.4 Submit + store

Extend `POST /supplier-portal/:token/submit` to accept an extra `tierPrices`
payload (`[{quantity, unitPrice}, …]`). Store in the new
`supplier_quotation_responses.tierPrices` JSON column (§7). The response row
already carries `quotationId`, so it is **automatically linked to the IP/OS
code** — no extra wiring. `sendSubmissionNotification` is extended to render
the filled tier prices in the internal notification email.

### 6.5 Internal view-back

`GET /supplier-portal/responses/:quotationId` already lists every supplier
response for a quotation; extend it to include `tierPrices`. On the quotation,
the user sees all supplier tier-pricing responses side by side and picks the
winner via the existing `selectedSupplierResponseId`. The IP/OS code is
displayed on each response so the linkage is visible.

> **Net effect on the "link to IP/OS" requirement:** structurally satisfied by
> the token → `quotationId` → `quotationSeq`/`outsourcingSeq` chain. We only
> surface the code on the response and notification; no new linking table.

## 7. Data model changes

### 7.1 Quotation pricing (FLAT JSON keys in `productDetails`)

Replace the current `{pricingMode, pricingTiers, selectedTierTemplateId}` shape
with the §5.4 shape (`tierScopeMode`, `brandTierTableId`,
`customerTierTableId`, `tiers`), stored **FLAT at the `productDetails` top
level — not nested under a `pricing` key**. This matches the existing
`collectProductDetailsFromForm()` `...pricing` spread convention. See §8 for
migration of existing values.

### 7.2 New column on `supplier_quotation_responses`

```sql
ALTER TABLE supplier_quotation_responses ADD COLUMN tierPrices TEXT;
-- JSON: [{ "quantity": 1000, "unitPrice": 0.42 }, ...]
```

Additive and safe; no backfill. Flat quotations keep using the existing
`unitPrice`/`totalPrice` columns; tier quotations populate `tierPrices`.

### 7.3 No new tables

Everything else reuses existing tables (`pricing_tier_tables`,
`pricing_tier_table_rows`, `supplier_quotation_tokens`,
`supplier_quotation_responses`, `quotation_suppliers`, `quotations`).

## 8. Migration & backward compatibility

**No runtime migration is performed.** The tier feature is brand-new, and real
quotation data has always stored pricing FLAT on `productDetails` (via the
`collectProductDetailsFromForm()` `...pricing` spread), so no nested
`productDetails.pricing` data ever existed to migrate. The on-read
`normalizePricingForRead()` shim prototyped in Phase 1 was a no-op on real data
and has been removed (see final review, C-1).

- The old `{pricingMode, pricingTiers, selectedTierTemplateId}` shape is
  superseded by the new FLAT keys (`tierScopeMode`, `tiers`, etc.). Any
  hypothetical legacy `pricingMode='tier'` quotation would simply be read as
  flat (mode `none`) and edited anew; none are known to exist.
- `supplier_quotation_responses.tierPrices` is additive (§7.2).
- Old `tierTemplateSelect` + Apply button UI removed; replaced by scope-aware
  pickers.
- All 8 product types get the pricing block; existing PU Patch + Outsource
  quotations keep working unchanged.

## 9. Edge cases & validation

- **Stale selection** — brand/customer changed after a table was picked → flag,
  keep until cleared (§5.3).
- **No tier table for this brand/factory** — empty state + "create one" link.
- **Shape mismatch** — portal submit validates against the quotation's
  `tierScopeMode`; rejects a flat payload on a tier quotation (and vice versa)
  with a clear error.
- **One response per token** (existing single-use pattern); to re-quote,
  generate a new token.
- **Multiple suppliers** — all responses stored; winner via
  `selectedSupplierResponseId`.
- **Before send-to-supplier** — if mode ≠ none, require ≥1 tier table selected
  and all quantities > 0 (§5.5).
- **Customer name → id** resolution is case-insensitive on `companyName`; if
  ambiguous, list tables for all matches.
- **Token expired** — portal shows the existing expired-message behavior.

## 10. Testing

### 10.1 Backend (unit/integration)

- Filtered tier-table lookup by brand; by customer (name → id, case-insensitive,
  ambiguous-name case).
- Supplier-invitation email body contains the tier rows (blank unit price).
- `POST /supplier-portal/:token/submit` accepts `tierPrices` for tier
  quotations; rejects a flat payload on a tier quotation and vice versa.
- `GET /supplier-portal/responses/:quotationId` returns `tierPrices` + the
  IP/OS code.
- No runtime migration of old `flat`/`tier` quotations (see §8 — the feature is
  brand-new and no legacy tier data exists).

### 10.2 E2E (Playwright — already in repo)

- Pricing-mode dropdown is conditional on Product Details (all 4 presence
  combos in §5.1).
- Auto-show single table; filtered picker when several.
- Full round-trip: send-to-supplier → email contains tier table → portal fill
  → response linked to IP/OS — across at least one IP flow and the OS flow.
- Pricing mini-tab visible on all 8 product types.

## 11. Files likely touched (confirmed during planning)

- `db/tasksDb.js` — schema migration (`supplier_quotation_responses.tierPrices`),
  filtered tier-table queries, migration of old pricing JSON.
- `routes/pricing-tier-tables.js` — filtered lookup (by `brandId`; by
  `customerId`/`customerName` + `scope`).
- `routes/supplier-portal.js` — portal GET branches on tier mode; submit
  accepts `tierPrices`; responses include `tierPrices` + IP/OS;
  `sendSubmissionNotification` renders tiers; initial invitation email body
  includes tier table.
- `routes/quotations.js` — save/load carries the new pricing shape.
- `public/index.html` — unified conditional pricing-mode dropdown, scope-aware
  pickers, tier grid; extend `collectProductDetailsFromForm()` to all 8 types;
  remove old `tierTemplateSelect`/Apply.
- `public/supplier-portal.html` — tier-fill view (quantities read-only, unit
  price inputs).

## 12. Out of scope / future

- A simultaneous "Both" mode (send brand + factory tables together) — explicitly
  dropped per §3; can be revisited.
- Excel/PDF attachment of the blank tier table in the email (optional add-on).
- Promoting the FLAT `productDetails` pricing keys from JSON to real columns on
  `quotations` (kept as JSON for now to match the existing pattern).
