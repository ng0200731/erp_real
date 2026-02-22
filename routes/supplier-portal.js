import express from 'express';
import { getTasksDb, getProfiles } from '../db/tasksDb.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const router = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper: send notification email to both parties after supplier submits quotation
async function sendSubmissionNotification(quotation, supplier, supplierMember, submittedData) {
  try {
    const profiles = await getProfiles();
    const activeProfile = profiles.find(p => p.isActive === 1);
    if (!activeProfile) {
      console.warn('No active email profile, skipping submission notification');
      return;
    }

    const transport = nodemailer.createTransport({
      host: activeProfile.smtpHost,
      port: Number(activeProfile.smtpPort),
      secure: activeProfile.smtpSecure === 'true',
      auth: { user: activeProfile.mailUser, pass: activeProfile.mailPass },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 30000,
      greetingTimeout: 20000,
      socketTimeout: 30000,
    });

    const supplierEmail = (supplierMember.emailPrefix && supplier.emailDomain)
      ? `${supplierMember.emailPrefix}@${supplier.emailDomain}` : null;
    const senderEmail = activeProfile.mailUser;
    const subject = `Quotation Submitted - ${supplier.companyName} / ${quotation.outsourcingSeq || 'N/A'}`;

    const html = `
      <div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto; color:#000;">
        <h2 style="border-bottom:2px solid #000; padding-bottom:10px;">Quotation Submission Confirmation</h2>
        <p>A supplier quotation has been submitted with the following details:</p>
        <table style="width:100%; border-collapse:collapse; margin:20px 0;">
          <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Supplier</td><td style="padding:8px; border:1px solid #ccc;">${supplier.companyName}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Contact</td><td style="padding:8px; border:1px solid #ccc;">${supplierMember.name}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Customer</td><td style="padding:8px; border:1px solid #ccc;">${quotation.customerName || 'N/A'}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Product Type</td><td style="padding:8px; border:1px solid #ccc;">${quotation.productType || 'N/A'}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Unit Price (HKD)</td><td style="padding:8px; border:1px solid #ccc;">${submittedData.unitPrice != null ? Number(submittedData.unitPrice).toFixed(2) : 'N/A'}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Total Price (HKD)</td><td style="padding:8px; border:1px solid #ccc;">${submittedData.totalPrice != null ? Number(submittedData.totalPrice).toFixed(2) : 'N/A'}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Delivery Days</td><td style="padding:8px; border:1px solid #ccc;">${submittedData.deliveryDays || 'N/A'}</td></tr>
          <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Notes</td><td style="padding:8px; border:1px solid #ccc;">${submittedData.notes || '-'}</td></tr>
        </table>
        <p style="font-size:12px; color:#666;">This is an automated notification.</p>
      </div>
    `;

    const recipients = [senderEmail];
    if (supplierEmail && supplierEmail !== senderEmail) {
      recipients.push(supplierEmail);
    }

    for (const to of recipients) {
      try {
        await transport.sendMail({ from: senderEmail, to, subject, html });
        console.log(`Submission notification sent to ${to}`);
      } catch (e) {
        console.error(`Failed to send notification to ${to}:`, e.message);
      }
    }

    transport.close();
  } catch (err) {
    console.error('Error sending submission notification:', err);
  }
}

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

