import { useMemo, useState } from 'react';
import { Printer, Plus, LayoutGrid, Rows3 } from 'lucide-react';
import EntryCard from './EntryCard';
import { canCreateFor, canEditEntry, canSeeEntry } from '../lib/permissions';
import { weekDays, toISODate, dayName, fmtDM, fmtDMY, weekStart, weekEnd } from '../lib/dates';
import { UNIT_NAME } from '../lib/constants';

/**
 * Lịch tuần kiểu "Lịch công tác tuần" chính quyền.
 * - Chế độ "Đầy đủ": bảng ngày × (Sáng/Chiều) × cột lãnh đạo (nhóm PCT | Ban).
 * - Chế độ "Gọn": mỗi ngày 1 khối, EntryCard kèm tên lãnh đạo (hợp mobile).
 * props: profile, anchor, entries, leaders, bans, vehicles, filters,
 *        onAdd(prefill), onEdit(entry), onDelete(entry)
 */
export default function WeekView({ profile, anchor, entries, leaders, bans, vehicles, filters, onAdd, onEdit, onDelete }) {
  const [mode, setMode] = useState('full'); // full | compact
  const days = useMemo(() => weekDays(anchor), [anchor]);

  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
  const vehicleById = useMemo(() => Object.fromEntries((vehicles || []).map((v) => [v.id, v])), [vehicles]);

  // Cột lãnh đạo hiển thị: PCT trước, rồi từng Ban theo sort_order
  const cols = useMemo(() => {
    let ls = (leaders || []).filter((l) => l.active);
    if (filters.banId) ls = ls.filter((l) => l.ban_id === filters.banId);
    if (filters.leaderId) ls = ls.filter((l) => l.id === filters.leaderId);
    return ls;
  }, [leaders, filters]);

  // Nhóm header: Thường trực | tên các Ban
  const headerGroups = useMemo(() => {
    const groups = [];
    const pct = cols.filter((l) => l.leader_type === 'pct');
    if (pct.length) groups.push({ label: 'Thường trực HĐND tỉnh', span: pct.length });
    for (const b of bans || []) {
      const n = cols.filter((l) => l.ban_id === b.id).length;
      if (n) groups.push({ label: b.short_name || b.name, span: n });
    }
    const vp = cols.filter((l) => l.leader_type === 'vanphong');
    if (vp.length) groups.push({ label: 'Văn phòng', span: vp.length });
    return groups;
  }, [cols, bans]);

  const visible = useMemo(
    () => (entries || []).filter((e) => {
      if (!canSeeEntry(profile, e, leaderById[e.leader_id])) return false;
      if (filters.status && e.status !== filters.status) return false;
      return true;
    }),
    [entries, profile, leaderById, filters.status]
  );

  const cellEntries = (leaderId, dISO, sess) =>
    visible.filter((e) =>
      e.leader_id === leaderId && e.date === dISO &&
      (sess === 'sang'
        ? (e.session === 'sang' || e.session === 'ca_ngay' || (e.session === 'gio' && (e.start_time || '08:00') < '12:00'))
        : (e.session === 'chieu' || (e.session === 'gio' && (e.start_time || '08:00') >= '12:00')))
    );

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
        compact={mode === 'full'}
      />
    );
  };

  const ws = weekStart(anchor), we = weekEnd(anchor);

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
          {canCreateFor && (leaders || []).some((l) => canCreateFor(profile, l)) && (
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
        /* ===== CHẾ ĐỘ ĐẦY ĐỦ: bảng ngày × buổi × lãnh đạo ===== */
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-red-800 text-white">
                <th rowSpan={2} className="border border-red-900/40 px-2 py-2 text-[12px] font-bold w-[90px]">Thứ / Ngày</th>
                <th rowSpan={2} className="border border-red-900/40 px-1 py-2 text-[12px] font-bold w-[52px]">Buổi</th>
                {headerGroups.map((g) => (
                  <th key={g.label} colSpan={g.span} className="border border-red-900/40 px-2 py-1.5 text-[12px] font-bold">{g.label}</th>
                ))}
              </tr>
              <tr className="bg-red-700 text-white">
                {cols.map((l) => (
                  <th key={l.id} className="border border-red-900/30 px-1.5 py-1.5 text-[11px] font-semibold leading-tight" style={{ minWidth: 130 }}>
                    {l.full_name}
                    <span className="block text-[10px] font-normal text-red-100">{l.position}</span>
                  </th>
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
                    {cols.map((l) => {
                      const list = cellEntries(l.id, dISO, sess);
                      const canAdd = canCreateFor(profile, l);
                      return (
                        <td key={l.id} className="border border-slate-200 px-1 py-1 align-top" style={{ minWidth: 130 }}>
                          <div className="space-y-1">
                            {list.map(renderCard)}
                            {canAdd && (
                              <button
                                onClick={() => onAdd?.({ date: d, session: sess, leaderId: l.id })}
                                className="no-print w-full text-center text-slate-300 hover:text-red-600 hover:bg-red-50 rounded text-[14px] leading-5 opacity-0 hover:opacity-100 focus:opacity-100 transition"
                                title={`Thêm lịch ${sess === 'sang' ? 'sáng' : 'chiều'} ${fmtDM(d)} cho ${l.full_name}`}
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
              .filter((e) => e.date === dISO && cols.some((c) => c.id === e.leader_id))
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
