import { eq, ok, summary } from './_helpers.js';

const {
  PRODUCT_DETAILS_LABELS,
  PRODUCT_OPTION_LABELS,
  formatFileSize,
  emailProductTypeDisplay,
  resolveProductDetailValue,
  generateSupplierResponseTiersHtml,
} = await import('../../shared/quotationEmailHtml.js');

// --- data maps ---
eq(PRODUCT_DETAILS_LABELS.material, 'Material', 'PRODUCT_DETAILS_LABELS.material');
eq(PRODUCT_DETAILS_LABELS.height_mm, 'Height (mm)', 'PRODUCT_DETAILS_LABELS.height_mm');
eq(PRODUCT_OPTION_LABELS.materialType.satin, 'Satin Tape', 'PRODUCT_OPTION_LABELS.materialType.satin');
eq(PRODUCT_OPTION_LABELS.threadColorCount['4-6'], '4-6 Colors', 'PRODUCT_OPTION_LABELS.threadColorCount');

// --- formatFileSize ---
eq(formatFileSize(0), '0 B', 'formatFileSize(0)');
eq(formatFileSize(1024), '1 KB', 'formatFileSize(1024)');
eq(formatFileSize(1048576), '1 MB', 'formatFileSize(1MB)');

// --- emailProductTypeDisplay ---
eq(emailProductTypeDisplay('hang-tag', {}), 'Hang Tag', 'hang-tag -> Hang Tag');
eq(emailProductTypeDisplay('outsource', { _productTag: 'woven-label' }), 'Woven Label', 'outsource+_productTag resolved');
eq(emailProductTypeDisplay(undefined, {}), 'N/A', 'undefined productType -> N/A');

// --- resolveProductDetailValue ---
eq(resolveProductDetailValue('materialType', 'satin'), 'Satin Tape', 'option code resolved');
eq(resolveProductDetailValue('size', '10x20'), '10x20', 'free-text value returned verbatim');

// --- generateSupplierResponseTiersHtml ---
eq(generateSupplierResponseTiersHtml([]), '', 'empty tiers -> empty string');
eq(generateSupplierResponseTiersHtml(undefined), '', 'absent tiers -> empty string');

const twoTiers = generateSupplierResponseTiersHtml([
  { tierIndex: 0, quantity: 1000, unitPrice: 0.5, total: 500 },
  { tierIndex: 1, quantity: 5000, unitPrice: 0.4, total: 2000 },
]);
ok(twoTiers.includes('Supplier Quoted Pricing'), 'tier table has heading');
ok(twoTiers.includes('1,000'), 'tier table renders quantity with locale formatting');
ok(twoTiers.includes('0.50'), 'tier table renders unit price to 2 decimals');
ok(twoTiers.includes('500.00'), 'tier table renders total to 2 decimals');
ok((twoTiers.match(/<tr><td/g) || []).length === 2, 'tier table has exactly 2 body rows');

const { generateQuotationCardHtml } = await import('../../shared/quotationEmailHtml.js');

const quotation = {
  productType: 'hang-tag',
  productDetails: { materialType: 'satin', size: '10x20' },
  customerName: 'Acme',
  contactPerson: 'Joe',
  customerItemName: 'CI-1',
  height_mm: 30,
  width_mm: 40,
  brandId: 7,
  variable: 'YES',
  notes: 'Line1\nLine2',
  dateCreated: '2026-06-19T00:00:00Z',
};

