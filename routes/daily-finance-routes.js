const express = require("express");
const router = express.Router();
const prisma = require("../models/prisma");

// ✅ GET /v1/dailyfinance - ดูทั้งหมดเรียงตามวันที่ใหม่สุด
router.get("/", async (req, res) => {
  try {
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

// ✅ PUT /v1/dailyfinance/:id - แก้ไข
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

module.exports = router;
