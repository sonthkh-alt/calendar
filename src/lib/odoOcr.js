// ĐỌC SỐ ODO TỪ ẢNH CHỤP ĐỒNG HỒ — lái xe chỉ chụp ảnh, hệ thống tự trích số.
//  1) Máy chủ (api/ocr-odo.js — Claude đọc ảnh, phân biệt ODO tổng với TRIP/giờ/nhiệt độ...).
//  2) Máy chủ chưa cấu hình / lỗi mạng -> đọc ngay trong trình duyệt bằng Tesseract (dự phòng,
//     chỉ nhận chữ số, rồi chọn số hợp lý nhất so với lần ghi trước).
//  3) Không ra số nào đáng tin -> trả value=null để giao diện yêu cầu lái xe gõ tay.
// pickOdoCandidate / checkPlausible là HÀM THUẦN (test ở node).
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

/**
 * Chọn số ODO từ văn bản nhận dạng được (Tesseract). Gom các dãy số (bỏ dấu chấm / phẩy
 * phân nhóm nghìn), giữ số 3–7 chữ số. Có lần ghi trước -> chọn số hợp lệ gần nhất (không lùi,
 * không nhảy quá MAX_JUMP); không có -> chọn số nhiều chữ số nhất (ODO thường dài nhất).
 * Trả { value, candidates } — value=null nếu không có số đáng tin.
 */
export function pickOdoCandidate(text, lastOdo = null) {
  // Không cho dấu cách nằm trong một số (tránh gộp "55266 123" thành một số)
  const raw = String(text || '').match(/\d(?:[\d.,]*\d)?/g) || [];
  const nums = [];
  for (const r of raw) {
    // "55.266" / "55,266" / "055266" -> 55266; "123.4" (TRIP có thập phân 1 chữ số) -> bỏ
    if (/[.,]\d$/.test(r) && !/[.,]\d{3}$/.test(r)) continue;
    const d = r.replace(/[^\d]/g, '');
    if (d.length < 3 || d.length > 7) continue;
    nums.push(parseInt(d, 10));
  }
  const candidates = [...new Set(nums)];
  if (!candidates.length) return { value: null, candidates };
  if (lastOdo != null) {
    const ok = candidates.filter((v) => checkPlausible(v, lastOdo).ok).sort((a, b) => a - b);
    return { value: ok.length ? ok[0] : null, candidates };
  }
  const best = [...candidates].sort((a, b) => String(b).length - String(a).length || b - a)[0];
  return { value: String(best).length >= 4 ? best : null, candidates };
}

const toBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).replace(/^data:[^,]+,/, ''));
  fr.onerror = () => reject(fr.error);
  fr.readAsDataURL(blob);
});

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

async function viaTesseract(blob, lastOdo) {
  const mod = await import('tesseract.js');
  const T = mod.default || mod;
  const worker = await T.createWorker('eng');
  try {
    await worker.setParameters({ tessedit_char_whitelist: '0123456789., ' });
    const { data } = await worker.recognize(blob);
    const pick = pickOdoCandidate(data?.text || '', lastOdo);
    return { status: 'done', value: pick.value, candidates: pick.candidates, engine: 'tesseract' };
  } finally {
    await worker.terminate();
  }
}

/**
 * Đọc số ODO từ ảnh. Trả { value|null, engine: 'ai'|'tesseract'|null, note, plausible }.
 * Không bao giờ ném lỗi — mọi trục trặc đều quy về value=null (giao diện cho gõ tay).
 */
export async function recognizeOdo(blob, { lastOdo = null } = {}) {
  try {
    let r = await viaServer(blob);
    if (r.status !== 'done') {
      try { r = await viaTesseract(blob, lastOdo); } catch { r = { status: 'done', value: null, engine: null }; }
    }
    return { value: r.value ?? null, engine: r.engine || null, note: r.note || '', plausible: checkPlausible(r.value ?? null, lastOdo) };
  } catch {
    return { value: null, engine: null, note: '', plausible: { ok: false, reason: 'none' } };
  }
}

/**
 * ĐỌC HÓA ĐƠN NHIÊN LIỆU (ảnh đã nén hoặc PDF) qua /api/ocr-invoice. Trả { ok: true, data } hoặc
 * { ok: false, message } — không đọc được thì giao diện cho nhập tay (không ném lỗi).
 */
export async function readInvoice(blob) {
  try {
    if (!supabase) return { ok: false, message: 'Chưa cấu hình máy chủ.' };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return { ok: false, message: 'Chưa đăng nhập.' };
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
      if (!res.ok) return { ok: false, message: json?.error || `Không đọc được hóa đơn (${res.status}) — vui lòng nhập tay.` };
      if (!json?.found) return { ok: false, message: json?.note ? `Không đọc được: ${json.note}` : 'Không nhận dạng được hóa đơn — vui lòng nhập tay.', data: json };
      return { ok: true, data: json };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { ok: false, message: 'Không kết nối được máy chủ đọc hóa đơn — vui lòng nhập tay.' };
  }
}
