import { useMemo, useState } from 'react';
import { X, Clock, MapPin, Users, Car, MessageSquareText, Pencil, Trash2, Building2, Copy, Check, XCircle, Zap, SlidersHorizontal } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { SESSIONS, UNIT_GROUP_LABELS, isHqLocation, hidesDriver } from '../lib/constants';
import { fmtTime, fmtDMY, dayName, parseISO, sessionsOverlap, fmtDM } from '../lib/dates';
import { canReviewEntry, canAssignVehicle, entryNeedsVehicleOk, canAdmin } from '../lib/permissions';
import { reviewEntries, updateEntries } from '../lib/api';
import DateField from './DateField';

/**
 * Modal chi tiết 1 mục lịch — hiển thị ĐẦY ĐỦ, không cắt chữ.
 * Các mục TRÙNG nội dung + thời gian được GỘP: thành phần nối lại với nhau.
 * Khu "Xử lý nhanh": Duyệt/Từ chối (PCT, Quản trị) + chọn xe (Văn phòng, Quản trị).
 */
export default function EntryDetail({ entry, entries, leaders, vehicles, profile, canEdit, canDuplicate, dupInfo, onEdit, onDelete, onDuplicate, onChanged, onClose }) {
  const dupOthers = dupInfo?.others;
  const dupWeek = dupInfo?.severity === 'week';
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [note, setNote] = useState('');
  const [adjContent, setAdjContent] = useState('');
  const [adjDate, setAdjDate] = useState('');
  const [adjSession, setAdjSession] = useState('sang');
  const [adjLocation, setAdjLocation] = useState('');
  // Điều chỉnh / từ chối theo TỪNG thành viên: id các mục được chọn áp dụng
  const [selIds, setSelIds] = useState([]);
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
  const vehicleById = useMemo(() => Object.fromEntries((vehicles || []).map((v) => [v.id, v])), [vehicles]);

  // Gộp các mục trùng nội dung + ngày + thời gian (khác thành phần / đơn vị).
  // Lịch ĐÃ TỪ CHỐI gộp riêng với nhau; lịch chưa từ chối gộp riêng -> khi từ chối một
  // vài thành viên thì thẻ bị từ chối (gạch ngang) tách khỏi thẻ còn lại (bình thường).
  const rejectedEntry = entry.status === 'tu_choi';
  const same = useMemo(
    () => (entries || []).filter((e) =>
      e.content === entry.content &&
      e.date === entry.date &&
      e.session === entry.session &&
      (e.start_time || '') === (entry.start_time || '') &&
      (rejectedEntry ? e.status === 'tu_choi' : e.status !== 'tu_choi')
    ),
    [entries, entry, rejectedEntry]
  );
  const merged = useMemo(() => (same.length > 0 ? same : [entry]), [same, entry]);

  // Admin: BỎ QUA / TÍNH LẠI cảnh báo trùng cho RIÊNG lịch này (đặt cờ dup_ignored
  // trên các mục của sự kiện) — KHÔNG ảnh hưởng các lịch khác cùng địa điểm.
  const setDupIgnored = async (val) => {
    const ids = [...new Set(merged.map((x) => x.id))];
    if (!ids.length) return;
    if (val && !window.confirm(`Bỏ qua cảnh báo trùng địa điểm cho RIÊNG lịch này?\n\nChỉ lịch "${entry.content}" sẽ không bị tính/cảnh báo trùng nữa; các lịch khác cùng địa điểm vẫn cảnh báo bình thường.`)) return;
    setBusy(true);
    const { error } = await updateEntries(ids, { dup_ignored: val });
    setBusy(false);
    if (error) { alert('Không lưu được: ' + error.message); return; }
    onChanged?.();
  };

  const unitLabels = [...new Set(merged.map((e) => {
    const l = leaderById[e.leader_id];
    return l ? (UNIT_GROUP_LABELS[l.leader_type] || l.full_name) : null;
  }).filter(Boolean))];

  // Lãnh đạo đích danh của các mục đã gộp
  const leaderNames = [...new Set(merged.map((e) => leaderById[e.leader_id]?.full_name).filter(Boolean))];

  const mergedParticipants = [...new Set(merged.map((e) => (e.participants || '').trim()).filter(Boolean))].join('; ');

  // Xe: xe đã gán; nếu chưa gán thì xe riêng của lãnh đạo (PCT / Phó Trưởng Đoàn)
  const dedicatedByLeader = Object.fromEntries(
    (vehicles || []).filter((v) => v.active && v.vehicle_type === 'rieng' && v.assigned_leader_id)
      .map((v) => [v.assigned_leader_id, v])
  );
  const mergedVehicles = [...new Map(
    merged.flatMap((e) => {
      if (hidesDriver(leaderById[e.leader_id]?.leader_type)) return [];
      const ids = (e.vehicle_ids && e.vehicle_ids.length) ? e.vehicle_ids : (e.vehicle_id ? [e.vehicle_id] : []);
      if (ids.length) return ids.map((id) => vehicleById[id]).filter(Boolean);
      return (!e.no_vehicle && !isHqLocation(e.location) && dedicatedByLeader[e.leader_id]) ? [dedicatedByLeader[e.leader_id]] : [];
    }).map((v) => [v.id, v])
  ).values()];

  const d = parseISO(entry.date);
  const timeLabel = entry.session === 'gio'
    ? `${fmtTime(entry.start_time)}${entry.end_time ? ' - ' + fmtTime(entry.end_time) : ''}`
    : SESSIONS[entry.session];

  // ===== Xử lý nhanh: duyệt / điều chỉnh / từ chối / điều xe ngay trong hộp chi tiết =====
  const leader = leaderById[entry.leader_id];
  // Cho phép xử lý cả khi đã duyệt: điều chỉnh / từ chối lịch đã phê duyệt
  const canModerate = canReviewEntry(profile, entry, leader) && ['cho_duyet', 'da_duyet', 'da_dieu_chinh'].includes(entry.status);
  const canApproveNow = entry.status !== 'da_duyet'; // đã duyệt rồi thì không cần nút Phê duyệt
  // Lãnh đạo HĐND tỉnh / Đoàn ĐBQH: ô Lái xe luôn để trống -> không hiện cả khu gán xe nhanh
  const showVehicle = canAssignVehicle(profile) && entryNeedsVehicleOk(entry, leader)
    && !isHqLocation(entry.location) && !hidesDriver(leader?.leader_type);
  const activeVehicles = (vehicles || []).filter((v) => v.active);
  const vehicleOptions = [...activeVehicles].sort((a, b) => {
    const ap = a.assigned_leader_id === leader?.id ? 0 : a.vehicle_type === 'dung_chung' ? 1 : 2;
    const bp = b.assigned_leader_id === leader?.id ? 0 : b.vehicle_type === 'dung_chung' ? 1 : 2;
    return ap - bp;
  });
  const findConflicts = (vehId) => (entries || []).filter((x) =>
    (x.vehicle_ids || []).includes(vehId) && x.id !== entry.id && x.date === entry.date &&
    (!entry.group_id || x.group_id !== entry.group_id) &&
    x.status !== 'tu_choi' && sessionsOverlap(x, entry)
  );

  // Duyệt áp dụng cho TẤT CẢ mục đã gộp (mọi đơn vị/thành viên của sự kiện)
  const mergedIds = [...new Set(merged.map((e) => e.id))];
  // Danh sách THÀNH VIÊN của sự kiện (mỗi đơn vị/lãnh đạo 1 mục) — để điều chỉnh/từ chối
  // theo TỪNG người thay vì cả nhóm khi sự kiện có nhiều thành viên.
  const members = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const e of merged) {
      if (seen.has(e.id)) continue; seen.add(e.id);
      out.push({ id: e.id, name: leaderById[e.leader_id]?.full_name || e.group_label || 'Đơn vị', status: e.status });
    }
    return out;
  }, [merged, leaderById]);
  const isGroup = members.length > 1;
  const toggleSel = (id) => setSelIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const doApprove = async () => {
    setBusy(true);
    await reviewEntries(mergedIds, 'da_duyet', null, profile.id);
    setBusy(false); onChanged?.(); onClose?.();
  };
  const openReject = () => {
    setRejecting(true); setAdjusting(false); setNote(''); setSelIds(mergedIds);
  };
  const doReject = async () => {
    if (!selIds.length) { alert('Vui lòng chọn ít nhất một thành viên để từ chối.'); return; }
    if (!note.trim()) { alert('Vui lòng nhập lý do từ chối.'); return; }
    setBusy(true);
    await reviewEntries(selIds, 'tu_choi', note.trim(), profile.id);
    // Thành viên KHÔNG bị từ chối nhưng còn CHỜ DUYỆT -> phê duyệt bình thường
    // (lịch của họ vẫn hiển thị bình thường, không bị gạch ngang theo người bị từ chối)
    const restIds = merged.filter((e) => !selIds.includes(e.id) && e.status === 'cho_duyet').map((e) => e.id);
    if (restIds.length) await reviewEntries(restIds, 'da_duyet', null, profile.id);
    setBusy(false); onChanged?.(); onClose?.();
  };
  const openAdjust = () => {
    setAdjusting(true); setRejecting(false); setNote(''); setSelIds(mergedIds);
    setAdjContent(entry.content); setAdjDate(entry.date);
    setAdjSession(entry.session === 'gio' ? 'sang' : entry.session); setAdjLocation(entry.location || '');
  };
  const doAdjust = async () => {
    if (!selIds.length) { alert('Vui lòng chọn ít nhất một thành viên để điều chỉnh.'); return; }
    if (!note.trim()) { alert('Vui lòng nhập ghi chú điều chỉnh để Văn phòng và Ban được biết.'); return; }
    setBusy(true);
    await updateEntries(selIds, {
      content: adjContent.trim(), date: adjDate, session: adjSession, location: adjLocation.trim() || null,
      status: 'da_dieu_chinh', review_note: note.trim(),
      reviewed_by: profile.id, reviewed_at: new Date().toISOString(),
    });
    setBusy(false); onChanged?.(); onClose?.();
  };
  const doAssign = async (vehId) => {
    if (vehId) {
      const cf = findConflicts(vehId);
      if (cf.length > 0) {
        const v = activeVehicles.find((x) => x.id === vehId);
        const who = leaderById[cf[0].leader_id]?.full_name || '';
        if (!window.confirm(`⚠️ Xe ${v?.plate} đã được điều cho ${who} (${fmtDM(parseISO(cf[0].date))}): ${cf[0].content}\n\nVẫn gán xe này?`)) return;
      }
    }
    setBusy(true);
    const ids = [...new Set(merged.map((x) => x.id))];
    const patch = vehId
      ? { vehicle_ids: [vehId], vehicle_id: vehId, no_vehicle: false, vehicle_assigned_by: profile.id, vehicle_assigned_at: new Date().toISOString() }
      : { vehicle_ids: [], vehicle_id: null };
    await updateEntries(ids, patch);
    setBusy(false); onChanged?.(); onClose?.();
  };

  const row = 'flex items-start gap-2.5';
  const ic = 'w-4 h-4 shrink-0 text-red-700 mt-0.5';
  const lab = 'text-[11px] font-bold text-slate-400 uppercase tracking-wide';
  const val = 'text-[14px] text-slate-800 leading-relaxed';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl max-h-full overflow-y-auto animate-fadeUp">
        <div className="sticky top-0 bg-gradient-to-r from-red-800 to-red-700 text-white px-5 py-3.5 rounded-t-2xl flex items-center justify-between gap-3">
          <h2 className="font-bold text-[15px] leading-snug">Chi tiết lịch công tác</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20 shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          {dupOthers?.length > 0 && (
            <div className={`text-[13px] rounded-xl p-3 border ${dupWeek ? 'text-red-900 bg-red-50 border-red-300' : 'text-amber-900 bg-amber-50 border-amber-300'}`}>
              <p className="font-bold">
                {dupWeek
                  ? `⚠️ TRÙNG ĐỊA ĐIỂM TRONG TUẦN: có nhóm khác cùng đến "${entry.location}" trong tuần này:`
                  : `⚠️ Trùng địa điểm "${entry.location}" với các lịch khác trong năm:`}
              </p>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {dupOthers.map((o, i) => (
                  <li key={i}>{dayName(parseISO(o.date))}, ngày {fmtDMY(parseISO(o.date))}{o.name ? ` — ${o.name}` : ''}</li>
                ))}
              </ul>
              <p className="mt-1 italic">Đề nghị cân nhắc gộp đoàn hoặc điều phối chung xe.</p>
              {canAdmin(profile) && (
                <button onClick={() => setDupIgnored(true)} disabled={busy} className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold bg-white disabled:opacity-60 ${dupWeek ? 'text-red-800 border border-red-300 hover:bg-red-100' : 'text-amber-800 border border-amber-300 hover:bg-amber-100'}`}>
                  <XCircle className="w-3.5 h-3.5" /> Bỏ qua cảnh báo trùng cho RIÊNG lịch này
                </button>
              )}
            </div>
          )}
          {entry.dup_ignored && canAdmin(profile) && (
            <div className="text-[12px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <span className="italic">Lịch này đang được BỎ QUA cảnh báo trùng địa điểm.</span>
              <button onClick={() => setDupIgnored(false)} disabled={busy} className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 disabled:opacity-60">
                <Check className="w-3.5 h-3.5" /> Tính lại cảnh báo
              </button>
            </div>
          )}
          {/* Nội dung */}
          <div>
            <p className={lab}>Nội dung</p>
            <p className="text-[15px] font-bold text-slate-900 leading-relaxed mt-0.5">{entry.content}</p>
          </div>

          {/* Lãnh đạo / Đơn vị */}
          <div className={row}>
            <Building2 className={ic} />
            <div>
              <p className={lab}>Lãnh đạo / Đơn vị</p>
              <p className={val}>{entry.group_label || leaderNames.join('; ') || unitLabels.join(' · ') || '—'}</p>
            </div>
          </div>

          {entry.at_office ? (
            /* Làm việc tại cơ quan: dòng chữ in đậm + Thành phần (để in công văn) */
            <>
              <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 font-bold text-amber-800">
                <Building2 className="w-5 h-5 shrink-0" /> Làm việc tại cơ quan
              </div>
              {mergedParticipants && (
                <div className={row}>
                  <Users className={ic} />
                  <div>
                    <p className={lab}>Thành phần</p>
                    <p className={val}>{mergedParticipants}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Thời gian */}
              <div className={row}>
                <Clock className={ic} />
                <div>
                  <p className={lab}>Thời gian</p>
                  <p className={val}>{dayName(d)}, ngày {fmtDMY(d)} · {timeLabel}</p>
                </div>
              </div>

              {/* Địa điểm */}
              <div className={row}>
                <MapPin className={ic} />
                <div>
                  <p className={lab}>Địa điểm</p>
                  <p className={val}>{entry.location || '—'}</p>
                </div>
              </div>

              {/* Thành phần (đã gộp) */}
              <div className={row}>
                <Users className={ic} />
                <div>
                  <p className={lab}>Thành phần</p>
                  <p className={val}>{mergedParticipants || '—'}</p>
                </div>
              </div>

              {/* Lái xe / Xe phục vụ */}
              <div className={row}>
                <Car className={ic} />
                <div>
                  <p className={lab}>Lái xe / Xe phục vụ</p>
                  <p className={val}>{mergedVehicles.length > 0
                    ? mergedVehicles.map((v) => `${[v.driver_name, v.plate].filter(Boolean).join(' · ')}${v.driver_phone ? ` (${v.driver_phone})` : ''}`).join('; ')
                    : '—'}</p>
                </div>
              </div>
            </>
          )}

          {/* Ghi chú duyệt */}
          {entry.review_note && (
            <div className={row}>
              <MessageSquareText className={ic} />
              <div>
                <p className={lab}>Ghi chú của lãnh đạo</p>
                <p className={`${val} italic`}>{entry.review_note}</p>
              </div>
            </div>
          )}

          {/* ===== XỬ LÝ NHANH (duyệt / điều chỉnh / từ chối / điều xe ngay tại đây) ===== */}
          {(canModerate || showVehicle) && (
            <div className="rounded-xl border border-red-200 bg-red-50/40 p-3.5 space-y-3">
              <p className="flex items-center gap-1.5 text-[12px] font-bold text-red-800 uppercase tracking-wide"><Zap className="w-4 h-4" /> Xử lý nhanh</p>

              {canModerate && !rejecting && !adjusting && (
                <div className="flex flex-wrap items-center gap-2">
                  {!canApproveNow && <span className="text-[12px] text-emerald-700 font-semibold mr-1">Lịch đã duyệt — có thể điều chỉnh hoặc từ chối:</span>}
                  {canApproveNow && (
                    <button onClick={doApprove} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
                      <Check className="w-4 h-4" /> Phê duyệt
                    </button>
                  )}
                  <button onClick={openAdjust} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60">
                    <SlidersHorizontal className="w-4 h-4" /> Điều chỉnh
                  </button>
                  <button onClick={openReject} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60">
                    <XCircle className="w-4 h-4" /> Từ chối
                  </button>
                </div>
              )}
              {canModerate && adjusting && (
                <div className="space-y-2">
                  <p className="text-[12px] font-bold text-sky-800">Điều chỉnh nội dung lịch (chuyển trạng thái "Đã điều chỉnh")</p>
                  {isGroup && (
                    <div className="rounded-lg border border-sky-200 bg-white p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-bold text-slate-500">Áp dụng cho thành viên ({selIds.length}/{members.length}):</p>
                        <div className="flex gap-2 text-[11px] font-semibold">
                          <button type="button" onClick={() => setSelIds(members.map((m) => m.id))} className="text-slate-500 hover:text-sky-700">Tất cả</button>
                          <button type="button" onClick={() => setSelIds([])} className="text-slate-500 hover:text-sky-700">Bỏ chọn</button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        {members.map((m) => (
                          <label key={m.id} className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={selIds.includes(m.id)} onChange={() => toggleSel(m.id)} className="accent-sky-600 w-4 h-4" />
                            {m.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <textarea rows={2} value={adjContent} onChange={(e) => setAdjContent(e.target.value)} placeholder="Nội dung" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <DateField value={adjDate} onChange={setAdjDate} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" />
                    <select value={adjSession} onChange={(e) => setAdjSession(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400">
                      {Object.entries(SESSIONS).filter(([k]) => k !== 'gio').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input type="text" value={adjLocation} onChange={(e) => setAdjLocation(e.target.value)} placeholder="Địa điểm" className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" />
                  </div>
                  <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú điều chỉnh (bắt buộc) — VD: Gộp đoàn với Ban Dân tộc, xuất phát 13h00" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setAdjusting(false)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-white">Hủy</button>
                    <button onClick={doAdjust} disabled={busy} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60">Lưu điều chỉnh</button>
                  </div>
                </div>
              )}
              {canModerate && rejecting && (
                <div className="space-y-2">
                  {isGroup && (
                    <div className="rounded-lg border border-rose-200 bg-white p-2.5">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-bold text-slate-500">Từ chối thành viên ({selIds.length}/{members.length}):</p>
                        <div className="flex gap-2 text-[11px] font-semibold">
                          <button type="button" onClick={() => setSelIds(members.map((m) => m.id))} className="text-slate-500 hover:text-rose-700">Tất cả</button>
                          <button type="button" onClick={() => setSelIds([])} className="text-slate-500 hover:text-rose-700">Bỏ chọn</button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        {members.map((m) => (
                          <label key={m.id} className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={selIds.includes(m.id)} onChange={() => toggleSel(m.id)} className="accent-rose-600 w-4 h-4" />
                            {m.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do từ chối (bắt buộc)" className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400" />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setRejecting(false)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-white">Hủy</button>
                    <button onClick={doReject} disabled={busy} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60">Xác nhận từ chối</button>
                  </div>
                </div>
              )}

              {showVehicle && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-slate-600 flex items-center gap-1"><Car className="w-3.5 h-3.5" /> Điều xe:</span>
                  <select
                    disabled={busy}
                    value={entry.vehicle_id || ''}
                    onChange={(e) => doAssign(e.target.value)}
                    className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px] text-slate-700 outline-none focus:border-red-400"
                  >
                    <option value="">— Chưa gán xe —</option>
                    {vehicleOptions.map((v) => {
                      const own = v.assigned_leader_id === leader?.id;
                      const conflict = findConflicts(v.id).length > 0;
                      return (
                        <option key={v.id} value={v.id}>
                          {v.plate} · {v.driver_name}{own ? ' (xe riêng)' : v.vehicle_type === 'dung_chung' ? ' (dùng chung)' : ''}{conflict ? ' ⚠ trùng giờ' : ''}
                        </option>
                      );
                    })}
                  </select>
                  {entry.vehicle_id && (
                    <button onClick={() => doAssign('')} disabled={busy} className="text-[12px] font-semibold text-slate-500 hover:text-rose-700">Bỏ gán xe</button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <StatusBadge status={entry.status} />
            <div className="flex items-center gap-2">
              {canDuplicate && (
                <button onClick={() => { onClose?.(); onDuplicate?.(entry); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700" title="Tạo mục lịch mới giống mục này để sửa một vài chi tiết">
                  <Copy className="w-3.5 h-3.5" /> Nhân bản
                </button>
              )}
              {canEdit && (
                <>
                  <button onClick={() => { onClose?.(); onEdit?.(entry); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-sky-600 hover:bg-sky-700">
                    <Pencil className="w-3.5 h-3.5" /> Sửa
                  </button>
                  <button onClick={() => { onClose?.(); onDelete?.(entry); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-rose-600 hover:bg-rose-700">
                    <Trash2 className="w-3.5 h-3.5" /> Xóa
                  </button>
                </>
              )}
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-[13px] font-semibold text-slate-600 hover:bg-slate-100">Đóng</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
