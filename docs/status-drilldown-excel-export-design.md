# Design Spec: Status Drill-Down Modal + Excel Export

## Summary

Add clickable status items to all 4 dashboard legends. When clicked, a centered modal (~80% viewport) shows a scrollable table of all quotations/outsourcing items matching that status. An "Export Excel" button on the modal exports the current view to `.xlsx` with embedded images.

## Scope

### In Scope
- All 4 dashboard expanded panels: Quotation, Brand, Outsourcing, Brand Value
- Clickable status legend items → drill-down modal with table
- Excel export of current modal view with images embedded in cells
- Columns match existing quotation/outsourcing table columns

### Out of Scope
- Editing data from the modal
- Sorting/filtering within the modal table
- Pagination (scroll all rows)

---

## 1. Clickable Status Legend Items

### Current Behavior
Each dashboard's `renderLegend` / `renderBrandLegend` / `renderOutsourcingLegend` / `renderBrandValueLegend` function generates status items as static HTML. Status items show: color box, name, count, percentage.

### New Behavior
Each status item becomes **clickable** (cursor:pointer + hover effect). Clicking opens the drill-down modal.

### Changes Required

#### 1a. Shared function: `openStatusDrilldown(statusKey, statusName, dashboardType)`

A single reusable function that all 4 legend renderers call:

```
Parameters:
  - statusKey: string (e.g. 'pending', 'send to customer')
  - statusName: string (e.g. 'Pending', 'Send to Customer')
  - dashboardType: 'quotation' | 'brand' | 'outsourcing' | 'brandValue'
```

The function:
1. Gets the quotation list from the corresponding dashboard's global data
2. Filters by `quotation.status.toLowerCase() === statusKey`
3. Builds and shows the centered modal with the filtered data

#### 1b. Legend item HTML update

Each legend rendering function adds `onclick`, `cursor:pointer`, and hover style to each status `<div>`:

```html
<div style="cursor:pointer; ..." onclick="openStatusDrilldown('${status.key}', '${status.name}', 'quotation')"
     onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='transparent'">
  <!-- existing color box, name, count, percentage -->
</div>
```

#### 1c. Data source mapping

| Dashboard | Quotations Source | dashboardType |
|---|---|---|
| Quotation Distribution | `loadQuotationsFromStorage()` result (re-fetch or use cached) | `'quotation'` |
| Brand Distribution | `brandDashboardQuotations` global | `'brand'` |
| Outsourcing Distribution | Outsourcing quotations from `loadOutsourcingQuotationsFromStorage()` | `'outsourcing'` |
| Brand Value | `brandValueQuotations` global | `'brandValue'` |

---

## 2. Centered Modal Popup

### Visual Design
- **Size**: 80% viewport width, 80% viewport height
- **Position**: Centered with dark semi-transparent overlay (rgba(0,0,0,0.5))
- **z-index**: 30000 (above existing modals at 20000)
- **Style**: Matches existing monochrome dashboard theme (black borders, white background)

### Structure

```
┌──────────────────────────────────────────────────┐
│  📋 {Status Name} — {N} items      [Export Excel] [✕] │  ← Header bar
├──────────────────────────────────────────────────┤
│  Image │ Customer │ Item Name │ Brand │ Type │ Qty │ Total │ Status │ Date │  ← Table header
│  ──────┼──────────┼───────────┼───────┼──────┼─────┼───────┼────────┼──────│
│  [img] │ ABC Ltd  │ Widget A  │ Nike  │ X    │ 500 │ 25000 │ SEND.. │ 5/15 │  ← Table rows
│  [img] │ XYZ Co   │ Gadget B  │ Adidas│ Y    │ 200 │ 18000 │ SEND.. │ 5/18 │
│   -    │ Global   │ Part C    │ Puma  │ Z    │ 1000│ 45000 │ SEND.. │ 5/20 │
│  ...   │ ...      │ ...       │ ...   │ ...  │ ... │ ...   │ ...    │ ...  │
├──────────────────────────────────────────────────┤
│  Showing {N} items                               │  ← Footer
└──────────────────────────────────────────────────┘
```

### Columns (match existing tables)

**For Quotation / Brand / Brand Value dashboards:**
| Column | Field | Width |
|---|---|---|
| Image | `quotation.hasProfileImage` → `/api/quotations/{id}/profile-image` | 50px |
| Customer Name | `quotation.customerName` | auto |
| Item Name | `quotation.customerItemName` or `quotation.itemName` | auto |
| Contact Person | `quotation.contactPerson` | auto |
| Email | `quotation.email` | auto |
| Phone | `quotation.phone` | auto |
| Brand | `quotation.brandId` → brand name | auto |
| Product Type | `quotation.productType` | auto |
| Qty | `quotation.quantity` | 60px |
| Total (HKD) | `quotation.total` | 100px |
| Type | `quotation.type` | 80px |
| Status | `quotation.status` (badge) | auto |
| Date Created | `quotation.dateCreated` | 100px |

