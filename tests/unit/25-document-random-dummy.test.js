import { eq, ok, summary } from './_helpers.js';
const { getRandomDummyData, getDocumentType } = await import('../../shared/documentTemplates.js');

// --- shape per type ---
['PI', 'PO', 'PL', 'CI'].forEach((t) => {
  const cfg = getDocumentType(t);
  const d = getRandomDummyData(t);
  ok(d.seller && d.seller.name, `${t} random has seller.name`);
  ok(d.buyer && d.buyer.name, `${t} random has buyer.name`);
  ok(Array.isArray(d.items) && d.items.length >= 2, `${t} random has >=2 items`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(d.meta.issueDate), `${t} random issueDate is YYYY-MM-DD`);
  ok(typeof d.meta.docNumber === 'string' && d.meta.docNumber.indexOf(t + '-') === 0, `${t} random docNumber starts with "${t}-"`);
  d.items.forEach((it, i) => {
    if (cfg.showPrices) {
      ok(typeof it.unitPrice === 'number' && it.unitPrice > 0, `${t} random item[${i}] has numeric unitPrice > 0`);
    } else {
      ok(it.netWeight != null && it.cartons != null, `${t} random item[${i}] has weight/cartons (no prices)`);
      ok(it.unitPrice == null, `${t} random item[${i}] has NO unitPrice (priceless type)`);
    }
  });
  if (t === 'CI') ok(d.items.every((it) => it.hsCode), 'CI random items all carry hsCode');
});

// --- PL carries no prices anywhere ---
const pl = getRandomDummyData('PL');
ok(pl.items.every((it) => it.unitPrice == null), 'PL random items have no unitPrice');
ok(pl.items.every((it) => typeof it.netWeight === 'number'), 'PL random items have numeric netWeight');

// --- numeric ranges ---
const pi = getRandomDummyData('PI');
ok(pi.items.every((it) => it.qty >= 500 && it.qty <= 10000), 'PI random qty within 500..10000');
ok(pi.items.every((it) => it.unitPrice > 0 && it.unitPrice <= 1), 'PI random unitPrice within (0,1]');

// --- randomness: repeated calls produce variety (not a constant) ---
const docs = new Set();
const qtys = new Set();
const buyers = new Set();
for (let i = 0; i < 10; i++) {
  const d = getRandomDummyData('PI');
  docs.add(d.meta.docNumber);
  qtys.add(d.items[0].qty);
  buyers.add(d.buyer.name);
}
ok(docs.size >= 2, 'random docNumbers vary across 10 calls');
ok(qtys.size >= 2, 'random first-item qty varies across 10 calls');
ok(buyers.size >= 2, 'random buyer varies across 10 calls');

// --- unknown type falls back gracefully (non-crashing) ---
const unknown = getRandomDummyData('NOPE');
ok(unknown && Array.isArray(unknown.items), 'unknown type returns a valid-shaped object');

summary('25-document-random-dummy');
