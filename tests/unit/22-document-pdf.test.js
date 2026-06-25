import { eq, ok, summary } from './_helpers.js';
const { buildDocumentPdf } = await import('../../utils/documentPdf.js');
const { getDummyData } = await import('../../shared/documentTemplates.js');

for (const t of ['PI', 'PO', 'PL', 'CI']) {
  const buf = await buildDocumentPdf(t, getDummyData(t));
  ok(Buffer.isBuffer(buf), `${t} returns a Buffer`);
  ok(buf.length > 1000, `${t} PDF buffer is non-trivially large`);
  eq(buf.slice(0, 4).toString('latin1'), '%PDF', `${t} PDF starts with %PDF`);
  ok(buf.includes(Buffer.from('/Type /Page', 'latin1')) || buf.includes(Buffer.from('/Page', 'latin1')), `${t} PDF has a page object`);
}

// unknown type throws
let threw = false;
try { await buildDocumentPdf('NOPE', {}); } catch { threw = true; }
ok(threw, 'unknown type throws');

summary('22-document-pdf');
