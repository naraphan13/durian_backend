const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.post('/pdf', async (req, res) => {
  const data = req.body;
  const doc = new PDFDocument({ size: 'A4', margin: 40 });

  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {
    const pdfData = Buffer.concat(buffers);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=packing-${data.date}.pdf`,
      'Content-Length': pdfData.length,
    });
    res.end(pdfData);
  });

  const fontPath = path.join(__dirname, '../fonts/THSarabunNew.ttf');
  if (fs.existsSync(fontPath)) doc.registerFont('thai', fontPath).font('thai');

  // โลโก้บริษัท
  const logoPath = path.join(__dirname, '../picture/S__5275654png (1).png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 40, 30, { width: 60 });
  }

  doc.fontSize(16).text('ใบสรุปค่าแพ็คทุเรียน / Durian Packing Cost Summary', { align: 'center' });

  doc.moveDown();
  doc.fontSize(12).text(`วันที่: ${data.date}`);
  doc.moveDown();

  doc.fontSize(13).text('รายละเอียดค่าแพ็ค:', { underline: true });

  const totalBig = data.bigBox.quantity * data.bigBox.pricePerBox;
  const totalSmall = data.smallBox.quantity * data.smallBox.pricePerBox;
  const total = totalBig + totalSmall;
  const remaining = total - data.deduction;

  doc.text(`กล่องใหญ่: ${data.bigBox.quantity} กล่อง × ${data.bigBox.pricePerBox} บาท = ${totalBig.toLocaleString()} บาท`);
  doc.text(`กล่องเล็ก: ${data.smallBox.quantity} กล่อง × ${data.smallBox.pricePerBox} บาท = ${totalSmall.toLocaleString()} บาท`);
  doc.moveDown();

  doc.text(`รวมค่ากล่อง: ${total.toLocaleString()} บาท`, { continued: false });
  doc.text(`หักค่าของ / หักเบิก: ${data.deduction.toLocaleString()} บาท`);
  doc.text(`คงเหลือที่ต้องจ่าย: ${remaining.toLocaleString()} บาท`, { underline: true });

  doc.moveDown(2);
  doc.text('......................................................', 72);
  doc.text('ผู้จ่ายเงิน / Paid By', 72);

  doc.text('......................................................', 350);
  doc.text('ผู้รับเงิน / Received By', 350);

  doc.end();
});

module.exports = router;
