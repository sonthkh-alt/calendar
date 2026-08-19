// TRỢ LÝ KÝ SỐ — chạy trên máy có cắm USB token của Lãnh đạo Văn phòng.
// Hệ thống lịch công tác (chạy HTTPS) gọi sang đây qua http://127.0.0.1:7878 để ký PDF.
// Trình duyệt cho phép trang HTTPS gọi 127.0.0.1 nếu máy chủ cục bộ trả đúng header CORS
// + Access-Control-Allow-Private-Network (yêu cầu Private Network Access của Chrome/Edge).
//
// Chạy:  npm start        (trong thư mục này)
// Cấu hình: config.json — { port, allowOrigins: [...], certThumbprint }
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { listCertificates } from './winsign.mjs';
import { signPdfWithToken } from './pdfsign.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VERSION = '1.0.0';
const MAX_BODY = 25 * 1024 * 1024; // 25MB

const DEFAULTS = {
  port: 7878,
  // Chỉ nhận yêu cầu từ đúng các địa chỉ này. Thêm tên miền thật của hệ thống vào đây.
  allowOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  certThumbprint: '',
};

async function loadConfig() {
  try {
    const raw = await fs.readFile(path.join(HERE, 'config.json'), 'utf8');
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

const cfg = await loadConfig();

const originAllowed = (origin) => !!origin
  && (cfg.allowOrigins.includes('*') || cfg.allowOrigins.includes(origin));

function setCors(req, res) {
  const origin = req.headers.origin;
  if (originAllowed(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome/Edge: trang công cộng gọi vào mạng nội bộ phải được cho phép rõ ràng
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Access-Control-Max-Age', '600');
}

const sendJson = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Dữ liệu gửi lên quá lớn.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Chọn chứng thư: ưu tiên yêu cầu -> cấu hình -> chứng thư ký được duy nhất
async function pickThumbprint(requested) {
  if (requested) return requested;
  if (cfg.certThumbprint) return cfg.certThumbprint;
  const certs = await listCertificates();
  const usable = certs.filter((c) => c.canSignDocument);
  if (usable.length === 1) return usable[0].thumbprint;
  if (usable.length === 0) throw new Error('Không tìm thấy chứng thư số có khóa riêng. Hãy cắm USB token rồi thử lại.');
  throw new Error('Máy có nhiều chứng thư — hãy ghi thumbprint cần dùng vào config.json (certThumbprint).');
}

const server = http.createServer(async (req, res) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = new URL(req.url, 'http://127.0.0.1');
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, 200, { ok: true, name: 'ky-so-agent', version: VERSION });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/certs') {
      if (!originAllowed(req.headers.origin) && req.headers.origin) { sendJson(res, 403, { error: 'Nguồn gọi không được phép.' }); return; }
      const certs = await listCertificates();
      sendJson(res, 200, { certs });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/sign') {
      if (!originAllowed(req.headers.origin)) { sendJson(res, 403, { error: 'Nguồn gọi không được phép. Thêm địa chỉ hệ thống vào allowOrigins trong config.json.' }); return; }
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (!body.pdfBase64) { sendJson(res, 400, { error: 'Thiếu pdfBase64.' }); return; }
      const thumbprint = await pickThumbprint(body.thumbprint);
      const pdf = Buffer.from(body.pdfBase64, 'base64');
      console.log(`[${new Date().toLocaleString('vi-VN')}] Ký ${pdf.length} byte bằng chứng thư ${thumbprint} — chờ nhập mã PIN...`);
      const signed = await signPdfWithToken(pdf, thumbprint, {
        reason: body.reason, name: body.name, location: body.location, contactInfo: body.contactInfo, sha1: body.sha1,
      });
      console.log('  -> đã ký xong,', signed.length, 'byte');
      sendJson(res, 200, { pdfBase64: signed.toString('base64'), thumbprint });
      return;
    }

    sendJson(res, 404, { error: 'Không có đường dẫn này.' });
  } catch (e) {
    console.error('LỖI:', e?.message || e);
    sendJson(res, 500, { error: e?.message || String(e) });
  }
});

// CHỈ lắng nghe trên máy này (127.0.0.1) — máy khác trong mạng không gọi được
server.listen(cfg.port, '127.0.0.1', () => {
  console.log('==================================================');
  console.log(' TRỢ LÝ KÝ SỐ - Hệ thống lịch công tác tuần');
  console.log(` Đang chạy tại http://127.0.0.1:${cfg.port}`);
  console.log(' Cho phép gọi từ:', cfg.allowOrigins.join(', '));
  console.log(' Giữ cửa sổ này mở khi cần ký số. Đóng = tắt trợ lý.');
  console.log('==================================================');
});
