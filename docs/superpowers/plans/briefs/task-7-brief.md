# Task 7 Brief — Frontend: primary picker + refresh on save

**Where this fits:** Final task. The backend (Tasks 1-6) now rewrites snapshot fields when a customer/workshop is edited. This task makes the on-screen tables actually reflect those changes on the same page, and lets the user mark a customer's primary contact.

**This is the only task with NO automated test** (the project has no DOM test harness, and CLAUDE.md forbids Playwright). Verify by manual browser steps (below) + `node --check`-equivalent sanity (the file is HTML; just ensure no syntax errors in the added `<script>` JS).

**File:** `public/index.html` only (a ~28k-line vanilla-JS SPA; backend tasks did NOT touch it, so the line anchors below are still accurate).

## Changes

### 1. Add a `refreshMasterDependentLists()` helper

Immediately before `async function loadQuotationsFromStorage()` (line ~23455), add:

```js
    // Re-fetch every list that depends on customer/workshop master data, so all
    // open view tables refresh on the same page after a master-record edit.
    async function refreshMasterDependentLists() {
      try { await loadQuotationsFromStorage(); } catch (e) { console.warn('quotation refresh failed', e); }
      try { await loadOutsourcingQuotationsFromStorage(); } catch (e) { console.warn('outsourcing refresh failed', e); }
      try {
        const ordersRefresh = document.getElementById('refreshOrdersBtn');
        if (ordersRefresh) ordersRefresh.click();
      } catch (e) { console.warn('orders refresh failed', e); }
    }
```

### 2. Call it from the customer save success path

The customer save handler does `fetch('/api/customers/${customer.id}', { method: 'PUT', ... })` around line 12015. After the response is confirmed successful (the line that handles a successful `response`), add `await refreshMasterDependentLists();`. If there is ALSO a customer CREATE path (POST /api/customers) in the same form flow, add the same call after its success too. Keep any existing re-render of the customer list.

### 3. Call it from the workshop save success path

Locate the workshop save handler (search for the request to `/api/workshops/` — likely a POST or PUT). After its successful response, add `await refreshMasterDependentLists();`.

### 4. Add a primary-contact radio to customer member rows

Find where the customer create/edit form renders member rows via `innerHTML` (each member row has inputs for `name` / `emailPrefix` / `title` / `tel`). In each member row, add a radio to mark the primary contact:

```html
<label class="dtype-opt"><input type="radio" name="primaryMember" value="${member.id || ''}" ${member.isPrimary ? 'checked' : ''}> Primary</label>
```

Then, where the form builds the `members` payload sent to `PUT /api/customers/:id`, set `isPrimary: true` on the member whose id matches the selected `primaryMember` radio, and `isPrimary: false` on the rest. (The backend `updateCustomer` already persists `isPrimary` — Task 4.) When the form adds a brand-new member row in the UI, default the FIRST member's radio to checked.

If the member-render or payload-building code is hard to locate, search for `emailPrefix` and `customer_members` / `members:` in `public/index.html` to find the relevant blocks. Report exactly where you wired it.

## Manual verification (report results; cannot be automated)

Start the app (`node server.js`), then in the browser:
1. Create a customer with two members; mark one **Primary**; create a quotation selecting that customer.
2. Edit the customer — rename the company and change the primary member's email prefix/tel. Save.
3. Confirm the **Quotation view, Outsourcing view, and Orders view** all show the new company name / contact / email / phone WITHOUT a manual refresh.
4. Edit a workshop's `fullCompanyName`; confirm the Orders view **Factory** column updates.
5. Confirm a sent quotation email/PDF is NOT retroactively changed (only DB rows + tables sync).

---

## Global constraints (binding)
- **NO GIT.** Never run any repository-mutating git command. Edit files only. Do NOT commit.
- **NO Playwright / browser automation.** The manual steps above are for the USER to perform, not for you. Do not attempt to drive a browser.
- Do not modify backend files (`db/tasksDb.js`, routes, server.js) — this task is `public/index.html` only.
- Do not restructure the SPA or refactor unrelated code. Add the helper, the two call-sites, and the radio — nothing more.

## Report contract
Write your full report to `d:\project\erp2\docs\superpowers\plans\reports\task-7-report.md` containing: the exact line numbers where you added the helper, each call-site (customer save, customer create if present, workshop save), and the member-row radio + payload wiring (with line numbers); quote the surrounding code you changed. Note that manual browser verification is left to the user. Return to me ONLY: status (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), files edited, one-line summary, concerns.
