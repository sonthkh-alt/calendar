// Kiểm chứng hàm máy chủ api/ocr-odo.js (đọc số ODO từ ảnh) KHÔNG cần khóa API thật:
// thay @anthropic-ai/sdk và @supabase/supabase-js bằng bản giả để kiểm tra xác thực người gọi,
// phân quyền, tham số gửi Claude (model, ảnh, JSON schema, fallback), cách đọc kết quả và lỗi.
// npm run test:ocr
import { build } from 'esbuild';
import { createRequire } from 'module';
import fs from 'fs';
const require = createRequire(import.meta.url);

fs.mkdirSync('scripts/.mock', { recursive: true });
fs.writeFileSync('scripts/.mock/anthropic.cjs', `
class APIError extends Error { constructor(s, m) { super(m); this.status = s; } }
class RateLimitError extends APIError {}
class AuthenticationError extends APIError {}
class Anthropic {
  constructor() { this.beta = { messages: { create: async (p) => { globalThis.__lastReq = p; return globalThis.__reply(p); } } }; }
}
Anthropic.APIError = APIError; Anthropic.RateLimitError = RateLimitError; Anthropic.AuthenticationError = AuthenticationError;
globalThis.__A = Anthropic; module.exports = Anthropic; module.exports.default = Anthropic;
`);
fs.writeFileSync('scripts/.mock/supabase.cjs', `
exports.createClient = () => ({
  auth: { getUser: async (t) => (globalThis.__users[t] ? { data: { user: globalThis.__users[t] }, error: null } : { data: null, error: { message: 'bad' } }) },
  from: () => ({ select: () => ({ eq: (_c, id) => ({ single: async () => ({ data: { role: globalThis.__roles[id] } }) }) }) }),
});
`);
await build({
  entryPoints: ['api/ocr-odo.js'], bundle: true, format: 'cjs', platform: 'node', outfile: 'scripts/.ocr-api.cjs', logLevel: 'silent',
  plugins: [{ name: 'mock', setup(b) {
    b.onResolve({ filter: /^@anthropic-ai\/sdk$/ }, () => ({ path: require.resolve('./.mock/anthropic.cjs') }));
    b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: require.resolve('./.mock/supabase.cjs') }));
  } }],
});
const handler = require('./.ocr-api.cjs').default;

let pass = true;
const must = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) pass = false; };
const call = async (headers, body) => {
  const out = {};
  const res = { status(s) { out.status = s; return this; }, json(j) { out.json = j; return this; } };
  await handler({ method: 'POST', headers, body }, res);
  return out;
};
process.env.VITE_SUPABASE_URL = 'https://x.supabase.co';
process.env.VITE_SUPABASE_ANON_KEY = 'anon';
globalThis.__users = { tokDriver: { id: 'u1', email: 'chan@thanhhoa.gov.vn' }, tokPct: { id: 'u2', email: 'pct@x' } };
globalThis.__roles = { u1: 'lai_xe', u2: 'pct' };
const img = { image: 'data:image/jpeg;base64,' + Buffer.from('fake').toString('base64'), media_type: 'image/jpeg' };
const auth = (t) => ({ authorization: `Bearer ${t}` });
const textReply = (obj, extra = {}) => () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(obj) }], ...extra });

delete process.env.ANTHROPIC_API_KEY;
must((await call(auth('tokDriver'), img)).status === 501, 'Chưa cấu hình ANTHROPIC_API_KEY -> 501 (trình duyệt chuyển sang Tesseract)');
process.env.ANTHROPIC_API_KEY = 'test';
must((await call({}, img)).status === 401, 'Không đăng nhập -> 401');
must((await call(auth('sai'), img)).status === 401, 'Phiên không hợp lệ -> 401');
must((await call(auth('tokPct'), img)).status === 403, 'Vai trò ngoài module (PCT) -> 403');
must((await call(auth('tokDriver'), {})).status === 400, 'Thiếu ảnh -> 400');

globalThis.__reply = textReply({ found: true, odo: 55266, unit: 'km', note: '' });
const ok = await call(auth('tokDriver'), JSON.stringify(img));
must(ok.status === 200 && ok.json.found && ok.json.odo === 55266 && ok.json.engine === 'ai', 'Đọc được -> trả số ODO');
const p = globalThis.__lastReq;
must(p.model === 'claude-opus-5-5', 'Gọi model claude-opus-5-5');
must(p.content === undefined && p.messages[0].content[0].type === 'image' && p.messages[0].content[0].source.data === Buffer.from('fake').toString('base64'), 'Gửi ảnh base64 (đã bỏ tiền tố data:)');
must(p.output_config?.format?.type === 'json_schema' && p.output_config.format.schema.required.includes('odo'), 'Đầu ra JSON theo lược đồ');
must(p.output_config?.effort === 'low', 'Effort thấp cho nhanh');
must(p.fallbacks === 'default' && p.betas.includes('server-side-fallback-2026-07-01'), 'Bật fallback mặc định khi bị bộ lọc an toàn chặn');
must(/TRIP/.test(p.system) && /không đoán/i.test(p.system), 'Lời nhắc: bỏ TRIP, không đoán');

