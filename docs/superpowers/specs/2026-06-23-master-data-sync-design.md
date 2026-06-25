# Master-Data Sync: Auto-update quotation / outsourcing / orders views on customer or factory edit

**Date:** 2026-06-23
**Status:** Approved (design)
**Scope:** `db/tasksDb.js`, `routes/customers.js`, `routes/workshops.js`, `routes/quotations.js`, `public/index.html`, new tests under `tests/unit/`.

## 1. Problem

The `quotations` table backs **both** the Quotation view and the Outsourcing view (outsourcing = quotations with `productType` in `other`/`others`/`outsource`). The `orders` table backs the Orders view.

All three views read **frozen snapshot** columns copied in at creation time:

- `quotations`: `customerName`, `contactPerson`, `email`, `phone` — no `customerId`.
- `orders`: `customerName`, `contactPerson`, `email`, `phone` (no `customerId`) **and** `workshopName` (snapshot) alongside `workshopId` (FK).

So when a user edits a **customer** or a **garment factory (workshop)**, every existing quotation / outsourcing / order row keeps showing the old name, contact, email, and phone. The view tables never auto-update.

The goal: editing a customer or workshop must automatically rewrite the relevant snapshot fields on every linked quotation, outsourcing, and order row, so all views on the page stay in sync.

## 2. Decisions (locked during brainstorming)

1. **Rewrite existing rows** — editing a master record UPDATEs every linked downstream row. (Rejected alternatives: live-join at read time; new-records-only.)
2. **Primary-contact semantics for customers** — one designated primary member per customer; *every* quotation/order for that customer shows that primary member's name / email / phone. Accepted consequence: a quote created with a non-primary member will, after the next customer edit, snap to the primary member's info.
3. **Entities in scope** — `customers` (the buyer, UI menu "Garment Factory Database") and `workshops` (the production factory, UI menu "Workshop").
4. **Views in scope** — Quotation view, Outsourcing view, Orders view (all three).
5. **Primary-contact storage** — `isPrimary` flag on `customer_members` (workshops already have a built-in primary contact, so no change needed there).
6. **Propagation location** — DB layer (`updateCustomer` / `updateWorkshop` and the member functions call a `propagate…` helper), so it always fires regardless of caller.
7. **Frontend refresh** — on any customer/workshop save, re-fetch all three lists and re-render whichever panels are visible.

## 3. Schema changes

All additive, guarded by the existing `PRAGMA`/try-`ALTER` pattern already used at `tasksDb.js:554` (`ALTER TABLE quotations ADD COLUMN selectedSupplierId INTEGER`). Each `ALTER` must be idempotent (check `PRAGMA table_info` before adding).

| Table | New column | Purpose |
|---|---|---|
| `quotations` | `customerId INTEGER` | link to `customers.id` (nullable) |
| `orders` | `customerId INTEGER` | link to `customers.id` (nullable; `workshopId` already exists) |
| `customer_members` | `isPrimary INTEGER DEFAULT 0` | marks the customer's primary contact |

No FK constraints are added in the migration (to avoid constraint failures on legacy rows); the link is enforced by application logic. `customer_members` rows default to `isPrimary = 0`.

## 4. Primary-contact helper (customers)

New function `getCustomerPrimaryMember(customerId)`:
- `SELECT * FROM customer_members WHERE customerId = ? AND isPrimary = 1 LIMIT 1`.
- Fallback if none: `SELECT * FROM customer_members WHERE customerId = ? ORDER BY id LIMIT 1`.
- Returns `null` when the customer has no members.

New function `buildCustomerSnapshot(customerId)`:
- Loads the customer row and its primary member.
- Returns:
  - `customerName` = `customer.companyName`
  - `contactPerson` = `member?.name ?? null`
  - `email` = `member && member.emailPrefix && customer.emailDomain ? member.emailPrefix + "@" + customer.emailDomain : null`
  - `phone` = `member?.tel ?? null`
- (Email composition mirrors the existing pattern at `tasksDb.js:15894-15895` / `findCustomerByEmail` at `tasksDb.js:1539`.)

Workshops need no equivalent: their primary contact is already first-class columns (`primaryContactName`, `emailAddress`, `mobileWhatsapp`) and the Orders view only shows `workshopName` + `country` from the factory.

## 5. Propagation (core)

New functions in `tasksDb.js`:

### `propagateCustomer(customerId)`
1. `const snap = await buildCustomerSnapshot(customerId);`
2. `UPDATE quotations SET customerName = ?, contactPerson = ?, email = ?, phone = ? WHERE customerId = ?` with `[snap.customerName, snap.contactPerson, snap.email, snap.phone, customerId]`.
3. `UPDATE orders SET customerName = ?, contactPerson = ?, email = ?, phone = ? WHERE customerId = ?` with the same values.

Only rows that carry this `customerId` are touched. Rows with a null `customerId` (legacy/unmatched) are left as-is.

### `propagateWorkshop(workshopId)`
1. Load the workshop row.
2. `UPDATE orders SET workshopName = ?, country = ? WHERE workshopId = ?` with `[workshop.fullCompanyName, workshop.country ?? null, workshopId]`.

