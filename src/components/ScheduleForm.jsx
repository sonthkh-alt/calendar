import { useMemo, useState } from 'react';
import { X, Save, AlertTriangle, CalendarPlus } from 'lucide-react';
import { SESSIONS } from '../lib/constants';
import { canCreateFor, initialStatus } from '../lib/permissions';
import { createEntries, updateEntry } from '../lib/api';
import { toISODate, sessionsOverlap, parseISO, fmtDM } from '../lib/dates';

/**
 * Modal thêm / sửa mục lịch. Bắt buộc đủ 4 mục: Nội dung, Thời gian, Địa điểm, Thành phần.
 * props:
 *  - profile, leaders, entries (để cảnh báo trùng), groups (nhóm thành phần tick nhanh)
 *  - editing: entry đang sửa (null = thêm mới)
 *  - prefill: { date, session, leaderId } khi click ô trống
 *  - onClose, onSaved
 */
export default function ScheduleForm({ profile, leaders, entries, groups: pGroups, editing, prefill, onClose, onSaved }) {
  const allowed = useMemo(
    () => (leaders || []).filter((l) => l.active && canCreateFor(profile, l)),
    [leaders, profile]
  );

  const [leaderIds, setLeaderIds] = useState(
    editing ? [editing.leader_id] : prefill?.leaderId ? [prefill.leaderId] : []
  );
  const [date, setDate] = useState(editing?.date || (prefill?.date ? toISODate(prefill.date) : toISODate(new Date())));
  const [session, setSession] = useState(editing?.session || prefill?.session || 'sang');
  const [startTime, setStartTime] = useState(editing?.start_time?.slice(0, 5) || '08:00');
  const [endTime, setEndTime] = useState(editing?.end_time?.slice(0, 5) || '11:30');
  const [content, setContent] = useState(editing?.content || '');
  const [location, setLocation] = useState(editing?.location || '');
  const [participants, setParticipants] = useState(editing?.participants || '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

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
  const toggleGroup = (g) => {
    setParticipants((prev) => {
      if (prev.includes(g.members)) {
        return prev
          .replace(g.members, '')
          .replace(/;\s*;/g, ';')
          .replace(/^\s*;\s*|\s*;\s*$/g, '')
          .trim();
      }
      const base = prev.trim();
      if (!base) return g.members;
      return base.replace(/;?\s*$/, '') + '; ' + g.members;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim()) { setErr('Vui lòng nhập Nội dung công việc.'); return; }
    if (!location.trim()) { setErr('Vui lòng nhập Địa điểm.'); return; }
    if (!participants.trim()) { setErr('Vui lòng nhập Thành phần (ai dự) — có thể tick nhanh các nhóm bên dưới.'); return; }
    if (!editing && leaderIds.length === 0) { setErr('Vui lòng chọn ít nhất một lãnh đạo.'); return; }
    setSaving(true); setErr('');

    const base = {
      date, session,
      start_time: session === 'gio' ? startTime : null,
      end_time: session === 'gio' ? endTime : null,
      content: content.trim(),
      location: location.trim() || null,
      participants: participants.trim() || null,
      created_by: profile.id,
    };

    let res;
    if (editing) {
      // Sửa: lịch Ban bị từ chối sửa lại -> quay về chờ duyệt
      const leader = leaders.find((l) => l.id === editing.leader_id);
      const patch = { ...base };
      if (editing.status === 'tu_choi') { patch.status = initialStatus(leader); patch.review_note = null; }
      res = await updateEntry(editing.id, patch);
    } else {
      const pairs = leaderIds.map((leaderId) => ({
        leaderId,
        status: initialStatus(leaders.find((l) => l.id === leaderId)),
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
    return out;
  }, [allowed]);

  const input = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl max-h-full overflow-y-auto animate-fadeUp">
        <div className="sticky top-0 bg-gradient-to-r from-red-800 to-red-700 text-white px-5 py-3.5 rounded-t-2xl flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2"><CalendarPlus className="w-5 h-5" /> {editing ? 'Sửa mục lịch công tác' : 'Thêm lịch công tác'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {/* Chọn lãnh đạo */}
          {!editing && (
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Lãnh đạo <span className="text-rose-600">*</span></label>
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
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Địa điểm <span className="text-rose-600">*</span></label>
            <input type="text" required value={location} onChange={(e) => setLocation(e.target.value)} placeholder="VD: UBND huyện Thọ Xuân" className={`${input} mt-1.5`} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Thành phần <span className="text-rose-600">*</span></label>
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
            <textarea rows={3} required value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Tick nhóm ở trên hoặc gõ trực tiếp: Đ/c..., chức vụ; Đ/c..., chức vụ" className={`${input} mt-1.5 resize-y`} />
          </div>

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
