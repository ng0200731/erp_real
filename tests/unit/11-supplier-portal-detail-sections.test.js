// Integration test for Task 1: GET /api/supplier-portal/:token must return a
// server-rendered `detailSectionsHtml` — the SAME shared renderer used by
// email / PDF / View / Compare — so the portal shows full Product Information /
// Customer / Brand / Product Specifications for every product type.
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import multer from 'multer';
import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const { getTasksDb, resetTasksDbForTest } = await import('../../db/tasksDb.js');
const { createSupplierPortalRoutes } = await import('../../routes/supplier-portal.js');

await resetTasksDbForTest();
const db = await getTasksDb();

const now = new Date().toISOString();
const future = new Date(Date.now() + 86400000).toISOString();
const QID = 600, SID = 1, MID = 1, BID = 7;

// Brand for the Brand Detail section (createdAt/updatedAt are NOT NULL).
await db.run(`INSERT INTO brands (id, name, createdAt, updatedAt) VALUES (?, 'Acme Brand', ?, ?)`, [BID, now, now]);

// A filled PU Patch quotation: productType='outsource' + _productTag='pu-patch'.
// productDetails carries the pu-patch specs; customer/contact/variable/brand live on the row.
await db.run(
  `INSERT INTO quotations (id, customerName, contactPerson, email, phone, variable, brandId, customerItemName, height_mm, width_mm, productType, productDetails, quantity, unitPrice, total, dateCreated, status, outsourcingSeq)
   VALUES (?, 'Test Cust', 'Jane', 'jane@test.com', '555-0100', 'NO', ?, 'SKU-1', 50, 80, 'outsource', ?, 1000, 1.5, 1500, ?, 'draft', 'OS0000042')`,
  [QID, BID, JSON.stringify({
    _productTag: 'pu-patch',
    material: 'PU Leather',
    thickness: '2mm',
    screenPrint: '2',
    hotPress: 'YES',
    edge: 'Paint',
    metalEmbedded: 'NO',
    remark: 'sample remark',
    tierScopeMode: 'brand',
    brandTierTableId: 1,
    tiers: [{ quantity: 1000, unitPrice: 0 }],
  }), now]
);

await db.run(`INSERT INTO suppliers (id, companyName, emailDomain, companyType, createdAt, updatedAt) VALUES (?, 'Test Supplier', 'test.com', 'Factory', ?, ?)`, [SID, now, now]);
await db.run(`INSERT INTO supplier_members (id, supplierId, name, createdAt, updatedAt) VALUES (?, ?, 'Test Member', ?, ?)`, [MID, SID, now, now]);
await db.run(`INSERT INTO supplier_quotation_tokens (id, token, quotationId, supplierId, supplierMemberId, expiresAt, createdAt) VALUES (1, 'tok-detail-1', ?, ?, ?, ?, ?)`, [QID, SID, MID, future, now]);

const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-pd-'));
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
});

const app = express();
app.use(express.json());
app.use('/api/supplier-portal', createSupplierPortalRoutes({ upload }));

const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

// GET /:token now returns detailSectionsHtml
let r = await fetch(`${base}/api/supplier-portal/tok-detail-1`);
let d = await r.json();
eq(r.status, 200, 'GET :token -> 200');
eq(d.success, true, 'GET :token -> success');
ok(typeof d.detailSectionsHtml === 'string' && d.detailSectionsHtml.length > 0, 'response includes detailSectionsHtml');

// All four section headings are present
ok(d.detailSectionsHtml.includes('Product Information'), 'has Product Information section');
ok(d.detailSectionsHtml.includes('Customer Information'), 'has Customer Information section');
ok(d.detailSectionsHtml.includes('Brand Detail'), 'has Brand Detail section');
ok(d.detailSectionsHtml.includes('Product Specifications'), 'has Product Specifications section');

// Resolved brand name, decoded product type, and a decoded pu-patch spec value
ok(d.detailSectionsHtml.includes('Acme Brand'), 'resolves brand name');
ok(d.detailSectionsHtml.includes('PU Patch'), 'shows decoded PU Patch product type');
ok(d.detailSectionsHtml.includes('PU Leather'), 'shows pu-patch Material value');

// OS Ref# / Seq# row (outsourcingSeq for outsource quotations) is rendered by the
// shared Product Information section, so the portal — which has no card meta band —
// now identifies the quotation like email / PDF / View / Compare do.
ok(d.detailSectionsHtml.includes('OS Ref#'), 'portal renders OS Ref# label');
ok(d.detailSectionsHtml.includes('OS0000042'), 'portal shows the outsourcingSeq value');

// Internal tier-config keys never leak into the spec list
ok(!d.detailSectionsHtml.includes('brandTierTableId'), 'internal tier-config keys are hidden');
ok(!d.detailSectionsHtml.includes('tierScopeMode'), 'internal tierScopeMode is hidden');

// Invalid token -> 404 (unchanged)
r = await fetch(`${base}/api/supplier-portal/no-such-token`);
eq(r.status, 404, 'invalid token -> 404');

// POST submit stores the supplier-entered sample charge; a re-GET echoes it on the
// already-submitted response (sampleCharge column on supplier_quotation_responses).
r = await fetch(`${base}/api/supplier-portal/tok-detail-1/submit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ deliveryDays: 10, tierPrices: [{ quantity: 1000, unitPrice: 0.5 }], sampleCharge: 88.8 })
});
let submitBody = await r.json();
eq(r.status, 200, 'submit -> 200');
eq(submitBody.success, true, 'submit -> success');

r = await fetch(`${base}/api/supplier-portal/tok-detail-1`);
let afterBody = await r.json();
eq(afterBody.alreadySubmitted, true, 're-GET marks alreadySubmitted after submit');
ok(afterBody.existingResponse && Math.abs(Number(afterBody.existingResponse.sampleCharge) - 88.8) < 0.001, 'stored response carries sampleCharge');

server.close();
summary('11-supplier-portal-detail-sections');
