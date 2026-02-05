// invoicepdf.js (NEW VERSION - Single Page Layout + Invoice/Receipt + Compact Header)
// ✅ Router “Invoice” แยกจาก ExportContainer 100%
// ✅ CRUD + Generate PDF (รองรับ schema ล่าสุด: docType, shipDate, snapshot totals, items/expenses)
// ✅ แก้ไทย/จีนเป็นต่างดาว: ใช้ 2 ฟอนต์ + วาดแบบแบ่งช่วงข้อความ (segment draw)
// ✅ Layout ใหม่ตามที่ขอ:
//    - ช่อง DETAIL เรียง: เบอร์ตู้, Brand, อุณหภูมิ, วันที่ปล่อย, transport, จำนวนกล่อง, น้ำหนักรวม
//    - หัวเอกสารเลือกได้: INVOICE / RECEIPT (ใช้ invoice.docType)
//    - ตัด DATE ที่หัวกระดาษออก (ใช้วันที่ปล่อยใน DETAIL แทน)
//    - ไม่มีกรอบหัวบิล / ไม่มีกรอบ Bill To & Detail (ประหยัดพื้นที่)
//    - เส้นสีแดงคั่นหัวกระดาษกับส่วนล่าง แทนกรอบ
//    - Company Name อยู่บรรทัดเดียวกับ BILL TO
//    - ตารางเรียงคอลัมน์: เกรด, จำนวนกล่อง, กก./กล่อง, Size, น้ำหนักรวม, ราคา, รวมเงิน
//    - ค่าใช้จ่ายคำนวณจาก น้ำหนักรวม * rate (rate มาจากฟอร์มหน้าเว็บ = invoice.rate)
//    - จำนวนเงินเป็นตัวอักษรใส่วงเล็บ
//    - ลายเซ็นด้านล่างอยู่หน้าเดียว: ซ้าย "ผู้วางบิล + วันที่", ขวา "ผู้มีอำนาจลงนาม + วันที่",
//      มีโลโก้ตรงกลาง และมีกรอบครอบส่วนเซ็นทั้งหมด
//
// Endpoints:
//   POST   /v1/invoices
//   GET    /v1/invoices?seasonId=...
//   GET    /v1/invoices/:id
//   PUT    /v1/invoices/:id
//   DELETE /v1/invoices/:id
//   GET    /v1/invoices/:id/pdf
//
// Fonts required:
//   ../fonts/THSarabunNew.ttf
//   ../fonts/THSarabunNewBold.ttf
//   ../fonts/NotoSansSC-Regular.ttf
//   ../fonts/NotoSansSC-Bold.ttf
//
// Logo presets in backend:
//   ../picture/S__5275654png (1).png
//   ../picture/dos.png
//   ../picture/logo2.png

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
function toISODate(d) {
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}
function toDateOnly(d) {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}
function hasCJK(s) {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(String(s || ""));
}
function hasThai(s) {
  return /[\u0E00-\u0E7F]/.test(String(s || ""));
}
function formatNumber(v, digits = 0) {
  const n = safeNumber(v, 0);
  return digits > 0
    ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : n.toLocaleString();
}

/* ----------------------------- fonts ----------------------------- */
function registerFonts(doc) {
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

  // default font
  if (loaded.th.regular) doc.font("th");
  else if (loaded.zh.regular) doc.font("zh");

  return loaded;
}

function pickFontName(loaded, wantZh, bold) {
  // prefer language, fallback other
  if (wantZh) {
    if (bold && loaded.zh.bold) return "zh-bold";
    if (!bold && loaded.zh.regular) return "zh";
    if (bold && loaded.th.bold) return "th-bold";
    if (!bold && loaded.th.regular) return "th";
    return null;
  } else {
    if (bold && loaded.th.bold) return "th-bold";
    if (!bold && loaded.th.regular) return "th";
    if (bold && loaded.zh.bold) return "zh-bold";
    if (!bold && loaded.zh.regular) return "zh";
    return null;
  }
}