globalThis.__reply = textReply({ found: false, odo: 0, unit: 'khong_ro', note: 'Ảnh mờ' });
const nf = await call(auth('tokDriver'), img);
must(nf.status === 200 && nf.json.found === false && nf.json.odo === null, 'Không đọc rõ -> found=false (giao diện bắt gõ tay)');
globalThis.__reply = () => ({ stop_reason: 'refusal', content: [] });
must((await call(auth('tokDriver'), img)).json.found === false, 'Bị từ chối -> found=false');
globalThis.__reply = textReply({ found: true, odo: 0, unit: 'km', note: '' });
must((await call(auth('tokDriver'), img)).json.found === false, 'Số 0 -> coi như không đọc được');
const A = globalThis.__A; // đúng bản đã đóng gói vào hàm (instanceof)
globalThis.__reply = () => { throw new A.RateLimitError(429, 'rl'); };
must((await call(auth('tokDriver'), img)).status === 429, 'Quá tải -> 429');
globalThis.__reply = () => { throw new A.AuthenticationError(401, 'bad key'); };
must((await call(auth('tokDriver'), img)).status === 501, 'Khóa sai -> 501 (chuyển dự phòng)');

// ---------- api/ocr-invoice.js (đọc hóa đơn nhiên liệu) ----------
await build({
  entryPoints: ['api/ocr-invoice.js'], bundle: true, format: 'cjs', platform: 'node', outfile: 'scripts/.ocr-api.cjs', logLevel: 'silent',
  plugins: [{ name: 'mock', setup(b) {
    b.onResolve({ filter: /^@anthropic-ai\/sdk$/ }, () => ({ path: require.resolve('./.mock/anthropic.cjs') }));
    b.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: require.resolve('./.mock/supabase.cjs') }));
  } }],
});
delete require.cache[require.resolve('./.ocr-api.cjs')];
const inv = require('./.ocr-api.cjs').default;
const callInv = async (headers, body) => {
  const out = {};
  const res = { status(st) { out.status = st; return this; }, json(j) { out.json = j; return this; } };
  await inv({ method: 'POST', headers, body }, res);
  return out;
};
globalThis.__users.tokHc = { id: 'u3', email: 'hctcqt@thanhhoa.gov.vn' };
globalThis.__roles.u3 = 'van_phong_xe';
const pdf = { file: Buffer.from('%PDF-1.4').toString('base64'), media_type: 'application/pdf' };
must((await callInv(auth('tokDriver'), pdf)).status === 403, 'Hóa đơn: lái xe KHÔNG được gọi (chỉ HC-TC-QT / Quản trị)');
must((await callInv(auth('tokHc'), { file: 'abc', media_type: 'text/plain' })).status === 415, 'Hóa đơn: tệp không phải ảnh/PDF -> 415');
globalThis.__reply = () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify({ found: true, invoice_no: '0001234', invoice_date: '2026-10-15', seller: 'CHXD Số 1', fuel_type: 'dau', liters: 45.5, unit_price: 20500, amount: 932750, plate: '36A-123.68', note: '' }) }] });
const ok2 = await callInv(auth('tokHc'), pdf);
must(ok2.status === 200 && ok2.json.found && ok2.json.liters === 45.5 && ok2.json.plate === '36A-123.68', 'Hóa đơn: trả đủ số lít, biển số...');
const q2 = globalThis.__lastReq;
must(q2.messages[0].content[0].type === 'document' && q2.messages[0].content[0].source.media_type === 'application/pdf', 'Hóa đơn PDF gửi dạng document');
must(q2.output_config.format.schema.required.includes('liters') && q2.fallbacks === 'default', 'Hóa đơn: JSON schema + fallback');
globalThis.__reply = () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ found: true, invoice_no: '', invoice_date: '15/10/2026', seller: '', fuel_type: '', liters: 0, unit_price: 0, amount: 0, plate: '', note: '' }) }] });
const bad = await callInv(auth('tokHc'), { file: 'aGk=', media_type: 'image/jpeg' });
must(bad.json.found === false && bad.json.invoice_date === '', 'Hóa đơn: 0 lít -> found=false; ngày sai định dạng -> bỏ');

console.log(pass ? '\nTẤT CẢ ĐẠT' : '\nCÓ LỖI');
process.exit(pass ? 0 : 1);
