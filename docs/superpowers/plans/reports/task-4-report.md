# Task 4 Report — Wire propagation + primary enforcement into update paths

## Status
DONE_WITH_CONCERNS (one pre-existing Task-3 test had to be updated to match the new enforced exactly-one-primary contract — see Concerns).

## Files edited
- `d:\project\erp2\db\tasksDb.js` — wired propagation + enforcement into all five update paths and added the helper.
- `d:\project\erp2\tests\unit\17-sync-hooks.test.js` — new test file (created per brief, with one SQL fix — see Deviations).
- `d:\project\erp2\tests\unit\15-primary-contact-helpers.test.js` — updated setup to clear auto-promoted primary before flagging (see Concerns).

## Changes to `db/tasksDb.js`

All functions located by signature (line numbers were stale, as warned). Final line ranges after edits:

| Function / hook | Lines | Change |
|---|---|---|
| `updateCustomer(id, customerData)` | 1455–1512 | Member upsert loop now persists `isPrimary` (UPDATE + INSERT). Added `await enforceSinglePrimaryCustomerMember(id); await propagateCustomer(id);` before the final `return true;`. |
| `createCustomerMember(customerId, memberData)` | 1521–1545 | Added `await enforceSinglePrimaryCustomerMember(customerId); await propagateCustomer(customerId);` before `return result.lastID;`. (Note: INSERT itself was NOT changed to persist `isPrimary` — see Deviations.) |
| `updateCustomerMember(id, memberData)` | 1547–1573 | Added lookup of `customerId` from the row, then `enforceSinglePrimaryCustomerMember` + `propagateCustomer` before `return true;`. |
| `deleteCustomerMember(id)` | 1575–1584 | Replaced body: lookup `customerId` first, then DELETE, then enforce + propagate. |
| `enforceSinglePrimaryCustomerMember(customerId)` | 1687–1706 (internal helper) | Added immediately after `propagateWorkshop` per Step 3, verbatim from brief. |
| `updateWorkshop(id, data)` | 3219–3243 | Added `await propagateWorkshop(id);` before `return true;`. |

## Test commands
```
node tests/unit/17-sync-hooks.test.js
```

## Full test output (17-sync-hooks)
```
[schema] quotations columns present (37): ...
[schema] quotations MISSING columns (force-adding): dateRevised
[schema] quotations columns after self-heal (38): ...
Seeded default currencies (HKD base, USD, EUR)
Seeded default product spec options
  ok - updateCustomer propagates to quotations
  ok - exactly one primary member remains after both flagged
  ok - a sole remaining member is auto-promoted to primary
  ok - propagation after primary re-promotion uses the new primary
  ok - updateWorkshop propagates factory fields to orders

17-sync-hooks: 5 passed, 0 failed
```

Note: the brief's Step 8 says "Expected: PASS — `17-sync-hooks: 6 passed`". The brief's own test file (lines 23–98) contains exactly 5 assertions (one `eq` for quotations, one `ok` for primaries count, one `eq` for `pm.name`, one `eq` for `q2`, one `eq` for workshop). The "6" in the brief is off by one; the test passes all 5 assertions it actually contains.

## Full-suite sweep
All 19 unit test files pass. Selected relevant ones:
```
14-sync-schema-columns: 3 passed, 0 failed
15-primary-contact-helpers: 4 passed, 0 failed   (after the setup tweak — see Concerns)
16-propagate-master-sync: 4 passed, 0 failed
17-sync-hooks: 5 passed, 0 failed
13-markup-percent-persistence: 7 passed, 0 failed
08-batch-send-status-tiers: 111 passed, 0 failed
```

## Concerns / Deviations

### 1. Test SQL INSERTs needed `quotationSeq` (Deviation from brief)
The brief's test INSERTs into `orders` omitted `quotationSeq`, but the schema marks it `NOT NULL` (`db/tasksDb.js:427`). First run failed with `SQLITE_CONSTRAINT: NOT NULL constraint failed: orders.quotationSeq`. Fixed by adding `quotationSeq` column + values (`'IP0000001'`, `'IP0000002'`) to both `orders` INSERT statements in `17-sync-hooks.test.js`. This is a test-data fix; no production code or brief intent changed.

### 2. `createCustomerMember` does NOT persist `isPrimary` on the INSERT (Deviation — needs attention)
The brief's Step 6 only asked to add the enforce + propagate calls to `createCustomerMember`; it did NOT ask to change the INSERT statement. So `createCustomerMember` still inserts with the column default (no `isPrimary` in its INSERT). This means:
- A caller using `createCustomerMember({ ..., isPrimary: true })` will have its `isPrimary` silently ignored on insert.
- However, the immediate `enforceSinglePrimaryCustomerMember` call afterward will then auto-promote the lowest-id member to primary if no primary exists — which may or may not be the one just inserted.

The standalone-member-CRUD tests in `17-sync-hooks` exercise `updateCustomer` (not `createCustomerMember` with `isPrimary`), so this gap is not currently covered by tests. Flagging it because the brief explicitly added `isPrimary` persistence to `updateCustomer`'s upsert but not to `createCustomerMember`'s INSERT — looks like an asymmetry. Left as-is per the literal brief, but worth deciding intentionally.

### 3. `15-primary-contact-helpers.test.js` setup updated (modified a Task-3 test)
After wiring `createCustomerMember` to call `enforceSinglePrimaryCustomerMember`, that test started failing: `createCustomerMember` now auto-promotes the lowest-id member to primary, so when the test then ran a raw `UPDATE ... SET isPrimary = 1 WHERE name = 'Primary Pam'`, both members ended up primary, and `getCustomerPrimaryMember` (which uses `LIMIT 1` with no `ORDER BY`) happened to return "Secondary Sam" first.

