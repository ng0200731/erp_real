// Integration test for supplier supporting-file routes (Tasks 3 + 5 of the plan).
// Boots a throwaway Express app on an ephemeral port against a temp SQLite DB with a
// local multer, so it never touches the dev server or dev DB. Verifies buyer CRUD
// routes and the token-authed supplier routes end-to-end.
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const {
  getTasksDb, resetTasksDbForTest,
  getSupplierQuotationFiles, insertSupplierQuotationFile,
  getSupplierQuotationFileById, renameSupplierQuotationFile, deleteSupplierQuotationFile,
} = await import('../../db/tasksDb.js');
const { getNormalizedRelativePath } = await import('../../utils/pathUtils.js');
const { createSupplierFileRoutes } = await import('../../routes/supplier-files.js');
const { createSupplierPortalRoutes } = await import('../../routes/supplier-portal.js');

await resetTasksDbForTest();
const db = await getTasksDb();

const now = new Date().toISOString();
const future = new Date(Date.now() + 86400000).toISOString();
const QID = 500, SID = 1, MID = 1;
await db.run(`INSERT INTO quotations (id, customerName, productType, quantity, unitPrice, total, dateCreated, status) VALUES (?, 'Test Cust', 'hang-tag', 1000, 1.5, 1500, ?, 'draft')`, [QID, now]);
await db.run(`INSERT INTO suppliers (id, companyName, emailDomain, companyType, createdAt, updatedAt) VALUES (?, 'Test Supplier', 'test.com', 'Factory', ?, ?)`, [SID, now, now]);
await db.run(`INSERT INTO supplier_members (id, supplierId, name, createdAt, updatedAt) VALUES (?, ?, 'Test Member', ?, ?)`, [MID, SID, now, now]);
await db.run(`INSERT INTO supplier_quotation_tokens (id, token, quotationId, supplierId, supplierMemberId, expiresAt, createdAt) VALUES (1, 'tok-supplier-1', ?, ?, ?, ?, ?)`, [QID, SID, MID, future, now]);

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-sf-'));
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const app = express();
app.use(express.json());
app.use('/api', createSupplierFileRoutes({
  upload, getNormalizedRelativePath,
  getSupplierQuotationFiles, insertSupplierQuotationFile, getSupplierQuotationFileById,
  renameSupplierQuotationFile, deleteSupplierQuotationFile,
}));
app.use('/api/supplier-portal', createSupplierPortalRoutes({ upload }));

const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

function form(name, content, filename) {
  const fd = new FormData();
  fd.append('supplierFile', new Blob([content]), filename);
  if (name) fd.append('supplierId', String(name));
  return fd;
}

// GET empty
let r = await fetch(`${base}/api/quotations/${QID}/supplier-files`);
let d = await r.json();
eq(r.status, 200, 'GET files -> 200');
eq(d.success, true, 'GET files -> success');
eq(d.files.length, 0, 'GET files -> empty initially');

// Buyer POST
r = await fetch(`${base}/api/quotations/${QID}/supplier-files`, { method: 'POST', body: form(SID, 'pdf-bytes', 'test.pdf') });
d = await r.json();
eq(d.success, true, 'buyer POST -> success');
ok(d.file && d.file.id > 0, 'buyer POST returns file with id');
eq(d.file.uploadedBy, 'buyer', 'buyer POST marks uploadedBy=buyer');
eq(d.file.supplierId, SID, 'buyer POST stores supplierId');
eq(d.file.originalName, 'test.pdf', 'buyer POST stores originalName');
const FID = d.file.id;

// GET now 1
r = await fetch(`${base}/api/quotations/${QID}/supplier-files`);
d = await r.json();
eq(d.files.length, 1, 'GET files -> 1 after buyer upload');

// Supplier POST via token
r = await fetch(`${base}/api/supplier-portal/tok-supplier-1/files`, { method: 'POST', body: form(null, 'xlsx-bytes', 'quote.xlsx') });
d = await r.json();
eq(d.success, true, 'supplier POST -> success');
eq(d.file.uploadedBy, 'supplier', 'supplier POST marks uploadedBy=supplier');
eq(d.file.supplierId, SID, 'supplier POST uses token supplierId');
eq(d.file.tokenId, 1, 'supplier POST stores tokenId');
eq(d.file.supplierMemberId, MID, 'supplier POST stores supplierMemberId');

// Supplier GET via token lists both files (same quotationId + supplierId)
r = await fetch(`${base}/api/supplier-portal/tok-supplier-1/files`);
d = await r.json();
eq(d.success, true, 'supplier GET -> success');
eq(d.files.length, 2, 'supplier GET lists both files');

// PATCH rename
r = await fetch(`${base}/api/supplier-files/${FID}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ newName: 'renamed.pdf' }) });
d = await r.json();
eq(d.success, true, 'PATCH rename -> success');
eq(d.file.originalName, 'renamed.pdf', 'PATCH updates originalName');

// PATCH missing newName -> 400
r = await fetch(`${base}/api/supplier-files/${FID}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
eq(r.status, 400, 'PATCH without newName -> 400');

// DELETE
r = await fetch(`${base}/api/supplier-files/${FID}`, { method: 'DELETE' });
d = await r.json();
eq(d.success, true, 'DELETE -> success');

// GET reflects deletion (1 left: supplier file)
r = await fetch(`${base}/api/quotations/${QID}/supplier-files`);
d = await r.json();
eq(d.files.length, 1, 'GET files -> 1 after delete');

// Invalid token -> 404
r = await fetch(`${base}/api/supplier-portal/does-not-exist/files`);
eq(r.status, 404, 'invalid token GET -> 404');

// Buyer POST missing supplierId -> 400
r = await fetch(`${base}/api/quotations/${QID}/supplier-files`, { method: 'POST', body: form(null, 'x', 'noid.pdf') });
eq(r.status, 400, 'buyer POST without supplierId -> 400');

server.close();
summary('10-supplier-files-routes');
