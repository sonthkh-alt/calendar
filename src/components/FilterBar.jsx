import { ChevronLeft, ChevronRight, CalendarDays, RotateCcw } from 'lucide-react';
import { STATUS, UNIT_GROUP_FILTERS, leaderInUnit } from '../lib/constants';
import { weekLabel, addWeeks, addMonths, fmtDMY } from '../lib/dates';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

/**
 * Thanh điều hướng thời gian + bộ lọc — dùng chung cho 3 chế độ xem.
 * props: view ('week'|'month'|'day'), anchor (Date), onAnchor,
 *        bans, leaders, filters {banId, leaderId, status}, onFilters
 */
export default function FilterBar({ view, anchor, onAnchor, bans, leaders, filters, onFilters }) {
  const step = view === 'month' ? (d, n) => addMonths(d, n) : view === 'day' ? (d, n) => new Date(d.getTime() + n * 86400000) : (d, n) => addWeeks(d, n);

  const label = view === 'month'
    ? `Tháng ${format(anchor, 'MM/yyyy')}`
    : view === 'day'
      ? `${format(anchor, 'EEEE', { locale: vi })}, ${fmtDMY(anchor)}`
      : weekLabel(anchor);

  const visibleLeaders = (leaders || []).filter((l) => l.active && leaderInUnit(l, filters.banId));
  const sel = 'bg-white/90 border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400';

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

      {/* Bộ lọc */}
      <select value={filters.banId || ''} onChange={(e) => onFilters({ ...filters, banId: e.target.value || null, leaderId: null })} className={sel}>
        <option value="">Tất cả đơn vị</option>
        <option value="grp:pct">{UNIT_GROUP_FILTERS[0].label}</option>
        <option value="grp:doan">{UNIT_GROUP_FILTERS[1].label}</option>
        {(bans || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        <option value="grp:vanphong">{UNIT_GROUP_FILTERS[2].label}</option>
      </select>
      <select value={filters.leaderId || ''} onChange={(e) => onFilters({ ...filters, leaderId: e.target.value || null })} className={sel}>
        <option value="">Tất cả lãnh đạo / Ban</option>
        {visibleLeaders.map((l) => <option key={l.id} value={l.id}>{l.full_name}</option>)}
      </select>
      <select value={filters.status || ''} onChange={(e) => onFilters({ ...filters, status: e.target.value || null })} className={sel}>
        <option value="">Mọi trạng thái</option>
        {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </select>
      {(filters.banId || filters.leaderId || filters.status) && (
        <button onClick={() => onFilters({ banId: null, leaderId: null, status: null })} className="flex items-center gap-1 text-[13px] text-slate-500 hover:text-red-700 font-medium" title="Xóa bộ lọc">
          <RotateCcw className="w-3.5 h-3.5" /> Xóa lọc
        </button>
      )}
    </div>
  );
}
