# Supplier Portal — Supporting File Uploads (Traceable, CRUD) — Design

**Date:** 2026-06-23
**Status:** Approved (brainstormed) — pending implementation plan
**Author:** eric + Claude
**Related:** builds on the supplier-portal flow defined by `routes/supplier-portal.js` + `public/supplier-portal.html`, and reuses the existing quotation-attachment upload machinery in `server.js` / `public/index.html`.

## 1. Goal

When a supplier opens their price-update hyperlink
(`${baseUrl}/supplier-portal/:token`, 64-hex token, 30-day expiry) and lands on
[public/supplier-portal.html](../../../public/supplier-portal.html), there is
currently **no way to attach supporting documents** — only the pricing form
(tiers / Delivery Days / MOQ / Surcharge below MOQ / Notes).

This change adds a **Supporting Documents** drag-drop zone to the portal so a
supplier can attach **PDF, Excel, image, and Word/doc** files (and **paste from
clipboard**). Files are:

1. **Persisted traceably in SQL** — a new dedicated metadata table records who
   uploaded, when, which supplier/quotation, original name, MIME, and size.
2. **CRUD-capable** — the supplier can upload; the buyer can add / rename /
   delete from inside the ERP.
3. **Visible when viewing the quotation** — the buyer sees and manages these
   files in **both** the **Compare Quotation** popup and the **View Quotation**
   modal.

## 2. Scope

- **In scope:**
  - New SQL table `supplier_quotation_files` + migration + DB functions in
    `db/tasksDb.js`.
  - New `uploads/supplier-files/` storage dir + multer fieldname wiring in
    `server.js`.
  - Supplier-facing routes (token-authed) in `routes/supplier-portal.js`.
  - Buyer-facing routes in `routes/quotations.js`.
  - Supporting Documents drop/paste zone + existing-file list in
    `public/supplier-portal.html`.
  - Buyer file management UI in **both** viewers in `public/index.html`
    (`showCompareQuotationPopup` + `viewQuotationDetails` /
    `generateQuotationContentForView`), via a shared render helper.
  - Unit tests `tests/unit/09-supplier-quotation-files.test.js`.
- **Out of scope:**
  - Emailing the files onward (supplier submission notification email already
    exists; attaching these files to it is a later enhancement).
  - Inline preview of Office files (download/preview reuses existing
    `previewFile` behavior — images preview, others download).
  - Quotation-level (buyer) attachments — already exist, untouched.
  - Authentication for buyer routes — none of the app's internal routes have an
    auth layer; this matches that convention.

## 3. Key decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Who can manage files | **Supplier = upload (Create) only** on the portal. **Buyer = full CRUD** (add / rename / delete) in the ERP. Supplier cannot delete after submit (no delete/rename UI on the portal). |
| Buyer view location | **Both viewers.** Per-supplier files under each row in the **Compare Quotation** popup **and** an all-suppliers **Supplier Files** section in the **View Quotation** modal. A shared render helper backs both. |
| Storage of bytes | **On disk** in a new `uploads/supplier-files/` dir (consistent with existing `uploads/attachments/`). SQL holds **rich metadata only** — no BLOB. Keeps the DB small and matches the codebase. |
| Traceability | A dedicated table records `uploadedBy` (`supplier`/`buyer`), `uploadedAt`, `tokenId` (for supplier uploads), original name, MIME, size. Fully queryable. |
| Coupling to the pricing submission | **Decoupled.** Files are grouped by `(quotationId, supplierId)` — **not** by the `supplier_quotation_responses` row. `supplierMemberId` is recorded for traceability (set from the token on supplier uploads, NULL on buyer uploads) but is not a grouping key. A supplier can upload before/after submitting pricing; files survive a re-submit; uploads never affect quotation-status logic. A supplier with files but no response shows as a file-only entry. |
| File types | `image/*`, `application/pdf`, Word (`doc`/`docx`), Excel (`xls`/`xlsx`). Client guard + server multer enforcement. |
| Size limit | **10 MB / file** — matches existing quotation attachments (`server.js:145`). |
| Upload entry points | Portal (token-authed, `uploadedBy='supplier'`) and buyer (internal, `uploadedBy='buyer'`). Same multer instance, same fieldname `supplierFile`. |

