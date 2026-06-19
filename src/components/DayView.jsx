import { useMemo, useState } from 'react';
import { Sun, Sunset, CheckCheck } from 'lucide-react';
import EntryCard from './EntryCard';
import { canEditEntry, canSeeEntry, canCreateFor, canReview, canReviewEntry } from '../lib/permissions';
import { reviewEntries } from '../lib/api';
import { toISODate, dayName, fmtDMY } from '../lib/dates';
import { isHqLocation, leaderInUnits, hidesDriver, makeEntrySorter } from '../lib/constants';

/**
 * Lịch ngày: 2 khối Sáng / Chiều, EntryCard đầy đủ thông tin.
 * props: profile, anchor, entries, leaders, vehicles, filters, onEdit, onDelete
 */
export default function DayView({ profile, anchor, entries, leaders, vehicles, truongBanIds, filters, dupMap, onEdit, onDelete, onDeleteMany, onDuplicate, onView, onChanged }) {
  const dISO = toISODate(anchor);
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
  // Sắp xếp theo ƯU TIÊN LÃNH ĐẠO (giống Lịch tuần): Sáng->Chiều rồi STT lãnh đạo
  const entrySorter = useMemo(() => makeEntrySorter(leaders), [leaders]);
  const vehicleById = useMemo(() => Object.fromEntries((vehicles || []).map((v) => [v.id, v])), [vehicles]);
  // Xe riêng theo lãnh đạo: hiện lái xe mặc định khi entry chưa gán xe
  const dedicatedByLeader = useMemo(() => Object.fromEntries(
    (vehicles || []).filter((v) => v.active && v.vehicle_type === 'rieng' && v.assigned_leader_id)
      .map((v) => [v.assigned_leader_id, v])
  ), [vehicles]);

  const dayEntries = useMemo(
    () => (entries || []).filter((e) => {
      if (e.date !== dISO) return false;
      const l = leaderById[e.leader_id];
      if (!canSeeEntry(profile, e, l)) return false;
      if (!leaderInUnits(l, filters.banIds, { truongBanIds })) return false;
      if (filters.leaderId && e.leader_id !== filters.leaderId) return false;
      if (filters.status && e.status !== filters.status) return false;
      return true;
    }),
    [entries, dISO, profile, leaderById, truongBanIds, filters]
  );

  // PHÊ DUYỆT THEO NGÀY: lịch chờ duyệt trong ngày mà người đang xem có quyền duyệt
  // (bỏ qua bộ lọc trạng thái để luôn bắt được mục chờ duyệt).
  const reviewer = canReview(profile);
  const [approving, setApproving] = useState(false);
  const pendingIds = useMemo(() => {
    if (!reviewer) return [];
    return (entries || [])
      .filter((e) => e.date === dISO && e.status === 'cho_duyet'
        && leaderInUnits(leaderById[e.leader_id], filters.banIds, { truongBanIds })
        && (!filters.leaderId || e.leader_id === filters.leaderId)
        && canReviewEntry(profile, e, leaderById[e.leader_id]))
      .map((e) => e.id);
  }, [entries, dISO, reviewer, profile, leaderById, truongBanIds, filters.banIds, filters.leaderId]);

  const approveDay = async () => {
    if (!pendingIds.length || approving) return;
    if (!window.confirm(`Phê duyệt TẤT CẢ ${pendingIds.length} lịch chờ duyệt của ${dayName(anchor)}, ${fmtDMY(anchor)}?`)) return;
    setApproving(true);
    const { error } = await reviewEntries(pendingIds, 'da_duyet', null, profile.id);
    setApproving(false);
    if (error) { alert('Không phê duyệt được: ' + error.message); return; }
    onChanged?.();
  };

  const morning = dayEntries.filter((e) =>
    e.session === 'sang' || e.session === 'ca_ngay' || (e.session === 'gio' && (e.start_time || '08:00') < '12:00'));
  const afternoon = dayEntries.filter((e) =>
    e.session === 'chieu' || e.session === 'ca_ngay' || (e.session === 'gio' && (e.start_time || '08:00') >= '12:00'));

  // Gộp các mục giống nhau (cùng nội dung + buổi/giờ + địa điểm, vd nhóm nhiều đơn vị)
  const mergeEntries = (list) => {
    const map = new Map();
    const out = [];
    for (const e of list) {
      // Lịch ĐÃ TỪ CHỐI gộp riêng để tách khỏi thẻ bình thường (gạch ngang riêng).
      const key = `${e.content}|${e.session}|${e.start_time || ''}|${(e.location || '').trim().toLowerCase()}|${e.status === 'tu_choi' ? 'tc' : ''}`;
      const m = map.get(key);
      if (!m) {
        out.push({ orig: e, ids: [e.id], leaderIds: [e.leader_id], parts: e.participants ? [e.participants] : [] });
        map.set(key, out[out.length - 1]);
      } else {
        m.ids.push(e.id);
        if (!m.leaderIds.includes(e.leader_id)) m.leaderIds.push(e.leader_id);
        if (e.participants && !m.parts.includes(e.participants)) m.parts.push(e.participants);
      }
    }
    return out;
  };

  const renderList = (list) => (
    <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
      {list.length === 0 && <p className="text-[13px] text-slate-400 italic col-span-full">Không có lịch.</p>}
      {mergeEntries([...list].sort(entrySorter))
        .map((m) => {
          const e = m.orig;
          const l = leaderById[e.leader_id];
          const names = m.leaderIds.map((id) => leaderById[id]?.full_name).filter(Boolean);
          return (
            <EntryCard
              key={e.id}
              entry={{ ...e, participants: m.parts.join('; ') }}
              leader={l ? { ...l, full_name: names.join('; ') } : null}
              vehicle={hidesDriver(l?.leader_type) ? null : ((e.vehicle_id ? vehicleById[e.vehicle_id] : null) || (!isHqLocation(e.location) ? dedicatedByLeader[e.leader_id] : null) || null)}
              canEdit={canEditEntry(profile, e, l)}
              canDuplicate={canCreateFor(profile, l)}
              dupInfo={dupMap?.get(e.id)}
              onEdit={() => onEdit?.(e)}
              onDelete={() => (m.ids.length > 1 && onDeleteMany ? onDeleteMany(m.ids, e.content) : onDelete?.(e))}
              onDuplicate={() => onDuplicate?.(e)}
              onView={() => onView?.(e)}
            />
          );
        })}
    </div>
  );

  return (
    <div className="space-y-4">
      {reviewer && pendingIds.length > 0 && (
        <div className="no-print flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
          <p className="text-[13px] font-semibold text-emerald-800">
            Có <b>{pendingIds.length}</b> lịch chờ duyệt trong ngày {fmtDMY(anchor)}.
          </p>
          <button
            onClick={approveDay}
            disabled={approving}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 shadow-sm transition"
          >
            <CheckCheck className="w-4 h-4" /> {approving ? 'Đang duyệt…' : `Duyệt cả ngày (${pendingIds.length})`}
          </button>
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-amber-500 to-amber-400 text-white px-4 py-2 flex items-center gap-2 text-[13px] font-bold">
          <Sun className="w-4 h-4" /> Buổi sáng
        </div>
        {renderList(morning)}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-sky-700 to-sky-600 text-white px-4 py-2 flex items-center gap-2 text-[13px] font-bold">
          <Sunset className="w-4 h-4" /> Buổi chiều
        </div>
        {renderList(afternoon)}
      </div>
    </div>
  );
}
