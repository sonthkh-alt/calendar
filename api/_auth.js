// Dùng chung cho các hàm máy chủ đọc ảnh (api/ocr-*.js). Tệp bắt đầu bằng "_" -> Vercel KHÔNG coi là
// một endpoint. Xác thực JWT người gọi (Supabase) + kiểm tra vai trò được phép.
import { createClient } from '@supabase/supabase-js';

const BOOTSTRAP_ADMIN_EMAILS = ['sonthkh@gmail.com'];

/** Trả { ok: true, user, role } hoặc { ok: false, status, error } */
export async function authorize(req, allowedRoles) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!url || !key) return { ok: false, status: 500, error: 'Máy chủ chưa cấu hình Supabase.' };
  if (!token) return { ok: false, status: 401, error: 'Thiếu phiên đăng nhập.' };
  const sb = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: who, error } = await sb.auth.getUser(token);
  if (error || !who?.user) return { ok: false, status: 401, error: 'Phiên đăng nhập không hợp lệ.' };
  if (BOOTSTRAP_ADMIN_EMAILS.includes((who.user.email || '').toLowerCase())) return { ok: true, user: who.user, role: 'quan_tri' };
  const { data: prof } = await sb.from('profiles').select('role').eq('id', who.user.id).single();
  if (!allowedRoles.includes(prof?.role)) return { ok: false, status: 403, error: 'Tài khoản không có quyền dùng chức năng này.' };
  return { ok: true, user: who.user, role: prof.role };
}

export const readBody = (req) => {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  return body || {};
};
