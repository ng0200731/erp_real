import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Buyer-facing management of supplier-submitted supporting files. Files are stored on
// disk under uploads/supplier-files/ and traced in supplier_quotation_files. Grouped by
// (quotationId, supplierId); decoupled from supplier_quotation_responses.
export function createSupplierFileRoutes(deps) {
  const router = express.Router();
  const {
    upload,
    getNormalizedRelativePath,
    getSupplierQuotationFiles,
    insertSupplierQuotationFile,
    getSupplierQuotationFileById,
    renameSupplierQuotationFile,
    deleteSupplierQuotationFile,
  } = deps;

  // GET all supplier files for a quotation (flat array; client groups by supplierId)
  router.get('/quotations/:id/supplier-files', async (req, res) => {
    try {
      const files = await getSupplierQuotationFiles(Number(req.params.id));
      res.json({ success: true, files });
    } catch (error) {
      console.error('Error listing supplier files:', error);
      res.status(500).json({ success: false, error: 'Failed to list supplier files' });
    }
  });

  // POST buyer adds a file on behalf of a supplier
  router.post('/quotations/:id/supplier-files', upload.single('supplierFile'), async (req, res) => {
    try {
      const quotationId = Number(req.params.id);
      const supplierId = Number(req.body && req.body.supplierId);
      if (!Number.isFinite(supplierId) || supplierId <= 0) {
        return res.status(400).json({ success: false, error: 'supplierId is required' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No file uploaded' });
      }
      const filePath = getNormalizedRelativePath(path.join(__dirname, '..'), req.file.path);
      const row = await insertSupplierQuotationFile({
        quotationId,
        supplierId,
        supplierMemberId: null,
        tokenId: null,
        originalName: req.file.originalname,
        storedFilename: req.file.filename,
        filePath,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedBy: 'buyer',
      });
      res.json({ success: true, file: row });
    } catch (error) {
      console.error('Error uploading supplier file:', error);
      res.status(500).json({ success: false, error: 'Failed to upload supplier file' });
    }
  });

  // PATCH rename (display name only; disk file untouched)
  router.patch('/supplier-files/:fileId', async (req, res) => {
    try {
      const { newName } = req.body || {};
      if (!newName) return res.status(400).json({ success: false, error: 'newName is required' });
      const row = await renameSupplierQuotationFile(Number(req.params.fileId), newName);
      if (!row) return res.status(404).json({ success: false, error: 'File not found' });
      res.json({ success: true, file: row });
    } catch (error) {
      console.error('Error renaming supplier file:', error);
      res.status(500).json({ success: false, error: 'Failed to rename supplier file' });
    }
  });

  // DELETE remove row + unlink disk file
  router.delete('/supplier-files/:fileId', async (req, res) => {
    try {
      const row = await deleteSupplierQuotationFile(Number(req.params.fileId));
      if (!row) return res.status(404).json({ success: false, error: 'File not found' });
      try {
        await fs.unlink(path.join(__dirname, '..', row.filePath));
      } catch (e) {
        console.warn('Failed to unlink supplier file from disk:', e.message);
      }
      res.json({ success: true, file: row });
    } catch (error) {
      console.error('Error deleting supplier file:', error);
      res.status(500).json({ success: false, error: 'Failed to delete supplier file' });
    }
  });

  return router;
}
