# Settings → Document Generator (Proforma Invoice / Purchase Order / Packing List / Commercial Invoice)

**Date:** 2026-06-25
**Status:** Design approved, awaiting plan
**Scope:** Add a 2nd-level **Document** item under the **Setting** left menu, and a new **Document** page that generates four dummy-defaulted trade documents — Proforma Invoice (PI), Purchase Order (PO), Packing List (PL), Commercial Invoice (CI) — with a live HTML preview and a server-side pdfkit PDF download.

## Goals

- One new "Document" entry under **Setting** in the left menu (2nd level).
- A form-generator page with **four separate forms** (one per document type), each pre-filled with **dummy data**.
- **Seller** (company header) sourced from the existing `brands` table; **buyer + line items** hardcoded dummy defaults.
- **Live on-page HTML preview** that updates as the user edits the form.
- **Download PDF** generated **server-side via pdfkit** (Approach 2).
- **Stateless** — no database writes, no saved documents. Each visit starts fresh from dummy defaults.

## Non-goals (out of scope for v1)

- Saving generated documents to the DB / listing / re-opening.
- Linking documents to real orders, customers, or quotations.
- Repeating table headers on every PDF page (simple `addPage` continuation only).
- Emailing documents (the app already has email features elsewhere).

## Architecture

Approach 2 (chosen): **server-side pdfkit PDF + client-side HTML preview**, with a shared module driving both so the preview and the PDF can never disagree on which fields/columns a type shows.

The shared module must run in the browser (for the live preview), so it cannot import `pdfkit`. The pdfkit builder stays server-side. Both consume the **same `DOCUMENT_TYPES` config**, which is the single source of truth.

```
Browser (public/index.html)                    Server
─────────────────────────                      ────────────────────────
Setting → Document menu                        routes/documents.js
  → documentPanel                                 POST /api/documents/pdf
  → shared: getDummyData(type)                        ↓
  → seller from window.cachedBrands               utils/documentPdf.js
  edit form                                          buildDocumentPdf(type, data)
  onInput → buildDocumentHtml(type, data)            → pdfkit PDFDocument
  click Download → POST /api/documents/pdf           → application/pdf stream
```

### Files

**New (3):**

| File | Runs in | Purpose |
|---|---|---|
| `shared/documentTemplates.js` | browser + server (pure, no Node-only deps) | `DOCUMENT_TYPES` config; dummy default data; `buildDocumentHtml(type, data)` → HTML string for the live preview. Loaded by the browser via `import * as D from '/shared/documentTemplates.js'` (same pattern as `shared/quotationEmailHtml.js`, served by the `/shared` static route in `server.js`). |
| `utils/documentPdf.js` | server only | `buildDocumentPdf(type, data)` → returns a pdfkit `PDFDocument`. Imports `DOCUMENT_TYPES` from the shared module so columns/labels match the preview. Pure function — importable for unit tests. |
| `routes/documents.js` | server only | `POST /api/documents/pdf` — validates `type`, calls `buildDocumentPdf`, streams the PDF back as `application/pdf`. |

**Edited (2):**

- `server.js` — import and register `routes/documents.js` (one `app.use('/api/documents', documentsRouter)`).
- `public/index.html` — add the "Document" menu item, the `documentPanel`, the four forms, the live preview pane, and the download wiring.

## Data model

One shared shape; per type, unused fields are ignored.

```js
{
  type: 'PI' | 'PO' | 'PL' | 'CI',
  seller: { name, address, phone, email, logoUrl },   // from selected brand
  buyer:  { name, address, phone, email },            // hardcoded dummy
  meta:   { docNumber, issueDate, dueDate, deliveryDate, reference,
            currency, paymentTerms, incoterms, shippingTerms, countryOfOrigin },
  items:  [ { no, description, qty, unit, unitPrice, amount,
              netWeight, grossWeight, cartons, hsCode } ],   // hardcoded dummy items
  notes:  '...'
}
```

**Totals are computed at render time** (live in the preview, again in pdfkit), never hand-entered:
- `amount` = `qty * unitPrice`
- `subtotal` = Σ `amount`
- `tax` = `subtotal * taxRate` (`meta.taxRate`, editable Tax % input on price types only — PI/PO/CI, default 0; PL has no tax)
- `total` = `subtotal + tax`
- `totalNetWeight` = Σ `netWeight`, `totalGrossWeight` = Σ `grossWeight`, `totalCartons` = Σ `cartons`, `totalQty` = Σ `qty`

