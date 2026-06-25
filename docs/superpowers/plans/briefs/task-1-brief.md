# Task 1 Brief — Add schema columns

**Where this fits:** First task of the Master-Data Sync plan. These three columns are the foundation every later task relies on.

## Files
- Modify: `db/tasksDb.js` — the `ALTER TABLE` migration block inside `ensureSchema` (insert after the `sampleCharge` block ending at `db/tasksDb.js:615`).
- Test: `tests/unit/14-sync-schema-columns.test.js`

## Interfaces
- Consumes: `getTasksDb`, `resetTasksDbForTest` (existing, `db/tasksDb.js:1044` / `:1062`).
- Produces: columns `quotations.customerId`, `orders.customerId`, `customer_members.isPrimary`.

## Step 1 — Write the failing test

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

## Step 2 — Run test to verify it fails

Run: `node tests/unit/14-sync-schema-columns.test.js`
Expected: FAIL — "quotations.customerId column exists".

## Step 3 — Add the three ALTER blocks

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

## Step 4 — Run test to verify it passes

Run: `node tests/unit/14-sync-schema-columns.test.js`
Expected: PASS — `14-sync-schema-columns: 3 passed, 0 failed`.

---

## Global constraints (binding — verbatim from the plan)

- **NO GIT.** Never run `git add` / `git commit` / `git push` / `git stage` / `git stash` or any repository-mutating git command. Edit files and run tests only. Do NOT commit.
- **NO Playwright / browser automation.**
- Run tests with: `node tests/unit/<file>.test.js` (no `test` script exists). Working directory: `d:\project\erp2`.
- Migration style: additive `ALTER TABLE` wrapped in try/catch that ignores `duplicate column name` (matches `db/tasksDb.js:505-615`).
- Follow TDD: write failing test → confirm fail → implement → confirm pass.

## Ambiguity resolution
The insertion point "after the sampleCharge block ending at line 615" is the last ALTER try/catch before the `CREATE TABLE supplier_sampling_tokens` statement (~line 617). Confirm by reading `db/tasksDb.js` lines 600-620 before editing.
