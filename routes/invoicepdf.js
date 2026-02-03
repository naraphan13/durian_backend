// routes/invoicepdf.js
// ✅ ระบบ INVOICE ใหม่ (ไม่ยุ่งกับ ExportContainer)
// ✅ CRUD + Generate PDF จากข้อมูลใน DB
// ✅ ใช้ Prisma models: Invoice, InvoiceItem, InvoiceFreightItem (ตาม schema ที่ผมให้ก่อนหน้า)
// ✅ Mount แนะนำ: app.use("/v1/invoices", require("./routes/invoicepdf"));

const express = require("express");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const prisma = require("../models/prisma");

const router = express.Router();

/* ------------------------- helpers ------------------------- */
function n(v, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}
function s(v, fallback = "-") {
  return v === null || v === undefined || v === "" ? fallback : String(v);
}
function toDateOnly(d) {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
function money(v) {
  return n(v, 0).toLocaleString();
}
function num(v) {
  return n(v, 0).toLocaleString();
}

/* ------------------------- CRUD: CREATE ------------------------- */
// POST /v1/invoices
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    // ✅ invoice date (required)
    const date = body.date ? new Date(body.date) : null;
    if (!date || isNaN(date.getTime())) {
      return res.status(400).json({ error: "date is required and must be valid Date" });
    }

    // ✅ auto seasonId (optional) เหมือนระบบเดิมของคุณ
    let seasonId = null;
    try {
      const billDate = toDateOnly(date);
      const season = await prisma.season.findFirst({
        where: {
          startDate: { lte: billDate },
          OR: [{ endDate: null }, { endDate: { gte: billDate } }],
        },
      });
      seasonId = season?.id || null;
    } catch (e) {
      // ถ้าไม่มี Season model / ไม่อยากใช้ ก็ไม่ต้อง fail
      seasonId = null;
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const freightItems = Array.isArray(body.freightItems) ? body.freightItems : [];

    const created = await prisma.invoice.create({
      data: {
        date,
        destination: body.destination ?? body.city ?? null,
        containerInfo: body.containerInfo ?? null,
        containerCode: body.containerCode ?? null,
        refCode: body.refCode ?? null,

        invoiceNo: n(body.invoiceNo, 1),
        rate: body.rate !== undefined ? n(body.rate, 0) : body.exchangeRate !== undefined ? n(body.exchangeRate, 0) : null,

        billToName: body.billToName ?? body.billTo?.name ?? null,
        billToAddress: body.billToAddress ?? body.billTo?.address ?? null,
        billToTaxId: body.billToTaxId ?? body.billTo?.taxId ?? null,

        companyName: body.companyName ?? "SURIYA 388 CO.,LTD.",
        companyAddress: body.companyAddress ?? null,
        companyTaxId: body.companyTaxId ?? null,
        companyPhone: body.companyPhone ?? null,

        note: body.note ?? body.brandSummary ?? null,

        seasonId,

        items: {
          create: items.map((it) => ({
            brand: it.brand ?? null,
            variety: it.variety ?? null,
            grade: it.grade ?? null,
            boxes: it.boxes !== undefined ? n(it.boxes, 0) : null,
            weightPerBox: it.weightPerBox !== undefined ? n(it.weightPerBox, 0) : null,
            pricePerKg: it.pricePerKg !== undefined ? n(it.pricePerKg, 0) : null,
          })),
        },

        freightItems: {
          create: freightItems.map((it) => ({
            variety: it.variety ?? null,
            grade: it.grade ?? null,
            weight: it.weight !== undefined ? n(it.weight, 0) : null,
            pricePerKg: it.pricePerKg !== undefined ? n(it.pricePerKg, 0) : null,
          })),
        },
      },
      include: { items: true, freightItems: true },
    });

    res.json(created);
  } catch (err) {
    console.error("❌ POST /v1/invoices error::", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการสร้าง Invoice", details: err });
  }
});

/* ------------------------- CRUD: READ ALL ------------------------- */
// GET /v1/invoices?seasonId=...
router.get("/", async (req, res) => {
  try {
    const seasonId = req.query.seasonId ? parseInt(req.query.seasonId) : null;

    const invoices = await prisma.invoice.findMany({
      where: seasonId ? { seasonId } : {},
      orderBy: { date: "desc" },
      include: { items: true, freightItems: true },
    });

    res.json(invoices);
  } catch (err) {
    console.error("❌ GET /v1/invoices error::", err);
    res.status(500).json({ error: "ไม่สามารถดึงรายการ Invoice ได้", details: err });
  }
});

