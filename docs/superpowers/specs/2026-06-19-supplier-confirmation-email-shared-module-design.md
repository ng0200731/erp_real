# Supplier Confirmation Email — Rich Card + Tier Table (Shared HTML Module) — Design

**Date:** 2026-06-19
**Status:** Approved (brainstormed) — pending implementation plan
**Author:** eric + Claude
**Related:** [2026-06-18-quotation-tier-table-by-brand-customer-design.md](./2026-06-18-quotation-tier-table-by-brand-customer-design.md) (this design consumes the response-tier data that feature persists)

## 1. Goal

When a supplier submits a quotation through the supplier portal, the
**confirmation email** (sent to both the internal user and the supplier) should
contain the **full branded quotation card** — the same rich card the batch-send /
reply emails already produce — **plus the supplier's submitted per-tier pricing
table**. Today that confirmation is a minimal flat table and omits the tier
prices entirely, even though they were just saved to the database.

To get the rich card server-side without duplicating the client-side HTML
builder, the HTML-generation logic is extracted into a **single shared ES module**
imported by both the server and the browser. One source of truth, no drift.

## 2. Scope

- **In scope:** the supplier-portal submission confirmation email
  (`sendSubmissionNotification`); extracting the quotation-card HTML builder into
  a shared module; wiring the server to render the card + the supplier's response
  tiers; removing the now-duplicated inline definitions from `public/index.html`.
- **Out of scope (§13):** the outgoing supplier *invitation* / *reminder* emails
  (they already render request-tier tables and are not changed); QR codes on the
  server; PDF generation on the server; refactoring `generateSupplierPortalEmailHtml`
  / `generateSupplierReminderEmailHtml` internals.

## 3. Key decisions (from brainstorming)

| Topic | Decision |
|---|---|
| When the confirmation fires | **First submit only** — the portal already blocks re-submission ("Already submitted"), so the notification naturally fires once |
| What the email contains | **Full quotation card + supplier response tier table** (no PDF attachment) |
| How the rich HTML is reused server-side | **Shared ES module** imported by Node and the browser — no server-only copy |
| Browser refactor timing | **One PR, all four steps** — no window of live duplication |
| Tier table rendering | **Graceful** — shown only when the supplier submitted tiers (`sanitizedTiers` non-empty); flat-price submissions keep the existing Unit Price / Total Price rows and omit the table |
| QR code on server | **Skipped** — the browser uses a browser-only QR lib; a server QR needs the `qrcode` npm package. Out of scope here |
| Brand name source | **Passed in as a parameter** (`opts.brandName`) instead of read from the `cachedBrands` global — this is what decouples the module from the browser |
| Profile image embedding | Accept **either** a base64 data URL **or** a `cid:` reference via one `opts.profileImageSrc` value — server uses `cid`, browser uses the data URL |

## 4. Existing assets reused (no duplication)

- `generateQuotationEmailHtml` (`public/index.html:22255`) — the card renderer.
  Pure HTML-string builder, no DOM. Extracted verbatim into the shared module.
- Its pure helpers, all extracted verbatim:
  - `emailProductTypeDisplay` (`public/index.html:15363`)
  - `PRODUCT_DETAILS_LABELS` (`public/index.html:15376`)
  - `PRODUCT_OPTION_LABELS` (`public/index.html:15414`)
  - `resolveProductDetailValue` (`public/index.html:15458`)
  - `formatFileSize` (`public/index.html:14265`)
- The response-tier shape `{tierIndex, quantity, unitPrice, total}`, persisted by
  `createSupplierQuotationResponseTiers` (`db/tasksDb.js:2224`). Already built as
  `sanitizedTiers` in the submit handler (`routes/supplier-portal.js:544`) and in
  scope right before the notification call.
- `getQuotationProfileImage` (`db/tasksDb.js`) — already used by the notification
  to embed the product image via `cid` (`routes/supplier-portal.js:42`).
- The existing `cid`-attachment image embedding in `sendSubmissionNotification`
  (`routes/supplier-portal.js:43-50`) — kept as-is.
- `getBrandName` (`public/index.html:23968`) — browser-side brand-name resolver,
  used by the two card callers after the signature change.

## 5. Current state (the gap)

