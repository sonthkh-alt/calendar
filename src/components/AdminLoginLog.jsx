import { useEffect, useState } from 'react';
import { RotateCcw, Loader2, LogIn } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { fetchLoginLog } from '../lib/api';
import { ROLES } from '../lib/constants';

/**
 * Nhật ký đăng nhập: ai đăng nhập / mở phiên làm việc, lúc nào.
 * Dữ liệu từ bảng login_log (client tự ghi 1 dòng mỗi phiên, bỏ qua tài khoản khách).
 */
export default function AdminLoginLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await fetchLoginLog(300);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-slate-500 flex items-center gap-1.5">
          <LogIn className="w-4 h-4" /> 300 lần đăng nhập gần nhất (không tính tài khoản khách chỉ xem).
        </p>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-slate-700 bg-white/90 border border-slate-200 hover:bg-red-50 shadow-sm">
          <RotateCcw className="w-3.5 h-3.5" /> Làm mới
        </button>
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
              <tr><td colSpan={4} className="px-3 py-6 text-center text-[13px] text-slate-400 italic">Chưa có lần đăng nhập nào được ghi.</td></tr>
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
