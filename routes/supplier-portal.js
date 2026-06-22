import express from 'express';
import { getTasksDb, getProfiles, getQuotationProfileImage, logStatusChange, createSupplierQuotationResponseTiers, getSupplierQuotationResponseTiers, getSupplierQuotationResponseTiersByQuotation, advanceToCompareQuotationWhenAllResponded, getSupplierQuotationFiles, insertSupplierQuotationFile } from '../db/tasksDb.js';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { getNormalizedRelativePath } from '../utils/pathUtils.js';
import { buildSupplierConfirmationHtml, generateSupplierResponseTiersHtml, generateQuotationDetailSectionsHtml } from '../shared/quotationEmailHtml.js';

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
    const senderDomain = senderEmail.split('@')[1] || 'longriver.com';
    const subject = `Quotation Submitted - ${senderDomain} / ${supplier.companyName} / ${quotation.outsourcingSeq || 'N/A'}`;

    // Fetch profile image for embedding
    let profileImageCid = null;
    let profileImageAttachment = null;
    try {
      const imageData = await getQuotationProfileImage(quotation.id);
      if (imageData && imageData.profileImageBlob) {
        profileImageCid = `profile-image-${quotation.id}@longriverlabel.com`;
        profileImageAttachment = {
          filename: 'product-image.png',
          content: imageData.profileImageBlob,
          contentType: imageData.profileImageMime || 'image/png',
          cid: profileImageCid
        };
      }
    } catch (e) {
      console.warn('Failed to fetch profile image for email:', e.message);
    }

    // Brand name (one small query) — quotation.brandId is already loaded.
    const db = await getTasksDb();
    const brand = quotation.brandId
      ? await db.get('SELECT name FROM brands WHERE id = ?', [quotation.brandId])
      : null;
    const brandName = brand ? brand.name : null;

    const html = buildSupplierConfirmationHtml(quotation, supplier, supplierMember, submittedData, {
      brandName,
      profileImageCid,
    });

    const recipients = [senderEmail];
    if (supplierEmail && supplierEmail !== senderEmail) {
      recipients.push(supplierEmail);
    }

    for (const to of recipients) {
      try {
        const mailOptions = { to, subject, html };
        if (profileImageAttachment) {
          mailOptions.attachments = [profileImageAttachment];
        }
        if (to === senderEmail && supplierEmail) {
          // Send to admin on behalf of supplier
          mailOptions.from = `${supplierMember.name} <${senderEmail}>`;
          mailOptions.replyTo = supplierEmail;
        } else {
          mailOptions.from = senderEmail;
        }
        await transport.sendMail(mailOptions);
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

// Validate a portal token (exists + not expired). Returns { tokenData } on success or
// { error: { status, message } } on failure. Reused by the supplier file routes.
async function resolvePortalToken(token) {
  const db = await getTasksDb();
  const tokenData = await db.get(`SELECT * FROM supplier_quotation_tokens WHERE token = ?`, [token]);
  if (!tokenData) return { error: { status: 404, message: 'Invalid token' } };
  if (new Date(tokenData.expiresAt) < new Date()) return { error: { status: 403, message: 'Token expired' } };
  return { tokenData };
}

export function createSupplierPortalRoutes(deps) {
  const upload = deps && deps.upload;
  const router = express.Router();

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

    // Attach normalized per-tier prices to each response for the comparison matrix.
    const allTiers = await getSupplierQuotationResponseTiersByQuotation(req.params.quotationId);
    const tiersByResponse = {};
    for (const t of allTiers) {
      (tiersByResponse[t.responseId] = tiersByResponse[t.responseId] || []).push({
        tierIndex: t.tierIndex, quantity: t.quantity, unitPrice: t.unitPrice, total: t.total
      });
    }
    for (const r of responses) {
      r.tiers = tiersByResponse[r.id] || [];
    }

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

    const quotation = await db.get(
      `SELECT *, CASE WHEN profileImageBlob IS NOT NULL THEN 1 ELSE 0 END as hasProfileImage FROM quotations WHERE id = ?`,
      [tokenData.quotationId]
    );
    const supplier = await db.get(`SELECT * FROM suppliers WHERE id = ?`, [tokenData.supplierId]);
    const member = await db.get(`SELECT * FROM supplier_members WHERE id = ?`, [tokenData.supplierMemberId]);

    // Parse productDetails
    let samplingProductDetails = quotation.productDetails;
    if (typeof samplingProductDetails === 'string') {
      try { samplingProductDetails = JSON.parse(samplingProductDetails); } catch (e) { /* keep as-is */ }
    }

    // Attach the supplier's previously-submitted pricing (last submitted price) so the
    // sampling page can show what the supplier quoted for reference.
    let responseSummary = null;
    try {
      const response = await db.get(
        `SELECT * FROM supplier_quotation_responses WHERE quotationId = ? AND supplierId = ? ORDER BY submittedAt DESC LIMIT 1`,
        [tokenData.quotationId, tokenData.supplierId]
      );
      if (response) {
        const tierRows = await getSupplierQuotationResponseTiers(response.id);
        responseSummary = {
          unitPrice: response.unitPrice,
          totalPrice: response.totalPrice,
          deliveryDays: response.deliveryDays,
          notes: response.notes,
          moq: response.moq,
          surchargeBelowMoq: response.surchargeBelowMoq,
          tiers: tierRows.map((t) => ({ quantity: t.quantity, unitPrice: t.unitPrice, total: t.total }))
        };
      }
    } catch (e) { /* ignore — sampling can proceed without prior response data */ }

    res.json({
      success: true,
      quotation: {
        id: quotation.id, customerName: quotation.customerName, customerItemName: quotation.customerItemName,
        productType: quotation.productType, productDetails: samplingProductDetails,
        hasProfileImage: quotation.hasProfileImage,
        quantity: quotation.quantity, outsourcingSeq: quotation.outsourcingSeq, sampleReadyDate: quotation.sampleReadyDate,
        currency: quotation.currency,
        height_mm: quotation.height_mm,
        width_mm: quotation.width_mm
      },
      supplier: { companyName: supplier.companyName, memberName: member.name },
      response: responseSummary,
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

    // Update status from 'sampling' to 'await sample ready date'
    const quotation = await db.get(`SELECT * FROM quotations WHERE id = ?`, [tokenData.quotationId]);
    if (quotation && quotation.status === 'sampling') {
      await db.run(`UPDATE quotations SET status = ? WHERE id = ?`, ['await sample ready date', tokenData.quotationId]);
      // Log status change in history
      logStatusChange(tokenData.quotationId, 'sampling', 'await sample ready date', `Sample ready date submitted: ${sampleReadyDate}`)
        .catch(err => console.error('History log error:', err));
    }

    // Send notification email to both parties (non-blocking)
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
          const subject = `Sample Ready Date Confirmed - ${supplier.companyName} / ${quotation.outsourcingSeq || 'N/A'} / Ready: ${sampleReadyDate}`;

          // Fetch profile image for embedding
          let profileImageCid = null;
          let profileImageAttachment = null;
          try {
            const imageData = await getQuotationProfileImage(quotation.id);
            if (imageData && imageData.profileImageBlob) {
              profileImageCid = `profile-image-${quotation.id}@longriverlabel.com`;
              profileImageAttachment = {
                filename: 'product-image.png',
                content: imageData.profileImageBlob,
                contentType: imageData.profileImageMime || 'image/png',
                cid: profileImageCid
              };
            }
          } catch (e) { /* ignore */ }

          // Resolve brand name (one small query) for the detail sections.
          let samplingBrandName = 'N/A';
          try {
            if (quotation.brandId) {
              const brand = await db.get('SELECT name FROM brands WHERE id = ?', [quotation.brandId]);
              if (brand && brand.name) samplingBrandName = brand.name;
            }
          } catch (e) { /* ignore — fall back to N/A */ }

          // Full product detail sections (Customer / Brand / Product Info / Specs) via
          // the shared helper, so this email matches every other quotation email/PDF/view.
          const samplingDetailSectionsHtml = generateQuotationDetailSectionsHtml(quotation, {
            brandName: samplingBrandName,
            profileImageSrc: profileImageCid ? `cid:${profileImageCid}` : null,
          });

          // Fetch the supplier's submitted pricing tiers (last submitted price)
          let responseTiersHtml = '';
          try {
            const response = await db.get(
              `SELECT id FROM supplier_quotation_responses WHERE quotationId = ? AND supplierId = ? ORDER BY submittedAt DESC LIMIT 1`,
              [tokenData.quotationId, tokenData.supplierId]
            );
            if (response) {
              const tierRows = await getSupplierQuotationResponseTiers(response.id);
              const tiers = tierRows.map(t => ({ quantity: t.quantity, unitPrice: t.unitPrice, total: t.total }));
              responseTiersHtml = generateSupplierResponseTiersHtml(tiers, quotation.currency || 'HKD');
            }
          } catch (e) { /* ignore — sampling email proceeds without prior response data */ }

          const html = `
            <div style="font-family:Arial,sans-serif; max-width:800px; margin:0 auto; color:#000;">
              <h2 style="border-bottom:2px solid #000; padding-bottom:10px;">Sample Ready Date Confirmed</h2>
              <p>The sample ready date has been submitted:</p>
              ${samplingDetailSectionsHtml}
              <table style="width:100%; border-collapse:collapse; margin:20px 0;">
                <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold; width:45%;">Supplier</td><td style="padding:8px; border:1px solid #ccc;">${supplier.companyName}</td></tr>
                <tr><td style="padding:8px; border:1px solid #ccc; font-weight:bold;">Sample Ready Date</td><td style="padding:8px; border:1px solid #ccc;">${sampleReadyDate}</td></tr>
              </table>
              ${responseTiersHtml}
              <p style="font-size:12px; color:#666;">This is an automated notification.</p>
            </div>`;

          const recipients = [senderEmail];
          if (supplierEmail && supplierEmail !== senderEmail) recipients.push(supplierEmail);
          for (const to of recipients) {
            try {
              const mailOptions = { from: senderEmail, to, subject, html };
              if (profileImageAttachment) mailOptions.attachments = [profileImageAttachment];
              await transport.sendMail(mailOptions);
            } catch (e) { console.error(`Failed to send to ${to}:`, e.message); }
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

    // Get quotation details with hasProfileImage flag
    const quotation = await db.get(
      `SELECT *, CASE WHEN profileImageBlob IS NOT NULL THEN 1 ELSE 0 END as hasProfileImage FROM quotations WHERE id = ?`,
      [tokenData.quotationId]
    );

    if (!quotation) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    // Parse productDetails JSON if it's a string
    let parsedProductDetails = quotation.productDetails;
    if (typeof parsedProductDetails === 'string') {
      try { parsedProductDetails = JSON.parse(parsedProductDetails); } catch (e) { /* keep as-is */ }
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

    // Requested pricing tiers come from the quotation's productDetails (buyer-fixed
    // quantities). The supplier fills a unit price per tier; total is derived.
    const requestedTiers = Array.isArray(parsedProductDetails && parsedProductDetails.tiers)
      ? parsedProductDetails.tiers
      : [];

    // Attach the supplier's previously-submitted per-tier prices (normalized table).
    if (existingResponse) {
      const tierRows = await getSupplierQuotationResponseTiers(existingResponse.id);
      existingResponse.tiers = tierRows.map((t) => ({
        tierIndex: t.tierIndex, quantity: t.quantity, unitPrice: t.unitPrice, total: t.total
      }));
    }

    res.json({
      success: true,
      quotation: {
        id: quotation.id,
        customerName: quotation.customerName,
        customerItemName: quotation.customerItemName,
        productType: quotation.productType,
        productDetails: parsedProductDetails,
        requestedTiers,
        hasProfileImage: quotation.hasProfileImage,
        quantity: quotation.quantity,
        notes: quotation.notes,
        currency: quotation.currency,
        height_mm: quotation.height_mm,
        width_mm: quotation.width_mm
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
    const { unitPrice, totalPrice, deliveryDays, notes, tierPrices, moq, surchargeBelowMoq } = req.body;
    const db = await getTasksDb();

    // Normalize submitted per-tier prices (supplier enters a unit price per requested
    // tier; total is derived). Back-fill the flat top-level fields from the tiers when
    // only tiers were sent, so existing reports/lists keep working.
    let sanitizedTiers = [];
    if (Array.isArray(tierPrices) && tierPrices.length > 0) {
      sanitizedTiers = tierPrices.map((t, idx) => {
        const quantity = Number(t.quantity) || 0;
        const unit = Number(t.unitPrice);
        const u = Number.isFinite(unit) ? unit : 0;
        const total = Number(t.total != null ? t.total : quantity * u) || 0;
        return { tierIndex: idx, quantity, unitPrice: u, total };
      });
    }
    let finalUnitPrice = unitPrice;
    let finalTotalPrice = totalPrice;
    if (sanitizedTiers.length > 0) {
      if (finalUnitPrice == null || Number.isNaN(Number(finalUnitPrice))) {
        finalUnitPrice = sanitizedTiers[0].unitPrice;
      }
      const sumTotal = sanitizedTiers.reduce((acc, t) => acc + (Number(t.total) || 0), 0);
      if (finalTotalPrice == null || Number.isNaN(Number(finalTotalPrice))) {
        finalTotalPrice = sumTotal;
      }
    }
    const tierPricesJson = sanitizedTiers.length > 0 ? JSON.stringify(sanitizedTiers) : null;

    // MOQ + below-MOQ surcharge are optional numeric fields. Coerce to a number or
    // store NULL when blank/non-numeric so reports can distinguish "not provided".
    const moqNum = Number(moq);
    const finalMoq = Number.isFinite(moqNum) ? Math.trunc(moqNum) : null;
    const surchargeNum = Number(surchargeBelowMoq);
    const finalSurchargeBelowMoq = Number.isFinite(surchargeNum) ? Number(surchargeNum.toFixed(2)) : null;

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
       (tokenId, quotationId, supplierId, supplierMemberId, unitPrice, totalPrice, deliveryDays, notes, tierPrices, moq, surchargeBelowMoq, submittedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tokenData.id,
        tokenData.quotationId,
        tokenData.supplierId,
        tokenData.supplierMemberId,
        finalUnitPrice != null ? finalUnitPrice : unitPrice,
        finalTotalPrice != null ? finalTotalPrice : totalPrice,
        deliveryDays,
        notes,
        tierPricesJson,
        finalMoq,
        finalSurchargeBelowMoq,
        submittedAt
      ]
    );

    // Persist normalized per-tier rows for structured cross-supplier comparison.
    if (sanitizedTiers.length > 0) {
      await createSupplierQuotationResponseTiers(result.lastID, sanitizedTiers);
    }

    // Auto-advance status to 'compare quotation' once all linked suppliers have responded.
    // This mirrors the client-side action-button rule (responseCount >= linkedCount), so the
    // stored status field tracks reality instead of staying "await quotation" forever.
    const advance = await advanceToCompareQuotationWhenAllResponded(tokenData.quotationId);
    if (advance && advance.advanced) {
      logStatusChange(
        tokenData.quotationId,
        'await quotation',
        'compare quotation',
        `All ${advance.linkedCount} suppliers responded — status set to Compare Quotation`
      ).catch(err => console.error('History log error:', err));
    }

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
      sendSubmissionNotification(quotation, supplier, supplierMember, { unitPrice, totalPrice, deliveryDays, notes, sanitizedTiers })
        .catch(err => console.error('Notification error:', err));

      // Log supplier response in quotation history
      logStatusChange(
        tokenData.quotationId,
        'await quotation',
        'await quotation',
        `Supplier "${supplier.companyName}" submitted quotation`
      ).catch(err => console.error('History log error:', err));
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

  // GET /:token/files - list this supplier's uploaded supporting files (read-only)
  router.get('/:token/files', async (req, res) => {
    try {
      const { tokenData, error } = await resolvePortalToken(req.params.token);
      if (error) return res.status(error.status).json({ success: false, error: error.message });
      const files = await getSupplierQuotationFiles(tokenData.quotationId, tokenData.supplierId);
      res.json({ success: true, files });
    } catch (e) {
      console.error('Error listing supplier files:', e);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  // POST /:token/files - supplier uploads a supporting file
  router.post('/:token/files', upload.single('supplierFile'), async (req, res) => {
    try {
      const { tokenData, error } = await resolvePortalToken(req.params.token);
      if (error) return res.status(error.status).json({ success: false, error: error.message });
      if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
      const filePath = getNormalizedRelativePath(path.join(__dirname, '..'), req.file.path);
      const row = await insertSupplierQuotationFile({
        quotationId: tokenData.quotationId,
        supplierId: tokenData.supplierId,
        supplierMemberId: tokenData.supplierMemberId,
        tokenId: tokenData.id,
        originalName: req.file.originalname,
        storedFilename: req.file.filename,
        filePath,
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size,
        uploadedBy: 'supplier',
      });
      res.json({ success: true, file: row });
    } catch (e) {
      console.error('Error uploading supplier file:', e);
      res.status(500).json({ success: false, error: 'Server error' });
    }
  });

  return router;
}
