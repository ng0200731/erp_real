import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const {
  getTasksDb,
  createQuotation,
  createSupplier,
  createSupplierMember,
  linkSupplierToQuotation,
  advanceToCompareQuotationWhenAllResponded,
} = await import('../../db/tasksDb.js');

const now = new Date().toISOString();
const db = await getTasksDb();

const setStatus = async (qid, status) => {
  await db.run('UPDATE quotations SET status = ? WHERE id = ?', [status, qid]);
};
const getStatus = async (qid) => {
  const r = await db.get('SELECT status FROM quotations WHERE id = ?', [qid]);
  return r ? r.status : null;
};
const mkQuotation = async () => {
  const id = await createQuotation({
    customerName: 'C', productType: 'hang-tag', productDetails: {}, quantity: 1,
    unitPrice: 0, total: 0, dateCreated: now, status: 'await quotation',
  });
  await setStatus(id, 'await quotation');   // guarantee the starting status
  return id;
};
const mkSupplier = async (name) => {
  const sid = await createSupplier({ companyName: name, emailDomain: 'x.com', companyType: 'Factory' });
  const mid = await createSupplierMember(sid, { name: name + '-contact', emailPrefix: name.toLowerCase() });
  return { sid, mid };
};
const mkToken = async (qid, sid, mid) => {
  const t = await db.run(
    `INSERT INTO supplier_quotation_tokens (token, quotationId, supplierId, supplierMemberId, expiresAt, createdAt) VALUES (?, ?, ?, ?, ?, ?)`,
    ['tok-' + sid + '-' + qid, qid, sid, mid, new Date(Date.now() + 86400000).toISOString(), now]
  );
  return t.lastID;
};
const addResponse = async (qid, sid, mid) => {
  const tokenId = await mkToken(qid, sid, mid);
  await db.run(
    `INSERT INTO supplier_quotation_responses (tokenId, quotationId, supplierId, supplierMemberId, unitPrice, totalPrice, deliveryDays, notes, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tokenId, qid, sid, mid, 0.5, 500, 14, 'x', now]
  );
};

// --- Case 1: partial responses (1 of 2) -> no advance ---
const q1 = await mkQuotation();
const a1 = await mkSupplier('Alpha'); const b1 = await mkSupplier('Beta');
await linkSupplierToQuotation(q1, a1.sid); await linkSupplierToQuotation(q1, b1.sid);
await addResponse(q1, a1.sid, a1.mid);   // 1 of 2
const r1 = await advanceToCompareQuotationWhenAllResponded(q1);
eq(r1, null, 'partial responses -> no advance (returns null)');
eq(await getStatus(q1), 'await quotation', 'partial responses -> status unchanged');

// --- Case 2: all responses in (2 of 2) -> advance ---
await addResponse(q1, b1.sid, b1.mid);   // 2 of 2
const r2 = await advanceToCompareQuotationWhenAllResponded(q1);
ok(r2 && r2.advanced === true, 'all responses -> advanced flag true');
eq(r2.from, 'await quotation', 'advance reports from-status');
eq(r2.to, 'compare quotation', 'advance reports to-status');
eq(r2.linkedCount, 2, 'advance reports linkedCount 2');
eq(r2.responseCount, 2, 'advance reports responseCount 2');
eq(await getStatus(q1), 'compare quotation', 'all responses -> status is now compare quotation');

// --- Case 3: idempotent — calling again does nothing ---
const r3 = await advanceToCompareQuotationWhenAllResponded(q1);
eq(r3, null, 'idempotent — no second advance once status moved');
eq(await getStatus(q1), 'compare quotation', 'status stable after repeat call');

// --- Case 4: status is past 'await quotation' -> no advance even if all responded ---
const q4 = await mkQuotation();
const a4 = await mkSupplier('Gamma'); const b4 = await mkSupplier('Delta');
await linkSupplierToQuotation(q4, a4.sid); await linkSupplierToQuotation(q4, b4.sid);
await addResponse(q4, a4.sid, a4.mid); await addResponse(q4, b4.sid, b4.mid);
await setStatus(q4, 'send to customer');
const r4 = await advanceToCompareQuotationWhenAllResponded(q4);
eq(r4, null, 'non-await-quotation status -> no advance');
eq(await getStatus(q4), 'send to customer', 'send-to-customer status untouched');

// --- Case 5: no linked suppliers -> no advance ---
const q5 = await mkQuotation();
const a5 = await mkSupplier('Epsilon');
await addResponse(q5, a5.sid, a5.mid);   // response exists but supplier NOT linked
const r5 = await advanceToCompareQuotationWhenAllResponded(q5);
eq(r5, null, 'zero linked suppliers -> no advance');
eq(await getStatus(q5), 'await quotation', 'await quotation unchanged with no linked suppliers');

// --- Case 6: quotation does not exist -> null, no throw ---
const r6 = await advanceToCompareQuotationWhenAllResponded(99999999);
eq(r6, null, 'missing quotation -> null (no throw)');

summary('auto-advance to compare quotation when all suppliers respond');
