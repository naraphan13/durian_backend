// invoicepdf.js (UPDATED - Full file)
// ✅ Router ใหม่ “Invoice” แยกจาก ExportContainer 100%
// ✅ CRUD + Generate PDF (ตาม schema ล่าสุดของคุณ ที่ “เก็บของเดิมไว้ + เพิ่มฟิลด์ใบจริง”)
// ✅ แก้ปัญหาไทย/จีนเป็นต่างดาว: ใช้ 2 ฟอนต์ + วาด “แบบแบ่งช่วงข้อความ” (segment draw)
// ✅ แก้ปัญหาข้อความล้นช่อง/ทับบรรทัด: ใช้ doc.heightOfString + block layout (คำนวณความสูงจริง)
// ✅ โลโก้: preset เท่านั้น (companyLogoKey: logo1/logo2/logo3)  ❌ ไม่มี base64
// ✅ รองรับ items snapshot (weightTotalKg/unitPrice/amount) ถ้ามี จะใช้ก่อน
// ✅ รองรับ totals snapshot (totalBoxes/totalWeightKg/subtotalAmount/expenseAmount/grandTotalAmount/amountText) ถ้ามี จะใช้ก่อน
// ✅ อัปเดตตามที่ขอ:
//    - หัวเอกสารเลือก INVOICE/RECEIPT ด้วย invoice.docType (ถ้าไม่มี default INVOICE)
//    - ตัด DATE ที่หัวบิลออก (ใช้ shipDate/วันที่ปล่อยใน DETAIL)
//    - เส้นสีแดงคั่นหัวกระดาษกับด้านล่าง (แทนกรอบ)
//    - BILL TO อยู่ใต้เส้นแดง (ประหยัดพื้นที่)
//    - DETAIL เรียง: เบอร์ตู้, Brand, อุณหภูมิ, วันที่ปล่อย, transport, จำนวนกล่อง, น้ำหนักรวม
//    - ตารางเรียงคอลัมน์: วันที่ซื้อ, แบรนด์/รายการ, เกรด, จำนวนกล่อง, กก./กล่อง, Size, น้ำหนักรวม, ราคา, รวมเงิน
//    - ค่าใช้จ่ายคิดจาก: น้ำหนักรวม × rate (rate จาก invoice.rate)
//    - จำนวนเงินเป็นตัวอักษรให้มีวงเล็บ (ใน SUMMARY)
//    - ลายเซ็น: ซ้าย=ผู้วางบิล+วันที่, กลาง=โลโก้, ขวา=ผู้มีอำนาจลงนาม+วันที่ + มีกล่องครอบส่วนเซ็นทั้งหมด
//
// ✅ FIX เพิ่มเติม (ตามข้อความล่าสุดของคุณ):
//    - PDF รองรับขึ้นบรรทัดใหม่จาก \n ใน drawSmartText/heightSmartText
//    - BILL TO: แสดงชื่อบริษัทไทย/อังกฤษ "คนละบรรทัด" ได้จริง (ไม่บังคับ maxLines=1)
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

  // default
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
    if (m === mode) {
      buf += ch;
    } else {
      segments.push({ text: buf, mode });
      mode = m;
      buf = ch;
    }
  }
  if (buf) segments.push({ text: buf, mode });

  // รวม other ที่ติดกัน
  const merged = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.mode === seg.mode) last.text += seg.text;
    else merged.push(seg);
  }
  return merged;
}

/**
 * ✅ NEW: wrap text โดย "รองรับ \n" จริง
 * - แยกเป็น paragraphs ตาม \n ก่อน
 * - wrap ทีละ paragraph ด้วย whitespace token
 * - รักษาบรรทัดว่างได้
 */
