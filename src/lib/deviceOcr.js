// NHẬN DẠNG CHỮ NGAY TRÊN THIẾT BỊ (trình duyệt điện thoại / máy tính) — MIỄN PHÍ, không cần khóa API.
// Nạp ĐỘNG (chỉ khi cần) từ odoOcr.js. Lần đầu tải bộ nhận dạng (~3–5 MB, trình duyệt lưu lại cho lần sau):
//  - Tesseract.js (WebAssembly) + dữ liệu 'eng' (chữ số in thường) và 'vie' (hóa đơn) từ CDN jsDelivr;
//  - 'ssd_int' (chữ số 7 ĐOẠN của đồng hồ LCD, Apache-2.0, github.com/Shreeshrii/tessdata_ssd) ở /tessdata.
//  - pdf.js đọc CHỮ có sẵn trong PDF hóa đơn điện tử (không cần nhận dạng ảnh).
import { toGray, stretch, binarize, cleanBinary, lightBackground, grayToRgba, rectToPixels, scaleFor, findDigitRows, decodeSevenSegment } from './ocrImage';
import { odoPassPlan, odoRegions, padDetected, voteOdo, pickOdoCandidate, checkPlausible } from './odoOcr';
import { parseInvoiceXml, parseInvoiceText } from './invoiceParse';

const LANG = { eng: 'eng', ssd: 'ssd_int', vie: 'vie' };
const workers = new Map(); // lang -> Promise<worker>
let idleTimer = null;

async function getWorker(key) {
  if (!workers.has(key)) {
    workers.set(key, (async () => {
      const mod = await import('tesseract.js');
      const T = mod.default || mod;
      const opts = key === 'ssd' ? { langPath: new URL('/tessdata', window.location.origin).href, gzip: false } : {};
      return T.createWorker(LANG[key], 1, opts);
    })().catch((e) => { workers.delete(key); throw e; }));
  }
  return workers.get(key);
}
// Giải phóng bộ nhớ khi không dùng nữa (điện thoại yếu)
function scheduleRelease() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const all = [...workers.values()];
    workers.clear();
    for (const p of all) { try { (await p).terminate(); } catch { /* bỏ qua */ } }
  }, 120000);
}

async function toBitmap(blob) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch { /* dùng <img> */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Dựng 1 biến thể ảnh để nhận dạng: cắt vùng (nếu có) -> phóng -> xám / nhị phân -> viền trắng. */
function renderVariant(bitmap, rect, mode) {
  const W0 = bitmap.width, H0 = bitmap.height;
  const { sx, sy, sw, sh } = rect ? rectToPixels(rect, W0, H0) : { sx: 0, sy: 0, sw: W0, sh: H0 };
  const k = scaleFor(sw, sh, { crop: !!rect });
  const W = Math.max(1, Math.round(sw * k)), H = Math.max(1, Math.round(sh * k));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, W, H);
  if (mode !== 'raw') {
    const id = ctx.getImageData(0, 0, W, H);
    let g = stretch(toGray(id));
    g = mode === 'bin' ? cleanBinary(binarize(g), W, H) : lightBackground(g);
    id.data.set(grayToRgba(g, W, H).data);
    ctx.putImageData(id, 0, 0);
  }
  const P = rect ? 16 : 0;
  if (!P) return c;
  const c2 = document.createElement('canvas');
  c2.width = W + 2 * P; c2.height = H + 2 * P;
  const x2 = c2.getContext('2d');
  x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height);
  x2.drawImage(c, P, P);
  return c2;
}

/** Dò các dãy chữ số trên bản thu nhỏ của ảnh (cạnh dài 500px). */
function detectRows(bitmap) {
  const k = Math.min(1, 500 / Math.max(bitmap.width, bitmap.height));
  const W = Math.round(bitmap.width * k), H = Math.round(bitmap.height * k);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, W, H);
  return findDigitRows(ctx.getImageData(0, 0, W, H), { max: 4 }).map((r) => padDetected(r, W / H));
}

/**
 * Đọc số ODO trên máy. rect = vùng lái xe vừa khoanh; saved = vùng đã nhớ của xe; không có thì máy TỰ DÒ
 * dãy chữ số, cuối cùng đọc cả ảnh. Có lần ghi trước mà một lượt ra số hợp lý -> dừng sớm; không thì BỎ
 * PHIẾU giữa các lượt. Trả { value|null, votes, texts, rect } (rect = vùng ra số, để nhớ cho lần sau).
 */
