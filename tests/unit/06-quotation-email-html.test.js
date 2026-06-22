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
ok(twoTiers.includes('0.5000'), 'tier table renders unit price to 4 decimals');
ok(!twoTiers.includes('500.00'), 'tier table omits total column');
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
  outsourcingSeq: 'OS-001',
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
ok(withCid.includes('OS-001'), 'card shows the quotation ref');
ok(withCid.includes('OS Ref#'), 'card renders OS Ref# label in Product Information');
ok(!withCid.includes('>Ref:</strong>'), 'card no longer duplicates ref in the meta band');
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
ok(!withDataUrl.includes('OS Ref#') && !withDataUrl.includes('Seq#'), 'card omits ref row when quotation has no seq');

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

// --- sample charge: supplier-entered, shown in the confirmation in the quotation's currency ---
const confWithSample = buildSupplierConfirmationHtml(
  { productType: 'pu-patch', productDetails: {}, customerName: 'C', outsourcingSeq: 'OS-1', currency: 'USD' },
  { companyName: 'S' }, { name: 'M' },
  { deliveryDays: 10, notes: '', sampleCharge: 123.5, sanitizedTiers: [] },
  { brandName: 'B' }
);
ok(confWithSample.includes('Sample Charge (USD)'), 'confirmation labels sample charge with the quotation currency');
ok(confWithSample.includes('123.50 USD'), 'confirmation renders sample charge value to 2 decimals with currency');

const confNoSample = buildSupplierConfirmationHtml(
  { productType: 'pu-patch', productDetails: {}, customerName: 'C', currency: 'HKD' },
  { companyName: 'S' }, { name: 'M' },
  { deliveryDays: 10, notes: '', sanitizedTiers: [] },
  { brandName: 'B' }
);
ok(confNoSample.includes('Sample Charge (HKD)'), 'confirmation shows sample-charge row even when none entered');
ok(confNoSample.includes('>-</td>'), 'confirmation renders "-" for sample charge when none entered');

// tier table no longer shows total (data still persisted for downstream use)
const tierTotalPref = generateSupplierResponseTiersHtml([{ quantity: 1000, unitPrice: 0.50, total: 1234.5 }]);
ok(!tierTotalPref.includes('1234.50'), 'tier table omits total even when persisted');
ok(tierTotalPref.includes('0.5000'), 'tier table still shows unit price');

// --- productDetails.tiers: render as a quantity list, never [object Object] ---
const { formatProductDetailValue } = await import('../../shared/quotationEmailHtml.js');
eq(formatProductDetailValue('tiers', [{ quantity: 1000, unitPrice: 0 }, { quantity: 5000, unitPrice: 0 }]), '1,000; 5,000', 'tiers array -> quantity list');
eq(formatProductDetailValue('tiers', []), null, 'empty tiers -> null (skip)');
eq(formatProductDetailValue('tiers', 'oops'), 'oops', 'non-array tiers falls back to resolveProductDetailValue');
eq(formatProductDetailValue('material', 'paper'), 'Paper', 'primitive still resolves via option map');
eq(formatProductDetailValue('size', '10x20'), '10x20', 'free-text value returned verbatim');
eq(formatProductDetailValue('whatever', [{ a: 1 }]), null, 'unknown structured value -> null (skip, no [object Object])');

const cardTiers = generateQuotationCardHtml(
  { productType: 'hang-tag', productDetails: { tiers: [{ quantity: 1000, unitPrice: 0 }, { quantity: 5000, unitPrice: 0 }], tierScopeMode: 'free' }, customerName: 'C' },
  { brandName: 'B' }
);
ok(!cardTiers.includes('[object Object]'), 'card never emits [object Object] for tiers');
ok(!cardTiers.includes('1,000') && !cardTiers.includes('5,000'), 'card skips buyer-requested tier quantities in the spec table');
ok(!cardTiers.includes('Tier Scope Mode'), 'card skips tierScopeMode in the spec table');