## 4. Existing assets reused (no duplication)

- **Multer config** (`server.js:112-147`) — `diskStorage` already routes by
  `file.fieldname` to a dir and uses `resolveUploadName` for collision-safe
  names. We add one fieldname + one dir; reuse `upload` and `resolveUploadName`.
- **Static serving** — `app.use('/uploads', express.static(uploadsDir))`
  already serves everything under `uploads/`. The new subdir is served
  automatically — no new serving route.
- **Drag-drop + paste pattern** (`public/index.html:19114-19203`) —
  `handleAttachmentFile`, `addAttachmentToList`, `getFileIcon`, `previewFile`,
  rename/remove buttons. The portal gets a vanilla-JS adaptation of this exact
  pattern (the portal is a standalone file, no framework).
- **Token validation helper** (`routes/supplier-portal.js`, used by `GET
  /:token` and `POST /:token/submit`) — supplier file routes reuse the same
  token load + expiry check.
- **Migration convention** (`db/tasksDb.js`) — additive `CREATE TABLE IF NOT
  EXISTS` inside the existing try-catch idempotent block; DB functions exported
  and dependency-injected into routes exactly like the existing ones.

## 5. Data model

New table, created alongside the other supplier tables in `db/tasksDb.js`
(additive `CREATE TABLE IF NOT EXISTS`, try-catch idempotent — same pattern as
`supplier_quotation_response_tiers` / `quotation_status_history`):

```sql
CREATE TABLE IF NOT EXISTS supplier_quotation_files (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  quotationId       INTEGER NOT NULL,
  supplierId        INTEGER NOT NULL,
  supplierMemberId  INTEGER,            -- nullable: the uploading member (supplier uploads); NULL for buyer uploads
  tokenId           INTEGER,            -- nullable: portal token used (supplier uploads)
  originalName      TEXT NOT NULL,      -- display name; renameable via PATCH
  storedFilename    TEXT NOT NULL,      -- collision-safe on-disk name
  filePath          TEXT NOT NULL,      -- relative path, e.g. uploads/supplier-files/foo.pdf
  mimeType          TEXT,
  sizeBytes         INTEGER,
  uploadedBy        TEXT NOT NULL,      -- 'supplier' | 'buyer'
  uploadedAt        TEXT NOT NULL       -- ISO timestamp
);
CREATE INDEX IF NOT EXISTS idx_sqf_quotation ON supplier_quotation_files(quotationId);
```

Files are **not** referenced by `supplier_quotation_responses`. They join to a
quotation via `quotationId` and to a supplier via `supplierId`; the Compare
popup groups files by `supplierId` alongside responses, and a file-only supplier
(with no response row) still renders.

### DB functions (exported from `db/tasksDb.js`)

- `insertSupplierQuotationFile({ quotationId, supplierId, supplierMemberId = null, tokenId = null, originalName, storedFilename, filePath, mimeType, sizeBytes, uploadedBy })` → returns the inserted row.
- `getSupplierQuotationFiles(quotationId, supplierId = null)` → flat array of raw rows for the quotation (optionally filtered to one supplier), ordered by `uploadedAt ASC`. No `companyName` join — the UI maps `supplierId → companyName` from data it already holds (responses / linked suppliers).
- `getSupplierQuotationFileById(fileId)` → single row or null.
- `renameSupplierQuotationFile(fileId, newName)` → updates `originalName`; returns the row.
- `deleteSupplierQuotationFile(fileId)` → returns the row, then `fs.unlink`s `filePath`; caller returns the row to the client.

## 6. Storage & server wiring — `server.js`

- Add `const supplierFilesDir = path.join(uploadsDir, 'supplier-files');` next to
  `attachmentsDir` / `brandsDir`, and `await fs.mkdir(supplierFilesDir, { recursive: true });`.
