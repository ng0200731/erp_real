import express from 'express';
import { eq, ok, summary } from './_helpers.js';
const { createDocumentRoutes } = await import('../../routes/documents.js');
const { getDummyData } = await import('../../shared/documentTemplates.js');

const app = express();
app.use(express.json());
app.use('/api/documents', createDocumentRoutes());
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;

async function postPdf(type, data) {
  const res = await fetch(`${base}/api/documents/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data }),
  });
  return res;
}

for (const t of ['PI', 'PO', 'PL', 'CI']) {
  const res = await postPdf(t, getDummyData(t));
  eq(res.status, 200, `${t} POST -> 200`);
  eq(res.headers.get('content-type'), 'application/pdf', `${t} content-type is application/pdf`);
  const buf = Buffer.from(await res.arrayBuffer());
  ok(buf.length > 1000, `${t} response body is non-trivial`);
  eq(buf.slice(0, 4).toString('latin1'), '%PDF', `${t} body starts with %PDF`);
  const cd = res.headers.get('content-disposition') || '';
  ok(cd.includes('attachment'), `${t} Content-Disposition is attachment`);
}

// unknown type -> 400
const bad = await postPdf('NOPE', {});
eq(bad.status, 400, 'unknown type -> 400');
const badJson = await bad.json();
eq(badJson.success, false, 'unknown type body success=false');

// missing body -> 400 (no type)
const noBody = await fetch(`${base}/api/documents/pdf`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
});
eq(noBody.status, 400, 'missing type -> 400');

server.close();
summary('23-documents-route');
