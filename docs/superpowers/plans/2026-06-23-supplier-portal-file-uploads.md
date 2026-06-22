# Supplier Portal — Supporting File Uploads (Traceable, CRUD) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a supplier attach supporting files (PDF/Excel/image/doc) on the price-update portal, stored traceably in SQL, with full buyer CRUD visible in both the Compare Quotation popup and the View Quotation modal.

**Architecture:** Files are saved on disk under `uploads/supplier-files/`; a new `supplier_quotation_files` SQL table holds rich metadata keyed by `(quotationId, supplierId)` — decoupled from the pricing submission. Supplier uploads through token-authed routes; buyer manages files through internal routes. A shared JS helper renders the buyer file section in both viewers.

**Tech Stack:** Node.js + Express, SQLite (`sqlite3` + `sqlite` wrapper), Multer, vanilla JS frontend (standalone `supplier-portal.html` + `public/index.html`).

**Spec:** [docs/superpowers/specs/2026-06-23-supplier-portal-file-uploads-design.md](../specs/2026-06-23-supplier-portal-file-uploads-design.md)

## Global Constraints

- **NO GIT OPERATIONS.** The user handles all `git add/commit/push`. Implementer must never run them. Each task ends with a verification step + checkpoint, not a commit.
- **NO PLAYWRIGHT / browser automation.** Verification is via `node tests/unit/*.test.js`, `node server.js` + `curl`, and manual checks by the user.
- **File types:** `image/*`, `application/pdf`, Word (`doc`/`docx`), Excel (`xls`/`xlsx`). Enforce client-side and (backstop) via multer.
- **Size limit:** 10 MB / file (matches existing `server.js:145`).
- **DB conventions:** additive `CREATE TABLE IF NOT EXISTS` migration inside `ensureSchema` in `db/tasksDb.js`; DB functions exported + dependency-injected into routes via factories (`createXxxRoutes(deps)`). DB path overridable via `process.env.ERP_DB_PATH`; `resetTasksDbForTest()` resets the singleton.
- **Tests run via** `node tests/unit/<file>.test.js` using `_helpers.js` (`eq`, `ok`, `summary`, `tempDbPath`).
- **Spec refinement (note):** `getSupplierQuotationFiles` LEFT JOINs `suppliers.companyName` so the UI doesn't need a separate name lookup (supersedes the spec's "no join" note in §5 — same data, simpler UI wiring).

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `db/tasksDb.js` | `supplier_quotation_files` schema + 5 DB functions | Modify |
| `tests/unit/09-supplier-quotation-files.test.js` | DB-layer unit tests | Create |
| `server.js` | `supplierFilesDir` + multer fieldname; import/mount new routers; pass deps | Modify |
| `routes/supplier-files.js` | Buyer file CRUD routes (GET/POST/PATCH/DELETE) | Create |
| `routes/supplier-portal.js` | Convert to factory; supplier GET/POST `/:token/files` + `resolvePortalToken` helper | Modify |
| `public/supplier-portal.html` | Supporting Documents drop/paste zone + existing-file list | Modify |
| `public/index.html` | Shared `renderSupplierFilesSectionHtml` + helpers; wire into Compare popup + View Quotation modal | Modify |

---

## Task 1: DB layer — table + functions + unit tests (TDD)

**Files:**
- Modify: `db/tasksDb.js` (add migration inside `ensureSchema`, near the `supplier_quotation_response_tiers` table; add 5 exported functions)
- Create: `tests/unit/09-supplier-quotation-files.test.js`

**Interfaces:**
- Produces (consumed by Tasks 3 & 5): `insertSupplierQuotationFile({ quotationId, supplierId, supplierMemberId=null, tokenId=null, originalName, storedFilename, filePath, mimeType, sizeBytes, uploadedBy })` → row; `getSupplierQuotationFiles(quotationId, supplierId=null)` → row[] (each row carries `companyName` via JOIN); `getSupplierQuotationFileById(fileId)` → row|undefined; `renameSupplierQuotationFile(fileId, newName)` → row (updates `originalName` only); `deleteSupplierQuotationFile(fileId)` → row|null (caller unlinks disk).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/09-supplier-quotation-files.test.js`:

```js
import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const {
  getTasksDb,
  resetTasksDbForTest,
  insertSupplierQuotationFile,
  getSupplierQuotationFiles,
  getSupplierQuotationFileById,
  renameSupplierQuotationFile,
  deleteSupplierQuotationFile,
} = await import('../../db/tasksDb.js');

await resetTasksDbForTest();
await getTasksDb(); // builds schema incl. supplier_quotation_files

const f1 = await insertSupplierQuotationFile({
  quotationId: 1, supplierId: 10, supplierMemberId: 100, tokenId: 5,
  originalName: 'quote.pdf', storedFilename: 'quote.pdf', filePath: 'uploads/supplier-files/quote.pdf',
  mimeType: 'application/pdf', sizeBytes: 12345, uploadedBy: 'supplier',
});
ok(f1 && f1.id > 0, 'insert returns the row with an id');
eq(f1.originalName, 'quote.pdf', 'insert stores originalName');
eq(f1.uploadedBy, 'supplier', 'insert stores uploadedBy');
eq(f1.companyName, undefined || f1.companyName, 'row may carry companyName via JOIN');

