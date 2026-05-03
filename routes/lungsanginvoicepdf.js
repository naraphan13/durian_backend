const express = require("express");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const prisma = require("../models/prisma");

const router = express.Router();

function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function thDate(d) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("th-TH");
  } catch {
    return String(d || "");
  }
}

function toDateOnly(d) {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function formatNumber(v, digits = 0) {
  const n = safeNumber(v, 0);
  return digits > 0
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : n.toLocaleString();
}

function registerFonts(doc) {
  const thRegular = path.join(__dirname, "../fonts/THSarabunNew.ttf");
  const thBold = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");

  if (fs.existsSync(thRegular)) {
    doc.registerFont("th", thRegular);
  }

  if (fs.existsSync(thBold)) {
    doc.registerFont("th-bold", thBold);
  }

  if (fs.existsSync(thRegular)) {
    doc.font("th");
  }
}

function buildLungSangPDF(res, invoice) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 32,
  });

  const buffers = [];

  doc.on("data", buffers.push.bind(buffers));
  doc.on("end", () => {
    const pdfData = Buffer.concat(buffers);

    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=lungsang-invoice-${invoice.id}.pdf`,
      "Content-Length": pdfData.length,
    });

    res.end(pdfData);
  });

  registerFonts(doc);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;
  const bottom = pageH - doc.page.margins.bottom;

  const red = "#cc0000";
  const gray = "#cccccc";
  const lightGray = "#eeeeee";

  const logoPresets = {
    logo1: path.join(__dirname, "../picture/S__5275654png (1).png"),
    logo2: path.join(__dirname, "../picture/dos.png"),
    logo3: path.join(__dirname, "../picture/logo2.png"),
  };

  let logoPath = null;
  if (
    invoice.companyLogoKey &&
    logoPresets[invoice.companyLogoKey] &&
    fs.existsSync(logoPresets[invoice.companyLogoKey])
  ) {
    logoPath = logoPresets[invoice.companyLogoKey];
  }

  const usedDate = invoice.shipDate || invoice.date || new Date();
  const docType = String(invoice.docType || "INVOICE").toUpperCase();

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const rate = safeNumber(invoice.rate, 0);

  let totalBoxes = 0;
  let totalWeight = 0;
  let subtotal = 0;

  items.forEach((it) => {
    const boxes = safeNumber(it.boxes, 0);
    const weightPerBox = safeNumber(it.weightPerBox, 0);
    const weightTotal =
      safeNumber(it.weightTotalKg, 0) > 0
        ? safeNumber(it.weightTotalKg, 0)
        : boxes * weightPerBox;

    const unitPrice = safeNumber(it.unitPrice, 0);
    const amount =
      safeNumber(it.amount, 0) > 0
        ? safeNumber(it.amount, 0)
        : weightTotal * unitPrice;

    totalBoxes += boxes;
    totalWeight += weightTotal;
    subtotal += amount;
  });

  if (safeNumber(invoice.totalBoxes, 0) > 0) totalBoxes = safeNumber(invoice.totalBoxes, 0);
  if (safeNumber(invoice.totalWeightKg, 0) > 0) totalWeight = safeNumber(invoice.totalWeightKg, 0);
  if (safeNumber(invoice.subtotalAmount, 0) > 0) subtotal = safeNumber(invoice.subtotalAmount, 0);

  let expenseAmount = totalWeight * rate;
  if (safeNumber(invoice.expenseAmount, 0) > 0) {
    expenseAmount = safeNumber(invoice.expenseAmount, 0);
  }

  let grandTotal = subtotal + expenseAmount;
  if (safeNumber(invoice.grandTotalAmount, 0) > 0) {
    grandTotal = safeNumber(invoice.grandTotalAmount, 0);
  }

  let y = 32;

  if (logoPath) {
    doc.image(logoPath, left, y, {
      width: 62,
      height: 62,
    });
  }

  const companyX = logoPath ? left + 75 : left;
  const companyW = 300;

  doc.font("th-bold").fontSize(17).fillColor("#000000");
  doc.text(invoice.companyName || "SURIYA388 CO., LTD.", companyX, y, {
    width: companyW,
  });

  y += 22;

  doc.font("th").fontSize(12);
  doc.text(
    invoice.companyAddress ||
      "203/2 หมู่ที่ 12 ตำบลบ้านนา อำเภอเมืองชุมพร จังหวัดชุมพร 86190",
    companyX,
    y,
    {
      width: companyW,
    }
  );

  y += 34;

  if (invoice.companyTaxId) {
    doc.text(`Tax ID: ${invoice.companyTaxId}`, companyX, y, {
      width: companyW,
    });
    y += 15;
  }

  if (invoice.companyPhone) {
    doc.text(`Tel: ${invoice.companyPhone}`, companyX, y, {
      width: companyW,
    });
  }

  doc.font("th-bold").fontSize(28).fillColor(red);
  doc.text(docType, right - 190, 34, {
    width: 190,
    align: "right",
  });

  doc.font("th").fontSize(12).fillColor("#000000");
  doc.text(`NO: #${invoice.invoiceNo || 1}`, right - 190, 68, {
    width: 190,
    align: "right",
  });

  const redLineY = 108;
  doc.moveTo(left, redLineY).lineTo(right, redLineY).lineWidth(1.5).stroke(red);

  y = redLineY + 12;

  const billW = 300;
  const detailX = left + 320;
  const detailW = right - detailX;

  doc.font("th-bold").fontSize(14).fillColor("#000000");
  doc.text("BILL TO:", left, y);

  doc.font("th").fontSize(12);
  const billName = invoice.billToName || "-";
  doc.text(billName, left + 55, y, {
    width: billW - 55,
  });

  y += 34;

  if (invoice.billToTaxId) {
    doc.text(`Tax ID: ${invoice.billToTaxId}`, left, y, {
      width: billW,
    });
    y += 15;
  }

  if (invoice.billToAddress) {
    doc.text(invoice.billToAddress, left, y, {
      width: billW,
    });
    y += 32;
  }

  let dy = redLineY + 12;

  doc.font("th-bold").fontSize(14);
  doc.text("DETAIL", detailX, dy, {
    width: detailW,
  });

  dy += 20;

  doc.font("th").fontSize(12);

  const detailLines = [
    `Container: ${invoice.containerCode || "-"}`,
    `Brand: ${invoice.brandRemark || "-"}`,
    `Temp: ${invoice.temperature || "-"}`,
    `Ship Date: ${thDate(usedDate)}`,
    `Transport: ${invoice.transport || "-"}`,
    `Total Boxes: ${formatNumber(totalBoxes)}`,
    `Total Weight: ${formatNumber(totalWeight)} KG`,
  ];

  detailLines.forEach((line) => {
    doc.text(line, detailX, dy, {
      width: detailW,
    });
    dy += 15;
  });

  let tableY = Math.max(y, dy) + 12;

  const tableW = right - left;

  const cols = [
    { title: "วันที่ซื้อ", w: 68, align: "left" },
    { title: "แบรนด์/รายการ", w: 140, align: "left" },
    { title: "เกรด", w: 45, align: "center" },
    { title: "กล่อง", w: 48, align: "right" },
    { title: "กก./กล่อง", w: 60, align: "right" },
    { title: "Size", w: 42, align: "center" },
    { title: "น้ำหนักรวม", w: 70, align: "right" },
    { title: "ราคา", w: 55, align: "right" },
    { title: "รวมเงิน", w: 70, align: "right" },
  ];

  const totalColW = cols.reduce((sum, c) => sum + c.w, 0);
  const scale = tableW / totalColW;
  cols.forEach((c) => {
    c.w = Math.floor(c.w * scale);
  });
  cols[cols.length - 1].w += tableW - cols.reduce((sum, c) => sum + c.w, 0);

  const rowH = 21;
  const headerH = 23;

  function drawTableHeader() {
    doc.rect(left, tableY, tableW, headerH).fill(red);

    let x = left;

    cols.forEach((c) => {
      doc.font("th-bold").fontSize(10).fillColor("#ffffff");
      doc.text(c.title, x + 3, tableY + 6, {
        width: c.w - 6,
        align: "center",
      });
      x += c.w;
    });

    tableY += headerH;
  }

  function ensureSpace(h) {
    if (tableY + h > bottom) {
      doc.addPage();
      registerFonts(doc);
      tableY = 32;
      drawTableHeader();
    }
  }

  function drawRow(values, stripe = false) {
    ensureSpace(rowH + 2);

    if (stripe) {
      doc.rect(left, tableY, tableW, rowH).fill("#f7f7f7");
    }

    doc.rect(left, tableY, tableW, rowH).lineWidth(0.5).stroke(lightGray);

    let x = left;

    values.forEach((v, i) => {
      const c = cols[i];

      doc.font("th").fontSize(10).fillColor("#000000");
      doc.text(String(v ?? ""), x + 3, tableY + 5, {
        width: c.w - 6,
        align: c.align,
        lineBreak: false,
      });

      x += c.w;
      doc.moveTo(x, tableY).lineTo(x, tableY + rowH).lineWidth(0.5).stroke(lightGray);
    });

    tableY += rowH;
  }

  drawTableHeader();

  items.forEach((it, idx) => {
    const boxes = safeNumber(it.boxes, 0);
    const weightPerBox = safeNumber(it.weightPerBox, 0);
    const weightTotal =
      safeNumber(it.weightTotalKg, 0) > 0
        ? safeNumber(it.weightTotalKg, 0)
        : boxes * weightPerBox;

    const unitPrice = safeNumber(it.unitPrice, 0);
    const amount =
      safeNumber(it.amount, 0) > 0
        ? safeNumber(it.amount, 0)
        : weightTotal * unitPrice;

    const purchaseDate = it.purchaseDate
      ? new Date(it.purchaseDate).toISOString().slice(0, 10)
      : new Date(usedDate).toISOString().slice(0, 10);

    const itemName = `${it.brand || ""} ${it.variety || ""}`.trim() || "-";

    drawRow(
      [
        purchaseDate,
        itemName,
        it.grade || "-",
        boxes ? formatNumber(boxes) : "",
        weightPerBox ? formatNumber(weightPerBox) : "",
        it.boxSize || "-",
        weightTotal ? formatNumber(weightTotal) : "",
        unitPrice ? formatNumber(unitPrice) : "",
        amount ? formatNumber(amount) : "",
      ],
      idx % 2 === 1
    );
  });

  ensureSpace(80);

  doc.rect(left, tableY, tableW, rowH).fill(red);

  let tx = left;

  cols.forEach((c, i) => {
    doc.font("th-bold").fontSize(11).fillColor("#ffffff");

    if (i === 0) {
      doc.text("TOTAL", tx + 4, tableY + 5, {
        width: c.w - 8,
      });
    }

    if (i === 3) {
      doc.text(formatNumber(totalBoxes), tx + 3, tableY + 5, {
        width: c.w - 6,
        align: "right",
      });
    }

    if (i === 6) {
      doc.text(formatNumber(totalWeight), tx + 3, tableY + 5, {
        width: c.w - 6,
        align: "right",
      });
    }

    if (i === 8) {
      doc.text(formatNumber(subtotal), tx + 3, tableY + 5, {
        width: c.w - 6,
        align: "right",
      });
    }

    tx += c.w;
  });

  tableY += rowH + 12;

  const summaryW = 260;
  const summaryX = right - summaryW;
  const summaryH = 100;

  doc.roundedRect(summaryX, tableY, summaryW, summaryH, 8).lineWidth(1).stroke(gray);

  doc.font("th-bold").fontSize(13).fillColor("#000000");
  doc.text("SUMMARY", summaryX + 10, tableY + 10, {
    width: summaryW - 20,
  });

  doc.font("th").fontSize(12);
  doc.text(`Subtotal: ${formatNumber(subtotal)}`, summaryX + 10, tableY + 34, {
    width: summaryW - 20,
  });
  doc.text(`Expenses: ${formatNumber(expenseAmount)}`, summaryX + 10, tableY + 52, {
    width: summaryW - 20,
  });
  doc.font("th-bold").fontSize(13);
  doc.text(`Grand Total: ${formatNumber(grandTotal)}`, summaryX + 10, tableY + 72, {
    width: summaryW - 20,
  });

  const expBoxW = summaryX - left - 10;
  const expBoxH = 70;

  doc.roundedRect(left, tableY, expBoxW, expBoxH, 8).lineWidth(1).stroke(gray);

  doc.font("th-bold").fontSize(13).fillColor("#000000");
  doc.text("EXPENSES / ค่าใช้จ่าย", left + 10, tableY + 10, {
    width: expBoxW - 20,
  });

  doc.font("th").fontSize(12);
  doc.text(
    `น้ำหนักรวม × เรท = ${formatNumber(totalWeight)} × ${formatNumber(rate)} = ${formatNumber(expenseAmount)}`,
    left + 10,
    tableY + 36,
    {
      width: expBoxW - 20,
    }
  );

  tableY += summaryH + 14;

  if (invoice.note) {
    ensureSpace(55);

    doc.font("th-bold").fontSize(13);
    doc.text("NOTE / หมายเหตุ", left, tableY);

    tableY += 18;

    doc.font("th").fontSize(12);
    doc.text(String(invoice.note), left, tableY, {
      width: right - left,
    });

    tableY += 42;
  }

  const sigBoxH = 95;

  if (tableY + sigBoxH > bottom) {
    doc.addPage();
    registerFonts(doc);
    tableY = 32;
  }

  const sigY = Math.min(bottom - sigBoxH, tableY);
  const sigW = right - left;
  const colW = sigW / 3;

  doc.roundedRect(left, sigY, sigW, sigBoxH, 8).lineWidth(1).stroke(gray);

  doc.font("th-bold").fontSize(13).fillColor("#000000");

  doc.text("ผู้วางบิล", left + 10, sigY + 10, {
    width: colW - 20,
    align: "center",
  });
  doc.moveTo(left + 20, sigY + 52).lineTo(left + colW - 20, sigY + 52).stroke("#000000");

  doc.font("th").fontSize(12);
  doc.text(`วันที่: ${thDate(usedDate)}`, left + 10, sigY + 62, {
    width: colW - 20,
    align: "center",
  });

  const midX = left + colW;

  doc.font("th-bold").fontSize(13);
  doc.text("ตราประทับ / Logo", midX + 10, sigY + 10, {
    width: colW - 20,
    align: "center",
  });

  if (logoPath) {
    doc.image(logoPath, midX + colW / 2 - 20, sigY + 35, {
      width: 40,
      height: 40,
    });
  }

  const rightX = left + colW * 2;

  doc.font("th-bold").fontSize(13);
  doc.text("ผู้มีอำนาจลงนาม", rightX + 10, sigY + 10, {
    width: colW - 20,
    align: "center",
  });
  doc.moveTo(rightX + 20, sigY + 52).lineTo(rightX + colW - 20, sigY + 52).stroke("#000000");

  doc.font("th").fontSize(12);
  doc.text(`วันที่: ${thDate(usedDate)}`, rightX + 10, sigY + 62, {
    width: colW - 20,
    align: "center",
  });

  doc.moveTo(left + colW, sigY).lineTo(left + colW, sigY + sigBoxH).lineWidth(0.5).stroke(lightGray);
  doc.moveTo(left + colW * 2, sigY).lineTo(left + colW * 2, sigY + sigBoxH).lineWidth(0.5).stroke(lightGray);

  doc.end();
}

