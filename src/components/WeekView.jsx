import { useMemo, useState } from 'react';
import { Printer, Plus, LayoutGrid, Rows3 } from 'lucide-react';
import EntryCard from './EntryCard';
import { canCreateFor, canEditEntry, canSeeEntry } from '../lib/permissions';
import { weekDays, toISODate, dayName, fmtDM, fmtDMY, weekStart, weekEnd } from '../lib/dates';
import { UNIT_NAME, PCT_GROUP_LABEL, DOAN_GROUP_LABEL } from '../lib/constants';

/**
 * Lịch tuần kiểu "Lịch công tác tuần" chính quyền — CỘT THEO ĐƠN VỊ:
 * 1 cột "Lãnh đạo HĐND tỉnh" (gộp lịch các PCT) + mỗi Ban 1 cột.
 * Tên người tham gia ghi ngay trong Nội dung, không hiện trên tiêu đề cột.
 * - Chế độ "Đầy đủ": bảng ngày × (Sáng/Chiều) × cột đơn vị.
 * - Chế độ "Gọn": mỗi ngày 1 khối (hợp mobile).
 */
export default function WeekView({ profile, anchor, entries, leaders, bans, vehicles, filters, onAdd, onEdit, onDelete, onView }) {
  const [mode, setMode] = useState('full'); // full | compact
  const days = useMemo(() => weekDays(anchor), [anchor]);

  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
  const vehicleById = useMemo(() => Object.fromEntries((vehicles || []).map((v) => [v.id, v])), [vehicles]);

  // Cột đơn vị: Lãnh đạo HĐND tỉnh (gộp PCT) | từng Ban | Văn phòng (nếu bật)
  const units = useMemo(() => {
    const active = (leaders || []).filter((l) => l.active);
    const pick = (ls) => (filters.leaderId ? ls.filter((l) => l.id === filters.leaderId) : ls);
    const out = [];

    if (!filters.banId) {
      const pct = pick(active.filter((l) => l.leader_type === 'pct'));
      if (pct.length) out.push({ key: 'pct', label: PCT_GROUP_LABEL, leaderIds: pct.map((l) => l.id) });
      const doan = pick(active.filter((l) => l.leader_type === 'doan'));
      if (doan.length) out.push({ key: 'doan', label: DOAN_GROUP_LABEL, leaderIds: doan.map((l) => l.id) });
    }
    for (const b of bans || []) {
      if (filters.banId && filters.banId !== b.id) continue;
      const ls = pick(active.filter((l) => l.ban_id === b.id));
      if (ls.length) out.push({ key: b.id, label: b.name, leaderIds: ls.map((l) => l.id) });
    }
    if (!filters.banId) {
      const vp = pick(active.filter((l) => l.leader_type === 'vanphong'));
      if (vp.length) out.push({ key: 'vp', label: 'Lãnh đạo Văn phòng', leaderIds: vp.map((l) => l.id) });
    }
    return out;
  }, [leaders, bans, filters.banId, filters.leaderId]);

  const visible = useMemo(
    () => (entries || []).filter((e) => {
      if (!canSeeEntry(profile, e, leaderById[e.leader_id])) return false;
      if (filters.status && e.status !== filters.status) return false;
      return true;
    }),
    [entries, profile, leaderById, filters.status]
  );

  const inSession = (e, sess) =>
    sess === 'sang'
      ? (e.session === 'sang' || e.session === 'ca_ngay' || (e.session === 'gio' && (e.start_time || '08:00') < '12:00'))
      : (e.session === 'chieu' || (e.session === 'gio' && (e.start_time || '08:00') >= '12:00'));

  const cellEntries = (unit, dISO, sess) =>
    visible.filter((e) => unit.leaderIds.includes(e.leader_id) && e.date === dISO && inSession(e, sess));

  const renderCard = (e) => {
    const leader = leaderById[e.leader_id];
    return (
      <EntryCard
        key={e.id}
        entry={e}
        leader={leader}
        vehicle={e.vehicle_id ? vehicleById[e.vehicle_id] : null}
        showLeader={mode === 'compact'}
        canEdit={canEditEntry(profile, e, leader)}
        onEdit={onEdit}
        onDelete={onDelete}
        onView={onView}
        compact={mode === 'full'}
      />
    );
  };

  const ws = weekStart(anchor), we = weekEnd(anchor);
  const allUnitLeaderIds = units.flatMap((u) => u.leaderIds);

  return (
    <div className="print-root">
      {/* Tiêu đề khi in */}
      <div className="print-header">
        <p style={{ fontSize: 13 }}>{UNIT_NAME.toUpperCase()}</p>
        <p style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>LỊCH CÔNG TÁC TUẦN</p>
        <p style={{ fontSize: 13, fontStyle: 'italic' }}>Từ ngày {fmtDMY(ws)} đến ngày {fmtDMY(we)}</p>
      </div>

      {/* Thanh công cụ */}
      <div className="no-print flex items-center justify-between mb-2">
        <div className="flex items-center gap-1 bg-white/90 border border-slate-200 rounded-lg p-0.5">
          <button onClick={() => setMode('full')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold transition ${mode === 'full' ? 'bg-red-700 text-white' : 'text-slate-600 hover:bg-red-50'}`}><LayoutGrid className="w-3.5 h-3.5" /> Đầy đủ</button>
          <button onClick={() => setMode('compact')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold transition ${mode === 'compact' ? 'bg-red-700 text-white' : 'text-slate-600 hover:bg-red-50'}`}><Rows3 className="w-3.5 h-3.5" /> Gọn</button>
        </div>
        <div className="flex items-center gap-2">
          {(leaders || []).some((l) => canCreateFor(profile, l)) && (
            <button onClick={() => onAdd?.({})} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 shadow">
              <Plus className="w-4 h-4" /> Thêm lịch
            </button>
          )}
          <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-slate-700 bg-white/90 border border-slate-200 hover:bg-red-50 shadow-sm">
            <Printer className="w-4 h-4" /> In lịch tuần
          </button>
        </div>
      </div>

      {mode === 'full' ? (
        /* ===== CHẾ ĐỘ ĐẦY ĐỦ: bảng ngày × buổi × đơn vị ===== */
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse min-w-[860px]">
            <thead>
              <tr className="bg-red-800 text-white">
                <th className="border border-red-900/40 px-2 py-2.5 text-[12px] font-bold w-[90px]">Thứ / Ngày</th>
                <th className="border border-red-900/40 px-1 py-2.5 text-[12px] font-bold w-[52px]">Buổi</th>
                {units.map((u) => (
                  <th key={u.key} className="border border-red-900/40 px-2 py-2.5 text-[12px] font-bold" style={{ minWidth: 150 }}>{u.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d) => {
                const dISO = toISODate(d);
                const isToday = dISO === toISODate(new Date());
                return ['sang', 'chieu'].map((sess, si) => (
                  <tr key={dISO + sess} className={isToday ? 'bg-amber-50/60' : si === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    {si === 0 && (
                      <td rowSpan={2} className={`border border-slate-200 px-2 py-2 text-center align-middle ${isToday ? 'bg-amber-100/70' : 'bg-slate-50'}`}>
                        <p className="text-[12px] font-bold text-red-800">{dayName(d)}</p>
                        <p className="text-[12px] text-slate-600">{fmtDM(d)}</p>
                        {isToday && <span className="no-print inline-block mt-1 text-[9px] font-bold text-amber-700 bg-amber-200 rounded px-1">HÔM NAY</span>}
                      </td>
                    )}
                    <td className="border border-slate-200 px-1 py-1.5 text-center text-[11px] font-semibold text-slate-500">{sess === 'sang' ? 'Sáng' : 'Chiều'}</td>
                    {units.map((u) => {
                      const list = cellEntries(u, dISO, sess);
                      // Được thêm nếu có quyền với ít nhất một đối tượng của cột
                      const addable = u.leaderIds.filter((id) => canCreateFor(profile, leaderById[id]));
                      return (
                        <td key={u.key} className="border border-slate-200 px-1 py-1 align-top" style={{ minWidth: 150 }}>
                          <div className="space-y-1">
                            {list.map(renderCard)}
                            {addable.length > 0 && (
                              <button
                                onClick={() => onAdd?.({ date: d, session: sess, leaderId: addable.length === 1 ? addable[0] : null })}
                                className="no-print w-full text-center text-slate-300 hover:text-red-600 hover:bg-red-50 rounded text-[14px] leading-5 opacity-0 hover:opacity-100 focus:opacity-100 transition"
                                title={`Thêm lịch ${sess === 'sang' ? 'sáng' : 'chiều'} ${fmtDM(d)} — ${u.label}`}
                              >+</button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ===== CHẾ ĐỘ GỌN: mỗi ngày một khối ===== */
        <div className="space-y-3">
          {days.map((d) => {
            const dISO = toISODate(d);
            const isToday = dISO === toISODate(new Date());
            const dayEntries = visible
              .filter((e) => e.date === dISO && allUnitLeaderIds.includes(e.leader_id))
              .sort((a, b) => (a.session === b.session ? (a.start_time || '').localeCompare(b.start_time || '') : a.session.localeCompare(b.session)));
            return (
              <div key={dISO} className={`rounded-xl border bg-white shadow-sm overflow-hidden ${isToday ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'}`}>
                <div className={`px-3 py-2 flex items-center justify-between ${isToday ? 'bg-amber-50' : 'bg-slate-50'}`}>
                  <p className="text-[13px] font-bold text-red-800">{dayName(d)} <span className="text-slate-500 font-medium">{fmtDMY(d)}</span></p>
                  {isToday && <span className="text-[10px] font-bold text-amber-700 bg-amber-200 rounded px-1.5 py-0.5">HÔM NAY</span>}
                </div>
                <div className="p-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {dayEntries.length === 0 && <p className="text-[12px] text-slate-400 italic col-span-full">Không có lịch.</p>}
                  {dayEntries.map(renderCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
