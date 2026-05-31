import express from 'express';

const router = express.Router();

export function createProductProfileRoutes(deps) {
  const { getAllProductProfiles, getProductProfileById, createProductProfile, updateProductProfile, deleteProductProfile, getProductProfilesByType } = deps;

  router.get('/', async (req, res) => {
    try {
      const { productType } = req.query;
      const profiles = productType
        ? await getProductProfilesByType(productType)
        : await getAllProductProfiles();
      res.json({ success: true, profiles });
    } catch (error) {
      console.error('Error fetching product profiles:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch product profiles' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const profile = await getProductProfileById(Number(req.params.id));
      if (!profile) {
        return res.status(404).json({ success: false, error: 'Product profile not found' });
      }
      res.json({ success: true, profile });
    } catch (error) {
      console.error('Error fetching product profile:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch product profile' });
    }
  });

  router.post('/', async (req, res) => {
    try {
      const { name, productType, specs, notes } = req.body;
      if (!name || !productType) {
        return res.status(400).json({ success: false, error: 'Name and productType are required' });
      }
      const profileId = await createProductProfile({ name, productType, specs, notes });
      const profile = await getProductProfileById(profileId);
      res.json({ success: true, profile });
    } catch (error) {
      console.error('Error creating product profile:', error);
      res.status(500).json({ success: false, error: 'Failed to create product profile' });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getProductProfileById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Product profile not found' });
      }
      const { name, productType, specs, notes } = req.body;
      await updateProductProfile(id, {
        name: name || existing.name,
        productType: productType || existing.productType,
        specs: specs || existing.specs,
        notes: notes !== undefined ? notes : existing.notes
      });
      const updated = await getProductProfileById(id);
      res.json({ success: true, profile: updated });
    } catch (error) {
      console.error('Error updating product profile:', error);
      res.status(500).json({ success: false, error: 'Failed to update product profile' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getProductProfileById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Product profile not found' });
      }
      await deleteProductProfile(id);
      res.json({ success: true, message: 'Product profile deleted successfully' });
    } catch (error) {
      console.error('Error deleting product profile:', error);
      res.status(500).json({ success: false, error: 'Failed to delete product profile' });
    }
  });

  return router;
}
