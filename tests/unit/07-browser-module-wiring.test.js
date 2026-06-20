import fs from 'fs';
import { ok, summary } from './_helpers.js';

const root = new URL('../../', import.meta.url);
const indexHtml = fs.readFileSync(new URL('public/index.html', root), 'utf8');
const serverJs = fs.readFileSync(new URL('server.js', root), 'utf8');

// Module loader present in index.html
ok(indexHtml.includes('/shared/quotationEmailHtml.js'), 'index.html imports the shared module');
ok(indexHtml.includes('generateQuotationEmailHtml: Q.generateQuotationEmailHtml'), 'generateQuotationEmailHtml exposed on window');
ok(indexHtml.includes('PRODUCT_OPTION_LABELS: Q.PRODUCT_OPTION_LABELS'), 'PRODUCT_OPTION_LABELS exposed on window');

// The six duplicated inline definitions are gone
const removed = [
  'function formatFileSize(bytes)',
  'function emailProductTypeDisplay(productType, productDetails)',
  'const PRODUCT_DETAILS_LABELS = {',
  'const PRODUCT_OPTION_LABELS = {',
  'function resolveProductDetailValue(key, raw)',
  'function generateQuotationEmailHtml(quotation, emailMeta',
];
for (const needle of removed) {
  ok(!indexHtml.includes(needle), `inline definition removed: ${needle}`);
}

// Exactly two call sites remain, both converted to the opts form
const calls = indexHtml.match(/generateQuotationEmailHtml\(/g) || [];
ok(calls.length === 2, 'exactly two generateQuotationEmailHtml call sites remain');
ok(!indexHtml.includes('generateQuotationEmailHtml(quotation, null, null,'), 'batch-send caller converted to opts form');

// /shared static mount added
ok(serverJs.includes("app.use('/shared', express.static(path.join(__dirname, 'shared')))"), "server.js mounts /shared");

summary('browser module wiring (static checks)');
