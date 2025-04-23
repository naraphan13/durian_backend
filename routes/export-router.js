const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.post('/exportpdf', async (req, res) => {
  const data = req.body;

  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  let buffers = [];
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {
    const pdfData = Buffer.concat(buffers);
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=export-${data.date}.pdf`,
      'Content-Length': pdfData.length,
    });
    res.end(pdfData);
  });

  // === ฟอนต์ไทย ===
  const fontPath = path.join(__dirname, '../fonts/THSarabunNew.ttf');
  const fontBold = path.join(__dirname, '../fonts/THSarabunNewBold.ttf');
  if (fs.existsSync(fontPath)) doc.registerFont('thai', fontPath).font('thai');
  if (fs.existsSync(fontBold)) doc.registerFont('thai-bold', fontBold);

  // === โลโก้บริษัท ===
  const logoPath = path.join(__dirname, '../picture/S__5275654png (1).png');
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 30, 30, { width: 60 });
  }

  // === หัวเอกสาร ===
  doc.fontSize(16).text('ใบส่งออกทุเรียน SURIYA 388 / Durian Export Invoice - SURIYA 388', 0, 30, { align: 'center' });
  doc.fontSize(12).text(`วันที่ / Date: ${data.date}`, 120, 100);
  doc.text(`ปลายทาง / Destination: ${data.city}`);
  doc.text(`ตู้ / Container: ${data.containerInfo}`);
  doc.text(`รหัสตู้ / Container Code: ${data.containerCode}`);
  doc.text(`รหัสอ้างอิง / Reference Code: ${data.refCode}`);
  doc.moveDown();

  // === รายการทุเรียน ===
  doc.font('thai-bold').text('รายการทุเรียน / Durian Items', { underline: true });
  doc.font('thai');
  data.durianItems.forEach((item, i) => {
    const totalWeight = item.boxes * item.weightPerBox;
    const totalPrice = totalWeight * item.pricePerKg;
    doc.text(`${i + 1}. ${item.variety} เกรด ${item.grade} | ${item.boxes} กล่อง × ${item.weightPerBox} กก. = ${totalWeight} กก. × ${item.pricePerKg} บาท = ${totalPrice.toLocaleString()} บาท`);
  });

  // === ค่าจัดการกล่อง ===
  doc.moveDown().font('thai-bold').text('ค่าจัดการกล่อง / Handling Costs');
  Object.entries(data.handlingCosts).forEach(([size, cost]) => {
    const totalWeight = cost.quantity * cost.weight;
    const total = totalWeight * cost.costPerKg;
    doc.font('thai').text(
      `${size}: ${cost.quantity} กล่อง × ${cost.weight} กก./กล่อง = ${totalWeight} กก. × ${cost.costPerKg} บาท = ${total.toLocaleString()} บาท`
    );
  });

  // === ค่ากล่อง ===
  doc.moveDown().font('thai-bold').text('ค่ากล่อง / Box Costs');
  Object.entries(data.boxCosts).forEach(([size, box]) => {
    const total = box.quantity * box.unitCost;
    doc.font('thai').text(`${size}: ${box.quantity} กล่อง × ${box.unitCost} = ${total.toLocaleString()} บาท`);
  });

  // === ค่าตรวจสาร ===
  doc.moveDown().font('thai-bold').text(`ค่าตรวจสาร / Inspection Fee: ${data.inspectionFee.toLocaleString()} บาท`);

  // === รวมยอดทั้งหมด ===
  let total = data.inspectionFee;
  Object.values(data.handlingCosts).forEach(c => {
    total += c.quantity * c.weight * c.costPerKg;
  });
  Object.values(data.boxCosts).forEach(c => {
    total += c.quantity * c.unitCost;
  });
  data.durianItems.forEach(d => {
    total += d.boxes * d.weightPerBox * d.pricePerKg;
  });

  doc.moveDown().font('thai-bold').text(`รวมยอด / Total: ${total.toLocaleString()} บาท`, { align: 'right' });

  // === สรุปกล่องตามแบรนด์ ===
  if (data.brandSummary?.trim()) {
    doc.moveDown(1);
    doc.font('thai-bold').fontSize(14).text('สรุปกล่องตามแบรนด์ / Brand-wise Box Summary', { underline: true });
    doc.moveDown(0.5);
    doc.font('thai').fontSize(12).text(data.brandSummary);
  }

  doc.end();
});

module.exports = router;
