import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const { getTasksDb, resetTasksDbForTest, createCustomer, createCustomerMember, getCustomerPrimaryMember, buildCustomerSnapshot } = await import('../../db/tasksDb.js');

await resetTasksDbForTest();
const db = await getTasksDb();

const custId = await createCustomer({
  companyName: 'Acme Garments',
  emailDomain: 'acme.com',
  companyType: 'garment'
});
await createCustomerMember(custId, { name: 'Secondary Sam', emailPrefix: 'sam', tel: '111' });
await createCustomerMember(custId, { name: 'Primary Pam', emailPrefix: 'pam', tel: '222' });
// mark Pam primary (clear any auto-promoted primary first, since createCustomerMember now enforces exactly-one)
await db.run(`UPDATE customer_members SET isPrimary = 0 WHERE customerId = ?`, [custId]);
await db.run(`UPDATE customer_members SET isPrimary = 1 WHERE customerId = ? AND name = 'Primary Pam'`, [custId]);

const pm = await getCustomerPrimaryMember(custId);
eq(pm.name, 'Primary Pam', 'getCustomerPrimaryMember returns the flagged primary member');

// fallback to lowest-id member when none flagged
await db.run(`UPDATE customer_members SET isPrimary = 0 WHERE customerId = ?`, [custId]);
const fallback = await getCustomerPrimaryMember(custId);
eq(fallback.name, 'Secondary Sam', 'falls back to lowest-id member when no primary flagged');

// re-flag for snapshot
await db.run(`UPDATE customer_members SET isPrimary = 1 WHERE customerId = ? AND name = 'Primary Pam'`, [custId]);
const snap = await buildCustomerSnapshot(custId);
eq(snap, {
  customerName: 'Acme Garments',
  contactPerson: 'Primary Pam',
  email: 'pam@acme.com',
  phone: '222'
}, 'buildCustomerSnapshot composes email from prefix@domain');

// customer with no members
const custId2 = await createCustomer({ companyName: 'Solo Co', emailDomain: 'solo.co', companyType: 'garment' });
const snap2 = await buildCustomerSnapshot(custId2);
eq(snap2, { customerName: 'Solo Co', contactPerson: null, email: null, phone: null }, 'customer with no members yields null contact fields');

summary('15-primary-contact-helpers');