### `DOCUMENT_TYPES` config (single source of truth)

Both `buildDocumentHtml` and `buildDocumentPdf` read this config.

| Type | Label | Title | Parties | `metaFields` | Item columns | Totals shown |
|---|---|---|---|---|---|---|
| **PI** | Proforma Invoice | PROFORMA INVOICE | Seller → Buyer | docNumber, issueDate, dueDate, currency, paymentTerms, incoterms | #, Description, Qty, Unit, Unit Price, Amount | Subtotal, Tax, Total |
| **PO** | Purchase Order | PURCHASE ORDER | Supplier ← Buyer (issued by) | docNumber, issueDate, deliveryDate, currency, paymentTerms, shippingTerms | #, Description, Qty, Unit, Unit Price, Amount | Subtotal, Tax, Total |
| **PL** | Packing List | PACKING LIST | Shipper → Consignee | docNumber, issueDate, reference | #, Description, Qty, Unit, N.W., G.W., Cartons | Total Qty, Total N.W., Total G.W., Total Cartons (**no prices**) |
| **CI** | Commercial Invoice | COMMERCIAL INVOICE | Exporter → Importer | docNumber, issueDate, currency, countryOfOrigin, incoterms, paymentTerms | #, Description, Qty, Unit, Unit Price, Amount, HS Code | Subtotal, Tax, Total (+ "Country of Origin" footer) |

Rules:
- **PL hides all money** (no unit price, no amount, no subtotal/tax/total). It shows weight/carton columns and their totals instead.
- **CI adds the HS Code column** and a "Country of Origin: {value}" footer line for customs.
- Each type's party labels differ (Seller/Buyer, Supplier/Buyer, Shipper/Consignee, Exporter/Importer) as listed above.

### Dummy defaults

Live in `shared/documentTemplates.js` (`getDummyData(type)`):
- A sample **buyer** (fictional company) per type.
- 2–3 sample **line items** tailored per type: PL items carry `netWeight`/`grossWeight`/`cartons`; PI/PO/CI items carry `unitPrice`.
- A sample `meta` block with a sensible `docNumber` (e.g. `PI-2026-0001`, `PO-…`, `PL-…`, `CI-…`), today's date placeholder, sample terms.
- **Seller is NOT hardcoded.** At runtime the form pulls the first entry from `window.cachedBrands` (name/address/phone/email + `logoPath` served via `/uploads`). If no brands exist, a hardcoded fallback seller is used.

## Page UX (public/index.html)

### Menu wiring (matches existing pattern at lines ~1643–1656, ~4925–4944, ~4974–5001, ~8934–8940)

- In `settingSubmenu`, after the "Option List" button, add:
  ```html
  <button id="menuDocumentBtn" class="submenu-btn">Document</button>
  ```
- Add to `tabHighlight`:
  ```js
  'document': { btns: ['menuDocumentBtn', 'menuSettings'], open: ['settingSubmenu'] },
  ```
- Add to `activateTab` panel-visibility block:
  ```js
  document.getElementById('documentPanel').style.display = id === 'document' ? 'block' : 'none';
  ```
- Click handler:
  ```js
  const menuDocumentBtn = document.getElementById('menuDocumentBtn');
  menuDocumentBtn.onclick = () => {
    document.getElementById('settingSubmenu').style.display = 'none';
    ensureTab('document', 'Setting (Document)');
    activateTab('document');
    initializeDocumentPanel();
  };
  ```

### Layout (two-pane)

