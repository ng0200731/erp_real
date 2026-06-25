import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const {
  getTasksDb, resetTasksDbForTest,
  createCustomer, updateCustomer,
  createWorkshop, updateWorkshop
} = await import('../../db/tasksDb.js');

await resetTasksDbForTest();
const db = await getTasksDb();
const now = new Date().toISOString();

// customer with a quotation + order, both linked
const custId = await createCustomer({ companyName: 'Cust A', emailDomain: 'a.com', companyType: 'garment' });
await db.run(
  `INSERT INTO quotations (customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, dateCreated, status, customerId)
   VALUES ('STALE','STALE','STALE','STALE','hang-tag','{}',1,1,1,?,'draft',?)`,
  [now, custId]
);
await db.run(
  `INSERT INTO orders (orderSeq, quotationId, quotationType, quotationSeq, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, dateCreated, createdAt, updatedAt, status, customerId)
   VALUES ('PO0000001',1,'quotation','IP0000001','STALE','STALE','STALE','STALE','hang-tag','{}',1,1,1,?,?,?,'pending',?)`,
  [now, now, now, custId]
);

// updateCustomer with a new primary member + renamed company must propagate
await updateCustomer(custId, {
  companyName: 'Cust A Renamed',
  emailDomain: 'a.com',
  companyType: 'garment',
  members: [
    { name: 'Main Person', emailPrefix: 'main', tel: '555', isPrimary: true }
  ]
});
const q = await db.get(`SELECT customerName, contactPerson, email, phone FROM quotations WHERE customerId = ?`, [custId]);
eq(q, { customerName: 'Cust A Renamed', contactPerson: 'Main Person', email: 'main@a.com', phone: '555' }, 'updateCustomer propagates to quotations');

// two members both flagged primary must collapse to exactly one, then propagate
await updateCustomer(custId, {
  companyName: 'Cust A Renamed', emailDomain: 'a.com', companyType: 'garment',
  members: [
    { name: 'M1', emailPrefix: 'm1', tel: '1', isPrimary: true },
    { name: 'M2', emailPrefix: 'm2', tel: '2', isPrimary: true }
  ]
});
const primaries = await db.all(`SELECT id FROM customer_members WHERE customerId = ? AND isPrimary = 1`, [custId]);
ok(primaries.length === 1, 'exactly one primary member remains after both flagged');

// deleting the primary member via updateCustomer promotes another, and propagation uses it
await updateCustomer(custId, {
  companyName: 'Cust A Renamed', emailDomain: 'a.com', companyType: 'garment',
  members: [
    { name: 'Only One', emailPrefix: 'only', tel: '777' }   // no isPrimary set
  ]
});
const pm = await db.get(`SELECT name FROM customer_members WHERE customerId = ? AND isPrimary = 1`, [custId]);
eq(pm.name, 'Only One', 'a sole remaining member is auto-promoted to primary');
const q2 = await db.get(`SELECT contactPerson, phone FROM quotations WHERE customerId = ?`, [custId]);
eq(q2, { contactPerson: 'Only One', phone: '777' }, 'propagation after primary re-promotion uses the new primary');

// workshop update propagates to its orders
const wsId = await createWorkshop({ fullCompanyName: 'Factory A', country: 'CN' });
await db.run(
  `INSERT INTO orders (orderSeq, quotationId, quotationType, quotationSeq, workshopId, workshopName, country, customerName, productType, productDetails, quantity, unitPrice, total, dateCreated, createdAt, updatedAt, status)
   VALUES ('PO0000002',1,'quotation','IP0000002',?,'STALE','STALE','x','hang-tag','{}',1,1,1,?,?,?,'pending')`,
  [wsId, now, now, now]
);
await updateWorkshop(wsId, { fullCompanyName: 'Factory A Renamed', country: 'VN' });
const wo = await db.get(`SELECT workshopName, country FROM orders WHERE workshopId = ?`, [wsId]);
eq(wo, { workshopName: 'Factory A Renamed', country: 'VN' }, 'updateWorkshop propagates factory fields to orders');

summary('17-sync-hooks');
