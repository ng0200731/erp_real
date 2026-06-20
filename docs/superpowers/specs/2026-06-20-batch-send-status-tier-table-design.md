# Batch Send — Status-Driven Tier Table + Status Everywhere — Design

**Date:** 2026-06-20
**Status:** Approved (brainstormed) — pending implementation plan
**Author:** eric + Claude
**Related:** [2026-06-19-supplier-confirmation-email-shared-module-design.md](./2026-06-19-supplier-confirmation-email-shared-module-design.md) (this design builds on the same `shared/quotationEmailHtml.js` module)

## 1. Goal

The **Batch Send** button (present in both the **Quotation** view and the
**Outsourcing** view) currently emails a recipient the branded quotation card +
an A4 PDF, with a per-row subject. It shows **no status** and **no supplier
tier/pricing information**, even when suppliers have already responded.

This change makes Batch Send **"send all information as per status"**:

1. **Status everywhere** — the quotation's current `status` appears in the email
   **subject**, the **HTML body**, and the **PDF**.
2. **Status-driven tier table** — the email HTML body and the PDF always include
   a **Supplier Quotations** section. Its contents follow the quotation's status:
   empty during early stages, and a full per-supplier comparison (with the
   selected supplier marked and marked-up) once quotations are in.

## 2. Scope

- **In scope:** the Batch Send path — `batchSendQuotations` /
  `sendSingleBatchEmail` and the PDF renderer `generateQuotationPdfBase64` in
  `public/index.html`; new pure helpers + an HTML section renderer in
  `shared/quotationEmailHtml.js`; a small `Status` addition to the shared card
  meta band; unit tests.
- **Out of scope (§15):** the Compare Quotation popup; the existing
  `sendQuotationToCustomer` / `generateCustomerComparisonEmailHtml` flow; the
  supplier-portal submission confirmation email; server-side PDF; prompting for
  markup at batch-send time; the regular-quotation status workflow.

## 3. Key decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Tier content model | **Two modes only.** `empty` when there are **no supplier responses** (any status); `all` otherwise — every supplier response is shown. Selection + markup are layered onto `all`, not separate modes. This is the literal "send all info as per status". |
| When the section is empty | **No supplier responses** → empty section (placeholder). Once any response exists the section is populated — *regardless of status string*. (Corrected after testing: an `await quotation`/`compare quotation` row with responses must show tiers, so empty is driven by response count, not status.) |
| Which supplier's tiers | **All responses, always** (when not in empty mode). The selected supplier (`selectedSupplierResponseId`) is marked **✓ Selected**; others are dimmed + struck through, exactly like the Compare popup. |
| Markup source | **Read stored `quotation.markupPercent`** (saved when the quotation was sent to the customer). Applied to the selected supplier's unit/total/per-tier prices as `price × (1 + markupPercent/100)`. **No prompt** at batch send. `markupPercent = 0` → no change. |
| Status display location | **Subject** (bracketed label) + **shared card meta band** (so it also appears on reply / confirmation cards — reversible, see §6.1) + **PDF meta band**. |
| Where the decision lives | One pure function `resolveStatusTierMode` in `shared/quotationEmailHtml.js`, consumed by **both** the HTML renderer and the PDF renderer — single source of truth for *what* to show. |
| HTML section injection | New `opts.afterCardHtml` on `generateQuotationEmailHtml`; batch send passes the tier section through it. Existing callers pass nothing → unchanged. |
| Regular (non-outsourcing) quotations | They have no supplier responses and usually no meaningful status → tier section renders the empty placeholder; status label omitted from subject when blank. No special-casing needed. |

## 4. Existing assets reused (no duplication)

- `GET /api/supplier-portal/responses/:quotationId` (`routes/supplier-portal.js:194`)
  — returns every supplier response for a quotation, each already carrying
  `.tiers`, `.companyName`, `.memberName`, `.emailPrefix`, `.emailDomain`,
  `.unitPrice`, `.totalPrice`, `.deliveryDays`, `.notes`, `.supplierId`. This is
  the single fetch the batch send needs; no new endpoint.
