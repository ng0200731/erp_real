import { ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const { getTasksDb, resetTasksDbForTest } = await import('../../db/tasksDb.js');

await resetTasksDbForTest();
const db = await getTasksDb();

function hasColumn(rows, name) {
  return rows.some(r => r.name === name);
}

const qCols = await db.all(`PRAGMA table_info(quotations)`);
ok(hasColumn(qCols, 'customerId'), 'quotations.customerId column exists');

const oCols = await db.all(`PRAGMA table_info(orders)`);
ok(hasColumn(oCols, 'customerId'), 'orders.customerId column exists');

const mCols = await db.all(`PRAGMA table_info(customer_members)`);
ok(hasColumn(mCols, 'isPrimary'), 'customer_members.isPrimary column exists');

summary('14-sync-schema-columns');
