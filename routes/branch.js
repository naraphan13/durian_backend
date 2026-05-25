const express = require("express");
const prisma = require("../models/prisma");
const router = express.Router();

// ✅ GET /v1/branches - ดูสาขาทั้งหมด
router.get("/", async (req, res) => {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { name: "asc" },
    });

    res.json(branches);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch branches" });
  }
});

// ✅ POST /v1/branches - เพิ่มสาขาใหม่
router.post("/", async (req, res) => {
  const { name } = req.body;

  try {
    const branch = await prisma.branch.create({
      data: { name },
    });

    res.json(branch);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create branch" });
  }
});

module.exports = router;