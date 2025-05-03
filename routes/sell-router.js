// 📁 routes/sell-router.js
const express = require("express");
const prisma = require("../models/prisma");
const router = express.Router();
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// ✅ Generate PDF for sell bill
router.get("/:id/pdf", async (req, res) => {
  try {
    const bill = await prisma.sellBill.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { items: true },
    });

    if (!bill) return res.status(404).send("Bill not found");

    const doc = new PDFDocument({
      size: [396, 648], // A5 landscape
      margin: 20,
      layout: "landscape",
    });

    // Font
    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath).font("thai");
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=receipt-sell-${bill.id}.pdf`
    );
    doc.pipe(res);

    // === Header ===
    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const logoSize = 70;
    const topY = 20;
    const logoX = 20;
    const logoY = topY + 10;
    const companyX = logoX + logoSize + 15;
    const billInfoX = companyX + 250;

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }

    doc.font("thai").fontSize(13).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.text("เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190", companyX, topY + 18);
    doc.text("โทร: 081-078-2324 , 082-801-1225 , 095-905-5588", companyX, topY + 36);

    const date = new Date(bill.date);
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

    doc.font("thai").fontSize(13).text(`รหัสบิล: ${bill.id}    ลูกค้า: ${bill.customer}`, billInfoX, topY);
    doc.text("รายการขายทุเรียน", billInfoX, topY + 18);
    doc.text(`วันที่: ${dateStr} เวลา: ${timeStr} น.`, billInfoX, topY + 36);

    // Title center
    doc.moveDown(0.5);
    doc.font("thai-bold").fontSize(17).text("ใบเสร็จการขายทุเรียน", {
      align: "center",
      width: doc.page.width,
    });

    // === รายการ ===
    doc.moveDown(0.5);
    doc.font("thai-bold").fontSize(17).text("รายการที่ขาย:", 20);

    let total = 0;
    bill.items.forEach((item, i) => {
      const weights = item.weights?.join(" + ") || "-";
      const sumWeight = item.weight;
      const sum = sumWeight * item.pricePerKg;
      total += sum;

      doc.font("thai-bold").fontSize(17).text(
        `${i + 1}. ${item.variety} เกรด ${item.grade} | เข่ง: ${weights} กก. | น้ำหนักรวม: ${sumWeight} กก. × ${item.pricePerKg} = ${sum.toLocaleString()} บาท`,
        20
      );
    });

    doc.moveDown(0.5);
    doc.font("thai-bold").fontSize(17).text(`รวมเงิน: ${total.toLocaleString()} บาท`, {
      align: "center",
    });

    // ลายเซ็น
    const sigY = doc.page.height - 60;
    doc.fontSize(11).text("...............................................", 40, sigY);
    doc.text("ผู้ขาย", 40, sigY + 12);
    doc.text("ลงวันที่: ........../........../..........", 40, sigY + 24);

    doc.text("...............................................", 340, sigY);
    doc.text("ผู้รับเงิน", 340, sigY + 12);
    doc.text("ลงวันที่: ........../........../..........", 340, sigY + 24);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("เกิดข้อผิดพลาด");
  }
});






router.post("/", async (req, res) => {
    try {
      const { seller, items } = req.body;
      const newBill = await prisma.bill.create({
        data: {
          seller,
          items: {
            create: items.map((item) => ({
              variety: item.variety,
              grade: item.grade,
              weights: item.weights,
              weight: item.weight,
              pricePerKg: item.pricePerKg,
            })),
          },
        },
        include: { items: true },
      });
      res.json(newBill);
    } catch (err) {
      console.error(err);
      res.status(500).send("เกิดข้อผิดพลาดขณะสร้างบิลขาย");
    }
  });
  
  // 📌 แก้ไขบิลขาย
  router.put("/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { seller, items } = req.body;
  
      await prisma.item.deleteMany({ where: { billId: id } });
  
      const updated = await prisma.bill.update({
        where: { id },
        data: {
          seller,
          items: {
            create: items.map((item) => ({
              variety: item.variety,
              grade: item.grade,
              weights: item.weights,
              weight: item.weight,
              pricePerKg: item.pricePerKg,
            })),
          },
        },
        include: { items: true },
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).send("เกิดข้อผิดพลาดในการอัปเดต");
    }
  });
  
  // 📌 ลบบิลขาย
  router.delete("/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await prisma.bill.delete({ where: { id } });
      res.sendStatus(204);
    } catch (err) {
      console.error(err);
      res.status(500).send("ลบไม่สำเร็จ");
    }
  });
  
  // 📌 ดึงบิลทั้งหมด
  router.get("/", async (req, res) => {
    try {
      const bills = await prisma.bill.findMany({
        orderBy: { date: "desc" },
        include: { items: true },
      });
      res.json(bills);
    } catch (err) {
      console.error(err);
      res.status(500).send("ไม่สามารถดึงข้อมูลบิลได้");
    }
  });
  
  // 📌 ดึงบิลรายตัว
  router.get("/:id", async (req, res) => {
    try {
      const bill = await prisma.bill.findUnique({
        where: { id: parseInt(req.params.id) },
        include: { items: true },
      });
      if (!bill) return res.status(404).send("ไม่พบบิลนี้");
      res.json(bill);
    } catch (err) {
      console.error(err);
      res.status(500).send("ดึงข้อมูลบิลล้มเหลว");
    }
  });

module.exports = router;
