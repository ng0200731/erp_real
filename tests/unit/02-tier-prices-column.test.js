import { ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();
const { getTasksDb } = await import('../../db/tasksDb.js');

const db = await getTasksDb();
const cols = await db.all(`PRAGMA table_info(supplier_quotation_responses)`);
const names = cols.map((c) => c.name);

ok(names.includes('tierPrices'), 'supplier_quotation_responses has tierPrices column');

summary('tierPrices column migration');