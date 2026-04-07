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

    // ===== CREATE DOC =====
    const doc = new PDFDocument({
      size: [396, 648],
      margin: 20,
      layout: "landscape",
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=packing-${data.id}.pdf`
    );

    doc.pipe(res);

    // ===== FONT =====
    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(
      __dirname,
      "../fonts/THSarabunNewBold.ttf"
    );

    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath);
    if (fs.existsSync(fontBoldPath))
      doc.registerFont("thai-bold", fontBoldPath);

    // ===== HEADER =====
    const logoPath = path.join(
      __dirname,
      "../picture/S__5275654png (1).png"
    );

    const topY = 18;
    const logoSize = 60;
    const logoX = 20;
    const logoY = topY + 8;
    const companyX = logoX + logoSize + 12;
    const rightInfoX = companyX + 240;

    // LOGO
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }

    // COMPANY
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

    // DATE
    const rawDate = data.date ? new Date(data.date) : new Date();
    const safeDate = isNaN(rawDate.getTime()) ? new Date() : rawDate;

    const dateStr = new Intl.DateTimeFormat("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(safeDate);

    const recipient = data.recipient || "__________";

    doc.text(`รหัสบิล: ${data.id}    จ่ายให้: ${recipient}`, rightInfoX, topY);
    doc.text(`วันที่: ${dateStr}`, rightInfoX, topY + 16);

    // ===== TITLE =====
    doc.font("thai-bold").fontSize(17).text(
      "ใบสำคัญจ่าย PAYMENT VOUCHER",
      0,
      88,
      { align: "center" }
    );

    // ===== DATA =====
    const deductions = Array.isArray(data.deductions)
      ? data.deductions
      : [];
    const extraExpenses = Array.isArray(data.extraExpenses)
      ? data.extraExpenses
      : [];

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

    const finalTotal = total - totalDeduction + totalExtraExpense;

    // ===== LAYOUT =====
    const leftX = 20;
    const rightX = 300;
    const leftWidth = 260;
    const rightWidth = 260;

    let leftY = 120;
    let rightY = 120;

    const leftLine = (text, opts = {}) => {
      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(opts.size || 15)
        .text(text, leftX, leftY, {
          width: leftWidth,
          lineGap: 2,
        });

      const h = doc.heightOfString(text, {
        width: leftWidth,
      });

      leftY += h + (opts.afterGap ?? 6);
    };

    const rightLine = (text, opts = {}) => {
      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(opts.size || 14)
        .text(text, rightX, rightY, {
          width: rightWidth,
          lineGap: 1,
        });

      const h = doc.heightOfString(text, {
        width: rightWidth,
      });

      rightY += h + (opts.afterGap ?? 5);
    };

    // ===== LEFT (เฉพาะสรุป) =====
    leftLine("รายละเอียดค่าแพ็ค", { bold: true, size: 16 });

    leftLine(
      `กล่องใหญ่: ${bigQty} × ${bigPrice} = ${totalBig.toLocaleString()} บาท`
    );

    leftLine(
      `กล่องเล็ก: ${smallQty} × ${smallPrice} = ${totalSmall.toLocaleString()} บาท`
    );

    leftLine("สรุปยอด", { bold: true, size: 16 });

    leftLine(`รวม: ${total.toLocaleString()} บาท`, { bold: true });

    leftLine(`สุทธิ: ${finalTotal.toLocaleString()} บาท`, {
      bold: true,
      size: 17,
    });

    // ===== RIGHT (ย้ายมาทั้งหมด) =====
    if (deductions.length > 0) {
      rightLine("รายการหักเบิก", { bold: true, size: 15 });

      deductions.forEach((d, i) => {
        rightLine(
          `${i + 1}. ${d.label || "-"} : ${Number(
            d.amount
          ).toLocaleString()} บาท`
        );
      });

      rightLine(
        `รวมรายการหักเบิก: ${totalDeduction.toLocaleString()} บาท`,
        { bold: true, size: 15 }
      );
    }

    if (extraExpenses.length > 0) {
      rightY += 10;

      rightLine("รายการจ่ายเพิ่ม", { bold: true, size: 15 });

      extraExpenses.forEach((e, i) => {
        rightLine(
          `${i + 1}. ${e.label || "-"} : ${Number(
            e.amount
          ).toLocaleString()} บาท`
        );
      });

      rightLine(
        `รวมจ่ายเพิ่มอื่นๆ: ${totalExtraExpense.toLocaleString()} บาท`,
        { bold: true, size: 15 }
      );
    }

    // ===== LINE =====
    doc
      .moveTo(285, 115)
      .lineTo(285, doc.page.height - 70)
      .stroke();

    // ===== SIGN =====
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
    res.status(500).json({
      error: "เกิดข้อผิดพลาดในการสร้าง PDF",
      details: err,
    });
  }
});

module.exports = router;