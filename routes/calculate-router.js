// 📁 routes/calculate-router.js
const express = require("express");
const router = express.Router();
const prisma = require("../models/prisma");
router.post("/", (req, res) => {
  const { totalWeight, basePrice, grades } = req.body;

  const parsedWeight = Number(totalWeight);
  const parsedBasePrice = Number(basePrice);

  let totalDeductions = 0;
  let deductedWeight = 0;

  for (const grade of grades) {
    const weight = Number(grade.weight || 0);
    const price = Number(grade.price || 0);
    totalDeductions += weight * price;
    deductedWeight += weight;
  }

  const netAmount = parsedWeight * parsedBasePrice - totalDeductions;
  const remainingWeight = parsedWeight - deductedWeight;

  const finalPrice =
    remainingWeight > 0 ? netAmount / remainingWeight : 0;

  res.json({
    netAmount,
    remainingWeight,
    finalPrice,
  });
});

































// 🔸 GET รายการทั้งหมด
router.get("/", async (req, res) => {
  try {
    const data = await prisma.gradeHistory.findMany({
      include: { grades: true },
      orderBy: { date: "desc" },
    });
    res.json(data);
  } catch (err) {
    console.error("โหลดข้อมูลไม่สำเร็จ", err);
    res.status(500).json({ error: "โหลดข้อมูลไม่สำเร็จ" });
  }
});

// 🔸 GET ดูรายการเดียว
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const item = await prisma.gradeHistory.findUnique({
      where: { id },
      include: { grades: true },
    });

    if (!item) return res.status(404).json({ error: "ไม่พบข้อมูล" });
    res.json(item);
  } catch (err) {
    console.error("ดึงข้อมูลล้มเหลว", err);
    res.status(500).json({ error: "ไม่สามารถโหลดข้อมูลได้" });
  }
});

// 🔸 POST เพิ่มใหม่
router.post("/history", async (req, res) => {
  try {
    const {
      farmName,
      date,
      totalWeight,
      basePrice,
      netAmount,
      finalPrice,
      remainingWeight,
      grades,
    } = req.body;

    const item = await prisma.gradeHistory.create({
      data: {
        farmName,
        date: new Date(date),
        totalWeight: parseFloat(totalWeight),
        basePrice: parseFloat(basePrice),
        netAmount: parseFloat(netAmount),
        finalPrice: parseFloat(finalPrice),
        remainingWeight: parseFloat(remainingWeight),
        grades: {
          create: grades.map((g) => ({
            name: g.name,
            weight: parseFloat(g.weight),
            price: parseFloat(g.price),
          })),
        },
      },
    });

    res.json({ success: true, id: item.id });
  } catch (err) {
    console.error("เพิ่มข้อมูลล้มเหลว", err);
    res.status(500).json({ error: "เพิ่มข้อมูลไม่สำเร็จ", detail: err.message });
  }
});

// 🔸 PUT แก้ไข
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const {
      farmName,
      date,
      totalWeight,
      basePrice,
      netAmount,
      finalPrice,
      remainingWeight,
      grades,
    } = req.body;

    // ลบเก่า
    await prisma.grade.deleteMany({ where: { gradeHistoryId: id } });

    // อัปเดตหัวตาราง
    await prisma.gradeHistory.update({
      where: { id },
      data: {
        farmName,
        date: new Date(date),
        totalWeight: parseFloat(totalWeight),
        basePrice: parseFloat(basePrice),
        netAmount: parseFloat(netAmount),
        finalPrice: parseFloat(finalPrice),
        remainingWeight: parseFloat(remainingWeight),
        grades: {
          create: grades.map((g) => ({
            name: g.name,
            weight: parseFloat(g.weight),
            price: parseFloat(g.price),
          })),
        },
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("แก้ไขล้มเหลว", err);
    res.status(500).json({ error: "แก้ไขไม่สำเร็จ", detail: err.message });
  }
});

// 🔸 DELETE ลบ
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await prisma.grade.deleteMany({ where: { gradeHistoryId: id } });
    await prisma.gradeHistory.delete({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    console.error("ลบล้มเหลว", err);
    res.status(500).json({ error: "ลบไม่สำเร็จ", detail: err.message });
  }
});

module.exports = router;



