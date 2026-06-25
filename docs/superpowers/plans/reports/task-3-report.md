# Task 3 Report — Propagation functions

## Status
DONE

## Changes Made

### File: `db/tasksDb.js`
**Location:** Lines 1644-1677 (inserted between `buildCustomerSnapshot` and `// ========== QUOTATION FUNCTIONS ==========`)

**Added two exported functions:**

1. **`propagateCustomer(customerId)`** (lines 1644-1654)
   - Validates `customerId` is provided
   - Calls `buildCustomerSnapshot(customerId)` to get current customer data
   - Updates all quotations linked to the customer (rewrites customerName, contactPerson, email, phone)
   - Updates all orders linked to the customer (rewrites customerName, contactPerson, email, phone)

2. **`propagateWorkshop(workshopId)`** (lines 1656-1666)
   - Validates `workshopId` is provided
   - Fetches workshop data (fullCompanyName, country)
   - Updates all orders linked to the workshop (rewrites workshopName, country)
   - Handles null country values correctly

### File: `tests/unit/16-propagate-master-sync.test.js`
**Created:** New test file with 4 test cases

## Test Execution

### Command
```bash
node tests/unit/16-propagate-master-sync.test.js
```

### Test Output (Final - Passing)
```
[schema] quotations columns present (37): id, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, notes, type, sourceEmailUid, sourceEmailSubject, sourceEmailMessageId, profileImagePath, attachmentPaths, dateCreated, status, resendCount, outsourcingSeq, selectedSupplierId, selectedSupplierResponseId, sampleReadyDate, brandId, profileImageBlob, profileImageMime, customerItemName, chaseSampleCount, resubmitCount, quotationSeq, height_mm, width_mm, markupPercent, variable, customerId, currency
[schema] quotations MISSING columns (force-adding): dateRevised
[schema] quotations columns after self-heal (38): id, customerName, contactPerson, email, phone, productType, productDetails, quantity, unitPrice, total, notes, type, sourceEmailUid, sourceEmailSubject, sourceEmailMessageId, profileImagePath, attachmentPaths, dateCreated, status, resendCount, outsourcingSeq, selectedSupplierId, selectedSupplierResponseId, sampleReadyDate, brandId, profileImageBlob, profileImageMime, customerItemName, chaseSampleCount, resubmitCount, quotationSeq, height_mm, width_mm, markupPercent, variable, customerId, currency, dateRevised
Seeded default currencies (HKD base, USD, EUR)
Seeded default product spec options
  ok - propagateCustomer rewrites linked quotation snapshot
  ok - propagateCustomer rewrites linked order snapshot
  ok - propagateCustomer leaves rows without a customerId untouched
  ok - propagateWorkshop rewrites linked order factory fields

16-propagate-master-sync: 4 passed, 0 failed
```

### TDD Process
1. **First run (failing):** `TypeError: propagateCustomer is not a function` - confirmed test infrastructure works
2. **Schema fix:** Added required `quotationSeq` field to orders INSERT statements (NOT NULL constraint)
3. **Second run (failing):** Same error - confirmed test fails before implementation
4. **After implementation:** All 4 tests pass

## Test Cases Covered

1. **propagateCustomer rewrites linked quotation snapshot**
   - Creates customer with stale data
   - Updates customer and primary member
   - Confirms quotation fields are rewritten to match new data

2. **propagateCustomer rewrites linked order snapshot**
   - Creates order with stale customer data
   - Updates customer and primary member
   - Confirms order customer fields are rewritten

3. **propagateCustomer leaves rows without a customerId untouched**
   - Creates unlinked quotation
   - Runs propagateCustomer
   - Confirms unlinked rows remain unchanged

4. **propagateWorkshop rewrites linked order factory fields**
   - Creates workshop and order with stale workshop data
   - Updates workshop
   - Confirms order workshop fields are rewritten

## Concerns/Deviations

### Minor Adjustments Made
- **Test data fix:** Added `quotationSeq` field to orders INSERT statements to satisfy NOT NULL constraint (line 49 and 78 in test file)
- **Test data fix:** Used 'IP0000001' and 'IP0000002' as quotationSeq values for orders

### No Deviations from Specification
- Functions inserted exactly at specified location (after `buildCustomerSnapshot`, before `// ========== QUOTATION FUNCTIONS ==========`)
- Implementation matches brief exactly (same parameter names, same logic, same null handling)
- All test assertions match brief requirements
- No modifications to Task 1 or Task 2 code

## Files Edited
- `db/tasksDb.js` (lines 1644-1677: added two functions)
- `tests/unit/16-propagate-master-sync.test.js` (created new file)