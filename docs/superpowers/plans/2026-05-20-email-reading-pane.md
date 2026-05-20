# Email Reading Pane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the email receive view from single-column + modal to a 50/50 split layout with an inline reading pane on the right.

**Architecture:** Wrap the existing inbox table in a flex container, add a reading pane div on the right. Redirect the `show()` function to populate the reading pane instead of the modal. Move the modal outside `#emails` so the sent emails panel can still use it.

**Tech Stack:** Vanilla HTML/CSS/JS in a single `public/index.html` file

---

## File Structure

All changes are in a single file:

- **Modify:** `public/index.html`
  - CSS styles (lines ~401-570): Add reading pane styles, remove modal-only styles
  - HTML structure (lines ~1763-1870): Add flex wrapper, reading pane div, move modal
  - JavaScript `renderEmailList()` (lines ~4956-5017): Make entire row clickable, add highlight
  - JavaScript `show()` (lines ~4000-4450): Populate reading pane instead of modal
  - JavaScript modal event listeners (lines ~5258-5298): Move to reading pane equivalents

---

### Task 1: Add CSS styles for reading pane

**Files:**
- Modify: `public/index.html` (after line ~570, inside `<style>` block)

- [ ] **Step 1: Add reading pane CSS styles**

Insert after the existing `.email-modal input[type="date"]:focus` block (after line ~569):

```css
/* Email reading pane (replaces modal for received emails) */
.email-split-container {
  display: flex;
  gap: 15px;
  width: 100%;
  min-height: 500px;
}
.email-inbox-panel {
  flex: 1;
  min-width: 0;
}
.email-reading-pane {
  flex: 1;
  min-width: 0;
  border: 2px solid #000;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.email-reading-pane.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-size: 15px;
}
.email-reading-pane-header {
  padding: 12px 16px;
  border-bottom: 1px solid #000;
  background: #fafafa;
  font-size: 13px;
}
.email-reading-pane-subject {
  font-weight: 600;
  font-size: 15px;
  margin-bottom: 8px;
}
.email-reading-pane-meta {
  margin-bottom: 4px;
}
.email-reading-pane-body {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  line-height: 1.5;
  word-wrap: break-word;
}
.email-reading-pane-actions {
  border-top: 1px solid #000;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.email-row-selected {
  background: #e3f2fd !important;
}
.email-row-selected td {
  font-weight: normal !important;
}
```

- [ ] **Step 2: Verify styles are inside the `<style>` block**

Open the file and confirm the new styles appear before the closing `</style>` tag. No visual change yet — styles have no effect until HTML references them.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(email): add CSS styles for reading pane layout"
```

---

### Task 2: Restructure HTML — add flex wrapper and reading pane

**Files:**
- Modify: `public/index.html` (lines ~1780-1870)

- [ ] **Step 1: Wrap inbox table in flex container**

Replace the inbox table container. Currently (around line 1780):

```html
<div style="border:1px solid #000; padding:15px; margin-bottom:15px;">
  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
    <h3>Inbox Emails</h3>
  </div>
  <div style="max-height:500px; overflow-y:auto; border:1px solid #000; margin-bottom:15px;">
  <table id="emailTable" ...>
    ...
  </table>
  </div>
</div>
```

Wrap this entire block and add the reading pane. The result should be:

```html
<div class="email-split-container">
  <!-- Left panel: inbox table -->
  <div class="email-inbox-panel">
    <div style="border:1px solid #000; padding:15px; margin-bottom:15px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h3>Inbox Emails</h3>
      </div>
      <div style="max-height:500px; overflow-y:auto; border:1px solid #000; margin-bottom:15px;">
      <table id="emailTable" ...>
        ... (keep everything exactly as-is)
      </table>
      </div>
    </div>
  </div>

  <!-- Right panel: reading pane -->
  <div id="emailReadingPane" class="email-reading-pane empty">
    <div style="text-align:center; color:#666;">Select an email to read</div>
  </div>
</div>
```

Key: The existing `<table>` and all its contents stay exactly the same. Only the wrapping divs change.

- [ ] **Step 2: Move `#emailModal` outside `#emails` div**

The `#emailModal` div (starting at line ~1818) is currently inside `#emails`. It needs to stay available for the sent emails panel.

