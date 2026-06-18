# Quotation Tier Table — Phase 1 (Backend Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the backend data layer for brand/garment-factory tier tables on quotations — a testable DB harness, the `tierPrices` column on supplier responses, a filtered tier-table lookup, and idempotent on-read migration of the old `productDetails.pricing` shape to the new one.

**Architecture:** Pure additions to `db/tasksDb.js` (queries, migration, normalization) + a thin filter param on the existing `GET /api/pricing-tier-tables` route. No UI in this phase. All DB functions are unit-tested against isolated temp SQLite databases via a tiny node test harness (the repo has no backend test runner — only ad-hoc scripts + Playwright).

**Tech Stack:** Node.js (ESM, `"type":"module"`), Express 4, SQLite (`sqlite3` + `sqlite`), Playwright (E2E only, not used in this phase).

## Phasing note (scope check)

This feature is large. It is split across three plans, each independently testable:

- **Phase 1 — Backend foundation (this plan).** Schema migration, filtered tier-table lookup, on-read pricing migration. Verified by node unit tests.
- **Phase 2 — In-app UI.** Conditional pricing-mode dropdown, scope-aware pickers, tier grid, pricing collection for all 8 product types. Depends on Phase 1. Verified by Playwright.
- **Phase 3 — Supplier round-trip.** Tier table in the supplier email, portal tier-fill view, `tierPrices` submit/storage, IP/OS surfacing. Depends on Phase 1 + 2. Verified by Playwright E2E.

Phases 2 and 3 are written as separate plan documents after Phase 1 lands, with fresh reads of the then-current code.

## Global Constraints

- ESM only (`"type":"module"`); use `import`/`export`, top-level `await` is allowed.
- Production DB path is `data/tasks.db`; tests MUST NOT touch it — they override via `process.env.ERP_DB_PATH` (introduced in Task 1).
- `pricing_tier_tables.scope` values are exactly `'brand'` | `'customer'`.
- New `productDetails.pricing.tierScopeMode` values are exactly `'none'` | `'brand'` | `'customer'` (no `'both'`).
- Schema migrations must be idempotent: wrap each `ALTER TABLE … ADD COLUMN` in try/catch that ignores `'duplicate column name'`.
- `disabled` is stored as INTEGER (0/1); hydrate returns `disabled` as boolean.
- Each task commits to the existing branch `feature/quotation-tier-table-brand-customer`.

## File Structure (this phase)

- **Create** `tests/unit/_helpers.js` — tiny assert/temp-path harness used by all unit tests.
- **Create** `tests/unit/01-db-override.test.js` — DB isolation harness test.
- **Create** `tests/unit/02-tier-prices-column.test.js` — schema migration test.
- **Create** `tests/unit/03-pricing-tier-filter.test.js` — filtered lookup test.
- **Create** `tests/unit/04-pricing-normalize.test.js` — on-read migration test.
- **Modify** `db/tasksDb.js` — DB path override + reset; `tierPrices` column; `getCustomerIdsByName`, `getPricingTierTablesByFilter`, `getPricingTierTableScopeMap`, `normalizePricingForRead`; call normalization in `getQuotationById` / `getAllQuotations`.
- **Modify** `routes/pricing-tier-tables.js` — accept filter query params.
- **Modify** `server.js` — import + wire `getPricingTierTablesByFilter` into the route deps.

---

### Task 1: Test harness — DB path override + reset + assert helpers

**Files:**
- Create: `tests/unit/_helpers.js`
- Create: `tests/unit/01-db-override.test.js`
- Modify: `db/tasksDb.js` (lines 10 and 810–823)

**Interfaces:**
- Produces (db): `getTasksDb()` honors `process.env.ERP_DB_PATH` (lazy, per-call); new export `resetTasksDbForTest()` closes and clears the singleton so a new path takes effect.
- Produces (helpers): `eq(actual, expected, msg)`, `ok(cond, msg)`, `summary(name)`, `tempDbPath()`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/_helpers.js`:

```js
import fs from 'fs';
import os from 'os';
import path from 'path';

let pass = 0;
let fail = 0;

