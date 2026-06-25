// Persistence + backfill test for quotation markupPercent.
//
// The "send to customer" flow has always PUT markupPercent to /api/quotations/:id,
// but until this fix updateQuotation's SET clause omitted it and neither getter
// SELECTed it — so the column was dead and the batch-send email/PDF always saw 0
// (no markup). The markup survived only as text in the status-history note
// ("Markup: N%"). This test verifies:
//   1. updateQuotation persists markupPercent and getQuotationById reads it back.
//   2. ensureSchema backfills markupPercent from the history note for legacy rows.
//   3. The backfill is idempotent and never clobbers an already-persisted value.
import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const { getTasksDb, resetTasksDbForTest, getQuotationById, updateQuotation } =
  await import('../../db/tasksDb.js');

const now = new Date().toISOString();
const NOTE_70 = 'Selected supplier: TESE | Markup: 70% | Original Unit: $0.3100 → Marked-up Unit: $0.5270 | Delivery: 14 days';

await resetTasksDbForTest();
let db = await getTasksDb();

// --- Phase A: round-trip via the real updateQuotation / getQuotationById path ---
await db.run(`INSERT INTO quotations (id, customerName, productType, productDetails, quantity, unitPrice, total, dateCreated, status) VALUES (1, 'OS0000040', 'outsource', '{}', 5000, 0.31, 1550, ?, 'send to customer')`, [now]);

const existing = await getQuotationById(1);
await updateQuotation(1, { ...existing, markupPercent: 70, selectedSupplierId: 5, selectedSupplierResponseId: 9 });

const roundTrip = await getQuotationById(1);
eq(roundTrip.markupPercent, 70, 'updateQuotation persists markupPercent (read back via getQuotationById)');
eq(roundTrip.selectedSupplierId, 5, 'selectedSupplierId still persisted alongside markupPercent');

// --- Phase B: seed legacy rows that only carry the markup in a history note ---
// Quotation 2: legacy bug row (markupPercent default 0) + a "Markup: 70%" note -> backfill target.
await db.run(`INSERT INTO quotations (id, customerName, productType, productDetails, quantity, unitPrice, total, dateCreated, status) VALUES (2, 'Legacy A', 'outsource', '{}', 5000, 0.31, 1550, ?, 'await customer confirm price')`, [now]);
await db.run(`INSERT INTO quotation_status_history (quotationId, fromStatus, toStatus, changedAt, note) VALUES (2, 'await quotation', 'send to customer', ?, ?)`, [now, NOTE_70]);

// Quotation 3: already has markupPercent=50 persisted + a stale "Markup: 70%" note -> must NOT be clobbered.
await db.run(`INSERT INTO quotations (id, customerName, productType, productDetails, quantity, unitPrice, total, dateCreated, status) VALUES (3, 'Legacy B', 'outsource', '{}', 5000, 0.31, 1550, ?, 'price confirmed')`, [now]);
const q3before = await getQuotationById(3);
await updateQuotation(3, { ...q3before, markupPercent: 50 });
await db.run(`INSERT INTO quotation_status_history (quotationId, fromStatus, toStatus, changedAt, note) VALUES (3, 'await quotation', 'send to customer', ?, ?)`, [now, NOTE_70]);

// Quotation 4: never sent to customer (no Markup note) -> stays 0.
await db.run(`INSERT INTO quotations (id, customerName, productType, productDetails, quantity, unitPrice, total, dateCreated, status) VALUES (4, 'Never Sent', 'hang-tag', '{}', 5000, 0.31, 1550, ?, 'await quotation')`, [now]);

// --- Phase C: re-trigger ensureSchema so the backfill runs ---
await resetTasksDbForTest();
db = await getTasksDb();

const q2 = await db.get(`SELECT markupPercent FROM quotations WHERE id = 2`);
eq(q2.markupPercent, 70, 'legacy row backfilled to 70 from the "Markup: 70%" history note');

const q3 = await db.get(`SELECT markupPercent FROM quotations WHERE id = 3`);
eq(q3.markupPercent, 50, 'already-persisted markupPercent (50) is not clobbered by the backfill');

const q4 = await db.get(`SELECT markupPercent FROM quotations WHERE id = 4`);
eq(q4.markupPercent, 0, 'quotation with no Markup history note stays at 0');

// Quotation 1 (set via updateQuotation, no history note) is untouched by the backfill.
const q1 = await db.get(`SELECT markupPercent FROM quotations WHERE id = 1`);
eq(q1.markupPercent, 70, 'round-tripped markupPercent survives a re-init');

// --- Phase D: idempotent — re-running init leaves backfilled values stable ---
await resetTasksDbForTest();
db = await getTasksDb();
const q2b = await db.get(`SELECT markupPercent FROM quotations WHERE id = 2`);
eq(q2b.markupPercent, 70, 're-running the backfill is idempotent (value stable)');

summary('13-markup-percent-persistence');
