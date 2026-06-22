import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const {
  getTasksDb,
  resetTasksDbForTest,
  insertSupplierQuotationFile,
  getSupplierQuotationFiles,
  getSupplierQuotationFileById,
  renameSupplierQuotationFile,
  deleteSupplierQuotationFile,
} = await import('../../db/tasksDb.js');

await resetTasksDbForTest();
const db = await getTasksDb(); // builds schema incl. supplier_quotation_files

// Seed a supplier so the companyName LEFT JOIN can be validated.
const now = new Date().toISOString();
await db.run(
  `INSERT INTO suppliers (id, companyName, emailDomain, companyType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)`,
  [10, 'ACME Co', 'acme.com', 'Factory', now, now]
);

const f1 = await insertSupplierQuotationFile({
  quotationId: 1, supplierId: 10, supplierMemberId: 100, tokenId: 5,
  originalName: 'quote.pdf', storedFilename: 'quote.pdf', filePath: 'uploads/supplier-files/quote.pdf',
  mimeType: 'application/pdf', sizeBytes: 12345, uploadedBy: 'supplier',
});
ok(f1 && f1.id > 0, 'insert returns the row with an id');
eq(f1.originalName, 'quote.pdf', 'insert stores originalName');
eq(f1.uploadedBy, 'supplier', 'insert stores uploadedBy');
eq(f1.companyName, 'ACME Co', 'row carries companyName via LEFT JOIN');

await insertSupplierQuotationFile({
  quotationId: 1, supplierId: 10, supplierMemberId: 100, tokenId: 5,
  originalName: 'spec.xlsx', storedFilename: 'spec-1.xlsx', filePath: 'uploads/supplier-files/spec-1.xlsx',
  mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sizeBytes: 999, uploadedBy: 'supplier',
});
const buyerFile = await insertSupplierQuotationFile({
  quotationId: 1, supplierId: 20, supplierMemberId: null, tokenId: null,
  originalName: 'scan.jpg', storedFilename: 'scan.jpg', filePath: 'uploads/supplier-files/scan.jpg',
  mimeType: 'image/jpeg', sizeBytes: 5000, uploadedBy: 'buyer',
});
ok(buyerFile.supplierMemberId === null, 'buyer upload stores NULL supplierMemberId');
eq(buyerFile.companyName, null, 'no supplier row -> companyName null via LEFT JOIN');

eq((await getSupplierQuotationFiles(1)).length, 3, 'list returns all files for the quotation');
const sup10 = await getSupplierQuotationFiles(1, 10);
eq(sup10.length, 2, 'filtered list returns only that supplier files');
eq(sup10[0].originalName, 'quote.pdf', 'filtered list ordered by uploadedAt ASC');
eq(sup10[0].companyName, 'ACME Co', 'list rows carry companyName');
eq((await getSupplierQuotationFiles(1, 20)).length, 1, 'files list independent of response rows (decoupled)');

const got = await getSupplierQuotationFileById(f1.id);
eq(got.originalName, 'quote.pdf', 'getById returns the row');
eq(await getSupplierQuotationFileById(999999), undefined, 'getById unknown id -> undefined');

const renamed = await renameSupplierQuotationFile(f1.id, 'renamed-quote.pdf');
eq(renamed.originalName, 'renamed-quote.pdf', 'rename updates originalName');
eq(renamed.storedFilename, 'quote.pdf', 'rename does not touch storedFilename (display-only)');

const del = await deleteSupplierQuotationFile(buyerFile.id);
eq(del.id, buyerFile.id, 'delete returns the deleted row');
eq(await getSupplierQuotationFileById(buyerFile.id), undefined, 'deleted row no longer fetchable');
eq((await getSupplierQuotationFiles(1)).length, 2, 'list reflects deletion');
eq(await deleteSupplierQuotationFile(999999), null, 'delete unknown id -> null');

summary('09-supplier-quotation-files');
