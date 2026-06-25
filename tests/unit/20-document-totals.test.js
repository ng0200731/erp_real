import { eq, ok, summary } from './_helpers.js';
const {
  DOCUMENT_TYPES, COLUMN_LABELS, TOTALS_LABELS,
  getDocumentType, computeTotals, getDummyData,
} = await import('../../shared/documentTemplates.js');

// --- type registry ---
eq(Object.keys(DOCUMENT_TYPES).sort().join(','), 'CI,PI,PL,PO', 'four types registered');
eq(getDocumentType('PI').title, 'PROFORMA INVOICE', 'PI title');
eq(getDocumentType('PL').showPrices, false, 'PL hides prices');
eq(getDocumentType('CI').showPrices, true, 'CI shows prices');
eq(getDocumentType('NOPE'), null, 'unknown type -> null');

// PL item columns have no money columns
const plCols = getDocumentType('PL').itemColumns;
ok(!plCols.includes('unitPrice') && !plCols.includes('amount'), 'PL columns omit unitPrice/amount');
ok(plCols.includes('netWeight') && plCols.includes('cartons'), 'PL columns include weight/cartons');
// CI item columns include hsCode
ok(getDocumentType('CI').itemColumns.includes('hsCode'), 'CI columns include hsCode');

// --- computeTotals: price type with tax ---
const piData = {
  meta: { currency: 'USD', taxRate: 0.1 },
  items: [
    { qty: 5000, unitPrice: 0.05, netWeight: 2.5, grossWeight: 3, cartons: 1 },
    { qty: 2000, unitPrice: 0.12, netWeight: 4, grossWeight: 4.8, cartons: 1 },
  ],
};
const piTotals = computeTotals('PI', piData);
eq(piTotals.subtotal, 490, 'PI subtotal = 5000*0.05 + 2000*0.12 = 250+240');
eq(piTotals.tax, 49, 'PI tax = 490 * 0.10');
eq(piTotals.total, 539, 'PI total = subtotal + tax');
eq(piTotals.totalQty, 7000, 'PI totalQty');
eq(piTotals.totalCartons, 2, 'PI totalCartons');

// --- computeTotals: price type with no tax (default 0) ---
const noTax = computeTotals('CI', { items: [{ qty: 1, unitPrice: 2 }, { qty: 3, unitPrice: 5 }] });
eq(noTax.tax, 0, 'tax defaults to 0 when taxRate absent');
eq(noTax.total, 17, 'total = subtotal when no tax');

// --- computeTotals: PL weights ---
const plTotals = computeTotals('PL', { items: [
  { qty: 5000, netWeight: 2.5, grossWeight: 3 },
  { qty: 2000, netWeight: 4, grossWeight: 4.8 },
] });
eq(plTotals.totalNetWeight, 6.5, 'PL totalNetWeight');
eq(plTotals.totalGrossWeight, 7.8, 'PL totalGrossWeight');
eq(plTotals.totalQty, 7000, 'PL totalQty');

// --- computeTotals: empty/defensive ---
const empty = computeTotals('PI', { items: [] });
eq(empty.subtotal, 0, 'empty items -> subtotal 0');
eq(computeTotals('PI', null).subtotal, 0, 'null data -> subtotal 0');

// --- getDummyData ---
['PI', 'PO', 'PL', 'CI'].forEach((t) => {
  const d = getDummyData(t);
  ok(d.seller && d.seller.name, `${t} dummy has seller.name`);
  ok(d.buyer && d.buyer.name, `${t} dummy has buyer.name`);
  ok(Array.isArray(d.items) && d.items.length >= 2, `${t} dummy has >=2 items`);
  ok(d.meta && d.meta.docNumber, `${t} dummy has meta.docNumber`);
  ok(d.meta.issueDate && /^\d{4}-\d{2}-\d{2}$/.test(d.meta.issueDate), `${t} dummy issueDate is YYYY-MM-DD`);
});
eq(getDummyData('PI').meta.docNumber, 'PI-2026-0001', 'PI dummy doc number');
eq(getDummyData('PL').meta.reference, 'Ref: CI-2026-0001', 'PL dummy reference');

summary('20-document-totals');
