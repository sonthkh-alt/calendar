// Vercel Serverless Function — TẠO TÀI KHOẢN (chỉ Quản trị).
// Dùng SERVICE ROLE KEY (bí mật, chỉ ở máy chủ) để tạo user qua Admin API:
// xác nhận email luôn + đặt pw_set=true (đăng nhập ngay bằng email + mật khẩu).
// Bảo mật: kiểm tra người gọi là Quản trị (email bootstrap hoặc profiles.role='quan_tri').
//
// YÊU CẦU CẤU HÌNH (Vercel -> Settings -> Environment Variables):
//   - VITE_SUPABASE_URL (đã có sẵn cho client)
//   - SUPABASE_SERVICE_ROLE_KEY  (LẤY ở Supabase -> Project Settings -> API -> service_role)
import { createClient } from '@supabase/supabase-js';

const BOOTSTRAP_ADMIN_EMAILS = ['sonthkh@gmail.com'];
const VALID_ROLES = ['quan_tri', 'pct', 'pho_truong_doan', 'cb_ban', 'cb_tonghop', 'cb_ctqh', 'van_phong_xe', 'nguoi_xem'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Phương thức không hợp lệ.' });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return res.status(500).json({ error: 'Máy chủ chưa cấu hình SUPABASE_SERVICE_ROLE_KEY. Vào Vercel → Settings → Environment Variables để thêm.' });
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Thiếu phiên đăng nhập.' });

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1) Xác thực người gọi + kiểm tra quyền Quản trị
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !callerData?.user) return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ.' });
  const callerEmail = (callerData.user.email || '').toLowerCase();
  let isAdmin = BOOTSTRAP_ADMIN_EMAILS.includes(callerEmail);
  if (!isAdmin) {
    const { data: prof } = await admin.from('profiles').select('role').eq('id', callerData.user.id).single();
    isAdmin = prof?.role === 'quan_tri';
  }
  if (!isAdmin) return res.status(403).json({ error: 'Chỉ tài khoản Quản trị mới được tạo tài khoản.' });

  // 2) Đọc dữ liệu
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const email = (body?.email || '').trim().toLowerCase();
  const password = body?.password || '';
  const full_name = (body?.full_name || '').trim() || null;
  const position = (body?.position || '').trim() || null;
  const role = VALID_ROLES.includes(body?.role) ? body.role : 'nguoi_xem';
  const ban_ids = Array.isArray(body?.ban_ids) ? body.ban_ids : [];

  if (!email || !/.+@.+\..+/.test(email)) return res.status(400).json({ error: 'Email không hợp lệ.' });
  if (password.length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự.' });

  // 3) Tạo tài khoản (xác nhận email luôn; pw_set=true để không bắt tạo lại mật khẩu)
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { pw_set: true, full_name, position },
  });
  if (createErr) {
    const msg = /already.*registered|exists/i.test(createErr.message || '') ? 'Email này đã có tài khoản.' : createErr.message;
    return res.status(400).json({ error: msg });
  }

  // 4) Cập nhật hồ sơ phân quyền (trigger handle_new_user đã tạo dòng profiles)
  const uid = created.user.id;
  const { error: upErr } = await admin.from('profiles')
    .upsert({ id: uid, email, role, full_name, position, ban_ids }, { onConflict: 'id' });
  if (upErr) return res.status(200).json({ ok: true, warning: 'Đã tạo tài khoản nhưng cập nhật phân quyền lỗi: ' + upErr.message });

  return res.status(200).json({ ok: true });
}