/* ----------------------------- CREATE ----------------------------- */
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    if (!body.date && !body.shipDate) {
      return res.status(400).json({ error: "date or shipDate required" });
    }

    const items = Array.isArray(body.items) ? body.items : [];

    const created = await prisma.lungSangInvoice.create({
      data: {
        date: body.date ? new Date(body.date) : new Date(),
        shipDate: body.shipDate ? new Date(body.shipDate) : null,

        rate: body.rate === null || body.rate === undefined ? null : safeNumber(body.rate, 0),

        invoiceNo: safeNumber(body.invoiceNo, 1),
        docType: body.docType ? String(body.docType).toUpperCase() : "INVOICE",

        companyName: body.companyName || "SURIYA388 CO., LTD.",
        companyAddress:
          body.companyAddress ||
          "203/2 หมู่ที่ 12 ตำบลบ้านนา อำเภอเมืองชุมพร จังหวัดชุมพร 86190",
        companyTaxId: body.companyTaxId || null,
        companyPhone: body.companyPhone || null,
        companyLogoKey: body.companyLogoKey || null,

        billToName: body.billToName || null,
        billToAddress: body.billToAddress || null,
        billToTaxId: body.billToTaxId || null,

        destination: body.destination || null,
        containerInfo: body.containerInfo || null,
        containerCode: body.containerCode || null,
        refCode: body.refCode || null,

        route: body.route || null,
        temperature: body.temperature || null,
        transport: body.transport || null,
        brandRemark: body.brandRemark || null,

        note: body.note || null,

        totalBoxes: body.totalBoxes === undefined ? 0 : safeNumber(body.totalBoxes, 0),
        totalWeightKg: body.totalWeightKg === undefined ? 0 : safeNumber(body.totalWeightKg, 0),
        subtotalAmount: body.subtotalAmount === undefined ? 0 : safeNumber(body.subtotalAmount, 0),
        expenseAmount: body.expenseAmount === undefined ? 0 : safeNumber(body.expenseAmount, 0),
        grandTotalAmount:
          body.grandTotalAmount === undefined ? 0 : safeNumber(body.grandTotalAmount, 0),
        amountText: body.amountText || null,

        items: {
          create: items.map((it) => ({
            purchaseDate: it.purchaseDate ? new Date(it.purchaseDate) : null,
            brand: it.brand || null,
            variety: it.variety || null,
            grade: it.grade || null,
            boxSize: it.boxSize || null,

            boxes: it.boxes === null || it.boxes === undefined ? null : safeNumber(it.boxes, 0),
            weightPerBox:
              it.weightPerBox === null || it.weightPerBox === undefined
                ? null
                : safeNumber(it.weightPerBox, 0),
            weightTotalKg:
              it.weightTotalKg === undefined ? 0 : safeNumber(it.weightTotalKg, 0),
            unitPrice: it.unitPrice === undefined ? 0 : safeNumber(it.unitPrice, 0),
            amount: it.amount === undefined ? 0 : safeNumber(it.amount, 0),
          })),
        },
      },
      include: {
        items: true,
      },
    });

    res.json(created);
  } catch (err) {
    console.error("❌ POST /v1/lungsang-invoices error:", err);
    res.status(500).json({
      error: "เกิดข้อผิดพลาดในการบันทึกเอกสารลุงสร้าง",
      details: String(err),
    });
  }
});