function buildWrappedLines(doc, loaded, rawText, options = {}) {
  const { width = 200, bold = false, maxLines = null } = options;

  const raw = String(rawText ?? "");
  if (!raw) return [];

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
  const paragraphs = raw.split(/\r?\n/);

  const pushLineSafe = (line) => {
    lines.push(line);
    if (maxLines && lines.length >= maxLines) return false;
    return true;
  };

  const wrapParagraph = (para) => {
    const words = String(para).split(/(\s+)/).filter((w) => w !== "");
    let current = [];
    let currentWidth = 0;

    for (const tok of words) {
      const tokWidth = measureToken(tok);

      // token ยาวมาก -> ตัดทีละตัว
      if (tokWidth > width && tok.trim() !== "") {
        if (current.length) {
          if (!pushLineSafe(current.join(""))) return false;
          current = [];
          currentWidth = 0;
        }

        let temp = "";
        for (const ch of tok) {
          const w = measureToken(temp + ch);
          if (w <= width || temp === "") temp += ch;
          else {
            if (!pushLineSafe(temp)) return false;
            temp = ch;
          }
        }
        if (temp) {
          if (!pushLineSafe(temp)) return false;
        }
        continue;
      }

      if (currentWidth + tokWidth <= width || current.length === 0) {
        current.push(tok);
        currentWidth += tokWidth;
      } else {
        if (!pushLineSafe(current.join(""))) return false;
        current = [tok];
        currentWidth = tokWidth;
      }
    }

    if (current.length) {
      if (!pushLineSafe(current.join(""))) return false;
    }
    return true;
  };

  for (const para of paragraphs) {
    if (maxLines && lines.length >= maxLines) break;

    // บรรทัดว่างจากการกด Enter
    if (String(para).trim() === "") {
      if (!pushLineSafe("")) break;
      continue;
    }

    const ok = wrapParagraph(para);
    if (!ok) break;
  }

  return lines;
}

// วาดข้อความแบบ segmented ภายในกรอบความกว้างเดียว (รองรับ \n)
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

  // ✅ NEW: รองรับ \n
  const lines = buildWrappedLines(doc, loaded, raw, { width, bold, maxLines });

  const lineH = doc.currentLineHeight(true) + lineGap;
  const totalH = lines.length * lineH;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // วัดความกว้างบรรทัดเพื่อ align
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

  const fallback = pickFontName(loaded, false, false) || pickFontName(loaded, true, false);
  if (fallback) doc.font(fallback);

  return { height: totalH };
}

function heightSmartText(doc, loaded, text, options = {}) {
  const { width = 200, bold = false, fontSize = 12, lineGap = 2, maxLines = null } = options;

  const raw = String(text ?? "");
  if (!raw) return 0;

  doc.fontSize(fontSize);

  // ✅ NEW: รองรับ \n
  const lines = buildWrappedLines(doc, loaded, raw, { width, bold, maxLines });

  const lineH = doc.currentLineHeight(true) + lineGap;
  return lines.length * lineH;
}

