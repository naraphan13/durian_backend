// invoicepdf.js (FINAL - Full file)
// ✅ Router ใหม่ “Invoice” แยกจาก ExportContainer 100%
// ✅ CRUD + Generate PDF (ตาม schema ล่าสุดของคุณ ที่ “เก็บของเดิมไว้ + เพิ่มฟิลด์ใบจริง”)
// ✅ แก้ปัญหาไทย/จีนเป็นต่างดาว: ใช้ 2 ฟอนต์ + วาด “แบบแบ่งช่วงข้อความ” (segment draw)
// ✅ แก้ปัญหาข้อความล้นช่อง/ทับบรรทัด: ใช้ doc.heightOfString + block layout (คำนวณความสูงจริง)
// ✅ โลโก้: preset เท่านั้น (companyLogoKey: logo1/logo2/logo3)  ❌ ไม่มี base64
// ✅ รองรับ items snapshot (weightTotalKg/unitPrice/amount) ถ้ามี จะใช้ก่อน
// ✅ รองรับ totals snapshot (totalBoxes/totalWeightKg/subtotalAmount/expenseAmount/grandTotalAmount/amountText) ถ้ามี จะใช้ก่อน
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
  return digits > 0 ? n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : n.toLocaleString();
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

// วาดข้อความแบบ segmented ภายในกรอบความกว้างเดียว (ไม่ใช้ doc.text คราวเดียว)
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

  // แยกเป็น "words" แบบง่าย: split ด้วย space แต่ยังรักษา segment ภายใน word
  // แล้วทำ line-wrap เองด้วย width
  const words = raw.split(/(\s+)/).filter((w) => w !== ""); // keep spaces as tokens

  const lines = [];
  let current = [];
  let currentWidth = 0;

  const measureToken = (tok) => {
    // tok เป็น string อาจมีไทย/จีน/อื่นผสม -> measure รวมโดยสลับฟอนต์ segment
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

  for (const tok of words) {
    const tokWidth = measureToken(tok);

    // ถ้าเป็น token ยาวมากจนเกิน width ให้บังคับตัดทีละตัว (กันล้น)
    if (tokWidth > width && tok.trim() !== "") {
      // flush current line ก่อน
      if (current.length) {
        lines.push(current.join(""));
        current = [];
        currentWidth = 0;
        if (maxLines && lines.length >= maxLines) break;
      }
      // ตัด tok ทีละตัว
      let temp = "";
      for (const ch of tok) {
        const w = measureToken(temp + ch);
        if (w <= width || temp === "") {
          temp += ch;
        } else {
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

  if ((!maxLines || lines.length < maxLines) && current.length) {
    lines.push(current.join(""));
  }

  const lineH = doc.currentLineHeight(true) + lineGap;
  const totalH = lines.length * lineH;

  // วาดแต่ละบรรทัด + align
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // คำนวณความกว้างบรรทัด
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

    // วาด segment ทีละส่วน
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
  // ใช้ logic เหมือน drawSmartText แต่ไม่วาดจริง: ใช้ drawSmartText กับ doc.save/restore แบบง่าย
  // (pdfkit ไม่มี native measure multiline สำหรับหลายฟอนต์) -> เราคืน height จาก drawSmartText แบบ dry-run ด้วยวิธีที่ปลอดภัย:
  // เรา "จำลอง" ด้วยการเรียก drawSmartText แต่ไม่เปลี่ยนหน้า (ไม่วาดจริงยาก)
  // ทางแก้: ทำเหมือน drawSmartText แค่คำนวนจำนวน lines
  const {
    width = 200,
    bold = false,
    fontSize = 12,
    lineGap = 2,
    maxLines = null,
  } = options;

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

/* ----------------------------- PDF maker ----------------------------- */
function buildInvoicePDF(res, invoice) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });

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

  const logoPresets = {
    logo1: path.join(__dirname, "../picture/S__5275654png (1).png"),
    logo2: path.join(__dirname, "../picture/dos.png"),
    logo3: path.join(__dirname, "../picture/logo2.png"),
  };
  const defaultLogo = path.join(__dirname, "../picture/S__5275654png (1).png");

  // ใช้ shipDate ถ้ามี ไม่งั้น fallback date
  const usedDate = invoice.shipDate || invoice.date || new Date();

  /* ---------- header box (dynamic height) ---------- */
  // เราจะทำ header สูงพอสำหรับ address ที่ยาวได้
  const headerMinH = 120;
  const headerX = left;
  const headerY = top;
  const headerW = right - left;

  // logo
  let logoDrawn = false;
  if (invoice.companyLogoKey && logoPresets[invoice.companyLogoKey]) {
    const p = logoPresets[invoice.companyLogoKey];
    if (fs.existsSync(p)) {
      doc.image(p, headerX + 12, headerY + 12, { width: 70 });
      logoDrawn = true;
    }
  }
  if (!logoDrawn && fs.existsSync(defaultLogo)) {
    doc.image(defaultLogo, headerX + 12, headerY + 12, { width: 70 });
  }

  const companyName = invoice.companyName || "SURIYA 388 CO.,LTD.";
  const companyAddress = invoice.companyAddress || "";
  const companyTaxId = invoice.companyTaxId || "";
  const companyPhone = invoice.companyPhone || "";

  // คำนวณความสูง block บริษัท (ชื่อ+ที่อยู่+tax+tel)
  const companyTextX = headerX + 95;
  const companyTextW = 320;
  const companyNameH = heightSmartText(doc, loaded, companyName, { width: companyTextW, bold: true, fontSize: 18, lineGap: 2, maxLines: 2 });
  const companyAddressH = heightSmartText(doc, loaded, companyAddress, { width: companyTextW, bold: false, fontSize: 12, lineGap: 2, maxLines: 4 });
  const taxLine = companyTaxId ? `เลขประจำตัวผู้เสียภาษี: ${companyTaxId}` : "";
  const telLine = companyPhone ? `Tel: ${companyPhone}` : "";
  const taxH = taxLine ? heightSmartText(doc, loaded, taxLine, { width: companyTextW, fontSize: 12, lineGap: 2 }) : 0;
  const telH = telLine ? heightSmartText(doc, loaded, telLine, { width: companyTextW, fontSize: 12, lineGap: 2 }) : 0;

  const companyBlockH = 10 + companyNameH + companyAddressH + taxH + telH + 8;
  const headerH = Math.max(headerMinH, companyBlockH + 20);

  // วาดกรอบ header
  doc.roundedRect(headerX, headerY, headerW, headerH, 10).lineWidth(1).stroke(gray);

  // วาด company text แบบ smart
  let cy = headerY + 12;
  drawSmartText(doc, loaded, companyName, companyTextX, cy, {
    width: companyTextW,
    bold: true,
    fontSize: 18,
    color: "#000000",
    maxLines: 2,
  });
  cy += companyNameH;

  drawSmartText(doc, loaded, companyAddress, companyTextX, cy, {
    width: companyTextW,
    bold: false,
    fontSize: 12,
    color: "#000000",
    maxLines: 4,
  });
  cy += companyAddressH;

  if (taxLine) {
    drawSmartText(doc, loaded, taxLine, companyTextX, cy, {
      width: companyTextW,
      fontSize: 12,
    });
    cy += taxH;
  }
  if (telLine) {
    drawSmartText(doc, loaded, telLine, companyTextX, cy, {
      width: companyTextW,
      fontSize: 12,
    });
    cy += telH;
  }

  // INVOICE title right
  drawSmartText(doc, loaded, "INVOICE", right - 170, headerY + 12, {
    width: 170,
    align: "right",
    bold: true,
    fontSize: 24,
    color: red,
  });

  const line1 = `DATE: ${thDate(usedDate)}`;
  const line2 = `NO: #${invoice.invoiceNo || 1}`;

  drawSmartText(doc, loaded, line1, right - 220, headerY + 48, { width: 220, align: "right", fontSize: 12 });
  drawSmartText(doc, loaded, line2, right - 220, headerY + 66, { width: 220, align: "right", fontSize: 12 });

  /* ---------- BILL TO + DETAIL (dynamic height to avoid overlap) ---------- */
  let sectionY = headerY + headerH + 16;

  const billBoxW = (right - left) * 0.55 - 6;
  const metaX = left + (right - left) * 0.55 + 6;
  const metaW = right - metaX;

  const billToName = invoice.billToName || "-";
  const billToTaxId = invoice.billToTaxId || "";
  const billToAddress = invoice.billToAddress || "";

  // detail fields (ใหม่)
  const route = invoice.route || invoice.destination || "-"; // ถ้ายังไม่ใช้ route ให้ fallback destination
  const temperature = invoice.temperature || "-";
  const transport = invoice.transport || "-";
  const brandRemark = invoice.brandRemark || "-";

  const metaLines = [
    `Route: ${route}`, // 陆运/海运
    `Temp: ${temperature}`, // 温度
    `Transport: ${transport}`, // 铁路/WMK
    `Brand: ${brandRemark}`,
    `Container: ${invoice.containerInfo || "-"}`,
    `Container Code: ${invoice.containerCode || "-"}`,
    `Reference: ${invoice.refCode || "-"}`,
  ];

  // คำนวณความสูง BillTo
  const billTitleH = heightSmartText(doc, loaded, "BILL TO", { width: billBoxW - 24, bold: true, fontSize: 14, lineGap: 2 });
  const billNameH = heightSmartText(doc, loaded, billToName, { width: billBoxW - 24, fontSize: 12, lineGap: 2, maxLines: 3 });
  const billTaxLine = billToTaxId ? `Tax ID: ${billToTaxId}` : "";
  const billTaxH = billTaxLine ? heightSmartText(doc, loaded, billTaxLine, { width: billBoxW - 24, fontSize: 12, lineGap: 2 }) : 0;
  const billAddrH = billToAddress ? heightSmartText(doc, loaded, billToAddress, { width: billBoxW - 24, fontSize: 12, lineGap: 2, maxLines: 6 }) : 0;

  const billInnerH = 10 + billTitleH + 6 + billNameH + (billTaxLine ? 2 + billTaxH : 0) + (billToAddress ? 2 + billAddrH : 0) + 10;

  // คำนวณความสูง Detail
  const metaTitleH = heightSmartText(doc, loaded, "DETAIL", { width: metaW - 24, bold: true, fontSize: 14, lineGap: 2 });
  let metaLinesH = 0;
  for (const t of metaLines) {
    metaLinesH += heightSmartText(doc, loaded, t, { width: metaW - 24, fontSize: 12, lineGap: 2, maxLines: 2 });
  }
  const metaInnerH = 10 + metaTitleH + 6 + metaLinesH + 10;

  const blockH = Math.max(110, Math.max(billInnerH, metaInnerH));

  // Bill To box
  doc.roundedRect(left, sectionY, billBoxW, blockH, 10).lineWidth(1).stroke(gray);
  drawSmartText(doc, loaded, "BILL TO", left + 12, sectionY + 10, { width: billBoxW - 24, bold: true, fontSize: 14 });

  let by = sectionY + 10 + billTitleH + 6;
  drawSmartText(doc, loaded, billToName, left + 12, by, { width: billBoxW - 24, fontSize: 12, maxLines: 3 });
  by += billNameH;

  if (billTaxLine) {
    by += 2;
    drawSmartText(doc, loaded, billTaxLine, left + 12, by, { width: billBoxW - 24, fontSize: 12 });
    by += billTaxH;
  }

  if (billToAddress) {
    by += 2;
    drawSmartText(doc, loaded, billToAddress, left + 12, by, { width: billBoxW - 24, fontSize: 12, maxLines: 6 });
    by += billAddrH;
  }

  // Detail box
  doc.roundedRect(metaX, sectionY, metaW, blockH, 10).lineWidth(1).stroke(gray);
  drawSmartText(doc, loaded, "DETAIL", metaX + 12, sectionY + 10, { width: metaW - 24, bold: true, fontSize: 14 });

  let my = sectionY + 10 + metaTitleH + 6;
  for (const t of metaLines) {
    drawSmartText(doc, loaded, t, metaX + 12, my, { width: metaW - 24, fontSize: 12, maxLines: 2 });
    my += heightSmartText(doc, loaded, t, { width: metaW - 24, fontSize: 12, lineGap: 2, maxLines: 2 });
  }

  /* ---------- Items Table ---------- */
  let tableY = sectionY + blockH + 16;

  const tableW = right - left;

  // columns fit A4
  const baseCols = [
    { title: "วันที่ซื้อ", w: 60, align: "left" }, // purchaseDate
    { title: "แบรนด์/รายการ", w: 160, align: "left" },
    { title: "เกรด", w: 40, align: "center" },
    { title: "Size", w: 38, align: "center" },
    { title: "กล่อง", w: 50, align: "right" },
    { title: "กก./กล่อง", w: 60, align: "right" },
    { title: "น้ำหนักรวม", w: 65, align: "right" },
    { title: "ราคา", w: 50, align: "right" },
    { title: "รวมเงิน", w: 62, align: "right" },
  ];
  const baseSum = baseCols.reduce((s, c) => s + c.w, 0);
  const scale = tableW / baseSum;
  const cols = baseCols.map((c) => ({ ...c, w: Math.floor(c.w * scale) }));
  const wSum = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w += tableW - wSum;

  const rowH = 22;
  const headerH2 = 26;

  const ensureSpace = (neededH) => {
    if (tableY + neededH > bottom) {
      doc.addPage();
      registerFonts(doc);
      tableY = doc.page.margins.top;
      drawTableHeader();
    }
  };

  const drawTableHeader = () => {
    doc.rect(left, tableY, tableW, headerH2).fill(red);
    // header text
    let x = left;
    for (const c of cols) {
      drawSmartText(doc, loaded, c.title, x + 4, tableY + 6, {
        width: c.w - 8,
        align: "center",
        bold: true,
        fontSize: 10,
        color: "#ffffff",
      });
      x += c.w;
    }
    tableY += headerH2;
  };

  drawTableHeader();

  const drawRow = (values, stripe) => {
    ensureSpace(rowH + 2);

    if (stripe) doc.rect(left, tableY, tableW, rowH).fill("#f7f7f7");

    // grid
    doc.rect(left, tableY, tableW, rowH).lineWidth(0.5).stroke("#dddddd");

    let x = left;
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const txt = String(values[i] ?? "");
      drawSmartText(doc, loaded, txt, x + 4, tableY + 6, {
        width: c.w - 8,
        align: c.align || "left",
        fontSize: 10,
        color: "#000000",
        maxLines: 1, // ✅ กัน overflow ในตาราง
      });
      x += c.w;
      doc.moveTo(x, tableY).lineTo(x, tableY + rowH).lineWidth(0.5).stroke("#dddddd");
    }

    tableY += rowH;
  };

  // compute per row, prefer snapshot
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  const rate = safeNumber(invoice.rate, 0);

  let totalBoxes = 0;
  let totalWeight = 0;
  let subtotal = 0;

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

    totalBoxes += boxes;
    totalWeight += weightTotal;
    subtotal += amount;

    const purchaseDate = it.purchaseDate ? toISODate(it.purchaseDate) : toISODate(usedDate);
    const itemName = `${it.brand ? it.brand + " " : ""}${it.variety || ""}`.trim() || "-";
    const grade = it.grade || "-";
    const size = it.boxSize || "-";

    drawRow(
      [
        purchaseDate,
        itemName,
        grade,
        size,
        boxes ? formatNumber(boxes) : "",
        wPerBox ? formatNumber(wPerBox) : "",
        weightTotal ? formatNumber(weightTotal) : "",
        unitPrice ? formatNumber(unitPrice) : "",
        amount ? formatNumber(amount) : "",
      ],
      idx % 2 === 1
    );
  });

  // If totals snapshot exists, use it
  const snapTotalBoxes = safeNumber(invoice.totalBoxes, 0);
  const snapTotalWeight = safeNumber(invoice.totalWeightKg, 0);
  const snapSubtotal = safeNumber(invoice.subtotalAmount, 0);

  if (snapTotalBoxes > 0 || snapTotalWeight > 0 || snapSubtotal > 0) {
    totalBoxes = snapTotalBoxes > 0 ? snapTotalBoxes : totalBoxes;
    totalWeight = snapTotalWeight > 0 ? snapTotalWeight : totalWeight;
    subtotal = snapSubtotal > 0 ? snapSubtotal : subtotal;
  }

  /* ---------- Expense section (ถ้ามี) ---------- */
  const expenses = Array.isArray(invoice.expenses) ? invoice.expenses : [];
  let expenseTotal = expenses.reduce((s, e) => s + safeNumber(e.amount, 0), 0);

  // snapshot expense
  const snapExpense = safeNumber(invoice.expenseAmount, 0);
  if (snapExpense > 0) expenseTotal = snapExpense;

  let grandTotal = subtotal + expenseTotal;
  const snapGrand = safeNumber(invoice.grandTotalAmount, 0);
  if (snapGrand > 0) grandTotal = snapGrand;

  // TOTAL row (table footer)
  ensureSpace(80);

  doc.rect(left, tableY, tableW, rowH).fill(red);

  // label spans first columns
  const spanW = cols[0].w + cols[1].w + cols[2].w + cols[3].w;
  drawSmartText(doc, loaded, "TOTAL", left + 6, tableY + 5, {
    width: spanW - 12,
    align: "left",
    bold: true,
    fontSize: 12,
    color: "#ffffff",
    maxLines: 1,
  });

  // write totals into specific columns
  let x = left;
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (i === 4) {
      drawSmartText(doc, loaded, formatNumber(totalBoxes), x + 4, tableY + 5, {
        width: c.w - 8,
        align: "right",
        bold: true,
        fontSize: 12,
        color: "#ffffff",
      });
    }
    if (i === 6) {
      drawSmartText(doc, loaded, formatNumber(totalWeight), x + 4, tableY + 5, {
        width: c.w - 8,
        align: "right",
        bold: true,
        fontSize: 12,
        color: "#ffffff",
      });
    }
    if (i === 8) {
      drawSmartText(doc, loaded, formatNumber(subtotal), x + 4, tableY + 5, {
        width: c.w - 8,
        align: "right",
        bold: true,
        fontSize: 12,
        color: "#ffffff",
      });
    }
    x += c.w;
  }

  tableY += rowH + 12;

  /* ---------- Expenses list + totals summary (right aligned box) ---------- */
  const summaryW = 260;
  const summaryX = right - summaryW;
  const summaryTitle = "SUMMARY";

  const summaryLines = [];
  summaryLines.push({ label: "Subtotal (ค่าสินค้า)", value: subtotal });
  summaryLines.push({ label: "Expenses (ค่าใช้จ่าย)", value: expenseTotal });
  summaryLines.push({ label: "Grand Total (รวมทั้งสิ้น)", value: grandTotal });

  // วัดความสูง summary
  const titleH = heightSmartText(doc, loaded, summaryTitle, { width: summaryW - 24, bold: true, fontSize: 14, lineGap: 2 });
  let linesH = 0;
  for (const ln of summaryLines) {
    const t = `${ln.label}: ${formatNumber(ln.value)}`;
    linesH += heightSmartText(doc, loaded, t, { width: summaryW - 24, fontSize: 12, lineGap: 2, maxLines: 2 });
  }
  const amountText = invoice.amountText ? String(invoice.amountText) : "";
  const amountTextH = amountText ? heightSmartText(doc, loaded, amountText, { width: summaryW - 24, fontSize: 12, lineGap: 2, maxLines: 4 }) : 0;

  const summaryH = 12 + titleH + 8 + linesH + (amountText ? 10 + amountTextH : 0) + 12;

  // ensure space
  if (tableY + summaryH > bottom) {
    doc.addPage();
    registerFonts(doc);
    tableY = doc.page.margins.top;
  }

  doc.roundedRect(summaryX, tableY, summaryW, summaryH, 10).lineWidth(1).stroke(gray);

  drawSmartText(doc, loaded, summaryTitle, summaryX + 12, tableY + 10, { width: summaryW - 24, bold: true, fontSize: 14 });
  let sy = tableY + 10 + titleH + 8;

  for (const ln of summaryLines) {
    const t = `${ln.label}: ${formatNumber(ln.value)}`;
    drawSmartText(doc, loaded, t, summaryX + 12, sy, { width: summaryW - 24, fontSize: 12, maxLines: 2 });
    sy += heightSmartText(doc, loaded, t, { width: summaryW - 24, fontSize: 12, lineGap: 2, maxLines: 2 });
  }

  if (amountText) {
    sy += 10;
    drawSmartText(doc, loaded, "จำนวนเงินเป็นตัวอักษร", summaryX + 12, sy, { width: summaryW - 24, bold: true, fontSize: 12 });
    sy += heightSmartText(doc, loaded, "จำนวนเงินเป็นตัวอักษร", { width: summaryW - 24, bold: true, fontSize: 12, lineGap: 2 });

    drawSmartText(doc, loaded, amountText, summaryX + 12, sy, { width: summaryW - 24, fontSize: 12, maxLines: 4 });
    sy += amountTextH;
  }

  tableY += summaryH + 12;

  /* ---------- Expenses block (left) ---------- */
  if (expenses.length > 0) {
    const expBoxW = summaryX - left - 12;
    const expBoxX = left;
    const expTitle = "EXPENSES / ค่าใช้จ่าย";
    const expTitleH = heightSmartText(doc, loaded, expTitle, { width: expBoxW - 24, bold: true, fontSize: 14, lineGap: 2 });

    let expLinesH = 0;
    for (const e of expenses) {
      const line = `${e.label}: ${formatNumber(e.amount)}`;
      expLinesH += heightSmartText(doc, loaded, line, { width: expBoxW - 24, fontSize: 12, lineGap: 2, maxLines: 2 });
    }
    const expH = Math.max(90, 12 + expTitleH + 8 + expLinesH + 12);

    // ensure space (use current y ~ tableY - summaryH - 12? we want align with summary top)
    const expTopY = tableY - (summaryH + 12);

    doc.roundedRect(expBoxX, expTopY, expBoxW, expH, 10).lineWidth(1).stroke(gray);
    drawSmartText(doc, loaded, expTitle, expBoxX + 12, expTopY + 10, { width: expBoxW - 24, bold: true, fontSize: 14 });

    let ey = expTopY + 10 + expTitleH + 8;
    for (const e of expenses) {
      const line = `${e.label}: ${formatNumber(e.amount)}`;
      drawSmartText(doc, loaded, line, expBoxX + 12, ey, { width: expBoxW - 24, fontSize: 12, maxLines: 2 });
      ey += heightSmartText(doc, loaded, line, { width: expBoxW - 24, fontSize: 12, lineGap: 2, maxLines: 2 });
    }
  }

  /* ---------- Note ---------- */
  if (invoice.note && String(invoice.note).trim()) {
    const noteTitle = "Note / หมายเหตุ";
    const noteText = String(invoice.note);

    const noteW = right - left;
    const noteTitleH = heightSmartText(doc, loaded, noteTitle, { width: noteW, bold: true, fontSize: 14, lineGap: 2 });
    const noteTextH = heightSmartText(doc, loaded, noteText, { width: noteW, fontSize: 12, lineGap: 2, maxLines: 6 });
    const need = 10 + noteTitleH + 6 + noteTextH + 10;

    if (tableY + need > bottom) {
      doc.addPage();
      registerFonts(doc);
      tableY = doc.page.margins.top;
    }

    drawSmartText(doc, loaded, noteTitle, left, tableY, { width: noteW, bold: true, fontSize: 14 });
    tableY += noteTitleH + 6;
    drawSmartText(doc, loaded, noteText, left, tableY, { width: noteW, fontSize: 12, maxLines: 6 });
    tableY += noteTextH + 12;
  }

  /* ---------- Signatures ---------- */
  const sigNeed = 120;
  if (tableY + sigNeed > bottom) {
    doc.addPage();
    registerFonts(doc);
    tableY = doc.page.margins.top;
  }

  const sigY = Math.min(bottom - 90, tableY + 30);

  const sig1 = "ผู้ส่งสินค้า";
  const sig2 = "ผู้รับสินค้า";

  drawSmartText(doc, loaded, sig1, left + 40, sigY, { width: 200, align: "center", fontSize: 12 });
  drawSmartText(doc, loaded, sig2, right - 240, sigY, { width: 200, align: "center", fontSize: 12 });

  doc.moveTo(left + 40, sigY + 35).lineTo(left + 240, sigY + 35).stroke("#000");
  doc.moveTo(right - 240, sigY + 35).lineTo(right - 40, sigY + 35).stroke("#000");

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