/* ----------------------------- READ ALL ----------------------------- */
router.get("/", async (req, res) => {
  try {
    const docType = req.query.docType ? String(req.query.docType).toUpperCase() : null;

    const where = {};
    if (docType) where.docType = docType;

    const list = await prisma.lungSangInvoice.findMany({
      where,
      orderBy: {
        id: "desc",
      },
      include: {
        items: true,
      },
    });

    res.json(list);
  } catch (err) {
    console.error("❌ GET /v1/lungsang-invoices error:", err);
    res.status(500).json({
      error: "ไม่สามารถดึงรายการเอกสารลุงสร้างได้",
      details: String(err),
    });
  }
});

/* ----------------------------- READ ONE ----------------------------- */
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const invoice = await prisma.lungSangInvoice.findUnique({
      where: {
        id,
      },
      include: {
        items: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({
        error: "ไม่พบเอกสารนี้",
      });
    }

    res.json(invoice);
  } catch (err) {
    console.error("❌ GET /v1/lungsang-invoices/:id error:", err);
    res.status(500).json({
      error: "ไม่พบเอกสารนี้",
      details: String(err),
    });
  }
});

/* ----------------------------- UPDATE ----------------------------- */
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body || {};

    if (!body.date && !body.shipDate) {
      return res.status(400).json({
        error: "date or shipDate required",
      });
    }

    const items = Array.isArray(body.items) ? body.items : [];

    await prisma.lungSangInvoiceItem.deleteMany({
      where: {
        invoiceId: id,
      },
    });

    const updated = await prisma.lungSangInvoice.update({
      where: {
        id,
      },
      data: {
        date: body.date ? new Date(body.date) : new Date(),
        shipDate: body.shipDate ? new Date(body.shipDate) : null,

        rate: body.rate === null || body.rate === undefined ? null : safeNumber(body.rate, 0),

        invoiceNo: safeNumber(body.invoiceNo, 1),
        docType: body.docType ? String(body.docType).toUpperCase() : "INVOICE",

        companyName: body.companyName || "SURIYA388 CO., LTD.",
        companyAddress:
          body.companyAddress ||
          "203/2 หมู่ที่ 12 ตำบลบ้านนา อำเภอเมืองชุมพร จังหวัดชุมพร 86190",
        companyTaxId: body.companyTaxId || null,
        companyPhone: body.companyPhone || null,
        companyLogoKey: body.companyLogoKey || null,

        billToName: body.billToName || null,
        billToAddress: body.billToAddress || null,
        billToTaxId: body.billToTaxId || null,

        destination: body.destination || null,
        containerInfo: body.containerInfo || null,
        containerCode: body.containerCode || null,
        refCode: body.refCode || null,

        route: body.route || null,
        temperature: body.temperature || null,
        transport: body.transport || null,
        brandRemark: body.brandRemark || null,

        note: body.note || null,

        totalBoxes: body.totalBoxes === undefined ? 0 : safeNumber(body.totalBoxes, 0),
        totalWeightKg: body.totalWeightKg === undefined ? 0 : safeNumber(body.totalWeightKg, 0),
        subtotalAmount: body.subtotalAmount === undefined ? 0 : safeNumber(body.subtotalAmount, 0),
        expenseAmount: body.expenseAmount === undefined ? 0 : safeNumber(body.expenseAmount, 0),
        grandTotalAmount:
          body.grandTotalAmount === undefined ? 0 : safeNumber(body.grandTotalAmount, 0),
        amountText: body.amountText || null,

        items: {
          create: items.map((it) => ({
            purchaseDate: it.purchaseDate ? new Date(it.purchaseDate) : null,
            brand: it.brand || null,
            variety: it.variety || null,
            grade: it.grade || null,
            boxSize: it.boxSize || null,

            boxes: it.boxes === null || it.boxes === undefined ? null : safeNumber(it.boxes, 0),
            weightPerBox:
              it.weightPerBox === null || it.weightPerBox === undefined
                ? null
                : safeNumber(it.weightPerBox, 0),
            weightTotalKg:
              it.weightTotalKg === undefined ? 0 : safeNumber(it.weightTotalKg, 0),
            unitPrice: it.unitPrice === undefined ? 0 : safeNumber(it.unitPrice, 0),
            amount: it.amount === undefined ? 0 : safeNumber(it.amount, 0),
          })),
        },
      },
      include: {
        items: true,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error("❌ PUT /v1/lungsang-invoices/:id error:", err);
    res.status(500).json({
      error: "อัปเดตเอกสารลุงสร้างไม่สำเร็จ",
      details: String(err),
    });
  }
});

/* ----------------------------- DELETE ----------------------------- */
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    await prisma.lungSangInvoice.delete({
      where: {
        id,
      },
    });

    res.json({
      message: "ลบสำเร็จ",
    });
  } catch (err) {
    console.error("❌ DELETE /v1/lungsang-invoices/:id error:", err);
    res.status(500).json({
      error: "ลบเอกสารลุงสร้างไม่สำเร็จ",
      details: String(err),
    });
  }
});

/* ----------------------------- PDF ----------------------------- */
router.get("/:id/pdf", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const invoice = await prisma.lungSangInvoice.findUnique({
      where: {
        id,
      },
      include: {
        items: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({
        error: "ไม่พบเอกสารนี้",
      });
    }

    buildLungSangPDF(res, invoice);
  } catch (err) {
    console.error("❌ GET /v1/lungsang-invoices/:id/pdf error:", err);
    res.status(500).json({
      error: "เกิดข้อผิดพลาดขณะสร้าง PDF เอกสารลุงสร้าง",
      details: String(err),
    });
  }
});

module.exports = router;