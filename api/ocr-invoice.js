// Vercel Serverless Function — ĐỌC HÓA ĐƠN NHIÊN LIỆU (ảnh hoặc PDF hóa đơn điện tử) cho Phòng HC-TC-QT.
// Trích: số hóa đơn, ngày, đơn vị bán, loại nhiên liệu, số lít, đơn giá, thành tiền, biển số (nếu có).
// Người nhập LUÔN xem lại / sửa trước khi lưu; kết quả máy đọc được lưu kèm (ocr_data) để đối chiếu.
// Cần env ANTHROPIC_API_KEY (thiếu -> 501, giao diện cho nhập tay).
import Anthropic from '@anthropic-ai/sdk';
import { authorize, readBody } from './_auth.js';

const MODEL = 'claude-opus-5-5';
const MAX_B64 = 4_000_000;

const SYSTEM = `Bạn trích thông tin từ HÓA ĐƠN MUA NHIÊN LIỆU (xăng, dầu diesel) ở Việt Nam — hóa đơn điện tử
(PDF/ảnh) hoặc phiếu in của cửa hàng xăng dầu — để quản lý nhiên liệu xe công vụ.
Quy tắc:
- invoice_date dạng YYYY-MM-DD (ngày lập hóa đơn / ngày bán). Không rõ thì "".
- liters: tổng số lít nhiên liệu (số thập phân, dấu chấm). unit_price: đơn giá đồng/lít (đã gồm thuế nếu
  hóa đơn ghi giá đã gồm thuế). amount: TỔNG TIỀN THANH TOÁN (đồng, số nguyên, đã gồm thuế). Thiếu thì 0.
- fuel_type: "xang" cho xăng (RON 95, E5 RON 92...), "dau" cho dầu diesel (DO 0,05S...), "" nếu không rõ.
- plate: biển số xe nếu hóa đơn có ghi (vd 36A-123.45), không có thì "".
- Chỉ đặt found=true khi đây đúng là hóa đơn/phiếu mua nhiên liệu và đọc được số lít.
- Không đoán số liệu không có trên chứng từ.`;

const SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    invoice_no: { type: 'string' },
    invoice_date: { type: 'string' },
    seller: { type: 'string' },
    fuel_type: { type: 'string', enum: ['xang', 'dau', ''] },
    liters: { type: 'number' },
    unit_price: { type: 'number' },
    amount: { type: 'number' },
    plate: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['found', 'invoice_no', 'invoice_date', 'seller', 'fuel_type', 'liters', 'unit_price', 'amount', 'plate', 'note'],
  additionalProperties: false,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Phương thức không hợp lệ.' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(501).json({ error: 'Máy chủ chưa cấu hình ANTHROPIC_API_KEY — vui lòng nhập tay.' });
  const auth = await authorize(req, ['van_phong_xe', 'quan_tri']);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

  const body = readBody(req);
  const data = String(body.file || '').replace(/^data:[^,]+,/, '');
  const mediaType = String(body.media_type || '');
  if (!data) return res.status(400).json({ error: 'Thiếu tệp hóa đơn.' });
  if (data.length > MAX_B64) return res.status(413).json({ error: 'Tệp quá lớn (tối đa ~3 MB).' });
  let source;
  if (mediaType === 'application/pdf') source = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } };
  else if (['image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) source = { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
  else return res.status(415).json({ error: 'Chỉ nhận ảnh (JPG/PNG/WebP) hoặc PDF.' });

  try {
    const client = new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4096,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: 'user', content: [source, { type: 'text', text: 'Trích thông tin hóa đơn nhiên liệu này.' }] }],
    });
    if (response.stop_reason === 'refusal') return res.status(200).json({ found: false, note: 'Không xử lý được tệp này.' });
    const text = response.content.find((b) => b.type === 'text')?.text || '';
    let out;
    try { out = JSON.parse(text); } catch { out = null; }
    if (!out) return res.status(200).json({ found: false, note: 'Không đọc được kết quả.' });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(out.invoice_date || '') ? out.invoice_date : '';
    return res.status(200).json({ ...out, invoice_date: date, found: !!out.found && Number(out.liters) > 0, engine: 'ai', model: response.model });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(429).json({ error: 'Hệ thống đọc hóa đơn đang quá tải, thử lại sau.' });
    if (e instanceof Anthropic.AuthenticationError) return res.status(501).json({ error: 'Khóa ANTHROPIC_API_KEY không hợp lệ.' });
    if (e instanceof Anthropic.APIError) return res.status(502).json({ error: `Lỗi dịch vụ đọc hóa đơn (${e.status}).` });
    return res.status(500).json({ error: 'Không đọc được hóa đơn: ' + (e?.message || e) });
  }
}
