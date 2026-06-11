import { useMemo } from 'react';
import { STATUS } from '../lib/constants';
import { canSeeEntry } from '../lib/permissions';
import { monthGrid, toISODate, isSameMonth } from '../lib/dates';

const DOW = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

/**
 * Lưới tháng: mỗi ô đếm số mục + chấm màu trạng thái; click ngày -> chuyển DayView.
 * props: profile, anchor, entries, leaders, filters, onPickDay(date)
 */
export default function MonthView({ profile, anchor, entries, leaders, filters, onPickDay }) {
  const weeks = useMemo(() => monthGrid(anchor), [anchor]);
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);

  const visible = useMemo(
    () => (entries || []).filter((e) => {
      const l = leaderById[e.leader_id];
      if (!canSeeEntry(profile, e, l)) return false;
      if (filters.banId && l?.ban_id !== filters.banId) return false;
      if (filters.leaderId && e.leader_id !== filters.leaderId) return false;
      if (filters.status && e.status !== filters.status) return false;
      return true;
    }),
    [entries, profile, leaderById, filters]
  );

  const byDate = useMemo(() => {
    const m = {};
    for (const e of visible) (m[e.date] ||= []).push(e);
    return m;
  }, [visible]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="grid grid-cols-7 bg-red-800 text-white">
        {DOW.map((d) => <div key={d} className="px-2 py-2 text-center text-[12px] font-bold border-r border-red-900/30 last:border-r-0">{d}</div>)}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-t border-slate-100">
          {week.map((d) => {
            const dISO = toISODate(d);
            const inMonth = isSameMonth(d, anchor);
            const isToday = dISO === toISODate(new Date());
            const list = byDate[dISO] || [];
            const counts = {};
            for (const e of list) counts[e.status] = (counts[e.status] || 0) + 1;
            return (
              <button
                key={dISO}
                onClick={() => onPickDay?.(d)}
                className={`min-h-[92px] p-1.5 text-left border-r border-slate-100 last:border-r-0 transition hover:bg-red-50/60
                  ${inMonth ? 'bg-white' : 'bg-slate-50/70'} ${isToday ? 'ring-2 ring-inset ring-amber-300 bg-amber-50/50' : ''}`}
              >
                <p className={`text-[12px] font-bold ${inMonth ? 'text-slate-700' : 'text-slate-300'} ${isToday ? 'text-amber-700' : ''}`}>{d.getDate()}</p>
                {list.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    <p className="text-[11px] font-semibold text-slate-600">{list.length} mục</p>
                    <div className="flex flex-wrap gap-0.5">
                      {Object.entries(counts).map(([st, n]) => (
                        <span key={st} title={`${STATUS[st]?.label}: ${n}`} className="flex items-center gap-0.5">
                          {Array.from({ length: Math.min(n, 4) }, (_, i) => (
                            <span key={i} className={`w-1.5 h-1.5 rounded-full ${STATUS[st]?.dot}`} />
                          ))}
                        </span>
                      ))}
                    </div>
                    {list.slice(0, 2).map((e) => (
                      <p key={e.id} className="text-[10px] text-slate-500 truncate leading-tight">• {e.content}</p>
                    ))}
                    {list.length > 2 && <p className="text-[10px] text-slate-400">+{list.length - 2} mục khác...</p>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