- Extend `storage.destination` to map fieldname **`supplierFile`** →
  `supplierFilesDir`; extend `storage.filename` / `resolveUploadName` call to use
  `supplierFilesDir` for that fieldname. No new multer instance — the shared
  `upload` is reused.
- (Optional hardening) extend `fileFilter` to restrict `supplierFile` to the
  allowed MIME set; the existing attachment filter already passes everything
  through, so this is a tightening, not a requirement.

No changes to the static mount — `uploads/supplier-files/*` is served by the
existing `/uploads` route.

## 7. Backend routes

### 7a. Supplier-facing (token-authed) — `routes/supplier-portal.js`

All three reuse the existing token-validation helper (`getTasksDb` lookup of
`supplier_quotation_tokens` with expiry + used checks) to resolve
`(quotationId, supplierId, supplierMemberId, tokenId)`.

- `GET /api/supplier-portal/:token/files` → `getSupplierQuotationFiles(quotationId, supplierId)`.
  Returns the supplier's files for this quotation (read-only).
- `POST /api/supplier-portal/:token/files` → `upload.single('supplierFile')`
  middleware, then `insertSupplierQuotationFile(..., uploadedBy: 'supplier',
  tokenId)`. Returns the new row.
- (No PATCH/DELETE on the supplier side — buyer manages those.)

### 7b. Buyer-facing (internal) — `routes/quotations.js`

- `GET /api/quotations/:id/supplier-files` → `getSupplierQuotationFiles(id)`, a
  flat array carrying `supplierId` / `supplierMemberId` / `uploadedBy`. The UI
  groups by `supplierId` and maps `supplierId → companyName` from data already in
  hand (responses / linked suppliers) — no server join needed.
- `POST /api/quotations/:id/supplier-files` → `upload.single('supplierFile')`,
  body carries `supplierId` (required); `supplierMemberId: null`,
  `uploadedBy: 'buyer'`, `tokenId: null`. Returns the new row.
- `PATCH /api/supplier-files/:fileId` → body `{ newName }`;
  `renameSupplierQuotationFile`. Returns the updated row.
- `DELETE /api/supplier-files/:fileId` → `deleteSupplierQuotationFile` (unlinks
  disk file). Returns the deleted row.

No auth layer — consistent with the rest of `/api/quotations`.

## 8. Supplier portal UI — `public/supplier-portal.html`

A new **Supporting Documents** section rendered inside `#main` (visible whether
or not the supplier has already submitted pricing — uploads are independent of
the submission). Vanilla JS adapted from `index.html:19114-19203`:

- A drop zone `div` + hidden `<input type="file" multiple>` (click-to-browse).
- **Ctrl+V paste** — a `paste` listener gated on focus within the zone (mirrors
  the existing `document.activeElement.closest('#attachmentsDropZone')` check).
- Allowed-type guard (`image/*`, `pdf`, `doc/docx`, `xls/xlsx`) + **10 MB** cap,
  client-side; server re-enforces.