// --- generateQuotationDetailSectionsHtml: the shared "all product details" block ---
const { generateQuotationDetailSectionsHtml, INTERNAL_PRODUCT_DETAIL_KEYS } = await import('../../shared/quotationEmailHtml.js');

ok(Array.isArray(INTERNAL_PRODUCT_DETAIL_KEYS) && INTERNAL_PRODUCT_DETAIL_KEYS.includes('tiers'), 'INTERNAL_PRODUCT_DETAIL_KEYS lists tiers');
ok(INTERNAL_PRODUCT_DETAIL_KEYS.includes('tierScopeMode'), 'INTERNAL_PRODUCT_DETAIL_KEYS lists tierScopeMode');
ok(INTERNAL_PRODUCT_DETAIL_KEYS.includes('brandTierTableId') && INTERNAL_PRODUCT_DETAIL_KEYS.includes('customerTierTableId'), 'INTERNAL_PRODUCT_DETAIL_KEYS lists tier table ids');
ok(INTERNAL_PRODUCT_DETAIL_KEYS.includes('quantity'), 'INTERNAL_PRODUCT_DETAIL_KEYS lists quantity (duplicates top-level field)');

const detailQuotation = {
  productType: 'printed-label',
  productDetails: { materialType: 'satin', folding: 'end-fold', tiers: [{ quantity: 222 }, { quantity: 444 }], tierScopeMode: 'free' },
  customerName: 'Acme', contactPerson: 'Joe', email: 'joe@acme.com', phone: '+852 1234 5678',
  customerItemName: 'SKU-1', height_mm: 50, width_mm: 30,
  variable: 'NO',
};
const sections = generateQuotationDetailSectionsHtml(detailQuotation, { brandName: 'BrandX', profileImageSrc: null });
ok(sections.includes('Product Information') && sections.includes('Customer Information') && sections.includes('Brand Detail') && sections.includes('Product Specifications'), 'sections has all four headings');
ok(sections.includes('Contact Person') && sections.includes('joe@acme.com') && sections.includes('+852 1234 5678'), 'sections includes Contact Person / Email / Phone');
ok(sections.includes('BrandX'), 'sections includes brand name');
ok(sections.includes('>NO<'), 'sections includes Variable value');
ok(sections.includes('Customer Item Name') && sections.includes('Height (mm, unfolded)') && sections.includes('Width (mm, unfolded)'), 'sections includes root Customer Item Name / Height / Width');
ok(sections.includes('Satin Tape') && sections.includes('End Fold'), 'sections decodes option codes (materialType satin, folding end-fold)');
ok(!sections.includes('222') && !sections.includes('444'), 'sections skips buyer-requested tier quantities');
ok(!sections.includes('Tier Scope Mode'), 'sections skips tierScopeMode');
ok(!sections.includes('[object Object]'), 'sections never emits [object Object]');

// quantity duplicates the top-level quotation.quantity field and brandTierTableId is
// internal tier config — neither should render as a spec row in emails/PDFs/views.
const qtySections = generateQuotationDetailSectionsHtml(
  { productType: 'printed-label', productDetails: { materialType: 'satin', quantity: 2, brandTierTableId: 156 }, customerName: 'Acme', customerItemName: 'SKU-1' },
  { brandName: 'B' }
);
ok(!qtySections.includes('Quantity'), 'sections skips productDetails.quantity');
ok(!qtySections.includes('Brand Tier Table Id'), 'sections skips brandTierTableId');
ok(!qtySections.includes('>156<'), 'sections skips brandTierTableId value');

// brand fallback when brandName missing
const sectionsNoBrand = generateQuotationDetailSectionsHtml(
  { productType: 'woven-label', productDetails: {}, customerName: 'C' },
  { brandName: undefined }
);
ok(sectionsNoBrand.includes('N/A'), 'sections falls back to N/A brand when brandName missing');

summary('shared quotation email html (maps, helpers, tiers, card)');
