import express from 'express';

const router = express.Router();

export function createPricingTierTableRoutes(deps) {
  const {
    getAllPricingTierTables,
    getPricingTierTablesByFilter,
    getPricingTierTableById,
    createPricingTierTable,
    updatePricingTierTable,
    deletePricingTierTable
  } = deps;

  router.get('/', async (req, res) => {
    try {
      const { scope, brandId, customerId, customerName } = req.query || {};
      const hasFilter = scope || brandId != null || customerId != null || customerName;
      const tables = hasFilter
        ? await getPricingTierTablesByFilter({
            scope,
            brandId: brandId != null ? Number(brandId) : undefined,
            customerId: customerId != null ? Number(customerId) : undefined,
            customerName,
          })
        : await getAllPricingTierTables();
      res.json({ success: true, tables });
    } catch (error) {
      console.error('Error fetching pricing tier tables:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch pricing tier tables' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const table = await getPricingTierTableById(Number(req.params.id));
      if (!table) {
        return res.status(404).json({ success: false, error: 'Pricing tier table not found' });
      }
      res.json({ success: true, table });
    } catch (error) {
      console.error('Error fetching pricing tier table:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch pricing tier table' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { name, scope, tiers } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ success: false, error: 'Table name is required' });
      }
      if (!scope || !['brand', 'customer'].includes(scope)) {
        return res.status(400).json({ success: false, error: 'Valid scope is required' });
      }
      if (!Array.isArray(tiers) || tiers.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one tier row is required' });
      }
      const id = await createPricingTierTable(req.body);
      const table = await getPricingTierTableById(id);
      res.json({ success: true, table });
    } catch (error) {
      console.error('Error creating pricing tier table:', error);
      res.status(500).json({ success: false, error: 'Failed to create pricing tier table' });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getPricingTierTableById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Pricing tier table not found' });
      }
      const payload = {
        name: req.body?.name ?? existing.name,
        scope: req.body?.scope ?? existing.scope,
        brandId: req.body?.brandId ?? existing.brandId,
        brandName: req.body?.brandName ?? existing.brandName,
        customerId: req.body?.customerId ?? existing.customerId,
        customerName: req.body?.customerName ?? existing.customerName,
        disabled: req.body?.disabled ?? existing.disabled,
        tiers: req.body?.tiers ?? existing.tiers
      };
      if (!payload.name || !String(payload.name).trim()) {
        return res.status(400).json({ success: false, error: 'Table name is required' });
      }
      if (!Array.isArray(payload.tiers) || payload.tiers.length === 0) {
        return res.status(400).json({ success: false, error: 'At least one tier row is required' });
      }
      await updatePricingTierTable(id, payload);
      const table = await getPricingTierTableById(id);
      res.json({ success: true, table });
    } catch (error) {
      console.error('Error updating pricing tier table:', error);
      res.status(500).json({ success: false, error: 'Failed to update pricing tier table' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getPricingTierTableById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Pricing tier table not found' });
      }
      await deletePricingTierTable(id);
      res.json({ success: true, message: 'Pricing tier table deleted successfully' });
    } catch (error) {
      console.error('Error deleting pricing tier table:', error);
      res.status(500).json({ success: false, error: 'Failed to delete pricing tier table' });
    }
  });

  return router;
}
