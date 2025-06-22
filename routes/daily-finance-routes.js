const express = require("express");
const router = express.Router();
const prisma = require("../models/prisma");
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// ✅ GET /v1/dailyfinance - ดูทั้งหมดหรือระบุวันที่
router.get("/", async (req, res) => {
  try {
    const { date } = req.query;
    if (date) {
      const target = new Date(date);
      const start = new Date(target.setHours(0, 0, 0, 0));
      const end = new Date(target.setHours(23, 59, 59, 999));

      const record = await prisma.dailyFinance.findFirst({
        where: {
          date: {
            gte: start,
            lte: end,
          },
        },
        include: { incomeNotes: true, expenseNotes: true },
      });
      return res.json(record);
    }

    const records = await prisma.dailyFinance.findMany({
      orderBy: { date: "desc" },
      include: { incomeNotes: true, expenseNotes: true },
    });
    res.json(records);
  } catch (err) {
    console.error("GET /dailyfinance error::", err);
    res.status(500).json({ error: "Failed to fetch daily finance records" });
  }
});

// ✅ POST /v1/dailyfinance - สร้างรายการใหม่
router.post("/", async (req, res) => {
  const { date, createdBy, incomeNotes = [], expenseNotes = [] } = req.body;
  try {
    const newRecord = await prisma.dailyFinance.create({
      data: {
        date: new Date(date),
        createdBy,
        incomeNotes: {
          create: incomeNotes.map((note) => ({ label: note.label, amount: Number(note.amount) })),
        },
        expenseNotes: {
          create: expenseNotes.map((note) => ({ label: note.label, amount: Number(note.amount) })),
        },
      },
      include: { incomeNotes: true, expenseNotes: true },
    });
    res.json(newRecord);
  } catch (err) {
    console.error("POST /dailyfinance error::", err);
    res.status(500).json({ error: "Failed to create record" });
  }
});

// ✅ GET /v1/dailyfinance/:id - ดูรายละเอียดรายการเดียว
router.get("/:id", async (req, res) => {
  try {
    const record = await prisma.dailyFinance.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { incomeNotes: true, expenseNotes: true },
    });
    if (!record) return res.status(404).json({ error: "Not found" });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch record" });
  }
});

// ✅ PUT /v1/dailyfinance/:id - แก้ไขทั้งชุด
router.put("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { date, createdBy, incomeNotes = [], expenseNotes = [] } = req.body;
  try {
    await prisma.incomeNote.deleteMany({ where: { dailyFinanceId: id } });
    await prisma.expenseNote.deleteMany({ where: { dailyFinanceId: id } });

    const updated = await prisma.dailyFinance.update({
      where: { id },
      data: {
        date: new Date(date),
        createdBy,
        incomeNotes: {
          create: incomeNotes.map((note) => ({ label: note.label, amount: Number(note.amount) })),
        },
        expenseNotes: {
          create: expenseNotes.map((note) => ({ label: note.label, amount: Number(note.amount) })),
        },
      },
      include: { incomeNotes: true, expenseNotes: true },
    });
    res.json(updated);
  } catch (err) {
    console.error("PUT /dailyfinance error::", err);
    res.status(500).json({ error: "Update failed" });
  }
});

// ✅ DELETE /v1/dailyfinance/:id - ลบรายการทั้งหมด
router.delete("/:id", async (req, res) => {
  try {
    await prisma.incomeNote.deleteMany({ where: { dailyFinanceId: parseInt(req.params.id) } });
    await prisma.expenseNote.deleteMany({ where: { dailyFinanceId: parseInt(req.params.id) } });
    await prisma.dailyFinance.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "ลบสำเร็จ" });
  } catch (err) {
    res.status(500).json({ error: "ลบไม่สำเร็จ" });
  }
});

// ✅ PATCH /v1/dailyfinance/:id/add-income - เพิ่มรายรับ
router.patch("/:id/add-income", async (req, res) => {
  const id = parseInt(req.params.id);
  const { label, amount } = req.body;
  try {
    const income = await prisma.incomeNote.create({
      data: { label, amount: Number(amount), dailyFinanceId: id },
    });
    res.json(income);
  } catch (err) {
    console.error("PATCH /add-income error::", err);
    res.status(500).json({ error: "เพิ่มรายรับไม่สำเร็จ" });
  }
});

// ✅ PATCH /v1/dailyfinance/:id/add-expense - เพิ่มรายจ่าย
router.patch("/:id/add-expense", async (req, res) => {
  const id = parseInt(req.params.id);
  const { label, amount } = req.body;
  try {
    const expense = await prisma.expenseNote.create({
      data: { label, amount: Number(amount), dailyFinanceId: id },
    });
    res.json(expense);
  } catch (err) {
    console.error("PATCH /add-expense error::", err);
    res.status(500).json({ error: "เพิ่มรายจ่ายไม่สำเร็จ" });
  }
});