/* ----------------------------- PDF maker ----------------------------- */
function buildInvoicePDF(res, invoice) {
  // ✅ พยายามให้อยู่หน้าเดียว: ลด margin นิดหน่อย
  const doc = new PDFDocument({ size: "A4", margin: 32 });

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
  const gray = "#cccccc";
  const lightGray = "#dddddd";

  const logoPresets = {
    logo1: path.join(__dirname, "../picture/S__5275654png (1).png"),
    logo2: path.join(__dirname, "../picture/dos.png"),
    logo3: path.join(__dirname, "../picture/logo2.png"),
  };
  const defaultLogo = path.join(__dirname, "../picture/S__5275654png (1).png");

  const usedDate = invoice.shipDate || invoice.date || new Date();

  // ===== compute totals early (needed for DETAIL ordering + expense calc) =====
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const rate = safeNumber(invoice.rate, 0);

  let totalBoxes = 0;
  let totalWeight = 0;
  let subtotal = 0;

  items.forEach((it) => {
    const boxes = safeNumber(it.boxes, 0);
    const wPerBox = safeNumber(it.weightPerBox, 0);

    const snapshotWeight = safeNumber(it.weightTotalKg, 0);
    const computedWeight = boxes * wPerBox;
    const weightTotal = snapshotWeight > 0 ? snapshotWeight : computedWeight;

    const snapshotUnit = safeNumber(it.unitPrice, 0);
    const computedUnit = rate > 0 ? rate : safeNumber(it.pricePerKg, 0);
    const unitPrice = snapshotUnit > 0 ? snapshotUnit : computedUnit;

    const snapshotAmount = safeNumber(it.amount, 0);
    const computedAmount = weightTotal * unitPrice;
    const amount = snapshotAmount > 0 ? snapshotAmount : computedAmount;

    totalBoxes += boxes;
    totalWeight += weightTotal;
    subtotal += amount;
  });

  // totals snapshot
  const snapTotalBoxes = safeNumber(invoice.totalBoxes, 0);
  const snapTotalWeight = safeNumber(invoice.totalWeightKg, 0);
  const snapSubtotal = safeNumber(invoice.subtotalAmount, 0);

  if (snapTotalBoxes > 0) totalBoxes = snapTotalBoxes;
  if (snapTotalWeight > 0) totalWeight = snapTotalWeight;
  if (snapSubtotal > 0) subtotal = snapSubtotal;

  // ✅ expense ใหม่: น้ำหนักรวม × rate (ถ้ามี snapshot expenseAmount ให้ใช้)
  let expenseTotal = totalWeight * rate;
  const snapExpense = safeNumber(invoice.expenseAmount, 0);
  if (snapExpense > 0) expenseTotal = snapExpense;

  let grandTotal = subtotal + expenseTotal;
  const snapGrand = safeNumber(invoice.grandTotalAmount, 0);
  if (snapGrand > 0) grandTotal = snapGrand;

  const amountText = invoice.amountText ? String(invoice.amountText) : "";

  /* ============================= HEADER (no box) ============================= */
  const headerY = top;
  let y = headerY;

  // logo left
  const logoW = 62;
  const logoH = 62;
  let logoPath = null;
  if (invoice.companyLogoKey && logoPresets[invoice.companyLogoKey] && fs.existsSync(logoPresets[invoice.companyLogoKey])) {
    logoPath = logoPresets[invoice.companyLogoKey];
  } else if (fs.existsSync(defaultLogo)) {
    logoPath = defaultLogo;
  }
  if (logoPath) {
    doc.image(logoPath, left, y, { width: logoW, height: logoH });
  }

  const companyName = invoice.companyName || "SURIYA 388 CO.,LTD.";
  const companyAddress = invoice.companyAddress || "";
  const companyTaxId = invoice.companyTaxId || "";
  const companyPhone = invoice.companyPhone || "";

  // Title right: INVOICE/RECEIPT
  const docType = String(invoice.docType || "INVOICE").toUpperCase();
  drawSmartText(doc, loaded, docType, right - 220, y, {
    width: 220,
    align: "right",
    bold: true,
    fontSize: 26,
    color: red,
    maxLines: 1,
  });

  // company block beside logo
  const companyX = left + (logoPath ? logoW + 10 : 0);
  const companyW = (right - left) - (logoPath ? logoW + 10 : 0) - 230; // keep space for title at right

  // company name
  const nameH = heightSmartText(doc, loaded, companyName, { width: companyW, bold: true, fontSize: 16, lineGap: 1, maxLines: 2 });
  drawSmartText(doc, loaded, companyName, companyX, y, { width: companyW, bold: true, fontSize: 16, maxLines: 2 });
  y += nameH;

  // tax + tel
  const taxLine = companyTaxId ? `Tax ID: ${companyTaxId}` : "";
  const telLine = companyPhone ? `Tel: ${companyPhone}` : "";
  const taxH = taxLine ? heightSmartText(doc, loaded, taxLine, { width: companyW, fontSize: 11, lineGap: 1 }) : 0;
  const telH = telLine ? heightSmartText(doc, loaded, telLine, { width: companyW, fontSize: 11, lineGap: 1 }) : 0;

  if (taxLine) {
    drawSmartText(doc, loaded, taxLine, companyX, y + 1, { width: companyW, fontSize: 11 });
    y += taxH;
  }
  if (telLine) {
    drawSmartText(doc, loaded, telLine, companyX, y + 1, { width: companyW, fontSize: 11 });
    y += telH;
  }

  // address
  const addrH = companyAddress
    ? heightSmartText(doc, loaded, companyAddress, { width: companyW, fontSize: 11, lineGap: 1, maxLines: 3 })
    : 0;
  if (companyAddress) {
    drawSmartText(doc, loaded, companyAddress, companyX, y + 1, { width: companyW, fontSize: 11, maxLines: 3 });
    y += addrH;
  }

  // (optional) invoice no on right under title
  const invNoLine = `NO: #${invoice.invoiceNo || 1}`;
  drawSmartText(doc, loaded, invNoLine, right - 220, headerY + 30, {
    width: 220,
    align: "right",
    fontSize: 11,
    bold: false,
    color: "#000000",
  });

  // ✅ red separator line
  const redLineY = Math.max(headerY + 70, y + 6);
  doc.moveTo(left, redLineY).lineTo(right, redLineY).lineWidth(1.5).stroke(red);

  /* ============================= BILL TO + DETAIL (no boxes) ============================= */
  let sectionY = redLineY + 10;

  const billToName = invoice.billToName || "-";
  const billToTaxId = invoice.billToTaxId || "";
  const billToAddress = invoice.billToAddress || "";

  // ✅ FIX: BILL TO แยกหัวกับชื่อ (เพื่อรองรับ \n ในชื่อบริษัท)
  const billToTitle = "BILL TO:";
  const billToTitleH = heightSmartText(doc, loaded, billToTitle, {
    width: (right - left) * 0.55,
    bold: true,
    fontSize: 13,
    lineGap: 1,
    maxLines: 1,
  });
  drawSmartText(doc, loaded, billToTitle, left, sectionY, {
    width: (right - left) * 0.55,
    bold: true,
    fontSize: 13,
    maxLines: 1,
  });

  // ✅ ชื่อบริษัท/ลูกค้า รองรับขึ้นบรรทัดจาก \n (ไทย/อังกฤษคนละบรรทัด)
  const nameBlockX = left + 70; // เว้นจาก "BILL TO:" นิดนึง
  const nameBlockW = (right - left) * 0.55 - 70;

  const billToNameH = heightSmartText(doc, loaded, billToName, {
    width: nameBlockW,
    bold: true,
    fontSize: 13,
    lineGap: 1,
    maxLines: 3, // ปรับได้ตามต้องการ
  });
  drawSmartText(doc, loaded, billToName, nameBlockX, sectionY, {
    width: nameBlockW,
    bold: true,
    fontSize: 13,
    lineGap: 1,
    maxLines: 3,
  });

  // billTo sub lines
  let by = sectionY + Math.max(billToTitleH, billToNameH) + 2;

  if (billToTaxId) {
    const t = `Tax ID: ${billToTaxId}`;
    drawSmartText(doc, loaded, t, left, by, { width: (right - left) * 0.55, fontSize: 11, maxLines: 1 });
    by += heightSmartText(doc, loaded, t, { width: (right - left) * 0.55, fontSize: 11, lineGap: 1, maxLines: 1 });
  }
  if (billToAddress) {
    drawSmartText(doc, loaded, billToAddress, left, by, { width: (right - left) * 0.55, fontSize: 11, maxLines: 3 });
    by += heightSmartText(doc, loaded, billToAddress, { width: (right - left) * 0.55, fontSize: 11, lineGap: 1, maxLines: 3 });
  }

  // DETAIL block on right (no box)
  const metaX = left + (right - left) * 0.58;
  const metaW = right - metaX;

  const temperature = invoice.temperature || "-";
  const transport = invoice.transport || "-";
  const brandRemark = invoice.brandRemark || "-";
  const containerCode = invoice.containerCode || "-";

  // ✅ DETAIL order: เบอร์ตู้ Brand อุณหภูมิ วันที่ปล่อย transport จำนวนกล่อง น้ำหนักรวม
  const detailLines = [
    `Container: ${containerCode}`,
    `Brand: ${brandRemark}`,
    `Temp: ${temperature}`,
    `Ship Date: ${thDate(usedDate)}`,
    `Transport: ${transport}`,
    `Total Boxes: ${formatNumber(totalBoxes)}`,
    `Total Weight: ${formatNumber(totalWeight)}`,
  ];

  // draw detail
  let my = sectionY;
  drawSmartText(doc, loaded, "DETAIL", metaX, my, { width: metaW, bold: true, fontSize: 13, maxLines: 1 });
  my += heightSmartText(doc, loaded, "DETAIL", { width: metaW, bold: true, fontSize: 13, lineGap: 1, maxLines: 1 }) + 2;

  for (const t of detailLines) {
    drawSmartText(doc, loaded, t, metaX, my, { width: metaW, fontSize: 11, maxLines: 1 });
    my += heightSmartText(doc, loaded, t, { width: metaW, fontSize: 11, lineGap: 1, maxLines: 1 });
  }

  // section bottom y
  const sectionBottom = Math.max(by, my);
  let tableY = sectionBottom + 10;

  /* ============================= ITEMS TABLE ============================= */
  const tableW = right - left;

  // ✅ columns order requested:
  // วันที่ซื้อ | แบรนด์/รายการ | เกรด | จำนวนกล่อง | กก./กล่อง | Size | น้ำหนักรวม | ราคา | รวมเงิน
  const baseCols = [
    { title: "วันที่ซื้อ", w: 72, align: "left" },
    { title: "แบรนด์/รายการ", w: 220, align: "left" },
    { title: "เกรด", w: 44, align: "center" },
    { title: "กล่อง", w: 58, align: "right" },
    { title: "กก./กล่อง", w: 68, align: "right" },
    { title: "Size", w: 44, align: "center" },
    { title: "น้ำหนักรวม", w: 78, align: "right" },
    { title: "ราคา", w: 58, align: "right" },
    { title: "รวมเงิน", w: 78, align: "right" },
  ];

  const baseSum = baseCols.reduce((s, c) => s + c.w, 0);
  const scale = tableW / baseSum;
  const cols = baseCols.map((c) => ({ ...c, w: Math.floor(c.w * scale) }));
  const wSum = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w += tableW - wSum;

  const rowH = 20;
  const headerH2 = 22;

  const ensureSpace = (neededH) => {
    // ✅ เราไม่อยากขึ้นหน้า 2: ถ้าจะล้นให้ "ลดขนาด" แทนการ addPage
    // แต่ถ้าล้นจริง ๆ ก็ยังต้องขึ้นหน้าใหม่เพื่อกัน crash
    if (tableY + neededH > bottom) {
      doc.addPage();
      registerFonts(doc);
      tableY = doc.page.margins.top;
      drawTableHeader();
    }
  };

  const drawTableHeader = () => {
    doc.rect(left, tableY, tableW, headerH2).fill(red);

    let x = left;
    for (const c of cols) {
      drawSmartText(doc, loaded, c.title, x + 3, tableY + 5, {
        width: c.w - 6,
        align: "center",
        bold: true,
        fontSize: 9.5,
        color: "#ffffff",
        maxLines: 1,
      });
      x += c.w;
    }
    tableY += headerH2;
  };

  drawTableHeader();

  const drawRow = (values, stripe) => {
    ensureSpace(rowH + 2);

    if (stripe) doc.rect(left, tableY, tableW, rowH).fill("#f7f7f7");

    doc.rect(left, tableY, tableW, rowH).lineWidth(0.5).stroke(lightGray);

    let x = left;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const txt = String(values[i] ?? "");
      drawSmartText(doc, loaded, txt, x + 3, tableY + 5, {
        width: c.w - 6,
        align: c.align || "left",
        fontSize: 9.5,
        color: "#000000",
        maxLines: 1,
      });
      x += c.w;
      doc.moveTo(x, tableY).lineTo(x, tableY + rowH).lineWidth(0.5).stroke(lightGray);
    }

    tableY += rowH;
  };

  // draw item rows (prefer snapshot)
  items.forEach((it, idx) => {
    const boxes = safeNumber(it.boxes, 0);
    const wPerBox = safeNumber(it.weightPerBox, 0);

    const snapshotWeight = safeNumber(it.weightTotalKg, 0);
    const computedWeight = boxes * wPerBox;
    const weightTotal = snapshotWeight > 0 ? snapshotWeight : computedWeight;

    const snapshotUnit = safeNumber(it.unitPrice, 0);
    const computedUnit = rate > 0 ? rate : safeNumber(it.pricePerKg, 0);
    const unitPrice = snapshotUnit > 0 ? snapshotUnit : computedUnit;

    const snapshotAmount = safeNumber(it.amount, 0);
    const computedAmount = weightTotal * unitPrice;
    const amount = snapshotAmount > 0 ? snapshotAmount : computedAmount;

    const purchaseDate = it.purchaseDate ? toISODate(it.purchaseDate) : toISODate(usedDate);
    const itemName = `${it.brand ? it.brand + " " : ""}${it.variety || ""}`.trim() || "-";
    const grade = it.grade || "-";
    const size = it.boxSize || "-";

    drawRow(
      [
        purchaseDate,
        itemName,
        grade,
        boxes ? formatNumber(boxes) : "",
        wPerBox ? formatNumber(wPerBox) : "",
        size,
        weightTotal ? formatNumber(weightTotal) : "",
        unitPrice ? formatNumber(unitPrice) : "",
        amount ? formatNumber(amount) : "",
      ],
      idx % 2 === 1
    );
  });

  /* ============================= TOTAL (table footer) ============================= */
  ensureSpace(60);

  doc.rect(left, tableY, tableW, rowH).fill(red);

  // label spans first 3 columns now (วันที่ซื้อ + แบรนด์/รายการ + เกรด)
  const spanW = cols[0].w + cols[1].w + cols[2].w;

  drawSmartText(doc, loaded, "TOTAL", left + 6, tableY + 4, {
    width: spanW - 12,
    align: "left",
    bold: true,
    fontSize: 11,
    color: "#ffffff",
    maxLines: 1,
  });

  // write totals into specific columns (new indexes)
  // col index: 3 = boxes, 6 = weight, 8 = amount(subtotal)
  let x = left;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];

    if (i === 3) {
      drawSmartText(doc, loaded, formatNumber(totalBoxes), x + 3, tableY + 4, {
        width: c.w - 6,
        align: "right",
        bold: true,
        fontSize: 11,
        color: "#ffffff",
      });
    }
    if (i === 6) {
      drawSmartText(doc, loaded, formatNumber(totalWeight), x + 3, tableY + 4, {
        width: c.w - 6,
        align: "right",
        bold: true,
        fontSize: 11,
        color: "#ffffff",
      });
    }
    if (i === 8) {
      drawSmartText(doc, loaded, formatNumber(subtotal), x + 3, tableY + 4, {
        width: c.w - 6,
        align: "right",
        bold: true,
        fontSize: 11,
        color: "#ffffff",
      });
    }

    x += c.w;
  }

  tableY += rowH + 8;

  /* ============================= SUMMARY (right aligned) ============================= */
  const summaryW = 270;
  const summaryX = right - summaryW;

  const summaryLines = [
    { label: "Subtotal (ค่าสินค้า)", value: subtotal },
    { label: "Expenses (น.น.รวม×เรท)", value: expenseTotal },
    { label: "Grand Total (รวมทั้งสิ้น)", value: grandTotal },
  ];

  const titleH = heightSmartText(doc, loaded, "SUMMARY", { width: summaryW - 20, bold: true, fontSize: 12, lineGap: 1 });
  let linesH = 0;
  for (const ln of summaryLines) {
    const t = `${ln.label}: ${formatNumber(ln.value)}`;
    linesH += heightSmartText(doc, loaded, t, { width: summaryW - 20, fontSize: 11, lineGap: 1, maxLines: 2 });
  }

  // amount text with parentheses
  const amountLine = amountText ? `(${amountText})` : "";
  const amountH = amountLine ? heightSmartText(doc, loaded, amountLine, { width: summaryW - 20, fontSize: 11, lineGap: 1, maxLines: 3 }) : 0;

  const summaryH = 10 + titleH + 6 + linesH + (amountLine ? 6 + amountH : 0) + 10;

  ensureSpace(summaryH + 10);

  doc.roundedRect(summaryX, tableY, summaryW, summaryH, 8).lineWidth(1).stroke(gray);

  drawSmartText(doc, loaded, "SUMMARY", summaryX + 10, tableY + 8, {
    width: summaryW - 20,
    bold: true,
    fontSize: 12,
  });

  let sy = tableY + 8 + titleH + 6;

  for (const ln of summaryLines) {
    const t = `${ln.label}: ${formatNumber(ln.value)}`;
    drawSmartText(doc, loaded, t, summaryX + 10, sy, { width: summaryW - 20, fontSize: 11, maxLines: 2 });
    sy += heightSmartText(doc, loaded, t, { width: summaryW - 20, fontSize: 11, lineGap: 1, maxLines: 2 });
  }

  if (amountLine) {
    sy += 6;
    drawSmartText(doc, loaded, amountLine, summaryX + 10, sy, { width: summaryW - 20, fontSize: 11, maxLines: 3 });
  }

  // put summary top y for left area
  const summaryTopY = tableY;
  tableY += summaryH + 10;

  /* ============================= LEFT: EXPENSES (auto calc display) ============================= */
  // ตามที่ขอ: ค่าใช้จ่ายคิดเอง = totalWeight * rate (เอามาจากตาราง + rate)
  const expBoxX = left;
  const expBoxW = summaryX - left - 10;

  const expTitle = "EXPENSES / ค่าใช้จ่าย";
  const expLine1 = `น้ำหนักรวม × เรท = ${formatNumber(totalWeight)} × ${formatNumber(rate)} = ${formatNumber(expenseTotal)}`;

  const expTitleH = heightSmartText(doc, loaded, expTitle, { width: expBoxW - 20, bold: true, fontSize: 12, lineGap: 1, maxLines: 1 });
  const expLineH = heightSmartText(doc, loaded, expLine1, { width: expBoxW - 20, fontSize: 11, lineGap: 1, maxLines: 2 });

  const expH = Math.max(62, 10 + expTitleH + 6 + expLineH + 10);

  // align with summary top
  doc.roundedRect(expBoxX, summaryTopY, expBoxW, expH, 8).lineWidth(1).stroke(gray);

  drawSmartText(doc, loaded, expTitle, expBoxX + 10, summaryTopY + 8, {
    width: expBoxW - 20,
    bold: true,
    fontSize: 12,
    maxLines: 1,
  });

  drawSmartText(doc, loaded, expLine1, expBoxX + 10, summaryTopY + 8 + expTitleH + 6, {
    width: expBoxW - 20,
    fontSize: 11,
    maxLines: 2,
  });

  /* ============================= NOTE (optional) ============================= */
  if (invoice.note && String(invoice.note).trim()) {
    const noteTitle = "Note / หมายเหตุ";
    const noteText = String(invoice.note);

    const noteW = right - left;
    const noteTitleH = heightSmartText(doc, loaded, noteTitle, { width: noteW, bold: true, fontSize: 12, lineGap: 1 });
    const noteTextH = heightSmartText(doc, loaded, noteText, { width: noteW, fontSize: 11, lineGap: 1, maxLines: 3 });
    const need = 6 + noteTitleH + 4 + noteTextH + 6;

    ensureSpace(need);

    drawSmartText(doc, loaded, noteTitle, left, tableY, { width: noteW, bold: true, fontSize: 12 });
    tableY += noteTitleH + 4;
    drawSmartText(doc, loaded, noteText, left, tableY, { width: noteW, fontSize: 11, maxLines: 3 });
    tableY += noteTextH + 8;
  }

  /* ============================= SIGNATURES (boxed, one page preferred) ============================= */
  // เซ็น: ซ้าย ผู้วางบิล + วันที่ | กลาง โลโก้ | ขวา ผู้มีอำนาจลงนาม + วันที่
  const sigBoxH = 95;
  const sigBoxW = right - left;

  // ensure space; if still not fit -> new page (สุดท้ายจริง ๆ)
  if (tableY + sigBoxH > bottom) {
    doc.addPage();
    registerFonts(doc);
    tableY = doc.page.margins.top;
  }

  const sigY = Math.min(bottom - sigBoxH, tableY);

  doc.roundedRect(left, sigY, sigBoxW, sigBoxH, 8).lineWidth(1).stroke(gray);

  const colW = sigBoxW / 3;

  // left
  const leftTitle = "ผู้วางบิล";
  const leftDate = `วันที่: ${thDate(usedDate)}`;
  drawSmartText(doc, loaded, leftTitle, left + 10, sigY + 10, { width: colW - 20, align: "center", fontSize: 12, bold: true, maxLines: 1 });
  doc.moveTo(left + 10, sigY + 52).lineTo(left + colW - 10, sigY + 52).stroke("#000");
  drawSmartText(doc, loaded, leftDate, left + 10, sigY + 60, { width: colW - 20, align: "center", fontSize: 11, maxLines: 1 });

  // middle logo
  const midX = left + colW;
  const midTitle = "ตราประทับ / Logo";
  drawSmartText(doc, loaded, midTitle, midX + 10, sigY + 10, { width: colW - 20, align: "center", fontSize: 12, bold: true, maxLines: 1 });

  if (logoPath && fs.existsSync(logoPath)) {
    // draw centered small logo
    const lw = 40;
    const lh = 40;
    const lx = midX + (colW - lw) / 2;
    const ly = sigY + 32;
    doc.image(logoPath, lx, ly, { width: lw, height: lh });
  } else {
    doc.rect(midX + colW / 2 - 20, sigY + 32, 40, 40).lineWidth(0.8).dash(2, { space: 2 }).stroke("#888").undash();
  }

  // right
  const rightX = left + colW * 2;
  const rightTitle = "ผู้มีอำนาจลงนาม";
  const rightDate = `วันที่: ${thDate(usedDate)}`;
  drawSmartText(doc, loaded, rightTitle, rightX + 10, sigY + 10, { width: colW - 20, align: "center", fontSize: 12, bold: true, maxLines: 1 });
  doc.moveTo(rightX + 10, sigY + 52).lineTo(rightX + colW - 10, sigY + 52).stroke("#000");
  drawSmartText(doc, loaded, rightDate, rightX + 10, sigY + 60, { width: colW - 20, align: "center", fontSize: 11, maxLines: 1 });

  // vertical separators inside signature box
  doc.moveTo(left + colW, sigY).lineTo(left + colW, sigY + sigBoxH).lineWidth(0.5).stroke(lightGray);
  doc.moveTo(left + colW * 2, sigY).lineTo(left + colW * 2, sigY + sigBoxH).lineWidth(0.5).stroke(lightGray);

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
        // ของเดิม
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

        // ✅ ประเภทเอกสาร (ถ้า schema มี)
        docType: body.docType ? String(body.docType).toUpperCase() : undefined,

        // ใบจริง (optional)
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
            // เดิม
            brand: it.brand || null,
            variety: it.variety || null,
            grade: it.grade || null,
            boxes: it.boxes === null || it.boxes === undefined ? null : safeNumber(it.boxes, 0),
            weightPerBox: it.weightPerBox === null || it.weightPerBox === undefined ? null : safeNumber(it.weightPerBox, 0),
            pricePerKg: it.pricePerKg === null || it.pricePerKg === undefined ? null : safeNumber(it.pricePerKg, 0),

            // ใหม่
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
    const docType = req.query.docType ? String(req.query.docType).toUpperCase() : null;

    const where = {};
    if (seasonId) where.seasonId = seasonId;
    if (docType) where.docType = docType; // ถ้า schema ไม่มี docType ให้ลบออก

    const list = await prisma.invoice.findMany({
      where,
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

    // ลบรายการลูกก่อน (ง่ายและชัวร์)
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await prisma.invoiceExpense.deleteMany({ where: { invoiceId: id } });

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
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

        // ✅ ประเภทเอกสาร (ถ้า schema มี)
        docType: body.docType ? String(body.docType).toUpperCase() : undefined,

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
