// ĐỌC SỐ ODO TỪ ẢNH CHỤP ĐỒNG HỒ — MIỄN PHÍ, XỬ LÝ NGAY TRÊN ĐIỆN THOẠI / MÁY TÍNH.
//  1) Trên máy (deviceOcr.js): Tesseract chạy trong trình duyệt + tiền xử lý ảnh (xám, tăng tương phản,
//     nhị phân, xóa viền) + mô hình chữ số 7 ĐOẠN (đồng hồ LCD). Đọc VÙNG lái xe khoanh quanh dãy số
//     (nhớ theo từng xe) chính xác hơn nhiều so với cả ảnh; nhiều lượt đọc -> BỎ PHIẾU.
//  2) Chỉ khi máy không ra số hợp lý VÀ máy chủ có cấu hình khóa AI (tùy chọn, có phí) mới hỏi
//     /api/ocr-odo. Không cấu hình -> bỏ qua, không tốn gì.
//  3) Vẫn không ra số -> value=null để giao diện yêu cầu khoanh vùng lại hoặc gõ tay.
// pickOdoCandidate / voteOdo / checkPlausible / rect... là HÀM THUẦN (test ở node).
import { supabase } from './supabase';

// Số ODO hợp lệ so với lần ghi trước: không lùi, không tăng quá MAX_JUMP km
export const MAX_JUMP = 2000;
export function checkPlausible(value, lastOdo) {
  if (value == null) return { ok: false, reason: 'none' };
  if (lastOdo == null) return { ok: true };
  if (value < lastOdo) return { ok: false, reason: 'lower', diff: value - lastOdo };
  if (value - lastOdo > MAX_JUMP) return { ok: false, reason: 'jump', diff: value - lastOdo };
  return { ok: true, diff: value - lastOdo };
}

// Tách các dãy số từ văn bản nhận dạng: bỏ dấu chấm / phẩy phân nhóm nghìn, bỏ số TRIP có 1 chữ số
// thập phân ("123.4"), tách chỗ có nhiều dấu liền nhau ("1203417..7" là 2 mảnh).
function digitRuns(text) {
  const runs = [];
  for (const tok of String(text || '').match(/\d(?:[\d.,]*\d)?/g) || []) {
    for (const r of tok.split(/[.,]{2,}/)) {
      if (!r) continue;
      if (/^\d{1,4}[.,]\d$/.test(r)) continue;           // TRIP 123.4
      runs.push(r.replace(/[.,]\d$/, '').replace(/\D/g, '')); // "123456.7" -> 123456 (số lẻ 0,1 km)
    }
  }
  return runs.filter(Boolean);
}

/**
 * Chọn số ODO từ văn bản nhận dạng được. Giữ số 3–7 chữ số. Có lần ghi trước -> chọn số hợp lệ gần nhất
 * (không lùi, không nhảy quá MAX_JUMP); nếu không có, dò cả CHUỖI CON của dãy số dài (viền màn hình hay bị
 * đọc thành "1" dính vào số: "10055266" -> 55266). Không có lần ghi trước -> chọn số nhiều chữ số nhất.
 * Trả { value, candidates, via: 'direct'|'sub'|null } — value=null nếu không có số đáng tin.
 */
export function pickOdoCandidate(text, lastOdo = null) {
  const runs = digitRuns(text);
  const candidates = [...new Set(runs.filter((d) => d.length >= 3 && d.length <= 7).map((d) => parseInt(d, 10)))];
  if (lastOdo != null) {
    const ok = candidates.filter((v) => checkPlausible(v, lastOdo).ok).sort((a, b) => a - b);
    if (ok.length) return { value: ok[0], candidates, via: 'direct' };
    const len = String(Math.round(lastOdo)).length;
    const subs = new Set();
    for (const d of runs) {
      if (d.length <= len) continue;
      for (const L of [len, len + 1]) for (let i = 0; i + L <= d.length; i += 1) subs.add(parseInt(d.slice(i, i + L), 10));
    }
    const okSub = [...subs].filter((v) => checkPlausible(v, lastOdo).ok).sort((a, b) => a - b);
    return { value: okSub.length ? okSub[0] : null, candidates, via: okSub.length ? 'sub' : null };
  }
  // Đồng hồ ODO tối đa 6 chữ số: dãy 7 chữ số thường dính 1 ký tự nhiễu ở mép (viền, chữ "ODO") -> bỏ mép trái
  const pool = candidates.map((v) => (String(v).length === 7 ? parseInt(String(v).slice(1), 10) : v));
  if (!pool.length) return { value: null, candidates, via: null };
  const best = [...pool].sort((a, b) => String(b).length - String(a).length || b - a)[0];
  return { value: String(best).length >= 4 ? best : null, candidates, via: String(best).length >= 4 ? 'direct' : null };
}

