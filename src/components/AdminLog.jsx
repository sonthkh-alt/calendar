import { useEffect, useState } from 'react';
import { RotateCcw, Loader2, History } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { fetchActivityLog } from '../lib/api';
import { STATUS } from '../lib/constants';
import { fmtDMY } from '../lib/dates';

/**
 * Nhật ký thao tác (audit log): ai tạo/sửa/duyệt/từ chối/điều xe/xóa lịch, lúc nào.
 * Dữ liệu từ bảng activity_log (ghi tự động bằng trigger trên schedule_entries).
 */
const ACTION = {
  create: { label: 'Tạo lịch', cls: 'bg-emerald-100 text-emerald-800' },
  status: { label: 'Duyệt / Trạng thái', cls: 'bg-sky-100 text-sky-800' },
  vehicle: { label: 'Điều xe', cls: 'bg-amber-100 text-amber-800' },
  update: { label: 'Chỉnh sửa', cls: 'bg-slate-100 text-slate-700' },
  delete: { label: 'Xóa lịch', cls: 'bg-rose-100 text-rose-800' },
};

const statusLabel = (code) => (code && STATUS[code]?.label) || code || '';

export default function AdminLog() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await fetchActivityLog(300);
    setRows(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-slate-500 flex items-center gap-1.5">
          <History className="w-4 h-4" /> 300 thao tác gần nhất trên lịch (tạo / duyệt / điều chỉnh / từ chối / điều xe / xóa).
        </p>
        <button onClick={load} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-slate-700 bg-white/90 border border-slate-200 hover:bg-red-50 shadow-sm">
          <RotateCcw className="w-3.5 h-3.5" /> Làm mới
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead>
            <tr className="bg-red-800 text-white text-[12px]">
              <th className="px-3 py-2.5 text-left font-bold w-[150px]">Thời gian</th>
              <th className="px-3 py-2.5 text-left font-bold w-[190px]">Người thực hiện</th>
              <th className="px-3 py-2.5 text-left font-bold w-[140px]">Hành động</th>
              <th className="px-3 py-2.5 text-left font-bold">Nội dung lịch</th>
              <th className="px-3 py-2.5 text-left font-bold w-[230px]">Chi tiết</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /> Đang tải…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-[13px] text-slate-400 italic">Chưa có nhật ký nào.</td></tr>
            )}
            {!loading && rows.map((r) => {
              const a = ACTION[r.action] || { label: r.action, cls: 'bg-slate-100 text-slate-700' };
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2 text-[12px] text-slate-600">{r.at ? format(new Date(r.at), 'HH:mm, dd/MM/yyyy', { locale: vi }) : ''}</td>
                  <td className="px-3 py-2 text-[12px] text-slate-700 break-all">{r.actor_email || <span className="italic text-slate-400">Hệ thống</span>}</td>
                  <td className="px-3 py-2"><span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${a.cls}`}>{a.label}</span></td>
                  <td className="px-3 py-2 text-[13px] text-slate-800">
                    <p className="font-medium">{r.content || '—'}</p>
                    {r.entry_date && <p className="text-[11px] text-slate-400">{fmtDMY(new Date(r.entry_date))}</p>}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-slate-600">
                    {r.action === 'status'
                      ? <span>{statusLabel(r.old_status)} → <b>{statusLabel(r.new_status)}</b></span>
                      : (r.summary || '')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
