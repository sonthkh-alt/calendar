import { useMemo, useState } from 'react';
import { Car, Printer, AlertTriangle, Phone, CircleSlash, X, CheckCircle2 } from 'lucide-react';
import { updateEntries } from '../lib/api';
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
  const vehicleById = useMemo(() => Object.fromEntries((vehicles || []).map((v) => [v.id, v])), [vehicles]);
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

  // Các chuyến CẦN ĐIỀU PHỐI: đủ điều kiện (đã duyệt / lịch lãnh đạo).
  // KHÔNG tính: làm việc tại cơ quan; họp tại cơ quan; lãnh đạo có XE RIÊNG (đồng chí tự lo).
  const eligible = useMemo(() => weekEntries
    .filter((e) => !e.at_office && !isHqLocation(e.location) && !dedicatedByLeader[e.leader_id] && entryNeedsVehicleOk(e, leaderById[e.leader_id])),
  [weekEntries, dedicatedByLeader, leaderById]);

  const carsOf = (e) => e.vehicle_ids || [];

  // Gom theo SỰ KIỆN (cùng group_id) -> 1 mục: điều xe 1 lần cho CẢ NHÓM
  const tripGroups = useMemo(() => {
    const map = new Map(); const out = [];
    for (const e of eligible) {
      const key = e.group_id || e.id;
      if (!map.has(key)) { const it = { key, rep: e, ids: [e.id], leaderIds: [e.leader_id] }; map.set(key, it); out.push(it); }
      else { const it = map.get(key); it.ids.push(e.id); if (!it.leaderIds.includes(e.leader_id)) it.leaderIds.push(e.leader_id); }
    }
    // Sắp xếp: chưa có xe (cần xe) trước -> đã gán -> không cần xe; trong nhóm theo ngày
    const rank = (g) => g.rep.no_vehicle ? 2 : (carsOf(g.rep).length === 0 ? 0 : 1);
    return out.sort((a, b) => rank(a) - rank(b) || a.rep.date.localeCompare(b.rep.date));
  }, [eligible]);

  const needCount = tripGroups.filter((g) => !g.rep.no_vehicle && carsOf(g.rep).length === 0).length;

  // Tất cả id mục cùng sự kiện (để gán/bỏ gán cả nhóm)
  const groupIdsOf = (e) => (e.group_id ? weekEntries.filter((x) => x.group_id === e.group_id).map((x) => x.id) : [e.id]);

  // Trùng xe: tính các mục có xe đó trong vehicle_ids (xe riêng mặc định không tính).
  const usesVehicle = (e, vehicleId) => carsOf(e).includes(vehicleId);
  const findConflicts = (vehicleId, entry) =>
    weekEntries.filter((e) =>
      usesVehicle(e, vehicleId) &&
      e.id !== entry.id &&
      e.date === entry.date &&
      (!entry.group_id || e.group_id !== entry.group_id) &&
      sessionsOverlap(e, entry)
    );

  const runGroup = async (ids, repId, patch) => {
    setBusy(repId);
    const { error } = await updateEntries(ids, { ...patch, vehicle_assigned_by: profile.id, vehicle_assigned_at: new Date().toISOString() });
    setBusy(null);
    if (error) { alert('Không lưu được: ' + error.message); return; }
    onChanged?.();
  };

  // Thêm 1 xe cho cả nhóm (cảnh báo trùng giờ)
  const addCar = async (ids, rep, vehicleId) => {
    const cur = carsOf(rep);
    if (cur.includes(vehicleId)) return;
    const v = activeVehicles.find((x) => x.id === vehicleId);
    const conflicts = findConflicts(vehicleId, rep);
    if (conflicts.length > 0) {
      const c = conflicts[0];
      const who = leaderById[c.leader_id]?.full_name || '';
      if (!window.confirm(`⚠️ CẢNH BÁO TRÙNG XE\n\nXe ${v?.plate} đã được điều cho:\n• ${who} — ${SESSIONS[c.session] || ''} ${fmtDM(parseISO(c.date))}: ${c.content}\n\nVẫn gán thêm xe này?`)) return;
    }
    const arr = [...cur, vehicleId];
    await runGroup(ids, rep.id, { vehicle_ids: arr, vehicle_id: arr[0], no_vehicle: false });
  };
  // Bỏ 1 xe khỏi nhóm
  const removeCar = async (ids, rep, vehicleId) => {
    const arr = carsOf(rep).filter((x) => x !== vehicleId);
    await runGroup(ids, rep.id, { vehicle_ids: arr, vehicle_id: arr[0] || null });
  };
  // Đặt / bỏ "Không cần xe"
  const setNoVehicle = async (ids, rep, val) => {
    await runGroup(ids, rep.id, val
      ? { no_vehicle: true, vehicle_ids: [], vehicle_id: null }
      : { no_vehicle: false });
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

  const cellTrips = (vehicleId, dISO, sess) => {
    const trips = weekEntries.filter((e) =>
      usesVehicle(e, vehicleId) && e.date === dISO &&
      (sess === 'sang'
        ? (e.session === 'sang' || e.session === 'ca_ngay' || (e.session === 'gio' && (e.start_time || '08:00') < '12:00'))
        : (e.session === 'chieu' || e.session === 'ca_ngay' || (e.session === 'gio' && (e.start_time || '08:00') >= '12:00')))
    );
    // Gộp các mục cùng sự kiện (group_id) -> 1 ô trên lưới
    const seen = new Set(); const out = [];
    for (const e of trips) { const k = e.group_id || e.id; if (seen.has(k)) continue; seen.add(k); out.push(e); }
    return out;
  };

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
                            <p className="text-[10px] font-bold text-red-800">{sess === 'sang' ? 'S' : 'C'}{e.session === 'gio' ? ` · ${fmtTime(e.start_time)}` : ''} · {e.group_label || leaderById[e.leader_id]?.full_name}</p>
                            <p className="text-[10px] text-slate-600 leading-tight">{e.location || e.content}</p>
                            <button onClick={() => removeCar(groupIdsOf(e), e, v.id)} disabled={busy === e.id} title="Bỏ xe này khỏi chuyến" className="no-print mt-0.5 text-[9px] text-slate-400 hover:text-rose-600 flex items-center gap-0.5">
                              <CircleSlash className="w-2.5 h-2.5" /> Bỏ gán
                            </button>
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

      {/* Điều phối xe cho từng chuyến */}
      <div className="no-print rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-amber-500 text-white px-4 py-2 text-[13px] font-bold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Điều phối xe các chuyến trong tuần — còn {needCount} chuyến cần xe
        </div>
        {tripGroups.length === 0 ? (
          <p className="p-4 text-[13px] text-slate-500 italic">Không có chuyến công tác nào cần điều xe trong tuần.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {tripGroups.map((item) => {
              const e = item.rep;
              const l = leaderById[e.leader_id];
              const names = item.leaderIds.map((id) => leaderById[id]?.full_name).filter(Boolean);
              const unitLabel = e.group_label || names.join('; ');
              const timeLabel = e.session === 'gio' ? `${fmtTime(e.start_time)} - ${fmtTime(e.end_time)}` : SESSIONS[e.session];
              const cars = carsOf(e);
              const noVeh = e.no_vehicle;
              const addable = vehicleOptions(e).filter((v) => !cars.includes(v.id));
              return (
                <div key={item.key} className={`px-4 py-3 flex flex-wrap items-center justify-between gap-3 ${noVeh ? 'bg-slate-50' : cars.length === 0 ? 'bg-amber-50/40' : ''}`}>
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold text-slate-800">{e.content}{item.ids.length > 1 ? <span className="font-normal text-amber-700"> · cả nhóm ({item.ids.length} đơn vị)</span> : null}</p>
                    <p className="text-[12px] text-slate-600 mt-0.5">
                      <span className="font-semibold text-red-800">{unitLabel}</span> · {dayName(parseISO(e.date))} {fmtDM(parseISO(e.date))} · {timeLabel}{e.location ? ` · ${e.location}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {noVeh ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-1"><CircleSlash className="w-3.5 h-3.5" /> Không cần xe</span>
                        <button onClick={() => setNoVehicle(item.ids, e, false)} disabled={busy === e.id} className="text-[12px] font-semibold text-amber-700 hover:text-amber-900">Cần xe lại</button>
                      </>
                    ) : (
                      <>
                        {/* Xe đã gán (chip + bỏ) */}
                        {cars.map((vid) => {
                          const v = vehicleById[vid];
                          if (!v) return null;
                          return (
                            <span key={vid} className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-800 bg-emerald-100 rounded-full pl-2.5 pr-1 py-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> {v.plate} · {v.driver_name}
                              <button onClick={() => removeCar(item.ids, e, vid)} disabled={busy === e.id} title="Bỏ xe này" className="ml-0.5 p-0.5 rounded-full hover:bg-emerald-200 text-emerald-700"><X className="w-3 h-3" /></button>
                            </span>
                          );
                        })}
                        {/* Thêm xe */}
                        {addable.length > 0 && (
                          <select
                            disabled={busy === e.id}
                            value=""
                            onChange={(ev) => { if (ev.target.value) addCar(item.ids, e, ev.target.value); ev.target.value = ''; }}
                            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400"
                          >
                            <option value="">{cars.length ? '+ Thêm xe' : '— Chọn xe —'}</option>
                            {addable.map((v) => {
                              const conflict = findConflicts(v.id, e).length > 0;
                              const own = v.assigned_leader_id === l?.id;
                              return (
                                <option key={v.id} value={v.id}>
                                  {v.plate} · {v.driver_name}{own ? ' (xe riêng)' : v.vehicle_type === 'dung_chung' ? ' (dùng chung)' : ''}{conflict ? ' ⚠ trùng giờ' : ''}
                                </option>
                              );
                            })}
                          </select>
                        )}
                        {/* Không cần xe */}
                        {cars.length === 0 && (
                          <button onClick={() => setNoVehicle(item.ids, e, true)} disabled={busy === e.id} className="inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500 border border-slate-200 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                            <CircleSlash className="w-3.5 h-3.5" /> Không cần xe
                          </button>
                        )}
                      </>
                    )}
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
