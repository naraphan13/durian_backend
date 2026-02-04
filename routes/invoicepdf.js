// invoicepdf.js
// ✅ Router ใหม่ “Invoice” แยกจาก ExportContainer 100%
// ✅ CRUD + Generate PDF
// ✅ รองรับ Prisma schema ที่คุณให้ (Invoice + InvoiceItem + InvoiceFreightItem + seasonId)
// ✅ รองรับโลโก้ 2 แบบ:
//    1) preset โดยใช้ companyLogoKey (logo1/logo2/logo3)
//    2) อัปโหลดเป็น base64 dataURL เก็บใน DB (companyLogoB64)
// ✅ PDF: ตารางมี “ราคา + รวมเงิน” แน่นอน (แก้ปัญหาคอลัมน์หลุดหน้า)
// ✅ Endpoint:
//    POST   /v1/invoices
//    GET    /v1/invoices?seasonId=...
//    GET    /v1/invoices/:id
//    PUT    /v1/invoices/:id
//    DELETE /v1/invoices/:id
//    GET    /v1/invoices/:id/pdf

const express = require("express");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const prisma = require("../models/prisma"); // ✅ แก้ path ให้ตรงโปรเจกต์คุณถ้าไม่ใช่
const router = express.Router();

/* ----------------------------- utils ----------------------------- */
function safeNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function thDate(d) {
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
function parseDataUrlToBuffer(dataUrl) {
  // data:image/png;base64,xxxx
  const parts = String(dataUrl || "").split(",");
  if (parts.length < 2) return null;
  return Buffer.from(parts[1], "base64");
}

/* ----------------------------- fonts ----------------------------- */
function registerThaiFonts(doc) {
  const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
  const fontBold = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");

  if (fs.existsSync(fontPath)) doc.registerFont("thai", fontPath);
  if (fs.existsSync(fontBold)) doc.registerFont("thai-bold", fontBold);

  // fallback
  if (doc._fontFamilies && doc._fontFamilies["thai"]) doc.font("thai");
}

/* ----------------------------- PDF maker ----------------------------- */
function buildInvoicePDF(res, invoice) {
  // ✅ A4 แนวตั้ง
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  let buffers = [];
  doc.on("data", buffers.push.bind(buffers));
  doc.on("end", () => {
    const pdfData = Buffer.concat(buffers);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=invoice-${invoice.id}.pdf`,
      "Content-Length": pdfData.length,
    });
    res.end(pdfData);
  });

  registerThaiFonts(doc);

  const setFont = (bold = false) => {
    if (bold && doc._fontFamilies && doc._fontFamilies["thai-bold"]) doc.font("thai-bold");
    else if (doc._fontFamilies && doc._fontFamilies["thai"]) doc.font("thai");
    return doc;
  };

  // layout constants
  const pageW = doc.page.width;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;
  const top = doc.page.margins.top;

  // --- header box
  const headerH = 120;
  doc.roundedRect(left, top, right - left, headerH, 10).lineWidth(1).stroke("#cccccc");

  // --- logo: base64 > preset > default
  const logoPresets = {
    logo1: path.join(__dirname, "../picture/logo1.png"),
    logo2: path.join(__dirname, "../picture/logo2.png"),
    logo3: path.join(__dirname, "../picture/logo3.png"),
  };
  const defaultLogo = path.join(__dirname, "../picture/S__5275654png (1).png");

  let logoDrawn = false;
  // 1) base64
  if (invoice.companyLogoB64 && String(invoice.companyLogoB64).includes("base64")) {
    try {
      const buf = parseDataUrlToBuffer(invoice.companyLogoB64);
      if (buf) {
        doc.image(buf, left + 12, top + 12, { width: 70 });
        logoDrawn = true;
      }
    } catch (_) {
      logoDrawn = false;
    }
  }
  // 2) preset
  if (!logoDrawn && invoice.companyLogoKey && logoPresets[invoice.companyLogoKey]) {
    const p = logoPresets[invoice.companyLogoKey];
    if (fs.existsSync(p)) {
      doc.image(p, left + 12, top + 12, { width: 70 });
      logoDrawn = true;
    }
  }
  // 3) default
  if (!logoDrawn && fs.existsSync(defaultLogo)) {
    doc.image(defaultLogo, left + 12, top + 12, { width: 70 });
  }

  // company text
  setFont(true).fontSize(18).fillColor("#000000");
  doc.text(invoice.companyName || "SURIYA 388 CO.,LTD.", left + 95, top + 12, { width: 280 });

  setFont(false).fontSize(12);
  doc.text(invoice.companyAddress || "", left + 95, top + 36, { width: 280 });
  if (invoice.companyTaxId) doc.text(`เลขประจำตัวผู้เสียภาษี: ${invoice.companyTaxId}`, left + 95, top + 70, { width: 280 });
  if (invoice.companyPhone) doc.text(`Tel: ${invoice.companyPhone}`, left + 95, top + 88, { width: 280 });

  // INVOICE info (right)
  setFont(true).fontSize(24).fillColor("#cc0000");
  doc.text("INVOICE", right - 170, top + 12, { width: 170, align: "right" });

  setFont(false).fontSize(12).fillColor("#000");
  doc.text(`DATE: ${thDate(invoice.date)}`, right - 220, top + 48, { width: 220, align: "right" });
  doc.text(`NO: #${invoice.invoiceNo || 1}`, right - 220, top + 66, { width: 220, align: "right" });

  // --- Bill to + meta
  const sectionY = top + headerH + 16;

  // Bill To box
  doc.roundedRect(left, sectionY, (right - left) * 0.55 - 6, 100, 10).lineWidth(1).stroke("#cccccc");
  setFont(true).fontSize(14).fillColor("#000");
  doc.text("BILL TO", left + 12, sectionY + 10);

  setFont(false).fontSize(12);
  doc.text(invoice.billToName || "-", left + 12, sectionY + 32, { width: (right - left) * 0.55 - 30 });
  if (invoice.billToTaxId) {
    doc.text(`Tax ID: ${invoice.billToTaxId}`, left + 12, sectionY + 50, { width: (right - left) * 0.55 - 30 });
  }
  if (invoice.billToAddress) {
    doc.text(invoice.billToAddress, left + 12, sectionY + 68, { width: (right - left) * 0.55 - 30 });
  }

  // Meta box
  const metaX = left + (right - left) * 0.55 + 6;
  const metaW = right - metaX;
  doc.roundedRect(metaX, sectionY, metaW, 100, 10).lineWidth(1).stroke("#cccccc");

  setFont(true).fontSize(14);
  doc.text("DETAIL", metaX + 12, sectionY + 10);

  setFont(false).fontSize(12);
  const metaLines = [
    `Destination: ${invoice.destination || "-"}`,
    `Container: ${invoice.containerInfo || "-"}`,
    `Container Code: ${invoice.containerCode || "-"}`,
    `Reference: ${invoice.refCode || "-"}`,
  ];
  let yy = sectionY + 32;
  metaLines.forEach((t) => {
    doc.text(t, metaX + 12, yy, { width: metaW - 24 });
    yy += 18;
  });

  // --- Items Table
  const tableY = sectionY + 120;
  const tableW = right - left;

  // ✅ คอลัมน์ใหม่ให้พอดี A4 (แก้ปัญหาราคา/รวมเงินหลุดหน้า)
  // รวมความกว้าง = 535 ที่ area tableW เราจะวาดเต็มได้ เพราะ tableW ~ 515-535 ตาม margin
  // เพื่อความปลอดภัย ใช้ tableW จริง แล้ว scale ได้เล็กน้อย
  const baseCols = [
    { title: "วันที่ซื้อของ", w: 70, align: "left" },
    { title: "รายการ", w: 165, align: "left" },
    { title: "จำนวน\n(กล่อง)", w: 55, align: "right" },
    { title: "น้ำหนัก\nกล่อง : KG", w: 70, align: "right" },
    { title: "น้ำหนักรวม", w: 70, align: "right" },
    { title: "ราคา", w: 45, align: "right" },
    { title: "รวมเงิน", w: 60, align: "right" },
  ];
  const baseSum = baseCols.reduce((s, c) => s + c.w, 0);
  const scale = tableW / baseSum;
  const cols = baseCols.map((c) => ({ ...c, w: Math.floor(c.w * scale) }));
  // ปรับช่องสุดท้ายให้รวมเท่ากับ tableW เป๊ะ
  const wSum = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w += tableW - wSum;

  const rowH = 22;
  const headerH2 = 26;
  const red = "#cc0000";

  // table header background
  doc.rect(left, tableY, tableW, headerH2).fill(red);

  // header text
  setFont(true).fontSize(10).fillColor("#ffffff");
  let x = left;
  cols.forEach((c) => {
    doc.text(c.title, x + 4, tableY + 6, { width: c.w - 8, align: "center" });
    x += c.w;
  });

  // rows
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const rate = safeNumber(invoice.rate, 0);

  let y = tableY + headerH2;
  setFont(false).fontSize(10).fillColor("#000000");

  const ensureSpace = (neededH) => {
    if (y + neededH > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      registerThaiFonts(doc);
      y = doc.page.margins.top;
      // re-draw header on new page
      doc.rect(left, y, tableW, headerH2).fill(red);
      setFont(true).fontSize(10).fillColor("#fff");
      let xx = left;
      cols.forEach((c) => {
        doc.text(c.title, xx + 4, y + 6, { width: c.w - 8, align: "center" });
        xx += c.w;
      });
      setFont(false).fontSize(10).fillColor("#000");
      y += headerH2;
    }
  };

  // draw row function
  const drawRow = (rowValues, isStripe) => {
    ensureSpace(rowH + 2);

    if (isStripe) {
      doc.rect(left, y, tableW, rowH).fill("#f7f7f7");
      setFont(false).fillColor("#000");
    }

    // grid lines
    doc.rect(left, y, tableW, rowH).lineWidth(0.5).stroke("#dddddd");

    let xx = left;
    rowValues.forEach((val, idx) => {
      const c = cols[idx];
      doc.text(String(val ?? ""), xx + 4, y + 6, {
        width: c.w - 8,
        align: c.align || "left",
      });
      xx += c.w;
      // vertical line
      doc.moveTo(xx, y).lineTo(xx, y + rowH).lineWidth(0.5).stroke("#dddddd");
    });

    y += rowH;
  };

  // compute totals
  let totalBoxes = 0;
  let totalWeight = 0;

  items.forEach((it, idx) => {
    const boxes = safeNumber(it.boxes, 0);
    const wPerBox = safeNumber(it.weightPerBox, 0);
    const wTotal = boxes * wPerBox;
    const price = rate > 0 ? rate : safeNumber(it.pricePerKg, 0);
    const amount = wTotal * price;

    totalBoxes += boxes;
    totalWeight += wTotal;

    const itemName = `${it.brand ? it.brand + " " : ""}${it.variety || ""} ${it.grade ? `(${it.grade})` : ""}`.trim();

    drawRow(
      [
        thDate(invoice.date),
        itemName || "-",
        boxes ? boxes.toLocaleString() : "",
        wPerBox ? wPerBox.toLocaleString() : "",
        wTotal ? wTotal.toLocaleString() : "",
        price ? price.toLocaleString() : "",
        amount ? amount.toLocaleString() : "",
      ],
      idx % 2 === 1
    );
  });

  // summary rows
  ensureSpace(80);

  // TOTAL row (red)
  doc.rect(left, y, tableW, rowH).fill(red);
  setFont(true).fontSize(12).fillColor("#fff");

  // total label spans first 2 columns
  const spanW = cols[0].w + cols[1].w;
  doc.text("TOTAL", left + 6, y + 5, { width: spanW - 12, align: "left" });

  // put totals in columns
  // columns: 2=boxes, 4=weight total, 6=amount total
  const amountTotal = rate > 0
    ? totalWeight * rate
    : items.reduce((sum, it) => {
        const boxes = safeNumber(it.boxes, 0);
        const wPerBox = safeNumber(it.weightPerBox, 0);
        const wTotal = boxes * wPerBox;
        const price = safeNumber(it.pricePerKg, 0);
        return sum + wTotal * price;
      }, 0);

  // Draw totals aligned in their column positions
  let colX = left;
  cols.forEach((c, idx) => {
    if (idx === 2) {
      doc.text(totalBoxes.toLocaleString(), colX + 4, y + 5, { width: c.w - 8, align: "right" });
    }
    if (idx === 4) {
      doc.text(totalWeight.toLocaleString(), colX + 4, y + 5, { width: c.w - 8, align: "right" });
    }
    if (idx === 6) {
      doc.text(amountTotal.toLocaleString(), colX + 4, y + 5, { width: c.w - 8, align: "right" });
    }
    colX += c.w;
  });

  y += rowH + 10;

  // Freight section (optional)
  const freights = Array.isArray(invoice.freightItems) ? invoice.freightItems : [];
  if (freights.length > 0) {
    ensureSpace(60);
    setFont(true).fontSize(14).fillColor("#000");
    doc.text("Freight Charges", left, y);
    y += 18;

    setFont(false).fontSize(11);
    freights.forEach((f, i) => {
      ensureSpace(18);
      const subtotal = safeNumber(f.weight, 0) * safeNumber(f.pricePerKg, 0);
      doc.text(
        `${i + 1}. ${f.variety || "-"} ${f.grade ? `(${f.grade})` : ""} | ${safeNumber(f.weight, 0)} kg × ${safeNumber(f.pricePerKg, 0)} = ${subtotal.toLocaleString()} บาท`,
        left,
        y,
        { width: tableW }
      );
      y += 16;
    });

    y += 8;
  }

  // Note
  if (invoice.note && String(invoice.note).trim()) {
    ensureSpace(60);
    setFont(true).fontSize(14).fillColor("#000");
    doc.text("Note", left, y);
    y += 18;
    setFont(false).fontSize(12);
    doc.text(String(invoice.note), left, y, { width: tableW });
    y += 18;
  }

  // Signatures
  ensureSpace(120);
  const sigY = doc.page.height - doc.page.margins.bottom - 90;
  setFont(false).fontSize(12).fillColor("#000");
  doc.text("ผู้ส่งสินค้า", left + 40, sigY, { width: 200, align: "center" });
  doc.text("ผู้รับสินค้า", right - 240, sigY, { width: 200, align: "center" });

  doc.moveTo(left + 40, sigY + 35).lineTo(left + 240, sigY + 35).stroke("#000");
  doc.moveTo(right - 240, sigY + 35).lineTo(right - 40, sigY + 35).stroke("#000");

  doc.end();
}

/* ----------------------------- ROUTES ----------------------------- */

// CREATE Invoice
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    // season auto-detect (ถ้าคุณใช้ Season)
    let seasonId = null;
    if (body.date) {
      const billDate = toDateOnly(new Date(body.date));
      const season = await prisma.season.findFirst({
        where: {
          startDate: { lte: billDate },
          OR: [{ endDate: null }, { endDate: { gte: billDate } }],
        },
      });
      seasonId = season?.id || null;
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const freightItems = Array.isArray(body.freightItems) ? body.freightItems : [];

    const created = await prisma.invoice.create({
      data: {
        date: new Date(body.date),
        destination: body.destination || null,
        containerInfo: body.containerInfo || null,
        containerCode: body.containerCode || null,
        refCode: body.refCode || null,

        invoiceNo: safeNumber(body.invoiceNo, 1),
        rate: body.rate === null || body.rate === undefined ? null : safeNumber(body.rate, 0),

        billToName: body.billToName || null,
        billToAddress: body.billToAddress || null,
        billToTaxId: body.billToTaxId || null,

        companyName: body.companyName || null,
        companyAddress: body.companyAddress || null,
        companyTaxId: body.companyTaxId || null,
        companyPhone: body.companyPhone || null,

        companyLogoKey: body.companyLogoKey || null,
        companyLogoB64: body.companyLogoB64 || null,

        note: body.note || null,

        seasonId,

        items: {
          create: items.map((it) => ({
            brand: it.brand || null,
            variety: it.variety || null,
            grade: it.grade || null,
            boxes: it.boxes === null || it.boxes === undefined ? null : safeNumber(it.boxes, 0),
            weightPerBox: it.weightPerBox === null || it.weightPerBox === undefined ? null : safeNumber(it.weightPerBox, 0),
            pricePerKg: it.pricePerKg === null || it.pricePerKg === undefined ? null : safeNumber(it.pricePerKg, 0),
          })),
        },
        freightItems: {
          create: freightItems.map((f) => ({
            variety: f.variety || null,
            grade: f.grade || null,
            weight: f.weight === null || f.weight === undefined ? null : safeNumber(f.weight, 0),
            pricePerKg: f.pricePerKg === null || f.pricePerKg === undefined ? null : safeNumber(f.pricePerKg, 0),
          })),
        },
      },
      include: { items: true, freightItems: true },
    });

    res.json(created);
  } catch (err) {
    console.error("❌ POST /v1/invoices error::", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึก Invoice", details: String(err) });
  }
});

// READ ALL (รองรับ ?seasonId=...)
router.get("/", async (req, res) => {
  try {
    const seasonId = req.query.seasonId ? parseInt(req.query.seasonId) : null;

    const list = await prisma.invoice.findMany({
      where: seasonId ? { seasonId } : {},
      orderBy: { date: "desc" },
      include: { items: true, freightItems: true },
    });

    res.json(list);
  } catch (err) {
    console.error("❌ GET /v1/invoices error::", err);
    res.status(500).json({ error: "ไม่สามารถดึงรายการได้", details: String(err) });
  }
});

// READ ONE
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true, freightItems: true },
    });

    if (!invoice) return res.status(404).json({ error: "ไม่พบ Invoice นี้" });
    res.json(invoice);
  } catch (err) {
    console.error("❌ GET /v1/invoices/:id error::", err);
    res.status(500).json({ error: "ไม่พบเอกสารนี้", details: String(err) });
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body || {};

    // season auto-detect (ถ้าคุณใช้ Season)
    let seasonId = null;
    if (body.date) {
      const billDate = toDateOnly(new Date(body.date));
      const season = await prisma.season.findFirst({
        where: {
          startDate: { lte: billDate },
          OR: [{ endDate: null }, { endDate: { gte: billDate } }],
        },
      });
      seasonId = season?.id || null;
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const freightItems = Array.isArray(body.freightItems) ? body.freightItems : [];

    // ลบรายการย่อยเก่าก่อน แล้วสร้างใหม่ (ง่ายและชัวร์)
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await prisma.invoiceFreightItem.deleteMany({ where: { invoiceId: id } });

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        date: new Date(body.date),
        destination: body.destination || null,
        containerInfo: body.containerInfo || null,
        containerCode: body.containerCode || null,
        refCode: body.refCode || null,

        invoiceNo: safeNumber(body.invoiceNo, 1),
        rate: body.rate === null || body.rate === undefined ? null : safeNumber(body.rate, 0),

        billToName: body.billToName || null,
        billToAddress: body.billToAddress || null,
        billToTaxId: body.billToTaxId || null,

        companyName: body.companyName || null,
        companyAddress: body.companyAddress || null,
        companyTaxId: body.companyTaxId || null,
        companyPhone: body.companyPhone || null,

        companyLogoKey: body.companyLogoKey || null,
        companyLogoB64: body.companyLogoB64 || null,

        note: body.note || null,

        seasonId,

        items: {
          create: items.map((it) => ({
            brand: it.brand || null,
            variety: it.variety || null,
            grade: it.grade || null,
            boxes: it.boxes === null || it.boxes === undefined ? null : safeNumber(it.boxes, 0),
            weightPerBox: it.weightPerBox === null || it.weightPerBox === undefined ? null : safeNumber(it.weightPerBox, 0),
            pricePerKg: it.pricePerKg === null || it.pricePerKg === undefined ? null : safeNumber(it.pricePerKg, 0),
          })),
        },

        freightItems: {
          create: freightItems.map((f) => ({
            variety: f.variety || null,
            grade: f.grade || null,
            weight: f.weight === null || f.weight === undefined ? null : safeNumber(f.weight, 0),
            pricePerKg: f.pricePerKg === null || f.pricePerKg === undefined ? null : safeNumber(f.pricePerKg, 0),
          })),
        },
      },
      include: { items: true, freightItems: true },
    });

    res.json(updated);
  } catch (err) {
    console.error("❌ PUT /v1/invoices/:id error::", err);
    res.status(500).json({ error: "อัปเดตไม่สำเร็จ", details: String(err) });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // invoiceItem / freightItem จะถูกลบตามเพราะ onDelete: Cascade
    await prisma.invoice.delete({ where: { id } });

    res.json({ message: "ลบสำเร็จ" });
  } catch (err) {
    console.error("❌ DELETE /v1/invoices/:id error::", err);
    res.status(500).json({ error: "ลบไม่สำเร็จ", details: String(err) });
  }
});

// PDF
router.get("/:id/pdf", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true, freightItems: true },
    });

    if (!invoice) return res.status(404).json({ error: "ไม่พบ Invoice นี้" });

    buildInvoicePDF(res, invoice);
  } catch (err) {
    console.error("❌ GET /v1/invoices/:id/pdf error::", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดขณะสร้าง PDF", details: String(err) });
  }
});

module.exports = router;
