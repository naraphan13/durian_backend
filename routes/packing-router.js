const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const prisma = require("../models/prisma");
const router = express.Router();


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
router.post("/:id/pdf", async (req, res) => {
  try {
    const data = await prisma.packing.findUnique({
      where: { id: parseInt(req.params.id) },
    });

    if (!data) return res.status(404).json({ error: "ไม่พบข้อมูล" });

    const doc = new PDFDocument({
      size: [396, 648], // A5 แนวนอน
      margin: 20,
      layout: "landscape",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="packing-${data.id}.pdf"`);
    doc.pipe(res);

    // โหลดฟอนต์
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

    // โลโก้
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }

    // ข้อมูลบริษัท (ซ้าย)
    doc.font("thai").fontSize(13).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.font("thai").fontSize(13).text(
      "เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190",
      companyX,
      topY + 18
    );
    doc.font("thai").fontSize(13).text(
      "โทร: 081-078-2324 , 082-801-1225 , 095-905-5588",
      companyX,
      topY + 36
    );

    // ข้อมูลบิล (ขวา)
    const recipient = data.recipient || "__________";
    doc.font("thai").fontSize(13).text(
      `รหัสบิล: ${data.id}    จ่ายให้: ${recipient}`,
      billInfoX,
      topY
    );
    doc.font("thai").fontSize(13).text(
      `โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร   เพื่อชำระ: ค่าบริการแพ็คทุเรียน`,
      billInfoX,
      topY + 18
    );
    doc.font("thai").fontSize(13).text(
      `วันที่: ${dateStr} เวลา: ${timeStr} น.`,
      billInfoX,
      topY + 36
    );

    // === TITLE CENTER ===
    doc.moveDown(0.5);
    doc.font("thai-bold").fontSize(17).text(
      "ใบสำคัญจ่าย PAYMENT VOUCHER",
      0,
      doc.y,
      { align: "center", width: doc.page.width }
    );

    // === รายการค่าแพ็ค ===
    doc.moveDown(0.2);
    doc.font("thai").fontSize(16).text("ใบสรุปค่าแพ็คทุเรียน", 20);
    doc.font("thai-bold").fontSize(16).text("รายละเอียดค่าแพ็ค:", 20);

    const totalBig = data.bigBoxQuantity * data.bigBoxPrice;
    const totalSmall = data.smallBoxQuantity * data.smallBoxPrice;
    const total = totalBig + totalSmall;

    doc.font("thai-bold").fontSize(16).text(
      `กล่องใหญ่: ${data.bigBoxQuantity} กล่อง × ${data.bigBoxPrice} บาท = ${totalBig.toLocaleString()} บาท`,
      20
    );
    doc.font("thai-bold").fontSize(16).text(
      `กล่องเล็ก: ${data.smallBoxQuantity} กล่อง × ${data.smallBoxPrice} บาท = ${totalSmall.toLocaleString()} บาท`,
      20
    );

    // === หักเบิก ===
    let totalDeduction = 0;
    const deductions = data.deductions || [];

    if (Array.isArray(deductions) && deductions.length > 0) {
      doc.moveDown(0.2);
      doc.font("thai-bold").fontSize(16).text("รายละเอียดรายการหัก:", 20);
      deductions.forEach((d, idx) => {
        totalDeduction += d.amount || 0;
        doc.font("thai").fontSize(16).text(`${idx + 1}. ${d.label || "-"}: ${d.amount.toLocaleString()} บาท`, 30);
      });
    }

    const finalTotal = total - totalDeduction;
    doc.moveDown(0.2);
    doc.font("thai-bold").fontSize(16).text(`รวมทั้งหมด: ${total.toLocaleString()} บาท`, 20);
    if (totalDeduction > 0) {
      doc.font("thai-bold").fontSize(16).text(`หักเบิก: ${totalDeduction.toLocaleString()} บาท`, 20);
      doc.font("thai-bold").fontSize(16).text(`คงเหลือหลังหัก: ${finalTotal.toLocaleString()} บาท`, 20);
    }

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
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการสร้าง PDF", details: err });
  }
});



module.exports = router;


