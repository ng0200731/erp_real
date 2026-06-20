import express from 'express';

const router = express.Router();

export function createCurrencyRoutes(deps) {
  const { getAllCurrencies, getCurrencyById, getCurrencyByCode, createCurrency, updateCurrency, deleteCurrency, getBaseCurrency } = deps;

  // GET /api/currencies - List all currencies (base first, then alphabetical)
  router.get('/', async (req, res) => {
    try {
      const currencies = await getAllCurrencies();
      res.json({ success: true, currencies });
    } catch (error) {
      console.error('Error fetching currencies:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch currencies' });
    }
  });

  // GET /api/currencies/base - Get the base currency
  router.get('/base', async (req, res) => {
    try {
      const base = await getBaseCurrency();
      res.json({ success: true, currency: base });
    } catch (error) {
      console.error('Error fetching base currency:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch base currency' });
    }
  });

  // GET /api/currencies/:id - Get currency by ID
  router.get('/:id', async (req, res) => {
    try {
      const currency = await getCurrencyById(Number(req.params.id));
      if (!currency) {
        return res.status(404).json({ success: false, error: 'Currency not found' });
      }
      res.json({ success: true, currency });
    } catch (error) {
      console.error('Error fetching currency:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch currency' });
    }
  });

  // GET /api/currencies/code/:code - Get currency by code (e.g., 'USD')
  router.get('/code/:code', async (req, res) => {
    try {
      const currency = await getCurrencyByCode(req.params.code);
      if (!currency) {
        return res.status(404).json({ success: false, error: 'Currency not found' });
      }
      res.json({ success: true, currency });
    } catch (error) {
      console.error('Error fetching currency by code:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch currency' });
    }
  });

  // POST /api/currencies - Create new currency
  router.post('/', async (req, res) => {
    try {
      const currencyData = req.body;
      if (!currencyData.code || !currencyData.name) {
        return res.status(400).json({ success: false, error: 'Currency code and name are required' });
      }

      const currencyId = await createCurrency(currencyData);
      const currency = await getCurrencyById(currencyId);
      res.json({ success: true, currency });
    } catch (error) {
      console.error('Error creating currency:', error);
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ success: false, error: 'Currency code already exists' });
      }
      res.status(500).json({ success: false, error: 'Failed to create currency' });
    }
  });

  // PUT /api/currencies/:id - Update currency
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const currencyData = req.body;

      const existing = await getCurrencyById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Currency not found' });
      }

      await updateCurrency(id, currencyData);
      const updated = await getCurrencyById(id);
      res.json({ success: true, currency: updated });
    } catch (error) {
      console.error('Error updating currency:', error);
      if (error.message.includes('Cannot delete the base currency')) {
        return res.status(400).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: 'Failed to update currency' });
    }
  });

  // DELETE /api/currencies/:id - Delete currency
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getCurrencyById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Currency not found' });
      }

      await deleteCurrency(id);
      res.json({ success: true, message: 'Currency deleted successfully' });
    } catch (error) {
      console.error('Error deleting currency:', error);
      if (error.message.includes('Cannot delete the base currency')) {
        return res.status(400).json({ success: false, error: error.message });
      }
      res.status(500).json({ success: false, error: 'Failed to delete currency' });
    }
  });

  return router;
}