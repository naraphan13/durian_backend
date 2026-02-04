// invoicepdf.js
// ✅ Router ใหม่ “Invoice” แยกจาก ExportContainer 100%
// ✅ CRUD + Generate PDF
// ✅ รองรับ Prisma schema (Invoice + InvoiceItem + InvoiceFreightItem + seasonId)
// ✅ รองรับโลโก้แบบ preset ด้วย companyLogoKey (logo1/logo2/logo3)
// ✅ แก้ปัญหา “ไทย/จีนเป็นต่างดาว” แบบถาวร: วาดข้อความแบบ “ตัดเป็นช่วง (runs)” แล้วสลับฟอนต์ในบรรทัดเดียว
//    - ไทย: ../fonts/THSarabunNew.ttf / ../fonts/THSarabunNewBold.ttf
//    - จีน: ../fonts/NotoSansSC-Regular.ttf / ../fonts/NotoSansSC-Bold.ttf
// ✅ PDF: ตารางมี “ราคา + รวมเงิน” และคอลัมน์ไม่หลุดหน้า A4
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
const prisma = require("../models/prisma"); // ✅ ปรับ path ให้ตรงโปรเจกต์คุณ
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

/* ----------------------------- fonts ----------------------------- */
function registerFonts(doc) {
  // ✅ ตามที่ผู้ใช้ระบุ
  const thRegular = path.join(__dirname, "../fonts/THSarabunNew.ttf");
  const thBold = path.join(__dirname, "../fonts/THSarabunNewBold.ttf");

  const zhRegular = path.join(__dirname, "../fonts/NotoSansSC-Regular.ttf");
  const zhBold = path.join(__dirname, "../fonts/NotoSansSC-Bold.ttf");

  const loaded = {
    th: { regular: false, bold: false },
    zh: { regular: false, bold: false },
  };

  if (fs.existsSync(thRegular)) {
    doc.registerFont("th", thRegular);
    loaded.th.regular = true;
  }
  if (fs.existsSync(thBold)) {
    doc.registerFont("th-bold", thBold);
    loaded.th.bold = true;
  }

  if (fs.existsSync(zhRegular)) {
    doc.registerFont("zh", zhRegular);
    loaded.zh.regular = true;
  }
  if (fs.existsSync(zhBold)) {
    doc.registerFont("zh-bold", zhBold);
    loaded.zh.bold = true;
  }

  // default to Thai if available
  if (loaded.th.regular) doc.font("th");
  else if (loaded.zh.regular) doc.font("zh");

  return loaded;
}

function isCJKChar(ch) {
  // Chinese/Japanese/Korean ranges
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(ch);
}
function isThaiChar(ch) {
  return /[\u0E00-\u0E7F]/.test(ch);
}
function splitRunsByScript(text) {
  const s = String(text ?? "");
  if (!s) return [];

  const getType = (ch) => {
    if (isThaiChar(ch)) return "th";
    if (isCJKChar(ch)) return "zh";
    return "other";
  };

  let runs = [];
  let curType = getType(s[0]);
  let buf = s[0];

  for (let i = 1; i < s.length; i++) {
    const t = getType(s[i]);
    if (t === curType) {
      buf += s[i];
    } else {
      runs.push({ type: curType, text: buf });
      curType = t;
      buf = s[i];
    }
  }
  runs.push({ type: curType, text: buf });
  return runs;
}

function useFont(doc, fontsLoaded, runType, bold) {
  if (runType === "zh") {
    if (bold && fontsLoaded.zh.bold) return doc.font("zh-bold");
    if (fontsLoaded.zh.regular) return doc.font("zh");
    if (bold && fontsLoaded.th.bold) return doc.font("th-bold");
    if (fontsLoaded.th.regular) return doc.font("th");
    return doc;
  }

  // th or other => prefer Thai
  if (bold && fontsLoaded.th.bold) return doc.font("th-bold");
  if (fontsLoaded.th.regular) return doc.font("th");
  if (bold && fontsLoaded.zh.bold) return doc.font("zh-bold");
  if (fontsLoaded.zh.regular) return doc.font("zh");
  return doc;
}

function measureMixedTextWidth(doc, fontsLoaded, text, fontSize = 12, bold = false) {
  const runs = splitRunsByScript(text);
  let w = 0;
  for (const r of runs) {
    useFont(doc, fontsLoaded, r.type, bold);
    doc.fontSize(fontSize);
    w += doc.widthOfString(r.text || "");
  }
  return w;
}