/**
 * BỎ PHIẾU giữa nhiều lượt đọc (mỗi lượt 1 cách xử lý ảnh / 1 mô hình). texts theo thứ tự tin cậy giảm dần.
 * Số được nhiều lượt cùng đọc ra thắng; hòa -> lượt đứng trước. Trả { value, votes, total }.
 */
export function voteOdo(texts, lastOdo = null) {
  const tally = new Map();
  texts.forEach((t, i) => {
    const p = pickOdoCandidate(t, lastOdo);
    if (p.value == null) return;
    const cur = tally.get(p.value) || { votes: 0, first: i, direct: 0 };
    cur.votes += 1; if (p.via === 'direct') cur.direct += 1;
    tally.set(p.value, cur);
  });
  const ranked = [...tally.entries()].sort((a, b) => b[1].votes - a[1].votes || b[1].direct - a[1].direct || a[1].first - b[1].first);
  return ranked.length ? { value: ranked[0][0], votes: ranked[0][1].votes, total: texts.length } : { value: null, votes: 0, total: texts.length };
}

/**
 * Kế hoạch các lượt đọc trên máy cho 1 vùng. 'rect' = vùng lái xe khoanh / đã nhớ (đủ lượt); 'auto' = vùng
 * máy tự dò (các lượt chính); 'full' = cả ảnh (psm 11 — chữ rời rạc). Lượt đầu 'seg7' = GIẢI MÃ 7 ĐOẠN không
 * cần mô hình (ocrImage.decodeSevenSegment, tức thì); rồi Tesseract mô hình 7 đoạn ('ssd') và chữ in thường
 * ('eng'); psm 7 = một dòng, 6 = khối (vùng có cả dòng TRIP).
 */
export function odoPassPlan(kind) {
  if (kind === 'full') return [{ lang: 'eng', mode: 'gray', psm: '11' }, { lang: 'ssd', mode: 'bin', psm: '11' }];
  const main = [{ lang: 'seg7', mode: 'bin' }, { lang: 'ssd', mode: 'bin', psm: '7' }, { lang: 'eng', mode: 'gray', psm: '7' }, { lang: 'eng', mode: 'bin', psm: '7' }];
  if (kind === 'auto') return main;
  return [...main, { lang: 'ssd', mode: 'bin', psm: '6' }, { lang: 'ssd', mode: 'gray', psm: '7' }, { lang: 'eng', mode: 'bin', psm: '6' }];
}

/** Nới vùng máy tự dò sang hai bên (~1,5 chiều cao chữ — không cắt mất chữ số đầu/cuối), kẹp trong ảnh. */
export function padDetected(r, aspect = 4 / 3) {
  const hx = (r.h * 1.5) / aspect, vy = r.h * 0.2;
  const x = Math.max(0, r.x - hx), y = Math.max(0, r.y - vy);
  return { x, y, w: Math.min(1, r.x + r.w + hx) - x, h: Math.min(1, r.y + r.h + vy) - y };
}

/**
 * Thứ tự các vùng đọc: vùng lái xe vừa khoanh (chỉ vùng đó) | vùng đã nhớ của xe -> các vùng máy tự dò
 * -> cả ảnh. Trả [{ kind, rect }].
 */
export function odoRegions({ rect = null, saved = null, detected = [] } = {}) {
  if (rect) return [{ kind: 'rect', rect }];
  return [
    ...(saved ? [{ kind: 'rect', rect: saved }] : []),
    ...detected.map((d) => ({ kind: 'auto', rect: d })),
    { kind: 'full', rect: null },
  ];
}

// VÙNG SỐ ODO đã khoanh — nhớ theo từng xe (lái xe hay chụp cùng một góc nên lần sau thử vùng này trước)
const RECT_KEY = (vehicleId) => `odoRect:${vehicleId}`;
export function validRect(r) {
  return !!r && [r.x, r.y, r.w, r.h].every((v) => typeof v === 'number' && Number.isFinite(v))
    && r.w >= 0.03 && r.h >= 0.02 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 1.001 && r.y + r.h <= 1.001;
}
export function loadOdoRect(vehicleId) {
  try { const r = JSON.parse(localStorage.getItem(RECT_KEY(vehicleId)) || 'null'); return validRect(r) ? r : null; } catch { return null; }
}
export function saveOdoRect(vehicleId, rect) {
  try { if (validRect(rect)) localStorage.setItem(RECT_KEY(vehicleId), JSON.stringify(rect)); } catch { /* bỏ qua */ }
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).replace(/^data:[^,]+,/, ''));
  fr.onerror = () => reject(fr.error);
  fr.readAsDataURL(blob);
});

