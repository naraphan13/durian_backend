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
        mainItems: true, // ✅ เพิ่มเพื่อรองรับรายการใหม่
        deductItems: true,
        extraDeductions: true,
      },
    });

    if (!bill) return res.status(404).send("Bill not found");

    const doc = new PDFDocument({
      size: [396, 648], // A5 landscape
      margin: 20,
      layout: "landscape",
    });

    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath).font("thai");
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="cutting-${bill.id}.pdf"`);
    doc.pipe(res);

    // ==== HEADER ====
    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const logoSize = 70;
    const topY = 20;
    const logoX = 20;
    const logoY = topY + 10;
    const companyX = logoX + logoSize + 15;
    const billInfoX = companyX + 250;

    const createdDate = new Date(bill.createdAt);
    const billDateUTC = new Date(bill.date);
    const billDate = new Date(billDateUTC.getTime() + 7 * 60 * 60 * 1000);
    const printDateStr = createdDate.toLocaleDateString("th-TH");
    const billDateStr = billDate.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const timeStr = createdDate.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }

    // ข้อมูลบริษัท
    doc.font("thai").fontSize(13).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.text("เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190", companyX, topY + 18);
    doc.text("โทร: 081-078-2324 , 082-801-1225 , 095-905-5588", companyX, topY + 36);

    // ข้อมูลบิลฝั่งขวา
    doc.font("thai").fontSize(13).text(`รหัสบิล: ${bill.id}    จ่ายให้: ${bill.cutterName}`, billInfoX, topY);
    doc.font("thai").fontSize(13).text(`โดย: ___ เงินสด   ___ โอนผ่านบัญชีธนาคาร   เพื่อชำระ: ค่าตัดทุเรียน`, billInfoX, topY + 18);

    // ==== TITLE CENTER ====
    doc.moveDown(2);
    doc.font("thai-bold").fontSize(17).text(
      "ใบสำคัญจ่าย PAYMENT VOUCHER",
      0,
      doc.y,
      { align: "center", width: fullWidth }
    );

    // ==== รายละเอียดค่าตัด ====
    let mainTotal = 0;

    doc.moveDown(0.5);
    doc.font("thai-bold").fontSize(14).text(`วันที่: ${billDateStr}`, 20);

    if (bill.mainItems.length > 0) {
      bill.mainItems.forEach((item, i) => {
        const sub = item.weight != null ? item.weight * item.price : item.price;
        mainTotal += sub;
        const label = item.label ? `${item.label} - ` : "";
        const line = item.weight != null
          ? `${label}${item.weight} กก. × ${item.price} บาท = ${sub.toLocaleString()} บาท`
          : `${label}${item.price.toLocaleString()} บาท`;
        doc.font("thai-bold").fontSize(14).text(`${i + 1}. ${line}`, 20);
      });
    } else {
      mainTotal = bill.mainWeight * bill.mainPrice;
      doc.font("thai-bold").text(
        `น้ำหนักรวม: ${bill.mainWeight} กก. × ${bill.mainPrice} บาท = ${mainTotal.toLocaleString()} บาท`,
        20
      );
    }

    // ==== รายการหัก ====
    doc.moveDown(0.4);
    doc.font("thai-bold").fontSize(15).text("รายการหัก:", 20);
    bill.deductItems.forEach((item, i) => {
      const calculated = item.qty * item.unitPrice;
      const line = `${i + 1}. ${item.label} - ${item.qty} × ${item.unitPrice} = ${calculated.toLocaleString()} บาท`;
      if (item.actualAmount != null) {
        doc.font("thai-bold").fontSize(14).text(`${line} - หัก: ${item.actualAmount.toLocaleString()} บาท`, 20);
      } else {
        doc.font("thai-bold").fontSize(14).text(line, 20);
      }
    });

    const deductTotal = bill.deductItems.reduce(
      (sum, item) => sum + (item.actualAmount ?? item.qty * item.unitPrice),
      0
    );
    const extraTotal = bill.extraDeductions.reduce((sum, item) => sum + item.amount, 0);
    const netTotal = mainTotal - deductTotal - extraTotal;

    // ==== หักเพิ่มเติม + ยอดสุทธิ ====
    doc.moveDown(0.4);
    const lineY = doc.y;
    doc.font("thai-bold").fontSize(15).text("รายการหักเพิ่มเติม:", 20, lineY);
    doc.font("thai-bold").fontSize(16).text(
      `ยอดสุทธิ: ${netTotal.toLocaleString()} บาท`,
      0,
      lineY,
      { align: "right", width: fullWidth - 80 }
    );

    bill.extraDeductions.forEach((item, i) => {
      doc.font("thai-bold").fontSize(14).text(`${i + 1}. ${item.label} - ${item.amount.toLocaleString()} บาท`, 20);
    });

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