- On add → `POST /api/supplier-portal/:token/files` (`FormData`) → on success,
  append to an existing-files list (icon, name, size, "Uploaded by you ·
  <date>", click = download). Rejected files show a modal explaining why.
- On `loadQuotation()` (after the quotation renders), also `GET
  .../files` and render the supplier's previously-uploaded files. **Read-only on
  the portal** — no rename/delete buttons.

Styling matches the existing portal aesthetic (black borders, `#f5f5f5` fills)
already used by `.info-section` / `.already-submitted`.

## 9. Buyer UI — both viewers — `public/index.html`

One shared helper backs both call sites so the markup stays identical:

```js
renderSupplierFilesSection({ quotationId, supplierId, files, editable })
```

It renders the given files (icon + clickable name + size + an "Uploaded by
Supplier/Buyer · date" line) and, when `editable`, per-file **Rename** / **Delete**
buttons + an **Add file** button (hidden `<input type=file>` →
`POST /api/quotations/:id/supplier-files` with that `supplierId`). Renames use
the existing inline prompt modal; deletes use the existing confirm modal.

- **Compare popup** (`showCompareQuotationPopup`, ~`public/index.html:16299`):
  after rendering each supplier response row, render that supplier's files
  beneath it (`editable: true`). Files come from one `GET
  /api/quotations/:id/supplier-files` fetched alongside the responses; the helper
  is called per supplier with that supplier's slice. Suppliers with files but no
  response render as a file-only row.
- **View Quotation modal** (`viewQuotationDetails` ~`17223` →
  `generateQuotationContentForView` ~`20052`): a new **Supplier Files** section
  listing **all** files for the quotation, grouped by supplier, `editable: true`.

Downloads open the file via its `/uploads/supplier-files/...` URL (served by the
static mount). Images reuse `previewFile`; non-images download directly.

## 10. Traceability & CRUD matrix

| Action | Portal (supplier) | Compare popup (buyer) | View Quotation (buyer) |
|---|---|---|---|
| Create (upload) | ✅ | ✅ | ✅ |
| Read / download | ✅ (own only) | ✅ | ✅ |
| Rename | — | ✅ | ✅ |
| Delete | — | ✅ | ✅ |

Every row records `uploadedBy` + `uploadedAt` (+ `tokenId` for supplier
uploads), so the full upload history is queryable in SQL at any time.

## 11. Error handling

- **Upload too large** — multer `limits.fileSize` returns a 413-ish error; the
  portal/buyer UI surfaces a modal "File exceeds 10 MB".
- **Disallowed type** — rejected client-side first (modal), then server-side
  (`fileFilter`) as a backstop.
- **Missing supplierId on buyer upload** → 400 with a clear message.
- **Unknown fileId on PATCH/DELETE** → 404.
- **Expired/used/invalid token** on supplier routes → existing 400/403 behavior
  reused; no new error paths.
- **Disk unlink failure on delete** — log a warning but still delete the DB row
  (the row is the source of truth for "this file existed"); surface success to
  the buyer. (A missing file on disk during download is handled as a 404 by the
  static handler.)

## 12. Testing — `tests/unit/09-supplier-quotation-files.test.js`

Mirrors `08-batch-send-status-tiers.test.js` (temp SQLite DB, route handlers
under test). Covers:

- DB layer: insert → list (filtered + unfiltered) → rename → delete (DB row gone
  + disk file unlinked); "files without a response" still list.
- Supplier route: valid token upload (row has `uploadedBy='supplier'`,
  `tokenId`); expired/invalid token rejected; GET lists only that supplier's
  files.
- Buyer routes: GET groups by supplier; POST requires `supplierId`;
  PATCH renames; DELETE removes row + file.
- Type/size enforcement (reject oversize / disallowed).

## 13. File touch list

| File | Change |
|---|---|
| `db/tasksDb.js` | `CREATE TABLE supplier_quotation_files` + index (idempotent migration); 5 exported DB functions. |
| `server.js` | `supplierFilesDir` + mkdir; route `supplierFile` fieldname in multer storage; (optional) type tightening in `fileFilter`. |
| `routes/supplier-portal.js` | `GET/POST /api/supplier-portal/:token/files` (token-authed). |
| `routes/quotations.js` | `GET/POST /api/quotations/:id/supplier-files`, `PATCH/DELETE /api/supplier-files/:fileId`. |
| `public/supplier-portal.html` | Supporting Documents drop/paste zone + existing-files list. |
| `public/index.html` | `renderSupplierFilesSection` helper; wire into `showCompareQuotationPopup` and `generateQuotationContentForView`. |
| `tests/unit/09-supplier-quotation-files.test.js` | new. |

## 14. Open questions / later enhancements (out of scope here)

- Emailing the supplier files onward (e.g. to the customer) — separate change.
- Server-side antivirus / MIME sniff beyond extension — not in the codebase today.
- Bulk download (zip) of a supplier's files — possible later.
