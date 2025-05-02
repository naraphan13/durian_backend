const express = require("express");
const prisma = require("../models/prisma");
const router = express.Router();
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");


// 📌 Create cutting bill
router.post("/", async (req, res) => {
  const {
    cutterName, startDate, endDate,
    mainWeight, mainPrice, paid,
    deductItems, extraDeductions
  } = req.body;

  try {
    const bill = await prisma.cuttingBill.create({
      data: {
        cutterName,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        mainWeight,
        mainPrice,
        paid,
        deductItems: {
          create: deductItems.map(d => ({
            label: d.label,
            qty: d.qty,
            unitPrice: d.unitPrice,
          })),
        },
        extraDeductions: {
          create: extraDeductions.map(e => ({
            label: e.label,
            amount: e.amount,
          })),
        },
      },
    });

    res.json(bill);
  } catch (error) {
    console.error("Error creating cutting bill:", error);
    res.status(500).send("Server error");
  }
});

// 📌 Get all cutting bills
router.get("/", async (req, res) => {
  try {
    const bills = await prisma.cuttingBill.findMany({
      orderBy: { createdAt: "desc" },
      include: { deductItems: true, extraDeductions: true },
    });
    res.json(bills);
  } catch (error) {
    console.error("Error fetching cutting bills:", error);
    res.status(500).send("Server error");
  }
});

// 📌 Get single bill
router.get("/:id", async (req, res) => {
  try {
    const bill = await prisma.cuttingBill.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { deductItems: true, extraDeductions: true },
    });
    if (!bill) return res.status(404).send("Not found");
    res.json(bill);
  } catch (error) {
    res.status(500).send("Server error");
  }
});

// 📌 Update bill
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    cutterName, startDate, endDate,
    mainWeight, mainPrice, paid,
    deductItems, extraDeductions
  } = req.body;

  try {
    await prisma.deductItem.deleteMany({ where: { cuttingBillId: id } });
    await prisma.extraDeduction.deleteMany({ where: { cuttingBillId: id } });

    const updated = await prisma.cuttingBill.update({
      where: { id },
      data: {
        cutterName,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        mainWeight,
        mainPrice,
        paid,
        deductItems: { create: deductItems },
        extraDeductions: { create: extraDeductions },
      },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).send("Server error");
  }
});

// 📌 Delete bill
router.delete("/:id", async (req, res) => {
  try {
    await prisma.cuttingBill.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.sendStatus(204);
  } catch (error) {
    res.status(500).send("Server error");
  }
});

// 📌 Generate PDF (placeholder)
router.get("/:id/pdf", async (req, res) => {
    try {
      const bill = await prisma.cuttingBill.findUnique({
        where: { id: parseInt(req.params.id) },
        include: {
          deductItems: true,
          extraDeductions: true,
        },
      });
  
      if (!bill) return res.status(404).send("Bill not found");
  
      const doc = new PDFDocument({
        size: [396, 648], // A5 แนวนอน (9 x 5.5 นิ้ว)
        margin: 20,
        layout: "landscape",
      });
  
      // === ฟอนต์ไทย ===
      const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
      const fontBold = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
      if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath).font("thai");
      if (fs.existsSync(fontBold)) doc.registerFont("thai-bold", fontBold);
  
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="cutting-${bill.id}.pdf"`);
      doc.pipe(res);
  
      // === Header Logo / Company ===
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
  
      const printDateStr = new Date(bill.createdAt).toLocaleDateString("th-TH");
  
      doc.font("thai").fontSize(13).text(`รหัสบิล: ${bill.id}`, billInfoX, topY);
      doc.text(`สายตัด: ${bill.cutterName}`, billInfoX, topY + 18);
      doc.text(`วันที่พิมพ์: ${printDateStr}`, billInfoX, topY + 36);
  
      // === Heading Center ===
      doc.moveDown(0.5);
      doc.font("thai-bold").fontSize(17).text("ใบรายการค่าตัดทุเรียน", {
        align: "center",
      });
  
      // === Summary Centered ===
      doc.moveDown(0.5);
      const startDateStr = new Date(bill.startDate).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const endDateStr = new Date(bill.endDate).toLocaleDateString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const mainTotal = bill.mainWeight * bill.mainPrice;
  
      doc.font("thai").fontSize(14).text(`ช่วงวันที่: ${startDateStr} - ${endDateStr}`, {
        align: "center",
      });
      doc.text(
        `น้ำหนักรวม: ${bill.mainWeight} กก. × ${bill.mainPrice} บาท = ${mainTotal.toLocaleString()} บาท`,
        { align: "center" }
      );
  
      // === รายการหัก ===
      doc.moveDown(0.5);
      doc.font("thai-bold").fontSize(15).text("รายการหัก:", 20);
      bill.deductItems.forEach((item, i) => {
        const subtotal = item.qty * item.unitPrice;
        doc.font("thai").fontSize(14).text(
          `${i + 1}. ${item.label} - ${item.qty} × ${item.unitPrice} = ${subtotal.toLocaleString()} บาท`,
          20
        );
      });
  
      const deductTotal = bill.deductItems.reduce(
        (sum, item) => sum + item.qty * item.unitPrice,
        0
      );
  
      // === รายการหักเพิ่มเติม ===
      doc.moveDown(0.5);
      doc.font("thai-bold").fontSize(15).text("รายการหักเพิ่มเติม:", 20);
      bill.extraDeductions.forEach((item, i) => {
        doc.font("thai").fontSize(14).text(
          `${i + 1}. ${item.label} - ${item.amount.toLocaleString()} บาท`,
          20
        );
      });
  
      const extraTotal = bill.extraDeductions.reduce(
        (sum, item) => sum + item.amount,
        0
      );
  
      const netTotal = mainTotal - deductTotal - extraTotal;
  
      // === สรุปยอดสุทธิ ===
      doc.moveDown(0.5);
      doc.font("thai-bold").fontSize(16).text(`ยอดสุทธิ: ${netTotal.toLocaleString()} บาท`, {
        align: "center",
      });
  
      // === ลายเซ็น ===
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