/* ----------------------------- smart text (thai+chinese safe) ----------------------------- */
// ✅ แก้ “บรรทัดเดียวมีไทย+จีนแล้วไทยกลายเป็นต่างดาว”
// วิธี: แบ่งข้อความเป็นช่วง ๆ (ไทย/จีน/อื่น) แล้ววาดทีละช่วง พร้อมสลับฟอนต์
function splitSegments(text) {
  const s = String(text ?? "");
  if (!s) return [];

  const segments = [];
  let buf = "";
  let mode = null; // "zh" | "th" | "other"

  const classify = (ch) => {
    if (hasCJK(ch)) return "zh";
    if (hasThai(ch)) return "th";
    return "other";
  };

  for (const ch of s) {
    const m = classify(ch);
    if (mode === null) {
      mode = m;
      buf = ch;
      continue;
    }
    if (m === mode) buf += ch;
    else {
      segments.push({ text: buf, mode });
      mode = m;
      buf = ch;
    }
  }
  if (buf) segments.push({ text: buf, mode });

  // merge adjacent same mode
  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.mode === seg.mode) last.text += seg.text;
    else merged.push(seg);
  }
  return merged;
}

function drawSmartText(doc, loaded, text, x, y, options = {}) {
  const {
    width = 200,
    align = "left",
    bold = false,
    fontSize = 12,
    lineGap = 2,
    color = "#000000",
    maxLines = null,
  } = options;

  const raw = String(text ?? "");
  if (!raw) return { height: 0 };

  doc.fillColor(color).fontSize(fontSize);

  const words = raw.split(/(\s+)/).filter((w) => w !== ""); // keep spaces

  const measureToken = (tok) => {
    const segs = splitSegments(tok);
    let w = 0;
    for (const seg of segs) {
      const wantZh = seg.mode === "zh";
      const fontName = pickFontName(loaded, wantZh, bold);
      if (fontName) doc.font(fontName);
      w += doc.widthOfString(seg.text);
    }
    return w;
  };

  const lines = [];
  let current = [];
  let currentWidth = 0;

  for (const tok of words) {
    const tokWidth = measureToken(tok);

    // token too long => force cut by char
    if (tokWidth > width && tok.trim() !== "") {
      if (current.length) {
        lines.push(current.join(""));
        current = [];
        currentWidth = 0;
        if (maxLines && lines.length >= maxLines) break;
      }
      let temp = "";
      for (const ch of tok) {
        const w = measureToken(temp + ch);
        if (w <= width || temp === "") temp += ch;
        else {
          lines.push(temp);
          temp = ch;
          if (maxLines && lines.length >= maxLines) break;
        }
      }
      if (maxLines && lines.length >= maxLines) break;
      if (temp) {
        lines.push(temp);
        if (maxLines && lines.length >= maxLines) break;
      }
      continue;
    }

    if (currentWidth + tokWidth <= width || current.length === 0) {
      current.push(tok);
      currentWidth += tokWidth;
    } else {
      lines.push(current.join(""));
      current = [tok];
      currentWidth = tokWidth;
      if (maxLines && lines.length >= maxLines) break;
    }
  }

  if ((!maxLines || lines.length < maxLines) && current.length) lines.push(current.join(""));

  const lineH = doc.currentLineHeight(true) + lineGap;
  const totalH = lines.length * lineH;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // calc line width for align
    let lineW = 0;
    const segsForWidth = splitSegments(line);
    for (const seg of segsForWidth) {
      const wantZh = seg.mode === "zh";
      const fontName = pickFontName(loaded, wantZh, bold);
      if (fontName) doc.font(fontName);
      lineW += doc.widthOfString(seg.text);
    }

    let startX = x;
    if (align === "center") startX = x + (width - lineW) / 2;
    if (align === "right") startX = x + (width - lineW);

    let cursorX = startX;
    const segs = splitSegments(line);
    for (const seg of segs) {
      const wantZh = seg.mode === "zh";
      const fontName = pickFontName(loaded, wantZh, bold);
      if (fontName) doc.font(fontName);
      doc.text(seg.text, cursorX, y + i * lineH, { lineBreak: false });
      cursorX += doc.widthOfString(seg.text);
    }
  }

  // reset default font
  const fallback = pickFontName(loaded, false, false) || pickFontName(loaded, true, false);
  if (fallback) doc.font(fallback);

  return { height: totalH };
}