Cut the entire `#emailModal` block (lines ~1818-1854) and paste it **after** the closing `</div>` of `#emails` but **before** the `<!-- Email Send UI -->` comment (line ~1872). The modal stays in the DOM but is now a sibling of `#emails`, not a child.

Also remove the Quotation button, sub-options, and Image Lib button from inside the modal — these will live in the reading pane instead. The modal becomes a minimal structure for sent emails only:

```html
<!-- Email Reader Modal (kept for sent emails only) -->
<div id="emailModal" class="email-modal-overlay" style="display:none;">
  <div class="email-modal">
    <div class="email-modal-content">
      <div class="email-modal-header">
        <h2 id="emailModalSubject" class="email-modal-title">Email Subject</h2>
        <button id="emailModalClose" class="email-modal-close">×</button>
      </div>
      <div class="email-modal-meta">
        <div id="emailModalFrom" class="email-modal-from">From: sender@example.com</div>
        <div id="emailModalTo" class="email-modal-from">To: recipient@example.com</div>
        <div id="emailModalDate" class="email-modal-date">Date: 2024-01-15</div>
        <div id="emailCustomerInfo" style="margin-top:10px; padding:10px; border:1px solid #000; background:#f0f0f0; display:none;">
          <div style="font-weight:bold; margin-bottom:5px;">Customer Information</div>
          <div id="customerInfoContent" style="font-size:14px;"></div>
        </div>
      </div>
      <div id="emailModalBody" class="email-modal-body">
        Email content will appear here...
      </div>
    </div>
    <!-- Right action panel kept empty for sent emails -->
    <div class="email-modal-actions"></div>
  </div>
</div>
```

- [ ] **Step 3: Verify page loads without errors**

Open the browser, navigate to the app, click "Email > Receive". The inbox table should appear on the left, and a bordered "Select an email to read" placeholder should appear on the right. No JavaScript errors in console.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(email): add reading pane HTML structure, move modal for sent emails"
```

---

### Task 3: Update `renderEmailList()` — make rows clickable, add highlight

**Files:**
- Modify: `public/index.html` (lines ~4956-5017, the `renderEmailList` function)

- [ ] **Step 1: Modify the row click handler to highlight and load reading pane**

In `renderEmailList()`, find the `viewCell.onclick` handler (around line 5007). Currently it only fires on the "Click to view" cell. Change it to:

1. Remove the `viewCell.onclick` and instead make the entire row clickable
2. Add highlight class to the selected row
3. Remove highlight from previously selected row

Replace the click handler section (lines ~5005-5016):

```javascript
// Remove highlight from previously selected row
const prevSelected = tableBody.querySelector('.email-row-selected');
if (prevSelected) prevSelected.classList.remove('email-row-selected');

// Make entire row clickable
row.onclick = (event) => {
  console.log('Email row clicked, UID:', e.uid);
  // Mark row as read visually
  if (!isSeen) {
    row.querySelectorAll('td').forEach(td => td.style.fontWeight = 'normal');
    e.flags = e.flags || [];
    e.flags.push('\\Seen');
  }
  // Highlight selected row
  const prev = tableBody.querySelector('.email-row-selected');
  if (prev) prev.classList.remove('email-row-selected');
  row.classList.add('email-row-selected');
  show(e.uid);
};
```

Also remove the existing `row.onmouseover` and `row.onmouseout` handlers (lines ~5002-5003) since the selected state CSS handles highlighting.

- [ ] **Step 2: Verify clicking rows triggers email load**

Open browser, go to Email > Receive, click an email row. The row should get a blue highlight. The email will still load in the (now-moved) modal since `show()` hasn't been updated yet — that's OK for this step.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "feat(email): make entire email row clickable with selection highlight"
```

---

### Task 4: Create `showInReadingPane()` function and update `show()`

**Files:**
- Modify: `public/index.html` (after the `populateEmailModal` function, around line ~4953)

- [ ] **Step 1: Add `showInReadingPane()` function**

Insert after `populateEmailModal()` (after line ~4953):

