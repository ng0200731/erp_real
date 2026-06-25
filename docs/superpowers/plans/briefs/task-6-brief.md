# Task 6 Brief — One-time backfill

**Where this fits:** Tasks 1-5 complete. This idempotent backfill (runs inside `ensureSchema`) links legacy rows by name, designates one primary member per customer, and normalizes all linked rows to current master values.

**IMPORTANT — line numbers are stale.** Locate `ensureSchema` (the function that runs all the `CREATE TABLE` / `ALTER TABLE` / existing backfills) by signature.

## Files
- Modify: `db/tasksDb.js` — add a backfill block near the **end of `ensureSchema`**, after all CREATE/ALTER statements and after the existing outsourcing/IP-seq backfill logic, before `ensureSchema` returns.
- Test: `tests/unit/19-master-data-backfill.test.js`

## Interfaces
- Consumes: `propagateCustomer`, `propagateWorkshop` (Task 3); `getTasksDb`.
- Produces: on init, legacy rows get `customerId`/`workshopId` links by name, each customer gets one primary member, and all linked rows normalize. Idempotent.

## Step 1 — Write the failing test

Create `tests/unit/19-master-data-backfill.test.js`:

```js
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
```

NOTE: the `orders` INSERT here includes `quotationSeq` (NOT NULL) and uses `db.run(...)` which returns `{ lastID, changes }` — so `custId.lastID` / `wsId.lastID` are the inserted ids.

## Step 2 — Run test to verify it fails

Run: `node tests/unit/19-master-data-backfill.test.js`
Expected: FAIL — `customerId` still null / contact still `STALE` (backfill not present).

## Step 3 — Add the backfill block

In `db/tasksDb.js`, near the end of `ensureSchema` (after all CREATE/ALTER statements and existing backfills, before `ensureSchema` returns), add:

```js
  // ── Master-data sync backfill (idempotent) ────────────────────────────
  // 1. One primary member per customer (promote lowest-id if none).
  await db.run(
    `UPDATE customer_members SET isPrimary = 1
     WHERE id IN (
       SELECT MIN(id) FROM customer_members
       WHERE customerId NOT IN (SELECT DISTINCT customerId FROM customer_members WHERE isPrimary = 1)
       GROUP BY customerId
     )`
  );

  // 2. Link quotations by company name.
  await db.run(
    `UPDATE quotations
     SET customerId = (SELECT id FROM customers WHERE customers.companyName = quotations.customerName COLLATE NOCASE LIMIT 1)
     WHERE customerId IS NULL AND customerName IS NOT NULL`
  );

  // 3. Link orders — customer by name, workshop by name.
  await db.run(
    `UPDATE orders
     SET customerId = (SELECT id FROM customers WHERE customers.companyName = orders.customerName COLLATE NOCASE LIMIT 1)
     WHERE customerId IS NULL AND customerName IS NOT NULL`
  );
  await db.run(
    `UPDATE orders
     SET workshopId = (SELECT id FROM workshops WHERE workshops.fullCompanyName = orders.workshopName COLLATE NOCASE LIMIT 1)
     WHERE workshopId IS NULL AND workshopName IS NOT NULL`
  );

  // 4. Normalize all linked rows to current master values.
  const custIds = await db.all(`SELECT DISTINCT customerId FROM quotations WHERE customerId IS NOT NULL
                                UNION SELECT DISTINCT customerId FROM orders WHERE customerId IS NOT NULL`);
  for (const { customerId } of custIds) {
    await propagateCustomer(customerId);
  }
  const wsIds = await db.all(`SELECT DISTINCT workshopId FROM orders WHERE workshopId IS NOT NULL`);
  for (const { workshopId } of wsIds) {
    await propagateWorkshop(workshopId);
  }

  // 5. Report unmatched legacy rows (no link -> cannot auto-update).
  const unlinkedQ = await db.get(`SELECT COUNT(*) AS c FROM quotations WHERE customerId IS NULL`);
  const unlinkedO = await db.get(`SELECT COUNT(*) AS c FROM orders WHERE customerId IS NULL AND workshopId IS NULL`);
  if (unlinkedQ.c || unlinkedO.c) {
    console.warn(`[master-data-sync] unlinked rows left on stale snapshots: quotations=${unlinkedQ.c}, orders(no customer & no workshop)=${unlinkedO.c}`);
  }
```

## Step 4 — Run test to verify it passes

Run: `node tests/unit/19-master-data-backfill.test.js`
Expected: PASS — `19-master-data-backfill: 8 passed, 0 failed`.

---

## Global constraints (binding)
- **NO GIT.** Never run any repository-mutating git command. Edit files and run tests only. Do NOT commit.
- **NO Playwright / browser automation.**
- Run tests with: `node tests/unit/<file>.test.js`. Working directory: `d:\project\erp2`.
- Follow TDD: failing test → confirm fail → implement → confirm pass.
- Do not modify Tasks 1-5 code.
- `propagateCustomer`/`propagateWorkshop` are module-level `export async function` declarations — hoisted, so calling them from `ensureSchema` at init is safe even though they are defined later in the file.
- After implementing, run the full master-data-sync suite to confirm no regression: `node tests/unit/14-sync-schema-columns.test.js && node tests/unit/15-primary-contact-helpers.test.js && node tests/unit/16-propagate-master-sync.test.js && node tests/unit/17-sync-hooks.test.js && node tests/unit/18-create-quotation-customerid.test.js && node tests/unit/19-master-data-backfill.test.js`