```
┌ Setting (Document) ─────────────────────────────────────────┐
│ [Proforma Inv] [Purchase Order] [Packing List] [Comm. Inv]  │  ← 4 type tabs (4 separate forms)
│ [ Download PDF ]   [ Reset to dummy ]                       │
│┌─────────────────────┐ ┌──────────────────────────────────┐│
││ FORM                │ │ LIVE PREVIEW (buildDocumentHtml) ││
││ Seller: [brand ▾]   │ │  [logo]   PROFORMA INVOICE       ││
││  name/addr (auto)   │ │  Seller …           Buyer …      ││
││ Buyer: [____]       │ │  №  Desc  Qty  Price  Amount     ││
││ Meta: dates/terms   │ │   1  …                          ││
││ Items table         │ │  Subtotal / Tax / Total         ││
││  [+row] [-row]      │ │                                  ││
││ Notes: [____]       │ │                                  ││
│└─────────────────────┘ └──────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

Behavior:
- The four type tabs switch between four separate form configs; each form shows **only its type's** `metaFields` and item columns.
- Seller = a brand `<select>` populated from `window.cachedBrands`; selecting one fills name/address/phone/email and shows the logo. Buyer, items, and notes are pre-filled from the type's dummy defaults.
- Items: an editable table whose columns = the type's item columns. "Add row" / "Remove row" buttons. For price types, `amount` is a read-only computed cell. For PL, the row shows weight/carton cells instead of price cells.
- Every input change → (debounced) `collectFormData()` → `buildDocumentHtml(type, data)` → re-render the preview pane. **Live.**
- "Download PDF" → `POST /api/documents/pdf` with `{ type, data: collectFormData() }` → save the response blob as `{docNumber}.pdf` (e.g. `PI-2026-0001.pdf`).
- "Reset to dummy" → reload `getDummyData(type)` for the current type and re-fill the form + preview.

## Server route — `routes/documents.js`

- `POST /api/documents/pdf`
  - Body: `{ type: 'PI'|'PO'|'PL'|'CI', data: { seller, buyer, meta, items, notes } }`
  - Validates `type` is one of the four; else `400 { error: 'Unknown document type' }`.
  - Calls `buildDocumentPdf(type, data)` (from `utils/documentPdf.js`).
  - Responds `200` with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="{docNumber}.pdf"`, body = PDF stream.
  - On pdfkit error → `500 { error }`.
- Mounted in `server.js` as `app.use('/api/documents', documentsRouter)`.

## PDF builder — `utils/documentPdf.js`

Mirrors the pdfkit style in `routes/orders.js` (A4, 50px margins, Helvetica/Helvetica-Bold, manual x/y positioning, `moveTo`/`lineTo` for table lines, `bufferPages`).

- **Header:** logo top-left (scaled, if present), document title top-right (`DOCUMENT_TYPES[type].title`).
- **Parties:** Seller block (left) and Buyer block (right) side by side, using the type's party labels.
- **Meta row:** the type's `metaFields` rendered as label: value pairs.
- **Items table:** header row from the type's item columns; body rows from `items`; money columns right-aligned; **PL omits all money columns**; CI includes the HS Code column. Computed `amount` filled in for price types.
- **Totals:** rendered per the type's totals list, right-aligned under the table.
- **Footer:** page number + generated timestamp; for CI, an additional `Country of Origin: {meta.countryOfOrigin}` line.
- **Multi-page:** `bufferPages: true`; if the table overflows, `addPage()` and continue. Repeating the header row on each page is out of scope for v1.

## Error handling

- Unknown/missing `type` → `400`.
- Empty `items` array → render an empty table (one dashed row); still produce a valid PDF.
- Missing optional fields → render `—`.
- No brand selected / no brands cached → use the hardcoded fallback seller.
- pdfkit throws → `500 { error }`.

## Testing

Project convention: `node tests/unit/*.test.js`, `_helpers.js` available; routes tested via a throwaway express app.

- `tests/unit/20-document-templates-html.test.js` — for each of the 4 types, `buildDocumentHtml(type, getDummyData(type))` returns non-empty HTML containing the type's title and each of its item-column headers; PL output contains **neither** "Unit Price" **nor** "Amount"; CI output contains "Country of Origin".
- `tests/unit/21-document-totals.test.js` — the shared totals helper computes correct `subtotal`/`tax`/`total` (and `totalQty`/`totalNetWeight`/`totalGrossWeight`/`totalCartons`) from a fixed sample `items` array.
- `tests/unit/22-document-pdf.test.js` — `buildDocumentPdf(type, data)` returns a buffer/streams bytes starting with `%PDF` and non-zero length, for each of the 4 types.
- `tests/unit/23-documents-route.test.js` — throwaway express app mounting `routes/documents.js`: `POST /api/documents/pdf` for each type with dummy data → `200`, `Content-Type: application/pdf`, body starts with `%PDF`; unknown `type` → `400`.

## Open questions

None — all decisions resolved during brainstorming.