| Aspect | Batch-send / reply email (rich) | Supplier confirmation email (today) |
|---|---|---|
| Built where | Client-side, `generateQuotationEmailHtml` | Server-side, inline template (`routes/supplier-portal.js:56`) |
| Card structure | Full branded card (header, meta band, product/customer/brand/spec sections, image, notes) | Flat `<table>`, 8 rows |
| Tier pricing | n/a (it is a *request*) | **Missing** — tiers saved at `routes/supplier-portal.js:614` but never rendered |
| Product details | Type-specific specs decoded via `PRODUCT_OPTION_LABELS` | Raw `productType` string only |
| Brand name | Resolved from `cachedBrands` | Not shown |
| Single source of truth | Yes | No — bespoke HTML, no server equivalent |

The notification function is called at `routes/supplier-portal.js:628` with only
flat fields (`unitPrice, totalPrice, deliveryDays, notes`); the just-persisted
tiers are discarded from the call.

## 6. Architecture — shared module `shared/quotationEmailHtml.js`

Plain ES module. **No `window`, no `document`, no `cachedBrands`, no `fetch`.**
That purity is what lets the same file `import` in Node and load in the browser.

### 6.1 Exports — card vs document split

The current inline function returns a **full HTML document** (`<!DOCTYPE>` …
`</html>`). That is correct when the card *is* the whole email (batch-send /
reply), but the server confirmation email must **compose** the card together with
a confirmation block and the tier table inside **one** document. So the module
splits the concern into two functions:

```js
// Data maps (copied verbatim from index.html)
export const PRODUCT_DETAILS_LABELS = { /* material:'Material', size:'Size', ... */ };
export const PRODUCT_OPTION_LABELS  = { /* material:{paper:'Paper',...}, ... */ };

// Helpers (copied verbatim)
export function formatFileSize(bytes) { /* ... */ }
export function emailProductTypeDisplay(productType, productDetails) { /* ... */ }
export function resolveProductDetailValue(key, raw) { /* ... */ }

// The REUSABLE card — inner markup only (the <div class="quotation-container">…</div>
// block: header, meta band, attachment reminder, product/customer/brand/spec
// sections, image, notes). No <!DOCTYPE>/<html>/<head>/<body> shell.
// Both server and the document wrapper below call this.
export function generateQuotationCardHtml(quotation, opts) { /* ... */ }

// The full-document wrapper — used when the card IS the entire email body.
// Backward-compatible behavior for the two existing browser callers. Internally:
//   <!DOCTYPE html>…<body>${generateQuotationCardHtml(quotation, opts)}${replyQuote}</body></html>
export function generateQuotationEmailHtml(quotation, opts) { /* ... */ }

// NEW — the response-tier table for the confirmation email
export function generateSupplierResponseTiersHtml(tiers) { /* ... */ }
//   tiers = [{tierIndex, quantity, unitPrice, total}, ...]
//   Renders a "Supplier Quoted Pricing" section: Quantity | Unit Price | Total.
//   Returns '' when tiers is empty/absent (graceful omit).
```

`opts` is the same for both card and wrapper:

```js
opts = {
  brandName,            // string | undefined  (was: read from cachedBrands)
  profileImageSrc,      // data URL OR 'cid:...' (was: profileImageBase64 only)
  qrBase64,             // data URL | null     (browser only; server passes null)
  osRef,                // string
  attachmentList,       // [{filename, sizeBytes}] | []
  emailMeta,            // reply-quote metadata | null   (wrapper only)
  originalEmailHtml     // reply-quote body | null       (wrapper only)
}
```

`generateQuotationEmailHtml` is a thin wrapper around
`generateQuotationCardHtml` plus the existing reply-quote block — no duplicated
markup.

### 6.2 The two decoupling edits

The only behavioral changes to the card renderer versus today's inline version:

**Brand lookup** — parameter instead of global:

```js
// OLD (browser-only):
const brandObj = cachedBrands.find(b => b.id === quotation.brandId || String(b.id) === String(quotation.brandId));
const brandName = brandObj ? brandObj.name : 'N/A';

// NEW (parameter):
const brandName = opts.brandName || 'N/A';
```

**Profile image** — accept `cid:` or data URL:

```js
// OLD (data URL only):
const imageHtml = profileImageBase64 ? `<img src="${profileImageBase64}" ...>` : '';

// NEW (either form):
const imageHtml = opts.profileImageSrc ? `<img src="${opts.profileImageSrc}" ...>` : '';
```

