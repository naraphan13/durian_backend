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

router.get('/', async (req, res) => {
  try {
    const packings = await prisma.packing.findMany({
      orderBy: { date: 'desc' },
    });

    const result = packings.map((p) => {
      const totalBig = (Number(p.bigBoxQuantity) || 0) * (Number(p.bigBoxPrice) || 0);
      const totalSmall = (Number(p.smallBoxQuantity) || 0) * (Number(p.smallBoxPrice) || 0);
      const totalBeforeDeduction = totalBig + totalSmall;

      const deductions = Array.isArray(p.deductions) ? p.deductions : [];
      const extraExpenses = Array.isArray(p.extraExpenses) ? p.extraExpenses : [];

      const totalDeduction = deductions.reduce(
        (sum, d) => sum + (Number(d.amount) || 0),
        0
      );

      const totalExtraExpense = extraExpenses.reduce(
        (sum, e) => sum + (Number(e.amount) || 0),
        0
      );

      // ✅ extraExpenses คือจ่ายเพิ่มให้เขา
      const finalTotal = totalBeforeDeduction - totalDeduction + totalExtraExpense;

      return {
        ...p,
        totalBeforeDeduction,
        totalDeduction,
        totalExtraExpense,
        finalTotal,
      };
    });

    res.json(result);
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
    console.log('err', err);
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

router.post("/:id/pdf", async (req, res) => {
  try {
    const data = await prisma.packing.findUnique({
      where: { id: parseInt(req.params.id) },
    });

    if (!data) {
      return res.status(404).json({ error: "ไม่พบข้อมูล" });
    }

    const doc = new PDFDocument({
      size: [396, 648],
      margin: 20,
      layout: "landscape",
    });

    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    // ===== FONT =====
    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");

    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath);
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    // ===== HEADER =====
    const rawDate = data.date ? new Date(data.date) : new Date();
    const dateStr = new Intl.DateTimeFormat("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(rawDate);

    doc.font("thai-bold").fontSize(17).text(
      "ใบสำคัญจ่าย PAYMENT VOUCHER",
      0,
      40,
      { align: "center" }
    );

    doc.font("thai").fontSize(13).text(`วันที่: ${dateStr}`, 20, 80);

    // ===== DATA =====
    const deductions = Array.isArray(data.deductions) ? data.deductions : [];
    const extraExpenses = Array.isArray(data.extraExpenses) ? data.extraExpenses : [];

    const totalBig =
      (Number(data.bigBoxQuantity) || 0) *
      (Number(data.bigBoxPrice) || 0);

    const totalSmall =
      (Number(data.smallBoxQuantity) || 0) *
      (Number(data.smallBoxPrice) || 0);

    const total = totalBig + totalSmall;

    let totalDeduction = 0;
    let totalExtraExpense = 0;

    deductions.forEach((d) => {
      totalDeduction += Number(d.amount) || 0;
    });

    extraExpenses.forEach((e) => {
      totalExtraExpense += Number(e.amount) || 0;
    });

    const finalTotal = total - totalDeduction + totalExtraExpense;

    // ===== LAYOUT =====
    const leftX = 20;
    const rightX = 300;

    let leftY = 110;
    let rightY = 110;

    const leftLine = (text, size = 15, bold = false) => {
      doc
        .font(bold ? "thai-bold" : "thai")
        .fontSize(size)
        .text(text, leftX, leftY);
      leftY += 18;
    };

    const rightLine = (text, size = 14, bold = false) => {
      doc
        .font(bold ? "thai-bold" : "thai")
        .fontSize(size)
        .text(text, rightX, rightY);
      rightY += 16;
    };

    // ===== LEFT =====
    leftLine("รายละเอียดค่าแพ็ค", 16, true);

    leftLine(
      `กล่องใหญ่: ${data.bigBoxQuantity} × ${data.bigBoxPrice} = ${totalBig.toLocaleString()} บาท`
    );

    leftLine(
      `กล่องเล็ก: ${data.smallBoxQuantity} × ${data.smallBoxPrice} = ${totalSmall.toLocaleString()} บาท`
    );

    leftY += 10;

    leftLine("สรุปยอด", 16, true);

    leftLine(`รวม: ${total.toLocaleString()} บาท`, 15, true);

    leftLine(`สุทธิ: ${finalTotal.toLocaleString()} บาท`, 18, true);

    // ===== RIGHT =====
    if (deductions.length > 0) {
      rightLine("รายการหักเบิก", 15, true);

      deductions.forEach((d, i) => {
        rightLine(
          `${i + 1}. ${d.label || "-"} ${Number(d.amount).toLocaleString()} บาท`
        );
      });

      rightY += 10;

      // ✅ รวมหักเบิก (ย้ายมาขวา)
      rightLine(
        `รวมรายการหักเบิก: ${totalDeduction.toLocaleString()} บาท`,
        15,
        true
      );
    }

    if (extraExpenses.length > 0) {
      rightY += 10;

      rightLine("รายการจ่ายเพิ่ม", 15, true);

      extraExpenses.forEach((e, i) => {
        rightLine(
          `${i + 1}. ${e.label || "-"} ${Number(e.amount).toLocaleString()} บาท`
        );
      });

      rightY += 10;

      // ✅ รวมจ่ายเพิ่ม (ย้ายมาขวา)
      rightLine(
        `รวมจ่ายเพิ่มอื่นๆ: ${totalExtraExpense.toLocaleString()} บาท`,
        15,
        true
      );
    }

    // ===== เส้นกลาง =====
    doc
      .moveTo(280, 100)
      .lineTo(280, doc.page.height - 70)
      .stroke();

    // ===== SIGNATURE =====
    const signY = doc.page.height - 60;

    doc.font("thai").fontSize(12).text(
      "...............................................",
      40,
      signY
    );
    doc.text("ผู้จ่ายเงิน", 40, signY + 12);
    doc.text("ลงวันที่: ........../........../..........", 40, signY + 26);

    doc.text(
      "...............................................",
      300,
      signY
    );
    doc.text("ผู้รับเงิน", 300, signY + 12);
    doc.text("ลงวันที่: ........../........../..........", 300, signY + 26);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "error", details: err });
  }
});

module.exports = router;