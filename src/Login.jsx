import { useState } from 'react';
import { Mail, LogIn, CheckCircle2, AlertTriangle, Lock, KeyRound, Eye, X } from 'lucide-react';
import { signInWithOtp, signInWithPassword, GUEST } from './lib/auth';
import { APP_NAME, UNIT_NAME, DEMO_NOTICE, CONTACT_INFO } from './lib/constants';

// Theme màn đăng nhập (tông cổ điển — đỏ/vàng).
const t = {
  bg: 'bg-gradient-to-br from-[#5c0f0f] via-[#a51c1c] to-[#7f1d1d]', gridCls: 'tech-grid',
  blob1: 'bg-amber-400/20', blob2: 'bg-rose-500/25',
  eyebrow: 'text-amber-300', title: 'aurora-text', unit: 'text-red-100/90',
  ring: 'ring-amber-300/60',
  card: 'glass border border-white/40', emblem: 'bg-white/95',
  btn: 'bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 shadow-red-900/20',
  link: 'text-red-700 hover:text-red-800', accentIcon: 'text-red-700',
  inputFocus: 'focus-within:border-red-400 focus-within:ring-red-200',
  foot: 'text-red-100/70',
};

// onClose (tùy chọn): khi có -> hiển thị dạng MODAL (đang ở chế độ khách, bấm nút Đăng
// nhập trên trang chủ). Không có -> màn đăng nhập đầy đủ (dự phòng khi chưa có phiên khách).
export default function Login({ onClose }) {
  const isModal = !!onClose;
  const [mode, setMode] = useState('password'); // password | link
  const [email, setEmail] = useState(isModal ? '' : GUEST.email);
  const [password, setPassword] = useState(isModal ? '' : GUEST.password);
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [msg, setMsg] = useState('');

  // Vào nhanh bằng tài khoản khách (chỉ xem)
  const guestLogin = async () => {
    setEmail(GUEST.email); setPassword(GUEST.password);
    setStatus('sending'); setMsg('');
    const { error } = await signInWithPassword(GUEST.email, GUEST.password);
    if (error) {
      setStatus('error');
      setMsg('Tài khoản khách chưa được khởi tạo trên máy chủ. Vui lòng liên hệ quản trị.');
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setStatus('sending'); setMsg('');
    const { error } = await signInWithPassword(email.trim(), password);
    if (error) {
      setStatus('error');
      setMsg(/invalid login/i.test(error.message || '')
        ? 'Email hoặc mật khẩu không đúng. Nếu là lần đầu, hãy nhận liên kết kích hoạt qua email.'
        : (error.message || 'Đăng nhập không thành công.'));
    }
    // Thành công: onAuthChange ở App sẽ tự chuyển trang.
  };

  const submitLink = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending'); setMsg('');
    const { error } = await signInWithOtp(email.trim());
    if (error) { setStatus('error'); setMsg(error.message || 'Không gửi được liên kết đăng nhập.'); }
    else { setStatus('sent'); }
  };

  const switchMode = (m) => { setMode(m); setStatus('idle'); setMsg(''); setPassword(''); };
  const inputWrap = `flex items-center gap-2 bg-white/80 border border-slate-200 rounded-xl px-3 focus-within:ring-2 transition ${t.inputFocus}`;

  return (
    <div className={`${isModal ? 'fixed inset-0 z-[60] overflow-x-hidden overflow-y-auto' : 'min-h-screen relative overflow-hidden'} flex items-center justify-center px-4 py-6`} style={{ fontFamily: "'Be Vietnam Pro', 'Segoe UI', system-ui, sans-serif" }}>
      <div className={`absolute inset-0 ${t.bg}`} />
      {t.gridCls && <div className={`absolute inset-0 ${t.gridCls} opacity-60`} />}
      <div className={`absolute -top-24 right-0 w-96 h-96 rounded-full ${t.blob1} blur-3xl`} />
      <div className={`absolute -bottom-32 -left-16 w-96 h-96 rounded-full ${t.blob2} blur-3xl`} />

      {isModal && (
        <button onClick={onClose} title="Đóng" className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-white/15 hover:bg-white/25 text-white transition">
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="relative w-full max-w-md animate-fadeUp">
        <div className="text-center mb-6">
          <div className={`inline-flex w-24 h-24 rounded-full ${t.emblem} items-center justify-center shadow-2xl ring-2 ${t.ring} emblem-glow animate-floatY p-2.5 mb-4`}>
            <img src="/quoc-huy.svg" alt="Quốc huy Việt Nam" className="w-full h-full object-contain" />
          </div>
          <p className={`text-[11px] font-semibold tracking-[0.25em] uppercase ${t.eyebrow}`}>Hệ thống quản lý lịch công tác</p>
          <h1 className={`text-xl font-extrabold leading-tight mt-1.5 ${t.title}`}>{APP_NAME}</h1>
          <p className={`text-sm mt-1.5 ${t.unit}`}>{UNIT_NAME}</p>
        </div>

        <div className={`rounded-2xl shadow-2xl p-6 text-slate-800 ${t.card}`}>
          {mode === 'link' && status === 'sent' ? (
            <div className="text-center py-4">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h2 className="font-bold text-slate-800">Đã gửi liên kết kích hoạt</h2>
              <p className="text-sm text-slate-600 mt-2">Vui lòng mở email <b className="text-slate-800">{email}</b> và bấm vào liên kết. Sau khi vào, hệ thống sẽ yêu cầu <b>tạo mật khẩu</b> để dùng cho các lần đăng nhập sau.</p>
              <button onClick={() => switchMode('password')} className={`mt-4 text-sm font-semibold hover:underline ${t.link}`}>← Quay lại đăng nhập</button>
            </div>
          ) : mode === 'link' ? (
            <form onSubmit={submitLink} className="space-y-4">
              <div className="flex items-center gap-2 text-slate-700 font-semibold text-sm mb-1"><KeyRound className={`w-4 h-4 ${t.accentIcon}`} /> Lần đầu đăng nhập / Quên mật khẩu</div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Email cơ quan</label>
                <div className={inputWrap}>
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@coquan.gov.vn" className="flex-1 py-2.5 text-sm outline-none bg-transparent" />
                </div>
              </div>
              {status === 'error' && (
                <p className="text-xs text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {msg}</p>
              )}
              <button type="submit" disabled={status === 'sending'} className={`w-full flex items-center justify-center gap-2 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl shadow-lg transition ${t.btn}`}>
                <Mail className="w-4 h-4" /> {status === 'sending' ? 'Đang gửi...' : 'Gửi liên kết qua email'}
              </button>
              <button type="button" onClick={() => switchMode('password')} className={`w-full text-center text-[13px] font-medium text-slate-600 ${t.link}`}>← Đăng nhập bằng mật khẩu</button>
            </form>
          ) : (
            <form onSubmit={submitPassword} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Email cơ quan</label>
                <div className={inputWrap}>
                  <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@coquan.gov.vn" className="flex-1 py-2.5 text-sm outline-none bg-transparent" />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1 block">Mật khẩu</label>
                <div className={inputWrap}>
                  <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="flex-1 py-2.5 text-sm outline-none bg-transparent" />
                </div>
              </div>
              {status === 'error' && (
                <p className="text-xs text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> {msg}</p>
              )}
              {/* Ô tài khoản khách — chỉ hiện ở màn đăng nhập đầy đủ (không hiện trong modal
                  vì đang ở chế độ khách rồi). */}
              {!isModal && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-3">
                  <p className="text-[12px] font-bold text-amber-800 flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Tài khoản khách (chỉ xem)</p>
                  <p className="text-[12px] text-amber-800/90 mt-1">Email: <b>{GUEST.email}</b> · Mật khẩu: <b>{GUEST.password}</b></p>
                  <button type="button" onClick={guestLogin} disabled={status === 'sending'} className="mt-2 w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-[13px] font-semibold py-2 rounded-lg transition">
                    <Eye className="w-3.5 h-3.5" /> Vào xem ngay (chỉ xem)
                  </button>
                </div>
              )}
              <button type="submit" disabled={status === 'sending'} className={`w-full flex items-center justify-center gap-2 disabled:opacity-60 text-white font-semibold py-2.5 rounded-xl shadow-lg transition ${t.btn}`}>
                <LogIn className="w-4 h-4" /> {status === 'sending' ? 'Đang đăng nhập...' : 'Đăng nhập'}
              </button>
              <button type="button" onClick={() => switchMode('link')} className={`w-full text-center text-[13px] font-medium text-slate-600 ${t.link}`}>Lần đầu đăng nhập / Quên mật khẩu?</button>
              <p className="text-[11px] text-slate-500 text-center leading-relaxed">Lần đầu, hãy bấm liên kết ở dòng trên để nhận email kích hoạt và tạo mật khẩu. Chỉ tài khoản được cấp mới truy cập được dữ liệu.</p>
            </form>
          )}
        </div>
        <p className={`text-center text-[12px] font-bold mt-5 ${t.foot}`}>{DEMO_NOTICE}</p>
        <p className={`text-center text-[11px] mt-1 ${t.foot}`}>{CONTACT_INFO}</p>
        <p className={`text-center text-[11px] mt-1 ${t.foot}`}>© {UNIT_NAME}</p>
      </div>
    </div>
  );
}
