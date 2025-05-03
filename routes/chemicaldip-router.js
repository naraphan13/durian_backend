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






















// POST เพิ่มข้อมูล
router.post('/', async (req, res) => {
  try {
    const data = await prisma.chemicalDip.create({ data: req.body });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'บันทึกข้อมูลไม่สำเร็จ', details: err });
  }
});

// GET ดูทั้งหมด
router.get('/', async (req, res) => {
  try {
    const data = await prisma.chemicalDip.findMany({ orderBy: { date: 'desc' } });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ', details: err });
  }
});

// GET ดูทีละ id
router.get('/:id', async (req, res) => {
  try {
    const item = await prisma.chemicalDip.findUnique({
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
    const updated = await prisma.chemicalDip.update({
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
    await prisma.chemicalDip.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.json({ message: 'ลบสำเร็จ' });
  } catch (err) {
    res.status(500).json({ error: 'ลบไม่สำเร็จ', details: err });
  }
});

router.get("/:id/pdf", async (req, res) => {
  try {
    const data = await prisma.chemicalDip.findUnique({
      where: { id: parseInt(req.params.id) },
    });

    if (!data) return res.status(404).send("ไม่พบข้อมูล");

    const doc = new PDFDocument({
      size: [396, 648],
      margin: 20,
      layout: "landscape",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="chemical-dip-${data.id}.pdf"`
    );
    doc.pipe(res);

    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath).font("thai");
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    // === HEADER ===
    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const logoSize = 70;
    const topY = 20;
    const logoX = 20;
    const logoY = topY + 10;
    const companyX = logoX + logoSize + 15;
    const billInfoX = companyX + 250;

    const date = new Date(data.date);
    const dateStr = new Intl.DateTimeFormat("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(date);
    const timeStr = new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Bangkok",
    }).format(date);

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }

    doc.font("thai").fontSize(13).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc
      .font("thai")
      .fontSize(13)
      .text("เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190", companyX, topY + 18);
    doc
      .font("thai")
      .fontSize(13)
      .text("โทร: 081-078-2324 , 082-801-1225 , 095-905-5588", companyX, topY + 36);

    // ข้อมูลบิล (ขวา)
    doc
      .font("thai")
      .fontSize(13)
      .text(`รหัสบิล: ${data.id}    จ่ายให้: __________`, billInfoX, topY);
    doc
      .font("thai")
      .fontSize(13)
      .text(
        `โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร   เพื่อชำระ: ค่าชุบน้ำยาทุเรียน`,
        billInfoX,
        topY + 18
      );
    doc
      .font("thai")
      .fontSize(13)
      .text(`วันที่: ${dateStr} เวลา: ${timeStr} น.`, billInfoX, topY + 36);

    // === TITLE CENTER ===
    doc.moveDown(0.5);
    doc.font("thai-bold").fontSize(17).text(
      "ใบสำคัญจ่าย PAYMENT VOUCHER",
      0,
      doc.y,
      { align: "center", width: doc.page.width }
    );

    // === รายละเอียดค่าใช้จ่าย ===
    doc.moveDown(1);
    doc.font("thai-bold").fontSize(16).text("รายละเอียดค่าชุบน้ำยา:", 20);
    doc.font("thai").fontSize(16).text("ใบสรุปค่าชุบน้ำยาทุเรียน Durian Chemical Dip Summary", 30);

    const total = data.weight * data.pricePerKg;

    doc
      .font("thai-bold")
      .fontSize(19)
      .text(`น้ำหนักทุเรียน: ${data.weight} ตัน`, 20);
    doc
      .font("thai-bold")
      .fontSize(19)
      .text(`ราคาต่อตัน: ${data.pricePerKg} บาท`, 20);
    doc
      .font("thai-bold")
      .fontSize(19)
      .text(`รวมทั้งหมด: ${total.toLocaleString()} บาท`, 20);

    // === ลายเซ็น ===
    const signatureBaseY = doc.page.height - 60;
    doc.fontSize(11).text("...............................................", 40, signatureBaseY);
    doc.fontSize(11).text("ผู้จ่ายเงิน", 40, signatureBaseY + 12);
    doc.fontSize(11).text("ลงวันที่: ........../........../..........", 40, signatureBaseY + 24);

    doc.fontSize(11).text("...............................................", 340, signatureBaseY);
    doc.fontSize(11).text("ผู้รับเงิน", 340, signatureBaseY + 12);
    doc.fontSize(11).text("ลงวันที่: ........../........../..........", 340, signatureBaseY + 24);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "สร้าง PDF ไม่สำเร็จ", details: err });
  }
});



module.exports = router;
