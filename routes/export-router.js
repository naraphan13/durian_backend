const express = require("express");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const util = require("util");
const prisma = require("../models/prisma");

const router = express.Router();


// ✅ CREATE PDF จากข้อมูลที่ส่งมาจาก frontend
router.post("/exportpdf", async (req, res) => {
  const data = req.body;

  const doc = new PDFDocument({
    size: [841.89, 1400],
    margin: 50,
  });

  const buffers = [];

  doc.on("data", buffers.push.bind(buffers));

  doc.on("end", () => {
    const pdfData = Buffer.concat(buffers);

    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=export-${data.date}.pdf`,
      "Content-Length": pdfData.length,
    });

    res.end(pdfData);
  });

  const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
  const fontBold = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");

  if (fs.existsSync(fontPath)) {
    doc.registerFont("thai", fontPath).font("thai");
  }

  if (fs.existsSync(fontBold)) {
    doc.registerFont("thai-bold", fontBold);
  }

  const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");

  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, 50, 50, {
      width: 80,
    });
  }

  doc
    .font("thai-bold")
    .fontSize(26)
    .text(
      "ใบส่งออกทุเรียน SURIYA 388 / Durian Export Invoice - SURIYA 388",
      0,
      50,
      {
        align: "center",
      }
    );

  doc
    .font("thai-bold")
    .fontSize(30)
    .text(`วันที่ / Date: ${data.date}`, 150, 150);

  doc.text(`ปลายทาง / Destination: ${data.city}`);
  doc.text(`ตู้ / Container: ${data.containerInfo}`);
  doc.text(`รหัสตู้ / Container Code: ${data.containerCode}`);
  doc.text(`รหัสอ้างอิง / Reference Code: ${data.refCode}`);
  doc.moveDown();

  doc
    .font("thai-bold")
    .fontSize(24)
    .text("รายการทุเรียน / Durian Items", {
      underline: true,
    });

  doc.moveDown();

  doc.font("thai-bold").fontSize(18);

  data.durianItems.forEach((item, i) => {
    const boxes = Number(item.boxes || 0);
    const weightPerBox = Number(item.weightPerBox || 0);
    const pricePerKg = Number(item.pricePerKg || 0);

    const totalWeight = boxes * weightPerBox;
    const totalPrice = totalWeight * pricePerKg;

    doc.text(
      `${i + 1}. ${item.variety} เกรด ${item.grade} | ${boxes} กล่อง × ${weightPerBox} กก. = ${totalWeight} กก. × ${pricePerKg} บาท = ${totalPrice.toLocaleString()} บาท`
    );
  });

  if (data.freightItems?.length) {
    doc
      .moveDown()
      .font("thai-bold")
      .fontSize(24)
      .text("ค่าน้ำหนักซิ / Freight Charges", {
        underline: true,
      });

    data.freightItems.forEach((item, i) => {
      const weight = Number(item.weight || 0);
      const pricePerKg = Number(item.pricePerKg || 0);
      const subtotal = weight * pricePerKg;

      doc
        .font("thai-bold")
        .fontSize(18)
        .text(
          `${i + 1}. ${item.variety} เกรด ${item.grade} | น้ำหนัก ${weight} กก. × ${pricePerKg} บาท = ${subtotal.toLocaleString()} บาท`
        );
    });
  }

  doc
    .moveDown()
    .font("thai-bold")
    .fontSize(24)
    .text("ค่าจัดการกล่อง / Handling Costs");

  Object.entries(data.handlingCosts || {}).forEach(([size, cost]) => {
    const weight = Number(cost.weight || 0);
    const costPerKg = Number(cost.costPerKg || 0);
    const total = weight * costPerKg;

    doc
      .font("thai-bold")
      .fontSize(18)
      .text(
        `${size}: น้ำหนักรวม ${weight} กก. × ${costPerKg} บาท = ${total.toLocaleString()} บาท`
      );
  });

  doc
    .moveDown()
    .font("thai-bold")
    .fontSize(24)
    .text("ค่ากล่อง / Box Costs");

  Object.entries(data.boxCosts || {}).forEach(([size, box]) => {
    const quantity = Number(box.quantity || 0);
    const unitCost = Number(box.unitCost || 0);
    const total = quantity * unitCost;

    doc
      .font("thai-bold")
      .fontSize(18)
      .text(
        `${size}: ${quantity} กล่อง × ${unitCost} = ${total.toLocaleString()} บาท`
      );
  });

  const inspectionFee = Number(data.inspectionFee || 0);

  doc
    .moveDown()
    .font("thai-bold")
    .fontSize(24)
    .text(
      `ค่าตรวจสาร / Inspection Fee: ${inspectionFee.toLocaleString()} บาท`
    );

  let total = inspectionFee;

  Object.values(data.handlingCosts || {}).forEach((c) => {
    total += Number(c.weight || 0) * Number(c.costPerKg || 0);
  });

  Object.values(data.boxCosts || {}).forEach((c) => {
    total += Number(c.quantity || 0) * Number(c.unitCost || 0);
  });

  data.durianItems?.forEach((d) => {
    total +=
      Number(d.boxes || 0) *
      Number(d.weightPerBox || 0) *
      Number(d.pricePerKg || 0);
  });

  data.freightItems?.forEach((item) => {
    total += Number(item.weight || 0) * Number(item.pricePerKg || 0);
  });

  doc
    .moveDown()
    .font("thai-bold")
    .fontSize(26)
    .text(`รวมยอด / Total: ${total.toLocaleString()} บาท`, {
      align: "right",
    });

  doc.moveDown(1);

  if (data.brandSummary?.trim()) {
    doc
      .font("thai-bold")
      .fontSize(28)
      .text("สรุปกล่องตามแบรนด์ / Brand-wise Box Summary", {
        underline: true,
        align: "center",
      });

    doc.moveDown();

    doc
      .font("thai-bold")
      .fontSize(20)
      .text(data.brandSummary);
  }

  doc.end();
});


// ✅ CREATE: บันทึกเอกสาร Export Container
router.post("/", async (req, res) => {
  try {
    const newExport = await prisma.exportContainer.create({
      data: {
        date: req.body.date,
        city: req.body.city,
        containerInfo: req.body.containerInfo,
        containerCode: req.body.containerCode,
        refCode: req.body.refCode,
        durianItems: req.body.durianItems || [],
        freightItems: req.body.freightItems || [],
        handlingCosts: req.body.handlingCosts || {},
        boxCosts: req.body.boxCosts || {},
        inspectionFee: Number(req.body.inspectionFee || 0),
        brandSummary: req.body.brandSummary || "",

        // ✅ ใช้ seasonId จาก frontend โดยตรง
        seasonId: req.body.seasonId ? Number(req.body.seasonId) : null,
      },
      include: {
        season: {
          include: {
            branch: true,
          },
        },
      },
    });

    res.json(newExport);
  } catch (err) {
    console.error("❌ POST /v1/export error::", err);

    res.status(500).json({
      error: "เกิดข้อผิดพลาดในการบันทึก",
      details: err,
    });
  }
});


// ✅ READ ALL: รองรับ ?seasonId=...
router.get("/", async (req, res) => {
  try {
    const seasonId = req.query.seasonId
      ? parseInt(req.query.seasonId)
      : null;

    const exports = await prisma.exportContainer.findMany({
      where: seasonId
        ? {
            seasonId,
          }
        : {},
      orderBy: {
        date: "desc",
      },
      include: {
        season: {
          include: {
            branch: true,
          },
        },
      },
    });

    res.json(exports);
  } catch (err) {
    console.error("❌ GET /v1/export error::", err);

    res.status(500).json({
      error: "ไม่สามารถดึงรายการได้",
      details: err,
    });
  }
});


// ✅ READ ONE
router.get("/:id", async (req, res) => {
  try {
    const exportDoc = await prisma.exportContainer.findUnique({
      where: {
        id: parseInt(req.params.id),
      },
      include: {
        season: {
          include: {
            branch: true,
          },
        },
      },
    });

    if (!exportDoc) {
      return res.status(404).json({
        error: "ไม่พบเอกสารนี้",
      });
    }

    res.json(exportDoc);
  } catch (err) {
    console.error("❌ GET /v1/export/:id error::", err);

    res.status(500).json({
      error: "ไม่พบเอกสารนี้",
      details: err,
    });
  }
});


// ✅ UPDATE: อัปเดตเอกสาร Export Container
router.put("/:id", async (req, res) => {
  try {
    const updated = await prisma.exportContainer.update({
      where: {
        id: parseInt(req.params.id),
      },
      data: {
        date: req.body.date,
        city: req.body.city,
        containerInfo: req.body.containerInfo,
        containerCode: req.body.containerCode,
        refCode: req.body.refCode,
        durianItems: req.body.durianItems || [],
        freightItems: req.body.freightItems || [],
        handlingCosts: req.body.handlingCosts || {},
        boxCosts: req.body.boxCosts || {},
        inspectionFee: Number(req.body.inspectionFee || 0),
        brandSummary: req.body.brandSummary || "",

        // ✅ ใช้ seasonId จาก frontend โดยตรง
        seasonId: req.body.seasonId ? Number(req.body.seasonId) : null,
      },
      include: {
        season: {
          include: {
            branch: true,
          },
        },
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("❌ PUT /v1/export/:id error::", err);

    res.status(500).json({
      error: "อัปเดตไม่สำเร็จ",
      details: err,
    });
  }
});


// ✅ DELETE: ลบเอกสารตาม ID
router.delete("/:id", async (req, res) => {
  try {
    await prisma.exportContainer.delete({
      where: {
        id: parseInt(req.params.id),
      },
    });

    res.json({
      message: "ลบสำเร็จ",
    });
  } catch (err) {
    console.error("❌ DELETE /v1/export/:id error::", err);

    res.status(500).json({
      error: "ลบไม่สำเร็จ",
      details: err,
    });
  }
});


// ✅ SUMMARY PDF
router.get("/summarypdf", async (req, res) => {
  const seasonId = parseInt(req.query.seasonId);

  if (!seasonId) {
    return res.status(400).send("seasonId required");
  }

  try {
    console.log("📌 เริ่มสร้าง PDF สำหรับ seasonId:", seasonId);

    const season = await prisma.season.findUnique({
      where: {
        id: seasonId,
      },
      include: {
        branch: true,
      },
    });

    if (!season) {
      return res.status(404).send("Season not found");
    }

    console.log("✅ Season:", season);

    const exports = await prisma.exportContainer.findMany({
      where: {
        seasonId,
      },
      include: {
        season: {
          include: {
            branch: true,
          },
        },
      },
    });

    console.log("✅ พบ export:", exports.length);

    const doc = new PDFDocument({
      size: "A4",
      margin: 40,
    });

    const buffers = [];

    doc.on("data", buffers.push.bind(buffers));

    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);

      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=summary-season-${seasonId}.pdf`,
        "Content-Length": pdfData.length,
      });

      res.end(pdfData);
    });

    doc.on("error", (err) => {
      console.error("❌ PDFKit generation error:", err);
    });

    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBold = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");

    if (fs.existsSync(fontPath)) {
      doc.registerFont("thai", fontPath).font("thai");
    }

    if (fs.existsSync(fontBold)) {
      doc.registerFont("thai-bold", fontBold);
    }

    doc
      .font("thai-bold")
      .fontSize(20)
      .text(
        `📦 รายงานสรุปการส่งออกทุเรียน - ฤดูกาล ${season.name}`,
        {
          align: "center",
        }
      );

    doc.moveDown();

    doc
      .font("thai-bold")
      .fontSize(14)
      .text(`สาขา: ${season.branch?.name || "-"}`);

    doc
      .font("thai-bold")
      .fontSize(14)
      .text(
        `ช่วงเวลา: ${new Date(season.startDate).toLocaleDateString("th-TH")} - ${
          season.endDate
            ? new Date(season.endDate).toLocaleDateString("th-TH")
            : "ปัจจุบัน"
        }`
      );

    doc.moveDown();

    let totalSum = 0;

    exports.forEach((exp, i) => {
      console.log(`🔍 export ID ${exp.id}`);

      let durianTotal = 0;

      try {
        const durians = Array.isArray(exp.durianItems)
          ? exp.durianItems
          : JSON.parse(exp.durianItems || "[]");

        durianTotal = durians.reduce((sum, d) => {
          return (
            sum +
            Number(d.boxes || 0) *
              Number(d.weightPerBox || 0) *
              Number(d.pricePerKg || 0)
          );
        }, 0);
      } catch (e) {
        console.warn(`⚠️ durianItems format invalid for export ID ${exp.id}`);
      }

      let boxTotal = 0;

      try {
        const boxes =
          typeof exp.boxCosts === "object"
            ? exp.boxCosts
            : JSON.parse(exp.boxCosts || "{}");

        boxTotal = Object.values(boxes).reduce((sum, b) => {
          return sum + Number(b.quantity || 0) * Number(b.unitCost || 0);
        }, 0);
      } catch (e) {
        console.warn(`⚠️ boxCosts format invalid for export ID ${exp.id}`);
      }

      let handleTotal = 0;

      try {
        const handlers =
          typeof exp.handlingCosts === "object"
            ? exp.handlingCosts
            : JSON.parse(exp.handlingCosts || "{}");

        handleTotal = Object.values(handlers).reduce((sum, h) => {
          return sum + Number(h.weight || 0) * Number(h.costPerKg || 0);
        }, 0);
      } catch (e) {
        console.warn(`⚠️ handlingCosts format invalid for export ID ${exp.id}`);
      }

      let freightTotal = 0;

      try {
        const freights = Array.isArray(exp.freightItems)
          ? exp.freightItems
          : JSON.parse(exp.freightItems || "[]");

        freightTotal = freights.reduce((sum, f) => {
          return sum + Number(f.weight || 0) * Number(f.pricePerKg || 0);
        }, 0);
      } catch (e) {
        console.warn(`⚠️ freightItems format invalid for export ID ${exp.id}`);
      }

      const inspectionFee = Number(exp.inspectionFee || 0);

      const total =
        durianTotal +
        boxTotal +
        handleTotal +
        freightTotal +
        inspectionFee;

      totalSum += total;

      try {
        doc
          .font("thai")
          .fontSize(12)
          .text(
            `${i + 1}. วันที่: ${exp.date} | เมือง: ${exp.city} | รหัสตู้: ${exp.containerCode} | รวม: ${Number(total).toLocaleString()} บาท`
          );
      } catch (err) {
        console.warn(`⚠️ export ID ${exp.id} render failed`, err);
      }
    });

    doc.moveDown();

    doc
      .font("thai-bold")
      .fontSize(16)
      .text(`รวมยอดทั้งฤดูกาล: ${Number(totalSum).toLocaleString()} บาท`, {
        align: "right",
      });

    doc.end();
  } catch (err) {
    console.error("/summarypdf error::", util.inspect(err, { depth: null }));

    res.status(500).send("เกิดข้อผิดพลาดขณะสร้าง PDF");
  }
});


module.exports = router;