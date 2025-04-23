const express = require('express');
const PDFDocument = require('pdfkit');
const router = express.Router();

router.post('/export-pdf', (req, res) => {
  const data = req.body;
  const doc = new PDFDocument({ size: 'A4', margin: 50 });

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

  doc.fontSize(16).text('SURIYA 388 - Export Summary', { align: 'center' }).moveDown();
  doc.fontSize(12);
  doc.text(`Date: ${data.date}`);
  doc.text(`City: ${data.city}`);
  doc.text(`Container Info: ${data.containerInfo}`);
  doc.text(`Container Code: ${data.containerCode}`);
  doc.text(`Reference Code: ${data.refCode}`);
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Durian Items');
  doc.font('Helvetica');
  data.durianItems.forEach((item, i) => {
    const totalWeight = item.boxes * item.weightPerBox;
    const totalPrice = totalWeight * item.pricePerKg;
    doc.text(
      `${i + 1}. ${item.variety} (${item.grade}) - ${item.boxes} กล่อง x ${item.weightPerBox} กก. = ${totalWeight} กก. @${item.pricePerKg} = ${totalPrice.toLocaleString()} บาท`
    );
  });

  doc.moveDown().font('Helvetica-Bold').text('Handling Costs');
  doc.font('Helvetica');
  Object.entries(data.handlingCosts).forEach(([size, cost]) => {
    const total = cost.weight * cost.costPerKg;
    doc.text(`${size}: ${cost.quantity} กล่อง, ${cost.weight} กก. × ${cost.costPerKg} = ${total.toLocaleString()} บาท`);
  });

  doc.moveDown().font('Helvetica-Bold').text('Box Costs');
  doc.font('Helvetica');
  Object.entries(data.boxCosts).forEach(([size, box]) => {
    const total = box.quantity * box.unitCost;
    doc.text(`${size}: ${box.quantity} กล่อง × ${box.unitCost} = ${total.toLocaleString()} บาท`);
  });

  doc.moveDown().font('Helvetica-Bold').text(`Inspection Fee: ${data.inspectionFee.toLocaleString()} บาท`);
  doc.end();
});

module.exports = router;
