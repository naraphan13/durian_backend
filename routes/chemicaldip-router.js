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
      'Content-Disposition': `attachment; filename=chemical-dip-${data.date}.pdf`,
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

  doc.font('thai-bold').fontSize(16).text('ใบสรุปค่าชุบน้ำยาทุเรียน / Durian Chemical Dip Summary', { align: 'center' });

  doc.moveDown();
  doc.fontSize(12).font('thai').text(`วันที่: ${data.date}`);
  doc.moveDown();

  const total = data.weight * data.pricePerKg;

  doc.fontSize(15).font('thai-bold').text('รายละเอียดค่าชุบน้ำยา:', { underline: false });
  doc.fontSize(19).font('thai').text(`น้ำหนักทุเรียน: ${data.weight} ตัน`);
  doc.fontSize(19).text(`ราคาต่อตัน: ${data.pricePerKg} บาท`);
  doc.fontSize(19).text(`รวมทั้งหมด: ${total.toLocaleString()} บาท`, { underline: false });

  doc.moveDown();
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
