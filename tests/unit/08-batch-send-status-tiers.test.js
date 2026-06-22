import { eq, ok, summary } from './_helpers.js';

const {
  formatStatusLabel,
  resolveStatusTierMode,
  generateStatusTierSectionHtml,
  generateQuotationCardHtml,
  generateQuotationEmailHtml,
} = await import('../../shared/quotationEmailHtml.js');

// --- formatStatusLabel ---
eq(formatStatusLabel('await quotation'), 'Await Quotation', 'await quotation -> Title Case');
eq(formatStatusLabel('send to outsourcing supplier'), 'Send To Outsourcing Supplier', 'multi-word status -> Title Case');
eq(formatStatusLabel('1st resubmit'), '1st Resubmit', 'keeps leading ordinal, title-cases rest');
eq(formatStatusLabel(''), 'N/A', 'empty status -> N/A');
eq(formatStatusLabel(null), 'N/A', 'null status -> N/A');
eq(formatStatusLabel(undefined), 'N/A', 'undefined status -> N/A');

// --- resolveStatusTierMode: driven by response COUNT, not status string ---
eq(resolveStatusTierMode({ status: 'await quotation', responses: [] }).mode, 'empty',
  'await quotation with NO responses -> empty');
eq(resolveStatusTierMode({ status: 'compare quotation', responses: [] }).mode, 'empty',
  'compare quotation with NO responses -> empty');
eq(resolveStatusTierMode({ status: 'pending', responses: [] }).mode, 'empty',
  'pending with NO responses -> empty');

const twoResp = [{ id: 10, supplierId: 1 }, { id: 11, supplierId: 2 }];
eq(resolveStatusTierMode({ status: 'await quotation', responses: twoResp }).mode, 'all',
  'await quotation WITH responses -> all (response-count-driven, the user test case)');
eq(resolveStatusTierMode({ status: 'compare quotation', responses: twoResp }).mode, 'all',
  'compare quotation with responses -> all');

const noSel = resolveStatusTierMode({ status: 'compare quotation', responses: twoResp });
eq(noSel.selectedSupplierId, null, 'no selection passed -> selectedSupplierId null');
eq(noSel.selectedResponseId, null, 'no selection passed -> selectedResponseId null');
eq(noSel.markupPercent, 0, 'no markup passed -> markupPercent 0');

const withSel = resolveStatusTierMode({
  status: 'send to customer',
  responses: twoResp,
  selectedSupplierId: '1',
  selectedResponseId: '10',
  markupPercent: '15',
});
eq(withSel.mode, 'all', 'send to customer with responses -> all');
eq(withSel.selectedSupplierId, 1, 'selectedSupplierId coerced to number');
eq(withSel.selectedResponseId, 10, 'selectedResponseId coerced to number');
eq(withSel.markupPercent, 15, 'markupPercent coerced to number');

// --- generateStatusTierSectionHtml: empty mode ---
const emptySec = generateStatusTierSectionHtml({ status: 'await quotation', responses: [] });
ok(emptySec.includes('Supplier Quotations'), 'empty section still has the section heading');
ok(emptySec.includes('No supplier quotations to show at this stage'), 'empty section has placeholder text');
ok(!emptySec.includes('ABC Mfg'), 'empty section has no supplier rows');

// --- empty mode WITH requested tiers (Pending): render the tier template ---
const pendingTiers = generateStatusTierSectionHtml({ status: 'pending', responses: [], requestedTiers: [2, 5, 8], currency: 'USD' });
ok(pendingTiers.includes('Unit Price (USD)'), 'pending with requested tiers shows Unit Price header in quotation currency');
ok(pendingTiers.includes('Quantity'), 'pending tier table has a Quantity column');
ok(pendingTiers.includes('—'), 'pending tier table shows blank (em-dash) unit-price cells');
ok(!pendingTiers.includes('No supplier quotations to show'), 'pending with tiers hides the empty placeholder');
const pendingObjs = generateStatusTierSectionHtml({ status: 'pending', responses: [], requestedTiers: [{ quantity: 100 }, { quantity: 500 }] });
ok(pendingObjs.includes('100') && pendingObjs.includes('500'), 'pending tier table accepts {quantity} object form');

// --- fixtures for populated modes ---
const respA = {
  id: 10, supplierId: 1, companyName: 'ABC Mfg', memberName: 'John',
  emailPrefix: 'john', emailDomain: 'abc.com',
  unitPrice: 2.00, totalPrice: 200.00, deliveryDays: 14, notes: 'fast turnaround',
  moq: 3000, surchargeBelowMoq: 80.00,
  tiers: [
    { tierIndex: 0, quantity: 1000, unitPrice: 1.00, total: 1000 },
    { tierIndex: 1, quantity: 5000, unitPrice: 0.80, total: 4000 },
  ],
};
const respB = {
  id: 11, supplierId: 2, companyName: 'XYZ Co', memberName: 'Mary',
  emailPrefix: 'mary', emailDomain: 'xyz.com',
  unitPrice: 3.00, totalPrice: 300.00, deliveryDays: 21, notes: '',
  moq: 1500, surchargeBelowMoq: 45.50,
  tiers: [],
};

