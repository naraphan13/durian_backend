const express = require("express");
const prisma = require("../models/prisma");
const router = express.Router();
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");

// ✅ CREATE
router.post("/", async (req, res) => {
  const { cutterName, date, mainItems, deductItems, extraDeductions } = req.body;

  try {
    const cuttingBill = await prisma.cuttingBill.create({
      data: {
        cutterName,
        date: new Date(date),
        mainWeight: mainItems.length === 0 ? req.body.mainWeight : null,
        mainPrice: mainItems.length === 0 ? req.body.mainPrice : null,
        mainItems: {
          create: mainItems.map((item) => ({
            label: item.label,
            weight: item.weight,
            price: item.price,
          })),
        },
        deductItems: {
          create: deductItems.map((item) => ({
            label: item.label,
            qty: item.qty,
            unitPrice: item.unitPrice,
            actualAmount: item.actualAmount ?? null,
          })),
        },
        extraDeductions: {
          create: extraDeductions.map((item) => ({
            label: item.label,
            amount: item.amount,
          })),
        },
      },
    });

    res.status(201).json(cuttingBill);
  } catch (error) {
    console.error("Error creating cutting bill:", error);
    res.status(500).send("Server error");
  }
});

// ✅ GET all
router.get("/", async (req, res) => {
  try {
    const bills = await prisma.cuttingBill.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        mainItems: true,
        deductItems: true,
        extraDeductions: true,
      },
    });
    res.json(bills);
  } catch (error) {
    console.error("Error fetching cutting bills:", error);
    res.status(500).send("Server error");
  }
});

// ✅ GET one
router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const bill = await prisma.cuttingBill.findUnique({
      where: { id },
      include: {
        mainItems: true,
        deductItems: true,
        extraDeductions: true,
      },
    });
    if (!bill) return res.status(404).send("Not found");
    res.json(bill);
  } catch (error) {
    console.error("Error fetching bill:", error);
    res.status(500).send("Server error");
  }
});

