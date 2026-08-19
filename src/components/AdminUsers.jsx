import { useEffect, useMemo, useState } from 'react';
import { UserCog, Info, UserPlus, Loader2, CheckCircle2, AlertTriangle, PenTool, Trash2 } from 'lucide-react';
import { fetchProfiles, updateProfile, adminCreateUser } from '../lib/api';
import { ROLES } from '../lib/constants';

/**
 * Quản trị tài khoản:
 *  - TẠO tài khoản mới (gọi serverless /api/admin-create-user, dùng service_role): nhập
 *    email/mật khẩu/họ tên + TICK vai trò + TICK các Ban (cho cb_ban). Xác nhận email luôn.
 *  - Phân quyền tài khoản đã có: đổi vai trò, Ban theo dõi (cb_ban), lãnh đạo gắn (pct).
 */
export default function AdminUsers({ bans, leaders, profile }) {
  const [profiles, setProfiles] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  // ----- Form tạo tài khoản -----
  const empty = { email: '', password: '', full_name: '', position: '', role: 'nguoi_xem', ban_ids: [] };
  const [form, setForm] = useState(empty);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState(null); // { ok, text }

  const load = async () => {
    const { data } = await fetchProfiles();
    setProfiles(data || []);
  };
  useEffect(() => { load(); }, []);

  // ----- Ảnh chữ ký của CHÍNH MÌNH (in trên Phiếu điều xe khi phê duyệt) -----
  // Ảnh được thu nhỏ về tối đa 400px ngang, lưu dạng data URI PNG trong profiles.signature_data.
  // Đây là chữ ký ẢNH (chữ ký scan), KHÔNG phải chữ ký số USB token — xem docs/KY-SO.md.
  const [sigBusy, setSigBusy] = useState(false);
  const [sigMsg, setSigMsg] = useState('');
  const me = useMemo(() => profiles.find((x) => x.id === profile?.id) || null, [profiles, profile]);

  const shrinkImage = (file) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Không đọc được tệp ảnh.'));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Tệp không phải ảnh hợp lệ.'));
      img.onload = () => {
        const maxW = 400;
        const scale = Math.min(1, maxW / (img.width || maxW));
        const cv = document.createElement('canvas');
        cv.width = Math.round((img.width || maxW) * scale);
        cv.height = Math.round((img.height || 120) * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/png'));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });

  const pickSignature = async (file) => {
    if (!file || !profile?.id) return;
    setSigBusy(true); setSigMsg('');
    try {
      const data = await shrinkImage(file);
      if (data.length > 400000) throw new Error('Ảnh chữ ký quá lớn — hãy cắt gọn phần chữ ký rồi tải lại.');
      const { error } = await updateProfile(profile.id, { signature_data: data });
      if (error) throw new Error(error.message);
      setSigMsg('Đã lưu ảnh chữ ký.');
      load();
    } catch (e) {
      setSigMsg(e.message);
    }
    setSigBusy(false);
  };

  const clearSignature = async () => {
    if (!profile?.id || !window.confirm('Xóa ảnh chữ ký đang lưu?')) return;
    setSigBusy(true);
    const { error } = await updateProfile(profile.id, { signature_data: null });
    setSigBusy(false);
    setSigMsg(error ? error.message : 'Đã xóa ảnh chữ ký.');
    load();
  };

  const pctLeaders = useMemo(() => (leaders || []).filter((l) => l.leader_type === 'pct'), [leaders]);

  const save = async (p, patch) => {
    setBusy(p.id); setMsg('');
    const { error } = await updateProfile(p.id, patch);
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    setMsg(`Đã cập nhật ${p.email}.`);
    load();
  };

  const toggleBan = (p, banId) => {
    const cur = p.ban_ids || [];
    const next = cur.includes(banId) ? cur.filter((x) => x !== banId) : [...cur, banId];
    save(p, { ban_ids: next });
  };

  const toggleFormBan = (banId) => {
    setForm((f) => {
      const cur = f.ban_ids || [];
      return { ...f, ban_ids: cur.includes(banId) ? cur.filter((x) => x !== banId) : [...cur, banId] };
    });
  };

  const submitCreate = async (e) => {
    e.preventDefault();
    setCreateMsg(null);
    if (!form.email.trim() || !form.password) { setCreateMsg({ ok: false, text: 'Nhập email và mật khẩu.' }); return; }
    if (form.password.length < 6) { setCreateMsg({ ok: false, text: 'Mật khẩu tối thiểu 6 ký tự.' }); return; }
    setCreating(true);
    const { error } = await adminCreateUser({
      email: form.email.trim(), password: form.password,
      full_name: form.full_name, position: form.position,
      role: form.role, ban_ids: form.role === 'cb_ban' ? form.ban_ids : [],
    });
    setCreating(false);
    if (error) { setCreateMsg({ ok: false, text: error.message }); return; }
    setCreateMsg({ ok: true, text: `Đã tạo tài khoản ${form.email.trim()} (đăng nhập ngay bằng email + mật khẩu).` });
    setForm(empty);
    load();
  };

  const sel = 'bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400';
  const input = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[13px] outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition';

  return (
    <div className="space-y-5">
      {/* ===== CHỮ KÝ CỦA TÔI (ký duyệt Phiếu điều xe) ===== */}
      <div className="rounded-xl border border-sky-200 bg-white shadow-sm p-4 space-y-2">
        <p className="flex items-center gap-2 text-[14px] font-bold text-sky-800"><PenTool className="w-4 h-4" /> Ảnh chữ ký của tôi (in trên Phiếu điều xe)</p>
        <p className="text-[12px] text-slate-500">
          Tải ảnh chữ ký (nền trắng, đã cắt gọn). Khi bạn phê duyệt điều xe, ảnh này được in vào ô ký
          của phiếu kèm mã xác thực. Đây là chữ ký ảnh phục vụ lưu hành nội bộ — chữ ký số theo
          USB token của Ban Cơ yếu xem hướng dẫn trong <b>docs/KY-SO.md</b>.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {me?.signature_data
            ? <img src={me.signature_data} alt="Chữ ký" className="h-14 border border-slate-200 rounded bg-white" />
            : <span className="text-[13px] text-slate-400 italic">Chưa có ảnh chữ ký</span>}
          <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-sky-600 hover:bg-sky-700">
            <PenTool className="w-3.5 h-3.5" /> {me?.signature_data ? 'Đổi ảnh chữ ký' : 'Tải ảnh chữ ký'}
            <input type="file" accept="image/*" className="hidden" disabled={sigBusy} onChange={(e) => { pickSignature(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {me?.signature_data && (
            <button onClick={clearSignature} disabled={sigBusy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-rose-700 border border-rose-200 hover:bg-rose-50 disabled:opacity-60">
              <Trash2 className="w-3.5 h-3.5" /> Xóa
            </button>
          )}
          {sigBusy && <Loader2 className="w-4 h-4 animate-spin text-sky-600" />}
          {sigMsg && <span className="text-[12px] text-slate-600">{sigMsg}</span>}
        </div>
      </div>

      {/* ===== TẠO TÀI KHOẢN MỚI ===== */}
      <form onSubmit={submitCreate} className="rounded-xl border border-red-200 bg-white shadow-sm p-4 space-y-3">
        <p className="flex items-center gap-2 text-[14px] font-bold text-red-800"><UserPlus className="w-4 h-4" /> Tạo tài khoản mới</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Email cơ quan <span className="text-rose-600">*</span></label>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="vd: nguyenvana@thanhhoa.gov.vn" className={`${input} mt-1`} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Mật khẩu <span className="text-rose-600">*</span></label>
            <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="tối thiểu 6 ký tự" className={`${input} mt-1`} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Họ và tên</label>
            <input type="text" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Nguyễn Văn A" className={`${input} mt-1`} />
          </div>
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Chức vụ</label>
            <input type="text" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Chuyên viên" className={`${input} mt-1`} />
          </div>
        </div>

        {/* TICK vai trò */}
        <div>
          <label className="text-[11px] font-bold text-slate-500 uppercase">Vai trò (tick chọn 1)</label>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {Object.entries(ROLES).map(([k, v]) => (
              <label key={k} className={`flex items-center gap-2 text-[13px] rounded-lg px-2.5 py-1.5 cursor-pointer border transition ${form.role === k ? 'bg-red-50 border-red-300 text-red-900 font-semibold' : 'bg-white border-slate-200 text-slate-700 hover:border-red-200'}`}>
                <input type="radio" name="new-role" checked={form.role === k} onChange={() => setForm({ ...form, role: k })} className="accent-red-700" />
                {v}
              </label>
            ))}
          </div>
        </div>

        {/* TICK các Ban (chỉ khi cb_ban) */}
        {form.role === 'cb_ban' && (
          <div>
            <label className="text-[11px] font-bold text-slate-500 uppercase">Theo dõi các Ban (tick chọn nhiều)</label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {(bans || []).map((b) => (
                <label key={b.id} className={`flex items-center gap-1 text-[12px] rounded-lg px-2 py-1 cursor-pointer border transition ${form.ban_ids.includes(b.id) ? 'bg-red-50 border-red-300 text-red-900 font-semibold' : 'bg-white border-slate-200 text-slate-600'}`}>
                  <input type="checkbox" checked={form.ban_ids.includes(b.id)} onChange={() => toggleFormBan(b.id)} className="accent-red-700" />
                  {b.short_name || b.name}
                </label>
              ))}
            </div>
          </div>
        )}

        {createMsg && (
          <p className={`text-[13px] font-semibold flex items-center gap-1.5 ${createMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
            {createMsg.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />} {createMsg.text}
          </p>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={creating} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 disabled:opacity-60 shadow">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} {creating ? 'Đang tạo…' : 'Tạo tài khoản'}
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3 text-[12px] text-sky-900 flex items-start gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <p>Tài khoản tạo ở đây <b>xác nhận email tự động</b>, đăng nhập ngay bằng email + mật khẩu. Tính năng cần <b>SUPABASE_SERVICE_ROLE_KEY</b> đã cấu hình trên Vercel. Cán bộ vẫn có thể tự kích hoạt qua <b>"Lần đầu đăng nhập"</b> (magic link) rồi quản trị gán vai trò bên dưới.</p>
      </div>

      {/* ===== PHÂN QUYỀN TÀI KHOẢN ĐÃ CÓ ===== */}
      {msg && <p className="text-[13px] font-semibold text-emerald-700">{msg}</p>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="bg-red-800 text-white text-[12px]">
              <th className="px-3 py-2.5 text-left font-bold">Tài khoản</th>
              <th className="px-3 py-2.5 text-left font-bold">Vai trò</th>
              <th className="px-3 py-2.5 text-left font-bold">Phân công</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map((p) => (
              <tr key={p.id} className="align-top">
                <td className="px-3 py-3">
                  <p className="text-[13px] font-bold text-slate-800 flex items-center gap-1.5"><UserCog className="w-3.5 h-3.5 text-slate-400" /> {p.full_name || '(chưa đặt tên)'}</p>
                  <p className="text-[12px] text-slate-500">{p.email}</p>
                  {p.position && <p className="text-[12px] text-slate-500 italic">{p.position}</p>}
                </td>
                <td className="px-3 py-3">
                  <select value={p.role} disabled={busy === p.id} onChange={(e) => save(p, { role: e.target.value })} className={sel}>
                    {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  {p.role === 'cb_ban' && (
                    <div className="flex flex-wrap gap-1.5">
                      {(bans || []).map((b) => (
                        <label key={b.id} className={`flex items-center gap-1 text-[12px] rounded-lg px-2 py-1 cursor-pointer border transition ${(p.ban_ids || []).includes(b.id) ? 'bg-red-50 border-red-300 text-red-900 font-semibold' : 'bg-white border-slate-200 text-slate-600'}`}>
                          <input type="checkbox" checked={(p.ban_ids || []).includes(b.id)} onChange={() => toggleBan(p, b.id)} disabled={busy === p.id} className="accent-red-700" />
                          {b.short_name || b.name}
                        </label>
                      ))}
                    </div>
                  )}
                  {p.role === 'pct' && (
                    <select value={p.leader_id || ''} disabled={busy === p.id} onChange={(e) => save(p, { leader_id: e.target.value || null })} className={sel}>
                      <option value="">— Gắn với lãnh đạo —</option>
                      {pctLeaders.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
                    </select>
                  )}
                  {!['cb_ban', 'pct'].includes(p.role) && <span className="text-[12px] text-slate-400 italic">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
