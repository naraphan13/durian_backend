// 📁 routes/payroll-router.js
const express = require("express");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const prisma = require("../models/prisma");

const router = express.Router();

// 🔸 GET รายการทั้งหมด
router.get("/", async (req, res) => {
  try {
    const data = await prisma.payroll.findMany({
      include: { deductions: true },
      orderBy: { date: "desc" },
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "โหลดข้อมูลไม่สำเร็จ" });
  }
});

// 🔸 GET รายการเดียว
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const data = await prisma.payroll.findUnique({
      where: { id },
      include: { deductions: true },
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "โหลดข้อมูลไม่สำเร็จ" });
  }
});

// 🔸 POST สร้างใหม่
router.post("/", async (req, res) => {
  try {
    const {
      name,
      date,
      method,
      payType,
      period,
      workDays,
      pricePerDay,
      monthlySalary,
      months,
      deductions = [],
    } = req.body;

    const totalPay = payType === "รายวัน"
      ? Number(workDays) * Number(pricePerDay)
      : Number(monthlySalary) * Number(months || 1);

    const totalDeduct = (deductions || []).reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const netPay = totalPay - totalDeduct;

    const payroll = await prisma.payroll.create({
      data: {
        employeeName: name,
        date: new Date(date),
        method,
        payType,
        period,
        workDays: workDays ? Number(workDays) : null,
        pricePerDay: pricePerDay ? Number(pricePerDay) : null,
        monthlySalary: monthlySalary ? Number(monthlySalary) : null,
        months: months ? Number(months) : null,
        totalPay,
        totalDeduct,
        netPay,
        deductions: {
          create: (deductions || []).map(d => ({
            name: d.name,
            amount: Number(d.amount),
          })),
        },
      },
    });

    // ✅ PDF ตอบกลับทันที
    generatePayrollPdf(res, payroll.id);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "บันทึกไม่สำเร็จ" });
  }
});

// 🔸 PUT แก้ไข
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const {
      name,
      date,
      method,
      payType,
      period,
      workDays,
      pricePerDay,
      monthlySalary,
      months,
      deductions = [],
    } = req.body;

    const totalPay = payType === "รายวัน"
      ? Number(workDays) * Number(pricePerDay)
      : Number(monthlySalary) * Number(months || 1);

    const totalDeduct = (deductions || []).reduce((sum, d) => sum + Number(d.amount || 0), 0);
    const netPay = totalPay - totalDeduct;

    await prisma.deduction.deleteMany({ where: { payrollId: id } });

    await prisma.payroll.update({
      where: { id },
      data: {
        employeeName: name,
        date: new Date(date),
        method,
        payType,
        period,
        workDays: workDays ? Number(workDays) : null,
        pricePerDay: pricePerDay ? Number(pricePerDay) : null,
        monthlySalary: monthlySalary ? Number(monthlySalary) : null,
        months: months ? Number(months) : null,
        totalPay,
        totalDeduct,
        netPay,
        deductions: {
          create: (deductions || []).map(d => ({
            name: d.name,
            amount: Number(d.amount),
          })),
        },
      },
    });

    generatePayrollPdf(res, id);
  } catch (err) {
    res.status(500).json({ error: "แก้ไขไม่สำเร็จ" });
  }
});

// 🔸 DELETE
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.deduction.deleteMany({ where: { payrollId: id } });
    await prisma.payroll.delete({ where: { id } });
    res.json({ message: "ลบสำเร็จ" });
  } catch (err) {
    res.status(500).json({ error: "ลบไม่สำเร็จ" });
  }
});

// 🔸 GET PDF
router.get("/:id/pdf", async (req, res) => {
  const id = Number(req.params.id);
  generatePayrollPdf(res, id);
});

// 🔸 ฟังก์ชันสร้าง PDF
async function generatePayrollPdf(res, id) {
  try {
    const data = await prisma.payroll.findUnique({
      where: { id },
      include: { deductions: true },
    });

    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBoldPath = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");
    if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath).font("thai");
    if (fs.existsSync(fontBoldPath)) doc.registerFont("thai-bold", fontBoldPath);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=payroll-${id}.pdf`);
    doc.pipe(res);

    doc.font("thai-bold").fontSize(19).text("บริษัท สุริยา388 จำกัด", { align: "center" });
    doc.font("thai").fontSize(14).text("203/2 ม.12 ต.บ้านนา อ.เมืองชุมพร จ.ชุมพร 86190", { align: "center" });
    doc.text("โทร: 081-078-2324 , 082-801-1225 , 095-905-5588", { align: "center" });
    doc.moveDown();

    const dateStr = new Date(data.date).toLocaleDateString("th-TH");
    doc.text(`วันที่: ${dateStr}`);
    doc.moveDown();
    doc.font("thai-bold").fontSize(18).text("ใบจ่ายเงินเดือนพนักงาน", { align: "center" });
    doc.moveDown();
    doc.font("thai").fontSize(14);
    doc.text(`ชื่อพนักงาน: ${data.employeeName}`);
    doc.text(`จ่ายโดย: ${data.method}`);
    doc.text(`งวดการทำงาน: ${data.period}`);

    if (data.payType === "รายวัน") {
      doc.text(`จำนวนวันที่ทำงาน: ${data.workDays} วัน × ${data.pricePerDay} บาท = ${data.totalPay.toLocaleString()} บาท`);
    } else {
      doc.text(`เงินเดือน: ${data.monthlySalary?.toLocaleString()} บาท × ${data.months} เดือน = ${data.totalPay.toLocaleString()} บาท`);
    }

    doc.moveDown();
    doc.font("thai-bold").text("รายการหัก:");
    doc.font("thai");
    data.deductions.forEach((d, i) => {
      doc.text(`${i + 1}. ${d.name} จำนวนเงิน ${d.amount.toLocaleString()} บาท`);
    });

    doc.moveDown();
    doc.font("thai-bold").text(`คงเหลือสุทธิ: ${data.netPay.toLocaleString()} บาท`, { align: "right" });
    doc.moveDown(2);
    doc.text("ลงชื่อ....................................................... (ผู้จ่ายเงิน)", 70);
    doc.text("ลงชื่อ....................................................... (ผู้รับเงิน)", 350);
    doc.moveDown();
    doc.text("วันที่........................................", 70);
    doc.text("วันที่........................................", 350);

    doc.end();
  } catch (err) {
    res.status(500).send("ไม่สามารถสร้าง PDF ได้");
  }
}

module.exports = router;