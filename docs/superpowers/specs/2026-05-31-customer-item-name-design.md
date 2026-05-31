# Customer Item Name & Profile Image Display

**Date:** 2026-05-31
**Status:** Approved

## Summary

Add a "Customer Item Name" free-text field to the quotation form (product section), store it in the database, and display both the customer item name and profile image in quotation view and outsourcing view tables and detail modals.

## Requirements

1. **Customer Item Name field** — Free text input for the customer's own item name/reference (e.g., their internal SKU or informal product name)
2. **Database storage** — New column in `quotations` table
3. **Dummy fill** — Auto-generate sample customer item names when using the dummy fill button
4. **Display in quotation view** — Show customer item name and profile image thumbnail in table rows; show both in detail modal
5. **Display in outsourcing view** — Same as quotation view

## Design

### 1. Database

Add column to `quotations` table:

```sql
ALTER TABLE quotations ADD COLUMN customerItemName TEXT;
```

Migration in `db/tasksDb.js` using existing version-based migration pattern (bump DB_VERSION).

### 2. Form (Product Section)

- **Label:** Customer Item Name
- **Input type:** Free text, no validation
- **Position:** In product section, after Product Type
- **Placeholder:** "e.g., SKU-12345 or Item Name"
- **Dummy fill:** Generate sample names like `ITEM-001`, `SAMPLE-A`, `PROD-2024-001` (random selection)

### 3. Table Display (Quotation View & Outsourcing View)

New columns in the quotation tables:

| Column | Content |
|--------|---------|
| Profile Image | Small thumbnail (40x40px), clickable to enlarge |
| Item Name | Customer Item Name text (empty shows dash) |

Column order: Profile Image thumbnail, then Customer Item Name, inserted logically alongside existing columns.

### 4. Detail Modal

- Customer Item Name displayed as a labeled field
- Profile Image displayed larger (200px max) with proper aspect ratio

### 5. API Changes

- `GET /api/quotations` — include `customerItemName` in response
- `GET /api/quotations/outsourcing` — include `customerItemName` in response
- `GET /api/quotations/:id` — include `customerItemName` in response
- `POST /api/quotations` — accept `customerItemName`
- `PUT /api/quotations/:id` — accept `customerItemName`

## Files to Modify

| File | Changes |
|------|---------|
| `db/tasksDb.js` | Add `customerItemName` column migration |
| `routes/quotations.js` | Include field in API responses and create/update handlers |
| `public/index.html` | Form field, table columns (quotation + outsourcing views), detail modal, dummy fill |

## Out of Scope

- Customer item name validation or uniqueness enforcement
- Search/filter by customer item name
- Profile image upload changes (already exists)