- `GET /api/quotations/:id` (`routes/quotations.js:79`) — `getQuotationById`
  returns the full row, so `status`, `selectedSupplierId`,
  `selectedSupplierResponseId`, and `markupPercent` are already on the
  `quotation` object the batch send fetches today.
- The Compare popup's rendering conventions (`public/index.html:15747-15825`) —
  ✓ Selected badge, strike-through + dimming of non-selected rows, green/red
  min/max highlight, and the quantity-aligned per-tier matrix with a "Tier total"
  row. The new HTML section mirrors these so the email matches what users
  already see on screen.
- `generateQuotationEmailHtml` / `generateQuotationCardHtml`
  (`shared/quotationEmailHtml.js:264` / `:135`) — the card renderer and
  full-document wrapper. Extended minimally (status in meta band +
  `opts.afterCardHtml`), not rewritten.
- `generateQuotationPdfBase64` (`public/index.html:14318`) — the jsPDF renderer.
  Extended to draw the status + the tier section via `doc.autoTable`, reusing the
  existing `renderSection` helper pattern.
- `escapeHtml` (`shared/quotationEmailHtml.js:96`) — used for supplier names,
  contact, notes in the new section.
- `emailProductTypeDisplay` (`shared/quotationEmailHtml.js:75`) — already used
  by the card and the compare popup.

## 5. Current state (the gap)

| Aspect | Today | After this change |
|---|---|---|
| Subject | `Quotation - {customer} - {productType} - {osRef}` | `… [{StatusLabel}]` (status appended) |
| HTML body | Card only — no status, no supplier pricing | Card (with Status in meta band) + status-driven Supplier Quotations section |
| PDF | Card only — no status, no supplier pricing | Card meta band gains Status + a Supplier Quotations section |
| Supplier tiers in batch send | Never shown | Shown per status (empty / all, with selection + markup) |

The batch send path is entirely client-side: `sendSingleBatchEmail`
(`public/index.html:14123`) fetches the quotation, profile image, and
attachments, generates a QR + HTML + PDF in the browser, then `POST /api/email/send`.
This design stays client-side and adds one more fetch (responses).

## 6. Architecture — `shared/quotationEmailHtml.js` additions

All new exports are **pure** (no `window`/`document`/`fetch`), so they remain
shared by Node tests and the browser.

### 6.1 Status in the card meta band

`generateQuotationCardHtml` reads `quotation.status` (already on the object) and
appends a Status segment to the existing meta band
(`shared/quotationEmailHtml.js:150`):

```js
// inside metaBandHtml, after the Date Revised span:
<strong style="color:#000;">Status:</strong>
<span style="color:#000;">${formatStatusLabel(quotation.status)}</span>
```

`formatStatusLabel` (new export) turns the stored machine status into a readable
label and returns `'N/A'` for null/empty:

```js
export function formatStatusLabel(status) {
  if (!status) return 'N/A';
  return String(status)
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');   // 'await quotation' -> 'Await Quotation'
}
```

**Scope note (reversible):** because the meta band is part of the shared card,
Status will also appear on **reply** and **supplier-confirmation** emails. This
is intended as a benign improvement. If batch-send-only is later preferred, move
the Status line out of the card and into the batch-send-specific section header
only — a one-line change.

### 6.2 The decision function (single source of truth)

```js
// Pure. Returns the descriptor both renderers consume. The mode is driven by
// RESPONSE COUNT only (not the status string): no responses -> empty; any
// responses -> all. Selection ids + markupPercent do not affect the mode; they
// are passed through so the renderer has everything it needs in one object.
export function resolveStatusTierMode({ status, responses, selectedSupplierId, selectedResponseId, markupPercent }) {
  const resp = Array.isArray(responses) ? responses : [];
  const mode = resp.length === 0 ? 'empty' : 'all';
  return {
    mode,
    status,
    responses: resp,
    selectedSupplierId: selectedSupplierId != null ? Number(selectedSupplierId) : null,
    selectedResponseId: selectedResponseId != null ? Number(selectedResponseId) : null,
    markupPercent: Number(markupPercent) || 0,
  };
}
```

