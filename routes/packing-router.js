const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.post('/pdf', async (req, res) => {
  const data = req.body;
  const doc = new PDFDocument({ size: [648, 396], margin: 40 }); // 9 x 5.5 inch in points

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
  const fontPathBold = path.join(__dirname, '../fonts/THSarabunNewBold.ttf');
  if (fs.existsSync(fontPath)) doc.registerFont('thai', fontPath).font('thai');
  if (fs.existsSync(fontPathBold)) doc.registerFont('thai-bold', fontPathBold);

  // โลโก้บริษัท
  const logoPath = path.join(__dirname, '../picture/S__5275654png (1).png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 40, 30, { width: 60 });
  }

  doc.font('thai-bold').fontSize(16).text('ใบสรุปค่าแพ็คทุเรียน / Durian Packing Cost Summary', { align: 'center' });

  doc.moveDown();
  doc.fontSize(12).font('thai').text(`วันที่: ${data.date}`);
  doc.moveDown();

  doc.fontSize(14).font('thai-bold').text('รายละเอียดค่าแพ็ค:', { underline: false });

  const totalBig = data.bigBox.quantity * data.bigBox.pricePerBox;
  const totalSmall = data.smallBox.quantity * data.smallBox.pricePerBox;
  const total = totalBig + totalSmall;
  const remaining = total - data.deduction;

  doc.fontSize(14).font('thai').text(`กล่องใหญ่: ${data.bigBox.quantity} กล่อง × ${data.bigBox.pricePerBox} บาท = ${totalBig.toLocaleString()} บาท`);
  doc.text(`กล่องเล็ก: ${data.smallBox.quantity} กล่อง × ${data.smallBox.pricePerBox} บาท = ${totalSmall.toLocaleString()} บาท`);
  doc.moveDown();

  doc.text(`รวมค่ากล่อง: ${total.toLocaleString()} บาท`, { continued: false });
  doc.text(`หักค่าของ / หักเบิก: ${data.deduction.toLocaleString()} บาท`);
  doc.fontSize(14).font('thai-bold').text(`คงเหลือที่ต้องจ่าย: ${remaining.toLocaleString()} บาท`, { underline: false });

  doc.moveDown(3);
  doc.font('thai').text(
    '......................................................                  ......................................................',
    { align: 'center' }
  );
  doc.text(
    'ผู้จ่ายเงิน / Paid By                                            ผู้รับเงิน / Received By',
    { align: 'center' }
  );

  doc.end();
});

module.exports = router;