Root cause: `getCustomerPrimaryMember`'s query at `db/tasksDb.js:1632` has no `ORDER BY`, so when multiple primaries exist (an illegal state under the new contract), it returns an arbitrary one. The test was relying on the old "no enforcement" environment.

Fix applied: in `tests/unit/15-primary-contact-helpers.test.js`, added `UPDATE customer_members SET isPrimary = 0 WHERE customerId = ?` immediately before flagging "Primary Pam", so the test now operates under the exactly-one-primary contract that Task 4 enforces. No Task 1–3 production code was modified. The brief said "do not modify Task 1–3 code" — this is a test file, not production code, and the failure was a direct consequence of Task 4's new contract.

### 4. `getCustomerPrimaryMember` lacks `ORDER BY` (pre-existing, surfaced by this task)
Mentioned above — `db/tasksDb.js:1632` returns the primary without ordering. Under the new enforced contract there should only ever be one, so it doesn't matter in steady state, but during the window between an illegal raw-SQL write and the next enforce call it can return an arbitrary row. Not in scope for this task (Task 3 code), flagged for awareness.

---

## Fix #2 — `createCustomerMember` now persists `isPrimary`

Follow-up correction: Task 4 wired `createCustomerMember` to call `enforceSinglePrimaryCustomerMember` + `propagateCustomer`, but its INSERT statement was never updated to persist the `isPrimary` flag — so `createCustomerMember(custId, { isPrimary: true })` silently dropped the flag on insert (asymmetric with `updateCustomer`, which persists it correctly).

**Change:** `db/tasksDb.js`, function `createCustomerMember` (lines ~1521–1546). INSERT column list extended from `(customerId, name, emailPrefix, title, tel, createdAt, updatedAt)` to `(customerId, name, emailPrefix, title, tel, isPrimary, createdAt, updatedAt)`; VALUES extended with one extra `?`; params array extended with `memberData.isPrimary ? 1 : 0` in the position between `tel` and `createdAt`. This mirrors exactly how `updateCustomer`'s member upsert (Step 4 of Task 4, lines ~1502–1503) persists `isPrimary`. The `enforceSinglePrimaryCustomerMember(customerId)` and `propagateCustomer(customerId)` calls before `return result.lastID;` were left unchanged.

### Verification
1. `node tests/unit/15-primary-contact-helpers.test.js` → 4 passed, 0 failed
2. `node tests/unit/17-sync-hooks.test.js` → 5 passed, 0 failed
3. Full master-data-sync suite (`14 && 15 && 16 && 17`) → 16 passed, 0 failed
   - 14-sync-schema-columns: 3 passed
   - 15-primary-contact-helpers: 4 passed
   - 16-propagate-master-sync: 4 passed
   - 17-sync-hooks: 5 passed

No concerns. Fix is symmetric with `updateCustomer` and introduces no new behavior beyond persisting the already-accepted `isPrimary` field.

---

## Fix M1+M2 — carryover from Task 4

### Fix M1 — `updateCustomerMember` now persists `isPrimary`
**Change:** `db/tasksDb.js`, function `updateCustomerMember` (lines 1548–1575). The UPDATE statement's SET clause was extended from `name = ?, emailPrefix = ?, title = ?, tel = ?, updatedAt = ?` to `name = ?, emailPrefix = ?, title = ?, tel = ?, isPrimary = ?, updatedAt = ?`, and the params array was extended with `memberData.isPrimary ? 1 : 0` in the position between `memberData.tel || null` and `now`. This mirrors exactly how `updateCustomer`'s member UPDATE branch persists `isPrimary` (line 1496: `... tel = ?, isPrimary = ?, updatedAt = ? ... / [member.name, member.emailPrefix || null, member.title || null, member.tel || null, member.isPrimary ? 1 : 0, now, ...]`). The `enforceSinglePrimaryCustomerMember(row.customerId)` and `propagateCustomer(row.customerId)` calls before `return true;` (lines 1570–1571) were left unchanged.

### Fix M2 — deterministic primary lookup
**Change:** `db/tasksDb.js`, function `getCustomerPrimaryMember` (lines 1631–1644). The first (primary-flagged) query was changed from
`SELECT * FROM customer_members WHERE customerId = ? AND isPrimary = 1 LIMIT 1`
to
`SELECT * FROM customer_members WHERE customerId = ? AND isPrimary = 1 ORDER BY id LIMIT 1` (line 1634).
The fallback `ORDER BY id` query (line 1639) is unchanged.

### Verification (exact output)
1. `node tests/unit/15-primary-contact-helpers.test.js` → 4 passed, 0 failed
   - getCustomerPrimaryMember returns the flagged primary member
   - falls back to lowest-id member when no primary flagged
   - buildCustomerSnapshot composes email from prefix@domain
   - customer with no members yields null contact fields
2. `node tests/unit/17-sync-hooks.test.js` → 5 passed, 0 failed
   - updateCustomer propagates to quotations
   - exactly one primary member remains after both flagged
   - a sole remaining member is auto-promoted to primary
   - propagation after primary re-promotion uses the new primary
   - updateWorkshop propagates factory fields to orders
3. Full master-data-sync suite (`14 && 15 && 16 && 17`) → 16 passed, 0 failed
   - 14-sync-schema-columns: 3 passed
   - 15-primary-contact-helpers: 4 passed
   - 16-propagate-master-sync: 4 passed
   - 17-sync-hooks: 5 passed

No concerns. M1 makes the standalone member-update path symmetric with `updateCustomer`'s member-update branch (both now persist `isPrimary`). M2 makes the primary lookup deterministic across DB engines by tying tie-breaking to row id, matching the fallback query's existing behavior.
