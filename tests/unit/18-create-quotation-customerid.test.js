import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const { getTasksDb, resetTasksDbForTest, createCustomer, createCustomerMember, createQuotation } = await import('../../db/tasksDb.js');

await resetTasksDbForTest();
const db = await getTasksDb();

const custId = await createCustomer({ companyName: 'Bid Co', emailDomain: 'bid.co', companyType: 'garment' });
await createCustomerMember(custId, { name: 'Buyer Bob', emailPrefix: 'bob', tel: '321' });
await db.run(`UPDATE customer_members SET isPrimary = 1 WHERE customerId = ?`, [custId]);

// create with customerId: snapshot must come from the primary member, customerId stored
const qId = await createQuotation({
  customerId: custId,
  customerName: 'WRONG',
  contactPerson: 'WRONG',
  email: 'wrong@wrong.com',
  phone: 'WRONG',
  productType: 'hang-tag',
  productDetails: {},
  quantity: 10,
  unitPrice: 5,
  total: 50,
  dateCreated: new Date().toISOString()
});

const q = await db.get(`SELECT customerName, contactPerson, email, phone, customerId FROM quotations WHERE id = ?`, [qId]);
eq(q.customerName, 'Bid Co', 'createQuotation snapshots companyName from master');
eq(q.contactPerson, 'Buyer Bob', 'createQuotation snapshots primary member name');
eq(q.email, 'bob@bid.co', 'createQuotation composes primary email');
eq(q.phone, '321', 'createQuotation snapshots primary phone');
eq(q.customerId, custId, 'createQuotation stores customerId');

// create without customerId: freehand values preserved, customerId null
const qId2 = await createQuotation({
  customerName: 'Walk-in',
  contactPerson: 'Someone',
  email: 'x@y.com',
  phone: '1',
  productType: 'hang-tag',
  productDetails: {},
  quantity: 1, unitPrice: 1, total: 1,
  dateCreated: new Date().toISOString()
});
const q2 = await db.get(`SELECT customerName, customerId FROM quotations WHERE id = ?`, [qId2]);
eq(q2, { customerName: 'Walk-in', customerId: null }, 'createQuotation without customerId keeps freehand values and null link');

summary('18-create-quotation-customerid');