// cid image path (server)
const withCid = generateQuotationCardHtml(quotation, {
  brandName: 'BrandX',
  profileImageSrc: 'cid:profile-image-7@longriverlabel.com',
  osRef: 'OS-001',
});
ok(withCid.includes('<div class="quotation-container"'), 'card opens with quotation-container div');
ok(withCid.includes('style="max-width:800px; margin:0 auto; padding:20px; border:2px solid #000;"'), 'container has inlined layout style');
ok(!withCid.includes('<!DOCTYPE'), 'card is NOT a full document (no doctype)');
ok(withCid.includes('QUOTATION'), 'card has QUOTATION header');
ok(withCid.includes('BrandX'), 'card uses opts.brandName');
ok(withCid.includes('src="cid:profile-image-7@longriverlabel.com"'), 'card embeds cid: image');
ok(withCid.includes('OS-001'), 'card shows osRef');
ok(withCid.includes('Satin Tape'), 'card decodes productDetail option (materialType satin -> Satin Tape)');
ok(withCid.includes('Customer Item Name'), 'card shows root-level customer item name');
ok(withCid.includes('Line1<br>Line2'), 'card renders notes with line breaks');

// data URL image path (browser), no brand -> N/A
const withDataUrl = generateQuotationCardHtml(
  { productType: 'woven-label', productDetails: {}, customerName: 'C' },
  { brandName: undefined, profileImageSrc: 'data:image/png;base64,AAAA', osRef: '' }
);
ok(withDataUrl.includes('src="data:image/png;base64,AAAA"'), 'card embeds data URL image');
ok(withDataUrl.includes('N/A'), 'card falls back to N/A brand when brandName missing');
ok(!withDataUrl.includes('Ref:'), 'card omits Ref band when osRef empty');

// self-contained: every section heading + table carry inline styles (no reliance on a <style> block)
ok(withCid.includes('style="width:100%; border-collapse:collapse;"'), 'card table has inlined quotation-table style');
ok(withCid.includes('border-bottom:2px solid #000; padding-bottom:8px;">Product Information'), 'card section h3 has inlined style');

const { generateQuotationEmailHtml, buildSupplierConfirmationHtml } = await import('../../shared/quotationEmailHtml.js');

// --- generateQuotationEmailHtml: full document wrapper ---
const doc = generateQuotationEmailHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'C' },
  { brandName: 'B', profileImageSrc: null, emailMeta: { from: 'f@x', date: 'D', subject: 'S' }, originalEmailHtml: '<p>orig</p>' }
);
ok(doc.startsWith('<!DOCTYPE html>'), 'wrapper starts with <!DOCTYPE html>');
ok(doc.includes('<html>'), 'wrapper has <html>');
ok(doc.includes('<div class="quotation-container"'), 'wrapper contains the card');
ok(doc.includes('Original Message'), 'wrapper includes reply-quote header');
ok(doc.includes('f@x'), 'wrapper includes emailMeta.from');
ok(doc.includes('<p>orig</p>'), 'wrapper includes originalEmailHtml body');

const docNoReply = generateQuotationEmailHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'C' },
  { brandName: 'B', profileImageSrc: null }
);
ok(!docNoReply.includes('Original Message'), 'wrapper omits reply block when no originalEmailHtml');

// --- buildSupplierConfirmationHtml: tiered submission ---
const tiered = buildSupplierConfirmationHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'Cust', outsourcingSeq: 'OS-9', brandId: 1 },
  { companyName: 'Supplier Co' },
  { name: 'Alice' },
  { deliveryDays: 14, notes: 'tnx', unitPrice: null, totalPrice: null, sanitizedTiers: [
    { tierIndex: 0, quantity: 1000, unitPrice: 0.5, total: 500 },
    { tierIndex: 1, quantity: 5000, unitPrice: 0.4, total: 2000 },
  ] },
  { brandName: 'BrandZ', profileImageCid: 'profile-image-1@longriverlabel.com' }
);
ok(tiered.startsWith('<!DOCTYPE html>'), 'confirmation is a full document');
ok(tiered.includes('<div class="quotation-container"'), 'confirmation includes the card');
ok(tiered.includes('BrandZ'), 'confirmation card shows brand name');
ok(tiered.includes('Submission Confirmation'), 'confirmation has the confirmation block');
ok(tiered.includes('Supplier Co'), 'confirmation shows supplier company');
ok(tiered.includes('Alice'), 'confirmation shows contact');
ok(tiered.includes('Supplier Quoted Pricing'), 'confirmation includes the tier table');
ok(!tiered.includes('Unit Price (HKD)</td>'), 'tiered submission hides flat Unit Price row');