function heightSmartText(doc, loaded, text, options = {}) {
  const { width = 200, bold = false, fontSize = 12, lineGap = 2, maxLines = null } = options;
  const raw = String(text ?? "");
  if (!raw) return 0;

  doc.fontSize(fontSize);

  const words = raw.split(/(\s+)/).filter((w) => w !== "");

  const measureToken = (tok) => {
    const segs = splitSegments(tok);
    let w = 0;
    for (const seg of segs) {
      const wantZh = seg.mode === "zh";
      const fontName = pickFontName(loaded, wantZh, bold);
      if (fontName) doc.font(fontName);
      w += doc.widthOfString(seg.text);
    }
    return w;
  };

  const lines = [];
  let current = [];
  let currentWidth = 0;

  for (const tok of words) {
    const tokWidth = measureToken(tok);

    if (tokWidth > width && tok.trim() !== "") {
      if (current.length) {
        lines.push(current.join(""));
        current = [];
        currentWidth = 0;
        if (maxLines && lines.length >= maxLines) break;
      }
      let temp = "";
      for (const ch of tok) {
        const w = measureToken(temp + ch);
        if (w <= width || temp === "") temp += ch;
        else {
          lines.push(temp);
          temp = ch;
          if (maxLines && lines.length >= maxLines) break;
        }
      }
      if (maxLines && lines.length >= maxLines) break;
      if (temp) {
        lines.push(temp);
        if (maxLines && lines.length >= maxLines) break;
      }
      continue;
    }

    if (currentWidth + tokWidth <= width || current.length === 0) {
      current.push(tok);
      currentWidth += tokWidth;
    } else {
      lines.push(current.join(""));
      current = [tok];
      currentWidth = tokWidth;
      if (maxLines && lines.length >= maxLines) break;
    }
  }

  if ((!maxLines || lines.length < maxLines) && current.length) lines.push(current.join(""));

  const lineH = doc.currentLineHeight(true) + lineGap;
  return lines.length * lineH;
}

