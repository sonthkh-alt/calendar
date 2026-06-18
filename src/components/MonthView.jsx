import { useMemo } from 'react';
import { STATUS, leaderInUnits } from '../lib/constants';
import { canSeeEntry } from '../lib/permissions';
import { monthGrid, toISODate, isSameMonth, solarToLunar } from '../lib/dates';

const DOW = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

/**
 * Lưới tháng: mỗi ô đếm số mục + chấm màu trạng thái; click ngày -> chuyển DayView.
 * props: profile, anchor, entries, leaders, filters, onPickDay(date)
 */
export default function MonthView({ profile, anchor, entries, leaders, truongBanIds, filters, onPickDay }) {
  const weeks = useMemo(() => monthGrid(anchor), [anchor]);
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);

  const visible = useMemo(
    () => (entries || []).filter((e) => {
      const l = leaderById[e.leader_id];
      if (!canSeeEntry(profile, e, l)) return false;
      if (!leaderInUnits(l, filters.banIds, { truongBanIds })) return false;
      if (filters.leaderId && e.leader_id !== filters.leaderId) return false;
      if (filters.status && e.status !== filters.status) return false;
      return true;
    }),
    [entries, profile, leaderById, truongBanIds, filters]
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
            // Gộp các mục giống nhau (nhóm nhiều đơn vị) -> đếm theo SỰ KIỆN, không trùng
            const seen = new Set();
            const list = (byDate[dISO] || []).filter((e) => {
              const k = `${e.content}|${e.session}|${e.start_time || ''}|${(e.location || '').trim().toLowerCase()}`;
              if (seen.has(k)) return false;
              seen.add(k); return true;
            });
            // Số âm lịch (mùng 1 hiện thêm tháng âm): màu xanh nhẹ
            const lunar = solarToLunar(d);
            const lunarLabel = lunar.day === 1 ? `${lunar.day}/${lunar.month}` : `${lunar.day}`;
            const MAX = 8;
            return (
              <button
                key={dISO}
                onClick={() => onPickDay?.(d)}
                className={`min-h-[150px] p-1.5 text-left align-top border-r border-slate-100 last:border-r-0 transition hover:bg-red-50/60
                  ${inMonth ? 'bg-white' : 'bg-slate-50/70'} ${isToday ? 'ring-2 ring-inset ring-amber-300 bg-amber-50/50' : ''}`}
              >
                <div className="relative mb-0.5 h-4">
                  {/* Dương lịch: ở giữa, trên cùng */}
                  <span className={`block text-center text-[14px] font-bold leading-4 ${inMonth ? 'text-slate-700' : 'text-slate-300'} ${isToday ? 'text-amber-700' : ''}`}>{d.getDate()}</span>
                  {/* Âm lịch: cùng hàng, sát mép phải */}
                  <span className={`absolute top-0 right-0 text-[10px] font-semibold leading-4 ${inMonth ? 'text-sky-500' : 'text-sky-300'}`} title="Âm lịch">{lunarLabel}</span>
                </div>
                {list.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {list.slice(0, MAX).map((e) => (
                      <p key={e.id} className="flex items-center gap-1 text-[10px] text-slate-600 leading-tight">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS[e.status]?.dot}`} />
                        <span className="truncate min-w-0">{e.content}</span>
                      </p>
                    ))}
                    {list.length > MAX && <p className="text-[10px] text-slate-400 leading-tight pl-2.5">…</p>}
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