function fitMixedTextToWidth(doc, fontsLoaded, text, width, fontSize = 12, bold = false) {
  const s = String(text ?? "");
  if (!s) return "";

  // ถ้าพอดีแล้ว ไม่ต้องตัด
  const fullW = measureMixedTextWidth(doc, fontsLoaded, s, fontSize, bold);
  if (fullW <= width) return s;

  const ellipsis = "…";
  const ellW = measureMixedTextWidth(doc, fontsLoaded, ellipsis, fontSize, bold);
  const target = Math.max(0, width - ellW);

  // ตัดแบบต่อ char (ปลอดภัยสุด)
  const runs = splitRunsByScript(s);
  const chars = [];
  runs.forEach((r) => {
    for (const ch of r.text) chars.push({ type: r.type, ch });
  });

  let out = "";
  let acc = 0;

  for (const t of chars) {
    useFont(doc, fontsLoaded, t.type, bold);
    doc.fontSize(fontSize);
    const cw = doc.widthOfString(t.ch);
    if (acc + cw > target) break;
    out += t.ch;
    acc += cw;
  }

  return out ? out + ellipsis : ellipsis;
}

/**
 * วาดข้อความผสม ไทย/จีน ได้ใน “บรรทัดเดียวกัน” โดยไม่ทำให้ไทยเพี้ยน
 * - รองรับ align: left/right/center
 * - รองรับ width + wrap (ใช้กับ note/address ได้)
 */
function drawMixedText(doc, fontsLoaded, text, x, y, opts = {}) {
  const {
    width = 9999,
    align = "left",
    fontSize = 12,
    bold = false,
    lineGap = 2,
    wrap = true,
  } = opts;

  const s = String(text ?? "");
  if (!s) return y;

  const runs = splitRunsByScript(s);

  // token per char (เพื่อ wrap ที่แน่นอน)
  const tokens = [];
  runs.forEach((r) => {
    for (const ch of r.text) tokens.push({ type: r.type, ch });
  });

  const measureChar = (t) => {
    useFont(doc, fontsLoaded, t.type, bold);
    doc.fontSize(fontSize);
    return doc.widthOfString(t.ch);
  };

  // ถ้าไม่ wrap: วาดบรรทัดเดียว (ผู้เรียกควร fit มาก่อน)
  if (!wrap) {
    // หา width ของบรรทัด
    let wSum = 0;
    tokens.forEach((t) => (wSum += measureChar(t)));

    let startX = x;
    if (align === "right") startX = x + width - wSum;
    if (align === "center") startX = x + (width - wSum) / 2;

    let cx = startX;
    tokens.forEach((t) => {
      useFont(doc, fontsLoaded, t.type, bold);
      doc.fontSize(fontSize);
      doc.text(t.ch, cx, y, { lineBreak: false });
      cx += doc.widthOfString(t.ch);
    });

    return y;
  }

  // wrap mode
  const lines = [];
  let line = [];
  let lineW = 0;

  tokens.forEach((t) => {
    const w = measureChar(t);
    if (lineW + w > width && line.length > 0) {
      lines.push(line);
      line = [t];
      lineW = w;
    } else {
      line.push(t);
      lineW += w;
    }
  });
  if (line.length) lines.push(line);

  let cy = y;

  lines.forEach((ln) => {
    let wSum = 0;
    ln.forEach((t) => (wSum += measureChar(t)));

    let startX = x;
    if (align === "right") startX = x + width - wSum;
    if (align === "center") startX = x + (width - wSum) / 2;

    let cx = startX;
    ln.forEach((t) => {
      useFont(doc, fontsLoaded, t.type, bold);
      doc.fontSize(fontSize);
      doc.text(t.ch, cx, cy, { lineBreak: false });
      cx += doc.widthOfString(t.ch);
    });

    cy += doc.currentLineHeight() + lineGap;
  });

  return cy;
}

