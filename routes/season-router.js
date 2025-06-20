const express = require("express");
const prisma = require("../models/prisma");
const router = express.Router();

// ✅ GET /v1/seasons - ดูฤดูกาลทั้งหมด
router.get("/", async (req, res) => {
  try {
    const seasons = await prisma.season.findMany({
      orderBy: { startDate: "desc" },
    });
    res.json(seasons);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch seasons" });
  }
});

// ✅ POST /v1/seasons - เพิ่มฤดูกาลใหม่
router.post("/", async (req, res) => {
  const { name, startDate, endDate } = req.body;
  try {
    const newSeason = await prisma.season.create({
      data: {
        name,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
      },
    });
    res.json(newSeason);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create season" });
  }
});

// ✅ PUT /v1/seasons/:id - แก้ไขชื่อ, วันที่เริ่ม, วันที่สิ้นสุด
router.put("/:id", async (req, res) => {
  const seasonId = parseInt(req.params.id);
  const { name, startDate, endDate } = req.body;

  try {
    const updated = await prisma.season.update({
      where: { id: seasonId },
      data: {
        name,
        startDate: new Date(startDate),
        endDate: endDate ? new Date(endDate) : null,
      },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update season" });
  }
});

// ✅ DELETE /v1/seasons/:id - ลบฤดูกาล
router.delete("/:id", async (req, res) => {
  const seasonId = parseInt(req.params.id);
  try {
    await prisma.season.delete({ where: { id: seasonId } });
    res.json({ message: "ลบฤดูกาลสำเร็จ" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "ลบฤดูกาลไม่สำเร็จ" });
  }
});

module.exports = router;
