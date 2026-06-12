import { useEffect, useMemo, useState } from 'react';
import { Printer, Plus, LayoutGrid, Rows3, CalendarDays } from 'lucide-react';
import EntryCard from './EntryCard';
import WeekPrintSheet from './WeekPrintSheet';
import { canCreateFor, canEditEntry, canSeeEntry } from '../lib/permissions';
import { weekDays, toISODate, dayName, fmtDM, fmtDMY } from '../lib/dates';
import { PCT_GROUP_LABEL, DOAN_GROUP_LABEL, isHqLocation, hidesDriver, makeEntrySorter } from '../lib/constants';
import { printPage } from '../lib/print';

/**
 * Lịch tuần kiểu "Lịch công tác tuần" chính quyền — CỘT THEO ĐƠN VỊ:
 * 1 cột "Lãnh đạo HĐND tỉnh" (gộp lịch các PCT) + mỗi Ban 1 cột.
 * Tên người tham gia ghi ngay trong Nội dung, không hiện trên tiêu đề cột.
 * - Chế độ "Đầy đủ": bảng ngày × (Sáng/Chiều) × cột đơn vị.
 * - Chế độ "Gọn": mỗi ngày 1 khối (hợp mobile).
 */
export default function WeekView({ profile, anchor, entries, leaders, bans, vehicles, groups, filters, dupMap, communeMap, isMobile, onAdd, onEdit, onDelete, onDeleteMany, onDuplicate, onView }) {
  const [mode, setMode] = useState(isMobile ? 'compact' : 'full'); // full | compact
  // Điện thoại: luôn dùng chế độ Gọn (khối từng ngày, kéo dọc) cho dễ xem
  useEffect(() => { if (isMobile) setMode('compact'); }, [isMobile]);
  const effMode = isMobile ? 'compact' : mode;
  const days = useMemo(() => weekDays(anchor), [anchor]);

  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
  const vehicleById = useMemo(() => Object.fromEntries((vehicles || []).map((v) => [v.id, v])), [vehicles]);
  // Sắp xếp trong ngày: Sáng->Chiều, rồi theo STT nhóm/lãnh đạo (xem makeEntrySorter)
  const entrySorter = useMemo(() => makeEntrySorter(leaders, groups), [leaders, groups]);
  // Xe riêng theo lãnh đạo (PCT / Phó Trưởng Đoàn): hiện lái xe mặc định khi entry chưa gán xe
  const dedicatedByLeader = useMemo(() => Object.fromEntries(
    (vehicles || []).filter((v) => v.active && v.vehicle_type === 'rieng' && v.assigned_leader_id)
      .map((v) => [v.assigned_leader_id, v])
  ), [vehicles]);

  // Cột đơn vị: Lãnh đạo HĐND tỉnh (gộp PCT) | từng Ban | Văn phòng (nếu bật)
  const units = useMemo(() => {
    const active = (leaders || []).filter((l) => l.active);
    const pick = (ls) => (filters.leaderId ? ls.filter((l) => l.id === filters.leaderId) : ls);
    const bid = filters.banId;
    // hiện nhóm cột leader_type khi: không lọc, hoặc lọc đúng nhóm 'grp:<type>'
    const wantGroup = (t) => !bid || bid === 'grp:' + t;
    const out = [];

    if (wantGroup('pct')) {
      const pct = pick(active.filter((l) => l.leader_type === 'pct'));
      if (pct.length) out.push({ key: 'pct', label: PCT_GROUP_LABEL, leaderIds: pct.map((l) => l.id) });
    }
    if (wantGroup('doan')) {
      const doan = pick(active.filter((l) => l.leader_type === 'doan'));
      if (doan.length) out.push({ key: 'doan', label: DOAN_GROUP_LABEL, leaderIds: doan.map((l) => l.id) });
    }
    for (const b of bans || []) {
      if (bid && bid !== b.id) continue;
      const ls = pick(active.filter((l) => l.ban_id === b.id));
      if (ls.length) out.push({ key: b.id, label: b.name, leaderIds: ls.map((l) => l.id) });
    }
    if (wantGroup('vanphong')) {
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

  const allUnitLeaderIds = units.flatMap((u) => u.leaderIds);

  // Chế độ GỌN: gộp các mục giống nhau (cùng nội dung + buổi/giờ + địa điểm,
  // khác lãnh đạo/thành phần) thành MỘT thẻ — lãnh đạo và thành phần nối lại.
  const mergeEntries = (list) => {
    const map = new Map();
    const out = [];
    for (const e of list) {
      const key = `${e.content}|${e.session}|${e.start_time || ''}|${(e.location || '').trim().toLowerCase()}`;
      const m = map.get(key);
      if (!m) {
        const item = { orig: e, ids: [e.id], leaderIds: [e.leader_id], parts: e.participants ? [e.participants] : [], vehicleIds: e.vehicle_id ? [e.vehicle_id] : [] };
        map.set(key, item); out.push(item);
      } else {
        m.ids.push(e.id);
        if (!m.leaderIds.includes(e.leader_id)) m.leaderIds.push(e.leader_id);
        if (e.participants && !m.parts.includes(e.participants)) m.parts.push(e.participants);
        if (e.vehicle_id && !m.vehicleIds.includes(e.vehicle_id)) m.vehicleIds.push(e.vehicle_id);
      }
    }
    return out;
  };

  const renderMergedCard = (m, compact) => {
    const orig = m.orig;
    const lead = leaderById[orig.leader_id];
    const names = m.leaderIds.map((id) => leaderById[id]?.full_name).filter(Boolean);
    const veh = hidesDriver(lead?.leader_type) ? null : ((m.vehicleIds[0] ? vehicleById[m.vehicleIds[0]] : null) || (!isHqLocation(orig.location) ? dedicatedByLeader[orig.leader_id] : null) || null);
    return (
      <EntryCard
        key={orig.id}
        entry={{ ...orig, participants: m.parts.join('; ') }}
        leader={lead ? { ...lead, full_name: names.join('; ') } : null}
        vehicle={veh}
        canEdit={canEditEntry(profile, orig, lead)}
        canDuplicate={canCreateFor(profile, lead)}
        dupOthers={dupMap?.get(orig.id)}
        communeOthers={communeMap?.get(orig.id)}
        onEdit={() => onEdit?.(orig)}
        onDelete={() => (m.ids.length > 1 && onDeleteMany ? onDeleteMany(m.ids, orig.content) : onDelete?.(orig))}
        onDuplicate={() => onDuplicate?.(orig)}
        onView={() => onView?.(orig)}
        compact={compact}
        brief
      />
    );
  };

  return (
    <div>
      {/* BẢN IN kiểu công văn (A4 dọc) — chỉ hiện khi in */}
      <WeekPrintSheet anchor={anchor} entries={visible.filter((e) => allUnitLeaderIds.includes(e.leader_id))} leaders={leaders} groups={groups} />

      <div className="print:hidden">
      {/* Thanh công cụ */}
      <div className="no-print flex items-center justify-between mb-2">
        {isMobile ? (
          <div className="flex items-center gap-1 text-[12px] font-semibold text-slate-500"><Rows3 className="w-3.5 h-3.5" /> Chế độ điện thoại</div>
        ) : (
          <div className="flex items-center gap-1 bg-white/90 border border-slate-200 rounded-lg p-0.5">
            <button onClick={() => setMode('full')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold transition ${mode === 'full' ? 'bg-red-700 text-white' : 'text-slate-600 hover:bg-red-50'}`}><LayoutGrid className="w-3.5 h-3.5" /> Đầy đủ</button>
            <button onClick={() => setMode('compact')} className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[12px] font-semibold transition ${mode === 'compact' ? 'bg-red-700 text-white' : 'text-slate-600 hover:bg-red-50'}`}><Rows3 className="w-3.5 h-3.5" /> Gọn</button>
          </div>
        )}
        <div className="flex items-center gap-2">
          {(leaders || []).some((l) => canCreateFor(profile, l)) && (
            <button onClick={() => onAdd?.({})} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 shadow">
              <Plus className="w-4 h-4" /> Thêm lịch
            </button>
          )}
          <button onClick={() => printPage('portrait')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-slate-700 bg-white/90 border border-slate-200 hover:bg-red-50 shadow-sm" title="In theo mẫu công văn, khổ A4 dọc">
            <Printer className="w-4 h-4" /> In lịch tuần
          </button>
        </div>
      </div>

      {effMode === 'full' ? (
        /* ===== CHẾ ĐỘ ĐẦY ĐỦ: bảng ngày × buổi × đơn vị ===== */
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse min-w-[860px]">
            <thead>
              <tr className="bg-red-800 text-white">
                <th className="border border-red-900/40 px-2 py-2.5 text-[13px] font-bold w-[116px]">Thứ / Ngày</th>
                <th className="border border-red-900/40 px-1 py-2.5 text-[12px] font-bold w-[52px]">Buổi</th>
                {units.map((u) => (
                  <th key={u.key} className="border border-red-900/40 px-2 py-2.5 text-[12px] font-bold" style={{ minWidth: 150 }}>{u.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, di) => {
                const dISO = toISODate(d);
                const isToday = dISO === toISODate(new Date());
                const rows = ['sang', 'chieu'].map((sess, si) => {
                  // Đường ngăn: dọc giữa cột = nhạt; ngang giữa Sáng/Chiều = rất nhạt;
                  // ngang giữa các NGÀY (đáy dòng Chiều) = ĐẬM 2px để tách khối ngày.
                  const vB = 'border-r border-r-slate-200';
                  // Trong NGÀY: ngăn Sáng/Chiều rất nhạt. Giữa các NGÀY: KHÔNG viền —
                  // dùng thanh kẻ đỏ có bóng đổ (hàng spacer bên dưới) để tách khung.
                  const hB = si === 0 ? 'border-b border-b-slate-100' : '';
                  return (
                  <tr key={dISO + sess} className={isToday ? 'bg-amber-50/60' : si === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    {si === 0 && (
                      <td rowSpan={2} className={`border-r border-r-slate-200 px-2 py-3 text-center align-middle ${isToday
                        ? 'bg-gradient-to-b from-amber-50 to-white'
                        : 'bg-gradient-to-b from-red-50 to-white'}`}>
                        <p className={`text-[15px] font-extrabold leading-tight ${isToday ? 'text-amber-800' : 'text-red-800'}`}>{dayName(d)}</p>
                        <p className={`inline-block mt-1.5 text-[12px] font-bold rounded-full px-2.5 py-0.5 ${isToday ? 'text-amber-900 bg-amber-200/80' : 'text-red-700 bg-red-100'}`}>{fmtDM(d)}</p>
                        {isToday && <p className="no-print mt-1.5 text-[9px] font-bold text-amber-700 tracking-wide">● HÔM NAY</p>}
                      </td>
                    )}
                    <td className={`${vB} ${hB} px-1 py-1.5 text-center text-[11px] font-semibold text-slate-500`}>{sess === 'sang' ? 'Sáng' : 'Chiều'}</td>
                    {units.map((u) => {
                      const list = cellEntries(u, dISO, sess);
                      // Được thêm nếu có quyền với ít nhất một đối tượng của cột
                      const addable = u.leaderIds.filter((id) => canCreateFor(profile, leaderById[id]));
                      return (
                        <td key={u.key} className={`${vB} ${hB} px-1 py-1 align-top`} style={{ minWidth: 150 }}>
                          <div className="space-y-1">
                            {mergeEntries([...list].sort(entrySorter)).map((m) => renderMergedCard(m, true))}
                            {addable.length > 0 && (
                              <button
                                onClick={() => onAdd?.({ date: d, session: sess, leaderId: addable.length === 1 ? addable[0] : null, leaderIds: u.leaderIds })}
                                className="no-print w-full text-center text-slate-300 hover:text-red-600 hover:bg-red-50 rounded text-[14px] leading-5 opacity-0 hover:opacity-100 focus:opacity-100 transition"
                                title={`Thêm lịch ${sess === 'sang' ? 'sáng' : 'chiều'} ${fmtDM(d)} — ${u.label}`}
                              >+</button>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  );
                });
                // Thanh kẻ ĐỎ có bóng đổ ngang -> tách khung từng ngày (không kẻ sau ngày cuối)
                if (di < days.length - 1) {
                  rows.push(
                    <tr key={dISO + '-sep'} aria-hidden="true">
                      <td colSpan={2 + units.length} className="p-0 bg-white">
                        <div className="h-2.5 flex items-center">
                          <div className="h-[3px] w-full bg-gradient-to-r from-red-700 via-red-500 to-red-400 shadow-[0_4px_7px_-1px_rgba(220,38,38,0.5)]" />
                        </div>
                      </td>
                    </tr>
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ===== CHẾ ĐỘ GỌN: mỗi ngày một khối ===== */
        <div className="space-y-5">
          {days.map((d) => {
            const dISO = toISODate(d);
            const isToday = dISO === toISODate(new Date());
            const dayEntries = visible
              .filter((e) => e.date === dISO && allUnitLeaderIds.includes(e.leader_id))
              .sort(entrySorter);
            return (
              <div key={dISO} className={`rounded-2xl border bg-white shadow-md overflow-hidden ${isToday ? 'border-amber-400 ring-2 ring-amber-300' : 'border-slate-200'}`}>
                <div className={`px-4 py-3 flex items-center justify-between border-b-4 ${isToday ? 'bg-gradient-to-r from-amber-300 to-amber-200 border-amber-500' : 'bg-gradient-to-r from-red-800 via-red-700 to-red-600 border-red-900'}`}>
                  <p className={`flex items-center gap-2 text-[18px] font-extrabold tracking-wide ${isToday ? 'text-red-900' : 'text-white'}`}>
                    <CalendarDays className={`w-5 h-5 ${isToday ? 'text-red-700' : 'text-amber-300'}`} />
                    {dayName(d)}
                    <span className={`text-[15px] font-bold ${isToday ? 'text-red-700' : 'text-amber-200'}`}>· {fmtDMY(d)}</span>
                  </p>
                  {isToday && <span className="text-[11px] font-extrabold text-amber-900 bg-white/80 rounded-full px-2.5 py-1 shadow-sm">HÔM NAY</span>}
                </div>
                <div className={`p-2.5 grid gap-2 ${isMobile ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
                  {dayEntries.length === 0 && <p className="text-[12px] text-slate-400 italic col-span-full">Không có lịch.</p>}
                  {mergeEntries(dayEntries).map((m) => renderMergedCard(m, false))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
}