// POST /supplier-portal/generate-sampling-token - Generate a sampling token for the selected supplier
// (must be before /:token to avoid matching as a token)
router.post('/generate-sampling-token', async (req, res) => {
  try {
    const { quotationId } = req.body;
    const db = await getTasksDb();

    const quotation = await db.get(`SELECT * FROM quotations WHERE id = ?`, [quotationId]);
    if (!quotation) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }
    if (!quotation.selectedSupplierId) {
      return res.status(400).json({ success: false, error: 'No supplier selected for this quotation' });
    }

    const response = quotation.selectedSupplierResponseId
      ? await db.get(`SELECT * FROM supplier_quotation_responses WHERE id = ?`, [quotation.selectedSupplierResponseId])
      : null;

    const supplierId = quotation.selectedSupplierId;
    let memberId = response ? response.supplierMemberId : null;
    if (!memberId) {
      const firstMember = await db.get(`SELECT id FROM supplier_members WHERE supplierId = ? ORDER BY id LIMIT 1`, [supplierId]);
      memberId = firstMember ? firstMember.id : null;
    }
    if (!memberId) {
      return res.status(400).json({ success: false, error: 'No supplier member found' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const createdAt = new Date().toISOString();

    await db.run(
      `INSERT INTO supplier_sampling_tokens (token, quotationId, supplierId, supplierMemberId, expiresAt, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [token, quotationId, supplierId, memberId, expiresAt, createdAt]
    );

    const supplier = await db.get(`SELECT * FROM suppliers WHERE id = ?`, [supplierId]);
    const member = await db.get(`SELECT * FROM supplier_members WHERE id = ?`, [memberId]);
    const supplierEmail = (member.emailPrefix && supplier.emailDomain)
      ? `${member.emailPrefix}@${supplier.emailDomain}` : null;

    res.json({ success: true, token, supplierName: supplier.companyName, supplierEmail });
  } catch (error) {
    console.error('Error generating sampling token:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// GET /supplier-portal/sampling/:token - Validate sampling token
// (must be before /:token to avoid matching "sampling" as a token)
router.get('/sampling/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const db = await getTasksDb();

    const tokenData = await db.get(`SELECT * FROM supplier_sampling_tokens WHERE token = ?`, [token]);
    if (!tokenData) {
      return res.status(404).json({ success: false, error: 'Invalid token' });
    }
    if (new Date(tokenData.expiresAt) < new Date()) {
      return res.status(403).json({ success: false, error: 'Token expired' });
    }

    const quotation = await db.get(`SELECT * FROM quotations WHERE id = ?`, [tokenData.quotationId]);
    const supplier = await db.get(`SELECT * FROM suppliers WHERE id = ?`, [tokenData.supplierId]);
    const member = await db.get(`SELECT * FROM supplier_members WHERE id = ?`, [tokenData.supplierMemberId]);

    res.json({
      success: true,
      quotation: {
        id: quotation.id, customerName: quotation.customerName, productType: quotation.productType,
        quantity: quotation.quantity, outsourcingSeq: quotation.outsourcingSeq, sampleReadyDate: quotation.sampleReadyDate
      },
      supplier: { companyName: supplier.companyName, memberName: member.name },
      alreadySubmitted: !!tokenData.usedAt
    });
  } catch (error) {
    console.error('Error validating sampling token:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// POST /supplier-portal/sampling/:token/submit - Submit sample ready date
// (must be before /:token to avoid matching "sampling" as a token)
router.post('/sampling/:token/submit', async (req, res) => {
  try {
    const { token } = req.params;
    const { sampleReadyDate } = req.body;
    const db = await getTasksDb();

    const tokenData = await db.get(`SELECT * FROM supplier_sampling_tokens WHERE token = ?`, [token]);
    if (!tokenData) return res.status(404).json({ success: false, error: 'Invalid token' });
    if (new Date(tokenData.expiresAt) < new Date()) return res.status(403).json({ success: false, error: 'Token expired' });
    if (tokenData.usedAt) return res.status(400).json({ success: false, error: 'Already submitted' });

    await db.run(`UPDATE quotations SET sampleReadyDate = ? WHERE id = ?`, [sampleReadyDate, tokenData.quotationId]);
    const usedAt = new Date().toISOString();
    await db.run(`UPDATE supplier_sampling_tokens SET usedAt = ? WHERE id = ?`, [usedAt, tokenData.id]);

    // Send notification email to both parties (non-blocking)
    const quotation = await db.get(`SELECT * FROM quotations WHERE id = ?`, [tokenData.quotationId]);
    const supplier = await db.get(`SELECT * FROM suppliers WHERE id = ?`, [tokenData.supplierId]);
    const member = await db.get(`SELECT * FROM supplier_members WHERE id = ?`, [tokenData.supplierMemberId]);

    if (quotation && supplier && member) {
      (async () => {
        try {
          const profiles = await getProfiles();
          const activeProfile = profiles.find(p => p.isActive === 1);
          if (!activeProfile) return;

          const transport = nodemailer.createTransport({
            host: activeProfile.smtpHost, port: Number(activeProfile.smtpPort),
            secure: activeProfile.smtpSecure === 'true',
            auth: { user: activeProfile.mailUser, pass: activeProfile.mailPass },
            tls: { rejectUnauthorized: true }, connectionTimeout: 30000, greetingTimeout: 20000, socketTimeout: 30000,
          });

          const supplierEmail = (member.emailPrefix && supplier.emailDomain) ? `${member.emailPrefix}@${supplier.emailDomain}` : null;
          const senderEmail = activeProfile.mailUser;
          const subject = `Sample Ready Date Confirmed - ${supplier.companyName} / ${quotation.outsourcingSeq || 'N/A'}`;
          const html = `
            <div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto; color:#000;">
              <h2 style="border-bottom:2px solid #000; padding-bottom:10px;">Sample Ready Date Confirmed</h2>
              <p>The sample ready date has been submitted:</p>
              <table style="width:100%; border-collapse:collapse; margin:20px 0;">
                <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Supplier</td><td style="padding:8px; border:1px solid #ccc;">${supplier.companyName}</td></tr>
                <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Customer</td><td style="padding:8px; border:1px solid #ccc;">${quotation.customerName || 'N/A'}</td></tr>
                <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Product Type</td><td style="padding:8px; border:1px solid #ccc;">${quotation.productType || 'N/A'}</td></tr>
                <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">OS Ref</td><td style="padding:8px; border:1px solid #ccc;">${quotation.outsourcingSeq || 'N/A'}</td></tr>
                <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Sample Ready Date</td><td style="padding:8px; border:1px solid #ccc;">${sampleReadyDate}</td></tr>
              </table>
              <p style="font-size:12px; color:#666;">This is an automated notification.</p>
            </div>`;

          const recipients = [senderEmail];
          if (supplierEmail && supplierEmail !== senderEmail) recipients.push(supplierEmail);
          for (const to of recipients) {
            try { await transport.sendMail({ from: senderEmail, to, subject, html }); } catch (e) { console.error(`Failed to send to ${to}:`, e.message); }
          }
          transport.close();
        } catch (e) { console.error('Error sending sampling notification:', e); }
      })();
    }

    res.json({ success: true, message: 'Sample ready date submitted successfully' });
  } catch (error) {
    console.error('Error submitting sample ready date:', error);
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

    // Send notification email to both parties (non-blocking)
    const quotation = await db.get(`SELECT * FROM quotations WHERE id = ?`, [tokenData.quotationId]);
    const supplier = await db.get(`SELECT * FROM suppliers WHERE id = ?`, [tokenData.supplierId]);
    const supplierMember = await db.get(`SELECT * FROM supplier_members WHERE id = ?`, [tokenData.supplierMemberId]);
    if (quotation && supplier && supplierMember) {
      sendSubmissionNotification(quotation, supplier, supplierMember, { unitPrice, totalPrice, deliveryDays, notes })
        .catch(err => console.error('Notification error:', err));
    }

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
