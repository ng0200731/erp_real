# Task 4 Brief — Wire propagation + primary enforcement into the update paths

**Where this fits:** Tasks 1-3 are complete in the working tree (schema columns, `getCustomerPrimaryMember`/`buildCustomerSnapshot`, `propagateCustomer`/`propagateWorkshop`). This task hooks those into the actual update paths so an edit *automatically* rewrites downstream rows.

**IMPORTANT — line numbers below are the ORIGINAL plan numbers and are now stale:** Tasks 1-3 inserted code that shifted everything after them by ~+100 lines. **Locate every function by its `export async function <name>(...)` signature and read the surrounding code before editing.** Do not trust the line numbers.

## Files
- Modify: `db/tasksDb.js`:
  - `updateCustomer` (originally `:1423`) — persist `isPrimary` in the member upsert; after the member-sync block call `enforceSinglePrimaryCustomerMember` then `propagateCustomer`.
  - `createCustomerMember` (orig `:1486`), `updateCustomerMember` (orig `:1509`), `deleteCustomerMember` (orig `:1532`) — enforce + propagate after each.
  - `updateWorkshop` (orig `:3041`) — call `propagateWorkshop(id)` at the end.
  - Add internal helper `enforceSinglePrimaryCustomerMember(customerId)` (after `propagateWorkshop`).
- Test: `tests/unit/17-sync-hooks.test.js`

## Interfaces
- Consumes: `propagateCustomer`, `propagateWorkshop` (Task 3); `getTasksDb`.
- Produces: editing a customer (or one of its members) or a workshop now automatically rewrites all linked rows.

## Step 1 — Write the failing test

Create `tests/unit/17-sync-hooks.test.js`:

```js
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
  `INSERT INTO orders (orderSeq, quotationId, quotationType, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, dateCreated, createdAt, updatedAt, status, customerId)
   VALUES ('PO0000001',1,'quotation','STALE','STALE','STALE','STALE','hang-tag','{}',1,1,1,?,?,?,'pending',?)`,
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
  `INSERT INTO orders (orderSeq, quotationId, quotationType, workshopId, workshopName, country, customerName, productType, productDetails, quantity, unitPrice, total, dateCreated, createdAt, updatedAt, status)
   VALUES ('PO0000002',1,'quotation',?,'STALE','STALE','x','hang-tag','{}',1,1,1,?,?,?,'pending')`,
  [wsId, now, now, now]
);
await updateWorkshop(wsId, { fullCompanyName: 'Factory A Renamed', country: 'VN' });
const wo = await db.get(`SELECT workshopName, country FROM orders WHERE workshopId = ?`, [wsId]);
eq(wo, { workshopName: 'Factory A Renamed', country: 'VN' }, 'updateWorkshop propagates factory fields to orders');

summary('17-sync-hooks');
```

## Step 2 — Run test to verify it fails

Run: `node tests/unit/17-sync-hooks.test.js`
Expected: FAIL — quotations still read `STALE` (propagation not hooked in), and member `isPrimary` not persisted.

## Step 3 — Add the enforcement helper

In `db/tasksDb.js`, immediately after `propagateWorkshop` (added in Task 3), add:

```js
async function enforceSinglePrimaryCustomerMember(customerId) {
  const db = await getTasksDb();
  const primaries = await db.all(
    `SELECT id FROM customer_members WHERE customerId = ? AND isPrimary = 1 ORDER BY id`,
    [customerId]
  );
  if (primaries.length === 0) {
    await db.run(
      `UPDATE customer_members SET isPrimary = 1
       WHERE id = (SELECT id FROM customer_members WHERE customerId = ? ORDER BY id LIMIT 1)`,
      [customerId]
    );
  } else if (primaries.length > 1) {
    const extraIds = primaries.slice(1).map(r => r.id);
    await db.run(
      `UPDATE customer_members SET isPrimary = 0 WHERE id IN (${extraIds.map(() => '?').join(',')})`,
      extraIds
    );
  }
}
```

## Step 4 — Persist `isPrimary` in `updateCustomer`'s member upsert

Locate `updateCustomer`. Find the member upsert loop (the `for (const member of customerData.members)` block that does UPDATE/INSERT of `name, emailPrefix, title, tel`). Replace that loop body with:

```js
    for (const member of customerData.members) {
      if (member.id) {
        await db.run(
          `UPDATE customer_members SET name = ?, emailPrefix = ?, title = ?, tel = ?, isPrimary = ?, updatedAt = ? WHERE id = ? AND customerId = ?`,
          [member.name, member.emailPrefix || null, member.title || null, member.tel || null, member.isPrimary ? 1 : 0, now, Number(member.id), id]
        );
      } else {
        await db.run(
          `INSERT INTO customer_members (customerId, name, emailPrefix, title, tel, isPrimary, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, member.name, member.emailPrefix || null, member.title || null, member.tel || null, member.isPrimary ? 1 : 0, now, now]
        );
      }
    }
```

## Step 5 — Hook enforcement + propagation into `updateCustomer`

In `updateCustomer`, immediately before its final `return true;` (which currently sits right after the member-sync block's closing brace), add:

```js
  await enforceSinglePrimaryCustomerMember(id);
  await propagateCustomer(id);

  return true;
```

(Replace the existing bare `return true;` at the end of `updateCustomer` — keep only one `return true;`.)

## Step 6 — Hook the standalone member CRUD

In `createCustomerMember`, before its `return result.lastID;`, add:

```js
  await enforceSinglePrimaryCustomerMember(customerId);
  await propagateCustomer(customerId);
```

In `updateCustomerMember`, before its `return true;`, add:

```js
  const row = await db.get(`SELECT customerId FROM customer_members WHERE id = ?`, [id]);
  if (row) {
    await enforceSinglePrimaryCustomerMember(row.customerId);
    await propagateCustomer(row.customerId);
  }
```

In `deleteCustomerMember`, replace the whole function body with:

```js
export async function deleteCustomerMember(id) {
  const db = await getTasksDb();
  const row = await db.get(`SELECT customerId FROM customer_members WHERE id = ?`, [id]);
  await db.run(`DELETE FROM customer_members WHERE id = ?`, [id]);
  if (row) {
    await enforceSinglePrimaryCustomerMember(row.customerId);
    await propagateCustomer(row.customerId);
  }
  return true;
}
```

## Step 7 — Hook `updateWorkshop`

In `updateWorkshop`, before its final `return true;` (after the UPDATE statement), add:

```js
  await propagateWorkshop(id);

  return true;
```

## Step 8 — Run test to verify it passes

Run: `node tests/unit/17-sync-hooks.test.js`
Expected: PASS — `17-sync-hooks: 6 passed, 0 failed`.

---

## Global constraints (binding)
- **NO GIT.** Never run any repository-mutating git command. Edit files and run tests only. Do NOT commit.
- **NO Playwright / browser automation.**
- Run tests with: `node tests/unit/<file>.test.js`. Working directory: `d:\project\erp2`.
- Follow TDD: failing test → confirm fail → implement → confirm pass.
- Do not modify Task 1-3 code (schema columns, helpers, propagation functions) — only wire into the update paths.
