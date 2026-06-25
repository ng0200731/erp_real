// Email Address Book — DB CRUD + REST route integration.
// Boots a throwaway Express app on an ephemeral port against a temp SQLite DB, so
// it never touches the dev server or dev DB. Mirrors the test 10 (supplier-files)
// harness. Run: node tests/unit/14-email-address-book.test.js
import express from 'express';
import { eq, ok, summary, tempDbPath } from './_helpers.js';

process.env.ERP_DB_PATH = tempDbPath();

const {
  getTasksDb, resetTasksDbForTest,
  getAllEmailAddressBookEntries, getEmailAddressBookEntryById,
  createEmailAddressBookEntry, updateEmailAddressBookEntry, deleteEmailAddressBookEntry,
} = await import('../../db/tasksDb.js');
const { createEmailAddressBookRoutes } = await import('../../routes/emailAddressBook.js');

await resetTasksDbForTest();
await getTasksDb(); // ensure schema (email_address_book table) is initialized

// --- DB layer: CRUD + normalization + uniqueness ---
eq(await createEmailAddressBookEntry({ name: 'Eric', email: 'Eric@X.com' }), 1,
  'create returns the new id');
eq(await createEmailAddressBookEntry({ name: 'Mary', email: 'mary@x.com' }), 2,
  'create returns the second id');

const all = await getAllEmailAddressBookEntries();
eq(all.length, 2, 'getAll lists both entries');
eq(all[0], { id: 1, name: 'Eric', email: 'eric@x.com', createdAt: all[0].createdAt, updatedAt: all[0].updatedAt },
  'email normalized to lowercase + trimmed; ordered by name (Eric before Mary)');

eq((await getEmailAddressBookEntryById(1)).email, 'eric@x.com', 'getById returns the entry');
ok((await getEmailAddressBookEntryById(999)) == null, 'getById unknown -> null/undefined');

// --- search: server-side substring, case-insensitive (Eric + Mary present) ---
eq((await getAllEmailAddressBookEntries()).length, 2, 'no query returns all entries');
eq((await getAllEmailAddressBookEntries('')).length, 2, 'empty query returns all entries');
eq((await getAllEmailAddressBookEntries('eric')).map(e => e.email), ['eric@x.com'], 'search "eric" matches Eric only');
eq((await getAllEmailAddressBookEntries('ERIC')).map(e => e.email), ['eric@x.com'], 'search is case-insensitive');
eq((await getAllEmailAddressBookEntries('mary')).map(e => e.email), ['mary@x.com'], 'search "mary" matches Mary only');
eq((await getAllEmailAddressBookEntries('x.com')).map(e => e.email).sort(), ['eric@x.com', 'mary@x.com'], 'domain substring matches both');
eq((await getAllEmailAddressBookEntries('nomatch')), [], 'no match -> empty array');

// uniqueness is case-insensitive (write-side lowercasing) + trims whitespace
let dupThrew = false;
try { await createEmailAddressBookEntry({ email: '  ERIC@X.com  ' }); }
catch { dupThrew = true; }
ok(dupThrew, 'duplicate email (case/space-variant) is rejected');

let emptyThrew = false;
try { await createEmailAddressBookEntry({ email: '   ' }); }
catch { emptyThrew = true; }
ok(emptyThrew, 'empty email is rejected');

await updateEmailAddressBookEntry(1, { name: 'Eric S.' });
eq((await getEmailAddressBookEntryById(1)).name, 'Eric S.', 'update changes the name');
eq((await getEmailAddressBookEntryById(1)).email, 'eric@x.com', 'update leaves email intact when not provided');

let updateDupThrew = false;
try { await updateEmailAddressBookEntry(1, { email: 'mary@x.com' }); }
catch { updateDupThrew = true; }
ok(updateDupThrew, 'update to another entry\'s email is rejected');

eq(await deleteEmailAddressBookEntry(2), true, 'delete returns true');
ok((await getEmailAddressBookEntryById(2)) == null, 'deleted entry is gone');
eq((await getAllEmailAddressBookEntries()).length, 1, 'only one entry remains');

// --- Route layer: throwaway Express app ---
const app = express();
app.use(express.json());
app.use('/api/email-address-book', createEmailAddressBookRoutes({
  getAllEmailAddressBookEntries, getEmailAddressBookEntryById,
  createEmailAddressBookEntry, updateEmailAddressBookEntry, deleteEmailAddressBookEntry,
}));
const server = app.listen(0);
const base = `http://localhost:${server.address().port}/api/email-address-book`;

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON allowed for assertions */ }
  return { status: res.status, json };
}

// Start clean for the route section
await deleteEmailAddressBookEntry(1);

const created = await call('POST', '/', { name: 'Bob', email: 'BOB@y.com' });
eq(created.status, 200, 'POST create -> 200');
ok(created.json && created.json.success === true && created.json.entry.email === 'bob@y.com',
  'POST create returns the normalized entry');

const listed = await call('GET', '/');
eq(listed.status, 200, 'GET list -> 200');
ok(listed.json && Array.isArray(listed.json.entries) && listed.json.entries.length === 1,
  'GET list returns the entries array');

const searchHit = await call('GET', '/?q=bob');
eq(searchHit.status, 200, 'GET ?q=bob -> 200');
ok(searchHit.json.entries.length === 1 && searchHit.json.entries[0].email === 'bob@y.com',
  'route ?q= filters to the matching entry');
const searchMiss = await call('GET', '/?q=nomatch');
eq(searchMiss.json.entries.length, 0, 'route ?q= with no match -> empty array');
const searchEmpty = await call('GET', '/?q=');
eq(searchEmpty.json.entries.length, 1, 'route ?q= (empty) returns all');

const dup = await call('POST', '/', { email: 'bob@y.com' });
eq(dup.status, 400, 'POST duplicate email -> 400');
ok(dup.json && /already exists/i.test(dup.json.error), 'duplicate error message is meaningful');

const noEmail = await call('POST', '/', {});
eq(noEmail.status, 400, 'POST without email -> 400');

const updated = await call('PUT', '/' + created.json.entry.id, { name: 'Robert' });
eq(updated.status, 200, 'PUT update -> 200');
eq(updated.json.entry.name, 'Robert', 'PUT update reflects the new name');

const putDup = await call('PUT', '/' + created.json.entry.id, { email: 'mary@x.com' });
// 'mary@x.com' was deleted above, so this should now succeed (not a dup)
eq(putDup.status, 200, 'PUT to a now-free email -> 200');

const putEmpty = await call('PUT', '/' + created.json.entry.id, { email: '   ' });
eq(putEmpty.status, 400, 'PUT empty email -> 400');

const notFound = await call('GET', '/9999');
eq(notFound.status, 404, 'GET unknown id -> 404');

const delMissing = await call('DELETE', '/9999');
eq(delMissing.status, 404, 'DELETE unknown id -> 404');

const deleted = await call('DELETE', '/' + created.json.entry.id);
eq(deleted.status, 200, 'DELETE existing -> 200');
eq((await getAllEmailAddressBookEntries()).length, 0, 'route DELETE removed the entry');

server.close();
summary('email address book (db + routes)');
