const express = require("express");
const router = express.Router();
const { PrismaClient } = require("@prisma/client");
const prisma = require("../models/prisma");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require("path");


// ✅ POST /v1/bills - บันทึกบิลใหม่
router.post("/", async (req, res) => {
  const { seller, items } = req.body;
  try {
    const bill = await prisma.bill.create({
      data: {
        seller,
        items: {
          create: items.map((item) => ({
            variety: item.variety,
            grade: item.grade,
            weight: parseFloat(item.weight),
            weights: item.weights || [], // ✅ เก็บ array รายเข่ง
            pricePerKg: parseFloat(item.pricePerKg),
          })),
        },
      },
      include: { items: true },
    });
    res.json(bill);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create bill" });
  }
});

// ✅ GET /v1/bills - ดูบิลทั้งหมด
router.get("/", async (req, res) => {
  try {
    const bills = await prisma.bill.findMany({
      orderBy: { date: "desc" },
      include: { items: true },
    });
    res.json(bills);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch bills" });
  }
});

// ✅ GET /v1/bills/:id - ดูรายละเอียดบิล
router.get("/:id", async (req, res) => {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { items: true },
    });
    if (!bill) return res.status(404).json({ error: "Bill not found" });
    res.json(bill);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch bill" });
  }
});

