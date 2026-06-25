# Task 3 Brief — Propagation functions

**Where this fits:** Adds `propagateCustomer` and `propagateWorkshop` — the core rewrite functions. Task 4 wires them into the update hooks; Task 6 backfill calls them.

## Files
- Modify: `db/tasksDb.js` — add two exported functions immediately after `buildCustomerSnapshot` (the second Task 2 helper) and before the `// ========== QUOTATION FUNCTIONS ==========` section header.
- Test: `tests/unit/16-propagate-master-sync.test.js`

## Interfaces
- Consumes: `buildCustomerSnapshot(customerId)` (Task 2, now in the working tree); `getTasksDb`; columns `quotations.customerId` / `orders.customerId` / `orders.workshopId` (Task 1).
- Produces:
  - `propagateCustomer(customerId): Promise<void>` — UPDATE quotations + orders rows linked to the customer.
  - `propagateWorkshop(workshopId): Promise<void>` — UPDATE orders rows linked to the workshop.

## Step 1 — Write the failing test

Create `tests/unit/16-propagate-master-sync.test.js`:

```js
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
  `INSERT INTO orders (orderSeq, quotationId, quotationType, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, dateCreated, createdAt, updatedAt, status, customerId)
   VALUES ('PO0000001', 1, 'quotation', 'STALE', 'STALE', 'STALE', 'STALE', 'hang-tag', '{}', 1, 1, 1, ?, ?, ?, 'pending', ?)`,
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
  `INSERT INTO orders (orderSeq, quotationId, quotationType, workshopId, workshopName, country, customerName, productType, productDetails, quantity, unitPrice, total, dateCreated, createdAt, updatedAt, status)
   VALUES ('PO0000002', 1, 'quotation', ?, 'STALE FACTORY', 'STALE', 'x', 'hang-tag', '{}', 1, 1, 1, ?, ?, ?, 'pending')`,
  [wsId, now, now, now]
);
await db.run(`UPDATE workshops SET fullCompanyName = 'New Factory', country = 'YY' WHERE id = ?`, [wsId]);
await propagateWorkshop(wsId);
const wo = await db.get(`SELECT workshopName, country FROM orders WHERE workshopId = ?`, [wsId]);
eq(wo, { workshopName: 'New Factory', country: 'YY' }, 'propagateWorkshop rewrites linked order factory fields');

summary('16-propagate-master-sync');
```

## Step 2 — Run test to verify it fails

Run: `node tests/unit/16-propagate-master-sync.test.js`
Expected: FAIL — `propagateCustomer` is not a function.

## Step 3 — Implement propagation

In `db/tasksDb.js`, right after `buildCustomerSnapshot` (added in Task 2), add:

```js
export async function propagateCustomer(customerId) {
  if (!customerId) return;
  const snap = await buildCustomerSnapshot(customerId);
  if (!snap) return;
  const db = await getTasksDb();
  await db.run(
    `UPDATE quotations SET customerName = ?, contactPerson = ?, email = ?, phone = ? WHERE customerId = ?`,
    [snap.customerName, snap.contactPerson, snap.email, snap.phone, customerId]
  );
  await db.run(
    `UPDATE orders SET customerName = ?, contactPerson = ?, email = ?, phone = ? WHERE customerId = ?`,
    [snap.customerName, snap.contactPerson, snap.email, snap.phone, customerId]
  );
}

export async function propagateWorkshop(workshopId) {
  if (!workshopId) return;
  const db = await getTasksDb();
  const workshop = await db.get(`SELECT fullCompanyName, country FROM workshops WHERE id = ?`, [workshopId]);
  if (!workshop) return;
  await db.run(
    `UPDATE orders SET workshopName = ?, country = ? WHERE workshopId = ?`,
    [workshop.fullCompanyName, workshop.country != null ? workshop.country : null, workshopId]
  );
}
```

## Step 4 — Run test to verify it passes

Run: `node tests/unit/16-propagate-master-sync.test.js`
Expected: PASS — `16-propagate-master-sync: 4 passed, 0 failed`.

---

## Global constraints (binding)
- **NO GIT.** Never run any repository-mutating git command. Edit files and run tests only. Do NOT commit.
- **NO Playwright / browser automation.**
- Run tests with: `node tests/unit/<file>.test.js`. Working directory: `d:\project\erp2`.
- Follow TDD: failing test → confirm fail → implement → confirm pass.

## Ambiguity resolution
Insert the two functions immediately after the closing brace of `buildCustomerSnapshot` and before the `// ========== QUOTATION FUNCTIONS ==========` section header. Read `db/tasksDb.js` around lines 1611-1650 to confirm the exact spot (Task 2 placed its helpers there). Do not touch Task 1 or Task 2 code.