- No responses → `empty` (covers `pending` / `send to outsourcing supplier` /
  early `await quotation` — none of which have responses yet).
- Any responses → `all` (every response shown; selection + markup applied when
  present — see §6.3).

### 6.3 The HTML section renderer

```js
// Always returns a section. Empty mode -> header + placeholder line.
// 'all' mode -> a supplier table (+ per-tier matrix when any response has tiers),
//               with the selected supplier marked ✓ Selected and marked-up.
export function generateStatusTierSectionHtml({ status, responses, selectedSupplierId, selectedResponseId, markupPercent }) { ... }
```

`all` mode table columns (email-friendly, mirrors the Compare popup):
`Supplier | Contact | Unit Price (HKD) | Total (HKD) | Delivery Days | Notes`.

Row rules (matching the Compare popup at `public/index.html:15747`):
- **Selection match** (same convention as the popup at `:15749`): a response is
  "selected" when `selectedResponseId && r.id === selectedResponseId`, else when
  `selectedSupplierId && r.supplierId === selectedSupplierId`. `tierCtx` carries
  **both** ids (see §8.2) so this is robust to either being set.
- Selected row: append a `✓ Selected` badge; when `markupPercent > 0`, multiply
  its `unitPrice`, `totalPrice`, and per-tier `unitPrice`/`total` by
  `(1 + markupPercent/100)` and show "(incl. {markupPercent}% markup)".
- Non-selected rows: `opacity:0.5; text-decoration:line-through; color:#999;`
  (same as the popup).
- Min/max `totalPrice` highlight (green/red) preserved when not all equal.

Per-tier matrix (appended when `responses.some(r => r.tiers?.length)`):
quantity rows aligned across suppliers (buyer-fixed quantities), one column per
supplier, plus a "Tier total" row — identical layout to
`public/index.html:15778-15825`. The selected supplier's column header carries
the ✓ badge and its cells are marked up when `markupPercent > 0`.

`empty` mode:

```html
<div class="quotation-section" style="margin:20px 0;">
  <h3 style="...">Supplier Quotations</h3>
  <p style="color:#666; margin:0;">No supplier quotations to show at this stage.</p>
</div>
```

### 6.4 `opts.afterCardHtml` on the wrapper

`generateQuotationEmailHtml` gains `opts.afterCardHtml` (default `''`), injected
inside `<body>` after the card and before the reply block
(`shared/quotationEmailHtml.js:264`):

```js
<body style="margin:0; padding:20px;">
${cardHtml}
${opts.afterCardHtml || ''}
${replyBlock}
</body>
```

Existing callers (reply at `public/index.html:22209`, batch send at
`:14193`) pass nothing → byte-identical output. The batch send passes the tier
section here.

## 7. PDF rendering — `generateQuotationPdfBase64`

Signature extended (new params at the end, all optional with defaults so the
reply/other callers are unaffected):

```js
async function generateQuotationPdfBase64(
  quotation, profileImageBase64, qrBase64 = null, osRef = '', attachmentList = [],
  tierCtx = null   // { responses, selectedSupplierId, selectedResponseId, markupPercent } or null
)
```

Changes inside (`public/index.html:14318`):

1. **Status in the meta band** — the existing metadata `autoTable` row
   (`:14376`) gains a **4th cell**: `Status: ${formatStatusLabel(quotation.status)}`.
   The A4 width (210 mm – margins) accommodates 4 cells comfortably.
