# All Product Types — Full Product Details on Every Route (Portal Parity) — Design

**Date:** 2026-06-23
**Status:** Approved direction — writing implementation plan
**Author:** eric + Claude
**Related:** `shared/quotationEmailHtml.js` (`generateQuotationDetailSectionsHtml`), `routes/supplier-portal.js`, `public/supplier-portal.html`.

## 1. Goal

Every product type must show **all** its saved product details on **every** communication route — email HTML, PDF, View Quotation, Compare Quotation, and the supplier-portal hyperlink — exactly the way **Printed Label** already does today. "Follow Printed Label" = route every surface through the one shared renderer that pulls every saved field from the DB, instead of each surface reimplementing the display.

## 2. Why Printed Label is the standard (the mechanism)

Printed Label looks complete everywhere for one reason only: the email, PDF, View modal, and Compare popup all render product detail through a **single shared, type-agnostic function** — `generateQuotationDetailSectionsHtml(quotation, opts)` in [shared/quotationEmailHtml.js](../../../shared/quotationEmailHtml.js). That function emits four sections:

1. **Product Information** — Product Type (decoded), Variable (YES/NO)
2. **Customer Information** — Customer Name, Contact Person, Email, Phone
3. **Brand Detail** — Brand Name
4. **Product Specifications** — Customer Item Name, Height (mm), Width (mm), product image, then every filled key in `productDetails` (option codes decoded to labels), skipping empties and internal tier-config keys.

It loops whatever is in `productDetails`, so it works identically for hang-tag, woven-label, printed-label, heat-transfer, silicon-patch, embroidery-patch, pu-patch, and "other". Verified against real DB rows: a filled PU Patch (#265) renders every one of its fields (Material, Thickness, Screen Print, Hot Press, Edge, Metal Embedded) with the same completeness as a filled Printed Label (#250).

## 3. The gap — the supplier portal only

| Route | Uses shared renderer? | Shows full detail? |
|---|---|---|
| Email (invitation / reminder / confirmation / sampling / customer) | ✅ | ✅ |
| PDF | ✅ (own `renderSection` mirroring the same 4 sections) | ✅ |
| View Quotation modal | ✅ (`<h4>` sections; `effectiveProductType` resolves outsource→tag) | ✅ |
| Compare Quotation popup | ✅ | ✅ |
| **Supplier portal hyperlink** | ❌ own `renderProductDetails()` | ❌ |

The portal ([public/supplier-portal.html](../../../public/supplier-portal.html)) has a standalone `renderProductDetails()` that prints a flat list of info-rows and omits the Variable, Contact Person, Email, Phone, and Brand fields. Its `GET /:token` payload ([routes/supplier-portal.js:558-580](../../../routes/supplier-portal.js#L558-L580)) doesn't even carry those fields. That is the sole route that diverges from the Printed-Label standard.

## 4. Change

### 4a. Backend — `routes/supplier-portal.js` (`GET /:token`)

The route already does `SELECT *`, so the full quotation row (including `contactPerson`, `email`, `phone`, `variable`, `brandId`) is in hand. Before `res.json`, mirror the existing sampling-endpoint pattern ([routes/supplier-portal.js:426-440](../../../routes/supplier-portal.js#L426-L440)):

1. Resolve `brandName` — one query: `SELECT name FROM brands WHERE id = ?` (fallback `'N/A'`).
2. `profileImageSrc = quotation.hasProfileImage ? \`/api/quotations/${quotation.id}/profile-image\` : null` (the URL the portal already loads today; the route is auth-free like all internal routes).
3. `detailSectionsHtml = generateQuotationDetailSectionsHtml(quotation, { brandName, profileImageSrc })` — the import is already present on [line 8](../../../routes/supplier-portal.js#L8).
4. Add `detailSectionsHtml` to the JSON response.

No payload-field additions are needed — the shared function reads everything off the full row.

### 4b. Frontend — `public/supplier-portal.html`

Replace the hand-rolled "Quotation Details" block with a single injection point:

```html
<div class="info-section">
  <h2>Quotation Details</h2>
  <div id="detailSections"></div>            <!-- = data.detailSectionsHtml -->
  <div class="info-row" id="notesRow" style="display:none;">…Notes…</div>
</div>
```

Delete the now-dead pieces: `renderProductDetails()`, `formatProductType()`, the `detailLabels` map, the top `profileImageSection`, the `customerItemNameRow`, and the manual customer/productType rows + their populate calls. Keep the Notes row, the "already submitted" block, and the pricing form untouched.

Result: the portal renders the exact four sections the email/PDF/View/Compare do, for every product type.

## 5. Result

All five routes are consistent: every product type shows Product Information, Customer Information, Brand Detail, and Product Specifications (all filled fields). A quotation with empty spec values (e.g. #266) shows the sections that *are* populated (Product Type, Variable, full Customer Info, Brand, Customer Item Name, Remark) and omits blank specs — the same behavior Printed Label already has.

## 6. Out of scope (optional, separate changes)

- **`lastSampleCardDate` leak** — metadata keys like `lastSampleCardDate` are not in the internal-skip list (`INTERNAL_PRODUCT_DETAIL_KEYS`) and render as spec rows on every route. Could be suppressed by extending that list. Affects all types equally; not required for parity.
- **PU Patch field-storage normalization** — pu-patch nests `height_mm / width_mm / customerItemName` inside `productDetails` while every other type stores them at the quotation root. A display fallback already covers it (no visible difference), so this is data-hygiene only, not a parity requirement.

## 7. Testing — `tests/unit/11-supplier-portal-detail-sections.test.js` (new)

Mirrors the temp-DB + boot-app harness of `10-supplier-files-routes.test.js`. Asserts `GET /api/supplier-portal/:token` returns `detailSectionsHtml` containing the four section headers and the resolved brand name (and `'N/A'` when no brand). Optionally assert against a seeded PU Patch row that the pu-patch spec fields appear.

## 8. File touch list

| File | Change |
|---|---|
| `routes/supplier-portal.js` | In `GET /:token`: resolve brandName, build profileImageSrc, call `generateQuotationDetailSectionsHtml`, return `detailSectionsHtml`. |
| `public/supplier-portal.html` | Inject `detailSectionsHtml`; delete `renderProductDetails` / `formatProductType` / `detailLabels` / top image block / manual rows; keep Notes. |
| `tests/unit/11-supplier-portal-detail-sections.test.js` | new. |
