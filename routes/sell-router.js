const express = require("express");
const prisma = require("../models/prisma");
const router = express.Router();
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// ✅ GET All sell bills
router.get("/", async (req, res) => {
  try {
    const sells = await prisma.sellBill.findMany({
      orderBy: { date: "desc" },
      include: { items: true },
    });
    res.json(sells);
  } catch (err) {
    res.status(500).send("Error fetching sell bills");
  }
});

// ✅ GET Single sell bill
router.get("/:id", async (req, res) => {
  try {
    const sell = await prisma.sellBill.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { items: true },
    });

    if (!sell) return res.status(404).send("Sell bill not found");

    res.json(sell);
  } catch (err) {
    res.status(500).send("Error fetching bill");
  }
});

// ✅ CREATE Sell bill
router.post("/", async (req, res) => {
  const { customer, date, items } = req.body;

  try {
    const newSell = await prisma.sellBill.create({
      data: {
        customer,
        date: new Date(date),
        items: {
          create: items.map((i) => ({
            variety: i.variety,
            grade: i.grade,
            weight: i.weight,
            weights: i.weights || [],
            pricePerKg: i.pricePerKg,
          })),
        },
      },
      include: { items: true },
    });

    res.json(newSell);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error creating sell bill");
  }
});

// ✅ UPDATE Sell bill
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { customer, date, items } = req.body;

  try {
    await prisma.sellItem.deleteMany({
      where: { sellBillId: id },
    });

    const updated = await prisma.sellBill.update({
      where: { id },
      data: {
        customer,
        date: new Date(date),
        items: {
          create: items.map((i) => ({
            variety: i.variety,
            grade: i.grade,
            weight: i.weight,
            weights: i.weights || [],
            pricePerKg: i.pricePerKg,
          })),
        },
      },
      include: { items: true },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating sell bill");
  }
});

// ✅ DELETE Sell bill
router.delete("/:id", async (req, res) => {
  try {
    await prisma.sellItem.deleteMany({
      where: { sellBillId: parseInt(req.params.id) },
    });

    await prisma.sellBill.delete({
      where: { id: parseInt(req.params.id) },
    });

    res.sendStatus(204);
  } catch (err) {
    res.status(500).send("Error deleting sell bill");
  }
});

// ✅ PDF
router.get("/:id/pdf", async (req, res) => {
  try {
    const bill = await prisma.sellBill.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { items: true },
    });

    if (!bill) return res.status(404).send("Bill not found");

    const doc = new PDFDocument({
      size: [396, 648],
      margin: 20,
      layout: "landscape",
    });

    const fullWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");

    if (fs.existsSync(fontPath)) {
      doc.registerFont("thai", fontPath).font("thai");
    }

    if (fs.existsSync(fontBoldPath)) {
      doc.registerFont("thai-bold", fontBoldPath);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename=receipt-sell-${bill.id}.pdf`
    );

    doc.pipe(res);

    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const logoSize = 70;
    const topY = 20;
    const logoX = 20;
    const logoY = topY + 10;
    const companyX = logoX + logoSize + 15;
    const billInfoX = companyX + 250;

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, {
        fit: [logoSize, logoSize],
      });
    }

    // ===== ข้อมูลบริษัท =====
    doc.font("thai").fontSize(13).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.text(
      "เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190",
      companyX,
      topY + 18
    );
    doc.text(
      "โทร: 081-078-2324 , 082-801-1225 , 095-905-5588",
      companyX,
      topY + 36
    );

    // ===== ข้อมูลบิล =====
    const date = new Date(bill.date);

    const dateStr = new Intl.DateTimeFormat("th-TH", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Bangkok",
    }).format(date);

    doc
      .font("thai")
      .fontSize(13)
      .text(`รหัสบิล: ${bill.id}    ชื่อ: ${bill.customer}`, billInfoX, topY);

    doc
      .font("thai")
      .fontSize(13)
      .text(
        "โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร   เพื่อชำระ: ค่าทุเรียน",
        billInfoX,
        topY + 18
      );

    doc
      .font("thai")
      .fontSize(13)
      .text(`วันที่: ${dateStr}`, billInfoX, topY + 36);

    // ===== หัวบิลกลางหน้า =====
    doc.moveDown(0.5);

    doc.font("thai-bold").fontSize(17).text("บิลเงินสด", doc.page.margins.left, doc.y, {
      align: "center",
      width: fullWidth,
    });

    // ===== รายการขาย =====
    doc.moveDown(0.5);

    doc.font("thai").fontSize(16).text("ใบเสร็จการขายทุเรียน", 20);
    doc.font("thai-bold").fontSize(17).text("รายการที่ขาย:", 20);

    let total = 0;
    let totalWeight = 0;

    bill.items.forEach((item, i) => {
      const weights =
        item.weights && item.weights.length > 0
          ? item.weights.join(" + ")
          : "-";

      const sumWeight = Number(item.weight || 0);
      const pricePerKg = Number(item.pricePerKg || 0);
      const sum = sumWeight * pricePerKg;

      total += sum;
      totalWeight += sumWeight;

      doc.font("thai-bold").fontSize(16).text(
        `${i + 1}. ${item.variety} เกรด ${item.grade} | เข่ง: ${weights} กก. | น้ำหนักรวม: ${sumWeight.toLocaleString()} กก. × ${pricePerKg.toLocaleString()} = ${sum.toLocaleString()} บาท`,
        20
      );
    });

    doc.moveDown(0.5);

    doc.font("thai-bold").fontSize(17).text(
      `น้ำหนักรวมทั้งหมด: ${totalWeight.toLocaleString()} กก.`,
      {
        align: "center",
        width: fullWidth,
      }
    );

    doc.font("thai-bold").fontSize(17).text(
      `รวมเงิน: ${total.toLocaleString()} บาท`,
      {
        align: "center",
        width: fullWidth,
      }
    );

    // ==== ลายเซ็น ====
    const sigY = doc.page.height - 60;

    doc.fontSize(11).text("...............................................", 40, sigY);
    doc.text("ผู้จ่ายเงิน", 40, sigY + 12);
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

module.exports = router;