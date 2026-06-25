# Master-Data Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a customer or garment-factory (workshop) record is edited, automatically rewrite the customer/factory snapshot fields on every linked quotation, outsourcing, and order row, so the Quotation, Outsourcing, and Orders view tables all stay in sync on the same page.

**Architecture:** Additive schema columns add a `customerId` link to `quotations` and `orders` and an `isPrimary` flag to `customer_members`. A `buildCustomerSnapshot` helper derives the four display fields from the customer's primary member; `propagateCustomer` / `propagateWorkshop` UPDATE every linked downstream row. These are called from inside `updateCustomer`, the member CRUD, and `updateWorkshop`. A one-time idempotent backfill links legacy rows by name and normalizes them. The frontend re-fetches the three list views after any customer/workshop save.

**Tech Stack:** Node.js (ES modules), Express, SQLite (`sqlite` + `sqlite3`), vanilla JS single-page app (`public/index.html`). Tests are plain Node scripts using `tests/unit/_helpers.js` (`eq`/`ok`/`summary`/`tempDbPath`), run with `node tests/unit/*.test.js`.

## Global Constraints

- **NO GIT.** Per project rules (`CLAUDE.md`), never run `git add` / `git commit` / `git push` / `git stage` or any repository-mutating command. Every task ends with a **Checkpoint** that shows the diff to the user and waits for their go-ahead — there are no commit steps.
- **NO Playwright / browser automation.** Tests are Node unit tests only.
- **Run tests with:** `node tests/unit/<file>.test.js` (no `test` script exists). Set `process.env.ERP_DB_PATH` to a temp DB inside each test (use `tempDbPath()` from `_helpers.js`).
- **Migration style:** all schema changes are additive `ALTER TABLE` statements wrapped in `try/catch` that ignore `duplicate column name` errors, matching the existing block at `db/tasksDb.js:505-615`.
- **Email composition:** a customer contact email is `member.emailPrefix + "@" + customer.emailDomain` (see `tasksDb.js:1539-1577` `findCustomerByEmail` and `:15894-15895`).
- **Master tables:** `customers` (buyer) and `workshops` (factory). `suppliers` is out of scope.

---

## File Structure

- `db/tasksDb.js` — all DB-layer changes: schema columns, helpers (`getCustomerPrimaryMember`, `buildCustomerSnapshot`), propagation (`propagateCustomer`, `propagateWorkshop`), hooks in `updateCustomer` / member CRUD / `updateWorkshop`, `createQuotation` / `createOrder` persistence, and the backfill block (all inside `ensureSchema`).
- `public/index.html` — primary-contact radio in the customer member form; a `refreshMasterDependentLists()` helper wired into the customer save handler (`:12015`) and the workshop save handler.
- `tests/unit/14-sync-schema-columns.test.js` — schema columns exist.
- `tests/unit/15-primary-contact-helpers.test.js` — `getCustomerPrimaryMember` + `buildCustomerSnapshot`.
- `tests/unit/16-propagate-master-sync.test.js` — `propagateCustomer` / `propagateWorkshop` rewrite rows.
- `tests/unit/17-sync-hooks.test.js` — hooks fire from `updateCustomer` / member CRUD / `updateWorkshop`; primary re-promotion.
- `tests/unit/18-create-quotation-customerid.test.js` — `createQuotation` persists `customerId` + primary snapshot.
- `tests/unit/19-master-data-backfill.test.js` — backfill links by name, designates primary, idempotent.

---

## Task 1: Add schema columns

**Files:**
- Modify: `db/tasksDb.js` — the `ALTER TABLE` migration block inside `ensureSchema` (after the `sampleCharge` block ending at `db/tasksDb.js:615`).
- Test: `tests/unit/14-sync-schema-columns.test.js`

