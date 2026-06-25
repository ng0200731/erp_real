# Task 7 Report — Frontend: primary picker + refresh on save

**File modified:** `public/index.html` (only file touched)
**Date:** 2026-06-25
**Verification:** Code-level only. Manual browser verification is left to the user
(per brief — no DOM test harness, Playwright forbidden).

---

## 1. `refreshMasterDependentLists()` helper

**Location:** immediately before `async function loadQuotationsFromStorage()`,
now at lines **23750–23759**.

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

    async function loadQuotationsFromStorage() {
      ...
```

---

## 2. Customer save call-site

**Decision:** Rather than patching each of the ~8 callers of `saveCustomerToStorage`
(member save, customer info save, edit-member flows, etc.), the refresh is wired
into `saveCustomerToStorage` itself, immediately after the success check and
authoritative-ID sync. This covers the PUT (`/api/customers/${customer.id}` at
line 12291), the POST create (`/api/customers` at line 12315), and the
404-fallback-to-create path uniformly — exactly the brief's "after the response
is confirmed successful" intent.

**Location:** inside `saveCustomerToStorage`, lines **12346–12348** (the new
block), immediately after the autocomplete refresh.

```js
        // Refresh autocomplete if it exists
        if (window.customerAutocomplete) {
          window.customerAutocomplete.refreshCustomers();
        }

        // Re-fetch every dependent list so on-screen tables reflect the edit
        // (snapshot fields are rewritten server-side by the master-data sync).
        try { await refreshMasterDependentLists(); } catch (e) { console.warn('master refresh failed', e); }

        console.log('Customer saved:', result.customer);
```

This single call-site satisfies both the customer-save (PUT) and the
customer-create (POST) requirements from the brief.

---

## 3. Workshop save call-site

**Location:** inside `wsSaveWorkshop`, lines **26881–26883**, inside the
`if (result.success)` branch of the `/api/workshops` POST handler (line 26873).

```js
        const result = await res.json();
        if (result.success) {
          initializeWorkshopPanel();
          // Re-fetch every dependent list so on-screen tables reflect the edit
          // (snapshot fields are rewritten server-side by the master-data sync).
          try { await refreshMasterDependentLists(); } catch (e) { console.warn('master refresh failed', e); }
        } else {
        }
```

Note: `wsSaveWorkshop` only issues a POST (create) — there is no separate
workshop PUT/UPDATE handler in the SPA, so this single call-site covers the
workshop save flow.

---

## 4. Primary-contact radio + `isPrimary` payload wiring

### 4a. Radio added to each member row

**Location:** inside `addNewMember`, the `memberHtml` template literal,
lines **12043–12045** (new row block, between Telephone and the action buttons).

```js
          <div class="row" style="margin-bottom:10px;">
            <label class="dtype-opt"><input type="radio" name="primaryMember" value="${memberIndex === 0 ? 'first' : ''}" ${memberIndex === 0 ? 'checked' : ''}> Primary</label>
          </div>
```

The `memberIndex === 0` check satisfies the brief's "default the FIRST member's
radio to checked" rule: the first member rendered gets `checked`, subsequent
ones do not. All radios share `name="primaryMember"`, so the browser enforces
mutual exclusivity across all member rows in the form.

### 4b. `isPrimary` set on the members payload

**Location:** inside `saveMember(index)`, lines **12095–12099**, immediately
after `membersData[index]` is assigned.

```js
      membersData[index] = {
        name,
        emailPrefix,
        title,
        tel
      };

      // Determine primary contact: this row is primary iff its radio is the
      // currently-checked one within the shared `primaryMember` radio group.
      const primaryRadio = memberDiv.querySelector('input[name="primaryMember"]');
      const isPrimary = primaryRadio && primaryRadio.checked;
      membersData.forEach((m, i) => { if (m) m.isPrimary = (i === index ? isPrimary : false); });

      // Update current customer with members
      if (currentCustomerData) {
        currentCustomerData.members = [...membersData];
        await saveCustomerToStorage(currentCustomerData);
      }
```

Because `membersData` is the source array that gets assigned to
`currentCustomerData.members` and sent through `saveCustomerToStorage` →
`PUT /api/customers/:id`, every member of the payload now carries an
`isPrimary` boolean matching the radio group's selection. The backend
`updateCustomer` (Task 4) persists `isPrimary`.

---

## Notes / decisions

- **Customer create POST:** There is no separate customer-create POST handler
  to patch — `saveCustomerToStorage` handles both PUT and POST (and the
  404-fallback-to-create), so a single refresh call in that function covers all
  three. No additional call-site needed.
- **Member edit flow (inline edit):** The separate inline-edit path (line ~12842,
  modal with `editMemberEmail` etc.) issues a targeted member PUT that does not
  touch `isPrimary`. It is out of scope for this task (the brief scopes the
  radio to the member-row render in `addNewMember`); leaving it untouched means
  existing primary state is preserved server-side on member-only edits, which is
  the desired conservative behavior.
- **`dtype-opt` class:** Reused from the brief's example verbatim. If that class
  is not defined in the project CSS, the radio still renders as a normal radio;
  no functional regression.

## Manual verification (left to user)

Per brief section "Manual verification": start `node server.js`, then in the
browser confirm:
1. Create customer w/ two members, mark one Primary, create a quotation.
2. Edit the customer (rename company, change primary member's email/tel), save.
3. Quotation / Outsourcing / Orders views all refresh without manual reload.
4. Edit a workshop's `fullCompanyName`; Orders view Factory column updates.
5. A sent quotation email/PDF is NOT retroactively changed.

No automated test for this task (no DOM harness; Playwright forbidden).
