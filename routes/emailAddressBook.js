import express from 'express';

const router = express.Router();

// Email Address Book routes — shared recipient list that pre-fills the Batch Send
// modal in both the Quotation and Outsourcing views. Factory mirrors
// createCurrencyRoutes: receives the db functions as deps, returns a mounted
// router. Email normalization + uniqueness live in the db layer; here we map the
// UNIQUE-constraint error to a 400 and otherwise return the currencies-style
// { success, entries } / { success, entry } JSON shape.
export function createEmailAddressBookRoutes(deps) {
  const {
    getAllEmailAddressBookEntries,
    getEmailAddressBookEntryById,
    createEmailAddressBookEntry,
    updateEmailAddressBookEntry,
    deleteEmailAddressBookEntry,
  } = deps;

  // GET /api/email-address-book - list all entries (name, then email).
  // Optional ?q= narrows to case-insensitive substring matches (server-side fuzzy),
  // used by the Batch Send "search-to-add" box.
  router.get('/', async (req, res) => {
    try {
      const entries = await getAllEmailAddressBookEntries(req.query.q);
      res.json({ success: true, entries });
    } catch (error) {
      console.error('Error fetching email address book:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch address book' });
    }
  });

  // GET /api/email-address-book/:id
  router.get('/:id', async (req, res) => {
    try {
      const entry = await getEmailAddressBookEntryById(Number(req.params.id));
      if (!entry) return res.status(404).json({ success: false, error: 'Entry not found' });
      res.json({ success: true, entry });
    } catch (error) {
      console.error('Error fetching email address book entry:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch entry' });
    }
  });

  // POST /api/email-address-book - create
  router.post('/', async (req, res) => {
    try {
      const { name, email } = req.body || {};
      if (!email || !String(email).trim()) {
        return res.status(400).json({ success: false, error: 'Email is required' });
      }
      const id = await createEmailAddressBookEntry({ name, email });
      const entry = await getEmailAddressBookEntryById(id);
      res.json({ success: true, entry });
    } catch (error) {
      console.error('Error creating email address book entry:', error);
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ success: false, error: 'Email already exists in the address book' });
      }
      res.status(500).json({ success: false, error: 'Failed to create entry' });
    }
  });

  // PUT /api/email-address-book/:id - update
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getEmailAddressBookEntryById(id);
      if (!existing) return res.status(404).json({ success: false, error: 'Entry not found' });
      const { name, email } = req.body || {};
      if (email != null && !String(email).trim()) {
        return res.status(400).json({ success: false, error: 'Email cannot be empty' });
      }
      await updateEmailAddressBookEntry(id, { name, email });
      const entry = await getEmailAddressBookEntryById(id);
      res.json({ success: true, entry });
    } catch (error) {
      console.error('Error updating email address book entry:', error);
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ success: false, error: 'Email already exists in the address book' });
      }
      res.status(500).json({ success: false, error: 'Failed to update entry' });
    }
  });

  // DELETE /api/email-address-book/:id
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getEmailAddressBookEntryById(id);
      if (!existing) return res.status(404).json({ success: false, error: 'Entry not found' });
      await deleteEmailAddressBookEntry(id);
      res.json({ success: true, message: 'Entry deleted' });
    } catch (error) {
      console.error('Error deleting email address book entry:', error);
      res.status(500).json({ success: false, error: 'Failed to delete entry' });
    }
  });

  return router;
}
