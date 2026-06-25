# Final Whole-Branch Review Package — Master-Data Sync

**Spec:** `docs/superpowers/specs/2026-06-23-master-data-sync-design.md`
**Plan:** `docs/superpowers/plans/2026-06-23-master-data-sync.md`
**Per-task reports:** `docs/superpowers/plans/reports/task-{1..7}-report.md`
**No commits exist** (project rule forbids git). Review the resulting working-tree code directly. Each task already passed its own per-task review (spec ✅ + quality approved). Your job: holistic integration review across the whole feature, the full test suite, and triage of the deferred Minors.

## Goal of the feature
When a customer or garment-factory (workshop) record is edited, automatically rewrite the customer/factory snapshot fields on every linked quotation, outsourcing, and order row, so the Quotation, Outsourcing, and Orders view tables all stay in sync on the same page. Master tables: `customers` (buyer) + `workshops` (factory).

## Surface changed by this feature

### `db/tasksDb.js`
- **Schema (in `ensureSchema`, ~lines 617-639):** additive `ALTER TABLE` for `quotations.customerId INTEGER`, `orders.customerId INTEGER`, `customer_members.isPrimary INTEGER DEFAULT 0` — each guarded try/catch ignoring `duplicate column name`.
- **Backfill (end of `ensureSchema`, ~1067-1117, wrapped in try/catch):** designate one primary member per customer (promote lowest-id when none); link `quotations.customerId` + `orders.customerId` by `companyName COLLATE NOCASE LIMIT 1`; link `orders.workshopId` by `workshopName → workshops.fullCompanyName`; normalize via propagate; report unmatched rows.
- **Helpers (after `findCustomerByEmail`):** `getCustomerPrimaryMember` (delegates), `_getCustomerPrimaryMemberWith(db, customerId)` (shared two-step primary lookup), `buildCustomerSnapshot` (public), `_buildCustomerSnapshotWith(db, customerId)`.
- **Propagation:** `propagateCustomer`/`_propagateCustomerWith(db,…)` (UPDATE quotations + orders WHERE customerId), `propagateWorkshop`/`_propagateWorkshopWith(db,…)` (UPDATE orders WHERE workshopId).
- **Enforcement:** `enforceSinglePrimaryCustomerMember(customerId)` — 0 primaries → promote lowest-id; >1 → keep first, clear rest.
- **Hooks:** `updateCustomer` (isPrimary in member upsert + enforce+propagate before return), `createCustomerMember` (isPrimary in INSERT + enforce+propagate), `updateCustomerMember` (isPrimary in UPDATE + enforce+propagate), `deleteCustomerMember` (capture customerId before delete + enforce+propagate), `updateWorkshop` (propagateWorkshop).
- **Create-flow:** `createQuotation` (customerId first col + snapshot override when present), `createOrder` (customerId col + snapshot override + workshopName sourced from `fullCompanyName`).

### `public/index.html`
- `refreshMasterDependentLists()` (~23750) — re-fetches quotation + outsourcing lists, clicks `refreshOrdersBtn`.
- Call-site: inside `saveCustomerToStorage` AFTER success (~12349) — covers PUT / POST create / 404-fallback / inline member edit.
- Call-site: inside `wsSaveWorkshop` AFTER success (~26883) — workshop CREATE only (no workshop edit/PUT flow exists in the SPA).
- Primary-contact radio in member rows (~12044) + `isPrimary` payload wiring in `saveMember` (~12095-12099).

### New tests (`tests/unit/`)
`14-sync-schema-columns`, `15-primary-contact-helpers`, `16-propagate-master-sync`, `17-sync-hooks`, `18-create-quotation-customerid`, `19-master-data-backfill`. (Note: Task 4's implementer adjusted `15`'s setup because `createCustomerMember` now auto-promotes the lowest-id member — verify that adjustment is correct.)

## What to do

1. **Run the FULL unit test suite** (all files, not just 14-19) and report aggregate pass/fail. Use the Bash tool (Git Bash), working dir `d:\project\erp2`:
   ```
   for f in tests/unit/*.test.js; do echo "=== $f ==="; node "$f" || echo "FAILED: $f"; done
   ```
2. **Holistic integration review** of the surface above. Look for cross-task issues the per-task reviews could miss: re-entrancy/deadlock around `getTasksDb`; hook ordering (enforce before propagate); create-flow vs backfill snapshot consistency (both must derive from the SAME primary lookup — the `_getCustomerPrimaryMemberWith` dedupe); idempotency of the backfill across repeated inits; any path where a master edit does NOT propagate or a view does NOT refresh; SQL injection; transactional concerns given backfill loops propagate in bulk.
3. **Triage the deferred Minors** (below) — for each, state FIX BEFORE HANDOFF or ACCEPT.
4. **Confirm rule compliance:** no git commits were made by any subagent; no Playwright used.

## Deferred Minors (from per-task reviews)
- **Task 3:** `propagateCustomer` issues two UPDATEs not wrapped in a transaction. Matches existing codebase style, but the backfill (Task 6) calls it in a loop over all customer ids — a mid-loop failure could leave partial updates. Consider wrapping the backfill normalization (or each propagate) in a transaction.
- **Task 5:** `createOrder` sources `workshopName` from the workshop but NOT `country` (order keeps its passed `country`). By design (order country may be a ship-to). Verify this is consistent with how the Orders view uses `country`.
- **Task 6:** the backfill block is wrapped in try/catch whose only failure signal is `console.warn`. Acceptable for an idempotent init block, but a silent backfill failure would leave rows unlinked. Consider whether startup should surface this more loudly.
- **Task 7:** (a) the primary-radio `checked` heuristic assumes the customer form is create-only (the SPA clears the form rather than pre-populating members on edit) — a future edit-existing-customer flow would need to honor loaded `isPrimary`. (b) The SPA has NO workshop edit/PUT flow, so "workshop EDIT → refresh" cannot be exercised from the UI today (backend still propagates on any PUT from other clients).

## Out of scope (do not flag as defects)
- Sent emails / generated PDFs are intentionally NOT retro-edited (frozen at send time).
- Supplier-side sync (`quotation_suppliers`) — only `customers` and `workshops` are masters.
- Adding a factory column to the quotation/outsourcing views — workshop data only reaches the Orders view today.

Return: (1) overall verdict — APPROVE / NEEDS FIXES; (2) the full-suite test result; (3) Critical/Important findings (if any) with exact file+line; (4) Minor triage decisions; (5) any cross-task integration issue. If you find Critical/Important issues, list them precisely so one fix dispatch can address all of them.
