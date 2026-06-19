import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();
const {
  getTasksDb,
  createQuotation,
  createSupplier,
  createSupplierMember,
  createSupplierQuotationResponseTiers,
  getSupplierQuotationResponseTiers,
  getSupplierQuotationResponseTiersByQuotation,
} = await import('../../db/tasksDb.js');

// --- Build a minimal quotation + two suppliers + members + tokens + responses ---
const now = new Date().toISOString();
const quotationId = await createQuotation({
  customerName: 'Acme Factory',
  productType: 'hang-tag',
  productDetails: { material: 'satin', tierScopeMode: 'free', tiers: [{ quantity: 1000, unitPrice: 0 }, { quantity: 5000, unitPrice: 0 }] },
  quantity: 1000,
  unitPrice: 0,
  total: 0,
  dateCreated: now,
  status: 'draft',
});

const supplierIdA = await createSupplier({ companyName: 'Supplier A', emailDomain: 'supa.com', companyType: 'Factory' });
const memberA = await createSupplierMember(supplierIdA, { name: 'Alice', emailPrefix: 'alice' });
const supplierIdB = await createSupplier({ companyName: 'Supplier B', emailDomain: 'supb.com', companyType: 'Factory' });
const memberB = await createSupplierMember(supplierIdB, { name: 'Bob', emailPrefix: 'bob' });

const db = await getTasksDb();
const tokenA = await db.run(
  `INSERT INTO supplier_quotation_tokens (token, quotationId, supplierId, supplierMemberId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
  ['tok-a', quotationId, supplierIdA, memberA, new Date(Date.now() + 86400000).toISOString(), now]
);
const tokenB = await db.run(
  `INSERT INTO supplier_quotation_tokens (token, quotationId, supplierId, supplierMemberId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
  ['tok-b', quotationId, supplierIdB, memberB, new Date(Date.now() + 86400000).toISOString(), now]
);

const respA = await db.run(
  `INSERT INTO supplier_quotation_responses (tokenId, quotationId, supplierId, supplierMemberId, unitPrice, totalPrice, deliveryDays, notes, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [tokenA.lastID, quotationId, supplierIdA, memberA, 0.50, 500, 14, 'A', now]
);
const respB = await db.run(
  `INSERT INTO supplier_quotation_responses (tokenId, quotationId, supplierId, supplierMemberId, unitPrice, totalPrice, deliveryDays, notes, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  [tokenB.lastID, quotationId, supplierIdB, memberB, 0.45, 450, 10, 'B', now]
);
const responseIdA = respA.lastID;
const responseIdB = respB.lastID;

// --- createSupplierQuotationResponseTiers: inserts rows, derives missing totals ---
const created = await createSupplierQuotationResponseTiers(responseIdA, [
  { quantity: 1000, unitPrice: 0.50, total: 500 },
  { quantity: 5000, unitPrice: 0.40 }, // total should be derived = 2000
]);
eq(created.length, 2, 'createSupplierQuotationResponseTiers inserts 2 rows');
eq(created[0].tierIndex, 0, 'first tier has tierIndex 0');
eq(created[1].tierIndex, 1, 'second tier has tierIndex 1');
eq(created[1].total, 2000, 'missing total is derived from quantity * unitPrice');

await createSupplierQuotationResponseTiers(responseIdB, [
  { quantity: 1000, unitPrice: 0.45, total: 450 },
  { quantity: 5000, unitPrice: 0.35, total: 1750 },
]);

// --- getSupplierQuotationResponseTiers ---
const tiersA = await getSupplierQuotationResponseTiers(responseIdA);
eq(tiersA.length, 2, 'getSupplierQuotationResponseTiers returns 2 rows');
eq(tiersA[0].quantity, 1000, 'first tier quantity preserved');
eq(tiersA[1].unitPrice, 0.40, 'second tier unit price preserved');
eq(Number(tiersA[1].total), 2000, 'second tier derived total stored');

// --- getSupplierQuotationResponseTiersByQuotation: join across 2 suppliers ---
const byQuote = await getSupplierQuotationResponseTiersByQuotation(quotationId);
eq(byQuote.length, 4, 'by-quotation join returns 4 tier rows (2 suppliers x 2 tiers)');
eq(byQuote[0].tierIndex, 0, 'joined rows ordered by tierIndex first');
eq(byQuote[0].quantity, 1000, 'tier 0 quantity');
// Each joined row carries its supplier for the comparison matrix.
ok(byQuote.every((r) => r.supplierId != null), 'joined rows carry supplierId');

// --- Idempotency: re-creating clears prior rows for that response (no duplication) ---
await createSupplierQuotationResponseTiers(responseIdA, [{ quantity: 999, unitPrice: 1, total: 999 }]);
const afterRecreate = await getSupplierQuotationResponseTiers(responseIdA);
eq(afterRecreate.length, 1, 're-creating tiers replaces prior rows (idempotent)');
eq(afterRecreate[0].quantity, 999, 'replacement row is the new one');

const byQuoteAfter = await getSupplierQuotationResponseTiersByQuotation(quotationId);
eq(byQuoteAfter.length, 3, 'by-quotation reflects 3 rows after replacement (1 + 2)');

// --- Guards: empty / invalid responseId returns empty, no throw ---
const empty = await createSupplierQuotationResponseTiers(0, [{ quantity: 1, unitPrice: 1 }]);
eq(empty.length, 0, 'create with invalid responseId returns empty');
const none = await getSupplierQuotationResponseTiers(999999);
eq(none.length, 0, 'get for unknown responseId returns empty array');

summary('supplier response tiers');