/* ----------------------------- PDF maker (single page) ----------------------------- */
function buildInvoicePDF(res, invoice) {
  // margin ลดลงเล็กน้อยเพื่อให้ยัดทุกอย่างอยู่หน้าเดียวง่ายขึ้น
  const doc = new PDFDocument({ size: "A4", margin: 28 });

  const buffers = [];
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

  const loaded = registerFonts(doc);

  const pageW = doc.page.width;
  const pageH = doc.page.height;
  const left = doc.page.margins.left;
  const right = pageW - doc.page.margins.right;
  const top = doc.page.margins.top;
  const bottom = pageH - doc.page.margins.bottom;

  const red = "#cc0000";
  const gray = "#cfcfcf";
  const lightGray = "#eeeeee";

  const logoPresets = {
    logo1: path.join(__dirname, "../picture/S__5275654png (1).png"),
    logo2: path.join(__dirname, "../picture/dos.png"),
    logo3: path.join(__dirname, "../picture/logo2.png"),
  };
  const defaultLogo = path.join(__dirname, "../picture/S__5275654png (1).png");

  const docType = String(invoice.docType || "INVOICE").toUpperCase();
  const usedShipDate = invoice.shipDate || invoice.date || new Date();

  // ===== compute totals (prefer snapshot) =====
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const rate = safeNumber(invoice.rate, 0); // ✅ rate = เรทค่าใช้จ่าย

  let totalBoxes = 0;
  let totalWeight = 0;
  let subtotal = 0;

  items.forEach((it) => {
    const boxes = safeNumber(it.boxes, 0);
    const wPerBox = safeNumber(it.weightPerBox, 0);

    const snapW = safeNumber(it.weightTotalKg, 0);
    const wTotal = snapW > 0 ? snapW : boxes * wPerBox;

    const unit = safeNumber(it.unitPrice, safeNumber(it.pricePerKg, 0));
    const snapAmt = safeNumber(it.amount, 0);
    const amt = snapAmt > 0 ? snapAmt : wTotal * unit;

    totalBoxes += boxes;
    totalWeight += wTotal;
    subtotal += amt;
  });

  const snapTotalBoxes = safeNumber(invoice.totalBoxes, 0);
  const snapTotalWeight = safeNumber(invoice.totalWeightKg, 0);
  const snapSubtotal = safeNumber(invoice.subtotalAmount, 0);

  if (snapTotalBoxes > 0) totalBoxes = snapTotalBoxes;
  if (snapTotalWeight > 0) totalWeight = snapTotalWeight;
  if (snapSubtotal > 0) subtotal = snapSubtotal;

  // ✅ ค่าใช้จ่าย = น้ำหนักรวม * rate (มาจากฟอร์ม)
  let expenseTotal = totalWeight * rate;
  const snapExpense = safeNumber(invoice.expenseAmount, 0);
  if (snapExpense > 0) expenseTotal = snapExpense;

  let grandTotal = subtotal + expenseTotal;
  const snapGrand = safeNumber(invoice.grandTotalAmount, 0);
  if (snapGrand > 0) grandTotal = snapGrand;

  // amount text (ต้องมีวงเล็บ)
  const dbAmountText = invoice.amountText ? String(invoice.amountText) : "";
  const amountText =
    dbAmountText && dbAmountText.trim()
      ? dbAmountText.trim().startsWith("(")
        ? dbAmountText.trim()
        : `(${dbAmountText.trim()})`
      : "";

  // ===== header (no frame) =====
  let y = top;

  // logo (small)
  const logoKey = invoice.companyLogoKey;
  const logoPath =
    (logoKey && logoPresets[logoKey] && fs.existsSync(logoPresets[logoKey]) && logoPresets[logoKey]) ||
    (fs.existsSync(defaultLogo) ? defaultLogo : null);

  const logoW = 46;
  if (logoPath) {
    try {
      doc.image(logoPath, left, y, { width: logoW });
    } catch (_) {}
  }

  // CompanyName (left) + BILL TO (right) same line
  const companyName = invoice.companyName || "SURIYA 388 CO.,LTD.";
  const billToName = invoice.billToName || "-";

  const headerLineY = y + 2;
  const companyX = left + (logoPath ? logoW + 10 : 0);
  const companyW = (right - companyX) * 0.55;
  const billToW = (right - companyX) * 0.45;

  drawSmartText(doc, loaded, companyName, companyX, headerLineY, {
    width: companyW,
    bold: true,
    fontSize: 13,
    maxLines: 1,
  });

  drawSmartText(doc, loaded, `BILL TO: ${billToName}`, companyX + companyW, headerLineY, {
    width: billToW,
    align: "right",
    bold: true,
    fontSize: 13,
    maxLines: 1,
  });

  // Doc type (top-right) + NO
  drawSmartText(doc, loaded, docType, right - 200, y, {
    width: 200,
    align: "right",
    bold: true,
    fontSize: 22,
    color: red,
    maxLines: 1,
  });

  drawSmartText(doc, loaded, `NO: #${invoice.invoiceNo || 1}`, right - 200, y + 24, {
    width: 200,
    align: "right",
    fontSize: 11,
    maxLines: 1,
  });

  // addresses/tax lines (compact, no box)
  const companyAddress = invoice.companyAddress || "";
  const companyTaxId = invoice.companyTaxId ? `Tax ID: ${invoice.companyTaxId}` : "";
  const companyPhone = invoice.companyPhone ? `Tel: ${invoice.companyPhone}` : "";

  const billToAddress = invoice.billToAddress || "";
  const billToTaxId = invoice.billToTaxId ? `Tax ID: ${invoice.billToTaxId}` : "";

  const addrY = y + 18;
  drawSmartText(doc, loaded, companyAddress, companyX, addrY, {
    width: companyW,
    fontSize: 10,
    maxLines: 2,
  });
  drawSmartText(doc, loaded, billToAddress, companyX + companyW, addrY, {
    width: billToW,
    align: "right",
    fontSize: 10,
    maxLines: 2,
  });

  const taxY = y + 42;
  const leftTaxLine = [companyTaxId, companyPhone].filter(Boolean).join(" | ");
  const rightTaxLine = billToTaxId;

  drawSmartText(doc, loaded, leftTaxLine, companyX, taxY, {
    width: companyW,
    fontSize: 10,
    maxLines: 1,
  });
  drawSmartText(doc, loaded, rightTaxLine, companyX + companyW, taxY, {
    width: billToW,
    align: "right",
    fontSize: 10,
    maxLines: 1,
  });

  // red divider line (แทนกรอบ)
  const dividerY = y + 58;
  doc.moveTo(left, dividerY).lineTo(right, dividerY).lineWidth(2).stroke(red);

  y = dividerY + 8;

  // ===== DETAIL (no box) =====
  // เรียงตามที่ขอ: เบอร์ตู้ Brand อุณหภูมิ วันที่ปล่อย transport จำนวนกล่อง น้ำหนักรวม
  // หมายเหตุ: "Brand" ใช้ brandRemark ตามของเดิมที่คุณส่งมา
  const detailLeftX = left;
  const detailRightX = left + (right - left) * 0.55;
  const detailColW = (right - left) * 0.45;

  const d1 = `เบอร์ตู้: ${invoice.containerCode || "-"}`;
  const d2 = `Brand: ${invoice.brandRemark || "-"}`;
  const d3 = `อุณหภูมิ: ${invoice.temperature || "-"}`;
  const d4 = `วันที่ปล่อย: ${thDate(usedShipDate)}`;
  const d5 = `Transport: ${invoice.transport || "-"}`;
  const d6 = `จำนวนกล่อง: ${formatNumber(totalBoxes)}`;
  const d7 = `น้ำหนักรวม: ${formatNumber(totalWeight)} KG`;

  // วาง 2 คอลัมน์ประหยัดพื้นที่
  const leftLines = [d1, d2, d3, d4];
  const rightLines = [d5, d6, d7];

  const detailFont = 11;
  const lineGap = 1;

  let dyL = y;
  for (const t of leftLines) {
    drawSmartText(doc, loaded, t, detailLeftX, dyL, { width: (right - left) * 0.55 - 10, fontSize: detailFont, maxLines: 1, lineGap });
    dyL += heightSmartText(doc, loaded, t, { width: (right - left) * 0.55 - 10, fontSize: detailFont, maxLines: 1, lineGap });
  }

  let dyR = y;
  for (const t of rightLines) {
    drawSmartText(doc, loaded, t, detailRightX, dyR, { width: detailColW, fontSize: detailFont, align: "right", maxLines: 1, lineGap });
    dyR += heightSmartText(doc, loaded, t, { width: detailColW, fontSize: detailFont, maxLines: 1, lineGap });
  }

  y = Math.max(dyL, dyR) + 8;

  // ===== table (single page, truncate if too many rows) =====
  const tableW = right - left;

  const colsBase = [
    { title: "เกรด", w: 70, align: "center" },
    { title: "จำนวนกล่อง", w: 85, align: "right" },
    { title: "กก./กล่อง", w: 85, align: "right" },
    { title: "Size", w: 60, align: "center" },
    { title: "น้ำหนักรวม", w: 90, align: "right" },
    { title: "ราคา", w: 80, align: "right" },
    { title: "รวมเงิน", w: 95, align: "right" },
  ];

  // scale to fit width
  const baseSum = colsBase.reduce((s, c) => s + c.w, 0);
  const scale = tableW / baseSum;
  const cols = colsBase.map((c) => ({ ...c, w: Math.floor(c.w * scale) }));
  const sumW = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w += tableW - sumW;

  const headerH = 22;
  const rowH = 18;
  const tableFont = 9;

  // reserve bottom: signature box + gap
  const sigBoxH = 95;
  const sigGap = 10;

  // reserve summary area above signature
  const summaryH = 62; // compact fixed
  const reserveBottom = sigBoxH + sigGap;

  // table area limit
  const tableBottomLimit = bottom - reserveBottom - summaryH - 8;

  const drawTableHeader = () => {
    doc.rect(left, y, tableW, headerH).fill(red);
    let x = left;
    for (const c of cols) {
      drawSmartText(doc, loaded, c.title, x + 4, y + 5, {
        width: c.w - 8,
        align: "center",
        bold: true,
        fontSize: 10,
        color: "#ffffff",
        maxLines: 1,
      });
      x += c.w;
    }
    y += headerH;
  };

  const drawRow = (values, stripe) => {
    if (stripe) doc.rect(left, y, tableW, rowH).fill("#f8f8f8");

    doc.rect(left, y, tableW, rowH).lineWidth(0.5).stroke("#dddddd");

    let x = left;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const txt = String(values[i] ?? "");
      drawSmartText(doc, loaded, txt, x + 4, y + 4, {
        width: c.w - 8,
        align: c.align,
        fontSize: tableFont,
        maxLines: 1,
      });
      x += c.w;
      doc.moveTo(x, y).lineTo(x, y + rowH).lineWidth(0.5).stroke("#dddddd");
    }

    y += rowH;
  };

  drawTableHeader();

  // max rows allowed (single page)
  const availableForRows = tableBottomLimit - y;
  const maxRows = Math.max(0, Math.floor(availableForRows / rowH));

  const rowsToDraw = items.slice(0, maxRows);
  rowsToDraw.forEach((it, idx) => {
    const boxes = safeNumber(it.boxes, 0);
    const wPerBox = safeNumber(it.weightPerBox, 0);
    const snapW = safeNumber(it.weightTotalKg, 0);
    const wTotal = snapW > 0 ? snapW : boxes * wPerBox;

    const unit = safeNumber(it.unitPrice, safeNumber(it.pricePerKg, 0));
    const snapAmt = safeNumber(it.amount, 0);
    const amt = snapAmt > 0 ? snapAmt : wTotal * unit;

    drawRow(
      [
        it.grade || "-",
        boxes ? formatNumber(boxes) : "",
        wPerBox ? formatNumber(wPerBox) : "",
        it.boxSize || "-",
        wTotal ? formatNumber(wTotal) : "",
        unit ? formatNumber(unit) : "",
        amt ? formatNumber(amt) : "",
      ],
      idx % 2 === 1
    );
  });

  // if truncated, show note line
  if (items.length > rowsToDraw.length) {
    const note = `… แสดง ${rowsToDraw.length} รายการจากทั้งหมด ${items.length} รายการ (รายการเยอะเกิน 1 หน้า)`;
    doc.rect(left, y, tableW, 16).fill(lightGray);
    drawSmartText(doc, loaded, note, left + 6, y + 3, {
      width: tableW - 12,
      fontSize: 9,
      maxLines: 1,
    });
    y += 18;
  }

  // TOTAL row (table footer) - compact
  if (y + rowH + 6 > tableBottomLimit) {
    // ถ้าใกล้ชน summary มาก ให้ขยับขึ้นเล็กน้อย (ไม่ addPage)
    y = tableBottomLimit - (rowH + 6);
  }

  doc.rect(left, y, tableW, rowH).fill(red);

  // write totals aligned into columns:
  // columns index: 1 boxes, 4 weight, 6 amount
  let x = left;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (i === 0) {
      drawSmartText(doc, loaded, "TOTAL", x + 6, y + 4, {
        width: c.w - 12,
        align: "left",
        bold: true,
        fontSize: 11,
        color: "#ffffff",
        maxLines: 1,
      });
    }
    if (i === 1) {
      drawSmartText(doc, loaded, formatNumber(totalBoxes), x + 4, y + 4, {
        width: c.w - 8,
        align: "right",
        bold: true,
        fontSize: 11,
        color: "#ffffff",
        maxLines: 1,
      });
    }
    if (i === 4) {
      drawSmartText(doc, loaded, formatNumber(totalWeight), x + 4, y + 4, {
        width: c.w - 8,
        align: "right",
        bold: true,
        fontSize: 11,
        color: "#ffffff",
        maxLines: 1,
      });
    }
    if (i === 6) {
      drawSmartText(doc, loaded, formatNumber(subtotal), x + 4, y + 4, {
        width: c.w - 8,
        align: "right",
        bold: true,
        fontSize: 11,
        color: "#ffffff",
        maxLines: 1,
      });
    }
    x += c.w;
  }

  y += rowH + 8;

  // ===== summary (compact, fixed) =====
  // วางก่อน signature เพื่อบังคับ 1 หน้า
  const summaryX = right - 290;
  const summaryW = 290;

  // clamp summary start
  if (y + summaryH > bottom - reserveBottom) {
    y = bottom - reserveBottom - summaryH;
  }

  // frame summary (กล่องเล็ก ๆ ได้ เพราะไม่ได้ขอเอาออก)
  doc.roundedRect(summaryX, y, summaryW, summaryH, 8).lineWidth(1).stroke(gray);

  drawSmartText(doc, loaded, "SUMMARY", summaryX + 10, y + 8, { width: summaryW - 20, bold: true, fontSize: 12, maxLines: 1 });

  const s1 = `Subtotal: ${formatNumber(subtotal)}`;
  const s2 = `Expense (Weight×Rate): ${formatNumber(expenseTotal)}  (Rate: ${formatNumber(rate)})`;
  const s3 = `Grand Total: ${formatNumber(grandTotal)}`;

  drawSmartText(doc, loaded, s1, summaryX + 10, y + 26, { width: summaryW - 20, fontSize: 10, maxLines: 1 });
  drawSmartText(doc, loaded, s2, summaryX + 10, y + 38, { width: summaryW - 20, fontSize: 9, maxLines: 1 });
  drawSmartText(doc, loaded, s3, summaryX + 10, y + 50, { width: summaryW - 20, fontSize: 10, bold: true, maxLines: 1 });

  // amount text (ใต้ summary ซ้ายให้พอดีหน้าเดียว)
  const amountX = left;
  const amountW = summaryX - left - 10;
  const amountY = y + 28; // วางระดับเดียวกับ summary เพื่อประหยัดที่

  if (amountText && amountW > 120) {
    drawSmartText(doc, loaded, `จำนวนเงินเป็นตัวอักษร ${amountText}`, amountX, amountY, {
      width: amountW,
      fontSize: 10,
      maxLines: 2,
    });
  }

  // ===== signature block (boxed, with center logo) =====
  const sigBoxY = bottom - sigBoxH;
  doc.rect(left, sigBoxY, right - left, sigBoxH).lineWidth(1).stroke(gray);

  const colW = (right - left) / 3;
  const leftX = left;
  const midX = left + colW;
  const rightX = left + colW * 2;

  const signDate = thDate(usedShipDate);

  // left - ผู้วางบิล
  drawSmartText(doc, loaded, "ผู้วางบิล", leftX, sigBoxY + 10, { width: colW, align: "center", fontSize: 12, bold: true, maxLines: 1 });
  drawSmartText(doc, loaded, `วันที่ ${signDate}`, leftX, sigBoxY + 26, { width: colW, align: "center", fontSize: 10, maxLines: 1 });
  doc.moveTo(leftX + 24, sigBoxY + 64).lineTo(leftX + colW - 24, sigBoxY + 64).stroke("#000");

  // right - ผู้มีอำนาจลงนาม
  drawSmartText(doc, loaded, "ผู้มีอำนาจลงนาม", rightX, sigBoxY + 10, { width: colW, align: "center", fontSize: 12, bold: true, maxLines: 1 });
  drawSmartText(doc, loaded, `วันที่ ${signDate}`, rightX, sigBoxY + 26, { width: colW, align: "center", fontSize: 10, maxLines: 1 });
  doc.moveTo(rightX + 24, sigBoxY + 64).lineTo(rightX + colW - 24, sigBoxY + 64).stroke("#000");

  // middle - logo
  if (logoPath) {
    try {
      doc.image(logoPath, midX + (colW - 52) / 2, sigBoxY + 22, { width: 52 });
    } catch (_) {}
  } else {
    drawSmartText(doc, loaded, "-", midX, sigBoxY + 40, { width: colW, align: "center", fontSize: 12 });
  }

  doc.end();
}

