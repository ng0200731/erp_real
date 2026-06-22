import express from 'express';

const router = express.Router();

export function createProductSpecOptionRoutes(deps) {
  const {
    getAllProductSpecOptions,
    getProductSpecOptionsByType,
    getProductSpecOptionById,
    createProductSpecOption,
    updateProductSpecOption,
    deleteProductSpecOption,
    reorderProductSpecOptions,
  } = deps;

  // GET /api/product-spec-options - list all options (grouped by productType, fieldKey, sortOrder)
  router.get('/', async (req, res) => {
    try {
      const options = await getAllProductSpecOptions();
      res.json({ success: true, options });
    } catch (error) {
      console.error('Error fetching product spec options:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch product spec options' });
    }
  });

  // PUT /api/product-spec-options/reorder - persist a new sort order for one (productType, fieldKey)
  // Body: { productType, fieldKey, orderedIds: [id, ...] }
  router.put('/reorder', async (req, res) => {
    try {
      const { productType, fieldKey, orderedIds } = req.body || {};
      if (!productType || !fieldKey || !Array.isArray(orderedIds)) {
        return res.status(400).json({ success: false, error: 'productType, fieldKey and orderedIds[] are required' });
      }
      await reorderProductSpecOptions(productType, fieldKey, orderedIds);
      res.json({ success: true });
    } catch (error) {
      console.error('Error reordering product spec options:', error);
      res.status(500).json({ success: false, error: 'Failed to reorder product spec options' });
    }
  });

  // GET /api/product-spec-options/:productType - list options for one product type
  router.get('/:productType', async (req, res) => {
    try {
      const options = await getProductSpecOptionsByType(req.params.productType);
      res.json({ success: true, options });
    } catch (error) {
      console.error('Error fetching product spec options by type:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch product spec options' });
    }
  });

  // POST /api/product-spec-options - create one option
  router.post('/', async (req, res) => {
    try {
      const data = req.body || {};
      if (!data.productType || !data.fieldKey || !data.value || !data.label) {
        return res.status(400).json({ success: false, error: 'productType, fieldKey, value and label are required' });
      }
      const id = await createProductSpecOption(data);
      const option = await getProductSpecOptionById(id);
      res.json({ success: true, option });
    } catch (error) {
      console.error('Error creating product spec option:', error);
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ success: false, error: 'This option value already exists for this field' });
      }
      res.status(500).json({ success: false, error: 'Failed to create product spec option' });
    }
  });

  // PUT /api/product-spec-options/:id - update value/label/isActive
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getProductSpecOptionById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Product spec option not found' });
      }
      await updateProductSpecOption(id, req.body || {});
      const option = await getProductSpecOptionById(id);
      res.json({ success: true, option });
    } catch (error) {
      console.error('Error updating product spec option:', error);
      if (error.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ success: false, error: 'This option value already exists for this field' });
      }
      res.status(500).json({ success: false, error: 'Failed to update product spec option' });
    }
  });

  // DELETE /api/product-spec-options/:id - delete one option
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getProductSpecOptionById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Product spec option not found' });
      }
      await deleteProductSpecOption(id);
      res.json({ success: true, message: 'Product spec option deleted successfully' });
    } catch (error) {
      console.error('Error deleting product spec option:', error);
      res.status(500).json({ success: false, error: 'Failed to delete product spec option' });
    }
  });

  return router;
}
