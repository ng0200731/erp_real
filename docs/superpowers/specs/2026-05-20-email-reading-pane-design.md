---
name: email-reading-pane
date: 2026-05-20
status: approved
---

# Email Reading Pane Design

## Context

The email receive view currently uses a single-column layout with a full-screen modal overlay for viewing emails. The right half of the screen is unused ("red region"). This design converts the layout to a 50/50 split with an inline reading pane, making better use of screen space and eliminating the need for a modal to read emails.

## Layout

```
+-------------------------------------------------------------------+
| [Compose] [Refresh] [Read All]                                    |
+-----------------------------+-------------------------------------+
| Inbox Emails                | Email Reading Pane                   |
| +-------------------------+ | From: sender@email.com              |
| | Search filters row      | | To: recipient@email.com             |
| +-------------------------+ | Date: 2026/5/18                     |
| | Date |Sender|Subj|Ctx|At| |------------------------------------ |
| |------|------|----|---|--| |                                     |
| |5/18  |eric..|quot|** |  | | (full HTML email body rendered)     |
| |5/17  |bob.. |RE:p|   |2f| |                                     |
| |      |     |    |   |  | |                                     |
| +-------------------------+ |                                     |
|                             |------------------------------------ |
|                             | [Quotation v] [Image Lib]           |
|                             |   Hang Tag / Woven / Care / Xfer   |
+-----------------------------+-------------------------------------+
```

## Changes

### HTML Structure (`public/index.html`)

1. **Wrap inbox table + reading pane in a flex container** (50/50 split)
   - New wrapper div around the existing inbox section (line ~1780) and a new reading pane div
   - Flexbox with `display: flex; gap: 15px`

2. **New reading pane div** (`#emailReadingPane`)
   - Left half: existing inbox table stays as-is
   - Right half: new `#emailReadingPane` div containing:
     - Header area: From, To, Date, Subject, Customer Info
     - Body area: scrollable div for email HTML content
     - Footer area: Action buttons (Quotation dropdown + Image Lib)

3. **Remove `#emailModal` overlay** (lines 1818-1854)
   - The reading pane replaces this modal entirely
   - Action buttons (Quotation, Image Lib) move to the reading pane footer

4. **Keep `#emailQuotationModal`** (line 1857+)
   - This stays as an overlay since quotation forms need more space

### JavaScript Changes

1. **Modify email row click handler** — currently opens `emailModal`, change to populate `#emailReadingPane` instead
2. **Add selected row highlighting** — add a CSS class to the clicked row
3. **Reuse existing email fetch logic** — `openEmail()` function already fetches email by UID, just redirect output to reading pane instead of modal
4. **Move action button event handlers** — Quotation/Image Lib buttons now live in reading pane, rebind their handlers

### CSS Changes

1. Add flex layout styles for the split container
2. Add reading pane styles (header, body, footer sections)
3. Add selected-row highlight style
4. Remove modal-specific styles that are no longer needed

## Files to Modify

- `public/index.html` — HTML structure, CSS styles, and JavaScript

## What Stays the Same

- Inbox table columns and search filters
- Compose form
- Email fetch API (`GET /api/emails/:uid`)
- Email quotation modal flow (opens over the reading pane)
- Customer info matching logic
- Attachment handling

## Verification

1. Click "Email > Receive" in sidebar
2. Confirm 50/50 split layout appears with inbox left, empty reading pane right
3. Click an email row — reading pane should populate with email content
4. Confirm selected row is highlighted
5. Click Quotation button in reading pane — quotation modal should open
6. Click different email — reading pane updates, highlight moves
7. Test search filters still work on left panel
8. Test Compose button still works