**Layout styles inlined** — for email-client compatibility and composability:

The original card uses `<style>`-block classes (`.quotation-container`,
`.quotation-section`, `.quotation-section h3`, `.quotation-table`) for layout
(max-width, margins, table borders). Email clients often strip `<style>` tags
(Gmail, some Outlook), and the server composition wraps the card in a new
document where those class definitions would be absent. To make the card
self-contained, the shared module **inlines these styles directly on the
elements**:

```js
// Example conversions (applied to all matching elements):
<div class="quotation-container" style="max-width:800px; margin:0 auto; padding:20px; border:2px solid #000;">
<div class="quotation-section" style="margin:20px 0;">
<h3 style="margin-top:0; margin-bottom:8px; border-bottom:2px solid #000; padding-bottom:8px;">
<table class="quotation-table" style="width:100%; border-collapse:collapse;">
```

This removes the dependence on a document-level `<style>` block — the card
renders correctly standalone, in any wrapper, and survives email-client style
stripping. All other inline styles (cell borders/padding, colors, fonts) are
preserved as-is. The `<style>` block in the original `generateQuotationEmailHtml`
document wrapper is retained for the `body` font/color baseline, but the card's
layout no longer relies on it.

## 7. Server-side confirmation email

Inside `sendSubmissionNotification` (`routes/supplier-portal.js:12`), replace the
inline `html` template (lines 56-80) with a composition built from the shared
module.

### 7.1 New data gathered inside the function

```js
import { generateQuotationCardHtml, generateSupplierResponseTiersHtml } from '../shared/quotationEmailHtml.js';

// 1. Brand name (one small query) — quotation.brandId is already loaded
const brand = quotation.brandId
  ? await db.get('SELECT name FROM brands WHERE id = ?', [quotation.brandId])
  : null;
const brandName = brand ? brand.name : null;

// 2. productDetails parsed (string -> object), with the existing typeof guard
// 3. sanitizedTiers is PASSED IN via submittedData (see §7.3) — no extra query

// 4. Style constants for the confirmation block (match the card's inner styles)
const cellLabel = 'padding:8px; border:1px solid #ccc; font-weight:bold; width:45%; vertical-align:top;';
const cellValue = 'padding:8px; border:1px solid #ccc; vertical-align:top;';
```

### 7.2 HTML assembly — single document, well-formed

The server composes one document that contains: (a) the quotation card, (b) a
confirmation block, and (c) the tier table.

