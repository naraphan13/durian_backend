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

    const result = packings.map(p => {
      const totalBig = p.bigBoxQuantity * p.bigBoxPrice;
      const totalSmall = p.smallBoxQuantity * p.smallBoxPrice;
      const totalBeforeDeduction = totalBig + totalSmall;

      const totalDeduction = Array.isArray(p.deductions)
        ? p.deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0)
        : 0;

      const totalExtraExpense = Array.isArray(p.extraExpenses)
        ? p.extraExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
        : 0;

      return {
        ...p,
        totalBeforeDeduction,
        totalDeduction,
        totalExtraExpense,
        finalTotal: totalBeforeDeduction - totalDeduction - totalExtraExpense,
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

    if (!data) return res.status(404).json({ error: "ไม่พบข้อมูล" });

    const doc = new PDFDocument({
      size: [396, 648], // ✅ คงขนาดเดิม
      margin: 20,
      layout: "landscape",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="packing-${data.id}.pdf"`);
    doc.pipe(res);

    // ===== FONT =====
    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath);
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    // ===== HEADER =====
    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const logoSize = 60;
    const topY = 18;
    const logoX = 20;
    const logoY = topY + 8;
    const companyX = logoX + logoSize + 12;
    const billInfoX = companyX + 240;

    const rawDate = data.date ? new Date(data.date) : new Date();
    const safeDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

    const dateStr = new Intl.DateTimeFormat("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(safeDate);

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }

    doc.font("thai").fontSize(12).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.text(
      "เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190",
      companyX,
      topY + 16
    );
    doc.text(
      "โทร: 081-078-2324 , 082-801-1225 , 095-905-5588",
      companyX,
      topY + 32
    );

    const recipient = data.recipient || "__________";

    doc.text(`รหัสบิล: ${data.id}    จ่ายให้: ${recipient}`, billInfoX, topY);
    doc.text(`โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร`, billInfoX, topY + 16);
    doc.text(`เพื่อชำระ: ค่าบริการแพ็คทุเรียน`, billInfoX, topY + 32);
    doc.text(`วันที่: ${dateStr}`, billInfoX, topY + 48);

    // ===== TITLE =====
    doc.font("thai-bold").fontSize(17).text(
      "ใบสำคัญจ่าย PAYMENT VOUCHER",
      0,
      88,
      { align: "center", width: doc.page.width }
    );

    // ===== DATA =====
    const deductions = Array.isArray(data.deductions) ? data.deductions : [];
    const extraExpenses = Array.isArray(data.extraExpenses) ? data.extraExpenses : [];

    const totalBig =
      (Number(data.bigBoxQuantity) || 0) * (Number(data.bigBoxPrice) || 0);
    const totalSmall =
      (Number(data.smallBoxQuantity) || 0) * (Number(data.smallBoxPrice) || 0);
    const total = totalBig + totalSmall;

    let totalDeduction = 0;
    let totalExtraExpense = 0;

    deductions.forEach((d) => {
      totalDeduction += Number(d.amount) || 0;
    });

    extraExpenses.forEach((e) => {
      totalExtraExpense += Number(e.amount) || 0;
    });

    const finalTotal = total - totalDeduction - totalExtraExpense;

    // ===== LAYOUT 2 COLUMN =====
    const leftX = 20;
    const rightX = 305;
    const leftWidth = 255;
    const rightWidth = 250;

    let leftY = 122;
    let rightY = 122;

    const leftLine = (text, opts = {}) => {
      const fontSize = opts.size || 15;
      const lineGap = opts.lineGap ?? 2;

      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(fontSize)
        .text(text, leftX + (opts.indent || 0), leftY, {
          width: leftWidth - (opts.indent || 0),
          lineGap,
        });

      const height = doc.heightOfString(text, {
        width: leftWidth - (opts.indent || 0),
        lineGap,
      });

      leftY += height + (opts.afterGap ?? 6);
    };

    const rightLine = (text, opts = {}) => {
      const fontSize = opts.size || 14;
      const lineGap = opts.lineGap ?? 1;

      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(fontSize)
        .text(text, rightX + (opts.indent || 0), rightY, {
          width: rightWidth - (opts.indent || 0),
          lineGap,
        });

      const height = doc.heightOfString(text, {
        width: rightWidth - (opts.indent || 0),
        lineGap,
      });

      rightY += height + (opts.afterGap ?? 5);
    };

    // ===== LEFT COLUMN =====
    leftLine("ใบสรุปค่าแพ็คทุเรียน", { size: 16, afterGap: 4 });
    leftLine("รายละเอียดค่าแพ็ค:", { bold: true, size: 16, afterGap: 6 });

    leftLine(
      `กล่องใหญ่: ${Number(data.bigBoxQuantity || 0).toLocaleString()} × ${Number(
        data.bigBoxPrice || 0
      ).toLocaleString()} = ${totalBig.toLocaleString()} บาท`,
      { size: 15, afterGap: 5 }
    );

    leftLine(
      `กล่องเล็ก: ${Number(data.smallBoxQuantity || 0).toLocaleString()} × ${Number(
        data.smallBoxPrice || 0
      ).toLocaleString()} = ${totalSmall.toLocaleString()} บาท`,
      { size: 15, afterGap: 8 }
    );

    leftLine("สรุปยอด:", { bold: true, size: 16, afterGap: 6 });
    leftLine(`รวมทั้งหมด: ${total.toLocaleString()} บาท`, { bold: true, afterGap: 4 });

    if (totalDeduction > 0) {
      leftLine(`หักเบิก: ${totalDeduction.toLocaleString()} บาท`, {
        bold: true,
        afterGap: 4,
      });
    }

    if (totalExtraExpense > 0) {
      leftLine(`ค่าใช้จ่ายอื่น: ${totalExtraExpense.toLocaleString()} บาท`, {
        bold: true,
        afterGap: 4,
      });
    }

    leftLine(`คงเหลือสุทธิ: ${finalTotal.toLocaleString()} บาท`, {
      bold: true,
      size: 17,
      afterGap: 6,
    });

    // ===== RIGHT COLUMN =====
    if (deductions.length > 0) {
      rightLine("รายละเอียดรายการหัก:", {
        bold: true,
        size: 15,
        afterGap: 6,
      });

      deductions.forEach((d, i) => {
        rightLine(
          `${i + 1}. ${d.label || "-"} : ${(Number(d.amount) || 0).toLocaleString()} บาท`,
          { size: 14, indent: 8, afterGap: 4 }
        );
      });

      rightY += 6;
    }

    if (extraExpenses.length > 0) {
      rightLine("รายละเอียดค่าใช้จ่ายอื่นๆ:", {
        bold: true,
        size: 15,
        afterGap: 6,
      });

      extraExpenses.forEach((e, i) => {
        rightLine(
          `${i + 1}. ${e.label || "-"} : ${(Number(e.amount) || 0).toLocaleString()} บาท`,
          { size: 14, indent: 8, afterGap: 4 }
        );
      });
    }

    // ===== CENTER DIVIDER =====
    doc
      .moveTo(292, 116)
      .lineTo(292, doc.page.height - 78)
      .strokeColor("#999999")
      .lineWidth(0.5)
      .stroke();

    // ===== SIGNATURE =====
    const signatureBaseY = doc.page.height - 62;

    doc.font("thai").fontSize(11).text(
      "...............................................",
      40,
      signatureBaseY
    );
    doc.font("thai").fontSize(11).text("ผู้จ่ายเงิน", 40, signatureBaseY + 12);
    doc.font("thai").fontSize(11).text(
      "ลงวันที่: ........../........../..........",
      40,
      signatureBaseY + 26
    );

    doc.font("thai").fontSize(11).text(
      "...............................................",
      340,
      signatureBaseY
    );
    doc.font("thai").fontSize(11).text("ผู้รับเงิน", 340, signatureBaseY + 12);
    doc.font("thai").fontSize(11).text(
      "ลงวันที่: ........../........../..........",
      340,
      signatureBaseY + 26
    );

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการสร้าง PDF", details: err });
  }
});

module.exports = router;