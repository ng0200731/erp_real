// Backfill test: legacy outsourcing quotations created before OS-ref assignment
// have NULL outsourcingSeq, so they show no reference number in the portal /
// email / PDF. ensureSchema must backfill an OS ref for them on the next init —
// mirroring the long-standing quotationSeq (IP) backfill for regular quotations.
import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const { getTasksDb, resetTasksDbForTest } = await import('../../db/tasksDb.js');

// 1) Fresh init (empty DB).
await resetTasksDbForTest();
let db = await getTasksDb();

// 2) Insert two legacy quotations with NO seq, bypassing createQuotation:
//    - an outsourcing quotation (productType 'outsource') — should get an OS ref
//    - a regular quotation (productType 'hang-tag') — should get an IP seq
const now = new Date().toISOString();
await db.run(`INSERT INTO quotations (id, customerName, productType, productDetails, quantity, unitPrice, total, dateCreated, status) VALUES (1, 'Legacy Outsource', 'outsource', '{}', 1000, 1, 1000, ?, 'draft')`, [now]);
await db.run(`INSERT INTO quotations (id, customerName, productType, productDetails, quantity, unitPrice, total, dateCreated, status) VALUES (2, 'Legacy Regular', 'hang-tag', '{}', 1000, 1, 1000, ?, 'draft')`, [now]);

// 3) Re-trigger ensureSchema (backfill runs on init). resetTasksDbForTest closes
//    the handle but keeps the temp file, so the rows survive and get backfilled.
await resetTasksDbForTest();
db = await getTasksDb();

const osQ = await db.get(`SELECT outsourcingSeq, quotationSeq FROM quotations WHERE id = 1`);
ok(osQ.outsourcingSeq && osQ.outsourcingSeq.startsWith('OS'), 'outsourcing quotation backfilled with an OS ref');
ok(osQ.quotationSeq == null, 'outsourcing quotation is not given an IP seq');

const regQ = await db.get(`SELECT outsourcingSeq, quotationSeq FROM quotations WHERE id = 2`);
ok(regQ.quotationSeq && regQ.quotationSeq.startsWith('IP'), 'regular quotation backfilled with an IP seq');
ok(regQ.outsourcingSeq == null, 'regular quotation is not given an OS ref');

// 4) Idempotent: re-running init must not change or duplicate the assigned OS ref.
const osRefBefore = osQ.outsourcingSeq;
await resetTasksDbForTest();
db = await getTasksDb();
const osQ2 = await db.get(`SELECT outsourcingSeq FROM quotations WHERE id = 1`);
eq(osQ2.outsourcingSeq, osRefBefore, 're-running backfill is idempotent (OS ref stable)');

summary('12-outsourcing-seq-backfill');
