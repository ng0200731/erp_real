# Task 6 Report — Master-data backfill in ensureSchema

## Status
DONE_WITH_CONCERNS

## Files edited
- `d:\project\erp2\db\tasksDb.js` — added the idempotent backfill block at the end of `ensureSchema`; refactored `propagateCustomer` / `propagateWorkshop` / `buildCustomerSnapshot` internals to break an init-time deadlock.
- `d:\project\erp2\tests\unit\19-master-data-backfill.test.js` — new test (verbatim from the brief).

## Test summary
14-19 all green (3+4+4+5+6+8 = 30 passed, 0 failed).

## Insertion point
Placed the backfill as the **final block** of `ensureSchema`, immediately before the function's closing brace (after the legacy pricing-tier migration block, which itself follows the outsourcing/IP-seq backfills the brief named). This satisfies "near the END of ensureSchema, after all CREATE/ALTER statements and after the existing outsourcing/IP-seq backfill, before ensureSchema returns."

```js
  // ── Master-data sync backfill (idempotent) ────────────────────────────
  // 1. One primary member per customer (promote lowest-id if none).
  try {
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
      await _propagateCustomerWith(db, customerId);
    }
    const wsIds = await db.all(`SELECT DISTINCT workshopId FROM orders WHERE workshopId IS NOT NULL`);
    for (const { workshopId } of wsIds) {
      await _propagateWorkshopWith(db, workshopId);
    }

    // 5. Report unmatched legacy rows (no link -> cannot auto-update).
    const unlinkedQ = await db.get(`SELECT COUNT(*) AS c FROM quotations WHERE customerId IS NULL`);
    const unlinkedO = await db.get(`SELECT COUNT(*) AS c FROM orders WHERE customerId IS NULL AND workshopId IS NULL`);
    if (unlinkedQ.c || unlinkedO.c) {
      console.warn(`[master-data-sync] unlinked rows left on stale snapshots: quotations=${unlinkedQ.c}, orders(no customer & no workshop)=${unlinkedO.c}`);
    }
  } catch (err) {
    console.warn('Error running master-data sync backfill:', err);
  }
```

## Deviation from the brief — and why
The brief's step 3 calls the **public** `propagateCustomer` / `propagateWorkshop` from inside `ensureSchema`. That deadlocks on init: both functions begin with `const db = await getTasksDb();`, and `getTasksDb` returns the *same* `dbPromise` whose IIFE is currently inside `ensureSchema` — so the `await` never resolves and the test wedges with "Detected unsettled top-level await" (no assertions ever run).

`buildCustomerSnapshot` has the same shape (`getTasksDb()` first line).

**Fix (no behavioral change to Tasks 1-5 paths):** I extracted db-parameterised internal helpers and made the public functions thin wrappers:

- `_buildCustomerSnapshotWith(db, customerId)` — body of the old `buildCustomerSnapshot`, but uses the passed `db` and reads the primary-member rows inline (no `getTasksDb`).
- `_propagateCustomerWith(db, customerId)` — body of the old `propagateCustomer`, using `_buildCustomerSnapshotWith`.
- `_propagateWorkshopWith(db, workshopId)` — body of the old `propagateWorkshop`, using the passed `db`.
- `propagateCustomer(customerId)` → `const db = await getTasksDb(); await _propagateCustomerWith(db, customerId);`
- `propagateWorkshop(workshopId)` → `const db = await getTasksDb(); await _propagateWorkshopWith(db, workshopId);`

The backfill in `ensureSchema` calls the `_*With(db, ...)` forms directly (it already holds the open `db`), avoiding the recursive `getTasksDb()` lookup. The public exports keep identical signatures and externally-observable behavior, so Task 3/5 callers (hooks, create-flow) are unaffected — confirmed by 16-propagate-master-sync and 17-sync-hooks still passing.

The original `buildCustomerSnapshot` and `getCustomerPrimaryMember` exports are left intact (still used by routes); the new helper just duplicates the snapshot read inline so it can take `db`.

## Test commands
```
node tests/unit/19-master-data-backfill.test.js
```
Regression suite:
```
node tests/unit/14-sync-schema-columns.test.js
node tests/unit/15-primary-contact-helpers.test.js
node tests/unit/16-propagate-master-sync.test.js
node tests/unit/17-sync-hooks.test.js
node tests/unit/18-create-quotation-customerid.test.js
node tests/unit/19-master-data-backfill.test.js
```

## Full output

### Test 19 (after fix)
```
  ok - backfill linked quotation.customerId by company name
  ok - backfill normalized quotation contact to primary member
  ok - backfill normalized quotation email to primary member
  ok - backfill linked order.customerId by company name
  ok - backfill linked order.workshopId by factory name
  ok - backfill normalized order workshopName from master
  ok - backfill designates exactly one primary member
  ok - backfill is idempotent on re-run
19-master-data-backfill: 8 passed, 0 failed
```

