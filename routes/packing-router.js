const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const prisma = require("../models/prisma");
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
      'Content-Disposition': `attachment; filename=packing-${data.date}.pdf`,
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

  doc.font('thai-bold').fontSize(16).text('ใบสรุปค่าแพ็คทุเรียน / Durian Packing Cost Summary', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).font('thai').text(`วันที่: ${data.date}`);
  doc.moveDown();

  const quantityBig = data.bigBox?.quantity || 0;
  const priceBig = data.bigBox?.pricePerBox || 0;
  const quantitySmall = data.smallBox?.quantity || 0;
  const priceSmall = data.smallBox?.pricePerBox || 0;

  const totalBig = quantityBig * priceBig;
  const totalSmall = quantitySmall * priceSmall;
  const total = totalBig + totalSmall;

  doc.fontSize(13).font('thai-bold').text('รายละเอียดค่าแพ็ค:', { underline: true });
  doc.font('thai-bold').text(`กล่องใหญ่: ${quantityBig} กล่อง × ${priceBig} บาท = ${totalBig.toLocaleString()} บาท`);
  doc.font('thai-bold').text(`กล่องเล็ก: ${quantitySmall} กล่อง × ${priceSmall} บาท = ${totalSmall.toLocaleString()} บาท`);

  doc.moveDown();

  let totalDeduction = 0;
  if (Array.isArray(data.deductions) && data.deductions.length > 0) {
    doc.fontSize(13).font('thai-bold').text('รายละเอียดหักเบิก:', { underline: true });
    data.deductions.forEach((d, idx) => {
      const label = d.label || '-';
      const amount = d.amount || 0;
      totalDeduction += amount;
      doc.font('thai-bold').text(`${idx + 1}. ${label}: ${amount.toLocaleString()} บาท`);
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






















// ✅ POST - บันทึกข้อมูลการแพ็ค
router.post('/', async (req, res) => {
  try {
    const packing = await prisma.packing.create({
      data: req.body,
    });
    res.json(packing);
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถบันทึกได้', details: err });
  }
});

// ✅ GET - ดึงข้อมูลการแพ็คทั้งหมด
router.get('/', async (req, res) => {
  try {
    const packings = await prisma.packing.findMany({
      orderBy: { date: 'desc' },
    });
    res.json(packings);
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลได้', details: err });
  }
});

// ✅ GET - ดึงข้อมูลการแพ็คตาม id
router.get('/:id', async (req, res) => {
  try {
    const packing = await prisma.packing.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    res.json(packing);
  } catch (err) {
    res.status(500).json({ error: 'ไม่พบข้อมูล', details: err });
  }
});

// ✅ PUT - แก้ไขข้อมูลการแพ็ค
router.put('/:id', async (req, res) => {
  try {
    const updated = await prisma.packing.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถอัปเดตได้', details: err });
  }
});

// ✅ DELETE - ลบข้อมูลการแพ็ค
router.delete('/:id', async (req, res) => {
  try {
    await prisma.packing.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: 'ไม่สามารถลบได้', details: err });
  }
});

// ✅ POST - พิมพ์ PDF จากข้อมูลการแพ็ค
router.post('/:id/pdf', async (req, res) => {
  try {
    const data = await prisma.packing.findUnique({
      where: { id: parseInt(req.params.id) },
    });

    if (!data) return res.status(404).json({ error: 'ไม่พบข้อมูล' });

    const doc = new PDFDocument({ size: [648, 396], margin: 40 });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename=packing-${data.date}.pdf`,
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

    doc.font('thai-bold').fontSize(16).text('ใบสรุปค่าแพ็คทุเรียน / Durian Packing Cost Summary', { align: 'center' });
    
    doc.fontSize(12).font('thai').text(`วันที่: ${data.date}`);
    doc.moveDown();

    const totalBig = data.bigBoxQuantity * data.bigBoxPrice;
    const totalSmall = data.smallBoxQuantity * data.smallBoxPrice;
    const total = totalBig + totalSmall;

    doc.font('thai-bold').fontSize(16).text('รายละเอียดค่าแพ็ค:', { underline: true });
    doc.font('thai').fontSize(16).text(`กล่องใหญ่: ${data.bigBoxQuantity} กล่อง × ${data.bigBoxPrice} บาท = ${totalBig.toLocaleString()} บาท`);
    doc.fontSize(16).text(`กล่องเล็ก: ${data.smallBoxQuantity} กล่อง × ${data.smallBoxPrice} บาท = ${totalSmall.toLocaleString()} บาท`);

    let totalDeduction = 0;
    const deductions = data.deductions || [];
    if (Array.isArray(deductions) && deductions.length > 0) {
      
      doc.font('thai-bold').fontSize(16).text('รายละเอียดหักเบิก:', { underline: true });
      deductions.forEach((d, idx) => {
        totalDeduction += d.amount || 0;
        doc.fontSize(16).font('thai').text(`${idx + 1}. ${d.label || '-'}: ${d.amount.toLocaleString()} บาท`);
      });
    }

    const finalTotal = total - totalDeduction;

    
    doc.fontSize(16).font('thai-bold').text(`รวมทั้งหมด: ${total.toLocaleString()} บาท`);
    if (totalDeduction > 0) {
      doc.fontSize(16).text(`หักเบิก: ${totalDeduction.toLocaleString()} บาท`);
      doc.fontSize(16).text(`คงเหลือหลังหัก: ${finalTotal.toLocaleString()} บาท`);
    }

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
  } catch (err) {
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้าง PDF', details: err });
  }
});






























module.exports = router;


