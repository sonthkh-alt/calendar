import { useMemo, useState } from 'react';
import { X, Save, AlertTriangle, CalendarPlus } from 'lucide-react';
import { SESSIONS, COMMON_LOCATIONS, groupLeaderIds } from '../lib/constants';
import { canCreateFor, initialStatus } from '../lib/permissions';
import { createEntries, updateEntry } from '../lib/api';
import { toISODate, sessionsOverlap, parseISO, fmtDM } from '../lib/dates';

/**
 * Modal thêm / sửa / nhân bản mục lịch.
 * props:
 *  - profile, leaders, entries (để cảnh báo trùng), groups (nhóm thành phần tick nhanh)
 *  - editing: entry đang sửa (null = thêm mới)
 *  - duplicating: entry gốc để NHÂN BẢN (điền sẵn mọi trường, lưu thành mục MỚI)
 *  - prefill: { date, session, leaderId, leaderIds } khi click ô trống
 *  - onClose, onSaved
 */
export default function ScheduleForm({ profile, leaders, entries, groups: pGroups, editing, duplicating, prefill, onClose, onSaved }) {
  const src = editing || duplicating; // nguồn dữ liệu điền sẵn
  // Danh sách được chọn: theo quyền. Mở từ ô của một cột (prefill.leaderIds)
  // thì nhóm lãnh đạo của cột đó được ĐƯA LÊN ĐẦU, các nhóm khác vẫn chọn được.
  const allowed = useMemo(
    () => (leaders || []).filter((l) => l.active && canCreateFor(profile, l)),
    [leaders, profile]
  );

  const [leaderIds, setLeaderIds] = useState(
    src ? [src.leader_id] : prefill?.leaderId ? [prefill.leaderId] : []
  );
  const [date, setDate] = useState(src?.date || (prefill?.date ? toISODate(prefill.date) : toISODate(new Date())));
  const [session, setSession] = useState(src?.session || prefill?.session || 'sang');
  const [startTime, setStartTime] = useState(src?.start_time?.slice(0, 5) || '08:00');
  const [endTime, setEndTime] = useState(src?.end_time?.slice(0, 5) || '11:30');
  const [content, setContent] = useState(src?.content || '');
  const [location, setLocation] = useState(src?.location || '');
  const [participants, setParticipants] = useState(src?.participants || '');
  const [atOffice, setAtOffice] = useState(src?.at_office || false);
  const [groupLabel, setGroupLabel] = useState(src?.group_label || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Nhóm thành phần -> chọn nhanh ở trường Lãnh đạo. Thành viên của nhóm chính là
  // các lãnh đạo được tick trong "Danh sách thành phần" (suy ra từ members) — đồng
  // nhất với nhóm ở ô Thành phần.
  const allowedIds = useMemo(() => new Set(allowed.map((l) => l.id)), [allowed]);
  const leaderGroups = useMemo(
    () => (pGroups || []).filter((g) => groupLeaderIds(g, leaders).some((id) => allowedIds.has(id))),
    [pGroups, leaders, allowedIds]
  );
  // Chọn nhóm ở trường Lãnh đạo: chọn các lãnh đạo trong nhóm + đặt nhãn nhóm +
  // ĐIỀN THÀNH PHẦN bằng đúng danh sách của nhóm (giống hệt tick nhóm ở ô Thành phần)
  const toggleLeaderGroup = (g) => {
    const ids = groupLeaderIds(g, leaders).filter((id) => allowedIds.has(id));
    if (groupLabel === g.name) {
      setLeaderIds((prev) => prev.filter((id) => !ids.includes(id)));
      setGroupLabel('');
      removeMembers(g.members);
    } else {
      setLeaderIds((prev) => [...new Set([...prev, ...ids])]);
      setGroupLabel(g.name);
      addMembers(g.members);
    }
  };

  // Cảnh báo mềm: lãnh đạo đích danh (PCT / Đoàn ĐBQH) đã có lịch giao nhau cùng ngày
  // (các Ban có thể có nhiều hoạt động cùng buổi do nhiều thành viên — không cảnh báo)
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
  const conflicts = useMemo(() => {
    const cand = { session, start_time: session === 'gio' ? startTime : null, end_time: session === 'gio' ? endTime : null };
    return (entries || []).filter((e) =>
      e.date === date &&
      e.id !== editing?.id &&
      e.status !== 'tu_choi' &&
      leaderIds.includes(e.leader_id) &&
      ['pct', 'doan'].includes(leaderById[e.leader_id]?.leader_type) &&
      sessionsOverlap(e, cand)
    );
  }, [entries, date, session, startTime, endTime, leaderIds, editing, leaderById]);

  const toggleLeader = (id) =>
    setLeaderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Tick nhóm thành phần: chèn/gỡ chuỗi thành viên của nhóm vào ô Thành phần
  const groupChecked = (g) => participants.includes(g.members);
  const addMembers = (members) =>
    setParticipants((prev) => {
      if (!members || prev.includes(members)) return prev;
      const base = prev.trim();
      return base ? base.replace(/;?\s*$/, '') + '; ' + members : members;
    });
  const removeMembers = (members) =>
    setParticipants((prev) => {
      if (!members) return prev;
      return prev
        .replace(members, '')
        .replace(/;\s*;/g, ';')
        .replace(/^\s*;\s*|\s*;\s*$/g, '')
        .trim();
    });
  const toggleGroup = (g) => (participants.includes(g.members) ? removeMembers(g.members) : addMembers(g.members));

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim()) { setErr('Vui lòng nhập Nội dung công việc.'); return; }
    if (!atOffice && !location.trim()) { setErr('Vui lòng nhập Địa điểm.'); return; }
    if (!editing && leaderIds.length === 0) { setErr('Vui lòng chọn ít nhất một lãnh đạo.'); return; }
    setSaving(true); setErr('');

    const base = {
      date, session,
      start_time: session === 'gio' ? startTime : null,
      end_time: session === 'gio' ? endTime : null,
      content: content.trim(),
      // "Làm việc tại cơ quan": bỏ trống Địa điểm / Thành phần (chỉ hiện Nội dung + dòng chữ)
      location: atOffice ? null : (location.trim() || null),
      participants: atOffice ? null : (participants.trim() || null),
      at_office: atOffice,
      group_label: groupLabel.trim() || null,
      created_by: profile.id,
    };

    let res;
    if (editing) {
      // Sửa: lịch Ban bị từ chối sửa lại -> quay về chờ duyệt (trừ khi là "làm việc tại cơ quan")
      const leader = leaders.find((l) => l.id === editing.leader_id);
      const patch = { ...base };
      if (atOffice) { patch.status = 'da_duyet'; patch.review_note = null; }
      else if (editing.status === 'tu_choi') { patch.status = initialStatus(leader); patch.review_note = null; }
      res = await updateEntry(editing.id, patch);
    } else {
      const pairs = leaderIds.map((leaderId) => ({
        leaderId,
        // "Làm việc tại cơ quan" -> vào thẳng đã duyệt, không cần thẩm quyền phê duyệt
        status: atOffice ? 'da_duyet' : initialStatus(leaders.find((l) => l.id === leaderId)),
      }));
      res = await createEntries(base, pairs);
    }
    setSaving(false);
    if (res.error) { setErr(res.error.message); return; }
    onSaved?.();
    onClose?.();
  };

  // Nhóm để chọn: đích danh PCT / lãnh đạo Đoàn ĐBQH (giữ gợi ý xe) / các Ban / Văn phòng
  const groups = useMemo(() => {
    const out = [];
    const pct = allowed.filter((l) => l.leader_type === 'pct');
    if (pct.length) out.push({ label: 'Lãnh đạo HĐND tỉnh', items: pct });
    const doan = allowed.filter((l) => l.leader_type === 'doan');
    if (doan.length) out.push({ label: 'Đoàn ĐBQH tỉnh', items: doan });
    const banUnits = allowed.filter((l) => l.leader_type === 'ban');
    if (banUnits.length) out.push({ label: 'Các Ban của HĐND tỉnh', items: banUnits });
    const vp = allowed.filter((l) => l.leader_type === 'vanphong');
    if (vp.length) out.push({ label: 'Văn phòng', items: vp });
    // Nhóm chứa lãnh đạo của ô được bấm "+" -> đưa lên đầu danh sách
    if (prefill?.leaderIds?.length) {
      out.sort((a, b) => {
        const ap = a.items.some((i) => prefill.leaderIds.includes(i.id)) ? 0 : 1;
        const bp = b.items.some((i) => prefill.leaderIds.includes(i.id)) ? 0 : 1;
        return ap - bp;
      });
    }
    return out;
  }, [allowed, prefill]);

  const input = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl max-h-full overflow-y-auto animate-fadeUp">
        <div className="sticky top-0 bg-gradient-to-r from-red-800 to-red-700 text-white px-5 py-3.5 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><CalendarPlus className="w-5 h-5" /> {editing ? 'Sửa mục lịch công tác' : duplicating ? 'Nhân bản lịch công tác' : 'Thêm lịch công tác'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {/* Chọn lãnh đạo */}
          {!editing && (
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Lãnh đạo <span className="text-rose-600">*</span></label>
              {leaderGroups.length > 0 && (
                <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                  <p className="text-[11px] font-bold text-amber-800 mb-1">Chọn nhanh theo nhóm <span className="font-normal text-amber-700">(lịch ghi theo tên nhóm, trải đủ các đơn vị):</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {leaderGroups.map((g) => (
                      <label key={g.id} title={`Gồm: ${groupLeaderIds(g, leaders).map((id) => leaderById[id]?.full_name).filter(Boolean).join(', ')}`} className={`flex items-center gap-1.5 text-[12px] rounded-lg px-2 py-1 cursor-pointer border transition ${groupLabel === g.name ? 'bg-amber-100 border-amber-400 text-amber-900 font-semibold' : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300'}`}>
                        <input type="checkbox" checked={groupLabel === g.name} onChange={() => toggleLeaderGroup(g)} className="accent-amber-600" />
                        {g.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-1.5 space-y-2 max-h-44 overflow-y-auto border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
                {groups.length === 0 && <p className="text-[13px] text-slate-500">Bạn chưa được phân quyền nhập lịch cho lãnh đạo nào.</p>}
                {groups.map((g) => (
                  <div key={g.label}>
                    <p className="text-[11px] font-bold text-red-800 mb-1">{g.label}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {g.items.map((l) => (
                        <label key={l.id} className={`flex items-center gap-2 text-[13px] rounded-lg px-2 py-1.5 cursor-pointer border transition ${leaderIds.includes(l.id) ? 'bg-red-50 border-red-300 text-red-900 font-semibold' : 'bg-white border-slate-200 text-slate-700 hover:border-red-200'}`}>
                          <input type="checkbox" checked={leaderIds.includes(l.id)} onChange={() => toggleLeader(l.id)} className="accent-red-700" />
                          <span>{l.full_name}{l.position ? <span className="text-slate-400 font-normal"> · {l.position}</span> : null}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Thời gian */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Ngày <span className="text-rose-600">*</span></label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${input} mt-1.5`} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Buổi</label>
              <select value={session} onChange={(e) => setSession(e.target.value)} className={`${input} mt-1.5`}>
                {Object.entries(SESSIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          {session === 'gio' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Từ giờ</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${input} mt-1.5`} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Đến giờ</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={`${input} mt-1.5`} />
              </div>
            </div>
          )}

          {/* Nội dung */}
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Nội dung <span className="text-rose-600">*</span></label>
            <textarea required rows={2} value={content} onChange={(e) => setContent(e.target.value)} placeholder="VD: Giám sát chuyên đề về đầu tư công tại huyện..." className={`${input} mt-1.5 resize-y`} />
          </div>

          {/* Làm việc tại cơ quan */}
          <label className={`flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer transition ${atOffice ? 'bg-amber-50 border-amber-300' : 'bg-slate-50/60 border-slate-200 hover:border-amber-200'}`}>
            <input type="checkbox" checked={atOffice} onChange={(e) => setAtOffice(e.target.checked)} className="accent-amber-600 mt-0.5 w-4 h-4" />
            <span className="text-[13px] text-slate-700">
              <span className="font-bold text-amber-800">Làm việc tại cơ quan</span>
              <span className="block text-[12px] text-slate-500 mt-0.5">Không cần phê duyệt; trên lịch chỉ hiển thị Nội dung và dòng chữ in đậm “Làm việc tại cơ quan”.</span>
            </span>
          </label>

          {/* Địa điểm + Thành phần — ẩn khi "Làm việc tại cơ quan" */}
          {!atOffice && (
            <>
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Địa điểm <span className="text-rose-600">*</span></label>
                <input type="text" list="goi-y-dia-diem" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Chọn gợi ý hoặc gõ tự do — VD: UBND huyện Thọ Xuân" className={`${input} mt-1.5`} />
                <datalist id="goi-y-dia-diem">
                  {COMMON_LOCATIONS.map((loc) => <option key={loc} value={loc} />)}
                </datalist>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Thành phần</label>
                {(pGroups || []).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {pGroups.map((g) => (
                      <label key={g.id} title={g.members} className={`flex items-center gap-1.5 text-[12px] rounded-lg px-2 py-1 cursor-pointer border transition ${groupChecked(g) ? 'bg-red-50 border-red-300 text-red-900 font-semibold' : 'bg-white border-slate-200 text-slate-600 hover:border-red-200'}`}>
                        <input type="checkbox" checked={groupChecked(g)} onChange={() => toggleGroup(g)} className="accent-red-700" />
                        {g.name}
                      </label>
                    ))}
                  </div>
                )}
                <textarea rows={3} value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Tick nhóm ở trên hoặc gõ trực tiếp: Đ/c..., chức vụ; Đ/c..., chức vụ (có thể bỏ trống)" className={`${input} mt-1.5 resize-y`} />
              </div>
            </>
          )}

          {/* Cảnh báo trùng lịch (mềm — không chặn) */}
          {conflicts.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[13px] text-amber-800">
              <p className="font-bold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Lưu ý: trùng thời gian với lịch đã có</p>
              <ul className="mt-1 list-disc list-inside space-y-0.5">
                {conflicts.slice(0, 4).map((c) => (
                  <li key={c.id}>{fmtDM(parseISO(c.date))} · {(leaders.find((l) => l.id === c.leader_id) || {}).full_name}: {c.content}</li>
                ))}
              </ul>
              <p className="mt-1 text-[12px]">Bạn vẫn có thể lưu nếu đây là chủ đích.</p>
            </div>
          )}

          {err && <p className="text-[13px] text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {err}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">Hủy</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 disabled:opacity-60 shadow-lg shadow-red-900/20">
              <Save className="w-4 h-4" /> {saving ? 'Đang lưu...' : 'Lưu lịch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