export function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
    console.log(`  ok - ${msg}`);
  } else {
    fail++;
    console.error(`  FAIL - ${msg}\n    expected: ${e}\n    actual:   ${a}`);
  }
}

export function ok(cond, msg) {
  if (cond) {
    pass++;
    console.log(`  ok - ${msg}`);
  } else {
    fail++;
    console.error(`  FAIL - ${msg}`);
  }
}

export function summary(name) {
  console.log(`\n${name}: ${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exitCode = 1;
}

export function tempDbPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erp-test-'));
  return path.join(dir, 'test.db');
}
```

Create `tests/unit/01-db-override.test.js`:

```js
import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();
const { getTasksDb, resetTasksDbForTest, getAllPricingTierTables } = await import('../../db/tasksDb.js');

let tables = await getAllPricingTierTables();
ok(Array.isArray(tables) && tables.length === 0, 'fresh temp DB has zero tier tables');

await resetTasksDbForTest();
process.env.ERP_DB_PATH = tempDbPath();
tables = await getAllPricingTierTables();
ok(Array.isArray(tables) && tables.length === 0, 'second temp DB is isolated after reset');

const db = await getTasksDb();
ok(typeof db.all === 'function', 'getTasksDb returns a usable db handle');

summary('DB path override + reset');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/01-db-override.test.js`
Expected: FAIL — `resetTasksDbForTest is not a function` (and/or both calls hit the same prod singleton).

- [ ] **Step 3: Write minimal implementation**

In `db/tasksDb.js`, replace line 10:

```js
const dbPath = path.join(dataDir, 'tasks.db');
```

with:

```js
const defaultDbPath = path.join(dataDir, 'tasks.db');
function resolveDbPath() {
  return process.env.ERP_DB_PATH || defaultDbPath;
}
```

Then replace the `getTasksDb` function body (lines 810–823) with:

```js
export async function getTasksDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const filename = resolveDbPath();
      await fs.mkdir(path.dirname(filename), { recursive: true });
      const db = await open({
        filename,
        driver: sqlite3.Database,
      });
      await ensureSchema(db);
      return db;
    })();
  }
  return dbPromise;
}

export async function resetTasksDbForTest() {
  if (dbPromise) {
    try {
      const db = await dbPromise;
      await db.close();
    } catch (_) {
      // ignore close errors during test reset
    }
    dbPromise = null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/01-db-override.test.js`
Expected: PASS — `3 passed, 0 failed`, exit code 0.

- [ ] **Step 5: Commit**

```bash
git add tests/unit/_helpers.js tests/unit/01-db-override.test.js db/tasksDb.js
git commit -m "test: add isolated DB harness for unit tests

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Schema migration — `tierPrices` column on supplier responses

**Files:**
- Modify: `db/tasksDb.js` (inside `ensureSchema`, alongside the other `ALTER TABLE quotations` blocks near line 508)
- Test: `tests/unit/02-tier-prices-column.test.js`

**Interfaces:**
- Produces: `supplier_quotation_responses` gains a nullable `tierPrices TEXT` column holding JSON `[{quantity, unitPrice}, …]`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/02-tier-prices-column.test.js`:

```js
import { ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();
const { getTasksDb } = await import('../../db/tasksDb.js');

const db = await getTasksDb();
const cols = await db.all(`PRAGMA table_info(supplier_quotation_responses)`);
const names = cols.map((c) => c.name);

ok(names.includes('tierPrices'), 'supplier_quotation_responses has tierPrices column');

summary('tierPrices column migration');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/02-tier-prices-column.test.js`
Expected: FAIL — `'supplier_quotation_responses has tierPrices column'` (column absent).

- [ ] **Step 3: Write minimal implementation**

In `db/tasksDb.js`, inside `ensureSchema(db)`, immediately after the existing `sampleReadyDate` `ALTER` block (around line 510), add:

```js
  try {
    await db.exec(`ALTER TABLE supplier_quotation_responses ADD COLUMN tierPrices TEXT;`);
  } catch (err) {
    if (!err.message.includes('duplicate column name')) {
      console.warn('Error adding tierPrices column:', err);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/02-tier-prices-column.test.js`
Expected: PASS — `1 passed, 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add db/tasksDb.js tests/unit/02-tier-prices-column.test.js
git commit -m "feat(db): add tierPrices column to supplier_quotation_responses

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Filtered tier-table lookup (db function + route)

**Files:**
- Modify: `db/tasksDb.js` (add `getCustomerIdsByName`, `getPricingTierTablesByFilter` after `getAllPricingTierTables`, ~line 2095)
- Modify: `routes/pricing-tier-tables.js` (destructure new fn; extend `GET /`)
- Modify: `server.js` (import + wire `getPricingTierTablesByFilter` at lines 538–544)
- Test: `tests/unit/03-pricing-tier-filter.test.js`

**Interfaces:**
- Produces (db):
  - `getCustomerIdsByName(name) -> Promise<number[]>` — case-insensitive match on `customers.companyName`; `[]` for empty/blank input.
  - `getPricingTierTablesByFilter({ scope?, brandId?, customerId?, customerName? }) -> Promise<table[]>` — returns hydrated tables (`scope`/`brandId`/`customerId` exact; `customerName` resolved via `getCustomerIdsByName` then matched on `customerId`); always excludes `disabled = 1`; sorted by name (NOCASE) then id desc. Empty array when `customerName` matches no customer.
- Produces (route): `GET /api/pricing-tier-tables?scope=&brandId=&customerId=&customerName=` filters; with no filters, returns all (unchanged behavior).
- Consumes: existing `hydratePricingTierTable`, `getPricingTierTableById`, `createCustomer`, `createPricingTierTable`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/03-pricing-tier-filter.test.js`:

```js
import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();
const {
  createCustomer,
  createPricingTierTable,
  getCustomerIdsByName,
  getPricingTierTablesByFilter,
} = await import('../../db/tasksDb.js');

await createCustomer({
  companyName: 'Acme Factory',
  emailDomain: 'acme.com',
  companyType: 'Garment Factory',
});

const ids = await getCustomerIdsByName('acme factory');
ok(ids.length === 1, 'getCustomerIdsByName matches case-insensitively');
const custId = ids[0];

await createPricingTierTable({
  name: 'Acme tiers',
  scope: 'customer',
  customerId: custId,
  customerName: 'Acme Factory',
  tiers: [{ quantity: 1000, unitPrice: 0 }],
});
await createPricingTierTable({
  name: 'Brand X tiers',
  scope: 'brand',
  brandId: 5,
  brandName: 'Brand X',
  tiers: [{ quantity: 500, unitPrice: 0 }],
});
await createPricingTierTable({
  name: 'Brand X disabled',
  scope: 'brand',
  brandId: 5,
  brandName: 'Brand X',
  disabled: true,
  tiers: [{ quantity: 500, unitPrice: 0 }],
});

const byCustomerName = await getPricingTierTablesByFilter({ scope: 'customer', customerName: 'Acme Factory' });
eq(byCustomerName.length, 1, 'filter by customer name returns the one customer table');
eq(byCustomerName[0].name, 'Acme tiers', '...and it is the correct table');

const byBrand = await getPricingTierTablesByFilter({ scope: 'brand', brandId: 5 });
eq(byBrand.length, 1, 'brand filter excludes disabled tables');

const byCustId = await getPricingTierTablesByFilter({ scope: 'customer', customerId: custId });
eq(byCustId.length, 1, 'filter by customerId works');

const noMatch = await getPricingTierTablesByFilter({ scope: 'customer', customerName: 'Nonexistent' });
eq(noMatch.length, 0, 'no customer match returns empty array');

summary('pricing tier filter');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/03-pricing-tier-filter.test.js`
Expected: FAIL — `getPricingTierTablesByFilter is not a function`.

- [ ] **Step 3: Write minimal implementation**

In `db/tasksDb.js`, immediately after the `getAllPricingTierTables` function (after line 2095), add:

```js
export async function getCustomerIdsByName(name) {
  const db = await getTasksDb();
  if (!name || !String(name).trim()) return [];
  const rows = await db.all(
    `SELECT DISTINCT id FROM customers WHERE companyName = ? COLLATE NOCASE`,
    [String(name).trim()]
  );
  return rows.map((r) => r.id);
}

export async function getPricingTierTablesByFilter({ scope, brandId, customerId, customerName } = {}) {
  const db = await getTasksDb();
  const clauses = ['disabled = 0'];
  const params = [];

  if (scope) {
    clauses.push('scope = ?');
    params.push(scope);
  }
  if (brandId != null) {
    clauses.push('brandId = ?');
    params.push(Number(brandId));
  }
  if (customerId != null) {
    clauses.push('customerId = ?');
    params.push(Number(customerId));
  }
  if (customerName) {
    const ids = await getCustomerIdsByName(customerName);
    if (ids.length === 0) return [];
    clauses.push(`customerId IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }

  const rows = await db.all(
    `SELECT * FROM pricing_tier_tables WHERE ${clauses.join(' AND ')} ORDER BY name COLLATE NOCASE ASC, id DESC`,
    params
  );
  const out = [];
  for (const row of rows) {
    out.push(await hydratePricingTierTable(db, row));
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/03-pricing-tier-filter.test.js`
Expected: PASS — `5 passed, 0 failed`.

- [ ] **Step 5: Wire the route filter**

In `routes/pricing-tier-tables.js`, add `getPricingTierTablesByFilter` to the destructured `deps` at the top of `createPricingTierTableRoutes`:

```js
  const {
    getAllPricingTierTables,
    getPricingTierTablesByFilter,
    getPricingTierTableById,
    createPricingTierTable,
    updatePricingTierTable,
    deletePricingTierTable
  } = deps;
```

Replace the `router.get('/', …)` handler with:

```js
  router.get('/', async (req, res) => {
    try {
      const { scope, brandId, customerId, customerName } = req.query || {};
      const hasFilter = scope || brandId != null || customerId != null || customerName;
      const tables = hasFilter
        ? await getPricingTierTablesByFilter({
            scope,
            brandId: brandId != null ? Number(brandId) : undefined,
            customerId: customerId != null ? Number(customerId) : undefined,
            customerName,
          })
        : await getAllPricingTierTables();
      res.json({ success: true, tables });
    } catch (error) {
      console.error('Error fetching pricing tier tables:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch pricing tier tables' });
    }
  });
```

In `server.js`, add `getPricingTierTablesByFilter` to the existing `tasksDb.js` import that already imports `getAllPricingTierTables` (and friends), then pass it into the deps object at lines 538–544:

```js
const pricingTierTableRoutes = createPricingTierTableRoutes({
  getAllPricingTierTables,
  getPricingTierTablesByFilter,
  getPricingTierTableById,
  createPricingTierTable,
  updatePricingTierTable,
  deletePricingTierTable
});
```

- [ ] **Step 6: Smoke-verify the route (read-only)**

With the server stopped, start it: `npm start` (in another terminal). Then:

```bash
curl -s "http://localhost:3001/api/pricing-tier-tables?scope=brand&brandId=5"
```

Expected: HTTP 200 JSON `{"success":true,"tables":[ ... ]}` (array contents depend on existing data; the key check is `success:true` and no error). Then stop the server.

- [ ] **Step 7: Commit**

```bash
git add db/tasksDb.js routes/pricing-tier-tables.js server.js tests/unit/03-pricing-tier-filter.test.js
git commit -m "feat(api): filtered pricing tier table lookup by brand/customer

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: On-read migration of `productDetails.pricing` to the new shape

**Files:**
- Modify: `db/tasksDb.js` (add `getPricingTierTableScopeMap`, `normalizePricingForRead`; call normalization in `getQuotationById` after line 1405 and in `getAllQuotations` after line 1421)
- Test: `tests/unit/04-pricing-normalize.test.js`

**Interfaces:**
- Produces (db, pure): `normalizePricingForRead(productDetails, scopeMap) -> productDetails` — idempotent. Maps old `{pricingMode, pricingTiers, selectedTierTemplateId}` to new `{tierScopeMode, brandTierTableId, customerTierTableId, tiers}`. For `'tier'` quotations whose template scope is resolvable via `scopeMap[templateId]`, sets `tierScopeMode` to `'brand'`/`'customer'` and the matching id; if unresolvable, sets `tierScopeMode:'none'` and preserves the old tiers as `legacyTiers` (+ `legacyTierTemplateId`). Already-new-shape or missing `pricing` is returned unchanged.
- Produces (db, async): `getPricingTierTableScopeMap(ids) -> Promise<{id: scope}>`.
- Side effect: `getQuotationById` and `getAllQuotations` return migrated `productDetails.pricing`. No destructive writes (migration is on-read only; the new shape persists on the next explicit save).
- Consumes: existing `pricing_tier_tables.scope`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/04-pricing-normalize.test.js`:

```js
import { eq, ok, summary } from './_helpers.js';

const { normalizePricingForRead } = await import('../../db/tasksDb.js');

// flat -> none
let r = normalizePricingForRead({ pricing: { pricingMode: 'flat' } }, {});
eq(r.pricing.tierScopeMode, 'none', 'flat maps to none');
eq(r.pricing.tiers.length, 0, 'flat has empty tiers');

// tier + brand template -> brand
r = normalizePricingForRead(
  { pricing: { pricingMode: 'tier', selectedTierTemplateId: 9, pricingTiers: [{ quantity: 1000, unitPrice: 0.5 }] } },
  { 9: 'brand' }
);
eq(r.pricing.tierScopeMode, 'brand', 'tier + brand scope -> brand');
eq(r.pricing.brandTierTableId, 9, 'brandTierTableId set');
eq(r.pricing.customerTierTableId, null, 'customerTierTableId null');
eq(r.pricing.tiers.length, 1, 'tiers carried over');

// tier + customer template -> customer
r = normalizePricingForRead(
  { pricing: { pricingMode: 'tier', selectedTierTemplateId: 9, pricingTiers: [] } },
  { 9: 'customer' }
);
eq(r.pricing.tierScopeMode, 'customer', 'tier + customer scope -> customer');
eq(r.pricing.customerTierTableId, 9, 'customerTierTableId set');

// tier + unresolvable scope -> none + legacyTiers
r = normalizePricingForRead(
  { pricing: { pricingMode: 'tier', selectedTierTemplateId: 99, pricingTiers: [{ quantity: 500, unitPrice: 0.2 }] } },
  {}
);
eq(r.pricing.tierScopeMode, 'none', 'unresolvable tier -> none');
ok(Array.isArray(r.pricing.legacyTiers) && r.pricing.legacyTiers.length === 1, 'legacyTiers preserved');
eq(r.pricing.legacyTierTemplateId, 99, 'legacyTierTemplateId preserved');

// already new shape -> idempotent
r = normalizePricingForRead({ pricing: { tierScopeMode: 'brand', brandTierTableId: 3, tiers: [] } }, {});
eq(r.pricing.tierScopeMode, 'brand', 'new shape unchanged');
eq(r.pricing.brandTierTableId, 3, 'new shape id unchanged');

// no pricing -> unchanged (no pricing key added)
r = normalizePricingForRead({ material: 'Cotton' }, {});
ok(r.pricing === undefined, 'missing pricing left absent');

summary('pricing normalize');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/unit/04-pricing-normalize.test.js`
Expected: FAIL — `normalizePricingForRead is not a function`.

- [ ] **Step 3: Write minimal implementation (pure helpers)**

In `db/tasksDb.js`, immediately after the `getPricingTierTablesByFilter` function added in Task 3, add:

```js
export async function getPricingTierTableScopeMap(ids = []) {
  const db = await getTasksDb();
  const valid = ids.filter((id) => id != null).map(Number);
  if (valid.length === 0) return {};
  const placeholders = valid.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT id, scope FROM pricing_tier_tables WHERE id IN (${placeholders})`,
    valid
  );
  const map = {};
  for (const row of rows) map[row.id] = row.scope;
  return map;
}

export function normalizePricingForRead(productDetails = {}, scopeMap = {}) {
  const pd = productDetails || {};
  const pricing = pd.pricing;
  if (!pricing || typeof pricing !== 'object') return pd;
  if (pricing.tierScopeMode) return pd; // already new shape

  const tiersFromOld = Array.isArray(pricing.pricingTiers)
    ? pricing.pricingTiers.map((t) => ({
        quantity: Number(t.quantity) || 0,
        unitPrice: Number(t.unitPrice) || 0,
      }))
    : [];

  const next = {
    tierScopeMode: 'none',
    brandTierTableId: null,
    customerTierTableId: null,
    tiers: tiersFromOld,
  };

  if (pricing.pricingMode === 'tier') {
    const templateId = pricing.selectedTierTemplateId != null ? Number(pricing.selectedTierTemplateId) : null;
    const scope = templateId != null ? scopeMap[templateId] : undefined;
    if (scope === 'brand') {
      next.tierScopeMode = 'brand';
      next.brandTierTableId = templateId;
    } else if (scope === 'customer') {
      next.tierScopeMode = 'customer';
      next.customerTierTableId = templateId;
    } else {
      next.tierScopeMode = 'none';
      next.legacyTiers = tiersFromOld;
      if (templateId != null) next.legacyTierTemplateId = templateId;
    }
  }

  return { ...pd, pricing: next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/unit/04-pricing-normalize.test.js`
Expected: PASS — `6 passed, 0 failed`.

- [ ] **Step 5: Call normalization in `getQuotationById`**

In `db/tasksDb.js`, locate `getQuotationById` (line 1396) and the line:

```js
    quotation.productDetails = JSON.parse(quotation.productDetails || '{}');
```

Replace that single line with:

```js
    quotation.productDetails = JSON.parse(quotation.productDetails || '{}');
    {
      const p = quotation.productDetails && quotation.productDetails.pricing;
      if (p && !p.tierScopeMode && p.pricingMode === 'tier' && p.selectedTierTemplateId != null) {
        const scopeMap = await getPricingTierTableScopeMap([Number(p.selectedTierTemplateId)]);
        quotation.productDetails = normalizePricingForRead(quotation.productDetails, scopeMap);
      } else {
        quotation.productDetails = normalizePricingForRead(quotation.productDetails, {});
      }
    }
```

- [ ] **Step 6: Call normalization in `getAllQuotations` (one batched scope lookup)**

In `db/tasksDb.js`, locate `getAllQuotations` (line 1412). After the loop that parses `quotation.productDetails = JSON.parse(...)` for each row (line 1421), add a single batched normalization pass. Find the end of that loop and insert immediately after it:

```js
    const templateIds = quotations
      .map((q) => q.productDetails && q.productDetails.pricing)
      .filter((p) => p && !p.tierScopeMode && p.pricingMode === 'tier' && p.selectedTierTemplateId != null)
      .map((p) => Number(p.selectedTierTemplateId));
    const scopeMap = await getPricingTierTableScopeMap(templateIds);
    quotations = quotations.map((q) => ({
      ...q,
      productDetails: normalizePricingForRead(q.productDetails, scopeMap),
    }));
```

`normalizePricingForRead` reads `productDetails` off the passed object and returns a new `productDetails`, so each quotation is spread and its `productDetails` replaced.

- [ ] **Step 7: Run all unit tests**

Run: `node tests/unit/01-db-override.test.js && node tests/unit/02-tier-prices-column.test.js && node tests/unit/03-pricing-tier-filter.test.js && node tests/unit/04-pricing-normalize.test.js`
Expected: all four print `0 failed` and exit code 0.

- [ ] **Step 8: Commit**

```bash
git add db/tasksDb.js tests/unit/04-pricing-normalize.test.js
git commit -m "feat(db): on-read migration of productDetails.pricing to tierScopeMode

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 1 done — definition of done

- `node tests/unit/*.test.js` (all four) pass with exit code 0.
- `GET /api/pricing-tier-tables` accepts `scope`/`brandId`/`customerId`/`customerName` filters.
- `supplier_quotation_responses` has `tierPrices`.
- A pre-existing quotation read via the API returns `productDetails.pricing` in the new shape (`tierScopeMode`), with old data migrated on read (no destructive writes).

## Open items deliberately deferred to later phases

- Removing the old `tierTemplateSelect` UI and wiring the new conditional dropdown — **Phase 2**.
- Writing `tierPrices` on supplier submit and reading it back — **Phase 3**.
- Confirming the supplier-invitation email composer (spec §6.1) — **Phase 3**.
