# Order Create Enhancements Design

**Date**: 2026-06-04
**Status**: Draft
**Scope**: Backend API + Web UI + Android App

## Overview

Six enhancements to the Order Create panel in the ERP system:
1. Auto-refresh factory column after PDF generation
2. Inline fuzzy search filter per column header (Excel autofilter style)
3. Export orders to Excel
4. Multi-select with bulk delete, individual delete, and bulk QR scan for status update
5. Individual QR code thumbnails per row + bulk QR code generation for multiple PO#s
6. Show item images in the order table

## Architecture

Build order: **Backend API → Web UI → Android App**

Each layer is independently testable and deployable. The Android app consumes the same API as the web UI.

---

## 1. Backend API Extensions

All new endpoints are added to `routes/orders.js`.

### 1.1 Soft Delete Orders

**Endpoint**: `PATCH /api/orders/bulk-cancel`
**Body**: `{ "orderIds": [1, 2, 3] }` (array, works for single or bulk)
**Behavior**: Sets `status = 'cancelled'` for all matching orders
**Response**: `{ "success": true, "updatedCount": 3, "orders": [...] }`

### 1.2 Bulk QR Status Update

**Endpoint**: `POST /api/orders/bulk-scan-update`
**Body**: `{ "orderIds": [1, 2, 3], "department": "production", "status": "in_production" }`
**Behavior**:
- Updates `currentDepartment` and `status` for all specified orders
- Creates a progress tracking entry in `order_progress_tracking` for each order
- Validates that the department transition is allowed (existing validation logic)

**Response**: `{ "success": true, "updatedCount": 3, "orders": [...] }`

### 1.3 Export Orders to Excel

**Endpoint**: `GET /api/orders/export-excel`
**Query params**: `status`, `search` (same filters as order list)
**Behavior**:
- Queries orders with applied filters
- Generates `.xlsx` using ExcelJS (server-side, since the project already has ExcelJS for quotations)
- Returns file stream with `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`

**Excel columns**: PO#, IP/OS Ref, Customer, Item, Product Type, Qty, Factory, Status, Department, Created

### 1.4 PDF Generation — No API Change Needed

The existing `GET /api/orders/export` endpoint already updates factory assignments. The web frontend will simply call `loadOrders()` after the PDF download completes to refresh the factory column.

---

## 2. Web UI Changes

All changes in `public/index.html` (CSS + JS inline).

### 2.1 Auto-Refresh Factory Column After PDF

In the `generateBulkPdf()` function, after the PDF download completes (after `window.open(url)` or `fetch` resolves), call `loadOrders()` to reload the full order list. The factory column will reflect the newly assigned workshop.

### 2.2 Inline Fuzzy Search Per Column Header

**Structure**: Add a second `<tr>` inside `<thead>` with one `<input>` per filterable column. The checkbox, QR code, and Action columns will not have filters.

**Filterable columns**: PO#, IP/OS Ref, Customer, Item, Product Type, Qty, Factory, Status, Department, Created

**UX**:
- Each filterable header shows a small 🔍 icon on hover
- Clicking the icon expands/collapses a text input directly below the header
- Typing filters rows using case-insensitive `includes()` match (sufficient for this dataset)
- Multiple filters combine with AND logic
- A ✕ button clears each filter
- The existing global search input is removed (replaced by column filters)

**Implementation**:
- New CSS class `.column-filter` for the input styling
- New JS function `applyColumnFilters()` that reads all active column filter inputs and filters `allOrdersCache`
- Each input gets an `oninput` handler that calls `applyColumnFilters()`
- `displayOrders()` is updated to apply column filters before rendering

### 2.3 QR Code Thumbnail Column

**New column**: Between "Factory" and "Status", add a "QR" column.

