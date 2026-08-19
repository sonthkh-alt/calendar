// Gọi TRỢ LÝ KÝ SỐ chạy trên máy có cắm USB token (tools/ky-so-agent).
//
// Trình duyệt không chạm được vào USB token, nên trang web gửi tệp PDF sang một chương
// trình nhỏ chạy nền ngay trên máy người ký (http://127.0.0.1:7878) — chương trình đó ký
// bằng chứng thư trên token (SafeNet hiện hộp nhập PIN) rồi trả lại PDF đã ký.
//
// Chrome/Edge coi 127.0.0.1 là nguồn tin cậy nên trang HTTPS gọi được; trợ lý phải trả
// header CORS + Access-Control-Allow-Private-Network (đã làm sẵn trong agent.mjs).

const DEFAULT_URL = 'http://127.0.0.1:7878';
const LS_KEY = 'kySoAgentUrl';

// Cho phép đổi địa chỉ trợ lý mà không cần build lại (Console: localStorage.kySoAgentUrl = '...')
export function agentUrl() {
  try { return localStorage.getItem(LS_KEY) || DEFAULT_URL; } catch { return DEFAULT_URL; }
}

async function withTimeout(promise, ms, onTimeoutMessage) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await promise(ctrl.signal); }
  catch (e) {
    if (e?.name === 'AbortError') throw new Error(onTimeoutMessage);
    throw e;
  } finally { clearTimeout(t); }
}

// Trợ lý có đang chạy không? (dò nhanh, không làm treo giao diện)
export async function probeAgent() {
  try {
    const res = await withTimeout(
      (signal) => fetch(`${agentUrl()}/health`, { signal }),
      2500, 'Trợ lý ký số không phản hồi.',
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.ok ? json : null;
  } catch {
    return null;
  }
}

// Danh sách chứng thư trên máy người ký (để chọn khi có nhiều token/chứng thư)
export async function listAgentCerts() {
  const res = await withTimeout(
    (signal) => fetch(`${agentUrl()}/certs`, { signal }),
    10000, 'Trợ lý ký số không phản hồi.',
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || 'Không lấy được danh sách chứng thư.');
  return json.certs || [];
}

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onerror = () => reject(new Error('Không đọc được tệp PDF.'));
  fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
  fr.readAsDataURL(blob);
});

const base64ToBlob = (b64) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: 'application/pdf' });
};

/**
 * Gửi PDF sang trợ lý để ký số. Người ký sẽ thấy hộp nhập mã PIN của token.
 * @returns {Promise<Blob>} PDF đã ký
 */
export async function signPdfViaAgent(pdfBlob, { reason, name, location, thumbprint } = {}) {
  const pdfBase64 = await blobToBase64(pdfBlob);
  // Chờ lâu: người ký còn phải nhập mã PIN
  const res = await withTimeout(
    (signal) => fetch(`${agentUrl()}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfBase64, reason, name, location, thumbprint }),
      signal,
    }),
    240000, 'Quá thời gian chờ ký (4 phút). Có thể chưa nhập mã PIN.',
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Trợ lý ký số báo lỗi (${res.status}).`);
  if (!json?.pdfBase64) throw new Error('Trợ lý ký số không trả về tệp đã ký.');
  return base64ToBlob(json.pdfBase64);
}
