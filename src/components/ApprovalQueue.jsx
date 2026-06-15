import { useMemo, useState } from 'react';
import { Check, CheckCheck, XCircle, SlidersHorizontal, Inbox, MapPin, Users, Clock } from 'lucide-react';
import { reviewEntry, updateEntry } from '../lib/api';
import { canReviewEntry } from '../lib/permissions';
import DateField from './DateField';
import { SESSIONS } from '../lib/constants';
import { fmtTime, parseISO, fmtDMY, dayName, weekStart, weekEnd, toISODate } from '../lib/dates';

/**
 * Hàng chờ phê duyệt — dành cho PCT HĐND tỉnh / Quản trị.
 * Hiển thị mục 'cho_duyet' trong khoảng đang xem, nhóm theo Ban.
 * Hành động: Duyệt / Điều chỉnh (sửa + ghi chú) / Từ chối (ghi chú bắt buộc).
 */
export default function ApprovalQueue({ profile, anchor, entries, leaders, bans, dupMap, onChanged }) {
  const [busy, setBusy] = useState(null); // id đang xử lý
  const [adjusting, setAdjusting] = useState(null); // entry đang điều chỉnh
  const [rejecting, setRejecting] = useState(null); // entry đang từ chối
  const [note, setNote] = useState('');
  const [adjContent, setAdjContent] = useState('');
  const [adjDate, setAdjDate] = useState('');
  const [adjSession, setAdjSession] = useState('sang');
  const [adjLocation, setAdjLocation] = useState('');

  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
  const ws = toISODate(weekStart(anchor)), we = toISODate(weekEnd(anchor));

  const pending = useMemo(
    () => (entries || [])
      .filter((e) => e.status === 'cho_duyet' && canReviewEntry(profile, e, leaderById[e.leader_id]))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [entries, profile, leaderById]
  );
  const pendingThisWeek = pending.filter((e) => e.date >= ws && e.date <= we);

  // Nhóm theo Ban
  const groups = useMemo(() => {
    const out = [];
    for (const b of bans || []) {
      const items = pending.filter((e) => leaderById[e.leader_id]?.ban_id === b.id);
      if (items.length) out.push({ ban: b, items });
    }
    const other = pending.filter((e) => !leaderById[e.leader_id]?.ban_id);
    if (other.length) out.push({ ban: { id: '_', name: 'Khác' }, items: other });
    return out;
  }, [pending, bans, leaderById]);

  const approve = async (e) => {
    setBusy(e.id);
    await reviewEntry(e.id, 'da_duyet', null, profile.id);
    setBusy(null);
    onChanged?.();
  };

  const approveAllWeek = async () => {
    if (!window.confirm(`Duyệt tất cả ${pendingThisWeek.length} mục chờ duyệt của tuần này?`)) return;
    setBusy('all');
    for (const e of pendingThisWeek) await reviewEntry(e.id, 'da_duyet', null, profile.id);
    setBusy(null);
    onChanged?.();
  };

  const openAdjust = (e) => {
    setAdjusting(e); setRejecting(null); setNote('');
    setAdjContent(e.content); setAdjDate(e.date); setAdjSession(e.session); setAdjLocation(e.location || '');
  };

  const submitAdjust = async () => {
    if (!note.trim()) { alert('Vui lòng nhập ghi chú điều chỉnh để Văn phòng và Ban được biết.'); return; }
    setBusy(adjusting.id);
    await updateEntry(adjusting.id, {
      content: adjContent.trim(), date: adjDate, session: adjSession, location: adjLocation.trim() || null,
      status: 'da_dieu_chinh', review_note: note.trim(),
      reviewed_by: profile.id, reviewed_at: new Date().toISOString(),
    });
    setBusy(null); setAdjusting(null); setNote('');
    onChanged?.();
  };

  const submitReject = async () => {
    if (!note.trim()) { alert('Vui lòng nhập lý do từ chối.'); return; }
    setBusy(rejecting.id);
    await reviewEntry(rejecting.id, 'tu_choi', note.trim(), profile.id);
    setBusy(null); setRejecting(null); setNote('');
    onChanged?.();
  };

  const input = 'w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 transition';

  if (pending.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <Inbox className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
        <p className="font-bold text-slate-700">Không còn lịch chờ duyệt</p>
        <p className="text-sm text-slate-500 mt-1">Tất cả lịch trong khoảng thời gian đang xem đã được xử lý.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600"><b className="text-red-800">{pending.length}</b> mục đang chờ duyệt trong khoảng đang xem</p>
        {pendingThisWeek.length > 1 && (
          <button onClick={approveAllWeek} disabled={busy === 'all'} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 shadow">
            <CheckCheck className="w-4 h-4" /> Duyệt cả tuần này ({pendingThisWeek.length})
          </button>
        )}
      </div>

      {groups.map(({ ban, items }) => (
        <div key={ban.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="bg-red-800 text-white px-4 py-2 text-[13px] font-bold">{ban.name} <span className="font-normal text-red-100">— {items.length} mục</span></div>
          <div className="divide-y divide-slate-100">
            {items.map((e) => {
              const l = leaderById[e.leader_id];
              const timeLabel = e.session === 'gio' ? `${fmtTime(e.start_time)} - ${fmtTime(e.end_time)}` : SESSIONS[e.session];
              const dup = dupMap?.get(e.id);
              const dupWeek = dup?.severity === 'week';
              return (
                <div key={e.id} className={`p-4 ${dup ? (dupWeek ? 'bg-red-50 border-l-4 border-red-500' : 'bg-amber-50 border-l-4 border-amber-400') : ''}`}>
                  {dup && (
                    <p className={`inline-flex items-start gap-1.5 text-[11px] font-bold text-white rounded-md px-2 py-1 mb-2 ${dupWeek ? 'bg-red-600' : 'bg-amber-500'}`}>
                      ⚠ {dupWeek ? 'TRÙNG ĐỊA ĐIỂM TRONG TUẦN' : 'Trùng địa điểm trong năm'} "{e.location}": {dup.others.map((o) => `${fmtDMY(parseISO(o.date))}${o.name ? ` (${o.name})` : ''}`).join('; ')} — cân nhắc gộp đoàn / điều phối chung xe
                    </p>
                  )}
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-slate-800">{e.content}</p>
                      <p className="text-[12px] font-semibold text-red-800 mt-0.5">{l?.full_name}{l?.position ? ` · ${l.position}` : ''}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
                        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" /> {dayName(parseISO(e.date))}, {fmtDMY(parseISO(e.date))} · {timeLabel}</span>
                        {e.location && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {e.location}</span>}
                        {e.participants && <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-400" /> {e.participants}</span>}
                      </div>
                      {e.edit_note && (
                        <p className="mt-1 text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1"><b>Lý do chỉnh sửa:</b> <i>{e.edit_note}</i></p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => approve(e)} disabled={busy === e.id} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
                        <Check className="w-3.5 h-3.5" /> Duyệt
                      </button>
                      <button onClick={() => openAdjust(e)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white bg-sky-600 hover:bg-sky-700">
                        <SlidersHorizontal className="w-3.5 h-3.5" /> Điều chỉnh
                      </button>
                      <button onClick={() => { setRejecting(e); setAdjusting(null); setNote(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12px] font-bold text-white bg-rose-600 hover:bg-rose-700">
                        <XCircle className="w-3.5 h-3.5" /> Từ chối
                      </button>
                    </div>
                  </div>

                  {/* Form điều chỉnh inline */}
                  {adjusting?.id === e.id && (
                    <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-2.5">
                      <p className="text-[12px] font-bold text-sky-800">Điều chỉnh nội dung lịch (sẽ chuyển trạng thái "Đã điều chỉnh")</p>
                      <textarea rows={2} value={adjContent} onChange={(ev) => setAdjContent(ev.target.value)} className={input} />
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <DateField value={adjDate} onChange={setAdjDate} className={input} />
                        <select value={adjSession} onChange={(ev) => setAdjSession(ev.target.value)} className={input}>
                          {Object.entries(SESSIONS).filter(([k]) => k !== 'gio').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <input type="text" value={adjLocation} onChange={(ev) => setAdjLocation(ev.target.value)} placeholder="Địa điểm" className={input} />
                      </div>
                      <textarea rows={2} required value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Ghi chú điều chỉnh (bắt buộc) — VD: Gộp đoàn với Ban Dân tộc, xuất phát 13h00" className={input} />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setAdjusting(null)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-white">Hủy</button>
                        <button onClick={submitAdjust} disabled={busy === e.id} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white bg-sky-600 hover:bg-sky-700 disabled:opacity-60">Lưu điều chỉnh</button>
                      </div>
                    </div>
                  )}

                  {/* Form từ chối inline */}
                  {rejecting?.id === e.id && (
                    <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 p-3 space-y-2.5">
                      <p className="text-[12px] font-bold text-rose-800">Từ chối lịch — Văn phòng và Ban sẽ thấy lý do</p>
                      <textarea rows={2} required value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Lý do từ chối (bắt buộc) — VD: Trùng lịch giám sát của Thường trực" className={input} />
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setRejecting(null)} className="px-3 py-1.5 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-white">Hủy</button>
                        <button onClick={submitReject} disabled={busy === e.id} className="px-4 py-1.5 rounded-lg text-[12px] font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60">Xác nhận từ chối</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
