import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const {
  getTasksDb, resetTasksDbForTest,
  createCustomer, createCustomerMember,
  createWorkshop,
  propagateCustomer, propagateWorkshop
} = await import('../../db/tasksDb.js');

await resetTasksDbForTest();
const db = await getTasksDb();
const now = new Date().toISOString();

// --- customer propagation onto quotations + orders ---
const custId = await createCustomer({ companyName: 'Old Name', emailDomain: 'old.com', companyType: 'garment' });
await createCustomerMember(custId, { name: 'Old Contact', emailPrefix: 'old', tel: '000' });
await db.run(`UPDATE customer_members SET isPrimary = 1 WHERE customerId = ?`, [custId]);

// a quotation linked to this customer, with stale snapshot
await db.run(
  `INSERT INTO quotations (customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, dateCreated, status, customerId)
   VALUES ('STALE', 'STALE', 'STALE', 'STALE', 'hang-tag', '{}', 1, 1, 1, ?, 'draft', ?)`,
  [now, custId]
);
// an order linked to this customer, with stale snapshot
await db.run(
  `INSERT INTO orders (orderSeq, quotationId, quotationType, quotationSeq, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, dateCreated, createdAt, updatedAt, status, customerId)
   VALUES ('PO0000001', 1, 'quotation', 'IP0000001', 'STALE', 'STALE', 'STALE', 'STALE', 'hang-tag', '{}', 1, 1, 1, ?, ?, ?, 'pending', ?)`,
  [now, now, now, custId]
);

// rename the customer + primary member, then propagate
await db.run(`UPDATE customers SET companyName = 'New Name', emailDomain = 'new.com' WHERE id = ?`, [custId]);
await db.run(`UPDATE customer_members SET name = 'New Contact', emailPrefix = 'new', tel = '999' WHERE customerId = ?`, [custId]);
await propagateCustomer(custId);

const q = await db.get(`SELECT customerName, contactPerson, email, phone FROM quotations WHERE customerId = ?`, [custId]);
eq(q, { customerName: 'New Name', contactPerson: 'New Contact', email: 'new@new.com', phone: '999' }, 'propagateCustomer rewrites linked quotation snapshot');

const o = await db.get(`SELECT customerName, contactPerson, email, phone FROM orders WHERE customerId = ?`, [custId]);
eq(o, { customerName: 'New Name', contactPerson: 'New Contact', email: 'new@new.com', phone: '999' }, 'propagateCustomer rewrites linked order snapshot');

// unlinked quotation is untouched
await db.run(
  `INSERT INTO quotations (customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, dateCreated, status)
   VALUES ('UNLINKED', null, null, null, 'hang-tag', '{}', 1, 1, 1, ?, 'draft')`,
  [now]
);
await propagateCustomer(custId);
const u = await db.get(`SELECT customerName FROM quotations WHERE customerName = 'UNLINKED'`);
eq(u.customerName, 'UNLINKED', 'propagateCustomer leaves rows without a customerId untouched');

// --- workshop propagation onto orders ---
const wsId = await createWorkshop({ fullCompanyName: 'Old Factory', country: 'XX' });
await db.run(
  `INSERT INTO orders (orderSeq, quotationId, quotationType, quotationSeq, workshopId, workshopName, country, customerName, productType, productDetails, quantity, unitPrice, total, dateCreated, createdAt, updatedAt, status)
   VALUES ('PO0000002', 1, 'quotation', 'IP0000002', ?, 'STALE FACTORY', 'STALE', 'x', 'hang-tag', '{}', 1, 1, 1, ?, ?, ?, 'pending')`,
  [wsId, now, now, now]
);
await db.run(`UPDATE workshops SET fullCompanyName = 'New Factory', country = 'YY' WHERE id = ?`, [wsId]);
await propagateWorkshop(wsId);
const wo = await db.get(`SELECT workshopName, country FROM orders WHERE workshopId = ?`, [wsId]);
eq(wo, { workshopName: 'New Factory', country: 'YY' }, 'propagateWorkshop rewrites linked order factory fields');

summary('16-propagate-master-sync');
