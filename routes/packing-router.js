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

    // ===== LOGO / HEADER =====
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

    doc.font("thai").fontSize(11).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.font("thai").fontSize(11).text(
      "เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190",
      companyX,
      topY + 14
    );
    doc.font("thai").fontSize(11).text(
      "โทร: 081-078-2324 , 082-801-1225 , 095-905-5588",
      companyX,
      topY + 28
    );

    const recipient = data.recipient || "__________";
    doc.font("thai").fontSize(11).text(
      `รหัสบิล: ${data.id}    จ่ายให้: ${recipient}`,
      billInfoX,
      topY
    );
    doc.font("thai").fontSize(11).text(
      `โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร`,
      billInfoX,
      topY + 14
    );
    doc.font("thai").fontSize(11).text(
      `เพื่อชำระ: ค่าบริการแพ็คทุเรียน`,
      billInfoX,
      topY + 28
    );
    doc.font("thai").fontSize(11).text(
      `วันที่: ${dateStr}`,
      billInfoX,
      topY + 42
    );

    // ===== TITLE =====
    doc.font("thai-bold").fontSize(15).text(
      "ใบสำคัญจ่าย PAYMENT VOUCHER",
      0,
      82,
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

    // ===== TWO COLUMNS =====
    const leftX = 20;
    const rightX = 310;
    const leftWidth = 270;
    const rightWidth = 250;

    let leftY = 112;
    let rightY = 112;

    const leftLine = (text, opts = {}) => {
      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(opts.size || 13)
        .text(text, leftX + (opts.indent || 0), leftY, {
          width: leftWidth - (opts.indent || 0),
        });

      leftY += opts.gap || 14;
    };

    const rightLine = (text, opts = {}) => {
      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(opts.size || 12)
        .text(text, rightX + (opts.indent || 0), rightY, {
          width: rightWidth - (opts.indent || 0),
        });

      rightY += opts.gap || 13;
    };

    // ===== LEFT COLUMN =====
    leftLine("ใบสรุปค่าแพ็คทุเรียน", { size: 14 });
    leftLine("รายละเอียดค่าแพ็ค:", { size: 14, bold: true });
    leftLine(
      `กล่องใหญ่: ${Number(data.bigBoxQuantity || 0).toLocaleString()} กล่อง × ${Number(
        data.bigBoxPrice || 0
      ).toLocaleString()} บาท = ${totalBig.toLocaleString()} บาท`
    );
    leftLine(
      `กล่องเล็ก: ${Number(data.smallBoxQuantity || 0).toLocaleString()} กล่อง × ${Number(
        data.smallBoxPrice || 0
      ).toLocaleString()} บาท = ${totalSmall.toLocaleString()} บาท`
    );

    leftY += 6;

    leftLine("สรุปยอด:", { size: 14, bold: true });
    leftLine(`รวมทั้งหมด: ${total.toLocaleString()} บาท`, { bold: true });

    if (totalDeduction > 0) {
      leftLine(`หักเบิก: ${totalDeduction.toLocaleString()} บาท`, { bold: true });
    }

    if (totalExtraExpense > 0) {
      leftLine(`ค่าใช้จ่ายอื่น: ${totalExtraExpense.toLocaleString()} บาท`, { bold: true });
    }

    leftLine(`คงเหลือหลังหัก: ${finalTotal.toLocaleString()} บาท`, {
      size: 14,
      bold: true,
    });

    // ===== RIGHT COLUMN =====
    if (deductions.length > 0) {
      rightLine("รายละเอียดรายการหัก:", { size: 13, bold: true });

      deductions.forEach((d, idx) => {
        const amount = Number(d.amount) || 0;
        rightLine(`${idx + 1}. ${d.label || "-"}: ${amount.toLocaleString()} บาท`, {
          indent: 8,
        });
      });

      rightY += 4;
    }

    if (extraExpenses.length > 0) {
      rightLine("รายละเอียดค่าใช้จ่ายอื่นๆ:", { size: 13, bold: true });

      extraExpenses.forEach((e, idx) => {
        const amount = Number(e.amount) || 0;
        rightLine(`${idx + 1}. ${e.label || "-"}: ${amount.toLocaleString()} บาท`, {
          indent: 8,
        });
      });
    }

    // ===== OPTIONAL CENTER DIVIDER =====
    doc
      .moveTo(295, 108)
      .lineTo(295, doc.page.height - 72)
      .strokeColor("#999999")
      .lineWidth(0.5)
      .stroke();

    // ===== SIGNATURE =====
    const signatureBaseY = doc.page.height - 58;

    doc.font("thai").fontSize(10).text(
      "...............................................",
      40,
      signatureBaseY
    );
    doc.font("thai").fontSize(10).text("ผู้จ่ายเงิน", 40, signatureBaseY + 10);
    doc.font("thai").fontSize(10).text(
      "ลงวันที่: ........../........../..........",
      40,
      signatureBaseY + 22
    );

    doc.font("thai").fontSize(10).text(
      "...............................................",
      340,
      signatureBaseY
    );
    doc.font("thai").fontSize(10).text("ผู้รับเงิน", 340, signatureBaseY + 10);
    doc.font("thai").fontSize(10).text(
      "ลงวันที่: ........../........../..........",
      340,
      signatureBaseY + 22
    );

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการสร้าง PDF", details: err });
  }
});

module.exports = router;