// --- buildSupplierConfirmationHtml: flat submission (no tiers) ---
const flat = buildSupplierConfirmationHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'Cust', outsourcingSeq: 'OS-9' },
  { companyName: 'Supplier Co' },
  { name: 'Alice' },
  { deliveryDays: 14, notes: '', unitPrice: 0.5, totalPrice: 500, sanitizedTiers: [] },
  { brandName: null, profileImageCid: null }
);
ok(!flat.includes('Supplier Quoted Pricing'), 'flat submission omits tier table');
ok(!flat.includes('Unit Price (HKD)'), 'flat submission hides Unit Price row');
ok(!flat.includes('Total Price (HKD)'), 'flat submission hides Total Price row');
ok(flat.includes('N/A'), 'flat submission falls back to N/A brand when brandName null');

// --- hardening: notes escaping (card + confirmation) + tier total preference ---
const cardEsc = generateQuotationCardHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'C', notes: '<script>x</script>\n<b>bold</b>' },
  { brandName: 'B' }
);
ok(cardEsc.includes('&lt;script&gt;x&lt;/script&gt;<br>&lt;b&gt;bold&lt;/b&gt;'), 'card escapes notes HTML and preserves line breaks');

const confEsc = buildSupplierConfirmationHtml(
  { productType: 'hang-tag', productDetails: {}, customerName: 'C', outsourcingSeq: 'OS' },
  { companyName: 'S' }, { name: 'M' },
  { deliveryDays: 1, notes: '<img src=x onerror=alert(1)>', unitPrice: 1, totalPrice: 1, sanitizedTiers: [] },
  { brandName: 'B' }
);
ok(confEsc.includes('&lt;img src=x onerror=alert(1)&gt;'), 'confirmation escapes notes HTML');
ok(!confEsc.includes('<img src=x onerror'), 'confirmation does not emit raw notes markup');

// tier table prefers the persisted t.total over qty * unitPrice
const tierTotalPref = generateSupplierResponseTiersHtml([{ quantity: 1000, unitPrice: 0.50, total: 1234.5 }]);
ok(tierTotalPref.includes('1234.50'), 'tier table uses persisted total (1234.50), not computed qty*unitPrice');

// --- productDetails.tiers: render as a quantity list, never [object Object] ---
const { formatProductDetailValue } = await import('../../shared/quotationEmailHtml.js');
eq(formatProductDetailValue('tiers', [{ quantity: 1000, unitPrice: 0 }, { quantity: 5000, unitPrice: 0 }]), '1,000; 5,000', 'tiers array -> quantity list');
eq(formatProductDetailValue('tiers', []), null, 'empty tiers -> null (skip)');
eq(formatProductDetailValue('tiers', 'oops'), 'oops', 'non-array tiers falls back to resolveProductDetailValue');
eq(formatProductDetailValue('material', 'paper'), 'Paper', 'primitive still resolves via option map');
eq(formatProductDetailValue('size', '10x20'), '10x20', 'free-text value returned verbatim');
eq(formatProductDetailValue('whatever', [{ a: 1 }]), null, 'unknown structured value -> null (skip, no [object Object])');

const cardTiers = generateQuotationCardHtml(
  { productType: 'hang-tag', productDetails: { tiers: [{ quantity: 1000, unitPrice: 0 }, { quantity: 5000, unitPrice: 0 }] }, customerName: 'C' },
  { brandName: 'B' }
);
ok(!cardTiers.includes('[object Object]'), 'card never emits [object Object] for tiers');
ok(cardTiers.includes('1,000') && cardTiers.includes('5,000'), 'card renders tier quantities in the spec table');

summary('shared quotation email html (maps, helpers, tiers, card)');