export async function readOdoOnDevice(blob, { lastOdo = null, rect = null, saved = null } = {}) {
  const bitmap = await toBitmap(blob);
  const texts = [];
  const hitRect = new Map(); // số -> vùng đọc ra số đó
  try {
    let detected = [];
    if (!rect) { try { detected = detectRows(bitmap); } catch { detected = []; } }
    outer: for (const region of odoRegions({ rect, saved, detected })) {
      for (const pass of odoPassPlan(region.kind)) {
        let text = '';
        if (pass.lang === 'seg7') {
          // giải mã 7 đoạn ngay trên ảnh nhị phân (không cần mô hình, tức thì)
          const c = renderVariant(bitmap, region.rect, 'bin');
          const id = c.getContext('2d').getImageData(0, 0, c.width, c.height);
          text = decodeSevenSegment(toGray(id), c.width, c.height);
        } else {
          let w;
          try { w = await getWorker(pass.lang); } catch { continue; } // không tải được mô hình -> bỏ lượt
          await w.setParameters({ tessedit_char_whitelist: '0123456789., ', tessedit_pageseg_mode: pass.psm });
          const { data } = await w.recognize(renderVariant(bitmap, region.rect, pass.mode));
          text = data?.text || '';
        }
        texts.push(text);
        const p = pickOdoCandidate(text, lastOdo);
        if (p.value != null && region.rect && !hitRect.has(p.value)) hitRect.set(p.value, region.rect);
        if (lastOdo != null && p.via === 'direct' && checkPlausible(p.value, lastOdo).ok) break outer;
      }
    }
  } finally {
    bitmap.close?.();
    scheduleRelease();
  }
  // Không số nào hợp lý so với lần ghi trước -> vẫn trả số đọc được (giao diện cảnh báo, bắt xác nhận)
  let v = voteOdo(texts, lastOdo);
  if (v.value == null && lastOdo != null) v = voteOdo(texts, null);
  return { value: v.value, votes: v.votes, texts, rect: v.value != null ? hitRect.get(v.value) || null : null };
}

// ---------------- HÓA ĐƠN ----------------
const readText = (file) => (file.text ? file.text() : new Response(file).text());
const isXmlFile = (f) => /xml/i.test(f?.type || '') || /\.xml$/i.test(f?.name || '');
const isPdfFile = (f) => f?.type === 'application/pdf' || /\.pdf$/i.test(f?.name || '');

/** pdf.js: chữ của các trang (gom theo dòng). pdfjs được truyền vào để test ở node. */
export async function pdfTextFromData(data, pdfjs, maxPages = 3) {
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const lines = [];
  for (let p = 1; p <= Math.min(doc.numPages, maxPages); p += 1) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    // gom các mảnh chữ cùng hàng (cùng tọa độ y, sai số 2pt), xếp trái -> phải
    const rows = [];
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = it.transform[5], x = it.transform[4];
      let row = rows.find((r) => Math.abs(r.y - y) <= 2);
      if (!row) { row = { y, parts: [] }; rows.push(row); }
      row.parts.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) lines.push(r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join(' ').replace(/\s+/g, ' ').trim());
  }
  return { text: lines.join('\n'), doc };
}

async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  }
  return pdfjs;
}

async function ocrInvoiceCanvas(canvasOrBlob) {
  const w = await getWorker('vie');
  await w.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '4' }); // 4 = các cột / dòng
  try {
    const { data } = await w.recognize(canvasOrBlob);
    return data?.text || '';
  } finally {
    scheduleRelease();
  }
}

async function preparedInvoiceImage(blob) {
  const bmp = await toBitmap(blob);
  try {
    const k = Math.min(2, 2000 / Math.max(bmp.width, bmp.height));
    const W = Math.round(bmp.width * k), H = Math.round(bmp.height * k);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0, W, H);
    const id = ctx.getImageData(0, 0, W, H);
    id.data.set(grayToRgba(lightBackground(stretch(toGray(id))), W, H).data);
    ctx.putImageData(id, 0, 0);
    return c;
  } finally {
    bmp.close?.();
  }
}

/**
 * Đọc hóa đơn trên máy: XML -> đọc thẳng các trường (chính xác); PDF -> chữ trong tệp, PDF scan thì vẽ
 * trang 1 ra ảnh rồi nhận dạng; ảnh -> nhận dạng tiếng Việt. Trả kết quả parse (có found, engine).
 */
export async function readInvoiceOnDevice(file) {
  if (isXmlFile(file)) return parseInvoiceXml(await readText(file));
  if (isPdfFile(file)) {
    const pdfjs = await loadPdfjs();
    const { text, doc } = await pdfTextFromData(new Uint8Array(await file.arrayBuffer()), pdfjs);
    // Một số PDF có kèm XML hóa đơn bên trong (tệp đính kèm)
    try {
      const att = await doc.getAttachments();
      for (const a of Object.values(att || {})) {
        if (/\.xml$/i.test(a.filename || '')) {
          const r = parseInvoiceXml(new TextDecoder('utf-8').decode(a.content));
          if (r.found) return r;
        }
      }
    } catch { /* không có tệp đính kèm */ }
    if (text.replace(/\s+/g, '').length > 80) {
      const r = parseInvoiceText(text, 'pdf');
      if (r.found) return r;
    }
    // PDF scan (không có chữ) -> vẽ trang 1 rồi nhận dạng
    const page = await doc.getPage(1);
    const vp = page.getViewport({ scale: 2 });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
    return parseInvoiceText(await ocrInvoiceCanvas(c), 'ocr');
  }
  return parseInvoiceText(await ocrInvoiceCanvas(await preparedInvoiceImage(file)), 'ocr');
}
