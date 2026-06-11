import express from 'express';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';

const router = express.Router();

/**
 * Create order routes
 */
export function createOrderRoutes(deps) {
  const {
    getAllOrders, getOrderById, getOrderBySeq,
    createOrder, updateOrder, deleteOrder,
    getQuotationById, getWorkshopById,
    recordOrderDepartmentScan, getOrderProgress, getLastOrderScan
  } = deps;

  // ===== ORDER CRUD =====

  // Get all orders
  router.get('/', async (req, res) => {
    try {
      const orders = await getAllOrders();
      res.json({ success: true, orders });
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }
  });

  // Get order by ID
  router.get('/detail/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const order = await getOrderById(id);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      // Attach progress history
      const progress = await getOrderProgress(order.orderSeq);
      order.progressHistory = progress;
      res.json({ success: true, order });
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch order' });
    }
  });

  // Get order by sequence number (for Android)
  router.get('/seq/:orderSeq', async (req, res) => {
    try {
      const order = await getOrderBySeq(req.params.orderSeq);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      const progress = await getOrderProgress(order.orderSeq);
      order.progressHistory = progress;
      // Add profile image URL from linked quotation
      if (order.quotationId) {
        order.profileImageUrl = `/api/quotations/${order.quotationId}/profile-image`;
      }
      res.json({ success: true, order });
    } catch (error) {
      console.error('Error fetching order by seq:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch order' });
    }
  });

  // Create order from approved quotation
  router.post('/', async (req, res) => {
    try {
      const { quotationId } = req.body;
      if (!quotationId) {
        return res.status(400).json({ success: false, error: 'quotationId is required' });
      }

      const quotation = await getQuotationById(quotationId);
      if (!quotation) {
        return res.status(404).json({ success: false, error: 'Quotation not found' });
      }
      if (quotation.status !== 'approved') {
        return res.status(400).json({ success: false, error: 'Only approved quotations can be converted to orders' });
      }

      // Determine type and seq
      const isOutsourcing = ['other', 'others', 'outsource'].includes(quotation.productType);
      const quotationType = isOutsourcing ? 'outsourcing' : 'quotation';
      const quotationSeq = isOutsourcing ? quotation.outsourcingSeq : quotation.quotationSeq;

      const result = await createOrder({
        quotationId: quotation.id,
        quotationType,
        quotationSeq,
        customerName: quotation.customerName,
        contactPerson: quotation.contactPerson,
        email: quotation.email,
        phone: quotation.phone,
        productType: quotation.productType,
        productDetails: quotation.productDetails,
        quantity: quotation.quantity,
        unitPrice: quotation.unitPrice,
        total: quotation.total,
        customerItemName: quotation.customerItemName || null,
        brandId: quotation.brandId || null
      });

      const order = await getOrderById(result.id);
      res.json({ success: true, order });
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ success: false, error: 'Failed to create order' });
    }
  });

  // Update order
  router.put('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getOrderById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      await updateOrder(id, req.body);
      const order = await getOrderById(id);
      res.json({ success: true, order });
    } catch (error) {
      console.error('Error updating order:', error);
      res.status(500).json({ success: false, error: 'Failed to update order' });
    }
  });

  // Delete order
  router.delete('/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await getOrderById(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      await deleteOrder(id);
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting order:', error);
      res.status(500).json({ success: false, error: 'Failed to delete order' });
    }
  });

  // ===== QR CODE =====

  // Get single order PDF
  router.get('/:id/pdf', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const order = await getOrderById(id);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }
      if (!order.workshopId) {
        return res.status(400).json({ success: false, error: 'Factory not assigned yet. Use Create PDF from the Created panel first.' });
      }

      const workshop = await getWorkshopById(order.workshopId);

      const qrData = order.orderSeq;
      const qrBuffer = await QRCode.toBuffer(qrData, { width: 150, margin: 1, errorCorrectionLevel: 'H' });

      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

      // QR code top-right
      doc.image(qrBuffer, 420, 40, { width: 120 });

      // Header
      doc.fontSize(18).fillColor('#1a1a1a').text(`${order.quotationSeq || order.orderSeq}`, 50, 50);
      doc.fontSize(10).fillColor('#666').text(`Order: ${order.orderSeq}`, 50, 75).text(`Created: ${new Date(order.dateCreated).toLocaleDateString()}`, 50, 88);

      doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#ddd').stroke();

      let y = 125;
      const labelWidth = 130;
      doc.fontSize(11).fillColor('#333');

      doc.font('Helvetica-Bold').text('Customer:', 50, y);
      doc.font('Helvetica').text(order.customerName || '-', 50 + labelWidth, y); y += 18;

      if (order.contactPerson) {
        doc.font('Helvetica-Bold').text('Contact:', 50, y);
        doc.font('Helvetica').text(order.contactPerson, 50 + labelWidth, y); y += 18;
      }

      doc.font('Helvetica-Bold').text('Factory:', 50, y);
      doc.font('Helvetica').text(workshop ? workshop.fullCompanyName : order.workshopName || '-', 50 + labelWidth, y); y += 18;

      if (order.country || (workshop && workshop.country)) {
        doc.font('Helvetica-Bold').text('Country:', 50, y);
        doc.font('Helvetica').text(order.country || workshop.country, 50 + labelWidth, y); y += 18;
      }

      doc.font('Helvetica-Bold').text('Product Type:', 50, y);
      doc.font('Helvetica').text(order.productType || '-', 50 + labelWidth, y); y += 18;

      doc.font('Helvetica-Bold').text('Quantity:', 50, y);
      doc.font('Helvetica').text(String(order.quantity || '-'), 50 + labelWidth, y); y += 18;

      doc.font('Helvetica-Bold').text('Unit Price:', 50, y);
      doc.font('Helvetica').text(String(order.unitPrice || '-'), 50 + labelWidth, y); y += 18;

      doc.font('Helvetica-Bold').text('Total:', 50, y);
      doc.font('Helvetica').text(String(order.total || '-'), 50 + labelWidth, y); y += 25;

      if (order.productDetails && Object.keys(order.productDetails).length > 0) {
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke(); y += 10;
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#333').text('Product Details', 50, y); y += 20;
        doc.font('Helvetica').fontSize(10).fillColor('#444');
        for (const [key, value] of Object.entries(order.productDetails)) {
          if (y > 720) { doc.addPage(); y = 50; }
          const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
          const displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
          doc.font('Helvetica-Bold').text(`${displayKey}:`, 60, y, { width: 150 });
          doc.font('Helvetica').text(displayVal, 220, y, { width: 320 });
          y += 16;
        }
      }

      doc.fontSize(8).fillColor('#999').text(`Generated: ${new Date().toISOString()}`, 50, 760).text(`${order.orderSeq} | ${order.quotationSeq || ''}`, 50, 772);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${order.orderSeq}.pdf"`);

      doc.pipe(res);
      doc.end();
    } catch (error) {
      console.error('Error generating single PDF:', error);
      res.status(500).json({ success: false, error: 'Failed to generate PDF: ' + error.message });
    }
  });

  // Get QR code PNG by order sequence number
  router.get('/seq/:orderSeq/qr', async (req, res) => {
    try {
      const orderSeq = req.params.orderSeq;
      const qrBuffer = await QRCode.toBuffer(orderSeq, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'H'
      });
      res.set('Content-Type', 'image/png');
      res.send(qrBuffer);
    } catch (error) {
      console.error('Error generating QR by seq:', error);
      res.status(500).json({ success: false, error: 'Failed to generate QR code' });
    }
  });

  // Get QR code PNG for an order
  router.get('/:id/qr', async (req, res) => {
    try {
      const id = Number(req.params.id);
      const order = await getOrderById(id);
      if (!order) {
        return res.status(404).json({ success: false, error: 'Order not found' });
      }

      const qrData = order.orderSeq;

      const qrBuffer = await QRCode.toBuffer(qrData, {
        width: 300,
        margin: 2,
        errorCorrectionLevel: 'H'
      });

      res.set('Content-Type', 'image/png');
      res.send(qrBuffer);
    } catch (error) {
      console.error('Error generating QR:', error);
      res.status(500).json({ success: false, error: 'Failed to generate QR code' });
    }
  });

  // ===== PDF GENERATION =====

  // GET endpoint for browser download (avoids ad blocker issues with POST)
  router.get('/export', async (req, res) => {
    try {
      const idsParam = req.query.ids;
      const workshopId = Number(req.query.workshopId);

      if (!idsParam) {
        return res.status(400).json({ success: false, error: 'ids parameter is required' });
      }
      if (!workshopId) {
        return res.status(400).json({ success: false, error: 'workshopId is required' });
      }

      const orderIds = Array.isArray(idsParam) ? idsParam.map(Number) : [Number(idsParam)];

      // Reuse the bulk logic
      req.body = { orderIds, workshopId };
      // Fall through to the shared logic
      const workshop = await getWorkshopById(workshopId);
      if (!workshop) {
        return res.status(404).json({ success: false, error: 'Workshop not found' });
      }

      for (const orderId of orderIds) {
        await updateOrder(orderId, {
          workshopId: workshop.id,
          workshopName: workshop.fullCompanyName,
          country: workshop.country || null
        });
      }

      const orders = [];
      for (const orderId of orderIds) {
        const o = await getOrderById(orderId);
        if (o) orders.push(o);
      }

      if (orders.length === 0) {
        return res.status(404).json({ success: false, error: 'No valid orders found' });
      }

      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        if (i > 0) doc.addPage();

        const qrData = JSON.stringify({
          orderSeq: order.orderSeq, productType: order.productType,
          quantity: order.quantity, country: workshop.country || '', customerName: order.customerName
        });
        const qrBuffer = await QRCode.toBuffer(qrData, { width: 150, margin: 1, errorCorrectionLevel: 'H' });
        doc.image(qrBuffer, 420, 40, { width: 120 });

        doc.fontSize(18).fillColor('#1a1a1a').text(`${order.quotationSeq || order.orderSeq}`, 50, 50);
        doc.fontSize(10).fillColor('#666').text(`Order: ${order.orderSeq}`, 50, 75).text(`Created: ${new Date(order.dateCreated).toLocaleDateString()}`, 50, 88);
        doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#ddd').stroke();

        let y = 125;
        const lw = 130;
        doc.fontSize(11).fillColor('#333');
        doc.font('Helvetica-Bold').text('Customer:', 50, y); doc.font('Helvetica').text(order.customerName || '-', 50 + lw, y); y += 18;
        if (order.contactPerson) { doc.font('Helvetica-Bold').text('Contact:', 50, y); doc.font('Helvetica').text(order.contactPerson, 50 + lw, y); y += 18; }
        doc.font('Helvetica-Bold').text('Factory:', 50, y); doc.font('Helvetica').text(workshop.fullCompanyName, 50 + lw, y); y += 18;
        if (workshop.country) { doc.font('Helvetica-Bold').text('Country:', 50, y); doc.font('Helvetica').text(workshop.country, 50 + lw, y); y += 18; }
        doc.font('Helvetica-Bold').text('Product Type:', 50, y); doc.font('Helvetica').text(order.productType || '-', 50 + lw, y); y += 18;
        doc.font('Helvetica-Bold').text('Quantity:', 50, y); doc.font('Helvetica').text(String(order.quantity || '-'), 50 + lw, y); y += 18;
        doc.font('Helvetica-Bold').text('Unit Price:', 50, y); doc.font('Helvetica').text(String(order.unitPrice || '-'), 50 + lw, y); y += 18;
        doc.font('Helvetica-Bold').text('Total:', 50, y); doc.font('Helvetica').text(String(order.total || '-'), 50 + lw, y); y += 25;

        if (order.productDetails && Object.keys(order.productDetails).length > 0) {
          doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke(); y += 10;
          doc.font('Helvetica-Bold').fontSize(12).fillColor('#333').text('Product Details', 50, y); y += 20;
          doc.font('Helvetica').fontSize(10).fillColor('#444');
          for (const [key, value] of Object.entries(order.productDetails)) {
            if (y > 720) { doc.addPage(); y = 50; }
            const dk = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
            const dv = typeof value === 'object' ? JSON.stringify(value) : String(value);
            doc.font('Helvetica-Bold').text(`${dk}:`, 60, y, { width: 150 });
            doc.font('Helvetica').text(dv, 220, y, { width: 320 }); y += 16;
          }
        }

        doc.fontSize(8).fillColor('#999').text(`Generated: ${new Date().toISOString()}`, 50, 760).text(`${order.orderSeq} | ${order.quotationSeq || ''}`, 50, 772);
      }

      const filename = orders.length === 1 ? `${orders[0].orderSeq}.pdf` : `orders-${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      doc.pipe(res);
      doc.end();
    } catch (error) {
      console.error('Error generating export:', error);
      res.status(500).json({ success: false, error: 'Failed to generate PDF: ' + error.message });
    }
  });

  // Bulk PDF generation with factory selection (POST, for API clients)
  router.post('/generate-document', async (req, res) => {
    try {
      const { orderIds, workshopId } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ success: false, error: 'orderIds array is required' });
      }
      if (!workshopId) {
        return res.status(400).json({ success: false, error: 'workshopId is required' });
      }

      const workshop = await getWorkshopById(workshopId);
      if (!workshop) {
        return res.status(404).json({ success: false, error: 'Workshop not found' });
      }

      // Update each order with workshop info
      for (const orderId of orderIds) {
        await updateOrder(orderId, {
          workshopId: workshop.id,
          workshopName: workshop.fullCompanyName,
          country: workshop.country || null
        });
      }

      // Fetch updated orders
      const orders = [];
      for (const orderId of orderIds) {
        const o = await getOrderById(orderId);
        if (o) orders.push(o);
      }

      if (orders.length === 0) {
        return res.status(404).json({ success: false, error: 'No valid orders found' });
      }

      // Generate PDF
      const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });

      for (let i = 0; i < orders.length; i++) {
        const order = orders[i];

        if (i > 0) doc.addPage();

        // QR code in top-right corner
        const qrData = JSON.stringify({
          orderSeq: order.orderSeq,
          productType: order.productType,
          quantity: order.quantity,
          country: workshop.country || '',
          customerName: order.customerName
        });
        const qrBuffer = await QRCode.toBuffer(qrData, { width: 150, margin: 1, errorCorrectionLevel: 'H' });
        doc.image(qrBuffer, 420, 40, { width: 120 });

        // Header
        doc.fontSize(18).fillColor('#1a1a1a')
          .text(`${order.quotationSeq || order.orderSeq}`, 50, 50);

        doc.fontSize(10).fillColor('#666')
          .text(`Order: ${order.orderSeq}`, 50, 75)
          .text(`Created: ${new Date(order.dateCreated).toLocaleDateString()}`, 50, 88);

        // Separator line
        doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#ddd').stroke();

        // Order details
        let y = 125;
        const labelWidth = 130;

        doc.fontSize(11).fillColor('#333');

        doc.font('Helvetica-Bold').text('Customer:', 50, y);
        doc.font('Helvetica').text(order.customerName || '-', 50 + labelWidth, y);
        y += 18;

        if (order.contactPerson) {
          doc.font('Helvetica-Bold').text('Contact:', 50, y);
          doc.font('Helvetica').text(order.contactPerson, 50 + labelWidth, y);
          y += 18;
        }

        doc.font('Helvetica-Bold').text('Factory:', 50, y);
        doc.font('Helvetica').text(workshop.fullCompanyName, 50 + labelWidth, y);
        y += 18;

        if (workshop.country) {
          doc.font('Helvetica-Bold').text('Country:', 50, y);
          doc.font('Helvetica').text(workshop.country, 50 + labelWidth, y);
          y += 18;
        }

        doc.font('Helvetica-Bold').text('Product Type:', 50, y);
        doc.font('Helvetica').text(order.productType || '-', 50 + labelWidth, y);
        y += 18;

        doc.font('Helvetica-Bold').text('Quantity:', 50, y);
        doc.font('Helvetica').text(String(order.quantity || '-'), 50 + labelWidth, y);
        y += 18;

        doc.font('Helvetica-Bold').text('Unit Price:', 50, y);
        doc.font('Helvetica').text(String(order.unitPrice || '-'), 50 + labelWidth, y);
        y += 18;

        doc.font('Helvetica-Bold').text('Total:', 50, y);
        doc.font('Helvetica').text(String(order.total || '-'), 50 + labelWidth, y);
        y += 25;

        // Product details table
        if (order.productDetails && Object.keys(order.productDetails).length > 0) {
          doc.moveTo(50, y).lineTo(545, y).strokeColor('#ddd').stroke();
          y += 10;
          doc.font('Helvetica-Bold').fontSize(12).fillColor('#333').text('Product Details', 50, y);
          y += 20;

          doc.font('Helvetica').fontSize(10).fillColor('#444');
          for (const [key, value] of Object.entries(order.productDetails)) {
            if (y > 720) {
              doc.addPage();
              y = 50;
            }
            const displayKey = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
            const displayVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
            doc.font('Helvetica-Bold').text(`${displayKey}:`, 60, y, { width: 150 });
            doc.font('Helvetica').text(displayVal, 220, y, { width: 320 });
            y += 16;
          }
        }

        // Footer
        const footerY = 760;
        doc.fontSize(8).fillColor('#999')
          .text(`Generated: ${new Date().toISOString()}`, 50, footerY)
          .text(`${order.orderSeq} | ${order.quotationSeq || ''}`, 50, footerY + 12);
      }

      // Send PDF
      const filename = orders.length === 1
        ? `${orders[0].orderSeq}.pdf`
        : `orders-${new Date().toISOString().slice(0, 10)}.pdf`;

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      doc.pipe(res);
      doc.end();
    } catch (error) {
      console.error('Error generating PDF:', error);
      res.status(500).json({ success: false, error: 'Failed to generate PDF' });
    }
  });

  // ===== BULK OPERATIONS =====

  // Soft-delete (cancel) orders — single or bulk
  router.post('/bulk-cancel', async (req, res) => {
    try {
      const { orderIds } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ success: false, error: 'orderIds array is required' });
      }

      const now = new Date().toISOString();
      let updatedCount = 0;
      for (const orderId of orderIds) {
        const existing = await getOrderById(orderId);
        if (existing && existing.status !== 'cancelled') {
          await updateOrder(orderId, { status: 'cancelled' });
          updatedCount++;
        }
      }

      res.json({ success: true, updatedCount });
    } catch (error) {
      console.error('Error cancelling orders:', error);
      res.status(500).json({ success: false, error: 'Failed to cancel orders' });
    }
  });

  // Bulk scan update — update department/status for multiple orders
  router.post('/bulk-scan-update', async (req, res) => {
    try {
      const { orderIds, department, status } = req.body;
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ success: false, error: 'orderIds array is required' });
      }
      if (!department) {
        return res.status(400).json({ success: false, error: 'department is required' });
      }

      const results = [];
      const errors = [];

      for (const orderId of orderIds) {
        const order = await getOrderById(orderId);
        if (!order) {
          errors.push({ orderId, error: 'Order not found' });
          continue;
        }

        const scanResult = await recordOrderDepartmentScan(order.orderSeq, department, `Bulk scan update`);
        if (scanResult.error) {
          errors.push({ orderId, orderSeq: order.orderSeq, error: scanResult.error });
        } else {
          results.push({ orderId, orderSeq: order.orderSeq, department, status: scanResult.status || status });
        }
      }

      res.json({ success: true, updatedCount: results.length, results, errors });
    } catch (error) {
      console.error('Error bulk scan update:', error);
      res.status(500).json({ success: false, error: 'Failed to bulk update orders' });
    }
  });

  // Export orders to Excel
  router.get('/export-excel', async (req, res) => {
    try {
      const ExcelJS = (await import('exceljs')).default;
      const statusFilter = req.query.status || '';
      const searchFilter = (req.query.search || '').toLowerCase().trim();

      let orders = await getAllOrders();

      if (statusFilter) {
        orders = orders.filter(o => o.status === statusFilter);
      }
      if (searchFilter) {
        orders = orders.filter(o =>
          (o.orderSeq || '').toLowerCase().includes(searchFilter) ||
          (o.quotationSeq || '').toLowerCase().includes(searchFilter) ||
          (o.customerName || '').toLowerCase().includes(searchFilter) ||
          (o.customerItemName || '').toLowerCase().includes(searchFilter) ||
          (o.workshopName || '').toLowerCase().includes(searchFilter)
        );
      }

      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet('Orders');

      const columns = [
        { header: 'PO#', key: 'orderSeq', width: 14 },
        { header: 'IP/OS Ref', key: 'quotationSeq', width: 14 },
        { header: 'Customer', key: 'customerName', width: 18 },
        { header: 'Item', key: 'customerItemName', width: 18 },
        { header: 'Product Type', key: 'productType', width: 14 },
        { header: 'Qty', key: 'quantity', width: 10 },
        { header: 'Unit Price', key: 'unitPrice', width: 12 },
        { header: 'Total', key: 'total', width: 12 },
        { header: 'Factory', key: 'workshopName', width: 20 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Department', key: 'currentDepartment', width: 14 },
        { header: 'Created', key: 'dateCreated', width: 14 }
      ];

      ws.columns = columns;

      // Style header
      const hdr = ws.getRow(1);
      hdr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
      hdr.alignment = { vertical: 'middle', horizontal: 'center' };
      hdr.height = 22;

      for (const order of orders) {
        ws.addRow({
          orderSeq: order.orderSeq,
          quotationSeq: order.quotationSeq || '-',
          customerName: order.customerName || '-',
          customerItemName: order.customerItemName || '-',
          productType: order.productType || '-',
          quantity: order.quantity,
          unitPrice: order.unitPrice,
          total: order.total,
          workshopName: order.workshopName || '-',
          status: order.status,
          currentDepartment: order.currentDepartment || '-',
          dateCreated: order.dateCreated ? new Date(order.dateCreated).toLocaleDateString() : '-'
        });
      }

      const filename = `orders-${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error('Error exporting orders to Excel:', error);
      res.status(500).json({ success: false, error: 'Failed to export orders' });
    }
  });

  // ===== PROGRESS TRACKING (for Android & Web) =====

  // Record department scan
  router.post('/progress/scan', async (req, res) => {
    try {
      const { orderSeq, department, notes } = req.body;
      if (!orderSeq || !department) {
        return res.status(400).json({ success: false, error: 'orderSeq and department are required' });
      }

      const result = await recordOrderDepartmentScan(orderSeq, department, notes || null);

      if (result.error) {
        return res.status(result.code || 400).json({
          success: false,
          error: result.error,
          lastDepartment: result.lastDepartment,
          attemptedDepartment: result.attemptedDepartment,
          nextExpected: result.nextExpected
        });
      }

      res.json({ success: true, message: 'Scan recorded', data: result });
    } catch (error) {
      console.error('Error recording scan:', error);
      res.status(500).json({ success: false, error: 'Failed to record scan' });
    }
  });

  // Get last scan for an order
  router.get('/progress/:orderSeq/last', async (req, res) => {
    try {
      const lastScan = await getLastOrderScan(req.params.orderSeq);
      if (!lastScan) {
        return res.json({ success: true, lastScan: null });
      }
      res.json({ success: true, lastScan });
    } catch (error) {
      console.error('Error fetching last scan:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch last scan' });
    }
  });

  // Get full progress history for an order
  router.get('/progress/:orderSeq', async (req, res) => {
    try {
      const progress = await getOrderProgress(req.params.orderSeq);
      const order = await getOrderBySeq(req.params.orderSeq);

      res.json({
        success: true,
        progress,
        order: order ? {
          orderSeq: order.orderSeq,
          quotationSeq: order.quotationSeq,
          customerName: order.customerName,
          productType: order.productType,
          currentDepartment: order.currentDepartment,
          status: order.status
        } : null
      });
    } catch (error) {
      console.error('Error fetching progress:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch progress' });
    }
  });

  return router;
}
