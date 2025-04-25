const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.post('/pdf', async (req, res) => {
  const data = req.body;
  const doc = new PDFDocument({ size: [648, 396], margin: 40 }); // 9x5.5 นิ้ว

  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {
    const pdfData = Buffer.concat(buffers);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=container-loading-${data.date}.pdf`,
      'Content-Length': pdfData.length,
    });
    res.end(pdfData);
  });

  const fontPath = path.join(__dirname, '../fonts/THSarabunNew.ttf');
  const fontPathBold = path.join(__dirname, '../fonts/THSarabunNewBold.ttf');
  if (fs.existsSync(fontPath)) doc.registerFont('thai', fontPath).font('thai');
  if (fs.existsSync(fontPathBold)) doc.registerFont('thai-bold', fontPathBold);

  const logoPath = path.join(__dirname, '../picture/S__5275654png (1).png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 40, 30, { width: 60 });
  }

  doc.font('thai-bold').fontSize(16).text('ใบสรุปค่าขึ้นตู้ทุเรียน / Durian Container Loading Cost Summary', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).font('thai').text(`วันที่: ${data.date}`);
  doc.moveDown();

  doc.fontSize(13).font('thai-bold').text('รายละเอียดค่าขึ้นตู้:', { underline: true });

  let total = 0;
  data.containers.forEach((c, i) => {
    total += c.price;
    const label = c.label?.trim() || `ตู้ที่ ${i + 1}`;
    doc.font('thai').text(`${label}: ${c.containerCode} × ${c.price.toLocaleString()} บาท`);
  });

  doc.moveDown();

  // แสดงรายการหักเบิก ถ้ามี
  let totalDeduction = 0;
  if (Array.isArray(data.deductions) && data.deductions.length > 0) {
    doc.fontSize(13).font('thai-bold').text('รายละเอียดหักเบิก:', { underline: true });
    data.deductions.forEach((d, idx) => {
      totalDeduction += d.amount;
      doc.font('thai').text(`${idx + 1}. ${d.label || '-'}: ${d.amount.toLocaleString()} บาท`);
    });
    doc.moveDown();
  }

  const finalTotal = total - totalDeduction;

  doc.font('thai-bold').text(`รวมทั้งหมด: ${total.toLocaleString()} บาท`, { continued: false });
  if (totalDeduction > 0) {
    doc.text(`หักเบิก: ${totalDeduction.toLocaleString()} บาท`, { continued: false });
    doc.text(`คงเหลือหลังหัก: ${finalTotal.toLocaleString()} บาท`, { underline: true });
  }

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