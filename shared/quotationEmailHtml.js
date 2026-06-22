// Shared quotation-email HTML builder. Pure ES module: no window/document/fetch.
// Imported by the Node server and loaded by the browser (see public/index.html).

// Verbatim from public/index.html:15376
export const PRODUCT_DETAILS_LABELS = {
  material: 'Material',
  size: 'Size',
  printingMethod: 'Printing Method',
  colorCount: 'Color Count',
  edgeFinish: 'Edge Finish',
  materialType: 'Material Type',
  flatRaised: 'Flat / Raised',
  ink: 'Ink',
  raisedHeight: 'Raised Height (mm)',
  frontColor: 'Front Color',
  backColor: 'Back Color',
  folding: 'Folding',
  transferType: 'Transfer Type',
  application: 'Application Method',
  thickness: 'Thickness',
  colorMode: 'Color Mode',
  backingType: 'Backing Type',
  designComplexity: 'Design Complexity',
  stitchType: 'Stitch Type',
  borderType: 'Border Type',
  threadColorCount: 'Thread Color Count',
  productDescription: 'Description',
  category: 'Category',
  complexity: 'Complexity',
  customerItemName: 'Customer Item Name',
  height_mm: 'Height (mm)',
  width_mm: 'Width (mm)',
  screenPrint: 'Screen Print',
  hotPress: 'Hot Press',
  edge: 'Edge',
  metalEmbedded: 'Metal Embedded',
  remark: 'Remark'
};

// Verbatim from public/index.html:15414
export const PRODUCT_OPTION_LABELS = {
  material: { paper: 'Paper', cardboard: 'Cardboard', plastic: 'Plastic', fabric: 'Fabric', 'Real Leather': 'Real Leather', 'PU Leather': 'PU Leather' },
  printingMethod: { 'screen-printing': 'Screen Printing', 'digital-printing': 'Digital Printing', 'offset-printing': 'Offset Printing', embroidery: 'Embroidery' },
  colorCount: { '1': '1 Color', '2': '2 Colors', '3': '3 Colors', '4': '4+ Colors' },
  edgeFinish: { cut: 'Cut Edge', hemmed: 'Hemmed Edge', overlocked: 'Overlocked', 'end-fold': 'End Fold', 'loop-fold': 'Loop Fold', '4-side-heat-cut': '4 Side Heat Cut' },
  materialType: { satin: 'Satin Tape', cotton: 'Cotton Tape', woven: 'Woven Fabric', others: 'Others' },
  flatRaised: { flat: 'Flat', raised: 'Raised' },
  ink: { uv: 'UV', silicon: 'Silicon' },
  folding: { 'end-fold': 'End Fold', 'loop-fold': 'Loop Fold', 'manhattan-fold': 'Manhattan Fold', 'mitre-fold': 'Mitre Fold', 'straight-cut': 'Straight Cut' },
  transferType: { 'screen-print': 'Screen Print Transfer', 'digital-print': 'Digital Print Transfer', 'vinyl-cut': 'Vinyl Cut Transfer', sublimation: 'Sublimation Transfer' },
  application: { 'heat-press': 'Heat Press', iron: 'Household Iron', commercial: 'Commercial Press' },
  thickness: { '0.5mm': '0.5mm', '1mm': '1mm', '1.5mm': '1.5mm', '2mm': '2mm', '3mm': '3mm' },
  colorMode: { 'single-color': 'Single Color', 'multi-color': 'Multi-Color', 'full-color': 'Full Color' },
  backingType: { adhesive: 'Adhesive', 'sew-on': 'Sew-on', velcro: 'Velcro', magnetic: 'Magnetic', 'iron-on': 'Iron-on', none: 'None' },
  designComplexity: { simple: 'Simple', medium: 'Medium', complex: 'Complex', custom: 'Custom' },
  complexity: { simple: 'Simple', medium: 'Medium', complex: 'Complex', custom: 'Custom' },
  stitchType: { 'flat-stitch': 'Flat Stitch', '3d-puff': '3D Puff', applique: 'Applique', chenille: 'Chenille' },
  borderType: { merrow: 'Merrow Border', 'heat-cut': 'Heat Cut Border', 'laser-cut': 'Laser Cut' },
  threadColorCount: { '1-3': '1-3 Colors', '4-6': '4-6 Colors', '7-9': '7-9 Colors', '10+': '10+ Colors' },
  screenPrint: { 'No': 'No', '1': '1', '2': '2', '3': '3', '4': '4' },
  hotPress: { 'YES': 'YES', 'NO': 'NO' },
  edge: { 'Paint': 'Paint', 'Embroidery': 'Embroidery' },
  metalEmbedded: { 'YES': 'YES', 'NO': 'NO' }
};

