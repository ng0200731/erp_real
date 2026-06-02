import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'workshops');

const router = express.Router();

// Multer config for workshop uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|pdf|doc|docx|xls|xlsx)$/i;
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

/**
 * Create workshop routes
 */
export function createWorkshopRoutes(deps) {
  const { getAllWorkshops, getWorkshopById, createWorkshop, updateWorkshop, deleteWorkshop } = deps;

  // Get all workshops
  router.get('/', async (req, res) => {
    try {
      const workshops = await getAllWorkshops();
      res.json({ success: true, workshops });
    } catch (error) {
      console.error('Error fetching workshops:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch workshops' });
    }
  });

  // Get workshop by ID
  router.get('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const workshop = await getWorkshopById(id);
      if (!workshop) {
        return res.status(404).json({ success: false, error: 'Workshop not found' });
      }
      res.json({ success: true, workshop });
    } catch (error) {
      console.error('Error fetching workshop:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch workshop' });
    }
  });

  // Create new workshop
  router.post('/', async (req, res) => {
    try {
      const data = req.body;
      if (!data.fullCompanyName) {
        return res.status(400).json({ success: false, error: 'Company name is required' });
      }
      const id = await createWorkshop(data);
      const workshop = await getWorkshopById(id);
      res.json({ success: true, workshop });
    } catch (error) {
      console.error('Error creating workshop:', error);
      res.status(500).json({ success: false, error: 'Failed to create workshop' });
    }
  });

  // Update workshop
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getWorkshopById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Workshop not found' });
      }
      await updateWorkshop(id, req.body);
      const workshop = await getWorkshopById(id);
      res.json({ success: true, workshop });
    } catch (error) {
      console.error('Error updating workshop:', error);
      res.status(500).json({ success: false, error: 'Failed to update workshop' });
    }
  });

  // Delete workshop
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getWorkshopById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Workshop not found' });
      }
      await deleteWorkshop(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting workshop:', error);
      res.status(500).json({ success: false, error: 'Failed to delete workshop' });
    }
  });

  // Upload files for workshop
  router.post('/:id/uploads', upload.array('files', 20), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getWorkshopById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Workshop not found' });
      }
      const files = req.files.map(f => `/uploads/workshops/${f.filename}`);
      res.json({ success: true, files });
    } catch (error) {
      console.error('Error uploading files:', error);
      res.status(500).json({ success: false, error: 'Failed to upload files' });
    }
  });

  return router;
}
