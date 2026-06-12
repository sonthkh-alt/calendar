import { useMemo } from 'react';
import { Sun, Sunset } from 'lucide-react';
import EntryCard from './EntryCard';
import { canEditEntry, canSeeEntry, canCreateFor } from '../lib/permissions';
import { toISODate } from '../lib/dates';
import { isHqLocation, leaderInUnit, hidesDriver } from '../lib/constants';

/**
 * Lịch ngày: 2 khối Sáng / Chiều, EntryCard đầy đủ thông tin.
 * props: profile, anchor, entries, leaders, vehicles, filters, onEdit, onDelete
 */
export default function DayView({ profile, anchor, entries, leaders, vehicles, filters, dupMap, onEdit, onDelete, onDeleteMany, onDuplicate, onView }) {
  const dISO = toISODate(anchor);
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
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
      if (!leaderInUnit(l, filters.banId)) return false;
      if (filters.leaderId && e.leader_id !== filters.leaderId) return false;
      if (filters.status && e.status !== filters.status) return false;
      return true;
    }),
    [entries, dISO, profile, leaderById, filters]
  );

  const morning = dayEntries.filter((e) =>
    e.session === 'sang' || e.session === 'ca_ngay' || (e.session === 'gio' && (e.start_time || '08:00') < '12:00'));
  const afternoon = dayEntries.filter((e) =>
    e.session === 'chieu' || e.session === 'ca_ngay' || (e.session === 'gio' && (e.start_time || '08:00') >= '12:00'));

  // Gộp các mục giống nhau (cùng nội dung + buổi/giờ + địa điểm, vd nhóm nhiều đơn vị)
  const mergeEntries = (list) => {
    const map = new Map();
    const out = [];
    for (const e of list) {
      const key = `${e.content}|${e.session}|${e.start_time || ''}|${(e.location || '').trim().toLowerCase()}`;
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
      {mergeEntries(list.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || '')))
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
