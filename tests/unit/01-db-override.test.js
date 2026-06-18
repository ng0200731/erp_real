import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();
const { getTasksDb, resetTasksDbForTest, getAllPricingTierTables } = await import('../../db/tasksDb.js');

let tables = await getAllPricingTierTables();
ok(Array.isArray(tables) && tables.length === 0, 'fresh temp DB has zero tier tables');

await resetTasksDbForTest();
process.env.ERP_DB_PATH = tempDbPath();
tables = await getAllPricingTierTables();
ok(Array.isArray(tables) && tables.length === 0, 'second temp DB is isolated after reset');

const db = await getTasksDb();
ok(typeof db.all === 'function', 'getTasksDb returns a usable db handle');

summary('DB path override + reset');