// ✅ GET /v1/bills/summary - สรุปตามวัน เกรด พันธุ์ พันธุ์+เกรด
router.get("/summary/data", async (req, res) => {
  try {
    const items = await prisma.item.findMany({ include: { bill: true } });
    const summary = {
      byDate: {},
      byGrade: {},
      byVariety: {},
      byVarietyGrade: {},
    };

    for (const item of items) {
      const date = item.bill.date.toISOString().split("T")[0];
      const total = item.weight * item.pricePerKg;

      summary.byDate[date] = summary.byDate[date] || { total: 0, weight: 0 };
      summary.byDate[date].total += total;
      summary.byDate[date].weight += item.weight;

      summary.byGrade[item.grade] = summary.byGrade[item.grade] || { total: 0, weight: 0 };
      summary.byGrade[item.grade].total += total;
      summary.byGrade[item.grade].weight += item.weight;

      summary.byVariety[item.variety] = summary.byVariety[item.variety] || { total: 0, weight: 0 };
      summary.byVariety[item.variety].total += total;
      summary.byVariety[item.variety].weight += item.weight;

      const combo = `${item.variety} ${item.grade}`;
      summary.byVarietyGrade[combo] = summary.byVarietyGrade[combo] || { total: 0, weight: 0 };
      summary.byVarietyGrade[combo].total += total;
      summary.byVarietyGrade[combo].weight += item.weight;
    }

    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});





router.get("/:id/pdf", async (req, res) => {
  try {
    const bill = await prisma.bill.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { items: true },
    });

    if (!bill) return res.status(404).send("Bill not found");

    const doc = new PDFDocument({ margin: 40 });
    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    if (fs.existsSync(fontPath)) {
      doc.registerFont("thai", fontPath);
      doc.font("thai");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="bill-${bill.id}.pdf"`
    );

    doc.pipe(res);

    const logoPath = path.join(__dirname, "../picture/S__35299513pn.png");

    const logoX = 60;
    const logoY = 60;
    const logoSize = 80;
    
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }
    
    // ✅ จัดตำแหน่งข้อความให้อยู่กลางกับโลโก้
    const textX = logoX + logoSize + 20;
    const textBlockHeight = 100; // ประมาณความสูงของข้อความ 3 บรรทัด
    const textY = logoY + (logoSize / 2) - (textBlockHeight / 2); // กึ่งกลางพอดี
    
    doc
      .fontSize(16)
      .text("บริษัท ทุเรียนไทย จำกัด", textX, textY, { align: "left" })
      .moveDown(0.2)
      .fontSize(10)
      .text("เลขที่ 123 หมู่ 5 ต.ทุเรียน อ.ผลไม้ จ.ผลไม้สด 12345", textX)
      .text("โทร: 089-123-4567", textX);

doc.moveDown(1); // ช่องว่างก่อนเนื้อหาถัดไป

doc.x = 40;

    doc.fontSize(16).text("ใบสำคัญจ่าย", { align: "center", underline: true });
    doc.moveDown();
    doc.fontSize(14).text(`รหัสบิล: ${bill.id}`);
    doc.text(`จ่ายให้: ${bill.seller}`);

    doc.text(`เพื่อชำระ: ค่าทุเรียน`);

    const date = new Date(bill.date);
    const dateStr = date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
    });
    doc.text(`วันที่: ${dateStr} เวลา: ${timeStr}`);
    doc.moveDown();

    // ✅ รายการที่ซื้อแบบเดิม
    doc.fontSize(12).text("รายการที่ซื้อ:");
    const summaryByVarietyGrade = {};
    bill.items.forEach((item, i) => {
      const perBasket = item.weights?.join(" + ") || "-";
      const totalWeight = item.weight;
      const subtotal = item.weight * item.pricePerKg;

      doc.text(`${i + 1}. ${item.variety} เกรด ${item.grade}`);
      doc.text(`   น้ำหนักต่อเข่ง: ${perBasket} กก.`);
      doc.text(`   น้ำหนักรวม: ${totalWeight} กก. x ${item.pricePerKg} บาท = ${subtotal.toLocaleString()} บาท`);

      const key = `${item.variety} ${item.grade}`;
      if (!summaryByVarietyGrade[key]) summaryByVarietyGrade[key] = 0;
      summaryByVarietyGrade[key] += subtotal;
    });

    const total = Object.values(summaryByVarietyGrade).reduce((sum, val) => sum + val, 0);
    doc.moveDown();
    doc.fontSize(14).text(`รวมเงิน: ${total.toLocaleString()} บาท`, {
      align: "right",
    });
    doc.text("โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร");
    // ✅ ช่องเซ็นชื่อและวันที่
    doc.moveDown().moveDown();
    const signatureY = doc.y;
    doc.text("...............................................", 40, signatureY);
    doc.text("ผู้จ่ายเงิน", 40, signatureY + 15);
    doc.text("ลงวันที่: ........../........../..........", 40, signatureY + 30);

    doc.text("...............................................", 340, signatureY);
    doc.text("ผู้รับเงิน", 340, signatureY + 15);
    doc.text("ลงวันที่: ........../........../..........", 340, signatureY + 30);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("เกิดข้อผิดพลาด");
  }
});




































































// router.get('/:id/pdf11', async (req, res) => {
//   try {
//     const bill = await prisma.bill.findUnique({
//       where: { id: parseInt(req.params.id) },
//       include: { items: true },
//     });

//     if (!bill) return res.status(404).send('Bill not found');

//     const doc = new PDFDocument({ margin: 40 });
//     doc.registerFont('thai', './fonts/THSarabunNew.ttf'); // ✅ บอก pdfkit ว่าใช้ฟอนต์นี้
//     doc.font('thai'); // ✅ เปลี่ยนฟอนต์เริ่มต้นเป็นภาษาไทย

//     res.setHeader('Content-Type', 'application/pdf');
//     res.setHeader(
//       'Content-Disposition',
//       `inline; filename="bill-${bill.id}.pdf"`
//     );

//     doc.pipe(res);

//     // ✅ Header
//     doc.fontSize(18).text(`ใบรับซื้อทุเรียน`, { align: 'center' });
//     doc.moveDown();
//     doc.fontSize(14).text(`รหัสบิล: ${bill.id}`);
//     doc.text(`ผู้ขาย: ${bill.seller}`);
//     const date = new Date(bill.date);
//     const dateStr = date.toLocaleDateString('th-TH', {
//       year: 'numeric',
//       month: 'long',
//       day: 'numeric',
//     });
//     const timeStr = date.toLocaleTimeString('th-TH', {
//       hour: '2-digit',
//       minute: '2-digit',
//     });
//     doc.text(`วันที่: ${dateStr} เวลา: ${timeStr}`);
//     doc.moveDown();

//     // ✅ รายการ
//     doc.fontSize(12).text(`รายการที่ซื้อ:`);
//     bill.items.forEach((item, i) => {
//       const line = `${i + 1}. ${item.variety} เกรด ${item.grade} - ${item.weight} กก. x ${item.pricePerKg} บาท`;
//       doc.text(line);
//     });

//     const total = bill.items.reduce(
//       (sum, item) => sum + item.weight * item.pricePerKg,
//       0
//     );
//     doc.moveDown();
//     doc.fontSize(14).text(`รวมเงิน: ${total.toLocaleString()} บาท`, {
//       align: 'right',
//     });

//     doc.end();
//   } catch (err) {
//     console.error(err);
//     res.status(500).send('เกิดข้อผิดพลาด');
//   }
// });

module.exports = router;