2. **Supplier Quotations section** — after the existing sections (e.g. after
   Brand Detail / before or after Additional Notes), when `tierCtx` is provided:
   - Compute `const mode = resolveStatusTierMode({ status: quotation.status, ...tierCtx });`
     (imported from the shared module via `window` — see §8.1).
   - `mode === 'empty'` → `renderSection('Supplier Quotations', [['-', 'No supplier quotations to show at this stage.']])`.
   - `mode === 'all'` → a `renderSection`-style heading + an `autoTable` with
     columns `Supplier | Unit Price | Total | Delivery | Notes`; the selected
     row prefixed `✓ ` and marked up; non-selected rows drawn as-is. Then, if any
     response has tiers, a second `autoTable` per-tier matrix (Quantity + one
     column per supplier + Tier total row), selected column marked up.
3. Markup math is identical to the HTML (`× (1 + markupPercent/100)`).

The PDF reuses `resolveStatusTierMode` so its *decision* cannot drift from the
HTML; only the drawing (jsPDF vs HTML string) differs.

## 8. `sendSingleBatchEmail` wiring (`public/index.html:14123`)

### 8.1 Expose the new shared helpers on `window`

Extend the existing module `<script>` block (added by the prior PR,
`public/index.html <head>`) to also expose:
`formatStatusLabel`, `resolveStatusTierMode`, `generateStatusTierSectionHtml`.

### 8.2 Fetch responses (one new fetch)

After the quotation fetch (`:14125`) and before building the HTML (`:14193`):

```js
let responses = [];
try {
  const r = await fetch(`/api/supplier-portal/responses/${quotation.id}`);
  const d = await r.json();
  responses = d.success ? (d.responses || []) : [];
} catch (e) {
  console.warn('Failed to fetch supplier responses for batch email:', e);
  responses = [];   // graceful: tier section renders empty
}
const tierCtx = {
  responses,
  selectedSupplierId: quotation.selectedSupplierId,
  selectedResponseId: quotation.selectedSupplierResponseId,
  markupPercent: quotation.markupPercent || 0,
};
```

### 8.3 Build + inject the tier section

```js
const tierSectionHtml = generateStatusTierSectionHtml({
  status: quotation.status,
  ...tierCtx,
});

const emailHtml = generateQuotationEmailHtml(quotation, {
  brandName: getBrandName(quotation.brandId),
  profileImageSrc: profileImageBase64,
  qrBase64, osRef, attachmentList,
  afterCardHtml: tierSectionHtml,   // <-- new
});
```

### 8.4 Pass tier context to the PDF

```js
const pdfBase64 = await generateQuotationPdfBase64(
  quotation, profileImageBase64, qrBase64, osRef, attachmentList, tierCtx
);
```

### 8.5 Subject gains the status label

At `public/index.html:14215`:

```js
const statusLabel = formatStatusLabel(quotation.status);
const baseSubject = osRef
  ? `Quotation - ${quotation.customerName || 'Customer'} - ${productTypeName} - ${osRef}`
  : `Quotation - ${quotation.customerName || 'Customer'} - ${productTypeName}`;
const emailSubject = quotation.status
  ? `${baseSubject} [${statusLabel}]`
  : baseSubject;
```

(Null/empty status omits the bracket.)

## 9. Migration order (one PR, four steps)

1. **Shared module** — add `formatStatusLabel`, `resolveStatusTierMode`,
   `generateStatusTierSectionHtml`; add Status to the card meta band; add
   `opts.afterCardHtml` to the wrapper. Nothing consumes the new exports yet, so
   nothing breaks. Add unit tests for the pure functions.
2. **Browser wiring** — expose the new helpers on `window`; update
   `sendSingleBatchEmail` (fetch responses, build + inject tier section, pass
   `tierCtx` to the PDF, update subject). → *Batch-send HTML + subject now show
   status + tiers.*
3. **PDF** — extend `generateQuotationPdfBase64` (status in meta band + tier
   section via `resolveStatusTierMode`). → *PDF matches the HTML.*
4. **Verify** both views (quotation + outsourcing) across statuses: early
   (empty), compare (all), selected (marked), send-to-customer (marked + markup).