```js
const cardHtml = generateQuotationCardHtml(quotation, {
  brandName,
  profileImageSrc: profileImageCid ? `cid:${profileImageCid}` : null,
  qrBase64: null,          // server has no QR (§3)
  osRef: quotation.outsourcingSeq || '',
  attachmentList: [],
});

const tiersHtml = generateSupplierResponseTiersHtml(submittedData.sanitizedTiers);

const confirmationBlock = `
  <div class="quotation-section" style="margin:20px 0;">
    <h3 style="margin-top:0; margin-bottom:8px; border-bottom:2px solid #000; padding-bottom:8px;">Submission Confirmation</h3>
    <table style="width:100%; border-collapse:collapse;">
      <tr><td style="${cellLabel}">Supplier</td><td style="${cellValue}">${supplier.companyName}</td></tr>
      <tr><td style="${cellLabel}">Contact</td><td style="${cellValue}">${supplierMember.name}</td></tr>
      <tr><td style="${cellLabel}">Delivery Days</td><td style="${cellValue}">${submittedData.deliveryDays || 'N/A'}</td></tr>
      <tr><td style="${cellLabel}">Notes</td><td style="${cellValue}">${submittedData.notes || '-'}</td></tr>
      ${!submittedData.sanitizedTiers || submittedData.sanitizedTiers.length === 0 ? `
        <tr><td style="${cellLabel}">Unit Price (HKD)</td><td style="${cellValue}">${submittedData.unitPrice != null ? Number(submittedData.unitPrice).toFixed(2) : 'N/A'}</td></tr>
        <tr><td style="${cellLabel}">Total Price (HKD)</td><td style="${cellValue}">${submittedData.totalPrice != null ? Number(submittedData.totalPrice).toFixed(2) : 'N/A'}</td></tr>
      ` : ''}
    </table>
  </div>`;

const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
</style>
</head>
<body style="margin:0; padding:20px;">
${cardHtml}
${confirmationBlock}
${tiersHtml}
<p style="font-size:12px; color:#666; margin-top:24px;">This is an automated notification.</p>
</body>
</html>`;
```

The nodemailer send loop (`routes/supplier-portal.js:82-105`) is unchanged.

### 7.3 Call-site change

At `routes/supplier-portal.js:628`, pass the tiers that are already in scope
(`sanitizedTiers`, built at line 544):

```js
sendSubmissionNotification(quotation, supplier, supplierMember, {
  unitPrice, totalPrice, deliveryDays, notes,
  sanitizedTiers,   // <-- new; flows straight in, no DB round-trip
});
```

First-submit-only is already guaranteed by the `Already submitted` guard at
`routes/supplier-portal.js:589`; the notification only runs in the success path
after insert, so no change to firing semantics.

## 8. Browser-side integration (removes duplication)

### 8.1 Expose the module on `window`

Add to `<head>` in `public/index.html`:

```html
<script type="module">
  import * as Q from '/shared/quotationEmailHtml.js';
  Object.assign(window, {
    // The two functions the browser uses — full-doc wrapper + tier renderer (for future symmetry)
    generateQuotationEmailHtml: Q.generateQuotationEmailHtml,
    generateSupplierResponseTiersHtml: Q.generateSupplierResponseTiersHtml,
    // Helpers that other inline functions also reference
    emailProductTypeDisplay: Q.emailProductTypeDisplay,
    resolveProductDetailValue: Q.resolveProductDetailValue,
    formatFileSize: Q.formatFileSize,
    PRODUCT_DETAILS_LABELS: Q.PRODUCT_DETAILS_LABELS,
    PRODUCT_OPTION_LABELS: Q.PRODUCT_OPTION_LABELS,
  });