**Interfaces:**
- Consumes: `getTasksDb`, `resetTasksDbForTest` (existing, `db/tasksDb.js:1044` / `:1062`).
- Produces: columns `quotations.customerId`, `orders.customerId`, `customer_members.isPrimary` available to all later tasks.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/14-sync-schema-columns.test.js`:

```js
import { ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const { getTasksDb, resetTasksDbForTest } = await import('../../db/tasksDb.js');

await resetTasksDbForTest();
const db = await getTasksDb();

function hasColumn(rows, name) {
  return rows.some(r => r.name === name);
}

const qCols = await db.all(`PRAGMA table_info(quotations)`);
ok(hasColumn(qCols, 'customerId'), 'quotations.customerId column exists');

const oCols = await db.all(`PRAGMA table_info(orders)`);
ok(hasColumn(oCols, 'customerId'), 'orders.customerId column exists');

const mCols = await db.all(`PRAGMA table_info(customer_members)`);
ok(hasColumn(mCols, 'isPrimary'), 'customer_members.isPrimary column exists');

summary('14-sync-schema-columns');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/14-sync-schema-columns.test.js`
Expected: FAIL — "quotations.customerId column exists" (column not present yet).

- [ ] **Step 3: Add the three ALTER blocks**

In `db/tasksDb.js`, immediately after the `sampleCharge` try/catch block (after line 615), add:

```js
  try {
    await db.exec(`ALTER TABLE quotations ADD COLUMN customerId INTEGER;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding quotations.customerId column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE orders ADD COLUMN customerId INTEGER;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding orders.customerId column:', err);
    }
  }

  try {
    await db.exec(`ALTER TABLE customer_members ADD COLUMN isPrimary INTEGER DEFAULT 0;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding customer_members.isPrimary column:', err);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/14-sync-schema-columns.test.js`
Expected: PASS — `14-sync-schema-columns: 3 passed, 0 failed`.

- [ ] **Step 5: Checkpoint**

Show the diff of `db/tasksDb.js` and the new test file to the user. Wait for go-ahead. (No git.)

---

## Task 2: Primary-contact helpers

**Files:**
- Modify: `db/tasksDb.js` — add two exported functions immediately after `findCustomerByEmail` (ends at `db/tasksDb.js:1577`).
- Test: `tests/unit/15-primary-contact-helpers.test.js`

**Interfaces:**
- Consumes: `getTasksDb`; `customer_members.isPrimary` (Task 1).
- Produces:
  - `getCustomerPrimaryMember(customerId): Promise<memberRow | null>` — returns the member flagged `isPrimary = 1`, else the lowest-`id` member, else `null`.
  - `buildCustomerSnapshot(customerId): Promise<{ customerName, contactPerson, email, phone } | null>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/15-primary-contact-helpers.test.js`:

```js
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
// mark Pam primary
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/15-primary-contact-helpers.test.js`
Expected: FAIL — `getCustomerPrimaryMember` is not a function.

- [ ] **Step 3: Implement the two helpers**

In `db/tasksDb.js`, after `findCustomerByEmail` (after line 1577), add:

```js
// ========== MASTER-DATA SYNC HELPERS ==========

export async function getCustomerPrimaryMember(customerId) {
  const db = await getTasksDb();
  let member = await db.get(
    `SELECT * FROM customer_members WHERE customerId = ? AND isPrimary = 1 LIMIT 1`,
    [customerId]
  );
  if (!member) {
    member = await db.get(
      `SELECT * FROM customer_members WHERE customerId = ? ORDER BY id LIMIT 1`,
      [customerId]
    );
  }
  return member || null;
}

export async function buildCustomerSnapshot(customerId) {
  const db = await getTasksDb();
  const customer = await db.get(`SELECT * FROM customers WHERE id = ?`, [customerId]);
  if (!customer) return null;
  const member = await getCustomerPrimaryMember(customerId);
  let email = null;
  if (member && member.emailPrefix && customer.emailDomain) {
    email = `${member.emailPrefix}@${customer.emailDomain}`;
  }
  return {
    customerName: customer.companyName,
    contactPerson: member ? (member.name || null) : null,
    email,
    phone: member ? (member.tel || null) : null
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/15-primary-contact-helpers.test.js`
Expected: PASS — `15-primary-contact-helpers: 4 passed, 0 failed`.

- [ ] **Step 5: Checkpoint**

Show the diff to the user. Wait for go-ahead. (No git.)

---

## Task 3: Propagation functions

**Files:**
- Modify: `db/tasksDb.js` — add two exported functions right after the Task 2 helpers (still before the `QUOTATION FUNCTIONS` section at `db/tasksDb.js:1579`).
- Test: `tests/unit/16-propagate-master-sync.test.js`

**Interfaces:**
- Consumes: `buildCustomerSnapshot` (Task 2); `getTasksDb`; `quotations.customerId` / `orders.customerId` / `orders.workshopId` (Task 1).
- Produces:
  - `propagateCustomer(customerId): Promise<void>` — UPDATE quotations + orders rows linked to the customer.
  - `propagateWorkshop(workshopId): Promise<void>` — UPDATE orders rows linked to the workshop.

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/16-propagate-master-sync.test.js`
Expected: FAIL — `propagateCustomer` is not a function.

- [ ] **Step 3: Implement propagation**

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

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/16-propagate-master-sync.test.js`
Expected: PASS — `16-propagate-master-sync: 4 passed, 0 failed`.

- [ ] **Step 5: Checkpoint**

Show the diff to the user. Wait for go-ahead. (No git.)

---

## Task 4: Wire propagation + primary enforcement into the update paths

**Files:**
- Modify: `db/tasksDb.js`:
  - `updateCustomer` (`:1423-1478`) — persist `isPrimary` in the member upsert; after the member-sync block call `enforceSinglePrimaryCustomerMember` then `propagateCustomer`.
  - `createCustomerMember` (`:1486`), `updateCustomerMember` (`:1509`), `deleteCustomerMember` (`:1532`) — after each change, enforce + propagate.
  - `updateWorkshop` (`:3041-3064`) — call `propagateWorkshop(id)` at the end.
  - Add internal helper `enforceSinglePrimaryCustomerMember(customerId)`.
- Test: `tests/unit/17-sync-hooks.test.js`

**Interfaces:**
- Consumes: `propagateCustomer`, `propagateWorkshop` (Task 3); `getTasksDb`.
- Produces: editing a customer (or one of its members) or a workshop now automatically rewrites all linked rows.

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/17-sync-hooks.test.js`
Expected: FAIL — quotations still read `STALE` (propagation not hooked in), and member `isPrimary` not persisted.

- [ ] **Step 3: Add the enforcement helper**

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

- [ ] **Step 4: Persist `isPrimary` in `updateCustomer`'s member upsert**

In `updateCustomer` (`db/tasksDb.js:1460-1474`), replace the upsert loop body:

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

- [ ] **Step 5: Hook enforcement + propagation into `updateCustomer`**

In `updateCustomer`, immediately before `return true;` (after the member-sync block, `db/tasksDb.js:1476`), add:

```js
  await enforceSinglePrimaryCustomerMember(id);
  await propagateCustomer(id);

  return true;
```

(Replace the existing `return true;` at the end of `updateCustomer`.)

- [ ] **Step 6: Hook the standalone member CRUD**

In `createCustomerMember` (`:1486`), before `return result.lastID;`, add:

```js
  await enforceSinglePrimaryCustomerMember(customerId);
  await propagateCustomer(customerId);
```

In `updateCustomerMember` (`:1509`), before `return true;`, add:

```js
  const row = await db.get(`SELECT customerId FROM customer_members WHERE id = ?`, [id]);
  if (row) {
    await enforceSinglePrimaryCustomerMember(row.customerId);
    await propagateCustomer(row.customerId);
  }
```

In `deleteCustomerMember` (`:1532`), change the body to capture the customerId before deleting, then enforce + propagate:

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

- [ ] **Step 7: Hook `updateWorkshop`**

In `updateWorkshop` (`:3041`), before `return true;` (after the UPDATE at `:3062`), add:

```js
  await propagateWorkshop(id);

  return true;
```

- [ ] **Step 8: Run test to verify it passes**

Run: `node tests/unit/17-sync-hooks.test.js`
Expected: PASS — `17-sync-hooks: 6 passed, 0 failed`.

- [ ] **Step 9: Checkpoint**

Show the diff to the user. Wait for go-ahead. (No git.)

---

## Task 5: Persist `customerId` and snapshot at creation

**Files:**
- Modify: `db/tasksDb.js`:
  - `createQuotation` (`:1581-1646`) — accept `customerId`, snapshot from the primary member when present, add `customerId` to the INSERT.
  - `createOrder` (`:3074-3120`) — accept `customerId`, snapshot customer fields from `buildCustomerSnapshot` when present, source `workshopName` from the workshop's `fullCompanyName` when `workshopId` is present.
- Test: `tests/unit/18-create-quotation-customerid.test.js`

**Interfaces:**
- Consumes: `buildCustomerSnapshot` (Task 2); `getTasksDb`.
- Produces: new quotation/order rows carry a `customerId` and a primary-derived snapshot, so they start in sync and are reachable by propagation.

- [ ] **Step 1: Write the failing test**

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

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/18-create-quotation-customerid.test.js`
Expected: FAIL — `customerId` not stored, snapshots not overridden (`customerName` reads `'WRONG'`).

- [ ] **Step 3: Override snapshot + add `customerId` in `createQuotation`**

In `createQuotation` (`db/tasksDb.js:1581`), immediately after the `outsourcingSeq` block (after line 1608) and before the `INSERT`, add:

```js
  const customerId = quotationData.customerId ? Number(quotationData.customerId) : null;
  if (customerId) {
    const snap = await buildCustomerSnapshot(customerId);
    if (snap) {
      quotationData = { ...quotationData, ...snap };
    }
  }
```

Then modify the INSERT statement (`:1612-1613`) to include `customerId` as the first column, and add it as the first value in the params array (`:1616`):

Column list becomes:
```
INSERT INTO quotations (customerId, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, notes, type, sourceEmailUid, sourceEmailSubject, sourceEmailMessageId, profileImagePath, attachmentPaths, dateCreated, status, outsourcingSeq, quotationSeq, brandId, customerItemName, height_mm, width_mm, variable, currency)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```
First element of the params array (before `quotationData.customerName`):
```js
    customerId,
```

- [ ] **Step 4: Override snapshot + accept `customerId` in `createOrder`**

In `createOrder` (`db/tasksDb.js:3074`), immediately after the `orderSeq` generation block (after line 3083) and before the INSERT, add:

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

Then in the INSERT column list add `customerId` after `workshopName, country,` (so the columns read `... workshopId, workshopName, country, customerId, customerName, ...`), add one extra `?` to the VALUES, and in the params array (`:3098-3104`) pass:
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
(replacing the existing `workshopName`/`country`/`customerName`/`contactPerson`/`email`/`phone` params with the local overridden variables and inserting `customerId`).

- [ ] **Step 5: Run test to verify it passes**

Run: `node tests/unit/18-create-quotation-customerid.test.js`
Expected: PASS — `18-create-quotation-customerid: 6 passed, 0 failed`.

- [ ] **Step 6: Checkpoint**

Show the diff to the user. Wait for go-ahead. (No git.)

---

## Task 6: One-time backfill

**Files:**
- Modify: `db/tasksDb.js` — add a backfill block inside `ensureSchema`, after the Task 1 ALTERs and after the existing outsourcing/IP-seq backfill logic (place it near the end of `ensureSchema`, after all CREATE/ALTER statements).
- Test: `tests/unit/19-master-data-backfill.test.js`

**Interfaces:**
- Consumes: `propagateCustomer`, `propagateWorkshop` (Task 3); `getTasksDb`.
- Produces: on init, legacy rows get `customerId`/`workshopId` links by name, each customer gets one primary member, and all linked rows are normalized to current master values. Idempotent.

- [ ] **Step 1: Write the failing test**

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
  `INSERT INTO orders (orderSeq, quotationId, quotationType, customerName, contactPerson, email, phone, workshopName, country, productType, productDetails, quantity, unitPrice, total, dateCreated, createdAt, updatedAt, status)
   VALUES ('PO0000001',1,'quotation','Match Co','STALE','stale@stale.com','STALE','Match Factory','STALE','hang-tag','{}',1,1,1,?,?,?,'pending')`,
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

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/19-master-data-backfill.test.js`
Expected: FAIL — `customerId` still null / contact still `STALE` (backfill not present).

- [ ] **Step 3: Add the backfill block**

In `db/tasksDb.js`, near the end of `ensureSchema` (after all CREATE/ALTER statements, before `ensureSchema` returns), add:

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

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/19-master-data-backfill.test.js`
Expected: PASS — `19-master-data-backfill: 8 passed, 0 failed`.

- [ ] **Step 5: Checkpoint**

Show the diff to the user. Wait for go-ahead. (No git.)

---

## Task 7: Frontend — primary-contact picker + refresh on save

**Files:**
- Modify: `public/index.html`:
  - Add a primary-contact radio to each rendered customer member row (member rows are built via `innerHTML`; locate the member-render block in the customer form near the customer view, after `:12145`).
  - Add a helper `refreshMasterDependentLists()` near the existing list loaders (`:23455` / `:23470`) and call it from the customer save success path (`:12015`) and the workshop save success path.
- Test: no automated test (the project has no DOM test harness). Verify manually via the steps below.

**Interfaces:**
- Consumes: the existing loaders `loadQuotationsFromStorage` (`:23455`) and `loadOutsourcingQuotationsFromStorage` (`:23470`), the orders list loader + renderer near `refreshOrdersBtn` (`:8683`), and the PUT endpoints `PUT /api/customers/:id` (`:12015`), `PUT /api/workshops/:id`.
- Produces: after a customer or workshop save, every open list view refreshes on the same page; customer members expose a primary selector.

- [ ] **Step 1: Add the refresh helper**

In `public/index.html`, immediately before `async function loadQuotationsFromStorage()` (`:23455`), add:

```js
    // Re-fetch every list that depends on customer/workshop master data, so all
    // open view tables refresh on the same page after a master-record edit.
    async function refreshMasterDependentLists() {
      try { await loadQuotationsFromStorage(); } catch (e) { console.warn('quotation refresh failed', e); }
      try { await loadOutsourcingQuotationsFromStorage(); } catch (e) { console.warn('outsourcing refresh failed', e); }
      try {
        const ordersRefresh = document.getElementById('refreshOrdersBtn');
        if (ordersRefresh) ordersRefresh.click();
      } catch (e) { console.warn('orders refresh failed', e); }
    }
```

- [ ] **Step 2: Call it from the customer save success path**

In the customer save handler at `public/index.html:12015` (the `fetch('/api/customers/${customer.id}', { method: 'PUT', ... })` block), add `await refreshMasterDependentLists();` immediately after the response is confirmed successful (right after the line that handles a successful `response` — before the handler re-renders the customer list or closes the form). If the handler currently re-renders the customer list on success, keep that call and add the refresh call beside it.

- [ ] **Step 3: Call it from the workshop save success path**

Locate the workshop save handler (search `index.html` for the `PUT` to `/api/workshops/`). After its successful response, add `await refreshMasterDependentLists();`.

- [ ] **Step 4: Add a primary-contact radio to customer member rows**

Find the block that builds customer member rows via `innerHTML` in the customer create/edit form (it renders inputs for each member's `name` / `emailPrefix` / `title` / `tel`). In each member row, add a radio input named `primaryMember` whose value is the member id:

```html
<label class="dtype-opt"><input type="radio" name="primaryMember" value="${member.id || ''}" ${member.isPrimary ? 'checked' : ''}> Primary</label>
```

On submit, when building the `members` payload sent to `PUT /api/customers/:id`, set `isPrimary: true` on the member whose id matches the selected radio, and `isPrimary: false` on the rest. (The `updateCustomer` member-sync path from Task 4 already persists `isPrimary`.) When adding a brand-new member row in the UI, default the first member's radio to checked.

- [ ] **Step 5: Manual verification**

Start the app (`node server.js`), then in the browser:
1. Create a customer with two members; mark one Primary; create a quotation selecting that customer.
2. Edit the customer — rename the company and change the primary member's email prefix/tel. Save.
3. Confirm the Quotation view, Outsourcing view, and Orders view all show the new company name / contact / email / phone without a manual refresh.
4. Edit a workshop's `fullCompanyName`; confirm the Orders view "Factory" column updates.
5. Confirm a sent quotation email/PDF is NOT retroactively changed (only DB rows + tables).

- [ ] **Step 6: Checkpoint**

Show the diff of `public/index.html` to the user and walk through the manual verification results. Wait for go-ahead. (No git.)

---

## Self-Review (completed)

- **Spec coverage:** §3 schema → Task 1. §4 helpers → Task 2. §5 propagation + hooks → Tasks 3 & 4. §6 create-flow → Task 5. §7 backfill → Task 6. §8 frontend → Task 7. §9 artifacts boundary → Task 7 step 5 (manual check #5). §10 edge cases (no members, primary re-promotion, duplicate names, unmatched) → covered by Tasks 2, 4, 6 tests. §11 testing → the six test files. All spec sections mapped.
- **Placeholder scan:** no TBD/TODO; every code step contains real code; frontend steps give concrete anchors and code (workshop save handler located by search because its PUT is dynamically built — the instruction is specific: "the PUT to /api/workshops/").
- **Type consistency:** `getCustomerPrimaryMember`, `buildCustomerSnapshot`, `propagateCustomer`, `propagateWorkshop`, `enforceSinglePrimaryCustomerMember` — names and signatures are identical across the tasks that define and consume them. `customerId`/`workshopId` used consistently as the link column names.