/* ------------------------- CRUD: READ ONE ------------------------- */
// GET /v1/invoices/:id
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
    res.status(500).json({ error: "ไม่สามารถดึง Invoice ได้", details: err });
  }
});

/* ------------------------- CRUD: UPDATE ------------------------- */
// PUT /v1/invoices/:id
router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const body = req.body || {};

    const date = body.date ? new Date(body.date) : null;
    if (!date || isNaN(date.getTime())) {
      return res.status(400).json({ error: "date is required and must be valid Date" });
    }

    // seasonId recalculation (optional)
    let seasonId = null;
    try {
      const billDate = toDateOnly(date);
      const season = await prisma.season.findFirst({
        where: {
          startDate: { lte: billDate },
          OR: [{ endDate: null }, { endDate: { gte: billDate } }],
        },
      });
      seasonId = season?.id || null;
    } catch (e) {
      seasonId = null;
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const freightItems = Array.isArray(body.freightItems) ? body.freightItems : [];

    const updated = await prisma.$transaction(async (tx) => {
      // ลบของเก่าก่อน แล้วสร้างใหม่ (ง่าย/ชัวร์)
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceFreightItem.deleteMany({ where: { invoiceId: id } });

      const inv = await tx.invoice.update({
        where: { id },
        data: {
          date,
          destination: body.destination ?? body.city ?? null,
          containerInfo: body.containerInfo ?? null,
          containerCode: body.containerCode ?? null,
          refCode: body.refCode ?? null,

          invoiceNo: n(body.invoiceNo, 1),
          rate: body.rate !== undefined ? n(body.rate, 0) : body.exchangeRate !== undefined ? n(body.exchangeRate, 0) : null,

          billToName: body.billToName ?? body.billTo?.name ?? null,
          billToAddress: body.billToAddress ?? body.billTo?.address ?? null,
          billToTaxId: body.billToTaxId ?? body.billTo?.taxId ?? null,

          companyName: body.companyName ?? "SURIYA 388 CO.,LTD.",
          companyAddress: body.companyAddress ?? null,
          companyTaxId: body.companyTaxId ?? null,
          companyPhone: body.companyPhone ?? null,

          note: body.note ?? body.brandSummary ?? null,
          seasonId,
        },
      });

      if (items.length) {
        await tx.invoiceItem.createMany({
          data: items.map((it) => ({
            invoiceId: id,
            brand: it.brand ?? null,
            variety: it.variety ?? null,
            grade: it.grade ?? null,
            boxes: it.boxes !== undefined ? n(it.boxes, 0) : null,
            weightPerBox: it.weightPerBox !== undefined ? n(it.weightPerBox, 0) : null,
            pricePerKg: it.pricePerKg !== undefined ? n(it.pricePerKg, 0) : null,
          })),
        });
      }

      if (freightItems.length) {
        await tx.invoiceFreightItem.createMany({
          data: freightItems.map((it) => ({
            invoiceId: id,
            variety: it.variety ?? null,
            grade: it.grade ?? null,
            weight: it.weight !== undefined ? n(it.weight, 0) : null,
            pricePerKg: it.pricePerKg !== undefined ? n(it.pricePerKg, 0) : null,
          })),
        });
      }

      const full = await tx.invoice.findUnique({
        where: { id },
        include: { items: true, freightItems: true },
      });

      return full;
    });

    res.json(updated);
  } catch (err) {
    console.error("❌ PUT /v1/invoices/:id error::", err);
    res.status(500).json({ error: "อัปเดต Invoice ไม่สำเร็จ", details: err });
  }
});

/* ------------------------- CRUD: DELETE ------------------------- */
// DELETE /v1/invoices/:id
router.delete("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    // onDelete: Cascade ใน schema จะช่วยลบ items ให้
    await prisma.invoice.delete({ where: { id } });

    res.json({ message: "ลบ Invoice สำเร็จ" });
  } catch (err) {
    console.error("❌ DELETE /v1/invoices/:id error::", err);
    res.status(500).json({ error: "ลบ Invoice ไม่สำเร็จ", details: err });
  }
});