// Verbatim from public/index.html:14265
export function formatFileSize(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1))} ${units[i]}`;
}

// Verbatim from public/index.html:15363
export function emailProductTypeDisplay(productType, productDetails) {
  const pd = (typeof productDetails === 'string') ? JSON.parse(productDetails || '{}') : (productDetails || {});
  if (productType === 'outsource' && pd._productTag) {
    const names = { 'hang-tag':'Hang Tag','woven-label':'Woven Label','printed-label':'Printed Label','heat-transfer':'Heat Transfer','silicon-patch':'Silicon Patch','embroidery-patch':'Embroidery Patch','pu-patch':'PU Patch','other':'Other','others':'Other' };
    return names[pd._productTag] || pd._productTag;
  }
  const names = { 'hang-tag':'Hang Tag','woven-label':'Woven Label','printed-label':'Printed Label','heat-transfer':'Heat Transfer','silicon-patch':'Silicon Patch','embroidery-patch':'Embroidery Patch','pu-patch':'PU Patch','outsource':'Outsource','other':'Other','others':'Other' };
  return names[productType] || productType || 'N/A';
}

// Verbatim from public/index.html:15458
export function resolveProductDetailValue(key, raw) {
  const optMap = PRODUCT_OPTION_LABELS[key];
  if (optMap && Object.prototype.hasOwnProperty.call(optMap, String(raw))) {
    return optMap[String(raw)];
  }
  return raw;
}

// Format a productDetail value for display in the spec table. Handles the 'tiers'
// array specially (renders as a quantity list). Returns null for any structured
// value that has no renderer (array/object) so the spec loop skips it instead of
// leaking "[object Object]". For primitives, delegates to resolveProductDetailValue.
export function formatProductDetailValue(key, raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (key === 'tiers' && Array.isArray(raw)) {
    const quantities = raw.map(t => Number(t && t.quantity)).filter(n => !isNaN(n)).map(n => n.toLocaleString());
    return quantities.length ? quantities.join('; ') : null;
  }
  if (Array.isArray(raw) || (raw !== null && typeof raw === 'object')) {
    return null; // structured value with no renderer — skip
  }
  return resolveProductDetailValue(key, raw);
}

// Escape HTML special characters in a string. Used for user-entered free text
// (e.g. notes) interpolated into email HTML, to prevent HTML/markup injection.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// NEW: supplier response tier table for the confirmation email.
// tiers = [{tierIndex, quantity, unitPrice, total}, ...]. Returns '' when empty.
// Note: 'total' is kept on the data objects (persisted + used downstream) but is
// NOT rendered — only Quantity and Unit Price are shown.
// currency is the ISO code shown in the header (defaults to 'HKD').
export function generateSupplierResponseTiersHtml(tiers, currency = 'HKD') {
  const arr = Array.isArray(tiers) ? tiers : [];
  if (arr.length === 0) return '';
  const ccy = currency || 'HKD';
  const rows = arr.map((t) => {
    const q = Number(t.quantity) || 0;
    const u = t.unitPrice != null ? Number(t.unitPrice).toFixed(4) : '0.0000';
    return `<tr><td style="padding:6px; border:1px solid #ccc;">${q.toLocaleString()}</td><td style="padding:6px; border:1px solid #ccc;">${u}</td></tr>`;
  }).join('');
  return `
  <div class="quotation-section" style="margin:20px 0;">
    <h3 style="margin-top:0; margin-bottom:8px; border-bottom:2px solid #000; padding-bottom:8px;">Supplier Quoted Pricing</h3>
    <table style="width:100%; border-collapse:collapse; margin:8px 0;">
      <thead><tr>
        <th style="padding:6px; border:1px solid #ccc; text-align:left;">Quantity</th>
        <th style="padding:6px; border:1px solid #ccc; text-align:left;">Unit Price (${ccy})</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// Format a stored machine status into a human-readable label for display in the
