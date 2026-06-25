import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const { getTasksDb, resetTasksDbForTest } = await import('../../db/tasksDb.js');

// first init to create tables
await resetTasksDbForTest();
let db = await getTasksDb();
const now = new Date().toISOString();

// a customer + two members (no primary flagged), a workshop
const custId = await db.run(`INSERT INTO customers (companyName, emailDomain, companyType, createdAt, updatedAt) VALUES ('Match Co','match.co','garment',?,?)`, [now, now]);
await db.run(`INSERT INTO customer_members (customerId, name, emailPrefix, tel, createdAt, updatedAt) VALUES (?, 'Lead', 'lead', '1', ?, ?)`, [custId.lastID, now, now]);
await db.run(`INSERT INTO customer_members (customerId, name, emailPrefix, tel, createdAt, updatedAt) VALUES (?, 'Other', 'other', '2', ?, ?)`, [custId.lastID, now, now]);
const wsId = await db.run(`INSERT INTO workshops (fullCompanyName, country, status, createdAt, updatedAt) VALUES ('Match Factory','CN','active',?,?)`, [now, now]);

// legacy quotation + order linked only by name (no customerId/workshopId)
await db.run(
  `INSERT INTO quotations (customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, dateCreated, status)
   VALUES ('Match Co','STALE','stale@stale.com','STALE','hang-tag','{}',1,1,1,?,'draft')`,
  [now]
);
await db.run(
  `INSERT INTO orders (orderSeq, quotationId, quotationType, quotationSeq, customerName, contactPerson, email, phone, workshopName, country, productType, productDetails, quantity, unitPrice, total, dateCreated, createdAt, updatedAt, status)
   VALUES ('PO0000001',1,'quotation','IP0000001','Match Co','STALE','stale@stale.com','STALE','Match Factory','STALE','hang-tag','{}',1,1,1,?,?,?,'pending')`,
  [now, now, now]
);

// re-run init -> backfill fires
await resetTasksDbForTest();
db = await getTasksDb();

const q = await db.get(`SELECT customerName, contactPerson, email, phone, customerId FROM quotations WHERE customerName = 'Match Co'`);
ok(q.customerId === custId.lastID, 'backfill linked quotation.customerId by company name');
eq(q.contactPerson, 'Lead', 'backfill normalized quotation contact to primary member');
eq(q.email, 'lead@match.co', 'backfill normalized quotation email to primary member');

const o = await db.get(`SELECT customerName, contactPerson, workshopName, customerId, workshopId FROM orders WHERE orderSeq = 'PO0000001'`);
ok(o.customerId === custId.lastID, 'backfill linked order.customerId by company name');
ok(o.workshopId === wsId.lastID, 'backfill linked order.workshopId by factory name');
eq(o.workshopName, 'Match Factory', 'backfill normalized order workshopName from master');

const primaries = await db.all(`SELECT id FROM customer_members WHERE customerId = ? AND isPrimary = 1`, [custId.lastID]);
ok(primaries.length === 1, 'backfill designates exactly one primary member');

// idempotent: a second re-init leaves values stable
const qBefore = await db.get(`SELECT customerId, contactPerson, email FROM quotations WHERE customerName = 'Match Co'`);
await resetTasksDbForTest();
db = await getTasksDb();
const qAfter = await db.get(`SELECT customerId, contactPerson, email FROM quotations WHERE customerName = 'Match Co'`);
eq(qAfter, qBefore, 'backfill is idempotent on re-run');

summary('19-master-data-backfill');
