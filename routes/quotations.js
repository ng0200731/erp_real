import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Create quotation routes
 * @param {Object} deps - Dependencies
 * @param {Function} deps.getAllQuotations - Get all quotations function
 * @param {Function} deps.getQuotationById - Get quotation by ID function
 * @param {Function} deps.createQuotation - Create quotation function
 * @param {Function} deps.updateQuotation - Update quotation function
 * @param {Function} deps.deleteQuotation - Delete quotation function
 * @param {Object} deps.upload - Multer upload middleware
 * @param {Function} deps.getNormalizedRelativePath - Path normalization function
 * @param {Function} deps.getSupplierById - Get supplier by ID function
 * @param {Function} deps.linkSupplierToQuotation - Link supplier to quotation function
 * @param {Function} deps.unlinkSupplierFromQuotation - Unlink supplier from quotation function
 * @param {Function} deps.getSuppliersForQuotation - Get suppliers for quotation function
 * @param {Function} deps.updateQuotationProfileImage - Update profile image BLOB function
 * @param {Function} deps.getQuotationProfileImage - Get profile image BLOB function
 */
export function createQuotationRoutes(deps) {
  const { getAllQuotations, getQuotationById, createQuotation, updateQuotation, deleteQuotation, upload, getNormalizedRelativePath, getSupplierById, linkSupplierToQuotation, unlinkSupplierFromQuotation, getSuppliersForQuotation, updateQuotationProfileImage, getQuotationProfileImage, logStatusChange, getStatusHistory, getBulkStatusHistory } = deps;

  // Get all quotations
  router.get('/', async (req, res) => {
    try {
      const allQuotations = await getAllQuotations();
      const quotations = allQuotations.filter(q => q.productType !== 'other' && q.productType !== 'outsource');
      res.json({ success: true, quotations });
    } catch (error) {
      console.error('Error fetching quotations:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch quotations' });
    }
  });

  // Get outsourcing quotations (only 'other' or 'outsource' type)
  router.get('/outsourcing', async (req, res) => {
    try {
      const allQuotations = await getAllQuotations();
      const outsourcingQuotations = allQuotations.filter(q => q.productType === 'other' || q.productType === 'outsource');
      res.json({ success: true, quotations: outsourcingQuotations });
    } catch (error) {
      console.error('Error fetching outsourcing quotations:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch outsourcing quotations' });
    }
  });

  // QR-based detail lookup (for QR code scanning by Android app)
  router.get('/qr/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      // Fetch status history
      let history = [];
      try { history = await getStatusHistory(id); } catch (e) { /* ignore */ }
      // Fetch linked suppliers (for outsourcing quotations)
      let suppliers = [];
      if (quotation.productType === 'other' || quotation.productType === 'outsource') {
        try { suppliers = await getSuppliersForQuotation(id) || []; } catch (e) { /* ignore */ }
      }
      // Add profile image URL for Android app
      quotation.profileImageUrl = `/api/quotations/${id}/profile-image`;
      res.json({ success: true, quotation, history, suppliers });
    } catch (error) {
      console.error('Error fetching QR quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch quotation' });
    }
  });

  // Get quotation by ID
  router.get('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      res.json({ success: true, quotation });
    } catch (error) {
      console.error('Error fetching quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch quotation' });
    }
  });

  // Create new quotation
  router.post('/', async (req, res) => {
    try {
      const quotationData = req.body;

      // Validate required fields
      if (!quotationData.customerName || !quotationData.productType || !quotationData.quantity) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const quotationId = await createQuotation(quotationData);
      const quotation = await getQuotationById(quotationId);
      res.json({ success: true, quotation });
    } catch (error) {
      console.error('Error creating quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to create quotation' });
    }
  });

  // Bulk status history for multiple quotations (must be before /:id routes)
  router.post('/bulk-status-history', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.json({ success: true, historyMap: {} });
      }
      const historyMap = await getBulkStatusHistory(ids);
      res.json({ success: true, historyMap });
    } catch (error) {
      console.error('Error fetching bulk status history:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch bulk status history' });
    }
  });

  // Update quotation
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const quotationData = req.body;

      const existing = await getQuotationById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      // Log status change if status is different
      const oldStatus = existing.status;
      const newStatus = quotationData.status;
      if (newStatus && oldStatus !== newStatus) {
        await logStatusChange(id, oldStatus, newStatus);
      }

      await updateQuotation(id, quotationData);
      const updated = await getQuotationById(id);
      res.json({ success: true, quotation: updated });
    } catch (error) {
      console.error('Error updating quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to update quotation' });
    }
  });

  // Delete quotation
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getQuotationById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      await deleteQuotation(id);
      res.json({ success: true, message: 'Quotation deleted successfully' });
    } catch (error) {
      console.error('Error deleting quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to delete quotation' });
    }
  });

  // Serve profile image from database BLOB or file path fallback
  router.get('/:id/profile-image', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const imageData = await getQuotationProfileImage(id);

      // Try serving from database BLOB first
      if (imageData && imageData.profileImageBlob) {
        res.setHeader('Content-Type', imageData.profileImageMime || 'image/jpeg');
        res.setHeader('Cache-Control', 'no-cache');
        return res.send(Buffer.from(imageData.profileImageBlob));
      }

      // Fallback: serve from file path if no BLOB
      const quotation = await getQuotationById(id);
      if (quotation && quotation.profileImagePath) {
        const filePath = path.isAbsolute(quotation.profileImagePath)
          ? quotation.profileImagePath
          : path.join(__dirname, '..', quotation.profileImagePath);
        try {
          await fs.access(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
          res.setHeader('Content-Type', mimeMap[ext] || 'image/jpeg');
          res.setHeader('Cache-Control', 'no-cache');
          const fileBuffer = await fs.readFile(filePath);
          return res.send(fileBuffer);
        } catch {
          // File not found on disk, fall through to 404
        }
      }

      return res.status(404).json({ success: false, error: 'Profile image not found' });
    } catch (error) {
      console.error('Error serving profile image:', error);
      res.status(500).json({ success: false, error: 'Failed to serve profile image' });
    }
  });

  // Upload profile image for quotation - stores in database as BLOB
  router.post('/:id/upload-profile-image', upload.single('profileImage'), async (req, res) => {
    try {
      console.log('=== Profile Image Upload Request ===');
      console.log('Quotation ID:', req.params.id);
      console.log('File received:', req.file ? 'YES' : 'NO');
      if (req.file) {
        console.log('File details:', {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          path: req.file.path
        });
      }

      const id = Number(req.params.id);

      if (!req.file) {
        console.error('No file uploaded in request');
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      console.log('Fetching quotation with ID:', id);
      const quotation = await getQuotationById(id);
      if (!quotation) {
        console.error('Quotation not found:', id);
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      console.log('Quotation found:', quotation.id, quotation.customerName);

      // Read file as buffer and store in database
      const imageBuffer = await fs.readFile(req.file.path);
      const mimeType = req.file.mimetype;

      // Store in database
      await updateQuotationProfileImage(id, imageBuffer, mimeType);
      console.log('Profile image stored in database');

      // Delete the temporary file since it's now in DB
      try {
        await fs.unlink(req.file.path);
        console.log('Temporary file deleted');
      } catch (error) {
        console.warn('Failed to delete temporary file:', error.message);
      }

      // Also delete old file if there was a profileImagePath
      if (quotation.profileImagePath) {
        console.log('Deleting old profile image file:', quotation.profileImagePath);
        try {
          await fs.unlink(path.join(__dirname, '..', quotation.profileImagePath));
          console.log('Old profile image file deleted successfully');
        } catch (error) {
          console.warn('Failed to delete old profile image file:', error.message);
        }
      }

      console.log('=== Profile Image Upload Success ===');
      res.json({
        success: true,
        profileImageUrl: `/api/quotations/${id}/profile-image`,
        message: 'Profile image uploaded successfully'
      });
    } catch (error) {
      console.error('=== Profile Image Upload Error ===');
      console.error('Error type:', error.constructor.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      res.status(500).json({ success: false, error: 'Failed to upload profile image', details: error.message });
    }
  });

  // Set profile image from a local server file (for dummy data generation)
  // Serve a local image file as binary (used by dummy input to preview before save)
  router.post('/read-image-file', async (req, res) => {
    try {
      const { filePath } = req.body;
      if (!filePath) return res.status(400).json({ success: false, error: 'filePath is required' });

      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);
      const ext = path.extname(absolutePath).toLowerCase();
      const allowedExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      if (!allowedExts.includes(ext)) return res.status(400).json({ success: false, error: 'Invalid image file type' });

      try { await fs.access(absolutePath); } catch { return res.status(404).json({ success: false, error: 'Image file not found' }); }

      const imageBuffer = await fs.readFile(absolutePath);
      const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
      res.setHeader('Content-Type', mimeMap[ext]);
      res.send(imageBuffer);
    } catch (error) {
      console.error('Error reading image file:', error);
      res.status(500).json({ success: false, error: 'Failed to read image file' });
    }
  });

  router.post('/:id/set-profile-image-from-file', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ success: false, error: 'filePath is required' });
      }

      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      // Resolve path: if absolute (e.g. C:\...), use as-is; otherwise relative to project root
      const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);
      const ext = path.extname(absolutePath).toLowerCase();
      const allowedExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      if (!allowedExts.includes(ext)) {
        return res.status(400).json({ success: false, error: 'Invalid image file type' });
      }

      // Verify the file exists
      try {
        await fs.access(absolutePath);
      } catch {
        return res.status(404).json({ success: false, error: 'Image file not found' });
      }

      // Read file and store as BLOB
      const imageBuffer = await fs.readFile(absolutePath);
      const mimeMap = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mimeType = mimeMap[ext];

      await updateQuotationProfileImage(id, imageBuffer, mimeType);

      res.json({ success: true, message: 'Profile image set from file' });
    } catch (error) {
      console.error('Error setting profile image from file:', error);
      res.status(500).json({ success: false, error: 'Failed to set profile image' });
    }
  });

  // Upload attachments for quotation
  router.post('/:id/upload-attachments', upload.array('attachments', 10), async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      // Get relative paths for uploaded files
      const newAttachmentPaths = req.files.map(file => getNormalizedRelativePath(path.join(__dirname, '..'), file.path));

      // Combine existing attachments with new ones
      const allAttachmentPaths = [...quotation.attachmentPaths, ...newAttachmentPaths];

      // Update quotation with new attachment paths
      await updateQuotation(id, { ...quotation, attachmentPaths: allAttachmentPaths });

      res.json({
        success: true,
        attachmentPaths: newAttachmentPaths,
        allAttachmentPaths: allAttachmentPaths,
        message: `${req.files.length} attachment(s) uploaded successfully`
      });
    } catch (error) {
      console.error('Error uploading attachments:', error);
      res.status(500).json({ success: false, error: 'Failed to upload attachments' });
    }
  });

  // Delete attachment from quotation
  router.delete('/:id/attachments/:filename', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const filename = req.params.filename;

      const quotation = await getQuotationById(id);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      // Find and remove the attachment
      const attachmentIndex = quotation.attachmentPaths.findIndex(path => path.includes(filename));
      if (attachmentIndex === -1) {
        return res.status(404).json({ success: false, error: 'Attachment not found' });
      }

      const filePath = quotation.attachmentPaths[attachmentIndex];
      const fullPath = path.join(__dirname, '..', filePath);

      // Delete file from filesystem
      try {
        await fs.unlink(fullPath);
      } catch (error) {
        console.warn('Failed to delete file from filesystem:', error);
      }

      // Remove from database
      const updatedAttachments = quotation.attachmentPaths.filter((_, index) => index !== attachmentIndex);
      await updateQuotation(id, { ...quotation, attachmentPaths: updatedAttachments });

      res.json({ success: true, message: 'Attachment deleted successfully' });
    } catch (error) {
      console.error('Error deleting attachment:', error);
      res.status(500).json({ success: false, error: 'Failed to delete attachment' });
    }
  });

  // Rename an attachment: renames the disk file and updates attachmentPaths so the
  // quotation/outsourcing views show the renamed name. Works on existing attachments.
  router.patch('/:id/attachments/rename', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { oldPath, newName } = req.body;
      if (!oldPath || !newName) {
        return res.status(400).json({ success: false, error: 'oldPath and newName are required' });
      }

      const quotation = await getQuotationById(id);
      if (!quotation) return res.status(404).json({ success: false, error: 'Quotation not found' });

      const index = quotation.attachmentPaths.findIndex(p => p === oldPath);
      if (index === -1) return res.status(404).json({ success: false, error: 'Attachment not found' });

      const currentRelPath = quotation.attachmentPaths[index];
      const currentFullPath = path.join(__dirname, '..', currentRelPath);
      const dir = path.dirname(currentFullPath);
      const oldExt = path.extname(currentFullPath);

      // Sanitize the new name; keep the original extension if the new name lacks one
      const cleanName = String(newName).replace(/[\\/:*?"<>|]/g, '_').trim().slice(0, 100);
      if (!cleanName) return res.status(400).json({ success: false, error: 'Invalid name' });
      const providedExt = path.extname(cleanName);
      const baseName = providedExt ? cleanName.slice(0, cleanName.length - providedExt.length) : cleanName;
      const finalExt = providedExt || oldExt;

      // Resolve a unique filename within the directory
      let candidate = baseName + finalExt;
      let n = 1;
      while (true) {
        const candidateFull = path.join(dir, candidate);
        if (candidateFull === currentFullPath) break;
        let exists = true;
        try { await fs.access(candidateFull); } catch { exists = false; }
        if (!exists) break;
        candidate = `${baseName}-${n}${finalExt}`;
        n++;
      }
      const newFullPath = path.join(dir, candidate);

      try {
        await fs.rename(currentFullPath, newFullPath);
      } catch (e) {
        console.warn('Rename disk file failed (continuing to update DB):', e);
      }

      const newRelPath = getNormalizedRelativePath(path.join(__dirname, '..'), newFullPath);
      const updatedPaths = [...quotation.attachmentPaths];
      updatedPaths[index] = newRelPath;
      await updateQuotation(id, { ...quotation, attachmentPaths: updatedPaths });

      res.json({ success: true, newPath: newRelPath, displayName: candidate });
    } catch (error) {
      console.error('Error renaming attachment:', error);
      res.status(500).json({ success: false, error: 'Failed to rename attachment' });
    }
  });

  // Temporary profile image upload (for new quotations)
  router.post('/temp/upload-profile-image', upload.single('profileImage'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }

      const relativePath = getNormalizedRelativePath(path.join(__dirname, '..'), req.file.path);
      res.json({
        success: true,
        profileImagePath: relativePath,
        message: 'Profile image uploaded temporarily'
      });
    } catch (error) {
      console.error('Error uploading temporary profile image:', error);
      res.status(500).json({ success: false, error: 'Failed to upload profile image' });
    }
  });

  // Temporary attachments upload (for new quotations)
  router.post('/temp/upload-attachments', upload.array('attachments', 10), async (req, res) => {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, error: 'No files uploaded' });
      }

      const attachmentPaths = req.files.map(file => getNormalizedRelativePath(path.join(__dirname, '..'), file.path));
      res.json({
        success: true,
        attachmentPaths: attachmentPaths,
        message: `${req.files.length} attachment(s) uploaded temporarily`
      });
    } catch (error) {
      console.error('Error uploading temporary attachments:', error);
      res.status(500).json({ success: false, error: 'Failed to upload attachments' });
    }
  });

  // Link supplier to quotation
  router.post('/:id/suppliers/:supplierId', async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      const supplierId = Number(req.params.supplierId);

      const quotation = await getQuotationById(quotationId);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }

      const supplier = await getSupplierById(supplierId);
      if (!supplier) {
        return res.status(404).json({ success: false, error: 'Supplier not found' });
      }

      await linkSupplierToQuotation(quotationId, supplierId);
      res.json({ success: true, message: 'Supplier linked to quotation' });
    } catch (error) {
      console.error('Error linking supplier to quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to link supplier' });
    }
  });

  // Unlink supplier from quotation
  router.delete('/:id/suppliers/:supplierId', async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      const supplierId = Number(req.params.supplierId);

      await unlinkSupplierFromQuotation(quotationId, supplierId);
      res.json({ success: true, message: 'Supplier unlinked from quotation' });
    } catch (error) {
      console.error('Error unlinking supplier from quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to unlink supplier' });
    }
  });

  // Get suppliers for quotation
  router.get('/:id/suppliers', async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      const suppliers = await getSuppliersForQuotation(quotationId);
      res.json({ success: true, suppliers });
    } catch (error) {
      console.error('Error fetching suppliers for quotation:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch suppliers' });
    }
  });

  // Get status history for a single quotation
  router.get('/:id/status-history', async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      const history = await getStatusHistory(quotationId);
      res.json({ success: true, history });
    } catch (error) {
      console.error('Error fetching status history:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch status history' });
    }
  });

  // Log a history event for a quotation (for non-status-change events like reminders, views)
  router.post('/:id/log-history', async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      const { fromStatus, toStatus, note } = req.body;
      if (!toStatus) {
        return res.status(400).json({ success: false, error: 'toStatus is required' });
      }
      await logStatusChange(quotationId, fromStatus || null, toStatus, note || null);
      res.json({ success: true });
    } catch (error) {
      console.error('Error logging history:', error);
      res.status(500).json({ success: false, error: 'Failed to log history' });
    }
  });

  return router;
}