**Rendering**: For each order row, generate a small QR code (~40×40px) using the existing `qrcode.js` library. The QR encodes the `orderSeq` (PO#). The image is rendered as a `<canvas>` or `<img>` data URL.

**Interaction**: Clicking the thumbnail opens a modal with the full-size QR code and order details.

### 2.4 Bulk QR Code Generation (Red, Multiple PO#s)

**Trigger**: When multiple orders are selected, a "Generate Bulk QR" button appears.

**Behavior**:
1. Click generates a single red-colored QR code containing JSON: `{ "type": "bulk", "orders": ["PO-001", "PO-002", "PO-003"] }`
2. The QR code is displayed in a modal with red styling, clearly labeled "BULK QR — Contains N PO#s"
3. User can screenshot, print, or save the QR code
4. The red color distinguishes it from individual QR codes

**QR content format**:
```json
{
  "type": "bulk",
  "poNumbers": ["PO-001", "PO-002", "PO-003"],
  "count": 3
}
```

### 2.5 Export Excel Button

**Location**: Toolbar area next to "Generate PDF" button.

**Behavior**: Clicking exports currently filtered/visible orders as `.xlsx`. Uses the backend endpoint `GET /api/orders/export-excel` with current filter state as query params.

**Filename**: `orders-YYYY-MM-DD.xlsx`

### 2.6 Individual Delete

**Location**: Each row's Action column gets a 🗑️ (trash) icon button.

**Behavior**:
1. Click shows a confirmation dialog: "Cancel order PO-XXX?"
2. On confirm, calls `PATCH /api/orders/bulk-cancel` with `{ "orderIds": [id] }`
3. Row updates to show "cancelled" status (grayed out)

### 2.7 Bulk Delete

**Location**: Toolbar area, appears when orders are selected (alongside "Generate PDF").

**Behavior**:
1. Button text: "Delete Selected (N)"
2. Click shows confirmation: "Cancel N selected orders?"
3. On confirm, calls `PATCH /api/orders/bulk-cancel` with all selected orderIds
4. All affected rows update to "cancelled" status

### 2.8 Bulk QR Scan to Update Status

**Location**: Toolbar area, appears when orders are selected.

**Behavior**:
1. Button text: "Scan & Update Status"
2. Click opens the camera scanner (using existing html5-qrcode setup)
3. After scanning a QR code, a dialog prompts: select target department and status
4. Calls `POST /api/orders/bulk-scan-update` with all selected orderIds and the chosen department/status
5. All affected rows update in the table

### 2.9 Show Item Images

Add a new "Image" column to the order table that displays a small product thumbnail for each order.

**Source**: The image comes from the quotation's product image (if stored during quotation creation) or the order's associated product image. This requires:
- A `productImage` field on the order (stored as a file path or base64 during order creation from quotation)
- If no image is available, show a placeholder icon

**Display**: Small thumbnail (~40×40px) in the table. Clicking opens a larger view in a modal.

**Database**: Add `productImage TEXT` column to the `orders` table (nullable). Populate from quotation data during order creation.

---

## 3. Android App Changes

Changes in the Kotlin Android app (`app/src/main/java/com/.../`).

### 3.1 Order List — QR Thumbnail Column

Add a small QR image (~40dp) to each row in the order list RecyclerView. Generate using ZXing from `orderSeq`. Tapping opens a detail view with the full QR code.

### 3.2 Multi-Select & Bulk Delete

- Long-press an order to enter multi-select mode
- Checkboxes appear on all rows
- Top toolbar shows selection count + "Delete" button
- Soft-delete calls `PATCH /api/orders/bulk-cancel`

### 3.3 Individual Delete

Swipe-to-delete gesture on individual rows with undo snackbar. Calls the same soft-delete endpoint.

### 3.4 Bulk QR Code Scanning

The existing scanner activity is updated to:
1. Scan a QR code
2. Parse the JSON content
3. If `type === "bulk"`:
   - Show a list of all included PO#s
   - Show a "Mass Update" button
   - User selects target department/status
   - Calls `POST /api/orders/bulk-scan-update`
4. If it's a single PO# (no `type` field, or `type !== "bulk"`):
   - Existing behavior (update single order)

### 3.5 PDF Generation — Auto-Refresh

After downloading a PDF (which assigns a factory), the order list automatically refreshes via the existing sync mechanism.

### 3.6 Export Excel

Add an export/share button in the order list toolbar. Calls the backend `GET /api/orders/export-excel` endpoint and shares the downloaded `.xlsx` via Android share intent.

---

## Data Flow

### Bulk QR Scan Flow
```
Web: Select orders → Generate Bulk QR (red) → Print/screenshot
Android: Scan red QR → Parse PO# list → Show PO#s → Select department → POST /api/orders/bulk-scan-update → Orders updated
```

### Soft Delete Flow
```
Web/Android: Select orders → Confirm cancel → PATCH /api/orders/bulk-cancel → Orders marked cancelled → UI refreshes
```

### Export Excel Flow
```
Web/Android: Apply filters → Click Export → GET /api/orders/export-excel?status=X&search=Y → Download .xlsx
```

---

## Files to Modify

### Backend
- `routes/orders.js` — add bulk-cancel, bulk-scan-update, export-excel endpoints

### Web
- `public/index.html` — all UI changes (HTML structure, CSS, JavaScript)

### Android
- `app/src/main/java/.../MainActivity.kt` — multi-select, delete, export
- `app/src/main/java/.../ScannerActivity.kt` — bulk QR scanning
- `app/src/main/java/.../OrderAdapter.kt` (or equivalent) — QR thumbnail column
- Layout XML files — updated RecyclerView layouts

---

## Out of Scope

- Changing the PDF generation format or layout
- Adding new order creation fields
- Modifying the quotation-to-order conversion flow
- Push notifications for status updates
