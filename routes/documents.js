// Stateless trade-document PDF route (Proforma Invoice / Purchase Order /
// Packing List / Commercial Invoice). No database — data arrives in the body.
import express from 'express';
import { buildDocumentPdf } from '../utils/documentPdf.js';
import { getDocumentType } from '../shared/documentTemplates.js';

const router = express.Router();

router.post('/pdf', async (req, res) => {
  try {
    const { type, data } = req.body || {};
    if (!getDocumentType(type)) {
      return res.status(400).json({ success: false, error: 'Unknown document type' });
    }
    const buf = await buildDocumentPdf(type, data || {});
    const docNumber = (data && data.meta && data.meta.docNumber) || type;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${docNumber}.pdf"`);
    return res.send(buf);
  } catch (error) {
    console.error('Error generating document PDF:', error);
    return res.status(500).json({ success: false, error: 'Failed to generate PDF: ' + error.message });
  }
});

export function createDocumentRoutes() {
  return router;
}