/* ----------------------------- PDF maker ----------------------------- */
function buildInvoicePDF(res, invoice) {
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

  const fontsLoaded = registerFonts(doc);

  // layout constants
  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;
  const top = doc.page.margins.top;
  const bottom = pageH - doc.page.margins.bottom;

  const red = "#cc0000";

  // --- header box
  const headerH = 120;
  doc.roundedRect(left, top, right - left, headerH, 10).lineWidth(1).stroke("#cccccc");

  // --- logo preset
  const logoPresets = {
    logo1: path.join(__dirname, "../picture/S__5275654png (1).png"),
    logo2: path.join(__dirname, "../picture/dos.png"),
    logo3: path.join(__dirname, "../picture/logo2.png"),
  };
  const defaultLogo = path.join(__dirname, "../picture/S__5275654png (1).png");

  let logoDrawn = false;

  if (invoice.companyLogoKey && logoPresets[invoice.companyLogoKey]) {
    const p = logoPresets[invoice.companyLogoKey];
    if (fs.existsSync(p)) {
      doc.image(p, left + 12, top + 12, { width: 70 });
      logoDrawn = true;
    }
  }

  if (!logoDrawn && fs.existsSync(defaultLogo)) {
    doc.image(defaultLogo, left + 12, top + 12, { width: 70 });
  }

  // company text
  const companyName = invoice.companyName || "SURIYA 388 CO.,LTD.";
  const companyAddress = invoice.companyAddress || "";
  const companyTaxId = invoice.companyTaxId || "";
  const companyPhone = invoice.companyPhone || "";

  doc.fillColor("#000000");
  drawMixedText(doc, fontsLoaded, companyName, left + 95, top + 12, {
    width: 320,
    fontSize: 18,
    bold: true,
    wrap: true,
  });

  drawMixedText(doc, fontsLoaded, companyAddress, left + 95, top + 36, {
    width: 320,
    fontSize: 12,
    bold: false,
    wrap: true,
    lineGap: 1,
  });

  if (companyTaxId) {
    const t = `เลขประจำตัวผู้เสียภาษี: ${companyTaxId}`;
    drawMixedText(doc, fontsLoaded, t, left + 95, top + 70, {
      width: 320,
      fontSize: 12,
      wrap: false,
    });
  }
  if (companyPhone) {
    const t = `Tel: ${companyPhone}`;
    drawMixedText(doc, fontsLoaded, t, left + 95, top + 88, {
      width: 320,
      fontSize: 12,
      wrap: false,
    });
  }

  // INVOICE info (right)
  doc.fillColor(red);
  drawMixedText(doc, fontsLoaded, "INVOICE", right - 170, top + 12, {
    width: 170,
    align: "right",
    fontSize: 24,
    bold: true,
    wrap: false,
  });

  doc.fillColor("#000");
  const line1 = `DATE: ${thDate(invoice.date)}`;
  const line2 = `NO: #${invoice.invoiceNo || 1}`;

  drawMixedText(doc, fontsLoaded, line1, right - 220, top + 48, {
    width: 220,
    align: "right",
    fontSize: 12,
    wrap: false,
  });
  drawMixedText(doc, fontsLoaded, line2, right - 220, top + 66, {
    width: 220,
    align: "right",
    fontSize: 12,
    wrap: false,
  });

  // --- Bill to + meta
  const sectionY = top + headerH + 16;

  // Bill To box
  doc.roundedRect(left, sectionY, (right - left) * 0.55 - 6, 100, 10).lineWidth(1).stroke("#cccccc");
  doc.fillColor("#000");
  drawMixedText(doc, fontsLoaded, "BILL TO", left + 12, sectionY + 10, {
    width: (right - left) * 0.55 - 30,
    fontSize: 14,
    bold: true,
    wrap: false,
  });

  const billToName = invoice.billToName || "-";
  const billToTaxId = invoice.billToTaxId || "";
  const billToAddress = invoice.billToAddress || "";

  drawMixedText(doc, fontsLoaded, billToName, left + 12, sectionY + 32, {
    width: (right - left) * 0.55 - 30,
    fontSize: 12,
    wrap: false,
  });

  if (billToTaxId) {
    const t = `Tax ID: ${billToTaxId}`;
    drawMixedText(doc, fontsLoaded, t, left + 12, sectionY + 50, {
      width: (right - left) * 0.55 - 30,
      fontSize: 12,
      wrap: false,
    });
  }

  if (billToAddress) {
    drawMixedText(doc, fontsLoaded, billToAddress, left + 12, sectionY + 68, {
      width: (right - left) * 0.55 - 30,
      fontSize: 12,
      wrap: true,
      lineGap: 1,
    });
  }

  // Meta box
  const metaX = left + (right - left) * 0.55 + 6;
  const metaW = right - metaX;
  doc.roundedRect(metaX, sectionY, metaW, 100, 10).lineWidth(1).stroke("#cccccc");

  drawMixedText(doc, fontsLoaded, "DETAIL", metaX + 12, sectionY + 10, {
    width: metaW - 24,
    fontSize: 14,
    bold: true,
    wrap: false,
  });

  const metaLines = [
    `Destination: ${invoice.destination || "-"}`,
    `Container: ${invoice.containerInfo || "-"}`,
    `Container Code: ${invoice.containerCode || "-"}`,
    `Reference: ${invoice.refCode || "-"}`,
  ];

  let yy = sectionY + 32;
  metaLines.forEach((t) => {
    drawMixedText(doc, fontsLoaded, t, metaX + 12, yy, {
      width: metaW - 24,
      fontSize: 12,
      wrap: false,
    });
    yy += 18;
  });

  // --- Items Table
  const tableY = sectionY + 120;
  const tableW = right - left;

  // คอลัมน์ให้พอดี A4
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
  const wSum = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w += tableW - wSum;

  const rowH = 22;
  const headerH2 = 26;

  // table header background
  doc.rect(left, tableY, tableW, headerH2).fill(red);

  // header text
  doc.fillColor("#ffffff");
  let x = left;
  cols.forEach((c) => {
    // หัวตารางเป็นไทยล้วน แต่ใช้ drawMixedText ได้เลย
    drawMixedText(doc, fontsLoaded, c.title, x + 4, tableY + 6, {
      width: c.w - 8,
      align: "center",
      fontSize: 10,
      bold: true,
      wrap: false,
    });
    x += c.w;
  });

  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const rate = safeNumber(invoice.rate, 0);

  let y = tableY + headerH2;
  doc.fillColor("#000000");

  const redrawTableHeader = (yTop) => {
    doc.rect(left, yTop, tableW, headerH2).fill(red);
    doc.fillColor("#ffffff");

    let xx = left;
    cols.forEach((c) => {
      drawMixedText(doc, fontsLoaded, c.title, xx + 4, yTop + 6, {
        width: c.w - 8,
        align: "center",
        fontSize: 10,
        bold: true,
        wrap: false,
      });
      xx += c.w;
    });

    doc.fillColor("#000000");
  };

  const ensureSpace = (neededH) => {
    if (y + neededH > bottom) {
      doc.addPage();
      // fonts are still registered, but call registerFonts again is safe
      registerFonts(doc);

      y = doc.page.margins.top;
      redrawTableHeader(y);
      y += headerH2;
    }
  };

  const drawRow = (rowValues, isStripe) => {
    ensureSpace(rowH + 2);

    if (isStripe) {
      doc.rect(left, y, tableW, rowH).fill("#f7f7f7");
      doc.fillColor("#000");
    }

    // outer row border
    doc.rect(left, y, tableW, rowH).lineWidth(0.5).stroke("#dddddd");

    let xx = left;

    rowValues.forEach((val, idx) => {
      const c = cols[idx];
      let txt = String(val ?? "");

      // fit text to cell width (กันข้อความยาว + กัน wrap ทำให้ล้น rowH)
      txt = fitMixedTextToWidth(doc, fontsLoaded, txt, c.w - 8, 10, false);

      drawMixedText(doc, fontsLoaded, txt, xx + 4, y + 6, {
        width: c.w - 8,
        align: c.align || "left",
        fontSize: 10,
        bold: false,
        wrap: false,
      });

      xx += c.w;

      // vertical line
      doc.moveTo(xx, y).lineTo(xx, y + rowH).lineWidth(0.5).stroke("#dddddd");
    });

    y += rowH;
    doc.fillColor("#000");
  };

  // totals
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
  doc.fillColor("#fff");

  // total label spans first 2 columns
  const spanW = cols[0].w + cols[1].w;
  drawMixedText(doc, fontsLoaded, "TOTAL", left + 6, y + 5, {
    width: spanW - 12,
    align: "left",
    fontSize: 12,
    bold: true,
    wrap: false,
  });

  const amountTotal =
    rate > 0
      ? totalWeight * rate
      : items.reduce((sum, it) => {
          const b = safeNumber(it.boxes, 0);
          const wpb = safeNumber(it.weightPerBox, 0);
          const wt = b * wpb;
          const p = safeNumber(it.pricePerKg, 0);
          return sum + wt * p;
        }, 0);

  // totals aligned in column positions
  let colX = left;
  cols.forEach((c, idx) => {
    if (idx === 2) {
      drawMixedText(doc, fontsLoaded, totalBoxes.toLocaleString(), colX + 4, y + 5, {
        width: c.w - 8,
        align: "right",
        fontSize: 12,
        bold: true,
        wrap: false,
      });
    }
    if (idx === 4) {
      drawMixedText(doc, fontsLoaded, totalWeight.toLocaleString(), colX + 4, y + 5, {
        width: c.w - 8,
        align: "right",
        fontSize: 12,
        bold: true,
        wrap: false,
      });
    }
    if (idx === 6) {
      drawMixedText(doc, fontsLoaded, amountTotal.toLocaleString(), colX + 4, y + 5, {
        width: c.w - 8,
        align: "right",
        fontSize: 12,
        bold: true,
        wrap: false,
      });
    }
    colX += c.w;
  });

  y += rowH + 10;
  doc.fillColor("#000");

  // Freight section (optional)
  const freights = Array.isArray(invoice.freightItems) ? invoice.freightItems : [];
  if (freights.length > 0) {
    ensureSpace(100);

    drawMixedText(doc, fontsLoaded, "Freight Charges", left, y, {
      width: tableW,
      fontSize: 14,
      bold: true,
      wrap: false,
    });
    y += 18;

    freights.forEach((f, i) => {
      ensureSpace(18);

      const subtotal = safeNumber(f.weight, 0) * safeNumber(f.pricePerKg, 0);
      const line = `${i + 1}. ${f.variety || "-"} ${f.grade ? `(${f.grade})` : ""} | ${safeNumber(
        f.weight,
        0
      )} kg × ${safeNumber(f.pricePerKg, 0)} = ${subtotal.toLocaleString()} บาท`;

      // ใช้ drawMixedText (ไทย+จีนในบรรทัดเดียวได้)
      y = drawMixedText(doc, fontsLoaded, line, left, y, {
        width: tableW,
        fontSize: 11,
        bold: false,
        wrap: true,
        lineGap: 1,
      });

      y += 2;
    });

    y += 8;
  }

  // Note
  if (invoice.note && String(invoice.note).trim()) {
    ensureSpace(120);

    drawMixedText(doc, fontsLoaded, "Note", left, y, {
      width: tableW,
      fontSize: 14,
      bold: true,
      wrap: false,
    });
    y += 18;

    const noteText = String(invoice.note);
    y = drawMixedText(doc, fontsLoaded, noteText, left, y, {
      width: tableW,
      fontSize: 12,
      bold: false,
      wrap: true,
      lineGap: 2,
    });

    y += 8;
  }

  // Signatures
  ensureSpace(120);
  const sigY = doc.page.height - doc.page.margins.bottom - 90;

  const sig1 = "ผู้ส่งสินค้า";
  const sig2 = "ผู้รับสินค้า";

  drawMixedText(doc, fontsLoaded, sig1, left + 40, sigY, {
    width: 200,
    align: "center",
    fontSize: 12,
    wrap: false,
  });
  drawMixedText(doc, fontsLoaded, sig2, right - 240, sigY, {
    width: 200,
    align: "center",
    fontSize: 12,
    wrap: false,
  });

  doc.moveTo(left + 40, sigY + 35).lineTo(left + 240, sigY + 35).stroke("#000");
  doc.moveTo(right - 240, sigY + 35).lineTo(right - 40, sigY + 35).stroke("#000");

  doc.end();
}

/* ----------------------------- ROUTES ----------------------------- */

// CREATE Invoice
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    if (!body.date) {
      return res.status(400).json({ error: "date required" });
    }

    // season auto-detect (ถ้าใช้ Season)
    let seasonId = null;
    try {
      const billDate = toDateOnly(new Date(body.date));
      const season = await prisma.season.findFirst({
        where: {
          startDate: { lte: billDate },
          OR: [{ endDate: null }, { endDate: { gte: billDate } }],
        },
      });
      seasonId = season?.id || null;
    } catch (_) {
      seasonId = null;
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

// READ ALL (?seasonId=...)
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

    if (!body.date) {
      return res.status(400).json({ error: "date required" });
    }

    // season auto-detect
    let seasonId = null;
    try {
      const billDate = toDateOnly(new Date(body.date));
      const season = await prisma.season.findFirst({
        where: {
          startDate: { lte: billDate },
          OR: [{ endDate: null }, { endDate: { gte: billDate } }],
        },
      });
      seasonId = season?.id || null;
    } catch (_) {
      seasonId = null;
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