await insertSupplierQuotationFile({
  quotationId: 1, supplierId: 10, supplierMemberId: 100, tokenId: 5,
  originalName: 'spec.xlsx', storedFilename: 'spec-1.xlsx', filePath: 'uploads/supplier-files/spec-1.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sizeBytes: 999, uploadedBy: 'supplier',
});
const buyerFile = await insertSupplierQuotationFile({
  quotationId: 1, supplierId: 20, supplierMemberId: null, tokenId: null,
  originalName: 'scan.jpg', storedFilename: 'scan.jpg', filePath: 'uploads/supplier-files/scan.jpg',
  mimeType: 'image/jpeg', sizeBytes: 5000, uploadedBy: 'buyer',
});
ok(buyerFile.supplierMemberId === null, 'buyer upload stores NULL supplierMemberId');

eq((await getSupplierQuotationFiles(1)).length, 3, 'list returns all files for the quotation');
const sup10 = await getSupplierQuotationFiles(1, 10);
eq(sup10.length, 2, 'filtered list returns only that supplier files');
eq(sup10[0].originalName, 'quote.pdf', 'filtered list ordered by uploadedAt ASC');
eq((await getSupplierQuotationFiles(1, 20)).length, 1, 'files list independent of response rows (decoupled)');

const got = await getSupplierQuotationFileById(f1.id);
eq(got.originalName, 'quote.pdf', 'getById returns the row');
eq(await getSupplierQuotationFileById(999999), undefined, 'getById unknown id -> undefined');

const renamed = await renameSupplierQuotationFile(f1.id, 'renamed-quote.pdf');
eq(renamed.originalName, 'renamed-quote.pdf', 'rename updates originalName');
eq(renamed.storedFilename, 'quote.pdf', 'rename does not touch storedFilename (display-only)');

const del = await deleteSupplierQuotationFile(buyerFile.id);
eq(del.id, buyerFile.id, 'delete returns the deleted row');
eq(await getSupplierQuotationFileById(buyerFile.id), undefined, 'deleted row no longer fetchable');
eq((await getSupplierQuotationFiles(1)).length, 2, 'list reflects deletion');
eq(await deleteSupplierQuotationFile(999999), null, 'delete unknown id -> null');

summary('09-supplier-quotation-files');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/09-supplier-quotation-files.test.js`
Expected: FAIL — the destructured functions are `undefined` → "insertSupplierQuotationFile is not a function" (and the table does not exist yet).

- [ ] **Step 3: Add the table migration**

In `db/tasksDb.js`, inside `ensureSchema(db)`, immediately after the existing `CREATE TABLE IF NOT EXISTS supplier_quotation_response_tiers (...)` statement, add:

```js
  await db.exec(`
    CREATE TABLE IF NOT EXISTS supplier_quotation_files (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      quotationId       INTEGER NOT NULL,
      supplierId        INTEGER NOT NULL,
      supplierMemberId  INTEGER,
      tokenId           INTEGER,
      originalName      TEXT NOT NULL,
      storedFilename    TEXT NOT NULL,
      filePath          TEXT NOT NULL,
      mimeType          TEXT,
      sizeBytes         INTEGER,
      uploadedBy        TEXT NOT NULL,
      uploadedAt        TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sqf_quotation ON supplier_quotation_files(quotationId);
  `);
```

- [ ] **Step 4: Add the 5 DB functions**

Append to `db/tasksDb.js` (e.g. right after the existing `getSupplierQuotationResponseTiersByQuotation` function), exported at module level:

```js
// ---- Supplier quotation files (supporting documents uploaded via portal / buyer) ----
// Bytes live on disk under uploads/supplier-files/; this table holds traceable metadata.
// Files are grouped by (quotationId, supplierId) and are decoupled from the pricing
// submission (supplier_quotation_responses), so they exist before/after a submit and
// never affect quotation-status logic.

export async function insertSupplierQuotationFile({
  quotationId, supplierId, supplierMemberId = null, tokenId = null,
  originalName, storedFilename, filePath, mimeType, sizeBytes, uploadedBy,
}) {
  const db = await getTasksDb();
  const uploadedAt = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO supplier_quotation_files
       (quotationId, supplierId, supplierMemberId, tokenId, originalName, storedFilename, filePath, mimeType, sizeBytes, uploadedBy, uploadedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [quotationId, supplierId, supplierMemberId, tokenId, originalName, storedFilename, filePath, mimeType, sizeBytes ?? null, uploadedBy, uploadedAt]
  );
  return getSupplierQuotationFileById(result.lastID);
}

export async function getSupplierQuotationFiles(quotationId, supplierId = null) {
  const db = await getTasksDb();
  const sel = `SELECT f.*, s.companyName
                 FROM supplier_quotation_files f
                 LEFT JOIN suppliers s ON s.id = f.supplierId`;
  if (supplierId != null) {
    return db.all(`${sel} WHERE f.quotationId = ? AND f.supplierId = ? ORDER BY f.uploadedAt ASC`, [quotationId, supplierId]);
  }
  return db.all(`${sel} WHERE f.quotationId = ? ORDER BY f.supplierId ASC, f.uploadedAt ASC`, [quotationId]);
}

export async function getSupplierQuotationFileById(fileId) {
  const db = await getTasksDb();
  return db.get(`SELECT f.*, s.companyName
                   FROM supplier_quotation_files f
                   LEFT JOIN suppliers s ON s.id = f.supplierId
                   WHERE f.id = ?`, [fileId]);
}

export async function renameSupplierQuotationFile(fileId, newName) {
  const db = await getTasksDb();
  const clean = String(newName).replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 200);
  if (!clean) throw new Error('Invalid name');
  await db.run(`UPDATE supplier_quotation_files SET originalName = ? WHERE id = ?`, [clean, fileId]);
  return getSupplierQuotationFileById(fileId);
}