### Regression 14-19
```
=== 14-sync-schema-columns ===      14-sync-schema-columns: 3 passed, 0 failed
=== 15-primary-contact-helpers ===  15-primary-contact-helpers: 4 passed, 0 failed
=== 16-propagate-master-sync ===    16-propagate-master-sync: 4 passed, 0 failed
=== 17-sync-hooks ===               17-sync-hooks: 5 passed, 0 failed
=== 18-create-quotation-customerid === 18-create-quotation-customerid: 6 passed, 0 failed
=== 19-master-data-backfill ===     19-master-data-backfill: 8 passed, 0 failed
```

## Concerns
1. **Deviation from the brief's literal "Consumes: propagateCustomer/propagateWorkshop".** Calling them verbatim deadlocks at init (they re-enter `getTasksDb()` which is mid-resolve). Resolved by extracting `_*With(db, ...)` internals; the public exports are unchanged in signature and behavior. Flagging because it's a structural change to Task 3 code, even though it's behavior-preserving and 16/17 still pass.
2. The brief's literal `propagateCustomer`/`propagateWorkshop` calls would have failed silently in production init (deadlock) — worth a note if later tasks also assumed you can call propagators from inside `ensureSchema`.

---

## Dedupe fix (carryover from Task 6 review)

The primary-member lookup logic was duplicated: once in the public
`getCustomerPrimaryMember(customerId)` and again inline in
`_buildCustomerSnapshotWith(db, customerId)`. Both were byte-equivalent but
could drift. Extracted a single shared internal helper.

### Changes (db/tasksDb.js)
- **Added** `_getCustomerPrimaryMemberWith(db, customerId)` — lines 1683-1695.
  Contains the two-step primary lookup (primary-flagged `ORDER BY id LIMIT 1`,
  else fallback `ORDER BY id LIMIT 1`, else null) using the passed `db` handle.
  This is the exact logic that was inlined in `_buildCustomerSnapshotWith`.
- **Refactored** public `getCustomerPrimaryMember(customerId)` — lines 1697-1700.
  Now: `const db = await getTasksDb(); return _getCustomerPrimaryMemberWith(db, customerId);`
- **Refactored** `_buildCustomerSnapshotWith(db, customerId)` — line 1722.
  Replaced the 10-line inline two-step query with
  `const member = await _getCustomerPrimaryMemberWith(db, customerId);`.

Result: ONE primary-lookup implementation shared by the public path
(`getCustomerPrimaryMember` → `buildCustomerSnapshot` → create-flow) and the
backfill path (`_buildCustomerSnapshotWith`). No externally-observable change.

### Test output (exact)

**1. `node tests/unit/15-primary-contact-helpers.test.js`** — exit 0
```
  ok - getCustomerPrimaryMember returns the flagged primary member
  ok - falls back to lowest-id member when no primary flagged
  ok - buildCustomerSnapshot composes email from prefix@domain
  ok - customer with no members yields null contact fields

15-primary-contact-helpers: 4 passed, 0 failed
```

**2. `node tests/unit/18-create-quotation-customerid.test.js`** — exit 0
```
  ok - createQuotation snapshots companyName from master
  ok - createQuotation snapshots primary member name
  ok - createQuotation composes primary email
  ok - createQuotation snapshots primary phone
  ok - createQuotation stores customerId
  ok - createQuotation without customerId keeps freehand values and null link

18-create-quotation-customerid: 6 passed, 0 failed
```

**3. `node tests/unit/19-master-data-backfill.test.js`** — exit 0
```
  ok - backfill linked quotation.customerId by company name
  ok - backfill normalized quotation contact to primary member
  ok - backfill normalized quotation email to primary member
  ok - backfill linked order.customerId by company name
  ok - backfill linked order.workshopId by factory name
  ok - backfill normalized order workshopName from master
  ok - backfill designates exactly one primary member
  ok - backfill is idempotent on re-run

19-master-data-backfill: 8 passed, 0 failed
```

**4. Full suite (14→19, chained `&&`)** — exit 0
```
14-sync-schema-columns:      3 passed, 0 failed
15-primary-contact-helpers:  4 passed, 0 failed
16-propagate-master-sync:    4 passed, 0 failed
17-sync-hooks:               5 passed, 0 failed
18-create-quotation-customerid: 6 passed, 0 failed
19-master-data-backfill:     8 passed, 0 failed
```
Total: 30 passed, 0 failed across the six master-data-sync suites.
