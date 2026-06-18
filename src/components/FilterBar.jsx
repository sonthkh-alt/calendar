import { useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, RotateCcw, ChevronDown } from 'lucide-react';
import { STATUS, UNIT_GROUP_FILTERS, TRUONG_BAN_FILTER_KEY, TRUONG_BAN_GROUP_NAME, leaderInUnits } from '../lib/constants';
import { weekLabel, addWeeks, addMonths, fmtDMY } from '../lib/dates';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

/**
 * Thanh điều hướng thời gian + bộ lọc — dùng chung cho 3 chế độ xem.
 * props: view ('week'|'month'|'day'), anchor (Date), onAnchor,
 *        bans, leaders, filters {banIds[], leaderId, status}, onFilters
 */
export default function FilterBar({ view, anchor, onAnchor, bans, leaders, truongBanIds, filters, onFilters }) {
  const [unitOpen, setUnitOpen] = useState(false);
  const unitCtx = { truongBanIds };
  const step = view === 'month' ? (d, n) => addMonths(d, n) : view === 'day' ? (d, n) => new Date(d.getTime() + n * 86400000) : (d, n) => addWeeks(d, n);

  const label = view === 'month'
    ? `Tháng ${format(anchor, 'MM/yyyy')}`
    : view === 'day'
      ? `${format(anchor, 'EEEE', { locale: vi })}, ${fmtDMY(anchor)}`
      : weekLabel(anchor);

  const banIds = filters.banIds || [];
  const visibleLeaders = (leaders || []).filter((l) => l.active && leaderInUnits(l, banIds, unitCtx));
  const sel = 'bg-white/90 border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400';

  // Danh sách đơn vị chọn được (theo đúng thứ tự hiển thị trên lịch). Thêm "Trưởng các
  // Ban HĐND tỉnh" (chỉ khi nhóm cùng tên có thành viên) — lọc riêng các đ/c Trưởng Ban.
  const unitOptions = [
    { key: 'grp:pct', label: UNIT_GROUP_FILTERS[0].label },
    { key: 'grp:doan', label: UNIT_GROUP_FILTERS[1].label },
    ...(bans || []).map((b) => ({ key: b.id, label: b.name })),
    ...((truongBanIds && truongBanIds.size) ? [{ key: TRUONG_BAN_FILTER_KEY, label: TRUONG_BAN_GROUP_NAME }] : []),
    { key: 'grp:vanphong', label: UNIT_GROUP_FILTERS[2].label },
  ];
  const toggleUnit = (key) => {
    const set = new Set(banIds);
    if (set.has(key)) set.delete(key); else set.add(key);
    onFilters({ ...filters, banIds: [...set], leaderId: null });
  };
  const unitSummary = banIds.length === 0
    ? 'Tất cả đơn vị'
    : unitOptions.filter((o) => banIds.includes(o.key)).map((o) => o.label).join(', ');

  return (
    <div className="no-print flex flex-wrap items-center gap-2 mb-3">
      {/* Điều hướng thời gian */}
      <div className="flex items-center gap-1 bg-white/90 border border-slate-200 rounded-xl px-1 py-1 shadow-sm">
        <button onClick={() => onAnchor(step(anchor, -1))} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-600" title="Trước"><ChevronLeft className="w-4 h-4" /></button>
        <span className="px-2 text-[13px] font-bold text-slate-800 capitalize min-w-[180px] text-center">{label}</span>
        <button onClick={() => onAnchor(step(anchor, 1))} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-600" title="Sau"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <button onClick={() => onAnchor(new Date())} className="flex items-center gap-1 bg-white/90 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-red-50 shadow-sm">
        <CalendarDays className="w-3.5 h-3.5" /> Hôm nay
      </button>
      {view === 'week' && (
        <button onClick={() => onAnchor(addWeeks(new Date(), 1))} className="bg-white/90 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] font-semibold text-slate-700 hover:bg-red-50 shadow-sm" title="Nhập lịch tuần kế tiếp (cập nhật thứ Sáu hàng tuần)">
          Tuần sau →
        </button>
      )}

      <div className="flex-1" />

      {/* Bộ lọc — ĐƠN VỊ chọn NHIỀU (checkbox) */}
      <div className="relative">
        <button onClick={() => setUnitOpen((o) => !o)} className={`${sel} flex items-center gap-1.5`} title="Chọn một hoặc nhiều đơn vị để xem cùng lúc">
          <span className="max-w-[200px] truncate">{unitSummary}</span>
          {banIds.length > 0 && <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-700 text-white text-[10px] font-bold">{banIds.length}</span>}
          <ChevronDown className="w-3.5 h-3.5 shrink-0 text-slate-400" />
        </button>
        {unitOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setUnitOpen(false)} />
            <div className="absolute z-20 mt-1 w-60 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl p-1.5">
              {unitOptions.map((o) => (
                <label key={o.key} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-red-50 cursor-pointer text-[13px] text-slate-700">
                  <input type="checkbox" checked={banIds.includes(o.key)} onChange={() => toggleUnit(o.key)} className="accent-red-700 w-4 h-4" />
                  {o.label}
                </label>
              ))}
              {banIds.length > 0 && (
                <button onClick={() => onFilters({ ...filters, banIds: [], leaderId: null })} className="w-full mt-1 px-2 py-1.5 rounded-md text-[12px] font-semibold text-slate-500 hover:bg-slate-100 text-left">
                  Bỏ chọn tất cả (xem mọi đơn vị)
                </button>
              )}
            </div>
          </>
        )}
      </div>
      <select value={filters.leaderId || ''} onChange={(e) => onFilters({ ...filters, leaderId: e.target.value || null })} className={sel}>
        <option value="">Tất cả lãnh đạo / Ban</option>
        {visibleLeaders.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
      </select>
      <select value={filters.status || ''} onChange={(e) => onFilters({ ...filters, status: e.target.value || null })} className={sel}>
        <option value="">Mọi trạng thái</option>
        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      {(banIds.length > 0 || filters.leaderId || filters.status) && (
        <button onClick={() => onFilters({ banIds: [], leaderId: null, status: null })} className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-red-700 font-medium" title="Xóa bộ lọc">
          <RotateCcw className="w-3.5 h-3.5" /> Xóa lọc
        </button>
      )}
    </div>
  );
}