### Hook points
- `updateCustomer(id, customerData)` — call `propagateCustomer(id)` **after** the member-sync block (`tasksDb.js:1446-1475`) so the freshly-updated primary member is used. Before propagating, enforce exactly-one-primary: if the synced member set has no `isPrimary`, promote the lowest-`id` member; if more than one, keep the first and clear the rest.
- `createCustomerMember` / `updateCustomerMember` / `deleteCustomerMember` (`tasksDb.js:1486-1536`) — after the change, (a) re-enforce exactly-one-primary for that `customerId`, then (b) call `propagateCustomer(customerId)`. (These cover member edits that don't go through `updateCustomer`.)
- `updateWorkshop(id, data)` (`tasksDb.js:3041`) — call `propagateWorkshop(id)` at the end.

## 6. Create-flow changes

### `createQuotation(quotationData)` (`tasksDb.js:1581`)
- Accept and persist `customerId` (the form already has it via `selectCustomer` at `index.html:23958`). Add `customerId` to the INSERT column list.
- If `customerId` is provided, snapshot `customerName`/`contactPerson`/`email`/`phone` from `buildCustomerSnapshot(customerId)` rather than trusting freehand input — guaranteeing new rows start in sync. (If no `customerId`, keep current freehand behavior for email-sourced quotations.)

### `createOrder(orderData)` (`tasksDb.js:3074`)
- Accept and persist `customerId`. When present, snapshot the four customer fields from `buildCustomerSnapshot(customerId)`. `workshopId`/`workshopName` are already passed through; ensure `workshopName` is sourced from the workshop's `fullCompanyName` when `workshopId` is present.

## 7. One-time backfill (idempotent migration)

Runs once at DB init after the schema changes, guarded so it never double-applies:

1. **Primary member:** for each customer with no `isPrimary = 1` member, `UPDATE customer_members SET isPrimary = 1 WHERE id = (SELECT id FROM customer_members WHERE customerId = ? ORDER BY id LIMIT 1)`.
2. **Link quotations:** `UPDATE quotations SET customerId = (SELECT id FROM customers WHERE customers.companyName = quotations.customerName COLLATE NOCASE LIMIT 1) WHERE customerId IS NULL`.
3. **Link orders — customer:** same match on `orders.customerName`.
4. **Link orders — workshop:** `UPDATE orders SET workshopId = (SELECT id FROM workshops WHERE workshops.fullCompanyName = orders.workshopName COLLATE NOCASE LIMIT 1) WHERE workshopId IS NULL AND workshopName IS NOT NULL`.
5. **Normalize:** for every customer id, call `propagateCustomer(id)`; for every workshop id, call `propagateWorkshop(id)`. This brings all linked rows to current master values in one pass.
6. **Report:** log counts of quotations/orders left with null `customerId`/`workshopId` (rows whose master was deleted or renamed away). These keep their stale snapshot and cannot auto-update — no link exists.

Backfill is idempotent because each step is a no-op once columns are populated.

## 8. Frontend (`public/index.html`)

- **Refresh on save:** in the customer save handler and the workshop save handler, after a successful PUT, re-fetch the quotation, outsourcing, and orders lists (the existing fetch functions used by each view's "Refresh List" button) and re-render whichever panels are currently visible. This delivers the "make sure all is the same page" behavior: any open table updates immediately.
- **Primary-contact UI:** in the customer create/edit form (which renders members dynamically via `innerHTML`), add a radio input per member (`name="primaryMember"`, value = member id) to mark the primary. Default the first-listed member as checked. On submit, send `isPrimary: 1` on the chosen member and `isPrimary: 0` on the rest (the `updateCustomer` member-sync path already upserts arbitrary member fields; extend it to persist `isPrimary`).
- **Display:** optionally show a "★ Primary" badge next to the primary member in the customer view; not required for correctness.

No changes are needed to the quotation/outsourcing/orders table renderers themselves — they already read the snapshot columns, which propagation keeps current.

## 9. Artifacts boundary (explicit non-goal)

Quotation **emails** and generated **PDFs** are produced and frozen at send time. This change does **not** retro-edit sent emails or existing PDF files. Only DB rows and on-screen tables are kept in sync.

## 10. Edge cases

- **Customer with no members:** `buildCustomerSnapshot` returns `contactPerson/email/phone = null`; rows show company name only. Acceptable.
- **Renaming `companyName`:** propagation rewrites `customerName` on all linked rows; any column filter grouping by name follows automatically.
- **Deleting the primary member** (via `updateCustomer`'s member-sync or `deleteCustomerMember`): exactly-one-primary enforcement promotes the next member before `propagateCustomer` runs.
- **Duplicate company names** during backfill: `LIMIT 1` ties deterministically to the lowest-`id` customer. Going forward, new rows carry the explicit `customerId` from the picker, so duplicates don't matter.
- **Unmatched legacy rows** (master deleted/renamed): no link → no auto-update; left on old snapshot, counted in the backfill report.

## 11. Testing

New test file `tests/unit/14-master-data-sync.test.js`, following the existing pattern (`node tests/unit/*.test.js`, `require('./_helpers')`, `ERP_DB_PATH` for an isolated DB, routes exercised via a throwaway express app). Cases:

1. `propagateCustomer` rewrites `customerName`/`contactPerson`/`email`/`phone` on every linked quotation **and** order after `updateCustomer`.
2. `propagateWorkshop` rewrites `workshopName`/`country` on every linked order after `updateWorkshop`.
3. Email composition: `emailPrefix@emailDomain` from the primary member.
4. Exactly-one-primary: deleting the primary member promotes another; two primaries collapse to one.
5. `createQuotation` persists `customerId` and snapshots from the primary member.
6. Backfill: links `quotations.customerId`/`orders.customerId` by `companyName`, designates one primary member per customer, and is idempotent on a second run.
7. Rows with no match keep their old snapshot and a null link (not touched by propagation).

## 12. Out of scope

- Retroactive edits to sent emails / PDFs.
- Live-join read path (we rewrite snapshots instead).
- Supplier-side sync (outsourcing's `quotation_suppliers` link). Only `customers` and `workshops` are master sources for this feature.
- Adding a factory column to the quotation/outsourcing views (workshop data only reaches the Orders view today).
