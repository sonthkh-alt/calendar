import { useMemo, useState } from 'react';
import { X, Save, AlertTriangle, CalendarPlus } from 'lucide-react';
import { SESSIONS, COMMON_LOCATIONS, groupLeaderIds } from '../lib/constants';
// `locations` (prop) là danh sách địa điểm gợi ý quản trị được; rỗng -> mặc định COMMON_LOCATIONS
import { canCreateFor, initialStatus, canReviewEntry } from '../lib/permissions';
import { createEntries, updateEntry, deleteEntry } from '../lib/api';
import DateField from './DateField';
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
export default function ScheduleForm({ profile, leaders, entries, groups: pGroups, locations, editing, duplicating, adjusting, prefill, onClose, onSaved }) {
  const locOptions = (locations && locations.length) ? locations : COMMON_LOCATIONS;
  // ĐIỀU CHỈNH (người duyệt) dùng chung luồng SỬA, nhưng lưu trạng thái 'da_dieu_chinh'
  // + ghi chú điều chỉnh bắt buộc. edit = mục đang sửa/điều chỉnh.
  const isAdjust = !editing && !!adjusting;
  const edit = editing || adjusting;
  const src = edit || duplicating; // nguồn dữ liệu điền sẵn
  // Danh sách được chọn: theo quyền. Mở từ ô của một cột (prefill.leaderIds)
  // thì nhóm lãnh đạo của cột đó được ĐƯA LÊN ĐẦU, các nhóm khác vẫn chọn được.
  const allowed = useMemo(
    () => (leaders || []).filter((l) => l.active && canCreateFor(profile, l)),
    [leaders, profile]
  );

  // Lãnh đạo điền sẵn: nếu sửa/nhân bản một sự kiện theo nhóm (cùng group_id) thì
  // lấy TẤT CẢ lãnh đạo của sự kiện đó (cho phép sửa cả danh sách); ngược lại 1 người.
  const [leaderIds, setLeaderIds] = useState(() => {
    if (src?.group_id) {
      const ids = [...new Set((entries || []).filter((e) => e.group_id === src.group_id).map((e) => e.leader_id))];
      if (ids.length) return ids;
    }
    if (src) return [src.leader_id];
    return prefill?.leaderId ? [prefill.leaderId] : [];
  });
  const [date, setDate] = useState(src?.date || (prefill?.date ? toISODate(prefill.date) : toISODate(new Date())));
  const [session, setSession] = useState(src?.session || prefill?.session || 'sang');
  const [startTime, setStartTime] = useState(src?.start_time?.slice(0, 5) || '08:00');
  const [endTime, setEndTime] = useState(src?.end_time?.slice(0, 5) || '11:30');
  const [content, setContent] = useState(src?.content || '');
  const [location, setLocation] = useState(src?.location || '');
  const [participants, setParticipants] = useState(src?.participants || '');
  const [atOffice, setAtOffice] = useState(src?.at_office || false);
  const [groupLabel, setGroupLabel] = useState(src?.group_label || '');
  const [adjustNote, setAdjustNote] = useState(''); // ghi chú điều chỉnh (bắt buộc khi isAdjust)
  const [editReason, setEditReason] = useState(''); // lý do chỉnh sửa (bắt buộc khi sửa lịch ĐÃ DUYỆT)
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
  // Cho phép chọn NHIỀU nhóm cùng lúc: groupLabel lưu các tên nhóm nối bằng "; ".
  const selectedGroupNames = groupLabel ? groupLabel.split(';').map((s) => s.trim()).filter(Boolean) : [];
  const isGroupSelected = (g) => selectedGroupNames.includes(g.name);

  // Chọn/bỏ nhóm ở trường Lãnh đạo: thêm/bớt các lãnh đạo trong nhóm + nhãn nhóm +
  // ĐIỀN/GỠ THÀNH PHẦN theo danh sách của nhóm (giống tick nhóm ở ô Thành phần).
  const toggleLeaderGroup = (g) => {
    const ids = groupLeaderIds(g, leaders).filter((id) => allowedIds.has(id));
    if (isGroupSelected(g)) {
      // Bỏ chọn nhóm này -> chỉ gỡ lãnh đạo KHÔNG còn thuộc nhóm khác đang chọn
      const keepIds = new Set(
        (pGroups || [])
          .filter((x) => x.name !== g.name && selectedGroupNames.includes(x.name))
          .flatMap((x) => groupLeaderIds(x, leaders))
      );
      setLeaderIds((prev) => prev.filter((id) => !ids.includes(id) || keepIds.has(id)));
      setGroupLabel(selectedGroupNames.filter((n) => n !== g.name).join('; '));
      removeMembers(g.members);
    } else {
      setLeaderIds((prev) => [...new Set([...prev, ...ids])]);
      setGroupLabel([...selectedGroupNames, g.name].join('; '));
      addMembers(g.members);
    }
  };

  // Cảnh báo mềm: lãnh đạo đích danh (PCT / Đoàn ĐBQH) đã có lịch giao nhau cùng ngày
  // (các Ban có thể có nhiều hoạt động cùng buổi do nhiều thành viên — không cảnh báo)
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);

  // SỬA LỊCH ĐÃ DUYỆT (bởi người TẠO lịch, không phải người duyệt): phải nêu lý do
  // và lịch quay về CHỜ DUYỆT để duyệt lại. (Người duyệt dùng "Điều chỉnh" -> isAdjust;
  // mục "Làm việc tại cơ quan" không cần duyệt nên cũng không tính là sửa-cần-duyệt-lại.)
  const isReviewerOfEdit = editing ? canReviewEntry(profile, editing, leaderById[editing.leader_id]) : false;
  const isReEdit = !!editing && !isAdjust && !isReviewerOfEdit && !atOffice
    && (editing.status === 'da_duyet' || editing.status === 'da_dieu_chinh');

  const conflicts = useMemo(() => {
    const cand = { session, start_time: session === 'gio' ? startTime : null, end_time: session === 'gio' ? endTime : null };
    return (entries || []).filter((e) =>
      e.date === date &&
      e.id !== edit?.id &&
      e.status !== 'tu_choi' &&
      leaderIds.includes(e.leader_id) &&
      ['pct', 'doan'].includes(leaderById[e.leader_id]?.leader_type) &&
      sessionsOverlap(e, cand)
    );
  }, [entries, date, session, startTime, endTime, leaderIds, edit, leaderById]);

  const toggleLeader = (id) =>
    setLeaderIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Chèn/gỡ chuỗi thành viên của nhóm vào ô Thành phần (dùng khi chọn nhóm ở trường Lãnh đạo)
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

  const submit = async (e) => {
    e.preventDefault();
    if (!content.trim()) { setErr('Vui lòng nhập Nội dung công việc.'); return; }
    if (!atOffice && !location.trim()) { setErr('Vui lòng nhập Địa điểm.'); return; }
    if (leaderIds.length === 0) { setErr('Vui lòng chọn ít nhất một lãnh đạo.'); return; }
    if (isAdjust && !adjustNote.trim()) { setErr('Vui lòng nhập Ghi chú điều chỉnh để Văn phòng và Ban được biết.'); return; }
    if (isReEdit && !editReason.trim()) { setErr('Lịch đã được duyệt — vui lòng nêu Lý do chỉnh sửa (lịch sẽ chờ duyệt lại).'); return; }
    setSaving(true); setErr('');

    const base = {
      date, session,
      start_time: session === 'gio' ? startTime : null,
      end_time: session === 'gio' ? endTime : null,
      content: content.trim(),
      // "Làm việc tại cơ quan": Địa điểm bỏ trống (hiện dòng chữ thay địa điểm),
      // nhưng GIỮ Thành phần để hiển thị khi in công văn.
      location: atOffice ? null : (location.trim() || null),
      participants: participants.trim() || null,
      at_office: atOffice,
      group_label: groupLabel.trim() || null,
      created_by: profile.id,
    };
    // Trạng thái cho 1 lãnh đạo (mục đang có / mới):
    // - ĐIỀU CHỈNH (người duyệt) -> 'da_dieu_chinh'
    // - at_office -> da_duyet; tu_choi sửa lại -> về trạng thái khởi tạo
    const statusFor = (leaderId, existing) => {
      if (isAdjust) return 'da_dieu_chinh';
      if (atOffice) return 'da_duyet';
      const leader = leaders.find((l) => l.id === leaderId);
      if (!existing) return initialStatus(leader, profile);
      if (existing.status === 'tu_choi') return initialStatus(leader, profile);
      // Sửa lịch ĐÃ DUYỆT/ĐÃ ĐIỀU CHỈNH (người tạo) -> quay về chờ duyệt để duyệt lại
      if (isReEdit && (existing.status === 'da_duyet' || existing.status === 'da_dieu_chinh')) return 'cho_duyet';
      return existing.status;
    };
    // Khi ĐIỀU CHỈNH: ghi ghi chú + người/thời điểm duyệt vào mọi mục
    const reviewPatch = isAdjust
      ? { review_note: adjustNote.trim(), reviewed_by: profile.id, reviewed_at: new Date().toISOString() }
      : null;

    let res = { error: null };
    if (edit) {
      // SỬA / ĐIỀU CHỈNH: cho phép đổi cả danh sách Lãnh đạo. Đối chiếu các mục của SỰ
      // KIỆN (cùng group_id) -> giữ id/xe của lãnh đạo còn lại, thêm mục cho lãnh đạo mới,
      // xóa mục của lãnh đạo bị bỏ. Mọi mục dùng CHUNG group_id để vẫn gộp với nhau.
      const groupId = edit.group_id || (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()));
      const eventEntries = edit.group_id
        ? (entries || []).filter((e) => e.group_id === edit.group_id)
        : [edit];
      const existingByLeader = Object.fromEntries(eventEntries.map((e) => [e.leader_id, e]));
      const ops = [];
      for (const lid of leaderIds) {
        const existing = existingByLeader[lid];
        const patch = { ...base, group_id: groupId, status: statusFor(lid, existing), ...(reviewPatch || {}) };
        if (!isAdjust && !atOffice && existing?.status === 'tu_choi') patch.review_note = null;
        // Sửa lịch đã duyệt -> lưu lý do chỉnh sửa + xóa thông tin duyệt cũ (chờ duyệt lại)
        if (isReEdit && existing && (existing.status === 'da_duyet' || existing.status === 'da_dieu_chinh')) {
          patch.edit_note = editReason.trim();
          patch.review_note = null; patch.reviewed_by = null; patch.reviewed_at = null;
        }
        if (existing) ops.push(updateEntry(existing.id, patch));
        else ops.push(createEntries({ ...base, group_id: groupId, ...(reviewPatch || {}) }, [{ leaderId: lid, status: statusFor(lid, null) }]));
      }
      for (const e of eventEntries) {
        if (!leaderIds.includes(e.leader_id)) ops.push(deleteEntry(e.id));
      }
      const results = await Promise.all(ops);
      res.error = results.find((r) => r?.error)?.error || null;
    } else {
      const pairs = leaderIds.map((leaderId) => ({ leaderId, status: statusFor(leaderId, null) }));
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
    if (pct.length) out.push({ label: 'Lãnh đạo TTr HĐND tỉnh', items: pct });
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
          <h2 className="font-bold flex items-center gap-2"><CalendarPlus className="w-5 h-5" /> {isAdjust ? 'Điều chỉnh lịch công tác' : editing ? 'Sửa mục lịch công tác' : duplicating ? 'Nhân bản lịch công tác' : 'Thêm lịch công tác'}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/20"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {/* Chọn lãnh đạo — hiện cả khi Sửa để cho phép đổi cả danh sách Lãnh đạo */}
          <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Lãnh đạo <span className="text-rose-600">*</span></label>
              {leaderGroups.length > 0 && (
                <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5">
                  <p className="text-[11px] font-bold text-amber-800 mb-1">Chọn nhanh theo nhóm <span className="font-normal text-amber-700">(có thể chọn nhiều nhóm; lịch ghi theo tên nhóm, trải đủ các đơn vị):</span></p>
                  <div className="flex flex-wrap gap-1.5">
                    {leaderGroups.map((g) => (
                      <label key={g.id} title={`Gồm: ${groupLeaderIds(g, leaders).map((id) => leaderById[id]?.full_name).filter(Boolean).join(', ')}`} className={`flex items-center gap-1.5 text-[12px] rounded-lg px-2 py-1 cursor-pointer border transition ${isGroupSelected(g) ? 'bg-amber-100 border-amber-400 text-amber-900 font-semibold' : 'bg-white border-slate-200 text-slate-600 hover:border-amber-300'}`}>
                        <input type="checkbox" checked={isGroupSelected(g)} onChange={() => toggleLeaderGroup(g)} className="accent-amber-600" />
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

          {/* Thời gian */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Ngày <span className="text-rose-600">*</span></label>
              <div className="mt-1.5"><DateField value={date} onChange={setDate} required className={input} /></div>
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

          {/* Địa điểm — ẩn khi "Làm việc tại cơ quan" (địa điểm là tại cơ quan) */}
          {!atOffice && (
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Địa điểm <span className="text-rose-600">*</span></label>
              <input type="text" list="goi-y-dia-diem" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Chọn gợi ý hoặc gõ tự do — VD: UBND huyện Thọ Xuân" className={`${input} mt-1.5`} />
              <datalist id="goi-y-dia-diem">
                {locOptions.map((loc) => <option key={loc} value={loc} />)}
              </datalist>
            </div>
          )}
          {/* Thành phần — LUÔN hiện (kể cả "Làm việc tại cơ quan") để in công văn */}
          <div>
            <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Thành phần</label>
            <textarea rows={3} value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Gõ trực tiếp: Đ/c..., chức vụ; Đ/c..., chức vụ (có thể bỏ trống)" className={`${input} mt-1.5 resize-y`} />
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

          {/* Lý do chỉnh sửa — bắt buộc khi NGƯỜI TẠO sửa lịch ĐÃ DUYỆT (sẽ chờ duyệt lại) */}
          {isReEdit && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3">
              <label className="text-xs font-bold text-amber-800 uppercase tracking-wide">Lý do chỉnh sửa <span className="text-rose-600">*</span></label>
              <textarea rows={2} value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="VD: Đổi địa điểm theo thông báo mới; bổ sung thành phần..." className={`${input} mt-1.5 resize-y`} />
              <p className="mt-1 text-[12px] text-amber-700">Lịch đã được duyệt — sau khi lưu sẽ chuyển về <b>“Chờ duyệt”</b> để cấp có thẩm quyền duyệt lại.</p>
            </div>
          )}

          {/* Ghi chú điều chỉnh — bắt buộc khi người duyệt ĐIỀU CHỈNH lịch */}
          {isAdjust && (
            <div>
              <label className="text-xs font-bold text-slate-600 uppercase tracking-wide">Ghi chú điều chỉnh <span className="text-rose-600">*</span></label>
              <textarea rows={2} value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} placeholder="VD: Gộp đoàn với Ban Dân tộc, xuất phát 13h00; chuyển sang chiều..." className={`${input} mt-1.5 resize-y`} />
              <p className="mt-1 text-[12px] text-slate-500">Lịch sẽ chuyển trạng thái “Đã điều chỉnh”; ghi chú hiển thị cho Văn phòng và Ban.</p>
            </div>
          )}

          {err && <p className="text-[13px] text-rose-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> {err}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100">Hủy</button>
            <button type="submit" disabled={saving} className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-60 shadow-lg ${isAdjust ? 'bg-gradient-to-r from-sky-700 to-sky-600 hover:from-sky-800 hover:to-sky-700 shadow-sky-900/20' : 'bg-gradient-to-r from-red-700 to-red-600 hover:from-red-800 hover:to-red-700 shadow-red-900/20'}`}>
              <Save className="w-4 h-4" /> {saving ? 'Đang lưu...' : isAdjust ? 'Lưu điều chỉnh' : 'Lưu lịch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
