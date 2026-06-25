import { eq, ok, summary } from './_helpers.js';
const { buildDocumentHtml, getDummyData } = await import('../../shared/documentTemplates.js');

const types = ['PI', 'PO', 'PL', 'CI'];
const titles = {
  PI: 'PROFORMA INVOICE', PO: 'PURCHASE ORDER', PL: 'PACKING LIST', CI: 'COMMERCIAL INVOICE',
};

types.forEach((t) => {
  const html = buildDocumentHtml(t, getDummyData(t));
  ok(typeof html === 'string' && html.length > 100, `${t} html is a non-empty string`);
  ok(html.includes(titles[t]), `${t} html contains its title`);
  // Check that at least one item description is rendered (type-specific items)
  const itemDesc = t === 'PO' ? 'PU Patch 50x50mm' : 'Woven Label 20x40mm';
  ok(html.includes(itemDesc), `${t} html renders an item description`);
});

// PI: money columns + totals present
const pi = buildDocumentHtml('PI', getDummyData('PI'));
ok(pi.includes('Unit Price'), 'PI html shows Unit Price column');
ok(pi.includes('Amount'), 'PI html shows Amount column');
ok(pi.includes('Subtotal') && pi.includes('Total'), 'PI html shows Subtotal/Total');

// PL: NO money anywhere
const pl = buildDocumentHtml('PL', getDummyData('PL'));
ok(!pl.includes('Unit Price'), 'PL html omits Unit Price');
ok(!pl.includes('Amount'), 'PL html omits Amount');
ok(!pl.includes('Subtotal'), 'PL html omits Subtotal');
ok(pl.includes('N.W.') && pl.includes('Cartons'), 'PL html shows weight/carton columns');
ok(pl.includes('Total N.W.'), 'PL html shows weight totals');

// CI: HS Code + Country of Origin footer
const ci = buildDocumentHtml('CI', getDummyData('CI'));
ok(ci.includes('HS Code'), 'CI html shows HS Code column');
ok(ci.includes('5807.00'), 'CI html renders hsCode value');
ok(ci.includes('Country of Origin'), 'CI html shows Country of Origin footer');

// amount computed from qty*unitPrice
const piAmt = buildDocumentHtml('PI', { meta: { currency: 'USD' }, items: [{ qty: 4, unitPrice: 1.5 }] });
ok(piAmt.includes('6.00 USD') || piAmt.includes('6.00'), 'PI html computes amount = qty*unitPrice');

// unknown type -> empty string
eq(buildDocumentHtml('NOPE', {}), '', 'unknown type -> empty string');

// HTML escaping (no raw injection)
const esc = buildDocumentHtml('PI', { meta: {}, items: [{ description: '<script>x</script>', qty: 1, unitPrice: 1 }] });
ok(!esc.includes('<script>x</script>'), 'PI html escapes descriptions');
ok(esc.includes('&lt;script&gt;'), 'PI html entity-encodes < >');

summary('21-document-templates-html');