```javascript
// Populate the reading pane instead of modal for received emails
function showInReadingPane(subject, from, date, body, emailMeta) {
  const pane = document.getElementById('emailReadingPane');
  if (!pane) return;

  // Build customer info HTML
  let customerHtml = '';
  if (currentCustomerData) {
    customerHtml = `
      <div style="margin-top:8px; padding:8px; border:1px solid #000; background:#f0f0f0;">
        <div style="font-weight:bold; margin-bottom:4px;">Customer Information</div>
        <div style="font-size:13px;">${currentCustomerData.companyName || ''} | ${currentCustomerData.emailDomain || ''}</div>
      </div>`;
  }

  pane.classList.remove('empty');
  pane.innerHTML = `
    <div class="email-reading-pane-header">
      <div class="email-reading-pane-subject">${escapeHtml(subject || '(No subject)')}</div>
      <div class="email-reading-pane-meta"><strong>From:</strong> ${escapeHtml(from || 'Unknown')}</div>
      <div class="email-reading-pane-meta"><strong>To:</strong> ${escapeHtml(emailMeta?.to || '(unknown)')}</div>
      <div class="email-reading-pane-meta"><strong>Date:</strong> ${escapeHtml(date || 'Unknown')}</div>
      ${customerHtml}
    </div>
    <div class="email-reading-pane-body">${body || 'No content available'}</div>
    <div class="email-reading-pane-actions">
      <button class="action-btn expandable" id="paneQuotationBtn">Quotation</button>
      <div class="sub-options" id="paneQuotationSubOptions">
        <button class="sub-option-btn" data-type="hang-tag">Hang Tag</button>
        <button class="sub-option-btn" data-type="woven-label">Woven Label</button>
        <button class="sub-option-btn" data-type="care-label">Care Label</button>
        <button class="sub-option-btn" data-type="transfer">Transfer</button>
        <button class="sub-option-btn" data-type="outsource">Outsource</button>
      </div>
      <button class="action-btn" id="paneImageLibBtn">Image Lib</button>
    </div>`;

  // Bind Quotation button toggle
  const quotationBtn = pane.querySelector('#paneQuotationBtn');
  const subOptions = pane.querySelector('#paneQuotationSubOptions');
  if (quotationBtn) {
    quotationBtn.onclick = () => {
      quotationBtn.classList.toggle('expanded');
      subOptions.classList.toggle('expanded');
    };
  }

  // Bind sub-option buttons
  pane.querySelectorAll('.sub-option-btn').forEach(btn => {
    btn.onclick = () => {
      const quotationType = btn.getAttribute('data-type');
      const quotationName = btn.textContent;
      window.isDummy2Mode = true;
      openEmailQuotationModal(quotationType, quotationName, currentEmailMeta);
    };
  });

  // Bind Image Lib button
  const imageLibBtn = pane.querySelector('#paneImageLibBtn');
  if (imageLibBtn) {
    imageLibBtn.onclick = () => {
      console.log('Image Lib button clicked');
    };
  }
}
```

- [ ] **Step 2: Update `show()` function to use reading pane instead of modal**

In the `show()` function, find the final section where it calls `populateEmailModal()` and shows the modal (around lines 4434-4449). Replace:

```javascript
      // Show email modal
      populateEmailModal(subject, from, date, bodyContent, currentEmailMeta);
      // Ensure modal is attached to document.body so it's visible even when the emails panel is hidden
      try {
        const modalEl = document.getElementById('emailModal');
        if (modalEl && modalEl.parentNode !== document.body) {
          document.body.appendChild(modalEl);
        }
      } catch (attachErr) {
        console.error('Failed to attach modal to body:', attachErr);
      }

      // Hide loading spinner and show modal
      hideLoadingSpinner();
      document.getElementById('emailModal').style.display='flex';
      document.body.classList.add('modal-open');
```

With:

```javascript
      // Show in reading pane (received emails)
      hideLoadingSpinner();
      showInReadingPane(subject, from, date, bodyContent, currentEmailMeta);
```

Also update the loading state in `show()`. Find where it sets `emailModalBody.textContent = 'Loading email...'` (line ~4011) and add a reading pane loading state:

```javascript
      // Show loading state in reading pane
      const readingPane = document.getElementById('emailReadingPane');
      if (readingPane) {
        readingPane.classList.remove('empty');
        readingPane.innerHTML = '<div style="text-align:center; padding:40px; color:#666;">Loading email...</div>';
      }
```