/* ----------------------------- ROUTES ----------------------------- */

// CREATE
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.date && !body.shipDate) {
      return res.status(400).json({ error: "date or shipDate required" });
    }

    // season auto-detect (optional)
    let seasonId = null;
    try {
      const billDate = toDateOnly(new Date(body.shipDate || body.date));
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
    const expenses = Array.isArray(body.expenses) ? body.expenses : [];

    const created = await prisma.invoice.create({
      data: {
        // ✅ เพิ่ม: เลือกหัวเอกสาร
        docType: body.docType || "INVOICE",

        // legacy
        date: body.date ? new Date(body.date) : new Date(),
        rate: body.rate === null || body.rate === undefined ? null : safeNumber(body.rate, 0),

        destination: body.destination || null,
        containerInfo: body.containerInfo || null,
        containerCode: body.containerCode || null,
        refCode: body.refCode || null,

        invoiceNo: safeNumber(body.invoiceNo, 1),

        billToName: body.billToName || null,
        billToAddress: body.billToAddress || null,
        billToTaxId: body.billToTaxId || null,

        companyName: body.companyName || null,
        companyAddress: body.companyAddress || null,
        companyTaxId: body.companyTaxId || null,
        companyPhone: body.companyPhone || null,

        companyLogoKey: body.companyLogoKey || null,
        note: body.note || null,

        // ใบจริง
        shipDate: body.shipDate ? new Date(body.shipDate) : null,
        route: body.route || null,
        temperature: body.temperature || null,
        transport: body.transport || null,
        brandRemark: body.brandRemark || null,

        // snapshots
        totalBoxes: body.totalBoxes === undefined ? undefined : safeNumber(body.totalBoxes, 0),
        totalWeightKg: body.totalWeightKg === undefined ? undefined : safeNumber(body.totalWeightKg, 0),
        subtotalAmount: body.subtotalAmount === undefined ? undefined : safeNumber(body.subtotalAmount, 0),
        expenseAmount: body.expenseAmount === undefined ? undefined : safeNumber(body.expenseAmount, 0),
        grandTotalAmount: body.grandTotalAmount === undefined ? undefined : safeNumber(body.grandTotalAmount, 0),
        amountText: body.amountText || null,

        seasonId,

        items: {
          create: items.map((it) => ({
            brand: it.brand || null,
            variety: it.variety || null,
            grade: it.grade || null,
            boxes: it.boxes === null || it.boxes === undefined ? null : safeNumber(it.boxes, 0),
            weightPerBox: it.weightPerBox === null || it.weightPerBox === undefined ? null : safeNumber(it.weightPerBox, 0),
            pricePerKg: it.pricePerKg === null || it.pricePerKg === undefined ? null : safeNumber(it.pricePerKg, 0),

            purchaseDate: it.purchaseDate ? new Date(it.purchaseDate) : null,
            boxSize: it.boxSize || null,
            weightTotalKg: it.weightTotalKg === undefined ? undefined : safeNumber(it.weightTotalKg, 0),
            unitPrice: it.unitPrice === undefined ? undefined : safeNumber(it.unitPrice, 0),
            amount: it.amount === undefined ? undefined : safeNumber(it.amount, 0),
          })),
        },

        expenses: {
          create: expenses.map((e) => ({
            label: e.label || "",
            amount: safeNumber(e.amount, 0),
          })),
        },
      },
      include: { items: true, expenses: true },
    });

    res.json(created);
  } catch (err) {
    console.error("❌ POST /v1/invoices error::", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในการบันทึก Invoice", details: String(err) });
  }
});

