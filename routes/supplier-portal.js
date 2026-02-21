import express from 'express';
import { getTasksDb } from '../db/tasksDb.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Generate a unique token for supplier access
export async function generateSupplierToken(quotationId, supplierId, supplierMemberId) {
  const db = await getTasksDb();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
  const createdAt = new Date().toISOString();

  await db.run(
    `INSERT INTO supplier_quotation_tokens (token, quotationId, supplierId, supplierMemberId, expiresAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [token, quotationId, supplierId, supplierMemberId, expiresAt, createdAt]
  );

  return token;
}

// POST /supplier-portal/generate-tokens - Generate tokens for a quotation's suppliers
// (must be before /:token to avoid matching "generate-tokens" as a token)
router.post('/generate-tokens', async (req, res) => {
  try {
    const { quotationId, suppliers } = req.body;
    const tokens = [];
    for (const supplier of suppliers) {
      for (const member of supplier.members) {
        const token = await generateSupplierToken(quotationId, supplier.supplierId, member.memberId);
        tokens.push({
          supplierId: supplier.supplierId,
          memberId: member.memberId,
          email: member.email,
          token
        });
      }
    }
    res.json({ success: true, tokens });
  } catch (error) {
    console.error('Error generating tokens:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /supplier-portal/generate-and-notify - Generate tokens for all linked suppliers
// (must be before /:token to avoid matching "generate-and-notify" as a token)
router.post('/generate-and-notify', async (req, res) => {
  try {
    const { quotationId } = req.body;
    const db = await getTasksDb();

    // Get linked suppliers with members
    const suppliers = await db.all(`
      SELECT s.*, qs.createdAt as linkedAt
      FROM suppliers s
      INNER JOIN quotation_suppliers qs ON s.id = qs.supplierId
      WHERE qs.quotationId = ?
    `, [quotationId]);

    if (suppliers.length === 0) {
      return res.status(400).json({ success: false, error: 'No suppliers linked to this quotation' });
    }

    const tokens = [];
    for (const supplier of suppliers) {
      const members = await db.all(
        'SELECT * FROM supplier_members WHERE supplierId = ? ORDER BY name',
        [supplier.id]
      );

      for (const member of members) {
        if (member.emailPrefix && supplier.emailDomain) {
          const token = await generateSupplierToken(quotationId, supplier.id, member.id);
          tokens.push({
            supplierId: supplier.id,
            supplierName: supplier.companyName,
            memberId: member.id,
            memberName: member.name,
            email: `${member.emailPrefix}@${supplier.emailDomain}`,
            token
          });
        }
      }
    }

    if (tokens.length === 0) {
      return res.status(400).json({ success: false, error: 'No supplier members with email found' });
    }

    res.json({ success: true, tokens });
  } catch (error) {
    console.error('Error generating tokens:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /supplier-portal/responses/:quotationId - Get all responses for a quotation
// (must be before /:token to avoid matching "responses" as a token)
router.get('/responses/:quotationId', async (req, res) => {
  try {
    const db = await getTasksDb();
    const responses = await db.all(
      `SELECT r.*, s.companyName, sm.name as memberName, sm.emailPrefix, s.emailDomain
       FROM supplier_quotation_responses r
       JOIN suppliers s ON r.supplierId = s.id
       JOIN supplier_members sm ON r.supplierMemberId = sm.id
       WHERE r.quotationId = ?
       ORDER BY r.submittedAt DESC`,
      [req.params.quotationId]
    );
    res.json({ success: true, responses });
  } catch (error) {
    console.error('Error fetching responses:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /supplier-portal/:token - Validate token and return quotation details
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const db = await getTasksDb();

    // Validate token
    const tokenData = await db.get(
      `SELECT * FROM supplier_quotation_tokens WHERE token = ?`,
      [token]
    );

    if (!tokenData) {
      return res.status(404).json({ success: false, error: 'Invalid token' });
    }

    // Check if expired
    if (new Date(tokenData.expiresAt) < new Date()) {
      return res.status(403).json({ success: false, error: 'Token expired' });
    }

    // Get quotation details
    const quotation = await db.get(
      `SELECT * FROM quotations WHERE id = ?`,
      [tokenData.quotationId]
    );

    if (!quotation) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    // Get supplier info
    const supplier = await db.get(
      `SELECT * FROM suppliers WHERE id = ?`,
      [tokenData.supplierId]
    );

    const supplierMember = await db.get(
      `SELECT * FROM supplier_members WHERE id = ?`,
      [tokenData.supplierMemberId]
    );

    // Check if already submitted
    const existingResponse = await db.get(
      `SELECT * FROM supplier_quotation_responses WHERE tokenId = ?`,
      [tokenData.id]
    );

    res.json({
      success: true,
      quotation: {
        id: quotation.id,
        customerName: quotation.customerName,
        productType: quotation.productType,
        productDetails: quotation.productDetails,
        quantity: quotation.quantity,
        notes: quotation.notes
      },
      supplier: {
        companyName: supplier.companyName,
        memberName: supplierMember.name
      },
      alreadySubmitted: !!existingResponse,
      existingResponse: existingResponse || null
    });
  } catch (error) {
    console.error('Error validating token:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /supplier-portal/:token/submit - Submit quotation response
router.post('/:token/submit', async (req, res) => {
  try {
    const { token } = req.params;
    const { unitPrice, totalPrice, deliveryDays, notes } = req.body;
    const db = await getTasksDb();

    // Validate token
    const tokenData = await db.get(
      `SELECT * FROM supplier_quotation_tokens WHERE token = ?`,
      [token]
    );

    if (!tokenData) {
      return res.status(404).json({ success: false, error: 'Invalid token' });
    }

    // Check if expired
    if (new Date(tokenData.expiresAt) < new Date()) {
      return res.status(403).json({ success: false, error: 'Token expired' });
    }

    // Check if already submitted
    const existingResponse = await db.get(
      `SELECT * FROM supplier_quotation_responses WHERE tokenId = ?`,
      [tokenData.id]
    );

    if (existingResponse) {
      return res.status(400).json({ success: false, error: 'Already submitted' });
    }

    // Insert response
    const submittedAt = new Date().toISOString();
    const result = await db.run(
      `INSERT INTO supplier_quotation_responses
       (tokenId, quotationId, supplierId, supplierMemberId, unitPrice, totalPrice, deliveryDays, notes, submittedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tokenData.id,
        tokenData.quotationId,
        tokenData.supplierId,
        tokenData.supplierMemberId,
        unitPrice,
        totalPrice,
        deliveryDays,
        notes,
        submittedAt
      ]
    );

    // Mark token as used
    await db.run(
      `UPDATE supplier_quotation_tokens SET usedAt = ? WHERE id = ?`,
      [submittedAt, tokenData.id]
    );

    res.json({
      success: true,
      message: 'Quotation submitted successfully',
      responseId: result.lastID
    });
  } catch (error) {
    console.error('Error submitting quotation:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

export default router;