// card meta band, the PDF, and the email subject. 'await quotation' -> 'Await
// Quotation'. null/empty -> 'N/A'.
export function formatStatusLabel(status) {
  if (!status) return 'N/A';
  return String(status)
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Decide what the batch-send Supplier Quotations section should contain. The
// mode is driven by RESPONSE COUNT only (not the status string): no responses ->
// 'empty'; any responses -> 'all'. Selection ids + markupPercent do not affect
// the mode; they are passed through so the renderer has everything in one object.
// Pure; consumed by both the HTML renderer below and the jsPDF renderer.
export function resolveStatusTierMode({ status, responses, selectedSupplierId, selectedResponseId, markupPercent } = {}) {
  const resp = Array.isArray(responses) ? responses : [];
  const mode = resp.length === 0 ? 'empty' : 'all';
  return {
    mode,
    status,
    responses: resp,
    selectedSupplierId: selectedSupplierId != null ? Number(selectedSupplierId) : null,
    selectedResponseId: selectedResponseId != null ? Number(selectedResponseId) : null,
    markupPercent: Number(markupPercent) || 0,
  };
}

// Render the status-driven Supplier Quotations section for the batch-send email.
// Always returns a section (header + placeholder when empty; supplier table +
// optional per-tier matrix when populated). Mirrors the Compare Quotation popup's
// conventions: ✓ Selected badge, strike-through of non-selected rows, green/red
// min/max highlight, and a quantity-aligned per-tier matrix with a Tier-total row.
// When a supplier is selected and markupPercent > 0, its per-tier unit prices
// are multiplied by (1 + markupPercent/100) in the per-tier matrix.
export function generateStatusTierSectionHtml(ctx = {}) {
  const m = resolveStatusTierMode(ctx);
  const ccy = (ctx && ctx.currency) || 'HKD';
  const sectionOpen = '<div class="quotation-section" style="margin:20px 0;">';
  const h3Open = '<h3 style="margin-top:0; margin-bottom:8px; border-bottom:2px solid #000; padding-bottom:8px;">';
  const close = '</div>';

  const cellLbl = 'padding:8px; border:1px solid #ccc; font-weight:bold; vertical-align:top;';
  const cell = 'padding:8px; border:1px solid #ccc; vertical-align:top;';

  // Normalize requested tiers (buyer-fixed quantities) — accept either raw
  // numbers or {quantity} objects. Rendered as an empty template under Pending
  // (no supplier has quoted yet, so unit-price cells are blank).
  const rawRequested = (ctx && Array.isArray(ctx.requestedTiers)) ? ctx.requestedTiers : [];
  const requestedTiers = rawRequested
    .map((t) => Number(typeof t === 'object' && t ? t.quantity : t))
    .filter((q) => Number.isFinite(q))
    .map((q) => ({ quantity: q }));

  if (m.mode === 'empty') {
    if (requestedTiers.length > 0) {
      const tierRows = requestedTiers.map((t) =>
        `<tr><td style="${cell}">${Number(t.quantity).toLocaleString()}</td><td style="${cell} text-align:right;">—</td></tr>`
      ).join('');
      return `${sectionOpen}${h3Open}Supplier Quotations</h3>
    <table style="width:100%; border-collapse:collapse; margin:8px 0;">
      <thead><tr>
        <th style="${cellLbl} text-align:left;">Quantity</th>
        <th style="${cellLbl} text-align:right;">Unit Price (${ccy})</th>
      </tr></thead>
      <tbody>${tierRows}</tbody>
    </table>${close}`;
    }
    return `${sectionOpen}${h3Open}Supplier Quotations</h3><p style="color:#666; margin:0;">No supplier quotations to show at this stage.</p>${close}`;
  }

  const { responses, selectedSupplierId, selectedResponseId, markupPercent } = m;
  const isSelected = (r) =>
    (selectedResponseId != null && Number(r.id) === selectedResponseId) ||
    (selectedSupplierId != null && Number(r.supplierId) === selectedSupplierId);
  const hasSelection = responses.some(isSelected);
  const mk = 1 + (markupPercent / 100);
  const money2 = (n) => (n != null && !isNaN(Number(n))) ? Number(n).toFixed(2) : 'N/A';

  // Summary table — Supplier / Contact / Email / Delivery Days / MOQ (pcs) /
  // Surcharge below MOQ / Notes.
  const rows = responses.map((r) => {
    const sel = isSelected(r);
    const strike = (!sel && hasSelection) ? 'opacity:0.5; text-decoration:line-through; color:#999;' : '';
    const badge = sel ? ' <span style="background:#28a745;color:#fff;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:bold;">✓ Selected</span>' : '';
    const email = (r.emailPrefix && r.emailDomain) ? `${r.emailPrefix}@${r.emailDomain}` : '-';
    const moq = (r.moq != null && r.moq !== '') ? Number(r.moq).toLocaleString() : '-';
    const surcharge = (r.surchargeBelowMoq != null && r.surchargeBelowMoq !== '') ? money2(r.surchargeBelowMoq) : '-';
    return `<tr style="${strike}">
        <td style="${cell}">${escapeHtml(r.companyName || 'Supplier')}${badge}</td>
        <td style="${cell}">${escapeHtml(r.memberName || '-')}</td>
        <td style="${cell}">${escapeHtml(email)}</td>
        <td style="${cell} text-align:center;">${r.deliveryDays != null ? r.deliveryDays : 'N/A'}</td>
        <td style="${cell} text-align:right;">${moq}</td>
        <td style="${cell} text-align:right;">${surcharge}</td>
        <td style="${cell}">${r.notes ? escapeHtml(r.notes) : '-'}</td>
      </tr>`;
  }).join('');

  let html = `${sectionOpen}${h3Open}Supplier Quotations</h3>
    <table style="width:100%; border-collapse:collapse; margin:8px 0;">
      <thead><tr>
        <th style="${cellLbl} text-align:left;">Supplier</th>
        <th style="${cellLbl} text-align:left;">Contact</th>
        <th style="${cellLbl} text-align:left;">Email</th>
        <th style="${cellLbl} text-align:center;">Delivery Days</th>
        <th style="${cellLbl} text-align:right;">MOQ (pcs)</th>
        <th style="${cellLbl} text-align:right;">Surcharge below MOQ (${ccy})</th>
        <th style="${cellLbl} text-align:left;">Notes</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  // Per-tier matrix — only when at least one supplier submitted tiers.
  const anyTiers = responses.some((r) => Array.isArray(r.tiers) && r.tiers.length > 0);
  if (anyTiers) {
    const maxLen = responses.reduce((mx, r) => Math.max(mx, Array.isArray(r.tiers) ? r.tiers.length : 0), 0);
    const qtyLabel = (i) => {
      for (const r of responses) {
        if (r.tiers && r.tiers[i] && r.tiers[i].quantity != null) return Number(r.tiers[i].quantity).toLocaleString();
      }
      return 'Tier ' + (i + 1);
    };
    const tierUnitRaw = (r, i) => (r.tiers && r.tiers[i] && r.tiers[i].unitPrice != null) ? Number(r.tiers[i].unitPrice) : null;
    const colHeaders = responses.map((r) => {
      const mark = isSelected(r) ? ' ✓' : '';
      return `<th style="${cellLbl} text-align:right;">${escapeHtml(r.companyName || 'Supplier')}${mark}</th>`;
    }).join('');

    let bodyRows = '';
    for (let i = 0; i < maxLen; i++) {
      // displayed values (markup applied to selected) drive the min/max highlight
      const displayed = responses.map((r) => {
        const u = tierUnitRaw(r, i);
        return (isSelected(r) && markupPercent > 0 && u != null) ? u * mk : u;
      });
      const vals = displayed.filter((v) => v != null);
      const mn = vals.length ? Math.min(...vals) : null;
      const mx2 = vals.length ? Math.max(...vals) : null;
      const equal = mn !== null && mn === mx2;
      let cells = `<td style="${cell} font-weight:600;">${qtyLabel(i)}</td>`;
      displayed.forEach((u) => {
        let bg = '';
        if (!equal && u != null) { if (u === mn) bg = 'background:#d4edda;'; else if (u === mx2) bg = 'background:#f8d7da;'; }
        cells += `<td style="${cell} text-align:right; ${bg}">${u != null ? u.toFixed(4) : '-'}</td>`;
      });
      bodyRows += `<tr>${cells}</tr>`;
    }

    html += `
      ${h3Open.replace('margin-top:0;', 'margin-top:20px;')}Per-tier Pricing (${ccy})</h3>
      <table style="width:100%; border-collapse:collapse; margin:8px 0;">
        <thead><tr><th style="${cellLbl} text-align:left;">Quantity</th>${colHeaders}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>`;
  }

  return html + close;
}

// The reusable quotation card — INNER markup only (the quotation-container div:
// header, meta band, attachment reminder, product/customer/brand/spec sections,
// image, notes). No <!DOCTYPE>/<html>/<head>/<body> shell. Layout styles are
// inlined so the card renders standalone / inside any wrapper / in email clients
// that strip <style> blocks.
export function generateQuotationCardHtml(quotation, opts = {}) {
  const productDetails = (typeof quotation.productDetails === 'string') ? JSON.parse(quotation.productDetails || '{}') : (quotation.productDetails || {});
  const productTypeName = emailProductTypeDisplay(quotation.productType, productDetails);
  const fmtDate = (ds) => ds ? new Date(ds).toLocaleString() : '';

  const qrBase64 = opts.qrBase64 || null;
  const osRef = opts.osRef || '';
  const attachmentList = Array.isArray(opts.attachmentList) ? opts.attachmentList : [];

  const qrCellHtml = qrBase64 ? `
    <td width="100" valign="top" style="background:#fff; border:1px solid #ccc; text-align:center; padding:6px;">
      <img src="${qrBase64}" width="84" height="84" style="width:84px; height:84px; display:block; margin:0 auto;" alt="QR Code">
      ${osRef ? `<div style="font-size:11px; color:#000; font-weight:bold; margin-top:4px;">${osRef}</div>` : ''}
    </td>` : '';

  const metaBandHtml = `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">
      <tr>
        <td style="background:#f5f5f5; border:1px solid #ccc; padding:8px; font-size:12px;">
          ${osRef ? `<strong style="color:#000;">Ref:</strong> <span style="color:#000;">${osRef}</span> &nbsp;|&nbsp; ` : ''}
          <strong style="color:#000;">Date Created:</strong> <span style="color:#000;">${fmtDate(quotation.dateCreated) || '-'}</span> &nbsp;|&nbsp;
          <strong style="color:#000;">Date Revised:</strong> <span style="color:#000;">${fmtDate(quotation.dateRevised) || '-'}</span> &nbsp;|&nbsp;
          <strong style="color:#000;">Status:</strong> <span style="color:#000;">${formatStatusLabel(quotation.status)}</span>
        </td>
      </tr>
    </table>`;

  const attItems = attachmentList
    .map(a => `${a.filename} (${formatFileSize(a.sizeBytes)})`).join(', ');
  const attachmentReminderHtml = (attachmentList.length > 0)
    ? `<div style="margin-bottom:10px; padding:8px 10px; background:#fff8e1; border:1px solid #ffe082; font-size:12px; color:#5d4037;">
         <strong>📎 Attachments (${attachmentList.length}):</strong> ${attItems}
       </div>`
    : `<div style="margin-bottom:10px; padding:8px 10px; background:#f5f5f5; border:1px solid #ccc; font-size:12px; color:#666;">
         <strong>📎 Attachments:</strong> No additional attachments (a PDF copy of this quotation is attached).
       </div>`;

  const brandName = opts.brandName || 'N/A';

  const cellLabel = 'padding:8px; border:1px solid #ccc; font-weight:bold; width:45%; vertical-align:top;';
  const cellValue = 'padding:8px; border:1px solid #ccc; vertical-align:top;';
  const tableStyle = 'width:100%; border-collapse:collapse;';
  const h3Style = 'margin-top:0; margin-bottom:8px; border-bottom:2px solid #000; padding-bottom:8px;';
  const sectionStyle = 'margin:20px 0;';

  const shownKeys = new Set();
  let specRows = '';
  const addRow = (label, value) => {
    specRows += `<tr><td style="${cellLabel}">${label}</td><td style="${cellValue}">${value}</td></tr>`;
  };

  if (quotation.customerItemName) { addRow('Customer Item Name', quotation.customerItemName); shownKeys.add('customerItemName'); }
  if (quotation.height_mm !== null && quotation.height_mm !== undefined && quotation.height_mm !== '') { addRow('Height (mm, unfolded)', quotation.height_mm); shownKeys.add('height_mm'); }
  if (quotation.width_mm !== null && quotation.width_mm !== undefined && quotation.width_mm !== '') { addRow('Width (mm, unfolded)', quotation.width_mm); shownKeys.add('width_mm'); }

  for (const [key, raw] of Object.entries(productDetails)) {
    if (key.startsWith('_')) continue;
    if (shownKeys.has(key)) continue;
    if (raw === null || raw === undefined || raw === '') continue;
    const label = PRODUCT_DETAILS_LABELS[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
    const value = formatProductDetailValue(key, raw);
    if (value === null || value === undefined) continue;
    addRow(label, value);
  }

  if (specRows === '') {
    specRows = '<tr><td style="padding:8px; border:1px solid #ccc; color:#999;">No specifications recorded.</td><td style="padding:8px; border:1px solid #ccc;"></td></tr>';
  }

  const imageHtml = opts.profileImageSrc
    ? `<div style="margin:15px 0; text-align:center;"><img src="${opts.profileImageSrc}" style="max-width:200px; max-height:200px; object-fit:contain; border:1px solid #ddd; padding:5px;" alt="Product Image"></div>`
    : '';

  const notesHtml = quotation.notes
    ? `<div class="quotation-section" style="${sectionStyle}"><h3 style="${h3Style}">Additional Notes</h3><p style="margin:0; white-space:pre-wrap;">${escapeHtml(quotation.notes).replace(/\n/g, '<br>')}</p></div>`
    : '';

  return `
  <div class="quotation-container" style="max-width:800px; margin:0 auto; padding:20px; border:2px solid #000;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
      <tr>
        <td valign="middle" style="background:#000; color:#fff; padding:15px; text-align:center; border:1px solid #000;">
          <div style="font-size:22px; font-weight:bold; margin:0;">QUOTATION</div>
          <div style="font-size:13px; margin:4px 0 0 0;">${productTypeName}</div>
        </td>
        ${qrCellHtml}
      </tr>
    </table>

    ${metaBandHtml}
    ${attachmentReminderHtml}

    <div class="quotation-section" style="${sectionStyle}">
      <h3 style="${h3Style}">Product Information</h3>
      <table class="quotation-table" style="${tableStyle}">
        <tr><td style="${cellLabel}">Product Type</td><td style="${cellValue}">${productTypeName}</td></tr>
        <tr><td style="${cellLabel}">Variable</td><td style="${cellValue}">${quotation.variable === 'YES' ? 'YES' : 'NO'}</td></tr>
      </table>
    </div>

    <div class="quotation-section" style="${sectionStyle}">
      <h3 style="${h3Style}">Customer Information</h3>
      <table class="quotation-table" style="${tableStyle}">
        <tr><td style="${cellLabel}">Customer Name</td><td style="${cellValue}">${quotation.customerName || 'N/A'}</td></tr>
        <tr><td style="${cellLabel}">Contact Person</td><td style="${cellValue}">${quotation.contactPerson || 'N/A'}</td></tr>
        <tr><td style="${cellLabel}">Email</td><td style="${cellValue}">${quotation.email || 'N/A'}</td></tr>
        <tr><td style="${cellLabel}">Phone</td><td style="${cellValue}">${quotation.phone || 'N/A'}</td></tr>
      </table>
    </div>

    <div class="quotation-section" style="${sectionStyle}">
      <h3 style="${h3Style}">Brand Detail</h3>
      <table class="quotation-table" style="${tableStyle}">
        <tr><td style="${cellLabel}">Brand Name</td><td style="${cellValue}">${brandName}</td></tr>
      </table>
    </div>

    <div class="quotation-section" style="${sectionStyle}">
      <h3 style="${h3Style}">Product Specifications</h3>
      ${imageHtml}
      <table class="quotation-table" style="${tableStyle}">
        ${specRows}
      </table>
    </div>

    ${notesHtml}
  </div>`;
}

// Full-document wrapper — used when the card IS the entire email body (batch-send
// and reply flows). Thin wrapper over generateQuotationCardHtml + the reply-quote block.
export function generateQuotationEmailHtml(quotation, opts = {}) {
  const cardHtml = generateQuotationCardHtml(quotation, opts);
  const originalEmailHtml = opts.originalEmailHtml || '';
  const emailMeta = opts.emailMeta || null;

  const replyBlock = originalEmailHtml ? `
  <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #ccc;">
    <div style="font-size: 0.9em; color: #666; margin-bottom: 10px;">
      <strong>---------- Original Message ----------</strong><br>
      ${emailMeta ? `
      <strong>From:</strong> ${emailMeta.from || 'Unknown'}<br>
      <strong>Date:</strong> ${emailMeta.date || 'Unknown'}<br>
      <strong>Subject:</strong> ${emailMeta.subject || '(No subject)'}
      ` : ''}
    </div>
    <div style="color: #333; border-left: 3px solid #ccc; padding-left: 15px; margin-left: 10px;">
      ${originalEmailHtml}
    </div>
  </div>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
  </style>
</head>
<body style="margin:0; padding:20px;">
${cardHtml}
${opts.afterCardHtml || ''}
${replyBlock}
</body>
</html>`;
}

// Server-side composition for the supplier submission confirmation email.
// Pure: takes already-loaded data, returns a full HTML document string.
//   opts = { brandName, profileImageCid }
//   submittedData.sanitizedTiers = [{tierIndex, quantity, unitPrice, total}, ...]
export function buildSupplierConfirmationHtml(quotation, supplier, supplierMember, submittedData, opts = {}) {
  const cellLabel = 'padding:8px; border:1px solid #ccc; font-weight:bold; width:45%; vertical-align:top;';
  const cellValue = 'padding:8px; border:1px solid #ccc; vertical-align:top;';

  const cardHtml = generateQuotationCardHtml(quotation, {
    brandName: opts.brandName,
    profileImageSrc: opts.profileImageCid ? `cid:${opts.profileImageCid}` : null,
    qrBase64: null,                 // server has no QR (out of scope)
    osRef: quotation.outsourcingSeq || '',
    attachmentList: [],
  });

  const tiers = (submittedData && Array.isArray(submittedData.sanitizedTiers)) ? submittedData.sanitizedTiers : [];
  const tiersHtml = generateSupplierResponseTiersHtml(tiers, quotation.currency || 'HKD');

  const sd = submittedData || {};

  const confirmationBlock = `
  <div class="quotation-section" style="margin:20px 0;">
    <h3 style="margin-top:0; margin-bottom:8px; border-bottom:2px solid #000; padding-bottom:8px;">Submission Confirmation</h3>
    <table style="width:100%; border-collapse:collapse;">
      <tr><td style="${cellLabel}">Supplier</td><td style="${cellValue}">${(supplier && supplier.companyName) || 'N/A'}</td></tr>
      <tr><td style="${cellLabel}">Contact</td><td style="${cellValue}">${(supplierMember && supplierMember.name) || 'N/A'}</td></tr>
      <tr><td style="${cellLabel}">Delivery Days</td><td style="${cellValue}">${sd.deliveryDays || 'N/A'}</td></tr>
      <tr><td style="${cellLabel}">Notes</td><td style="${cellValue}">${escapeHtml(sd.notes || '-')}</td></tr>
    </table>
  </div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
</style>
</head>
<body style="margin:0; padding:20px;">
${cardHtml}
${confirmationBlock}
${tiersHtml}
<p style="font-size:12px; color:#666; margin-top:24px;">This is an automated notification.</p>
</body>
</html>`;
}
