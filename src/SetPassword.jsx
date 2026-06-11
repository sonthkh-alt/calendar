import { useState } from 'react';
import { Lock, ShieldCheck, AlertTriangle, X, User, Briefcase } from 'lucide-react';
import { setPassword as savePassword, signOut, updateMyProfileInfo } from './lib/auth';
import { APP_NAME } from './lib/constants';

/**
 * Màn tạo / đổi mật khẩu.
 * - mode 'create' (mặc định): bắt buộc tạo mật khẩu lần đầu (toàn màn hình), không có nút đóng.
 *   Lần đầu còn yêu cầu nhập Họ tên + Chức vụ -> cập nhật vào profiles.
 * - mode 'change': đổi mật khẩu, hiển thị dạng hộp thoại, có nút đóng (onClose).
 */
export default function SetPassword({ unit, email, mode = 'create', onDone, onClose }) {
  const isChange = mode === 'change';
  const [name, setName] = useState('');
  const [position, setPosition] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [status, setStatus] = useState('idle'); // idle | saving | error | done
  const [msg, setMsg] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!isChange && (!name.trim() || !position.trim())) { setStatus('error'); setMsg('Vui lòng nhập đầy đủ Họ và tên và Chức vụ.'); return; }
    if (pw.length < 6) { setStatus('error'); setMsg('Mật khẩu phải có ít nhất 6 ký tự.'); return; }
    if (pw !== pw2) { setStatus('error'); setMsg('Hai lần nhập mật khẩu chưa khớp.'); return; }
    setStatus('saving'); setMsg('');
    const profile = isChange ? undefined : { name: name.trim(), position: position.trim() };
    const { error } = await savePassword(pw, profile);
    if (error) { setStatus('error'); setMsg(error.message || 'Không lưu được mật khẩu.'); return; }
    if (!isChange) await updateMyProfileInfo({ name: name.trim(), position: position.trim() });
    setStatus('done');
    if (onDone) onDone();
  };

  const card = (
    <div className="relative w-full max-w-md animate-fadeUp">
      {!isChange && (
        <div className="text-center mb-6">
          <div className="inline-flex w-20 h-20 rounded-full bg-white/95 items-center justify-center shadow-2xl ring-2 ring-amber-300/60 emblem-glow animate-floatY p-2 mb-3">
            <img src="/quoc-huy.svg" alt="Quốc huy Việt Nam" className="w-full h-full object-contain" />
          </div>
          <p className="text-amber-300 text-[11px] font-semibold tracking-[0.25em] uppercase">{APP_NAME}</p>
          <h1 className="text-xl font-extrabold leading-tight aurora-text mt-1">Tạo mật khẩu đăng nhập</h1>
          <p className="text-red-100/90 text-sm mt-1.5">{unit}</p>
        </div>
      )}

      <div className="glass rounded-2xl shadow-2xl border border-white/40 p-6 text-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-slate-700 font-bold"><ShieldCheck className="w-5 h-5 text-red-700" /> {isChange ? 'Đổi mật khẩu' : 'Đặt mật khẩu lần đầu'}</div>
          {isChange && onClose && <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>}
        </div>
        {!isChange && (
          <p className="text-[13px] text-slate-600 mb-4">Đây là lần đầu bạn đăng nhập{email ? <> với email <b className="text-slate-800">{email}</b></> : ''}. Vui lòng nhập <b>Họ tên</b>, <b>Chức vụ</b> và <b>tạo mật khẩu</b> để dùng cho các lần đăng nhập sau.</p>
        )}

        <form onSubmit={submit} className="space-y-4">
          {!isChange && (
            <>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Họ và tên</label>
                <div className="flex items-center gap-2 bg-white/80 border border-slate-200 rounded-xl px-3 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-200 transition">
                  <User className="w-4 h-4 text-slate-400 shrink-0" />
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Nguyễn Văn A" className="flex-1 py-2.5 text-sm outline-none bg-transparent" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Chức vụ / Vị trí việc làm</label>
                <div className="flex items-center gap-2 bg-white/80 border border-slate-200 rounded-xl px-3 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-200 transition">
                  <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
                  <input type="text" required value={position} onChange={(e) => setPosition(e.target.value)} placeholder="VD: Chuyên viên" className="flex-1 py-2.5 text-sm outline-none bg-transparent" />
                </div>
              </div>
            </>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Mật khẩu mới</label>
            <div className="flex items-center gap-2 bg-white/80 border border-slate-200 rounded-xl px-3 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-200 transition">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              <input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Ít nhất 6 ký tự" className="flex-1 py-2.5 text-sm outline-none bg-transparent" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 mb-1 block">Nhập lại mật khẩu</label>
            <div className="flex items-center gap-2 bg-white/80 border border-slate-200 rounded-xl px-3 focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-200 transition">
              <Lock className="w-4 h-4 text-slate-400 shrink-0" />
              <input type="password" required value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="••••••••" className="flex-1 py-2.5 text-sm outline-none bg-transparent" />
            </div>
          </div>
          {status === 'error' && (
            <p className="text-xs text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {msg}</p>
          )}
          {status === 'done' && isChange && (
            <p className="text-xs text-emerald-600 flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Đã đổi mật khẩu thành công.</p>
          )}
          <button type="submit" disabled={status === 'saving'} className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl shadow-lg shadow-red-900/20 transition">
            <ShieldCheck className="w-4 h-4" /> {status === 'saving' ? 'Đang lưu...' : (isChange ? 'Cập nhật mật khẩu' : 'Tạo mật khẩu & vào hệ thống')}
          </button>
          {!isChange && (
            <button type="button" onClick={signOut} className="w-full text-center text-[13px] text-slate-500 hover:text-red-700 font-medium">Đăng nhập bằng tài khoản khác</button>
          )}
        </form>
      </div>
    </div>
  );

  if (isChange) {
    // Hộp thoại đổi mật khẩu (phủ lên ứng dụng)
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
        <div className="relative">{card}</div>
      </div>
    );
  }

  // Toàn màn hình bắt buộc (cùng phong cách trang Login)
  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 text-white" style={{ fontFamily: "'Be Vietnam Pro', 'Segoe UI', system-ui, sans-serif" }}>
      <div className="absolute inset-0 bg-gradient-to-br from-[#5c0f0f] via-[#a51c1c] to-[#7f1d1d]" />
      <div className="absolute inset-0 tech-grid opacity-60" />
      <div className="absolute -top-24 right-0 w-96 h-96 rounded-full bg-amber-400/20 blur-3xl" />
      <div className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-rose-500/25 blur-3xl" />
      {card}
    </div>
  );
}