// READ ALL
router.get("/", async (req, res) => {
  try {
    const seasonId = req.query.seasonId ? parseInt(req.query.seasonId) : null;

    const list = await prisma.invoice.findMany({
      where: seasonId ? { seasonId } : {},
      orderBy: { id: "desc" },
      include: { items: true, expenses: true },
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
      include: { items: true, expenses: true },
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
    if (!body.date && !body.shipDate) {
      return res.status(400).json({ error: "date or shipDate required" });
    }

    // season auto-detect
    let seasonId = null;
    try {
      const billDate = toDateOnly(new Date(body.shipDate || body.date));
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
    const expenses = Array.isArray(body.expenses) ? body.expenses : [];

    await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await prisma.invoiceExpense.deleteMany({ where: { invoiceId: id } });

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        docType: body.docType || "INVOICE",

        date: body.date ? new Date(body.date) : new Date(),
        rate: body.rate === null || body.rate === undefined ? null : safeNumber(body.rate, 0),

        destination: body.destination || null,
        containerInfo: body.containerInfo || null,
        containerCode: body.containerCode || null,
        refCode: body.refCode || null,

        invoiceNo: safeNumber(body.invoiceNo, 1),

        billToName: body.billToName || null,
        billToAddress: body.billToAddress || null,
        billToTaxId: body.billToTaxId || null,

        companyName: body.companyName || null,
        companyAddress: body.companyAddress || null,
        companyTaxId: body.companyTaxId || null,
        companyPhone: body.companyPhone || null,

        companyLogoKey: body.companyLogoKey || null,
        note: body.note || null,

        shipDate: body.shipDate ? new Date(body.shipDate) : null,
        route: body.route || null,
        temperature: body.temperature || null,
        transport: body.transport || null,
        brandRemark: body.brandRemark || null,

        totalBoxes: body.totalBoxes === undefined ? undefined : safeNumber(body.totalBoxes, 0),
        totalWeightKg: body.totalWeightKg === undefined ? undefined : safeNumber(body.totalWeightKg, 0),
        subtotalAmount: body.subtotalAmount === undefined ? undefined : safeNumber(body.subtotalAmount, 0),
        expenseAmount: body.expenseAmount === undefined ? undefined : safeNumber(body.expenseAmount, 0),
        grandTotalAmount: body.grandTotalAmount === undefined ? undefined : safeNumber(body.grandTotalAmount, 0),
        amountText: body.amountText || null,

        seasonId,

        items: {
          create: items.map((it) => ({
            brand: it.brand || null,
            variety: it.variety || null,
            grade: it.grade || null,
            boxes: it.boxes === null || it.boxes === undefined ? null : safeNumber(it.boxes, 0),
            weightPerBox: it.weightPerBox === null || it.weightPerBox === undefined ? null : safeNumber(it.weightPerBox, 0),
            pricePerKg: it.pricePerKg === null || it.pricePerKg === undefined ? null : safeNumber(it.pricePerKg, 0),

            purchaseDate: it.purchaseDate ? new Date(it.purchaseDate) : null,
            boxSize: it.boxSize || null,
            weightTotalKg: it.weightTotalKg === undefined ? undefined : safeNumber(it.weightTotalKg, 0),
            unitPrice: it.unitPrice === undefined ? undefined : safeNumber(it.unitPrice, 0),
            amount: it.amount === undefined ? undefined : safeNumber(it.amount, 0),
          })),
        },

        expenses: {
          create: expenses.map((e) => ({
            label: e.label || "",
            amount: safeNumber(e.amount, 0),
          })),
        },
      },
      include: { items: true, expenses: true },
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
      include: { items: true, expenses: true },
    });

    if (!invoice) return res.status(404).json({ error: "ไม่พบ Invoice นี้" });

    buildInvoicePDF(res, invoice);
  } catch (err) {
    console.error("❌ GET /v1/invoices/:id/pdf error::", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดขณะสร้าง PDF", details: String(err) });
  }
});

module.exports = router;
