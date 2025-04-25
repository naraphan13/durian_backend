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
  doc.fontSize(14).font('thai').text(`วันที่: ${data.date}`);
  doc.moveDown();

  doc.fontSize(20).font('thai-bold').text('รายละเอียดค่าขึ้นตู้:', { underline: false });

  let total = 0;
  data.containers.forEach((c, i) => {
    total += c.price;
    const label = c.label?.trim() || `ตู้ที่ ${i + 1}`;
    doc.fontSize(20).font('thai').text(`${label}: ${c.containerCode} × ${c.price.toLocaleString()} บาท`);
  });

  doc.moveDown();
  doc.fontSize(20).font('thai-bold').text(`รวมทั้งหมด: ${total.toLocaleString()} บาท`, { underline: false });

  doc.moveDown();
  doc.fontSize(15).font('thai').text(
    '......................................................                  ......................................................',
    { align: 'center' }
  );
  doc.text(
    'ผู้จ่ายเงิน / Paid By                                            ผู้รับเงิน / Received By',
    { align: 'center' }
  );

  doc.end();
});





















// POST เพิ่มข้อมูล
router.post('/', async (req, res) => {
  try {
    const data = await prisma.containerLoading.create({ data: req.body });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'บันทึกข้อมูลไม่สำเร็จ', details: err });
  }
});

// GET ดูทั้งหมด
router.get('/', async (req, res) => {
  try {
    const data = await prisma.containerLoading.findMany({ orderBy: { date: 'desc' } });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ', details: err });
  }
});

// GET ดูทีละ id
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.containerLoading.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'ไม่พบข้อมูล', details: err });
  }
});

// PUT แก้ไข
router.put('/:id', async (req, res) => {
  try {
    const updated = await prisma.containerLoading.update({
      where: { id: parseInt(req.params.id) },
      data: req.body,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'แก้ไขข้อมูลไม่สำเร็จ', details: err });
  }
});

// DELETE ลบ
router.delete('/:id', async (req, res) => {
  try {
    await prisma.containerLoading.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: 'ลบไม่สำเร็จ', details: err });
  }
});

// ✅ GET พิมพ์ PDF (ตามรูปแบบที่คุณส่งมา)
router.get('/:id/pdf', async (req, res) => {
  try {
    const data = await prisma.containerLoading.findUnique({
      where: { id: parseInt(req.params.id) },
    });

    if (!data) return res.status(404).send('ไม่พบข้อมูล');

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
    doc.fontSize(14).font('thai').text(`วันที่: ${data.date}`);
    doc.moveDown();

    doc.fontSize(20).font('thai-bold').text('รายละเอียดค่าขึ้นตู้:', { underline: false });

    let total = 0;
    (data.containers || []).forEach((c, i) => {
      total += c.price;
      const label = c.label?.trim() || `ตู้ที่ ${i + 1}`;
      doc.fontSize(20).font('thai').text(`${label}: ${c.containerCode} × ${c.price.toLocaleString()} บาท`);
    });

    doc.moveDown();
    doc.fontSize(20).font('thai-bold').text(`รวมทั้งหมด: ${total.toLocaleString()} บาท`, { underline: false });

    doc.moveDown();
    doc.fontSize(15).font('thai').text(
      '......................................................                  ......................................................',
      { align: 'center' }
    );
    doc.text(
      'ผู้จ่ายเงิน / Paid By                                            ผู้รับเงิน / Received By',
      { align: 'center' }
    );

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'สร้าง PDF ไม่สำเร็จ', details: err });
  }
});

module.exports = router;