// ✅ DELETE /v1/incomenote/:id - ลบรายรับเฉพาะรายการ
router.delete("/incomenote/:id", async (req, res) => {
  try {
    await prisma.incomeNote.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "ลบรายรับเรียบร้อย" });
  } catch (err) {
    res.status(500).json({ error: "ลบรายรับไม่สำเร็จ" });
  }
});

// ✅ DELETE /v1/expensenote/:id - ลบรายจ่ายเฉพาะรายการ
router.delete("/expensenote/:id", async (req, res) => {
  try {
    await prisma.expenseNote.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "ลบรายจ่ายเรียบร้อย" });
  } catch (err) {
    res.status(500).json({ error: "ลบรายจ่ายไม่สำเร็จ" });
  }
});

// ✅ PATCH /v1/incomenote/:id - แก้ไขรายรับ
router.patch("/incomenote/:id", async (req, res) => {
  const { label, amount } = req.body;
  try {
    const updated = await prisma.incomeNote.update({
      where: { id: parseInt(req.params.id) },
      data: { label, amount: Number(amount) },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "แก้ไขรายรับไม่สำเร็จ" });
  }
});

// ✅ PATCH /v1/expensenote/:id - แก้ไขรายจ่าย
router.patch("/expensenote/:id", async (req, res) => {
  const { label, amount } = req.body;
  try {
    const updated = await prisma.expenseNote.update({
      where: { id: parseInt(req.params.id) },
      data: { label, amount: Number(amount) },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "แก้ไขรายจ่ายไม่สำเร็จ" });
  }
});








































router.get("/:id/pdf", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const record = await prisma.dailyFinance.findUnique({
      where: { id },
      include: {
        incomeNotes: true,
        expenseNotes: true,
      },
    });

    if (!record) return res.status(404).send("ไม่พบข้อมูล");

    const doc = new PDFDocument();
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=daily-${record.date}.pdf`,
      });
      res.end(pdfData);
    });

    doc.fontSize(18).text("📘 รายงานรายวัน", { align: "center" });
    doc.moveDown();
    doc.fontSize(14).text(`วันที่: ${new Date(record.date).toLocaleDateString("th-TH")}`);
    doc.text(`ผู้จัดทำ: ${record.createdBy}`);
    doc.moveDown();

    doc.fontSize(16).text("📈 รายรับ");
    let totalIncome = 0;
    record.incomeNotes.forEach((item, i) => {
      doc.text(`${i + 1}. ${item.label} - ${item.amount.toLocaleString()} บาท`);
      totalIncome += item.amount;
    });

    doc.moveDown();
    doc.fontSize(16).text("📉 รายจ่าย");
    let totalExpense = 0;
    record.expenseNotes.forEach((item, i) => {
      doc.text(`${i + 1}. ${item.label} - ${item.amount.toLocaleString()} บาท`);
      totalExpense += item.amount;
    });

    doc.moveDown();
    doc.fontSize(14).text(`💰 คงเหลือ: ${(totalIncome - totalExpense).toLocaleString()} บาท`, { align: "right" });
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("เกิดข้อผิดพลาดในการสร้าง PDF");
  }
});

// ✅ สรุปรายเดือน (PDF)
router.get("/monthlypdf", async (req, res) => {
  try {
    const month = req.query.month; // format YYYY-MM
    if (!month) return res.status(400).send("ต้องระบุ ?month=YYYY-MM");

    const records = await prisma.dailyFinance.findMany({
      where: {
        date: {
          gte: new Date(`${month}-01`),
          lt: new Date(`${month}-31`),
        },
      },
      orderBy: { date: "asc" },
      include: {
        incomeNotes: true,
        expenseNotes: true,
      },
    });

    const doc = new PDFDocument();
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=summary-${month}.pdf`,
      });
      res.end(pdfData);
    });

    doc.fontSize(18).text(`📊 สรุปบันทึกรายเดือน ${month}`, { align: "center" });
    doc.moveDown();

    let totalIncome = 0;
    let totalExpense = 0;

    records.forEach((r) => {
      const income = r.incomeNotes.reduce((sum, n) => sum + n.amount, 0);
      const expense = r.expenseNotes.reduce((sum, n) => sum + n.amount, 0);
      totalIncome += income;
      totalExpense += expense;
      doc.fontSize(12).text(`📅 ${new Date(r.date).toLocaleDateString("th-TH")}: รายรับ ${income.toLocaleString()} - รายจ่าย ${expense.toLocaleString()} => คงเหลือ ${(income - expense).toLocaleString()} บาท`);
    });

    doc.moveDown();
    doc.fontSize(14).text(`รวมรายรับทั้งเดือน: ${totalIncome.toLocaleString()} บาท`);
    doc.text(`รวมรายจ่ายทั้งเดือน: ${totalExpense.toLocaleString()} บาท`);
    doc.text(`💰 คงเหลือสุทธิ: ${(totalIncome - totalExpense).toLocaleString()} บาท`, { align: "right" });
    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("ไม่สามารถสร้างสรุปรายเดือน PDF ได้");
  }
});

module.exports = router;