Doing all four in one PR means there is no window where status/tiers appear in
the HTML but not the PDF.

## 10. Backward compatibility

- No schema changes; no data migration. `markupPercent`, `status`,
  `selectedSupplierResponseId` already exist on `quotations`.
- `generateQuotationEmailHtml`'s new `opts.afterCardHtml` is additive and
  defaults to `''` — reply and other callers are byte-identical.
- `generateQuotationPdfBase64`'s new `tierCtx` param is optional/defaults to
  `null` — other callers unaffected.
- The supplier-confirmation email and reply email gain only a `Status` line in
  the meta band (additive, non-breaking).
- Recipients who previously got a card-only batch email now get a superset
  (card + status + tier section).
- A failed responses fetch degrades gracefully to the empty placeholder; it
  never fails the send.

## 11. Edge cases & validation

- **Status with responses present** → `all`. Empty is driven by *response count*,
  not the status string: an `await quotation` or `compare quotation` row that has
  responses shows them.
- **Any status with no responses** (e.g. a regular quotation, or `pending` / `send
  to outsourcing supplier` / early `await quotation` before any response) →
  `empty` placeholder. No crash.
- **`markupPercent` is 0 / null** → no price change; selected supplier still
  marked ✓ if `selectedSupplierResponseId` is set.
- **`selectedSupplierResponseId` set but not present in the responses payload**
  (stale id) → no row is marked; falls back to a plain `all` comparison. No crash.
- **Multiple responses, none selected** (compare stage) → plain comparison, no
  markup, min/max highlight on.
- **Tier matrix only when `responses.some(r => r.tiers?.length)`**; flat-price
  responses still show in the summary table via their `unitPrice`/`totalPrice`.
- **`productDetails.tiers` (requested quantities)** used only to label quantity
  rows in the matrix, exactly as the Compare popup does (`public/index.html:15782`).
- **Regular (non-outsourcing) quotation** → no responses, status often null →
  empty section, no bracket in subject, `Status: N/A` in meta band.
- **`escapeHtml`** applied to `companyName`, `memberName`, `notes` (free text).
- **Responses fetch failure** → `responses = []` → empty section; send proceeds.

## 12. Testing

### 12.1 Unit (pure functions, `tests/unit/`)

- `formatStatusLabel`: `'await quotation'` → `'Await Quotation'`; `null`/`''` →
  `'N/A'`; `'1st resubmit'` → `'1st Resubmit'`.
- `resolveStatusTierMode`:
  - `'compare quotation'` + responses, no selection → `{ mode: 'all', markupPercent: 0 }`;
  - `await quotation` + responses → `{ mode: 'all' }` (response-count-driven, not status-gated);
  - `'send to customer'` + a selected response + `markupPercent: 15` →
    `{ mode: 'all', selectedResponseId, markupPercent: 15 }`;
  - any status + `responses: []` → `{ mode: 'empty' }`.
- `generateStatusTierSectionHtml`:
  - `empty` → contains the placeholder text, no `<table>`;
  - `all` with 2 responses → 2 rows, both visible;
  - `all` with a selected response + markup → selected row contains the ✓ badge
    and the marked-up unit price (`unitPrice * 1.15` for 15%), non-selected row
    struck through;
  - `all` where a response has `tiers` → output contains a per-tier matrix and a
    "Tier total" row.
- `generateQuotationEmailHtml` with `opts.afterCardHtml: '<div id="x">TIER</div>'`
  → the marker appears inside `<body>` after the card and before any reply block;
  without `afterCardHtml` → unchanged (regression).
- `generateQuotationCardHtml` with `quotation.status = 'await quotation'` → meta
  band contains `Status:` and `Await Quotation`.

### 12.2 Manual verification (user-driven, no browser automation)

- Outsourcing view, status `await quotation`, **no supplier responded yet** →
  Batch Send email + PDF show an **empty** Supplier Quotations section +
  `Status: Await Quotation`; subject ends `[Await Quotation]`.
