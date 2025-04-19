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

    const doc = new PDFDocument({
      size: [648, 396], // 9 x 5.5 inches in points
      margin: 20
    });

    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    if (fs.existsSync(fontPath)) {
      doc.registerFont("thai", fontPath);
      doc.font("thai");
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="bill-${bill.id}.pdf"`);

    doc.pipe(res);

    const logoPath = path.join(__dirname, "../picture/S__35299513pn.png");
    const logoSize = 60;
    const padding = 20;
    
    // เตรียมความกว้างของ logo + ข้อความ (โดยประมาณ)
    const textBlockWidth = 250;
    const totalWidth = logoSize + padding + textBlockWidth;
    
    // คำนวณตำแหน่งเริ่มต้นให้อยู่กลางกระดาษ
    const centerX = (doc.page.width - totalWidth) / 2;
    const logoX = centerX;
    const logoY = 20;
    const infoX = logoX + logoSize + padding;
    const infoY = logoY;
    
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }
    
    doc
      .fontSize(14)
      .text("บริษัท สุริยา 388 จำกัด", infoX, infoY, { align: "left" })
      .fontSize(9)
      .text("เลขที่ 203/2 หมู่ 12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190", infoX, infoY + 20, { align: "left" })
      .text("โทร: 081-078-2324 , 082-801-1225", infoX, infoY + 35, { align: "left" });

    doc.moveDown(0.5);
    doc.fontSize(13).text("ใบสำคัญจ่าย", { align: "center", underline: true });
    doc.moveDown(0.3);
    doc.fontSize(11).text(`รหัสบิล: ${bill.id}    จ่ายให้: ${bill.seller}    โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร`);
    const date = new Date(bill.date);

    const dateStr = new Intl.DateTimeFormat('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Bangkok'
    }).format(date);

    const timeStr = new Intl.DateTimeFormat('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok'
    }).format(date);

    doc.text(`เพื่อชำระ: ค่าทุเรียน    วันที่: ${dateStr} เวลา: ${timeStr}`);
  

    
    doc.moveDown(0.5);
    doc.fontSize(10).text("รายการที่ซื้อ:");

    const summaryByVarietyGrade = {};
    bill.items.forEach((item, i) => {
      const perBasket = item.weights?.join(" + ") || "-";
      const totalWeight = item.weight;
      const subtotal = item.weight * item.pricePerKg;

      const line = `${i + 1}. ${item.variety} เกรด ${item.grade} | น้ำหนักต่อเข่ง: ${perBasket} กก. | น้ำหนักรวม: ${totalWeight} กก. x ${item.pricePerKg} บาท = ${subtotal.toLocaleString()} บาท`;
      doc.text(line);

      const key = `${item.variety} ${item.grade}`;
      if (!summaryByVarietyGrade[key]) summaryByVarietyGrade[key] = 0;
      summaryByVarietyGrade[key] += subtotal;
    });

    const total = Object.values(summaryByVarietyGrade).reduce((sum, val) => sum + val, 0);
    doc.moveDown(0.5);
    doc.fontSize(12).text(`รวมเงิน: ${total.toLocaleString()} บาท`, {
      align: "right",
    });

    doc.moveDown(1);
    const signatureY = doc.y;
    doc.text("...............................................", 40, signatureY);
    doc.fontSize(9).text("ผู้จ่ายเงิน", 40, signatureY + 12);
    doc.text("ลงวันที่: ........../........../..........", 40, signatureY + 24);

    doc.text("...............................................", 340, signatureY);
    doc.fontSize(9).text("ผู้รับเงิน", 340, signatureY + 12);
    doc.text("ลงวันที่: ........../........../..........", 340, signatureY + 24);

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