// Máy chủ AI (TÙY CHỌN — chỉ chạy khi Vercel có ANTHROPIC_API_KEY; không có -> 501, bỏ qua)
async function viaServer(blob) {
  if (!supabase) return { status: 'unavailable' };
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return { status: 'unavailable' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch('/api/ocr-odo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ image: await toBase64(blob), media_type: blob.type || 'image/jpeg' }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { status: 'unavailable', http: res.status };
    const json = await res.json().catch(() => null);
    if (!json) return { status: 'unavailable' };
    return { status: 'done', value: json.found ? json.odo : null, note: json.note || '', engine: 'ai' };
  } catch {
    return { status: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Đọc số ODO từ ảnh. opts: lastOdo, rect (vùng lái xe vừa khoanh, tỉ lệ 0..1), saved (vùng đã nhớ của xe),
 * useServer (mặc định true — CHỈ dùng khi máy không ra số hợp lý và máy chủ có khóa AI).
 * Trả { value|null, engine: 'device'|'ai'|null, note, plausible, rect } (rect = vùng máy đọc ra số -> nhớ).
 * Không bao giờ ném lỗi — mọi trục trặc đều quy về value=null (giao diện cho khoanh vùng / gõ tay).
 */
export async function recognizeOdo(blob, { lastOdo = null, rect = null, saved = null, useServer = true } = {}) {
  const out = (value, engine, note = '', hit = null) => ({ value: value ?? null, engine: value != null ? engine : null, note, plausible: checkPlausible(value ?? null, lastOdo), rect: hit });
  let device = null;
  try {
    const { readOdoOnDevice } = await import('./deviceOcr.js');
    device = await readOdoOnDevice(blob, { lastOdo, rect, saved });
  } catch { device = null; }
  if (device?.value != null && checkPlausible(device.value, lastOdo).ok) return out(device.value, 'device', '', device.rect);
  if (useServer && !rect) {
    try {
      const r = await viaServer(blob);
      if (r.status === 'done' && r.value != null) return out(r.value, 'ai', r.note);
    } catch { /* bỏ qua */ }
  }
  return out(device?.value ?? null, 'device', '', device?.rect || null);
}

/**
 * ĐỌC HÓA ĐƠN NHIÊN LIỆU — trên máy trước (XML hóa đơn điện tử: chính xác tuyệt đối; PDF: lấy chữ trong
 * tệp; ảnh: nhận dạng tiếng Việt), máy chủ AI chỉ khi máy chưa ra số lít và có cấu hình khóa.
 * Trả { ok, data, message } — không đọc được thì giao diện cho nhập tay (không ném lỗi).
 */
export async function readInvoice(file, { useServer = true } = {}) {
  let device = null;
  try {
    const { readInvoiceOnDevice } = await import('./deviceOcr.js');
    device = await readInvoiceOnDevice(file);
  } catch { device = null; }
  if (device?.found) return { ok: true, data: device };
  const isXml = device?.engine === 'xml';
  if (useServer && !isXml && /^(image\/|application\/pdf)/.test(file?.type || '')) {
    const r = await viaServerInvoice(file);
    if (r.ok) return r;
  }
  return {
    ok: false, data: device,
    message: device?.engine === 'xml' ? 'Tệp XML không đúng mẫu hóa đơn điện tử — vui lòng nhập tay.'
      : device && (device.invoice_no || device.amount || device.invoice_date) ? 'Đã đọc được một phần — kiểm tra, bổ sung số lít / số tiền.'
        : 'Không nhận dạng được hóa đơn — vui lòng nhập tay (tải tệp XML của hóa đơn điện tử sẽ đọc chính xác nhất).',
  };
}

async function viaServerInvoice(blob) {
  try {
    if (!supabase) return { ok: false };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 55000);
    try {
      const res = await fetch('/api/ocr-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ file: await toBase64(blob), media_type: blob.type || 'image/jpeg' }),
        signal: ctrl.signal,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.found) return { ok: false };
      return { ok: true, data: { ...json, engine: 'ai' } };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { ok: false };
  }
}
