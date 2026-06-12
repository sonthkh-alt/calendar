import { useMemo, useState } from 'react';
import { Car, Printer, AlertTriangle, Phone, CircleSlash } from 'lucide-react';
import { assignVehicle } from '../lib/api';
import { entryNeedsVehicleOk } from '../lib/permissions';
import { SESSIONS, UNIT_NAME, VEHICLE_TYPES, isHqLocation } from '../lib/constants';
import { weekDays, toISODate, dayName, fmtDM, fmtDMY, fmtTime, sessionsOverlap, weekStart, weekEnd, parseISO } from '../lib/dates';
import { printPage } from '../lib/print';

/**
 * Bảng điều xe tuần — dành cho Văn phòng (van_phong_xe) / Quản trị.
 * - Trên: bảng tuần (hàng = xe, cột = 7 ngày, ô chia Sáng/Chiều).
 * - Dưới: "Chuyến cần xe" — lịch đã duyệt chưa gán xe, dropdown gán nhanh.
 * - Cảnh báo trùng xe (cùng xe + cùng ngày + buổi/giờ giao nhau, bỏ qua cùng group_id).
 */
export default function VehicleBoard({ profile, anchor, entries, leaders, vehicles, onChanged }) {
  const [busy, setBusy] = useState(null);
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
  const activeVehicles = useMemo(() => (vehicles || []).filter((v) => v.active), [vehicles]);
  // Lãnh đạo có xe riêng -> mọi chuyến mặc định đi xe đó, không cần điều
  const dedicatedByLeader = useMemo(() => Object.fromEntries(
    activeVehicles.filter((v) => v.vehicle_type === 'rieng' && v.assigned_leader_id)
      .map((v) => [v.assigned_leader_id, v])
  ), [activeVehicles]);

  const ws = toISODate(weekStart(anchor)), we = toISODate(weekEnd(anchor));
  const weekEntries = useMemo(
    () => (entries || []).filter((e) => e.date >= ws && e.date <= we && e.status !== 'tu_choi'),
    [entries, ws, we]
  );

  // Chuyến cần xe: đủ điều kiện (đã duyệt / lịch lãnh đạo) nhưng chưa gán.
  // KHÔNG tính: làm việc tại cơ quan; họp tại cơ quan; lãnh đạo có XE RIÊNG (mặc định xe đó phục vụ).
  const needVehicle = weekEntries
    .filter((e) => !e.vehicle_id && !e.at_office && !isHqLocation(e.location) && !dedicatedByLeader[e.leader_id] && entryNeedsVehicleOk(e, leaderById[e.leader_id]))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Kiểm tra trùng: xe đã phục vụ chuyến nào giao thời gian với entry chưa?
  // Tính cả chuyến MẶC ĐỊNH của lãnh đạo gắn xe riêng (không cần gán tay).
  const usesVehicle = (e, vehicleId) => {
    if (e.vehicle_id) return e.vehicle_id === vehicleId;
    const ded = dedicatedByLeader[e.leader_id];
    return ded && ded.id === vehicleId && !isHqLocation(e.location);
  };
  const findConflicts = (vehicleId, entry) =>
    weekEntries.filter((e) =>
      usesVehicle(e, vehicleId) &&
      e.id !== entry.id &&
      e.date === entry.date &&
      (!entry.group_id || e.group_id !== entry.group_id) &&
      sessionsOverlap(e, entry)
    );

  const doAssign = async (entry, vehicleId) => {
    if (!vehicleId) {
      setBusy(entry.id);
      await assignVehicle(entry.id, null, null, profile.id);
      setBusy(null); onChanged?.();
      return;
    }
    const v = activeVehicles.find((x) => x.id === vehicleId);
    const conflicts = findConflicts(vehicleId, entry);
    if (conflicts.length > 0) {
      const c = conflicts[0];
      const who = leaderById[c.leader_id]?.full_name || '';
      const ok = window.confirm(
        `⚠️ CẢNH BÁO TRÙNG XE\n\nXe ${v?.plate} đã được điều cho:\n• ${who} — ${SESSIONS[c.session] || ''} ${fmtDM(parseISO(c.date))}: ${c.content}\n\nVẫn gán xe này?`
      );
      if (!ok) return;
    }
    setBusy(entry.id);
    await assignVehicle(entry.id, vehicleId, null, profile.id);
    setBusy(null); onChanged?.();
  };

  // Gợi ý xe: xe riêng của PCT đó đứng đầu danh sách
  const vehicleOptions = (entry) => {
    const leader = leaderById[entry.leader_id];
    return [...activeVehicles].sort((a, b) => {
      const ap = a.assigned_leader_id === leader?.id ? 0 : a.vehicle_type === 'dung_chung' ? 1 : 2;
      const bp = b.assigned_leader_id === leader?.id ? 0 : b.vehicle_type === 'dung_chung' ? 1 : 2;
      return ap - bp;
    });
  };

  const cellTrips = (vehicleId, dISO, sess) =>
    weekEntries.filter((e) =>
      usesVehicle(e, vehicleId) && e.date === dISO &&
      (sess === 'sang'
        ? (e.session === 'sang' || e.session === 'ca_ngay' || (e.session === 'gio' && (e.start_time || '08:00') < '12:00'))
        : (e.session === 'chieu' || e.session === 'ca_ngay' || (e.session === 'gio' && (e.start_time || '08:00') >= '12:00')))
    );

  return (
    <div className="print-root space-y-5">
      {/* Tiêu đề khi in */}
      <div className="print-header">
        <p style={{ fontSize: 13 }}>{UNIT_NAME.toUpperCase()}</p>
        <p style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>LỊCH ĐIỀU XE TUẦN</p>
        <p style={{ fontSize: 13, fontStyle: 'italic' }}>Từ ngày {fmtDMY(weekStart(anchor))} đến ngày {fmtDMY(weekEnd(anchor))}</p>
      </div>

      <div className="no-print flex items-center justify-between">
        <h2 className="text-[15px] font-bold text-slate-800 flex items-center gap-2"><Car className="w-5 h-5 text-red-700" /> Bảng điều xe tuần</h2>
        <button onClick={() => printPage('landscape')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-slate-700 bg-white/90 border border-slate-200 hover:bg-red-50 shadow-sm" title="In khổ A4 ngang">
          <Printer className="w-4 h-4" /> In lịch điều xe
        </button>
      </div>

      {/* Bảng tuần theo xe */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-red-800 text-white">
              <th className="border border-red-900/40 px-2 py-2 text-[12px] font-bold w-[150px]">Xe / Lái xe</th>
              {days.map((d) => (
                <th key={toISODate(d)} className="border border-red-900/40 px-1 py-1.5 text-[11px] font-bold">
                  {dayName(d)}<span className="block font-normal text-red-100">{fmtDM(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeVehicles.map((v) => (
              <tr key={v.id} className="odd:bg-white even:bg-slate-50/50">
                <td className="border border-slate-200 px-2 py-2 align-top">
                  <p className="text-[13px] font-bold text-slate-800">{v.plate}</p>
                  <p className="text-[11px] text-slate-600">{v.driver_name}</p>
                  {v.driver_phone && <p className="text-[11px] text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" /> {v.driver_phone}</p>}
                  <p className={`text-[10px] font-semibold mt-1 ${v.vehicle_type === 'rieng' ? 'text-red-700' : 'text-sky-700'}`}>
                    {v.vehicle_type === 'rieng'
                      ? `Xe riêng${v.assigned_leader_id ? ' · ' + (leaderById[v.assigned_leader_id]?.full_name || '') : ''}`
                      : VEHICLE_TYPES.dung_chung}
                  </p>
                </td>
                {days.map((d) => {
                  const dISO = toISODate(d);
                  return (
                    <td key={dISO} className="border border-slate-200 p-1 align-top" style={{ minWidth: 120 }}>
                      {['sang', 'chieu'].map((sess) => {
                        const trips = cellTrips(v.id, dISO, sess);
                        if (trips.length === 0) return null;
                        return trips.map((e) => (
                          <div key={e.id + sess} className="mb-1 rounded-md bg-red-50 border border-red-200 px-1.5 py-1">
                            <p className="text-[10px] font-bold text-red-800">{sess === 'sang' ? 'S' : 'C'}{e.session === 'gio' ? ` · ${fmtTime(e.start_time)}` : ''} · {leaderById[e.leader_id]?.full_name}</p>
                            <p className="text-[10px] text-slate-600 leading-tight">{e.location || e.content}{!e.vehicle_id && <i> (xe riêng mặc định)</i>}</p>
                            {e.vehicle_id && (
                              <button onClick={() => doAssign(e, null)} disabled={busy === e.id} title="Bỏ gán xe" className="no-print mt-0.5 text-[9px] text-slate-400 hover:text-rose-600 flex items-center gap-0.5">
                                <CircleSlash className="w-2.5 h-2.5" /> Bỏ gán
                              </button>
                            )}
                          </div>
                        ));
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Chuyến cần xe */}
      <div className="no-print rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-amber-500 text-white px-4 py-2 text-[13px] font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Chuyến công tác cần điều xe ({needVehicle.length})
        </div>
        {needVehicle.length === 0 ? (
          <p className="p-4 text-[13px] text-slate-500 italic">Mọi chuyến đã duyệt trong tuần đều đã được gán xe.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {needVehicle.map((e) => {
              const l = leaderById[e.leader_id];
              const timeLabel = e.session === 'gio' ? `${fmtTime(e.start_time)} - ${fmtTime(e.end_time)}` : SESSIONS[e.session];
              return (
                <div key={e.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-800">{e.content}</p>
                    <p className="text-[12px] text-slate-600 mt-0.5">
                      <span className="font-semibold text-red-800">{l?.full_name}</span> · {dayName(parseISO(e.date))} {fmtDM(parseISO(e.date))} · {timeLabel}{e.location ? ` · ${e.location}` : ''}
                    </p>
                  </div>
                  <select
                    disabled={busy === e.id}
                    defaultValue=""
                    onChange={(ev) => { if (ev.target.value) doAssign(e, ev.target.value); ev.target.value = ''; }}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400"
                  >
                    <option value="">— Chọn xe —</option>
                    {vehicleOptions(e).map((v) => {
                      const conflict = findConflicts(v.id, e).length > 0;
                      const own = v.assigned_leader_id === l?.id;
                      return (
                        <option key={v.id} value={v.id}>
                          {v.plate} · {v.driver_name}{own ? ' (xe riêng)' : v.vehicle_type === 'dung_chung' ? ' (dùng chung)' : ''}{conflict ? ' ⚠ trùng giờ' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
