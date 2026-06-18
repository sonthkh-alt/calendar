import { useEffect, useState } from 'react';
import { RotateCcw, Loader2, LogIn, Eye, Users } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { fetchLoginLog, fetchLoginCount } from '../lib/api';
import { GUEST } from '../lib/auth';
import { ROLES } from '../lib/constants';

/**
 * Nhật ký đăng nhập + thống kê lượt truy cập.
 * - Thẻ tổng quan: tổng lượt truy cập / lượt khách (chỉ xem) / lượt tài khoản thật.
 * - Bảng: 300 lần đăng nhập gần nhất của TÀI KHOẢN THẬT (loại tài khoản khách cho gọn).
 * Dữ liệu từ bảng login_log (client tự ghi 1 dòng mỗi phiên cho mọi tài khoản).
 */
export default function AdminLoginLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [guest, setGuest] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [list, totalRes, guestRes] = await Promise.all([
      fetchLoginLog(300, GUEST.email),   // bảng: bỏ tài khoản khách
      fetchLoginCount(),                 // tổng lượt truy cập
      fetchLoginCount(GUEST.email),      // lượt khách chỉ xem
    ]);
    setRows(list.data || []);
    setTotal(totalRes.count || 0);
    setGuest(guestRes.count || 0);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const real = Math.max(0, total - guest);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-slate-500 flex items-center gap-1.5">
          <LogIn className="w-4 h-4" /> Thống kê truy cập & 300 lần đăng nhập gần nhất của tài khoản thật.
        </p>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-slate-700 bg-white/90 border border-slate-200 hover:bg-red-50 shadow-sm">
          <RotateCcw className="w-3.5 h-3.5" /> Làm mới
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 p-3">
          <Eye className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-[11px] font-semibold opacity-80">Tổng lượt truy cập</p>
            <p className="text-lg font-extrabold leading-tight">{total.toLocaleString('vi-VN')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 p-3">
          <Eye className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-[11px] font-semibold opacity-80">Khách (chỉ xem)</p>
            <p className="text-lg font-extrabold leading-tight">{guest.toLocaleString('vi-VN')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 p-3">
          <Users className="w-5 h-5 shrink-0" />
          <div>
            <p className="text-[11px] font-semibold opacity-80">Tài khoản thật đăng nhập</p>
            <p className="text-lg font-extrabold leading-tight">{real.toLocaleString('vi-VN')}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-red-800 text-white text-[12px]">
              <th className="px-3 py-2.5 text-left font-bold w-[170px]">Thời gian</th>
              <th className="px-3 py-2.5 text-left font-bold">Người đăng nhập</th>
              <th className="px-3 py-2.5 text-left font-bold w-[240px]">Email</th>
              <th className="px-3 py-2.5 text-left font-bold w-[220px]">Vai trò</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Đang tải…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-[13px] text-slate-400 italic">Chưa có lần đăng nhập nào của tài khoản thật.</td></tr>
            )}
            {!loading && rows.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="px-3 py-2 text-[12px] text-slate-600">{r.at ? format(new Date(r.at), 'HH:mm, dd/MM/yyyy', { locale: vi }) : ''}</td>
                <td className="px-3 py-2 text-[13px] text-slate-800 font-medium">{r.full_name || <span className="italic text-slate-400">—</span>}</td>
                <td className="px-3 py-2 text-[12px] text-slate-700 break-all">{r.email}</td>
                <td className="px-3 py-2 text-[12px] text-slate-600">{ROLES[r.role] || r.role || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
