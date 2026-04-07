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
      size: [396, 648], // คงขนาดเดิม
      margin: 20,
      layout: "landscape",
      autoFirstPage: true,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="packing-${data.id}.pdf"`);
    doc.pipe(res);

    // ===== FONT =====
    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");

    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath);
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    // ===== DATA =====
    const deductions = Array.isArray(data.deductions) ? data.deductions : [];
    const extraExpenses = Array.isArray(data.extraExpenses) ? data.extraExpenses : [];

    const bigQty = Number(data.bigBoxQuantity) || 0;
    const bigPrice = Number(data.bigBoxPrice) || 0;
    const smallQty = Number(data.smallBoxQuantity) || 0;
    const smallPrice = Number(data.smallBoxPrice) || 0;

    const totalBig = bigQty * bigPrice;
    const totalSmall = smallQty * smallPrice;
    const total = totalBig + totalSmall;

    let totalDeduction = 0;
    let totalExtraExpense = 0;

    deductions.forEach((d) => {
      totalDeduction += Number(d.amount) || 0;
    });

    extraExpenses.forEach((e) => {
      totalExtraExpense += Number(e.amount) || 0;
    });

    // ✅ จ่ายเพิ่ม = บวก
    const finalTotal = total - totalDeduction + totalExtraExpense;

    // ===== HEADER =====
    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const topY = 18;
    const logoSize = 60;
    const logoX = 20;
    const logoY = topY + 8;
    const companyX = logoX + logoSize + 12;
    const billInfoX = 365; // ขยับให้พอดีฝั่งขวา
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

    // บริษัท
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

    // ข้อมูลฝั่งขวาบน
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
      "เพื่อชำระ: ค่าบริการแพ็คทุเรียน",
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
      { align: "center", width: doc.page.width }
    );

    // ===== CONTENT LAYOUT =====
    const leftX = 20;
    const rightX = 315;
    const leftWidth = 250;
    const rightWidth = 230;

    let leftY = 122;
    let rightY = 122;

    // กันเนื้อหาชนลายเซ็น
    const maxContentBottom = 330;

    const leftLine = (text, opts = {}) => {
      const fontSize = opts.size || 15;
      const lineGap = opts.lineGap ?? 1;
      const indent = opts.indent || 0;
      const width = leftWidth - indent;

      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(fontSize)
        .text(text, leftX + indent, leftY, {
          width,
          lineGap,
        });

      const height = doc.heightOfString(text, {
        width,
        lineGap,
      });

      leftY += height + (opts.afterGap ?? 5);
    };

    const rightLine = (text, opts = {}) => {
      const fontSize = opts.size || 13;
      const lineGap = opts.lineGap ?? 1;
      const indent = opts.indent || 0;
      const width = rightWidth - indent;

      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(fontSize)
        .text(text, rightX + indent, rightY, {
          width,
          lineGap,
        });

      const height = doc.heightOfString(text, {
        width,
        lineGap,
      });

      rightY += height + (opts.afterGap ?? 4);
    };

    // ===== LEFT COLUMN =====
    leftLine("ใบสรุปค่าแพ็คทุเรียน", {
      size: 16,
      bold: false,
      afterGap: 3,
    });

    leftLine("รายละเอียดค่าแพ็ค:", {
      size: 16,
      bold: true,
      afterGap: 5,
    });

    leftLine(
      `กล่องใหญ่: ${bigQty.toLocaleString()} กล่อง × ${bigPrice.toLocaleString()} บาท = ${totalBig.toLocaleString()} บาท`,
      {
        size: 15,
        afterGap: 4,
      }
    );

    leftLine(
      `กล่องเล็ก: ${smallQty.toLocaleString()} กล่อง × ${smallPrice.toLocaleString()} บาท = ${totalSmall.toLocaleString()} บาท`,
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

    leftLine(`รวมค่าบริการแพ็ค: ${total.toLocaleString()} บาท`, {
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
    if (deductions.length > 0) {
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
              indent: 6,
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
              indent: 6,
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
      .moveTo(292, 116)
      .lineTo(292, 350)
      .strokeColor("#999999")
      .lineWidth(0.5)
      .stroke();

    // ===== SIGNATURE =====
    // fix ตำแหน่งให้อยู่หน้าเดียวแน่นอน
    const signatureBaseY = 360;

    doc.font("thai").fontSize(11).text(
      "...............................................",
      40,
      signatureBaseY
    );
    doc.font("thai").fontSize(11).text(
      "ผู้จ่ายเงิน",
      40,
      signatureBaseY + 12
    );
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
    doc.font("thai").fontSize(11).text(
      "ผู้รับเงิน",
      340,
      signatureBaseY + 12
    );
    doc.font("thai").fontSize(11).text(
      "ลงวันที่: ........../........../..........",
      340,
      signatureBaseY + 26
    );

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "เกิดข้อผิดพลาดในการสร้าง PDF",
      details: err,
    });
  }
});

module.exports = router;