/* ------------------------- PDF: Generate from DB ------------------------- */
// GET /v1/invoices/:id/pdf
router.get("/:id/pdf", async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true, freightItems: true },
    });

    if (!invoice) return res.status(404).json({ error: "ไม่พบ Invoice นี้" });

    // ---------- compute totals ----------
    const totalBoxes = invoice.items.reduce((sum, it) => sum + n(it.boxes, 0), 0);
    const totalWeight = invoice.items.reduce((sum, it) => sum + n(it.boxes, 0) * n(it.weightPerBox, 0), 0);

    const rate = invoice.rate !== null && invoice.rate !== undefined ? n(invoice.rate, 0) : 0;

    // ถ้า rate > 0: amount = weightTotal * rate (ตามใบตัวอย่าง)
    // ถ้า rate == 0: amount = sum(item weightTotal * pricePerKg)
    const grandTotal =
      rate > 0
        ? totalWeight * rate
        : invoice.items.reduce((sum, it) => {
            const wTotal = n(it.boxes, 0) * n(it.weightPerBox, 0);
            return sum + wTotal * n(it.pricePerKg, 0);
          }, 0);

    // ---------- PDF setup ----------
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const buffers = [];
    doc.on("data", (b) => buffers.push(b));
    doc.on("end", () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=invoice-${id}.pdf`,
        "Content-Length": pdfData.length,
      });
      res.end(pdfData);
    });

    // ---------- fonts ----------
    const fontPath = path.join(__dirname, "../fonts/THSarabunNew.ttf");
    const fontBold = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");

    let hasThai = false;
    let hasThaiBold = false;

    if (fs.existsSync(fontPath)) {
      doc.registerFont("thai", fontPath);
      hasThai = true;
    }
    if (fs.existsSync(fontBold)) {
      doc.registerFont("thai-bold", fontBold);
      hasThaiBold = true;
    }

    const setFont = (bold = false) => {
      if (bold && hasThaiBold) return doc.font("thai-bold");
      if (!bold && hasThai) return doc.font("thai");
      return doc.font("Helvetica");
    };

    // ---------- assets ----------
    const logoPath = path.join(__dirname, "../picture/S__5275654png (1).png");
    const hasLogo = fs.existsSync(logoPath);

    // ---------- page constants ----------
    const pageW = doc.page.width;
    const pageH = doc.page.height;

    const left = 25;
    const right = pageW - 25;
    const top = 20;
    const bottom = pageH - 20;

    const red = "#d11";
    const blue = "#1f3fbf";

    // ---------- border ----------
    doc.save();
    doc.lineWidth(2).strokeColor(blue);
    doc.rect(left, top, right - left, bottom - top).stroke();
    doc.restore();

    // ---------- header ----------
    if (hasLogo) doc.image(logoPath, left + 10, top + 10, { width: 70 });

    setFont(true).fontSize(14).fillColor(red).text(s(invoice.companyName, "SURIYA 388 CO.,LTD."), left + 90, top + 18);
    setFont(false).fontSize(12).fillColor(red).text("บริษัท สุริยา 388 จำกัด", left + 90, top + 38);

    setFont(false)
      .fontSize(11)
      .fillColor(red)
      .text(s(invoice.companyAddress, "203/2 หมู่ที่ 2 ... จังหวัดชุมพร 86190"), left + 90, top + 55, { width: 320 });

    setFont(false).fontSize(11).fillColor(red).text(s(invoice.companyTaxId, "เลขประจำตัวผู้เสียภาษี ..."), left + 90, top + 75);
    setFont(false).fontSize(11).fillColor(red).text(s(invoice.companyPhone, "เบอร์โทรติดต่อ ..."), left + 90, top + 92);

    setFont(true).fontSize(30).fillColor(red).text("INVOICE", pageW - 235, top + 20, { width: 190, align: "right" });
    setFont(true).fontSize(12).fillColor(red).text(`柜数/ลำดับตู้   # ${s(invoice.invoiceNo, "1")}`, pageW - 235, top + 55, {
      width: 190,
      align: "right",
    });

    // separator
    const headerLineY = top + 110;
    doc.save();
    doc.strokeColor(red).lineWidth(1);
    doc.moveTo(left, headerLineY).lineTo(right, headerLineY).stroke();
    doc.restore();

    // ---------- BILL TO ----------
    setFont(true).fontSize(16).fillColor(red).text("BILL TO", left + 10, headerLineY + 10);

    setFont(false).fontSize(12).fillColor("black").text(s(invoice.billToName), left + 110, headerLineY + 12, { width: 420 });
    setFont(false).fontSize(12).fillColor("black").text(s(invoice.billToAddress), left + 110, headerLineY + 30, { width: 420 });
    setFont(false).fontSize(12).fillColor("black").text(`เลขประจำตัวผู้เสียภาษี ${s(invoice.billToTaxId)}`, left + 110, headerLineY + 55);

    // ---------- meta block ----------
    const metaY = headerLineY + 90;

    // left column
    setFont(false).fontSize(11).fillColor(red).text("柜号/เบอร์ตู้", left + 10, metaY);
    setFont(false).fillColor("black").text(s(invoice.containerCode), left + 110, metaY);

    setFont(false).fillColor(red).text("放柜日期/วันที่ปล่อย", left + 10, metaY + 18);
    setFont(false).fillColor("black").text(new Date(invoice.date).toLocaleDateString("th-TH"), left + 110, metaY + 18);

    setFont(false).fillColor(red).text("总件数/จำนวนกล่อง", left + 10, metaY + 36);
    setFont(false).fillColor("black").text(num(totalBoxes), left + 110, metaY + 36);

    // right column
    const rx = pageW - 310;
    setFont(false).fillColor(red).text("柜名", rx, metaY);
    setFont(false).fillColor("black").text(s(invoice.containerInfo), rx + 70, metaY);

    setFont(false).fillColor(red).text("陆运/海运", rx, metaY + 18);
    setFont(false).fillColor("black").text(s(invoice.destination), rx + 70, metaY + 18);

    setFont(false).fillColor(red).text("净重 (KG)", rx, metaY + 36);
    setFont(false).fillColor("black").text(num(totalWeight), rx + 70, metaY + 36);

    if (rate > 0) {
      setFont(false).fillColor(red).text("费用/เรท", rx, metaY + 54);
      setFont(false).fillColor("black").text(num(rate), rx + 70, metaY + 54);
    }

    // ---------- table header ----------
    const tableX = left + 10;
    const tableW = right - left - 20;
    const tableY = metaY + 70;

    const cols = [
      { title: "วันที่ซื้อของ", w: 80, align: "left" },
      { title: "รายการ", w: 210, align: "left" },
      { title: "จำนวน\n(กล่อง)", w: 70, align: "right" },
      { title: "น้ำหนัก\nกล่อง : KG", w: 85, align: "right" },
      { title: "น้ำหนักรวม", w: 85, align: "right" },
      { title: "ราคา", w: 55, align: "right" },
      { title: "รวมเงิน", w: 75, align: "right" },
    ];

    doc.save();
    doc.rect(tableX, tableY, tableW, 26).fill("#f6dfd4");
    doc.restore();

    setFont(true).fontSize(11).fillColor(red);
    let cx = tableX;
    cols.forEach((c) => {
      doc.text(c.title, cx + 2, tableY + 5, { width: c.w - 4, align: c.align });
      cx += c.w;
    });

    // ---------- group by brand ----------
    const groups = {};
    invoice.items.forEach((it) => {
      const brand = s(it.brand, "ITEMS");
      if (!groups[brand]) groups[brand] = [];
      groups[brand].push(it);
    });

    let y = tableY + 30;
    const rowH = 18;

    const drawRowLine = (yy) => {
      doc.save();
      doc.strokeColor("#c9b28f").lineWidth(0.7);
      doc.moveTo(tableX, yy + rowH).lineTo(tableX + tableW, yy + rowH).stroke();
      doc.restore();
    };

    const drawTableHeaderAgain = () => {
      doc.save();
      doc.rect(tableX, top + 40, tableW, 26).fill("#f6dfd4");
      doc.restore();

      setFont(true).fontSize(11).fillColor(red);
      let cx2 = tableX;
      cols.forEach((c) => {
        doc.text(c.title, cx2 + 2, top + 45, { width: c.w - 4, align: c.align });
        cx2 += c.w;
      });
    };

    const drawGroupTitle = (title) => {
      setFont(true).fontSize(12).fillColor(red).text(title, tableX, y, { width: 140 });
      y += rowH;
    };

    const drawRow = (row) => {
      const footerSpace = 150;
      if (y > pageH - footerSpace) {
        doc.addPage({ size: "A4", margin: 40 });

        // border
        doc.save();
        doc.lineWidth(2).strokeColor(blue);
        doc.rect(left, top, right - left, bottom - top).stroke();
        doc.restore();

        drawTableHeaderAgain();
        y = top + 75;
      }

      setFont(false).fontSize(11).fillColor("black");

      let x = tableX;
      const cells = [
        { v: s(row.date, ""), w: cols[0].w, align: cols[0].align },
        { v: s(row.item, ""), w: cols[1].w, align: cols[1].align },
        { v: row.boxes === "" ? "" : num(row.boxes), w: cols[2].w, align: cols[2].align },
        { v: row.wPer === "" ? "" : num(row.wPer), w: cols[3].w, align: cols[3].align },
        { v: row.wTotal === "" ? "" : num(row.wTotal), w: cols[4].w, align: cols[4].align },
        { v: row.price === "" ? "" : num(row.price), w: cols[5].w, align: cols[5].align },
        { v: row.amount === "" ? "" : money(row.amount), w: cols[6].w, align: cols[6].align },
      ];

      cells.forEach((c) => {
        doc.text(c.v, x + 2, y, { width: c.w - 4, align: c.align });
        x += c.w;
      });

      drawRowLine(y);
      y += rowH;
    };

    Object.keys(groups).forEach((brand) => {
      drawGroupTitle(brand);

      groups[brand].forEach((it) => {
        const boxes = n(it.boxes, 0);
        const wPer = n(it.weightPerBox, 0);
        const wTotal = boxes * wPer;

        const price = rate > 0 ? rate : n(it.pricePerKg, 0);
        const amount = rate > 0 ? wTotal * rate : wTotal * n(it.pricePerKg, 0);

        drawRow({
          date: "", // ใบตัวอย่างไม่ได้ใส่ date ทุกบรรทัด
          item: `${s(it.variety)} ${s(it.grade)}`,
          boxes,
          wPer,
          wTotal,
          price,
          amount,
        });
      });

      y += 4;
    });

    // ---------- totals ----------
    doc.save();
    doc.strokeColor("#c9b28f").lineWidth(1);
    doc.moveTo(tableX, y + 6).lineTo(tableX + tableW, y + 6).stroke();
    doc.restore();

    setFont(true).fontSize(12).fillColor(red).text("รวม", tableX + 110, y + 10);

    setFont(true).fontSize(12).fillColor("black");
    const totalsX = tableX + cols[0].w + cols[1].w;

    doc.text(num(totalBoxes), totalsX, y + 10, { width: cols[2].w, align: "right" });
    doc.text(num(totalWeight), totalsX + cols[2].w + cols[3].w, y + 10, { width: cols[4].w, align: "right" });

    const lastColX = tableX + cols.slice(0, 6).reduce((sum, c) => sum + c.w, 0);
    doc.text(money(grandTotal), lastColX, y + 10, { width: cols[6].w, align: "right" });

    // total bar
    const barY = y + 40;
    doc.save();
    doc.rect(tableX, barY, tableW, 26).fill("#f6dfd4");
    doc.restore();

    setFont(true).fontSize(12).fillColor(red).text("รวมทั้งสิ้น 总计", tableX + 10, barY + 6);
    setFont(true).fontSize(12).fillColor("black");
    doc.text(num(totalBoxes), totalsX, barY + 6, { width: cols[2].w, align: "right" });
    doc.text(num(totalWeight), totalsX + cols[2].w + cols[3].w, barY + 6, { width: cols[4].w, align: "right" });
    doc.text(money(grandTotal), lastColX, barY + 6, { width: cols[6].w, align: "right" });

    // ---------- note ----------
    if (invoice.note && String(invoice.note).trim()) {
      setFont(true).fontSize(14).fillColor(red).text("หมายเหตุ / Note", tableX, barY + 38);
      setFont(false).fontSize(12).fillColor("black").text(String(invoice.note), tableX, barY + 58, { width: tableW });
    }

    // ---------- signature ----------
    const sigY = pageH - 140;
    doc.save();
    doc.strokeColor(red).lineWidth(1);
    doc.rect(tableX, sigY, tableW, 85).stroke();
    doc.restore();

    setFont(false).fontSize(10).fillColor("black");
    doc.text("ผู้รับสินค้า / Receiver Signature\nวันที่ / Date", tableX + 20, sigY + 40);
    doc.text("ผู้มีอำนาจลงนาม / Authorized Signature\nวันที่ / Date", tableX + tableW - 210, sigY + 40);

    doc.end();
  } catch (err) {
    console.error("❌ GET /v1/invoices/:id/pdf error::", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดขณะสร้าง PDF", details: err });
  }
});

module.exports = router;