</script>
```

`generateQuotationCardHtml` is **internal** (used by `generateQuotationEmailHtml`
and the server); it does not need to be on `window`. The two callers
(`public/index.html:14181` and `public/index.html:22209`) use the full-document
`generateQuotationEmailHtml` — unchanged behavior, only the `opts` signature
shifts (see §8.3).

Module scripts are deferred and execute before any inline-script event handler
fires, so both card callers — which live inside async functions triggered by
button clicks — always see the names on `window`. No race.

### 8.2 Delete the now-duplicated inline definitions from `public/index.html`

- `formatFileSize` (line 14265)
- `emailProductTypeDisplay` (line 15363)
- `PRODUCT_DETAILS_LABELS` (line 15376)
- `PRODUCT_OPTION_LABELS` (line 15414)
- `resolveProductDetailValue` (line 15458)
- `generateQuotationEmailHtml` (lines 22255-22424)

### 8.3 Update the two card callers to the new signature

- `public/index.html:14181` (batch send) and `public/index.html:22209` (reply):

```js
const emailHtml = generateQuotationEmailHtml(quotation, {
  brandName: getBrandName(quotation.brandId),
  profileImageSrc: profileImageBase64,
  qrBase64, osRef, attachmentList,
  emailMeta, originalEmailHtml,   // reply caller only
});
```

### 8.4 Sibling functions left intact

`emailProductDetailsRows`, `generateSupplierPortalEmailHtml`,
`generateSupplierReminderEmailHtml` (the outgoing supplier-request emails,
`public/index.html:15483-15558`) also consume the extracted helpers. They keep
working because those helpers are exposed on `window`. Their internals are **not**
refactored — out of scope, and they are not broken.

## 9. Migration order (one PR, four steps)

1. **Create** `shared/quotationEmailHtml.js` — the card/wrapper split
   (`generateQuotationCardHtml` + thin `generateQuotationEmailHtml` wrapper), the
   `opts` signature, the data maps + helpers (verbatim), and the new tier-table
   function. Nothing imports it yet, so nothing breaks.
2. **Server feature:** rewrite `sendSubmissionNotification`'s `html` to use the
   module; pass `sanitizedTiers` at line 628. → *Confirmation email now shows card
   + tiers.*
3. **Browser swap:** add the module `<script>`, delete the inline duplicates
   (§8.2), update the two callers (§8.3). → *Batch-send/reply visually identical;
   single source of truth.*
4. **Verify** both flows render correctly: card unchanged on batch send/reply;
   confirmation shows the supplier's tier table.

Doing all four in one PR means there is never a window where the duplication is
live and drifting.

## 10. Backward compatibility

- No schema changes. No data migration.
- The shared module's `opts` is additive; both callers supply `brandName` and
  `profileImageSrc`, so the parameterized renderer behaves identically to the old
  inline version on the browser paths.
- The server confirmation email strictly gains content (card + tiers); recipients
  who previously got the flat table now get a superset.
- `sanitizedTiers` is already computed in the submit handler, so passing it adds
  no DB query.
- Re-submission behavior is unchanged (still blocked before the notification can
  fire).

## 11. Edge cases & validation

- **No tiers submitted (flat pricing)** → `sanitizedTiers` is `[]`,
  `generateSupplierResponseTiersHtml` returns `''`; the confirmation block shows
  Unit Price / Total Price rows. No empty table.
- **No profile image** → `profileImageCid` is null → card omits the image block
  (same as today on both paths).
- **No brand / no `brandId`** → `brandName` falls back to `'N/A'` (same as today).
- **`productDetails` string vs object** → the renderer's `typeof === 'string' ?
  JSON.parse : ...` guard is preserved.
- **Tier `unitPrice` / `total` formatting** → `Number(...).toFixed(2)` and
  `quantity.toLocaleString()`, matching the request-tier table rendering in
  `generateSupplierPortalEmailHtml` (`public/index.html:15501`).
- **Re-submit attempt** → blocked at `routes/supplier-portal.js:589` before
  insert; notification never fires twice.
- **`escapeHtml`** → if any rendered value could contain HTML, it is escaped; the
  existing card uses raw interpolation of trusted internal data, and the
  confirmation block does the same (supplier `companyName`, member `name`, notes
  are internal/trusted). Verify during implementation whether `notes` needs
  escaping.

## 12. Testing

### 12.1 Backend (unit/integration)

- `generateSupplierResponseTiersHtml` renders one row per tier with correct
  formatting; returns `''` for empty/absent input.
- `generateQuotationEmailHtml` with `profileImageSrc: 'cid:…'` emits an
  `<img src="cid:…">` (server path).
- `generateQuotationEmailHtml` with a data URL emits the data URL (browser path,
  regression).
- `generateQuotationCardHtml` returns self-contained markup (layout styles
  inlined on elements, no class-based `<style>` dependency).
- `sendSubmissionNotification` builds HTML containing the card, the confirmation
  block, and (when tiers present) the tier table; omits the table when tiers
  absent; falls back to Unit/Total rows.
- First-submit-only: second submission is rejected before the notification fires.

### 12.2 Manual verification (user-driven, no browser automation)

- Submit a tier quotation through the portal → both recipients receive the card +
  the supplier's tier table.
- Submit a flat-price quotation → both receive the card + Unit/Total rows, no
  tier table.
- Batch-send a quotation from the main UI → card renders identically to before
  (no visual regression).
- Reply-send a quotation (threaded) → card + reply-quote block intact.

## 13. Files likely touched

- `shared/quotationEmailHtml.js` — **new**; `generateQuotationCardHtml` (reusable
  inner) + `generateQuotationEmailHtml` (full-document wrapper) + data maps +
  helpers (verbatim extracts) + new `generateSupplierResponseTiersHtml`.
- `routes/supplier-portal.js` — import the module; gather brand name; rewrite
  `sendSubmissionNotification` HTML; pass `sanitizedTiers` at line 628.
- `public/index.html` — add the module `<script>` in `<head>`; delete the six
  duplicated inline definitions (§8.2); update the two callers (§8.3).

## 14. Out of scope / future

- **Server-side QR code** in the confirmation email (would need the `qrcode` npm
  package). Can be revisited if the team wants the QR on confirmation emails.
- **Server-side PDF** of the card (the browser already attaches a PDF on
  batch-send via `generateQuotationPdfBase64`). Not needed for confirmation.
- **Refactoring** `generateSupplierPortalEmailHtml` /
  `generateSupplierReminderEmailHtml` to build on the shared card renderer. They
  are distinct (request-oriented) layouts; left as-is.
- Promoting the shared module to a stricter boundary (e.g. a small build step)
  is unnecessary — the deferred-module `<script>` approach works without one.