// ✅ UPDATE
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { cutterName, date, mainItems, deductItems, extraDeductions } = req.body;

  try {
    // ลบรายการเดิมทั้งหมด
    await prisma.mainItem.deleteMany({ where: { cuttingBillId: id } });
    await prisma.deductItem.deleteMany({ where: { cuttingBillId: id } });
    await prisma.extraDeduction.deleteMany({ where: { cuttingBillId: id } });

    const updated = await prisma.cuttingBill.update({
      where: { id },
      data: {
        cutterName,
        date: new Date(date),
        mainWeight: mainItems.length === 0 ? req.body.mainWeight : null,
        mainPrice: mainItems.length === 0 ? req.body.mainPrice : null,
        mainItems: {
          create: mainItems.map((item) => ({
            label: item.label,
            weight: item.weight,
            price: item.price,
          })),
        },
        deductItems: {
          create: deductItems.map((item) => ({
            label: item.label,
            qty: item.qty,
            unitPrice: item.unitPrice,
            actualAmount: item.actualAmount ?? null,
          })),
        },
        extraDeductions: {
          create: extraDeductions.map((item) => ({
            label: item.label,
            amount: item.amount,
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

// ✅ DELETE
router.delete("/:id", async (req, res) => {
  try {
    await prisma.cuttingBill.delete({
      where: { id: parseInt(req.params.id) },
    });
    res.sendStatus(204);
  } catch (error) {
    console.error("Error deleting bill:", error);
    res.status(500).send("Server error");
  }
});

// ✅ PDF
router.get("/:id/pdf", async (req, res) => {
  try {
    const bill = await prisma.cuttingBill.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        mainItems: true,
        deductItems: true,
        extraDeductions: true,
      },
    });

    if (!bill) return res.status(404).send("Bill not found");

    const doc = new PDFDocument({ size: "A5", layout: "landscape", margin: 20 });
    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath).font("thai");
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="cutting-${bill.id}.pdf"`);
    doc.pipe(res);

    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const createdDate = new Date(bill.createdAt);
    const billDate = new Date(bill.date);
    const printDateStr = createdDate.toLocaleDateString("th-TH");
    const billDateStr = billDate.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // ==== HEADER ====
    doc.font("thai-bold").fontSize(16).text("บริษัท สุริยา388 จำกัด", 20, 20);
    doc.font("thai").fontSize(12).text("เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190", 20, 40);
    doc.text("โทร: 081-078-2324 , 082-801-1225 , 095-905-5588", 20, 55);

    doc.font("thai").fontSize(12).text(`รหัสบิล: ${bill.id}`, 300, 20);
    doc.text(`ชื่อผู้รับเงิน: ${bill.cutterName}`, 300, 40);
    doc.text(`วันที่ตัด: ${billDateStr}`, 300, 55);

    doc.moveDown(2);
    doc.font("thai-bold").fontSize(16).text("ใบสำคัญจ่าย PAYMENT VOUCHER", {
      align: "center",
      width: fullWidth,
    });

    // ==== รายการค่าตัด ====
    let y = doc.y + 10;
    let mainTotal = 0;

    doc.font("thai-bold").fontSize(14).text("รายการค่าตัด:", 20, y);
    y += 20;

    if (bill.mainItems.length > 0) {
      bill.mainItems.forEach((item, i) => {
        const subTotal = item.weight != null ? item.weight * item.price : item.price;
        mainTotal += subTotal;
        const label = item.label ? `${item.label} - ` : "";
        const line = item.weight != null
          ? `${i + 1}. ${label}${item.weight} กก. × ${item.price} = ${subTotal.toLocaleString()} บาท`
          : `${i + 1}. ${label}${item.price.toLocaleString()} บาท`;

        doc.font("thai").fontSize(13).text(line, 40, y);
        y += 18;
      });
    } else {
      const total = bill.mainWeight * bill.mainPrice;
      mainTotal = total;
      doc.font("thai").fontSize(13).text(
        `น้ำหนักรวม: ${bill.mainWeight} กก. × ${bill.mainPrice} บาท = ${total.toLocaleString()} บาท`,
        40,
        y
      );
      y += 18;
    }

    // ==== รายการหัก ====
    const deductTotal = bill.deductItems.reduce(
      (sum, i) => sum + (i.actualAmount ?? i.qty * i.unitPrice),
      0
    );
    const extraTotal = bill.extraDeductions.reduce((sum, i) => sum + i.amount, 0);
    const netTotal = mainTotal - deductTotal - extraTotal;

    doc.moveDown(1);
    doc.font("thai-bold").fontSize(14).text("รายการหัก:");
    bill.deductItems.forEach((item, i) => {
      const calc = item.qty * item.unitPrice;
      const amt = item.actualAmount ?? calc;
      doc.font("thai").fontSize(13).text(
        `${i + 1}. ${item.label} - ${item.qty} × ${item.unitPrice} = ${calc.toLocaleString()} บาท` +
        (item.actualAmount != null ? ` → หักจริง: ${amt.toLocaleString()} บาท` : "")
      );
    });

    doc.moveDown(1);
    doc.font("thai-bold").fontSize(14).text("รายการหักเพิ่มเติม:");
    bill.extraDeductions.forEach((item, i) => {
      doc.font("thai").fontSize(13).text(
        `${i + 1}. ${item.label} - ${item.amount.toLocaleString()} บาท`
      );
    });

    doc.moveDown(1);
    doc.font("thai-bold").fontSize(16).text(
      `จ่ายสุทธิ: ${netTotal.toLocaleString()} บาท`,
      { align: "right", width: fullWidth }
    );

    doc.moveDown(2);
    doc.font("thai").fontSize(12).text("ลงชื่อผู้รับเงิน ...............................................", 40);
    doc.text("ลงวันที่: ........../........../..........", 40);

    doc.text("ลงชื่อผู้จ่ายเงิน ...............................................", 300);
    doc.text("ลงวันที่: ........../........../..........", 300);

    doc.end();
  } catch (err) {
    console.error("Error generating PDF:", err);
    res.status(500).send("เกิดข้อผิดพลาด");
  }
});

module.exports = router;
