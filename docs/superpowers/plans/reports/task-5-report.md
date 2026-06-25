# Task 5 Report — Persist `customerId` and snapshot at creation

## What changed

### `db/tasksDb.js` — `createQuotation` (around line 1712)

Immediately after the `outsourcingSeq` generation block and before the `INSERT INTO quotations`, added a block that derives `customerId` from `quotationData.customerId` and, when present, overrides `quotationData` with `buildCustomerSnapshot(customerId)` (master `companyName`, primary member `name`, composed email, primary `tel`).

Modified the `INSERT INTO quotations` column list so `customerId` is now the **first** column and one extra `?` was added to `VALUES`. First params entries now read:

```js
[
  customerId,
  quotationData.customerName,
  quotationData.contactPerson || null,
  quotationData.email || null,
  quotationData.phone || null,
  ...
]
```

Column list / placeholder count: **27 columns, 27 `?`** (was 26/26).

INSERT column list (final):
```
INSERT INTO quotations (customerId, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, notes, type, sourceEmailUid, sourceEmailSubject, sourceEmailMessageId, profileImagePath, attachmentPaths, dateCreated, status, outsourcingSeq, quotationSeq, brandId, customerItemName, height_mm, width_mm, variable, currency)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

### `db/tasksDb.js` — `createOrder` (around line 3280)

Immediately after the `orderSeq` generation block and before the `INSERT INTO orders`, added the override block: derives `customerId` from `orderData.customerId`; when present, snapshot-overrides `customerName`, `contactPerson`, `email`, `phone` from `buildCustomerSnapshot(customerId)`. Also sources `workshopName` from the workshop's `fullCompanyName` when `orderData.workshopId` is present.

Modified the `INSERT INTO orders` column list so `customerId` appears right after `workshopId, workshopName, country,` (i.e. between `country` and `customerName`). Added one extra `?` to `VALUES`. Relevant params now use the local overridden variables:

```js
[
  orderSeq,
  orderData.quotationId,
  orderData.quotationType || 'quotation',
  orderData.quotationSeq || null,
  orderData.workshopId || null,
  workshopName,
  orderData.country || null,
  customerId,
  customerName,
  contactPerson,
  email,
  phone,
  ...
]
```

Column list / placeholder count: **23 columns, 23 `?`** (was 22/22).

Final INSERT column list:
```
INSERT INTO orders (
  orderSeq, quotationId, quotationType, quotationSeq,
  workshopId, workshopName, country, customerId,
  customerName, contactPerson, email, phone,
  productType, productDetails, quantity, unitPrice, total,
  customerItemName, brandId, status, dateCreated, createdAt, updatedAt
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

## Test commands

- Target: `node tests/unit/18-create-quotation-customerid.test.js`
- Regression suite: `node tests/unit/14-sync-schema-columns.test.js && node tests/unit/15-primary-contact-helpers.test.js && node tests/unit/16-propagate-master-sync.test.js && node tests/unit/17-sync-hooks.test.js && node tests/unit/18-create-quotation-customerid.test.js`
- Broader regression run: 01, 02, 03, 04, 05, 09-auto-advance, 12, 13, 14-email, 14-sync, 15, 16, 17, 18 — all pass.

## Test output

### 18-create-quotation-customerid.test.js
```
  ok - createQuotation snapshots companyName from master
  ok - createQuotation snapshots primary member name
  ok - createQuotation composes primary email
  ok - createQuotation snapshots primary phone
  ok - createQuotation stores customerId
  ok - createQuotation without customerId keeps freehand values and null link

18-create-quotation-customerid: 6 passed, 0 failed
```

### Regression 14-18
```
14-sync-schema-columns: 3 passed, 0 failed
15-primary-contact-helpers: 4 passed, 0 failed
16-propagate-master-sync: 4 passed, 0 failed
17-sync-hooks: 5 passed, 0 failed
18-create-quotation-customerid: 6 passed, 0 failed
```

## TDD trace
- Wrote the failing test first.
- Confirmed FAIL before implementation: `18-create-quotation-customerid: 1 passed, 5 failed` (freehand path already ok; customerId/snapshot assertions failed because the column was not stored and the snapshot was not overridden).
- Implemented both functions.
- Confirmed PASS: `6 passed, 0 failed`.

## Concerns / deviations
- None. Implementation follows the brief verbatim. No Tasks 1-4 code was modified. No git operations performed; no Playwright used.
- Note: the test asserts `q2` deep-equals `{ customerName: 'Walk-in', customerId: null }`; the freehand (no-customerId) branch leaves `customerId = null` and preserves caller-supplied values, which matches the brief and the existing behavior.