// --- comparison mode: responses, no selection, no markup ---
const compSec = generateStatusTierSectionHtml({
  status: 'compare quotation', responses: [respA, respB],
});
ok(compSec.includes('ABC Mfg'), 'comparison shows supplier A');
ok(compSec.includes('XYZ Co'), 'comparison shows supplier B');
ok(compSec.includes('john@abc.com'), 'comparison shows supplier A email');
ok(compSec.includes('mary@xyz.com'), 'comparison shows supplier B email');
ok(compSec.includes('MOQ (pcs)'), 'comparison table has MOQ column');
ok(compSec.includes('Surcharge below MOQ'), 'comparison table has Surcharge column');
ok(compSec.includes('3,000'), 'comparison shows supplier A MOQ (pcs)');
ok(compSec.includes('80.00'), 'comparison shows supplier A surcharge (2dp)');
ok(!compSec.includes('Unit Price ('), 'comparison omits Unit Price column');
ok(!compSec.includes('200.00'), 'comparison omits supplier A total column');
ok(!compSec.includes('✓ Selected'), 'comparison has no selected badge when nothing selected');
ok(!compSec.includes('markup'), 'comparison has no markup text when markupPercent 0');
ok(compSec.includes('1,000') && compSec.includes('5,000'), 'comparison per-tier matrix shows quantities');
ok(!compSec.includes('Tier total'), 'comparison per-tier matrix omits Tier total row');

// --- selected + markup mode ---
const selSec = generateStatusTierSectionHtml({
  status: 'send to customer',
  responses: [respA, respB],
  selectedSupplierId: 1,
  selectedResponseId: 10,
  markupPercent: 15,
});
ok(selSec.includes('✓ Selected'), 'selected mode marks the selected supplier');
ok(!selSec.includes('Unit Price ('), 'selected mode omits Unit Price column');
ok(!selSec.includes('2.30'), 'selected supplier unit-price markup not shown (column removed)');
ok(!selSec.includes('230.00'), 'selected supplier total column omitted');
ok(selSec.includes('1.1500'), 'selected supplier tier unit price marked up (1.00 * 1.15, 4dp)');
ok(selSec.includes('line-through'), 'non-selected supplier row is struck through');
ok(!selSec.includes('15% markup'), 'summary row no longer carries the markup annotation');

// selection by supplierId when selectedResponseId absent
const selBySupplier = generateStatusTierSectionHtml({
  status: 'send to customer',
  responses: [respA, respB],
  selectedSupplierId: 2,           // XYZ
  selectedResponseId: null,
  markupPercent: 0,
});
ok(selBySupplier.includes('✓ Selected'), 'selection matches on selectedSupplierId alone');
ok(selBySupplier.includes('line-through'), 'non-selected (ABC) is struck through when XYZ selected');

// stale selection id -> graceful: no badge, no crash, plain comparison
const stale = generateStatusTierSectionHtml({
  status: 'compare quotation',
  responses: [respA, respB],
  selectedSupplierId: 999,
  selectedResponseId: 999,
  markupPercent: 0,
});
ok(!stale.includes('✓ Selected'), 'stale selection id -> no row marked (falls back to plain comparison)');

// --- generateQuotationCardHtml: status in meta band ---
const cardStatus = generateQuotationCardHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'C', status: 'await quotation' },
  { brandName: 'B' }
);
ok(cardStatus.includes('Status:'), 'card meta band shows a Status label');
ok(cardStatus.includes('Await Quotation'), 'card meta band shows the formatted status');

const cardNoStatus = generateQuotationCardHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'C' },
  { brandName: 'B' }
);
ok(cardNoStatus.includes('Status:') && cardNoStatus.includes('N/A'), 'card meta band shows Status: N/A when status absent');

// --- generateQuotationEmailHtml: opts.afterCardHtml injection ---
const docWithExtra = generateQuotationEmailHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'C' },
  { brandName: 'B', profileImageSrc: null, afterCardHtml: '<div id="tier-section">TIER</div>' }
);
ok(docWithExtra.includes('id="tier-section"'), 'wrapper injects afterCardHtml into the body');
ok(
  docWithExtra.indexOf('quotation-container') < docWithExtra.indexOf('tier-section')
  && docWithExtra.indexOf('tier-section') < docWithExtra.indexOf('</body>'),
  'afterCardHtml appears after the card and before </body>'
);

const docWithoutExtra = generateQuotationEmailHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'C' },
  { brandName: 'B', profileImageSrc: null }
);
ok(!docWithoutExtra.includes('tier-section'), 'wrapper without afterCardHtml is unchanged (no marker)');

summary('batch send status + tier section (shared module)');
