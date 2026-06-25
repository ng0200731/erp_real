# Task 5 Brief — Persist `customerId` and snapshot at creation

**Where this fits:** Tasks 1-4 complete. New quotation/order rows should carry a `customerId` link and a primary-derived snapshot so they start in sync and are reachable by propagation.

**IMPORTANT — line numbers are STALE (Tasks 1-4 shifted everything down by ~150+ lines).** Locate `createQuotation` and `createOrder` by their `export async function` signatures and **read each function fully before editing.**

## Files
- Modify: `db/tasksDb.js`:
  - `createQuotation` (originally `:1581`) — accept `customerId`, snapshot from the primary member when present, add `customerId` to the INSERT.
  - `createOrder` (originally `:3074`) — accept `customerId`, snapshot customer fields from `buildCustomerSnapshot` when present, source `workshopName` from the workshop's `fullCompanyName` when `workshopId` is present.
- Test: `tests/unit/18-create-quotation-customerid.test.js`

## Interfaces
- Consumes: `buildCustomerSnapshot(customerId)` (Task 2); `getTasksDb`.
- Produces: new quotation/order rows carry `customerId` and a primary-derived snapshot.

## Step 1 — Write the failing test

Create `tests/unit/18-create-quotation-customerid.test.js`:

```js
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
```

## Step 2 — Run test to verify it fails

Run: `node tests/unit/18-create-quotation-customerid.test.js`
Expected: FAIL — `customerId` not stored, snapshots not overridden (`customerName` reads `'WRONG'`).

## Step 3 — Override snapshot + add `customerId` in `createQuotation`

Locate `createQuotation`. Immediately after the `outsourcingSeq` generation block (the block that computes `outsourcingSeq`) and **before** the `INSERT INTO quotations` statement, add:

```js
  const customerId = quotationData.customerId ? Number(quotationData.customerId) : null;
  if (customerId) {
    const snap = await buildCustomerSnapshot(customerId);
    if (snap) {
      quotationData = { ...quotationData, ...snap };
    }
  }
```

Then modify the existing `INSERT INTO quotations (...)` statement so `customerId` is the **first** column and there is one extra `?` in VALUES. The column list becomes:
```
INSERT INTO quotations (customerId, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, notes, type, sourceEmailUid, sourceEmailSubject, sourceEmailMessageId, profileImagePath, attachmentPaths, dateCreated, status, outsourcingSeq, quotationSeq, brandId, customerItemName, height_mm, width_mm, variable, currency)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```
And add `customerId,` as the **first** element of the params array (before `quotationData.customerName`).

## Step 4 — Override snapshot + accept `customerId` in `createOrder`

Locate `createOrder`. Immediately after the `orderSeq` generation block and **before** the `INSERT INTO orders` statement, add:

```js
  const customerId = orderData.customerId ? Number(orderData.customerId) : null;
  let customerName = orderData.customerName;
  let contactPerson = orderData.contactPerson || null;
  let email = orderData.email || null;
  let phone = orderData.phone || null;
  if (customerId) {
    const snap = await buildCustomerSnapshot(customerId);
    if (snap) {
      customerName = snap.customerName;
      contactPerson = snap.contactPerson;
      email = snap.email;
      phone = snap.phone;
    }
  }
  let workshopName = orderData.workshopName || null;
  if (orderData.workshopId) {
    const ws = await db.get(`SELECT fullCompanyName FROM workshops WHERE id = ?`, [orderData.workshopId]);
    if (ws && ws.fullCompanyName) workshopName = ws.fullCompanyName;
  }
```

Then in the `INSERT INTO orders (...)` column list, add `customerId` right after `workshopName, country,` (so it reads `... workshopId, workshopName, country, customerId, customerName, ...`), add one extra `?` to VALUES, and in the params array pass (replacing the previous workshopName/country/customerName/contactPerson/email/phone params with the local overridden variables):
```js
      orderData.workshopId || null,
      workshopName,
      orderData.country || null,
      customerId,
      customerName,
      contactPerson,
      email,
      phone,
```

## Step 5 — Run test to verify it passes

Run: `node tests/unit/18-create-quotation-customerid.test.js`
Expected: PASS — `18-create-quotation-customerid: 5 passed, 0 failed`. (Test has 6 `eq` calls but `q2` is one eq, so 6 assertions total — report whatever count actually prints.)

---

## Global constraints (binding)
- **NO GIT.** Never run any repository-mutating git command. Edit files and run tests only. Do NOT commit.
- **NO Playwright / browser automation.**
- Run tests with: `node tests/unit/<file>.test.js`. Working directory: `d:\project\erp2`.
- Follow TDD: failing test → confirm fail → implement → confirm pass.
- Do not modify Tasks 1-4 code — only the two create functions.
- After implementing, also run the full master-data-sync suite to confirm no regression: `node tests/unit/14-sync-schema-columns.test.js && node tests/unit/15-primary-contact-helpers.test.js && node tests/unit/16-propagate-master-sync.test.js && node tests/unit/17-sync-hooks.test.js && node tests/unit/18-create-quotation-customerid.test.js`
