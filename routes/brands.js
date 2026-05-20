import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const uploadsDir = path.join(projectRoot, 'uploads', 'brands');

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await fs.mkdir(uploadsDir, { recursive: true });
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

const router = express.Router();

export function createBrandRoutes(deps) {
  const { getAllBrands, getBrandById, createBrand, updateBrand, deleteBrand } = deps;

  router.get('/', async (req, res) => {
    try {
      const brands = await getAllBrands();
      res.json({ success: true, brands });
    } catch (error) {
      console.error('Error fetching brands:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch brands' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const brand = await getBrandById(Number(req.params.id));
      if (!brand) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }
      res.json({ success: true, brand });
    } catch (error) {
      console.error('Error fetching brand:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch brand' });
    }
  });

  router.post('/', upload.single('logo'), async (req, res) => {
    try {
      const brandData = req.body;
      if (!brandData.name) {
        return res.status(400).json({ success: false, error: 'Brand name is required' });
      }

      if (req.file) {
        brandData.logoPath = '/uploads/brands/' + req.file.filename;
      }

      const brandId = await createBrand(brandData);
      const brand = await getBrandById(brandId);
      res.json({ success: true, brand });
    } catch (error) {
      console.error('Error creating brand:', error);
      res.status(500).json({ success: false, error: 'Failed to create brand' });
    }
  });

  router.put('/:id', upload.single('logo'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const brandData = req.body;

      const existing = await getBrandById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      // Keep existing logo if no new file uploaded
      if (req.file) {
        brandData.logoPath = '/uploads/brands/' + req.file.filename;
      } else {
        brandData.logoPath = existing.logoPath;
      }

      await updateBrand(id, brandData);
      const updated = await getBrandById(id);
      res.json({ success: true, brand: updated });
    } catch (error) {
      console.error('Error updating brand:', error);
      res.status(500).json({ success: false, error: 'Failed to update brand' });
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getBrandById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Brand not found' });
      }

      await deleteBrand(id);
      res.json({ success: true, message: 'Brand deleted successfully' });
    } catch (error) {
      console.error('Error deleting brand:', error);
      res.status(500).json({ success: false, error: 'Failed to delete brand' });
    }
  });

  return router;
}