Also update the error state in `show()`. Find where it sets `emailModalBody.textContent = 'Failed to load email...'` (line ~4109) and add:

```javascript
            const rp = document.getElementById('emailReadingPane');
            if (rp) rp.innerHTML = '<div style="text-align:center; padding:40px; color:#c00;">Failed to load email. Please try again.</div>';
```

And the error path that hides the modal (line ~4116, ~4124). These should NOT hide the reading pane, so remove or comment out those `emailModal.style.display='none'` lines in `show()`:

```javascript
          // For received emails using reading pane, no modal to hide
```

- [ ] **Step 3: Verify received emails load in reading pane**

Open browser, click "Email > Receive", click an email row. The reading pane on the right should populate with:
- Subject, From, To, Date in the header
- Email body content in the middle
- Quotation dropdown and Image Lib button at the bottom

The modal should NOT appear.

- [ ] **Step 4: Commit**

```bash
git add public/index.html
git commit -m "feat(email): display received emails in reading pane instead of modal"
```

---

### Task 5: Verify sent emails still work with modal

**Files:**
- Modify: `public/index.html` (no changes expected — just verify)

- [ ] **Step 1: Test sent email viewing**

1. Navigate to "Email > Send"
2. If there are sent emails, click "Click to view" on one
3. The `#emailModal` should still appear as an overlay (the `showSentEmail()` function still uses it)
4. Verify the modal shows email content correctly

If sent emails are broken, check that `#emailModal` was moved to the correct position (outside `#emails` div but inside `#board` or directly in the body). The `showSentEmail()` function references `emailModal` by ID, so it must still exist in the DOM.

- [ ] **Step 2: Commit any fixes**

```bash
git add public/index.html
git commit -m "fix(email): ensure sent emails modal still works after reading pane refactor"
```

---

### Task 6: Polish — remove unused modal event listeners for received emails

**Files:**
- Modify: `public/index.html` (lines ~5258-5298)

- [ ] **Step 1: Keep modal close handlers (for sent emails) but remove quotation handlers from modal**

The modal close handlers at lines ~5258-5267 must stay (sent emails use them):

```javascript
document.getElementById('emailModalClose').onclick = () => {
  document.getElementById('emailModal').style.display = 'none';
  document.body.classList.remove('modal-open');
};

document.getElementById('emailModal').onclick = (e) => {
  if (e.target === document.getElementById('emailModal')) {
    document.getElementById('emailModal').style.display = 'none';
    document.body.classList.remove('modal-open');
  }
};
```

The quotation button handlers at lines ~5270-5298 referenced `#quotationBtn` and `#quotationSubOptions` which are now removed from the modal. These bindings will silently fail (getElementById returns null). Remove them to keep the code clean.

Delete the following block (lines ~5270-5298):

```javascript
// Quotation button expandable functionality
document.getElementById('quotationBtn').onclick = () => { ... };

// Quotation sub-option click handlers
document.querySelectorAll('.sub-option-btn').forEach(btn => { ... });

// Image Lib button click handler
document.getElementById('imageLibBtn').onclick = () => { ... };
```

These are now handled inside `showInReadingPane()` per-email rendering.

- [ ] **Step 2: Verify no console errors**

Open browser console. Check for no "Cannot set property 'onclick' of null" errors when loading Email > Receive.

- [ ] **Step 3: Commit**

```bash
git add public/index.html
git commit -m "cleanup(email): remove unused modal quotation handlers, now in reading pane"
```

---

## Verification (End-to-End)

After all tasks are complete, run through this checklist:

1. **Layout**: Click "Email > Receive" — inbox table on left, "Select an email to read" placeholder on right
2. **Reading**: Click any email row — right pane shows email content (subject, from, to, date, body)
3. **Highlight**: Selected row has blue background; clicking a different row moves the highlight
4. **Quotation**: Click "Quotation" button in reading pane — dropdown expands with Hang Tag/Woven/etc.
5. **Quotation modal**: Click "Hang Tag" (or any sub-option) — email quotation modal opens over everything
6. **Sent emails**: Click "Email > Send" — sent emails still open in the overlay modal
7. **Search**: Type in search filters — inbox table filters correctly
8. **Compose**: Click "Compose" — compose form appears above inbox table
9. **Refresh**: Click "Refresh" — email list reloads
