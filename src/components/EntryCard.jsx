import { MapPin, Users, Clock, Car, Pencil, Trash2, MessageSquareText } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { STATUS, SESSIONS, UNIT_GROUP_LABELS } from '../lib/constants';
import { fmtTime } from '../lib/dates';

/**
 * Ô hiển thị 1 mục lịch — dùng chung cho WeekView / DayView / ApprovalQueue.
 * props: entry, leader, vehicle, showLeader, canEdit, onEdit, onDelete, compact
 */
export default function EntryCard({ entry, leader, vehicle, showLeader, canEdit, onEdit, onDelete, compact }) {
  const s = STATUS[entry.status] || STATUS.cho_duyet;
  const timeLabel = entry.session === 'gio'
    ? `${fmtTime(entry.start_time)}${entry.end_time ? ' - ' + fmtTime(entry.end_time) : ''}`
    : SESSIONS[entry.session];

  return (
    <div className={`group relative rounded-lg border ${s.border} ${s.bg} px-2 py-1.5 text-left ${entry.status === 'tu_choi' ? 'opacity-75' : ''}`}>
      <div className="flex items-start justify-between gap-1">
        <p className={`text-[12px] font-semibold leading-snug text-slate-800 ${entry.status === 'tu_choi' ? 'line-through' : ''}`}>
          {entry.content}
        </p>
        {canEdit && (
          <span className="hidden group-hover:flex items-center gap-0.5 shrink-0 no-print">
            <button title="Sửa" onClick={() => onEdit?.(entry)} className="p-0.5 rounded hover:bg-white/80 text-slate-500 hover:text-sky-700"><Pencil className="w-3 h-3" /></button>
            <button title="Xóa" onClick={() => onDelete?.(entry)} className="p-0.5 rounded hover:bg-white/80 text-slate-500 hover:text-rose-700"><Trash2 className="w-3 h-3" /></button>
          </span>
        )}
      </div>

      {showLeader && leader && (
        <p className="text-[11px] font-medium text-red-800 mt-0.5">{UNIT_GROUP_LABELS[leader.leader_type] || leader.full_name}</p>
      )}

      <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
        <p className="flex items-center gap-1"><Clock className="w-3 h-3 shrink-0 text-slate-400" /> {timeLabel}</p>
        {entry.location && <p className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0 text-slate-400" /> {entry.location}</p>}
        {!compact && entry.participants && (
          <p className="flex items-start gap-1"><Users className="w-3 h-3 shrink-0 text-slate-400 mt-0.5" /> <span className="line-clamp-2">{entry.participants}</span></p>
        )}
        {vehicle && (
          <p className="flex items-center gap-1 font-medium text-slate-700"><Car className="w-3 h-3 shrink-0 text-slate-500" /> {vehicle.plate}{vehicle.driver_name ? ` · ${vehicle.driver_name}` : ''}</p>
        )}
        {entry.review_note && (
          <p className={`flex items-start gap-1 italic ${s.text}`}><MessageSquareText className="w-3 h-3 shrink-0 mt-0.5" /> {entry.review_note}</p>
        )}
      </div>

      <div className="mt-1"><StatusBadge status={entry.status} small /></div>
    </div>
  );
}
