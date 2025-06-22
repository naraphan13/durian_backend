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











































// ✅ รายงานรายวัน (PDF พร้อมหัวกระดาษ)
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

    const doc = new PDFDocument({ size: [396, 648], layout: "landscape", margin: 20 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=daily-${record.date}.pdf`,
      });
      res.end(pdfData);
    });

    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath).font("thai");
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    // ==== HEADER ====
    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const logoSize = 70;
    const topY = 20;
    const logoX = 20;
    const logoY = topY + 10;
    const companyX = logoX + logoSize + 15;
    const infoX = companyX + 250;

    const createdDate = new Date();
    const bangkokTime = new Date(createdDate.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));

    const recordDateInBangkok = new Date(
      new Date(record.date).toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
    );

    const dateStr = recordDateInBangkok.toLocaleDateString("th-TH", {
      day: "numeric", month: "long", year: "numeric",
    });
    const timeStr = bangkokTime.toLocaleTimeString("th-TH", {
      hour: "2-digit", minute: "2-digit", hour12: false,
    });

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }

    doc.font("thai").fontSize(13).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.text("เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190", companyX, topY + 18);
    doc.text("โทร: 081-078-2324 , 082-801-1225 , 095-905-5588", companyX, topY + 36);

    doc.font("thai").fontSize(13).text(`วันที่: ${dateStr} `, infoX, topY);

    doc.moveDown(2);
    doc.font("thai-bold").fontSize(17).text("ใบสรุปรายวัน / Daily Financial Report", 0, doc.y, {
      align: "center",
      width: fullWidth,
    });

    // รวมรายการทั้งหมดเข้าอาร์เรย์เดียว พร้อมประเภท
    const allNotes = [
      ...record.incomeNotes.map(n => ({ ...n, type: "income" })),
      ...record.expenseNotes.map(n => ({ ...n, type: "expense" })),
    ];

    // เรียงตามเวลา createdAt หากมี หรือ id (fallback)
    allNotes.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : a.id;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : b.id;
      return aTime - bTime;
    });

    let totalIncome = 0;
    let totalExpense = 0;

    doc.moveDown(1);
    allNotes.forEach((item, i) => {
      const prefix = item.type === "income" ? "รายรับ" : "รายจ่าย";
      const line = `${i + 1}. ${item.label} - ${item.amount.toLocaleString()} บาท`;
      doc.font("thai").fontSize(14).text(`${prefix} ${line}`, 40);
      if (item.type === "income") totalIncome += item.amount;
      else totalExpense += item.amount;
    });

    const net = totalIncome - totalExpense;
    doc.moveDown(1);
    doc.font("thai-bold").fontSize(16).text(` คงเหลือ: ${net.toLocaleString()} บาท`, { align: "right" });

    // ==== SIGNATURE ====
    const sigY = doc.page.height - 60;
    doc.fontSize(11).text("...............................................", 40, sigY);
    doc.text("ผู้จัดทำ: " + record.createdBy, 40, sigY + 12);
    doc.text("ลงวันที่: ........../........../..........", 40, sigY + 24);

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("เกิดข้อผิดพลาดในการสร้าง PDF");
  }
});



// ✅ รายงานสรุปรายเดือน (ตามรูปแบบ cuttingBill)
router.get("/monthlypdf", async (req, res) => {
  try {
    const month = req.query.month;
    if (!month) return res.status(400).send("ต้องระบุ ?month=YYYY-MM");

    const records = await prisma.dailyFinance.findMany({
      where: {
        date: {
          gte: new Date(`${month}-01T00:00:00.000Z`),
          lt: new Date(`${month}-31T23:59:59.999Z`),
        },
      },
      orderBy: { date: "asc" },
      include: {
        incomeNotes: true,
        expenseNotes: true,
      },
    });

    const doc = new PDFDocument({ size: [396, 648], layout: "landscape", margin: 20 });
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename=summary-${month}.pdf`,
      });
      res.end(pdfData);
    });

    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath).font("thai");
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const logoSize = 70;
    const topY = 20;
    const logoX = 20;
    const logoY = topY + 10;
    const companyX = logoX + logoSize + 15;
    const infoX = companyX + 250;
    const now = new Date();
    const printDateStr = now.toLocaleDateString("th-TH");
    const timeStr = now.toLocaleTimeString("th-TH", {
      hour: "2-digit", minute: "2-digit", hour12: false,
    });

    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, logoX, logoY, { fit: [logoSize, logoSize] });
    }

    doc.font("thai").fontSize(13).text("บริษัท สุริยา388 จำกัด", companyX, topY);
    doc.text("เลขที่ 203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190", companyX, topY + 18);
    doc.text("โทร: 081-078-2324 , 082-801-1225 , 095-905-5588", companyX, topY + 36);

    doc.font("thai").fontSize(13).text(`พิมพ์เมื่อ: ${printDateStr} เวลา: ${timeStr}`, infoX, topY);

    doc.moveDown(2);
    doc.font("thai-bold").fontSize(17).text(`สรุปบันทึกรายเดือน ${month}`, {
      align: "center",
      width: fullWidth,
    });

    let totalIncome = 0;
    let totalExpense = 0;

    records.forEach((r, idx) => {
      const income = r.incomeNotes.reduce((sum, n) => sum + n.amount, 0);
      const expense = r.expenseNotes.reduce((sum, n) => sum + n.amount, 0);
      totalIncome += income;
      totalExpense += expense;
      doc.font("thai-bold").fontSize(14).text(
        `${idx + 1}. ${new Date(r.date).toLocaleDateString("th-TH")} | รายรับ ${income.toLocaleString()} - รายจ่าย ${expense.toLocaleString()} = คงเหลือ ${(income - expense).toLocaleString()} บาท`,
        20
      );
    });

    const net = totalIncome - totalExpense;
    doc.moveDown(1);
    doc.font("thai-bold").fontSize(16).text(`รวมรายรับทั้งเดือน: ${totalIncome.toLocaleString()} บาท`, 20);
    doc.font("thai-bold").fontSize(16).text(`รวมรายจ่ายทั้งเดือน: ${totalExpense.toLocaleString()} บาท`, 20);
    doc.font("thai-bold").fontSize(16).text(`💰 คงเหลือสุทธิ: ${net.toLocaleString()} บาท`, {
      align: "right",
    });

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).send("ไม่สามารถสร้างสรุปรายเดือน PDF ได้");
  }
});

module.exports = router;