export async function deleteSupplierQuotationFile(fileId) {
  const db = await getTasksDb();
  const row = await getSupplierQuotationFileById(fileId);
  if (!row) return null;
  await db.run(`DELETE FROM supplier_quotation_files WHERE id = ?`, [fileId]);
  return row; // caller unlinks row.filePath from disk
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/unit/09-supplier-quotation-files.test.js`
Expected: PASS — prints `09-supplier-quotation-files: N passed, 0 failed` and exit code 0.

- [ ] **Step 6: Checkpoint**

Do NOT run any git command. Confirm to the user the DB layer + tests pass. Stop here until the user says continue (they will commit when ready).

---

## Task 2: Multer wiring — new `supplier-files/` dir + fieldname

**Files:**
- Modify: `server.js` (dirs ~lines 72-81; multer storage ~lines 112-126)

**Interfaces:**
- Produces: multer now accepts fieldname `supplierFile` → `uploads/supplier-files/`. Reuses the existing `upload` instance and `resolveUploadName`.

- [ ] **Step 1: Add the storage directory**

In `server.js`, after `const brandsDir = path.join(uploadsDir, 'brands');` (around line 75) add:

```js
const supplierFilesDir = path.join(uploadsDir, 'supplier-files');
```

After `await fs.mkdir(brandsDir, { recursive: true });` (around line 81) add:

```js
await fs.mkdir(supplierFilesDir, { recursive: true });
```

- [ ] **Step 2: Route the new fieldname in multer storage**

Replace the existing `storage.destination` (the `destination: (req, file, cb) => { ... }` block ~lines 113-121) with:

```js
  destination: (req, file, cb) => {
    if (file.fieldname === 'profileImage') {
      cb(null, profileImagesDir);
    } else if (file.fieldname === 'attachments') {
      cb(null, attachmentsDir);
    } else if (file.fieldname === 'supplierFile') {
      cb(null, supplierFilesDir);
    } else {
      cb(new Error('Invalid field name'), null);
    }
  },
```

Replace the existing `storage.filename` (the `filename: (req, file, cb) => { ... }` block ~lines 122-125) with:

```js
  filename: (req, file, cb) => {
    const dir = file.fieldname === 'profileImage' ? profileImagesDir
      : file.fieldname === 'supplierFile' ? supplierFilesDir
      : attachmentsDir;
    cb(null, resolveUploadName(dir, file.originalname));
  }
```

- [ ] **Step 3: Verify the server boots and the dir is created**

Run (background or quick boot): `node server.js`
Expected: server starts with no errors; `uploads/supplier-files/` exists. Stop the server (Ctrl+C) once booted.

- [ ] **Step 4: Checkpoint**

No git. Tell the user the multer wiring is in place and the dir is created.

---

## Task 3: Buyer file-CRUD routes — new `routes/supplier-files.js`

**Files:**
- Create: `routes/supplier-files.js`
- Modify: `server.js` (extend the `db/tasksDb.js` import; import + mount the new router after the quotations router ~line 485)

**Interfaces:**
- Consumes (from Task 1): `getSupplierQuotationFiles`, `insertSupplierQuotationFile`, `getSupplierQuotationFileById`, `renameSupplierQuotationFile`, `deleteSupplierQuotationFile`. Consumes `upload` + `getNormalizedRelativePath` (both already in `server.js`).
- Produces: `createSupplierFileRoutes(deps)` → Express router. Endpoints (mounted at `/api`):
  - `GET    /api/quotations/:id/supplier-files`
  - `POST   /api/quotations/:id/supplier-files` (multipart `supplierFile` + body `supplierId`)
  - `PATCH  /api/supplier-files/:fileId` (body `{ newName }`)
  - `DELETE /api/supplier-files/:fileId`

- [ ] **Step 1: Create the route file**

Create `routes/supplier-files.js`:

```js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Buyer-facing management of supplier-submitted supporting files. Files are stored on
// disk under uploads/supplier-files/ and traced in supplier_quotation_files. Grouped by
// (quotationId, supplierId); decoupled from supplier_quotation_responses.
export function createSupplierFileRoutes(deps) {
  const router = express.Router();
  const {
    upload,
    getNormalizedRelativePath,
    getSupplierQuotationFiles,
    insertSupplierQuotationFile,
    getSupplierQuotationFileById,
    renameSupplierQuotationFile,
    deleteSupplierQuotationFile,
  } = deps;

  // GET all supplier files for a quotation (flat array; client groups by supplierId)
  router.get('/quotations/:id/supplier-files', async (req, res) => {
    try {
      const files = await getSupplierQuotationFiles(Number(req.params.id));
      res.json({ success: true, files });
    } catch (error) {
      console.error('Error listing supplier files:', error);
      res.status(500).json({ success: false, error: 'Failed to list supplier files' });
    }
  });

  // POST buyer adds a file on behalf of a supplier
  router.post('/quotations/:id/supplier-files', upload.single('supplierFile'), async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      const supplierId = Number(req.body && req.body.supplierId);
      if (!Number.isFinite(supplierId) || supplierId <= 0) {
        return res.status(400).json({ success: false, error: 'supplierId is required' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      const filePath = getNormalizedRelativePath(path.join(__dirname, '..'), req.file.path);
      const row = await insertSupplierQuotationFile({
        quotationId,
        supplierId,
        supplierMemberId: null,
        tokenId: null,
        originalName: req.file.originalname,
        storedFilename: req.file.filename,
        filePath,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedBy: 'buyer',
      });
      res.json({ success: true, file: row });
    } catch (error) {
      console.error('Error uploading supplier file:', error);
      res.status(500).json({ success: false, error: 'Failed to upload supplier file' });
    }
  });

  // PATCH rename (display name only; disk file untouched)
  router.patch('/supplier-files/:fileId', async (req, res) => {
    try {
      const { newName } = req.body || {};
      if (!newName) return res.status(400).json({ success: false, error: 'newName is required' });
      const row = await renameSupplierQuotationFile(Number(req.params.fileId), newName);
      if (!row) return res.status(404).json({ success: false, error: 'File not found' });
      res.json({ success: true, file: row });
    } catch (error) {
      console.error('Error renaming supplier file:', error);
      res.status(500).json({ success: false, error: 'Failed to rename supplier file' });
    }
  });

  // DELETE remove row + unlink disk file
  router.delete('/supplier-files/:fileId', async (req, res) => {
    try {
      const row = await deleteSupplierQuotationFile(Number(req.params.fileId));
      if (!row) return res.status(404).json({ success: false, error: 'File not found' });
      try {
        await fs.unlink(path.join(__dirname, '..', row.filePath));
      } catch (e) {
        console.warn('Failed to unlink supplier file from disk:', e.message);
      }
      res.json({ success: true, file: row });
    } catch (error) {
      console.error('Error deleting supplier file:', error);
      res.status(500).json({ success: false, error: 'Failed to delete supplier file' });
    }
  });

  return router;
}
```

- [ ] **Step 2: Import the 5 DB functions into `server.js`**

In `server.js`, find the existing `import { ... } from './db/tasksDb.js';` and add these five names to it: `getSupplierQuotationFiles`, `insertSupplierQuotationFile`, `getSupplierQuotationFileById`, `renameSupplierQuotationFile`, `deleteSupplierQuotationFile`.

- [ ] **Step 3: Import + mount the router**

In `server.js`, alongside the other route imports (near `import { createQuotationRoutes } from './routes/quotations.js';`) add:

```js
import { createSupplierFileRoutes } from './routes/supplier-files.js';
```

After `app.use('/api/quotations', quotationRoutes);` (around line 485) add:

```js
// Supplier supporting-file management (buyer side). Mounted at /api so the routes
// resolve to /api/quotations/:id/supplier-files and /api/supplier-files/:fileId.
const supplierFileRoutes = createSupplierFileRoutes({
  upload,
  getNormalizedRelativePath,
  getSupplierQuotationFiles,
  insertSupplierQuotationFile,
  getSupplierQuotationFileById,
  renameSupplierQuotationFile,
  deleteSupplierQuotationFile,
});
app.use('/api', supplierFileRoutes);
```

- [ ] **Step 4: Verify with curl**

Boot: `node server.js` (background). Using a real quotation id `QID` and supplier id `SID` from the dev DB:

```bash
curl -s "http://localhost:3000/api/quotations/QID/supplier-files" | head -c 400
# Expected: {"success":true,"files":[...]}

curl -s -F "supplierFile=@README.md" -F "supplierId=SID" "http://localhost:3000/api/quotations/QID/supplier-files"
# Expected: {"success":true,"file":{"id":...,"uploadedBy":"buyer","filePath":"uploads/supplier-files/README.md",...}}

# note the returned id as FID, then:
curl -s -X PATCH -H "Content-Type: application/json" -d '{"newName":"renamed.txt"}' "http://localhost:3000/api/supplier-files/FID"
# Expected: {"success":true,"file":{"originalName":"renamed.txt",...}}

curl -s -X DELETE "http://localhost:3000/api/supplier-files/FID"
# Expected: {"success":true,"file":{...}}
```

Adjust the port if the app uses a different one. Confirm `uploads/supplier-files/README.md` was created then removed. Stop the server.

- [ ] **Step 5: Checkpoint**

No git. Report the curl results to the user.

---

## Task 4: Convert `routes/supplier-portal.js` to a factory (no behavior change)

**Files:**
- Modify: `routes/supplier-portal.js` (wrap routes in a factory; remove the default export)
- Modify: `server.js` (import + mount via the factory)

**Interfaces:**
- Produces: `createSupplierPortalRoutes({ upload })` → the existing router, unchanged behavior, but now receives the multer `upload` instance. Required before Task 5 (supplier upload needs `upload`).
- Safety: `generateSupplierToken` stays a module-level named export; the only importer of the file's default export is `server.js`.

- [ ] **Step 1: Wrap the router in a factory**

In `routes/supplier-portal.js`, replace the top-level line `const router = express.Router();` (line 9) with:

```js
export function createSupplierPortalRoutes(deps) {
  const upload = deps && deps.upload;
  const router = express.Router();
```

This opens a function block; all existing `router.<method>(...)` definitions are now nested inside it unchanged.

- [ ] **Step 2: Return the router instead of default-exporting it**

At the very end of `routes/supplier-portal.js`, find `export default router;` and replace it with:

```js
  return router;
}
```

(If there is no literal `export default router;` because the file uses a different final form, instead append `return router;\n}` immediately after the last `router.<method>(...)` definition and before any trailing blank lines. Confirm the file still has exactly one top-level `createSupplierPortalRoutes` function and the named exports `generateSupplierToken` remain at module level.)

- [ ] **Step 3: Update `server.js` to use the factory**

In `server.js`, replace `import supplierPortalRouter from './routes/supplier-portal.js';` (line 64) with:

```js
import { createSupplierPortalRoutes } from './routes/supplier-portal.js';
```

Replace `app.use('/api/supplier-portal', supplierPortalRouter);` (line 602) with:

```js
const supplierPortalRouter = createSupplierPortalRoutes({ upload });
app.use('/api/supplier-portal', supplierPortalRouter);
```

- [ ] **Step 4: Verify no regression**

Boot `node server.js`. Open a supplier portal link (or curl `GET /api/supplier-portal/:someValidToken`) and confirm it still returns quotation data; submit still works. Confirm `node tests/unit/08-batch-send-status-tiers.test.js` still passes (sanity: shared module intact). Stop the server.

- [ ] **Step 5: Checkpoint**

No git. Report that the portal still works after the factory conversion.

---

## Task 5: Supplier-facing file routes — `GET/POST /:token/files`

**Files:**
- Modify: `routes/supplier-portal.js` (add imports, a `resolvePortalToken` helper, and two routes inside the factory)

**Interfaces:**
- Consumes (from Task 1): `getSupplierQuotationFiles`, `insertSupplierQuotationFile`. Consumes `upload` (from Task 4 factory deps) + `getNormalizedRelativePath`.
- Produces: `GET /api/supplier-portal/:token/files` → `{success, files}`; `POST /api/supplier-portal/:token/files` (multipart `supplierFile`) → `{success, file}` with `uploadedBy:'supplier'`, `tokenId` from the validated token.

- [ ] **Step 1: Add imports**

In `routes/supplier-portal.js`:

Extend the existing `import { ... } from '../db/tasksDb.js';` to also include `getSupplierQuotationFiles, insertSupplierQuotationFile`.

Add a new import near the other top-level imports:

```js
import { getNormalizedRelativePath } from '../utils/pathUtils.js';
```

- [ ] **Step 2: Add the token-resolve helper**

Add this module-level helper (e.g. right after `generateSupplierToken`):

```js
// Validate a portal token (exists + not expired). Returns { tokenData } on success or
// { error: { status, message } } on failure. Reused by the supplier file routes.
async function resolvePortalToken(token) {
  const db = await getTasksDb();
  const tokenData = await db.get(`SELECT * FROM supplier_quotation_tokens WHERE token = ?`, [token]);
  if (!tokenData) return { error: { status: 404, message: 'Invalid token' } };
  if (new Date(tokenData.expiresAt) < new Date()) return { error: { status: 403, message: 'Token expired' } };
  return { tokenData };
}
```

- [ ] **Step 3: Add the two routes inside the factory**

Inside `createSupplierPortalRoutes` (e.g. right after the existing `router.post('/:token/submit', ...)`, before `return router;`), add:

```js
  // GET /:token/files - list this supplier's uploaded supporting files (read-only)
  router.get('/:token/files', async (req, res) => {
    try {
      const { tokenData, error } = await resolvePortalToken(req.params.token);
      if (error) return res.status(error.status).json({ success: false, error: error.message });
      const files = await getSupplierQuotationFiles(tokenData.quotationId, tokenData.supplierId);
      res.json({ success: true, files });
    } catch (e) {
      console.error('Error listing supplier files:', e);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // POST /:token/files - supplier uploads a supporting file
  router.post('/:token/files', upload.single('supplierFile'), async (req, res) => {
    try {
      const { tokenData, error } = await resolvePortalToken(req.params.token);
      if (error) return res.status(error.status).json({ success: false, error: error.message });
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
      const filePath = getNormalizedRelativePath(path.join(__dirname, '..'), req.file.path);
      const row = await insertSupplierQuotationFile({
        quotationId: tokenData.quotationId,
        supplierId: tokenData.supplierId,
        supplierMemberId: tokenData.supplierMemberId,
        tokenId: tokenData.id,
        originalName: req.file.originalname,
        storedFilename: req.file.filename,
        filePath,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedBy: 'supplier',
      });
      res.json({ success: true, file: row });
    } catch (e) {
      console.error('Error uploading supplier file:', e);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });
```

- [ ] **Step 4: Verify with curl**

Boot `node server.js`. Obtain a valid token `T` (generate one via the existing UI's "send to supplier" flow, or read one from the dev DB `supplier_quotation_tokens`). Let `QID` = that token's `quotationId`, `SID` = its `supplierId`:

```bash
curl -s "http://localhost:3000/api/supplier-portal/T/files"
# Expected: {"success":true,"files":[...]}

curl -s -F "supplierFile=@README.md" "http://localhost:3000/api/supplier-portal/T/files"
# Expected: {"success":true,"file":{...,"uploadedBy":"supplier","supplierId":SID,...}}

curl -s "http://localhost:3000/api/quotations/QID/supplier-files"
# Expected: the file just uploaded appears (buyer endpoint also sees it)
```

Also confirm an expired/invalid token returns 403/404. Stop the server.

- [ ] **Step 5: Checkpoint**

No git. Report the supplier-route curl results.

---

## Task 6: Supplier portal UI — drop/paste zone + existing-file list

**Files:**
- Modify: `public/supplier-portal.html` (CSS in `<style>`, HTML section inside `#main`, JS in the existing `<script>`)

**Interfaces:**
- Consumes: `GET/POST /api/supplier-portal/:token/files` (from Task 5). Reads `token` (already defined in the script).

- [ ] **Step 1: Add CSS**

In the `<style>` block (e.g. after the `.loading` rule, ~line 113), add:

```css
    .file-item { display:flex; align-items:center; gap:10px; padding:8px 10px; border:1px solid #000; margin-bottom:6px; font-size:13px; background:#fff; }
    .file-item .fname { flex:1; color:#000; text-decoration:none; }
    .file-item .fmeta { font-size:11px; color:#777; }
    #filesDropZone { border:2px dashed #000; padding:24px; text-align:center; font-size:13px; color:#555; cursor:pointer; margin-bottom:12px; background:#fafafa; }
    #filesDropZone.dragover { background:#efefef; }
```

- [ ] **Step 2: Add the HTML section**

In `public/supplier-portal.html`, inside `#main`, immediately after the closing `</form>` of `#submitForm` (around line 174), add:

```html
      <div class="info-section" id="filesSection" style="display:none;">
        <h2>Supporting Documents</h2>
        <p style="font-size:12px; color:#555; margin-bottom:10px;">
          Drop, click, or paste (Ctrl+V) files to attach — PDF, Excel, image, or Word. Max 10&nbsp;MB each.
        </p>
        <div id="filesDropZone" tabindex="0">Drag &amp; drop files here, or click to browse</div>
        <input type="file" id="filesInput" multiple style="display:none;" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*">
        <div id="filesList"></div>
      </div>
```

- [ ] **Step 3: Add the JS**

In the existing `<script>` block, before the final `loadQuotation` call site or alongside the other functions (e.g. after `collectTierPrices`), add:

```js
    const SF_ALLOWED_EXT = /\.(pdf|docx?|xlsx?|jpe?g|png|gif|bmp|webp|tiff?)$/i;
    function isAllowedFile(file) {
      if (!file) return false;
      if (file.type && file.type.startsWith('image/')) return true;
      if (file.type === 'application/pdf') return true;
      if (file.type && /word/.test(file.type)) return true;
      if (file.type && /spreadsheet|excel/.test(file.type)) return true;
      return SF_ALLOWED_EXT.test(file.name);
    }
    function fmtSize(n) {
      if (!n) return '';
      if (n < 1024) return n + ' B';
      if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
      return (n / 1048576).toFixed(1) + ' MB';
    }
    function renderFileItem(f) {
      const el = document.createElement('div');
      el.className = 'file-item';
      const a = document.createElement('a');
      a.className = 'fname';
      a.textContent = f.originalName;
      a.href = '/' + f.filePath;
      a.target = '_blank';
      a.download = f.originalName;
      const meta = document.createElement('span');
      meta.className = 'fmeta';
      const who = f.uploadedBy === 'buyer' ? 'by Buyer' : 'by You';
      const when = f.uploadedAt ? new Date(f.uploadedAt).toLocaleString() : '';
      meta.textContent = fmtSize(f.sizeBytes) + ' · ' + who + ' · ' + when;
      el.appendChild(a);
      el.appendChild(meta);
      document.getElementById('filesList').appendChild(el);
    }
    async function loadFiles() {
      try {
        const r = await fetch('/api/supplier-portal/' + token + '/files');
        const d = await r.json();
        const list = document.getElementById('filesList');
        list.innerHTML = '';
        if (d.success && Array.isArray(d.files)) d.files.forEach(renderFileItem);
      } catch (e) { /* ignore */ }
    }
    async function uploadFile(file) {
      if (!isAllowedFile(file)) { alert('Unsupported file type. Use PDF, Excel, image, or Word.'); return; }
      if (file.size > 10 * 1024 * 1024) { alert('File exceeds 10 MB.'); return; }
      const fd = new FormData();
      fd.append('supplierFile', file);
      try {
        const r = await fetch('/api/supplier-portal/' + token + '/files', { method: 'POST', body: fd });
        const d = await r.json();
        if (d.success && d.file) renderFileItem(d.file);
        else alert(d.error || 'Upload failed');
      } catch (e) { alert('Upload failed'); }
    }
    function initFilesZone() {
      const zone = document.getElementById('filesDropZone');
      const input = document.getElementById('filesInput');
      if (!zone) return;
      zone.addEventListener('click', () => input.click());
      input.addEventListener('change', () => Array.from(input.files).forEach(uploadFile));
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault(); zone.classList.remove('dragover');
        Array.from(e.dataTransfer.files).forEach(uploadFile);
      });
      document.addEventListener('paste', (e) => {
        if (!(document.activeElement && document.activeElement.closest('#filesDropZone'))) return;
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].kind === 'file') { const f = items[i].getAsFile(); if (f) { e.preventDefault(); uploadFile(f); } }
        }
      });
    }
```

- [ ] **Step 4: Show the section + load existing files**

In `loadQuotation()`'s success path, immediately after `document.getElementById('main').style.display = 'block';` (around line 359), add:

```js
        document.getElementById('filesSection').style.display = 'block';
        initFilesZone();
        loadFiles();
```

- [ ] **Step 5: Verify manually (user)**

With the server running, the user opens a valid supplier portal link. Confirm: the **Supporting Documents** section appears; dragging a file, clicking to browse, and Ctrl+V (with the zone focused) all upload; uploaded files appear in the list with size/who/when; clicking a filename downloads/opens it; reloading the page shows previously uploaded files. Confirm disallowed types and >10 MB files are rejected with an alert.

- [ ] **Step 6: Checkpoint**

No git. Wait for the user's manual confirmation.

---

## Task 7: Buyer UI — shared helper + wire into both viewers

**Files:**
- Modify: `public/index.html` (add a helper block in the main `<script>`; add a placeholder + refresh call in `showCompareQuotationPopup` ~line 16299 and in `generateQuotationContentForView` ~line 20052 / `viewQuotationDetails` ~line 17223)

**Interfaces:**
- Consumes: `GET /api/quotations/:id/supplier-files`, `POST /api/quotations/:id/supplier-files`, `PATCH/DELETE /api/supplier-files/:fileId` (from Task 3). Uses the existing `showModal(...)` helper (returns `true` on OK).

- [ ] **Step 1: Add the helper functions**

In `public/index.html`, inside the main `<script>`, add this block (e.g. near the other quotation helpers, before `showCompareQuotationPopup`):

```js
    // ---- Supplier supporting files (buyer CRUD) ----
    // Shared by the Compare Quotation popup and the View Quotation modal.
    function escapeHtmlText(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
    function fmtSupplierFileSize(n){if(!n)return '';if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(1)+' MB';}
    function groupSupplierFiles(files){
      const byId={};
      (files||[]).forEach(f=>{
        if(!byId[f.supplierId]) byId[f.supplierId]={supplierId:f.supplierId, companyName:f.companyName||('Supplier #'+f.supplierId), files:[]};
        byId[f.supplierId].files.push(f);
      });
      return Object.values(byId);
    }
    function renderSupplierFilesSectionHtml(quotationId, groups){
      const body=(groups||[]).map(g=>{
        const items=(g.files||[]).map(f=>{
          const who=f.uploadedBy==='buyer'?'Buyer':'Supplier';
          const when=f.uploadedAt?new Date(f.uploadedAt).toLocaleString():'';
          return '<div class="sf-item" data-file-id="'+f.id+'" style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid #eee;font-size:12px;">'+
            '<a href="/'+f.filePath+'" target="_blank" download="'+escapeHtmlText(f.originalName)+'" style="flex:1;">'+escapeHtmlText(f.originalName)+'</a>'+
            '<span style="color:#888;">'+fmtSupplierFileSize(f.sizeBytes)+' · '+who+' · '+when+'</span>'+
            '<button class="btn sf-rename" style="font-size:10px;padding:2px 6px;">Rename</button>'+
            '<button class="btn sf-delete" style="font-size:10px;padding:2px 6px;background:#ff6b6b;color:#fff;">×</button>'+
          '</div>';
        }).join('');
        return '<div style="font-weight:600;margin:8px 0 4px;">'+escapeHtmlText(g.companyName)+'</div>'+items+
          '<button class="btn sf-add" data-supplier-id="'+g.supplierId+'" style="font-size:11px;padding:3px 8px;margin:4px 0 8px;">+ Add file</button>'+
          '<input type="file" class="sf-add-input" data-supplier-id="'+g.supplierId+'" style="display:none;" accept=".pdf,.doc,.docx,.xls,.xlsx,image/*">';
      }).join('');
      const inner=(groups&&groups.length)?body:'<p style="color:#888;font-size:12px;margin:4px 0;">No supporting documents uploaded.</p>';
      return '<div class="quotation-section supplier-files-section" data-quotation-id="'+quotationId+'" style="margin:12px 0;">'+
        '<h3 style="margin:0 0 6px 0;border-bottom:1px solid #ccc;padding-bottom:4px;">Supplier Files</h3>'+inner+
      '</div>';
    }
    async function fetchSupplierFiles(quotationId){
      try{const r=await fetch('/api/quotations/'+quotationId+'/supplier-files',{cache:'no-store'});const d=await r.json();return d.success?(d.files||[]):[];}catch(e){return [];}
    }
    async function refreshSupplierFilesSection(quotationId){
      const files=await fetchSupplierFiles(quotationId);
      const groups=groupSupplierFiles(files);
      document.querySelectorAll('.supplier-files-section[data-quotation-id="'+quotationId+'"]').forEach(sec=>{
        sec.outerHTML=renderSupplierFilesSectionHtml(quotationId,groups);
      });
      wireSupplierFiles(quotationId);
    }
    function wireSupplierFiles(quotationId){
      document.querySelectorAll('.supplier-files-section[data-quotation-id="'+quotationId+'"]').forEach(sec=>{
        sec.querySelectorAll('.sf-rename').forEach(b=>b.onclick=()=>supplierFileRename(quotationId,b));
        sec.querySelectorAll('.sf-delete').forEach(b=>b.onclick=()=>supplierFileDelete(quotationId,b));
        sec.querySelectorAll('.sf-add').forEach(b=>b.onclick=()=>{const inp=sec.querySelector('.sf-add-input[data-supplier-id="'+b.getAttribute('data-supplier-id')+'"]');if(inp)inp.click();});
        sec.querySelectorAll('.sf-add-input').forEach(inp=>inp.onchange=()=>supplierFileAdd(quotationId,inp));
      });
    }
    async function supplierFileAdd(quotationId,input){
      const file=input.files&&input.files[0];if(!file)return;
      const fd=new FormData();fd.append('supplierFile',file);fd.append('supplierId',input.getAttribute('data-supplier-id'));
      try{const r=await fetch('/api/quotations/'+quotationId+'/supplier-files',{method:'POST',body:fd});const d=await r.json();if(!d.success)await showModal({title:'Upload failed',body:d.error||'',okText:'OK'});}
      catch(e){await showModal({title:'Upload failed',body:'Network error',okText:'OK'});}
      input.value='';await refreshSupplierFilesSection(quotationId);
    }
    async function supplierFileRename(quotationId,btn){
      const item=btn.closest('.sf-item');const fileId=item.getAttribute('data-file-id');
      const cur=item.querySelector('a').textContent;const nm=window.prompt('New file name:',cur);if(nm===null||!nm.trim())return;
      try{const r=await fetch('/api/supplier-files/'+fileId,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({newName:nm})});const d=await r.json();if(!d.success)await showModal({title:'Rename failed',body:d.error||'',okText:'OK'});}
      catch(e){await showModal({title:'Rename failed',body:'Network error',okText:'OK'});}
      await refreshSupplierFilesSection(quotationId);
    }
    async function supplierFileDelete(quotationId,btn){
      const item=btn.closest('.sf-item');const fileId=item.getAttribute('data-file-id');const nm=item.querySelector('a').textContent;
      const ok=await showModal({title:'Delete file',body:'Delete "'+nm+'"?',okText:'Delete',cancelText:'Cancel'});if(!ok)return;
      try{const r=await fetch('/api/supplier-files/'+fileId,{method:'DELETE'});const d=await r.json();if(!d.success)await showModal({title:'Delete failed',body:d.error||'',okText:'OK'});}
      catch(e){await showModal({title:'Delete failed',body:'Network error',okText:'OK'});}
      await refreshSupplierFilesSection(quotationId);
    }
```

- [ ] **Step 2: Wire into the Compare Quotation popup**

In `showCompareQuotationPopup` (~line 16299), find where the popup's HTML is assembled and injected into the DOM (the responses table markup). Append this placeholder string to the popup body markup (inside the same injected container), after the responses table:

```js
        + '<div class="quotation-section supplier-files-section" data-quotation-id="' + quotationId + '"><h3 style="margin:0 0 6px 0;border-bottom:1px solid #ccc;padding-bottom:4px;">Supplier Files</h3><p style="color:#888;font-size:12px;">Loading…</p></div>'
```

Then, after the popup HTML is in the DOM and shown, add:

```js
      await refreshSupplierFilesSection(quotationId);
```

(If the variable name for the quotation id differs locally — e.g. `qid` — use that. `quotationId` is the parameter name at the function's definition.)

- [ ] **Step 3: Wire into the View Quotation modal**

In `generateQuotationContentForView` (~line 20052), append this placeholder to the returned HTML string (at the end of the sections), using the quotation id in scope:

```js
      + '<div class="quotation-section supplier-files-section" data-quotation-id="' + quotationId + '"><h3 style="margin:0 0 6px 0;border-bottom:1px solid #ccc;padding-bottom:4px;">Supplier Files</h3><p style="color:#888;font-size:12px;">Loading…</p></div>'
```

Then in `viewQuotationDetails` (~line 17223), after the generated content is injected into the modal DOM (after the `innerHTML`/insert that uses `generateQuotationContentForView`), add:

```js
      await refreshSupplierFilesSection(quotationId);
```

- [ ] **Step 4: Verify manually (user)**

With the server running and a quotation that has supplier-uploaded files (from Task 6), the user:
1. Opens the **Compare Quotation** popup → sees a **Supplier Files** section under each supplier with Rename / Delete / + Add file controls.
2. Opens the **View Quotation** modal → sees the same **Supplier Files** section listing all suppliers' files.
3. Adds a file (buyer) → it appears under the chosen supplier with "Buyer" tag.
4. Renames a file → display name updates.
5. Deletes a file → it disappears (and the disk file is removed from `uploads/supplier-files/`).

- [ ] **Step 5: Checkpoint**

No git. Wait for the user's manual confirmation.

---

## Task 8: End-to-end acceptance check

**Files:** none (verification only).

- [ ] **Step 1: Full unit suite**

Run: `node tests/unit/09-supplier-quotation-files.test.js` → PASS. Run `node tests/unit/08-batch-send-status-tiers.test.js` → PASS (no regression).

- [ ] **Step 2: End-to-end manual flow (user)**

1. Generate a supplier portal link for a quotation with a linked supplier.
2. On the portal: upload a PDF, an Excel, and an image (drag, click, paste) → all appear.
3. In the ERP: open the quotation → View Quotation modal shows the files under that supplier; Compare popup shows them too.
4. Buyer adds, renames, and deletes a file → changes reflect in both viewers and on the portal's read-only list (re-open the portal link).
5. Confirm the DB rows in `supplier_quotation_files` carry `uploadedBy`, `uploadedAt`, `tokenId` (supplier) / NULL (buyer), and the `companyName` JOIN resolves.

- [ ] **Step 3: Final checkpoint**

No git. Hand the finished, verified feature back to the user. The user will commit when ready.

---

## Self-Review (completed by plan author)

- **Spec coverage:** §1 goal → all tasks; §3 decisions → decoupling (Task 1 schema, no response FK), disk+SQL (Tasks 1-2), supplier=upload/buyer=CRUD (Tasks 5-7), 10MB/types (Tasks 2,6); §5 data model → Task 1; §6 storage wiring → Task 2; §7 routes → Tasks 3 & 5; §8 portal UI → Task 6; §9 buyer UI both viewers → Task 7; §10 CRUD matrix → Tasks 6-7; §11 errors → token 403/404 (Task 5), 400 supplierId/404 fileId (Task 3), unlink-warn (Task 3); §12 tests → Task 1 + Task 8. All covered.
- **Placeholder scan:** none — every code step shows full code; UI wiring steps name exact functions + line anchors.
- **Type/name consistency:** `getSupplierQuotationFiles(quotationId, supplierId?)`, `insertSupplierQuotationFile`, `getSupplierQuotationFileById`, `renameSupplierQuotationFile`, `deleteSupplierQuotationFile` — identical across Tasks 1, 3, 5. `renderSupplierFilesSectionHtml`, `refreshSupplierFilesSection`, `wireSupplierFiles`, `supplierFileAdd/Rename/Delete` — identical across Task 7 steps. Fieldname `supplierFile` consistent in Tasks 2, 3, 5, 6, 7.
