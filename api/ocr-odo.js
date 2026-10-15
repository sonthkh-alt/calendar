// Vercel Serverless Function — ĐỌC SỐ ODO TỪ ẢNH CHỤP ĐỒNG HỒ (module Nhật trình xe).
// Lái xe chỉ chụp ảnh; hàm này gửi ảnh tới Claude (đọc ảnh) để lấy SỐ ODO TỔNG (không lấy
// TRIP, giờ, nhiệt độ, quãng đường còn lại...). Không đọc được -> trả found=false, giao diện
// yêu cầu lái xe gõ tay.
//
// YÊU CẦU CẤU HÌNH (Vercel -> Settings -> Environment Variables):
//   - ANTHROPIC_API_KEY   (khóa API Claude — console.anthropic.com). Thiếu biến này: trả 501,
//                         trình duyệt tự chuyển sang đọc bằng Tesseract (kém chính xác hơn).
//   - VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (đã có) — để xác thực người gọi.
// Bảo mật: chỉ tài khoản lái xe / Phòng HC-TC-QT / Quản trị (đã đăng nhập) được gọi.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const MODEL = 'claude-opus-5-5';
const ALLOWED_ROLES = ['lai_xe', 'van_phong_xe', 'quan_tri'];
const BOOTSTRAP_ADMIN_EMAILS = ['sonthkh@gmail.com'];
const MAX_IMAGE_B64 = 4_000_000; // ~3 MB ảnh (ảnh đã được nén ≤1600px ở trình duyệt)

const SYSTEM = `Bạn đọc số trên ảnh chụp bảng đồng hồ xe ô tô để ghi nhật trình xe công vụ.
Nhiệm vụ: tìm SỐ ODO — tổng quãng đường xe đã chạy (thường ghi ODO, TOTAL, hoặc là số km lớn nhất,
hiển thị liên tục, không có phần thập phân).
KHÔNG lấy: TRIP / TRIP A / TRIP B (số có phần thập phân hoặc ghi TRIP), giờ, nhiệt độ, tốc độ,
vòng tua, mức nhiên liệu, quãng đường còn đi được (RANGE / km to empty), mức tiêu hao.
Chỉ trả found=true khi đọc rõ ràng từng chữ số của số ODO. Nếu ảnh mờ, lóa, bị che, không phải
đồng hồ xe, hoặc phân vân giữa nhiều số -> found=false và odo=0. Tuyệt đối không đoán.`;

const SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: 'true nếu đọc rõ được số ODO tổng' },
    odo: { type: 'integer', description: 'Số ODO (chỉ phần nguyên, không dấu phân cách); 0 nếu không đọc được' },
    unit: { type: 'string', enum: ['km', 'mile', 'khong_ro'] },
    note: { type: 'string', description: 'Ghi chú ngắn bằng tiếng Việt (vd lý do không đọc được)' },
  },
  required: ['found', 'odo', 'unit', 'note'],
  additionalProperties: false,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Phương thức không hợp lệ.' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(501).json({ error: 'Máy chủ chưa cấu hình ANTHROPIC_API_KEY — dùng cách đọc dự phòng.' });
  }

  // 1) Xác thực người gọi + quyền dùng module Nhật trình xe
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!url || !key) return res.status(500).json({ error: 'Máy chủ chưa cấu hình Supabase.' });
  if (!token) return res.status(401).json({ error: 'Thiếu phiên đăng nhập.' });
  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: who, error: whoErr } = await sb.auth.getUser(token);
  if (whoErr || !who?.user) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  let allowed = BOOTSTRAP_ADMIN_EMAILS.includes((who.user.email || '').toLowerCase());
  if (!allowed) {
    const { data: prof } = await sb.from('profiles').select('role').eq('id', who.user.id).single();
    allowed = ALLOWED_ROLES.includes(prof?.role);
  }
  if (!allowed) return res.status(403).json({ error: 'Tài khoản không có quyền dùng Nhật trình xe.' });

  // 2) Ảnh
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const data = String(body?.image || '').replace(/^data:[^,]+,/, '');
  const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body?.media_type) ? body.media_type : 'image/jpeg';
  if (!data) return res.status(400).json({ error: 'Thiếu ảnh.' });
  if (data.length > MAX_IMAGE_B64) return res.status(413).json({ error: 'Ảnh quá lớn.' });

  // 3) Gọi Claude đọc ảnh — đầu ra JSON theo lược đồ cố định
  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4096,
      // Bị chặn bởi bộ lọc an toàn -> máy chủ tự chạy lại trên mô hình dự phòng phù hợp
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      // Việc đọc số đơn giản -> effort thấp cho nhanh (lái xe đang đứng chờ)
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: 'Đọc số ODO trên ảnh đồng hồ này.' },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') {
      return res.status(200).json({ found: false, odo: null, engine: 'ai', note: 'Không xử lý được ảnh này.' });
    }
    const text = response.content.find((b) => b.type === 'text')?.text || '';
    let out;
    try { out = JSON.parse(text); } catch { out = null; }
    const odo = Number.isInteger(out?.odo) && out.odo > 0 ? out.odo : null;
    const found = !!out?.found && odo != null;
    return res.status(200).json({ found, odo: found ? odo : null, unit: out?.unit || 'khong_ro', note: out?.note || '', engine: 'ai', model: response.model });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Hệ thống đọc ảnh đang quá tải, thử lại sau ít phút.' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(501).json({ error: 'Khóa ANTHROPIC_API_KEY không hợp lệ.' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `Lỗi dịch vụ đọc ảnh (${e.status}).` });
    return res.status(500).json({ error: 'Không đọc được ảnh: ' + (e?.message || e) });
  }
}
