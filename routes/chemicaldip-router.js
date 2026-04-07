const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const prisma = require("../models/prisma");
const router = express.Router();

// POST
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
    const data = await prisma.chemicalDip.findMany({
      orderBy: { date: 'desc' }
    });

    const result = data.map((item) => {
      const total = (Number(item.weight) || 0) * (Number(item.pricePerKg) || 0);

      const deductions = Array.isArray(item.deductions) ? item.deductions : [];
      const extraExpenses = Array.isArray(item.extraExpenses) ? item.extraExpenses : [];

      const totalDeduction = deductions.reduce(
        (sum, d) => sum + (Number(d.amount) || 0),
        0
      );

      const totalExtraExpense = extraExpenses.reduce(
        (sum, e) => sum + (Number(e.amount) || 0),
        0
      );

      const finalTotal = total - totalDeduction + totalExtraExpense;

      return {
        ...item,
        total,
        totalDeduction,
        totalExtraExpense,
        finalTotal,
      };
    });

    res.json(result);
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

// PUT
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

// DELETE
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

// PDF
router.get("/:id/pdf", async (req, res) => {
  try {
    const data = await prisma.chemicalDip.findUnique({
      where: { id: parseInt(req.params.id) },
    });

    if (!data) {
      return res.status(404).json({ error: "ไม่พบข้อมูล" });
    }

    const doc = new PDFDocument({
      size: [396, 648],
      margin: 20,
      layout: "landscape",
      autoFirstPage: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="chemical-dip-${data.id}.pdf"`
    );

    doc.pipe(res);

    // ===== FONT =====
    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");

    if (fs.existsSync(fontPath)) {
      doc.registerFont("thai", fontPath);
    }
    if (fs.existsSync(fontBoldPath)) {
      doc.registerFont("thai-bold", fontBoldPath);
    }

    // ===== DATA =====
    const deductions = Array.isArray(data.deductions) ? data.deductions : [];
    const extraExpenses = Array.isArray(data.extraExpenses)
      ? data.extraExpenses
      : [];

    const weight = Number(data.weight) || 0;
    const pricePerKg = Number(data.pricePerKg) || 0;
    const total = weight * pricePerKg;

    let totalDeduction = 0;
    let totalExtraExpense = 0;

    deductions.forEach((d) => {
      totalDeduction += Number(d.amount) || 0;
    });

    extraExpenses.forEach((e) => {
      totalExtraExpense += Number(e.amount) || 0;
    });

    const finalTotal = total - totalDeduction + totalExtraExpense;

    // ===== HEADER =====
    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");

    const topY = 18;
    const logoSize = 60;
    const logoX = 20;
    const logoY = topY + 8;
    const companyX = logoX + logoSize + 12;
    const billInfoX = 355;
    const billInfoWidth = 190;

    const rawDate = data.date ? new Date(data.date) : new Date();
    const safeDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

    const dateStr = new Intl.DateTimeFormat("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(safeDate);

    const recipient = data.recipient || "__________";

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }

    doc.font("thai").fontSize(12).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.font("thai").fontSize(12).text(
      "เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190",
      companyX,
      topY + 16
    );
    doc.font("thai").fontSize(12).text(
      "โทร: 081-078-2324 , 082-801-1225 , 095-905-5588",
      companyX,
      topY + 32
    );

    doc.font("thai").fontSize(12).text(
      `รหัสบิล: ${data.id}    จ่ายให้: ${recipient}`,
      billInfoX,
      topY,
      { width: billInfoWidth }
    );

    doc.font("thai").fontSize(12).text(
      "โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร",
      billInfoX,
      topY + 16,
      { width: billInfoWidth }
    );

    doc.font("thai").fontSize(12).text(
      "เพื่อชำระ: ค่าชุบน้ำยาทุเรียน",
      billInfoX,
      topY + 32,
      { width: billInfoWidth }
    );

    doc.font("thai").fontSize(12).text(
      `วันที่: ${dateStr}`,
      billInfoX,
      topY + 48,
      { width: billInfoWidth }
    );

    // ===== TITLE =====
    doc.font("thai-bold").fontSize(17).text(
      "ใบสำคัญจ่าย PAYMENT VOUCHER",
      0,
      88,
      {
        align: "center",
        width: doc.page.width,
      }
    );

    // ===== CONTENT LAYOUT =====
    const leftX = 20;
    const rightX = 310;
    const leftWidth = 255;
    const rightWidth = 225;

    let leftY = 122;
    let rightY = 122;

    const maxContentBottom = 275;

    const leftLine = (text, opts = {}) => {
      const fontSize = opts.size || 15;
      const lineGap = opts.lineGap ?? 1;
      const width = opts.width || leftWidth;

      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(fontSize)
        .text(text, leftX, leftY, {
          width,
          lineGap,
        });

      const h = doc.heightOfString(text, {
        width,
        lineGap,
      });

      leftY += h + (opts.afterGap ?? 5);
    };

    const rightLine = (text, opts = {}) => {
      const fontSize = opts.size || 13;
      const lineGap = opts.lineGap ?? 1;
      const width = opts.width || rightWidth;

      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(fontSize)
        .text(text, rightX, rightY, {
          width,
          lineGap,
        });

      const h = doc.heightOfString(text, {
        width,
        lineGap,
      });

      rightY += h + (opts.afterGap ?? 4);
    };

    // ===== LEFT COLUMN =====
    leftLine("ใบสรุปค่าชุบน้ำยาทุเรียน", {
      size: 16,
      bold: false,
      afterGap: 3,
    });

    leftLine("รายละเอียดค่าชุบน้ำยา:", {
      size: 16,
      bold: true,
      afterGap: 5,
    });

    leftLine(
      `น้ำหนักทุเรียน: ${weight.toLocaleString()} ตัน`,
      {
        size: 15,
        afterGap: 4,
      }
    );

    leftLine(
      `ราคาต่อตัน: ${pricePerKg.toLocaleString()} บาท`,
      {
        size: 15,
        afterGap: 7,
      }
    );

    leftLine("สรุปยอด:", {
      size: 16,
      bold: true,
      afterGap: 5,
    });

    leftLine(`รวมค่าชุบน้ำยา: ${total.toLocaleString()} บาท`, {
      size: 15,
      bold: true,
      afterGap: 4,
    });

    leftLine(`ยอดจ่ายสุทธิ: ${finalTotal.toLocaleString()} บาท`, {
      size: 17,
      bold: true,
      afterGap: 5,
    });

    // ===== RIGHT COLUMN =====
    if (deductions.length > 0 && rightY < maxContentBottom) {
      rightLine("รายละเอียดรายการหักเบิก:", {
        size: 14,
        bold: true,
        afterGap: 5,
      });

      deductions.forEach((d, i) => {
        if (rightY < maxContentBottom) {
          rightLine(
            `${i + 1}. ${d.label || "-"} : ${(Number(d.amount) || 0).toLocaleString()} บาท`,
            {
              size: 13,
              afterGap: 3,
            }
          );
        }
      });

      if (rightY < maxContentBottom) {
        rightY += 4;
        rightLine(`รวมรายการหักเบิก: ${totalDeduction.toLocaleString()} บาท`, {
          size: 14,
          bold: true,
          afterGap: 5,
        });
      }
    }

    if (extraExpenses.length > 0 && rightY < maxContentBottom) {
      rightY += 4;

      rightLine("รายละเอียดจ่ายเพิ่มอื่นๆ:", {
        size: 14,
        bold: true,
        afterGap: 5,
      });

      extraExpenses.forEach((e, i) => {
        if (rightY < maxContentBottom) {
          rightLine(
            `${i + 1}. ${e.label || "-"} : ${(Number(e.amount) || 0).toLocaleString()} บาท`,
            {
              size: 13,
              afterGap: 3,
            }
          );
        }
      });

      if (rightY < maxContentBottom) {
        rightY += 4;
        rightLine(`รวมจ่ายเพิ่มอื่นๆ: ${totalExtraExpense.toLocaleString()} บาท`, {
          size: 14,
          bold: true,
          afterGap: 5,
        });
      }
    }

    // ===== CENTER DIVIDER =====
    doc
      .moveTo(290, 116)
      .lineTo(290, 285)
      .strokeColor("#999999")
      .lineWidth(0.5)
      .stroke();

    // ===== SIGNATURE =====
    const signY = 300;

    doc.font("thai").fontSize(11).text(
      "...............................................",
      40,
      signY,
      {
        width: 180,
        lineBreak: false,
      }
    );

    doc.font("thai").fontSize(11).text(
      "ผู้จ่ายเงิน",
      85,
      signY + 14,
      {
        width: 100,
        align: "center",
        lineBreak: false,
      }
    );

    doc.font("thai").fontSize(11).text(
      "ลงวันที่: ........../........../..........",
      45,
      signY + 28,
      {
        width: 180,
        lineBreak: false,
      }
    );

    doc.font("thai").fontSize(11).text(
      "...............................................",
      340,
      signY,
      {
        width: 180,
        lineBreak: false,
      }
    );

    doc.font("thai").fontSize(11).text(
      "ผู้รับเงิน",
      385,
      signY + 14,
      {
        width: 100,
        align: "center",
        lineBreak: false,
      }
    );

    doc.font("thai").fontSize(11).text(
      "ลงวันที่: ........../........../..........",
      345,
      signY + 28,
      {
        width: 180,
        lineBreak: false,
      }
    );

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "สร้าง PDF ไม่สำเร็จ",
      details: err,
    });
  }
});

module.exports = router;