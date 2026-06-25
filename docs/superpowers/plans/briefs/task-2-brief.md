# Task 2 Brief — Primary-contact helpers

**Where this fits:** Adds two pure helper functions that derive a customer's display snapshot from its primary member. Task 3 (propagation) and Task 4 (hooks) and Task 5 (create-flow) all consume them.

## Files
- Modify: `db/tasksDb.js` — add two exported functions immediately after `findCustomerByEmail` (which ends at `db/tasksDb.js:1577`).
- Test: `tests/unit/15-primary-contact-helpers.test.js`

## Interfaces
- Consumes: `getTasksDb`; the `customer_members.isPrimary` column (added in Task 1).
- Produces:
  - `getCustomerPrimaryMember(customerId): Promise<memberRow | null>` — returns the member flagged `isPrimary = 1`, else the lowest-`id` member, else `null`.
  - `buildCustomerSnapshot(customerId): Promise<{ customerName, contactPerson, email, phone } | null>`.

## Step 1 — Write the failing test

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

## Step 2 — Run test to verify it fails

Run: `node tests/unit/15-primary-contact-helpers.test.js`
Expected: FAIL — `getCustomerPrimaryMember` is not a function.

## Step 3 — Implement the two helpers

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

## Step 4 — Run test to verify it passes

Run: `node tests/unit/15-primary-contact-helpers.test.js`
Expected: PASS — `15-primary-contact-helpers: 4 passed, 0 failed`.

---

## Global constraints (binding)
- **NO GIT.** Never run any repository-mutating git command (`add`/`commit`/`push`/`stage`/`stash`). Edit files and run tests only. Do NOT commit.
- **NO Playwright / browser automation.**
- Run tests with: `node tests/unit/<file>.test.js`. Working directory: `d:\project\erp2`.
- Follow TDD: failing test → confirm fail → implement → confirm pass.
- Email composition rule: a customer contact email is `member.emailPrefix + "@" + customer.emailDomain`.

## Ambiguity resolution
Insert the new functions immediately after the closing brace of `findCustomerByEmail` (read `db/tasksDb.js` lines 1570-1582 to confirm). Keep the existing `// ========== QUOTATION FUNCTIONS ==========` section header below the new code.