- Same quotation after suppliers respond (button reads "Compare Quotation") →
  section shows **all** responses (comparison); PDF matches; subject unchanged.
- Status `compare quotation`, 2 supplier responses → section shows both; PDF
  matches.
- Select a supplier (no markup yet) → section shows both, selected marked ✓.
- Status `send to customer` with stored `markupPercent = 15` → selected row
  marked ✓ **and** prices × 1.15 with "(incl. 15% markup)"; subject ends
  `[Send To Customer]`.
- Quotation view, regular quotation → empty section, `Status: N/A`, no subject
  bracket.
- Reply-send a quotation → card now shows Status in meta band; otherwise
  unchanged.

## 13. Files likely touched

- `shared/quotationEmailHtml.js` — add `formatStatusLabel`,
  `resolveStatusTierMode`, `generateStatusTierSectionHtml`; Status in card meta
  band; `opts.afterCardHtml` on `generateQuotationEmailHtml`.
- `public/index.html` — expose new helpers on `window`; wire
  `sendSingleBatchEmail` (responses fetch, tier-section injection, `tierCtx` to
  PDF, status in subject); extend `generateQuotationPdfBase64` (status meta +
  tier section).
- `tests/unit/08-batch-send-status-tiers.test.js` — **new**; covers the pure
  functions above (follows the `06`/`07` numbering).

## 14. Risks

- **PDF ↔ HTML visual drift** — mitigated by sharing `resolveStatusTierMode`;
  the drawing differs but the data/decision cannot. Verify visually per §12.2.
- **Status on shared card affects other emails** — intentional and reversible
  (§6.1). Flagged for reviewer veto.
- **Large batches** — one extra `fetch` per quotation (responses). Already
  sequential with a progress overlay (`showSendingOverlay`); acceptable. No
  change to the send loop.

## 15. Out of scope / future

- Server-side PDF of the card (browser jsPDF retained).
- Prompting for markup at batch-send time (confirmed: read stored only).
- Refactoring `generateCustomerComparisonEmailHtml` /
  `sendQuotationToCustomer` to share the new section renderer (they are a
  distinct customer-facing layout; left as-is).
- Promoting `Status` to a richer badge/pill in the card (plain text for now).
- Caching/batching the per-quotation responses fetch across a large batch.

## 16. Addendum — auto-advance status to "compare quotation" (Option B)

Added after the initial implementation, to fix the root cause of the "Status:
Await Quotation" vs. tier-table-already-filled contradiction (§Q2/Q3 in review):
the stored `status` field never moved past `await quotation` because nothing in
the workflow writes `compare quotation`.

**Decision:** advance the **stored** status from `await quotation` →
`compare quotation` automatically once every linked supplier has responded.
This makes the table status column, dashboard counts, filters, **and** the
batch-send email all agree (no mismatch anywhere).

- New pure DB helper `advanceToCompareQuotationWhenAllResponded(quotationId)`
  (`db/tasksDb.js`) — advances only when `status === 'await quotation'`,
  `linkedCount > 0`, and `responseCount >= linkedCount` (the same rule the client
  action button uses). Returns `{ advanced, from, to, linkedCount,
  responseCount }` or `null`. **Idempotent** and **sticky** (never reverts on
  unlink/response-delete).
- Triggered server-side in the supplier-portal submit handler
  (`routes/supplier-portal.js`, right after the response + tiers insert), with a
  history log entry when it advances.
- Tests: `tests/unit/09-auto-advance-compare-quotation.test.js` (partial → no
  advance; all → advance; idempotent; non-await status untouched; zero-linked
  untouched; missing quotation → null).

**Limitation:** the advance fires on each **new** submission, so quotations
already stuck at `await quotation` with all responses in (e.g. OS0000015) are
**not** retroactively flipped. A one-time backfill or a client-side trigger on
table load could be added if needed — left out for now.

