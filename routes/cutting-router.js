const express = require("express");
const prisma = require("../models/prisma");
const router = express.Router();
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");


router.post("/", async (req, res) => {
  const {
    cutterName,
    date,
    mainWeight,
    mainPrice,
    deductItems,
    extraDeductions,
  } = req.body;

  try {
    const bill = await prisma.cuttingBill.create({
      data: {
        cutterName,
        date: new Date(date),
        mainWeight,
        mainPrice,
        deductItems: {
          create: deductItems.map((d) => ({
            label: d.label,
            qty: d.qty,
            unitPrice: d.unitPrice,
            actualAmount: d.actualAmount ?? null,
          })),
        },
        extraDeductions: {
          create: extraDeductions.map((e) => ({
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

// ✅ GET all cutting bills
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

// ✅ GET single bill
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

// ✅ UPDATE cutting bill
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const {
    cutterName,
    date,
    mainWeight,
    mainPrice,
    deductItems,
    extraDeductions,
  } = req.body;

  try {
    await prisma.deductItem.deleteMany({ where: { cuttingBillId: id } });
    await prisma.extraDeduction.deleteMany({ where: { cuttingBillId: id } });

    const updated = await prisma.cuttingBill.update({
      where: { id },
      data: {
        cutterName,
        date: new Date(date),
        mainWeight,
        mainPrice,
        deductItems: {
          create: deductItems.map((d) => ({
            label: d.label,
            qty: d.qty,
            unitPrice: d.unitPrice,
            actualAmount: d.actualAmount ?? null,
          })),
        },
        extraDeductions: {
          create: extraDeductions.map((e) => ({
            label: e.label,
            amount: e.amount,
          })),
        },
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error updating bill:", error);
    res.status(500).send("Server error");
  }
});

// ✅ DELETE bill
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
      size: [396, 648], // A5 แนวนอน
      margin: 20,
      layout: "landscape",
    });

    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
    if (fs.existsSync(fontPath)) {
      doc.registerFont("thai", fontPath).font("thai");
    }
    if (fs.existsSync(fontBoldPath)) {
      doc.registerFont("thai-bold", fontBoldPath);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="cutting-${bill.id}.pdf"`);
    doc.pipe(res);

    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const logoSize = 70;
    const logoX = 20;
    const logoY = 30;
    const companyX = logoX + logoSize + 15;
    const billInfoX = companyX + 250;
    const topY = 20;

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

    const centerOpts = { align: "center", width: fullWidth };

    doc.moveDown(0.5);
    doc.font("thai-bold").fontSize(17).text("ใบรายการค่าตัดทุเรียน", 0, undefined, centerOpts);

    const billDateStr = new Date(bill.date).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const mainTotal = bill.mainWeight * bill.mainPrice;

    doc.moveDown(0.5);
    doc.font("thai").fontSize(14).text(`วันที่: ${billDateStr}`, 20);
    doc.text(
      `น้ำหนักรวม: ${bill.mainWeight} กก. × ${bill.mainPrice} บาท = ${mainTotal.toLocaleString()} บาท`,
      20
    );

    // รายการหัก
    doc.moveDown(0.4);
    doc.font("thai-bold").fontSize(15).text("รายการหัก:", 20);
    bill.deductItems.forEach((item, i) => {
      const calculated = item.qty * item.unitPrice;
      const line = `${i + 1}. ${item.label} - ${item.qty} × ${item.unitPrice} = ${calculated.toLocaleString()} บาท`;
      if (item.actualAmount != null) {
        doc.font("thai").fontSize(14).text(`${line} - หัก: ${item.actualAmount.toLocaleString()} บาท`, 20);
      } else {
        doc.font("thai").fontSize(14).text(line, 20);
      }
    });

    const deductTotal = bill.deductItems.reduce(
      (sum, item) => sum + (item.actualAmount ?? item.qty * item.unitPrice),
      0
    );

    const extraTotal = bill.extraDeductions.reduce((sum, item) => sum + item.amount, 0);
    const netTotal = mainTotal - deductTotal - extraTotal;

    // รายการหักเพิ่มเติม + ยอดสุทธิ
    doc.moveDown(0.4);
    doc.font("thai-bold").fontSize(15).text("รายการหักเพิ่มเติม:", 20);
    bill.extraDeductions.forEach((item, i) => {
      doc.font("thai").fontSize(14).text(`${i + 1}. ${item.label} - ${item.amount.toLocaleString()} บาท`, 20);
    });

    // ยอดสุทธิชิดขวาในบรรทัดเดียวกัน
    doc.moveDown(0.3);
    doc.font("thai-bold").fontSize(16).text(
      `ยอดสุทธิ: ${netTotal.toLocaleString()} บาท`,
      0,
      undefined,
      { align: "right", width: fullWidth }
    );

    // ลายเซ็น
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
