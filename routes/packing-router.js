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
      size: [396, 648], // ❗คงขนาดเดิม
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
    doc.text(`โดย: ___ เงินสด   ___ โอนผ่านบัญชี`, billInfoX, topY + 16);
    doc.text(`เพื่อ: ค่าบริการแพ็คทุเรียน`, billInfoX, topY + 32);
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
    const rightX = 300;
    const leftWidth = 270;
    const rightWidth = 280;

    let leftY = 120;
    let rightY = 120;

    const leftLine = (text, opts = {}) => {
      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(opts.size || 15)
        .text(text, leftX + (opts.indent || 0), leftY, {
          width: leftWidth,
        });

      leftY += opts.gap || 12;
    };

    const rightLine = (text, opts = {}) => {
      doc
        .font(opts.bold ? "thai-bold" : "thai")
        .fontSize(opts.size || 14)
        .text(text, rightX + (opts.indent || 0), rightY, {
          width: rightWidth,
        });

      rightY += opts.gap || 11;
    };

    // ===== LEFT =====
    leftLine("ใบสรุปค่าแพ็คทุเรียน", { size: 16 });
    leftLine("รายละเอียดค่าแพ็ค:", { bold: true, size: 16 });

    leftLine(
      `กล่องใหญ่: ${data.bigBoxQuantity} × ${data.bigBoxPrice} = ${totalBig.toLocaleString()} บาท`
    );

    leftLine(
      `กล่องเล็ก: ${data.smallBoxQuantity} × ${data.smallBoxPrice} = ${totalSmall.toLocaleString()} บาท`
    );

    leftY += 6;

    leftLine("สรุปยอด:", { bold: true, size: 16 });
    leftLine(`รวม: ${total.toLocaleString()} บาท`, { bold: true });

    if (totalDeduction > 0) {
      leftLine(`หัก: ${totalDeduction.toLocaleString()} บาท`, { bold: true });
    }

    if (totalExtraExpense > 0) {
      leftLine(`ค่าอื่น: ${totalExtraExpense.toLocaleString()} บาท`, { bold: true });
    }

    leftLine(`สุทธิ: ${finalTotal.toLocaleString()} บาท`, {
      bold: true,
      size: 17,
    });

    // ===== RIGHT =====
    if (deductions.length > 0) {
      rightLine("รายการหัก:", { bold: true });

      deductions.forEach((d, i) => {
        rightLine(
          `${i + 1}. ${d.label || "-"} ${Number(d.amount).toLocaleString()} บาท`
        );
      });

      rightY += 4;
    }

    if (extraExpenses.length > 0) {
      rightLine("ค่าใช้จ่ายอื่น:", { bold: true });

      extraExpenses.forEach((e, i) => {
        rightLine(
          `${i + 1}. ${e.label || "-"} ${Number(e.amount).toLocaleString()} บาท`
        );
      });
    }

    // ===== เส้นกลาง =====
    doc
      .moveTo(290, 110)
      .lineTo(290, doc.page.height - 70)
      .strokeColor("#999")
      .lineWidth(0.5)
      .stroke();

    // ===== SIGN =====
    const ySign = doc.page.height - 60;

    doc.font("thai").fontSize(11).text("............................", 40, ySign);
    doc.text("ผู้จ่ายเงิน", 40, ySign + 12);

    doc.text("............................", 340, ySign);
    doc.text("ผู้รับเงิน", 340, ySign + 12);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "สร้าง PDF ไม่สำเร็จ", details: err });
  }
});

module.exports = router;