**For Outsourcing dashboard** (adds):
| Column | Field | Width |
|---|---|---|
| OS Ref | `quotation.outsourcingSeq` | 80px |
| Supplier | supplier info | auto |
| Sample Ready Date | `quotation.sampleReadyDate` | 100px |

### Implementation

Use the existing `document.createElement('div')` pattern (same as `showModal` and `showImagePreview`). No new CSS classes needed — inline styles matching the dashboard theme.

```javascript
function openStatusDrilldown(statusKey, statusName, dashboardType) {
  // 1. Get quotations based on dashboardType
  const quotations = getQuotationsForDashboard(dashboardType);

  // 2. Filter by status
  const filtered = quotations.filter(q =>
    q.status && q.status.toLowerCase() === statusKey.toLowerCase()
  );

  // 3. Create overlay + modal
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:30000;display:flex;align-items:center;justify-content:center;';

  const modal = document.createElement('div');
  modal.style.cssText = 'width:80vw;height:80vh;background:#fff;border:2px solid #000;display:flex;flex-direction:column;';

  // 4. Header with title + export + close
  // 5. Scrollable table body
  // 6. Footer with count

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close on overlay click or ✕ button
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
```

---

## 3. Excel Export with Embedded Images

### Library: ExcelJS (CDN)

Use **ExcelJS** loaded via CDN script tag in `index.html`:
```html
<script src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
```

ExcelJS supports:
- Full `.xlsx` generation in the browser
- Image embedding via `workbook.addImage()` + `worksheet.addImage()`
- Column widths, styles, formatting

### Export Flow

1. User clicks "Export Excel" button in the modal header
2. The function `exportStatusDrilldownToExcel(quotations, statusName, dashboardType)` is called
3. Steps:
   a. Create new `ExcelJS.Workbook`
   b. Add worksheet named `"{StatusName} - {Date}"`
   c. Set column definitions matching the table columns
   d. For each quotation:
      - Add row with all text/number fields
      - If `quotation.hasProfileImage`, fetch the image as base64, then embed it in the "Image" column cell
   e. Apply styling: header bold, borders, column widths
   f. Write to buffer and trigger download

### Image Embedding Detail

```javascript
// For each row with an image:
const imageResponse = await fetch(`/api/quotations/${q.id}/profile-image`);
const imageBlob = await imageResponse.blob();
const imageBase64 = await blobToBase64(imageBlob);

const imageId = workbook.addImage({
  base64: imageBase64,
  extension: 'jpeg', // or 'png'
});

const rowNumber = rowIndex + 2; // +1 for header, +1 for 1-indexed
worksheet.addImage(imageId, {
  tl: { col: 0, row: rowNumber - 1 }, // Image column
  ext: { width: 60, height: 60 }
});

// Set row height to fit image
worksheet.getRow(rowNumber).height = 45;
```

### Column Definitions for Excel

```javascript
const columns = [
  { header: 'Image', key: 'image', width: 10 },
  { header: 'Customer Name', key: 'customerName', width: 20 },
  { header: 'Item Name', key: 'customerItemName', width: 20 },
  { header: 'Contact Person', key: 'contactPerson', width: 15 },
  { header: 'Email', key: 'email', width: 25 },
  { header: 'Phone', key: 'phone', width: 15 },
  { header: 'Brand', key: 'brand', width: 12 },
  { header: 'Product Type', key: 'productType', width: 15 },
  { header: 'Quantity', key: 'quantity', width: 10 },
  { header: 'Total (HKD)', key: 'total', width: 15 },
  { header: 'Type', key: 'type', width: 12 },
  { header: 'Status', key: 'status', width: 18 },
  { header: 'Date Created', key: 'dateCreated', width: 14 },
];
// Outsourcing adds: OS Ref, Supplier, Sample Ready Date
```

### File Naming

`{StatusName}_{DashboardType}_{YYYY-MM-DD}.xlsx`

Example: `SendToCustomer_Brand_2026-05-31.xlsx`

---

## 4. Files to Modify

| File | Changes |
|---|---|
| `public/index.html` | 1. Add ExcelJS CDN script tag |
|  | 2. Add `openStatusDrilldown()` function |
|  | 3. Add `exportStatusDrilldownToExcel()` function |
|  | 4. Add `getQuotationsForDashboard()` helper |
|  | 5. Update `renderLegend()` — make items clickable |
|  | 6. Update `renderBrandLegend()` — make items clickable |
|  | 7. Update `renderOutsourcingLegend()` — make items clickable |
|  | 8. Update `renderBrandValueLegend()` — make items clickable |

No backend changes needed — all data and images are already available via existing API endpoints.

---

## 5. Edge Cases

- **No items matching status**: Show modal with "No items found" message
- **Image fetch fails**: Show "-" placeholder in Excel cell, continue export
- **Large datasets (100+ items)**: Show loading indicator during export, process images in batches
- **Multiple exports**: Each click generates a fresh file download
- **Modal already open**: Clicking another status closes current modal and opens new one
