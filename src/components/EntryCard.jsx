import { MapPin, Users, Clock, Car, Pencil, Trash2, MessageSquareText, UserRound, Copy, AlertTriangle, Building2 } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { STATUS, SESSIONS } from '../lib/constants';
import { fmtTime, fmtDM, parseISO } from '../lib/dates';

/**
 * Ô hiển thị 1 mục lịch — LUÔN đủ 6 mục (thiếu thì để trống "—"):
 * Nội dung, Lãnh đạo, Thời gian, Địa điểm, Thành phần, Lái xe.
 * `vehicle` do cha truyền vào: xe đã gán, hoặc xe riêng của lãnh đạo (PCT /
 * Phó Trưởng Đoàn) nếu chưa gán. Bấm vào ô để mở chi tiết đầy đủ.
 */
export default function EntryCard({ entry, leader, vehicle, canEdit, canDuplicate, dupOthers, onEdit, onDelete, onDuplicate, onView, compact }) {
  const dupWarn = dupOthers?.length > 0;
  const dupDetail = dupWarn
    ? dupOthers.map((o) => `${fmtDM(parseISO(o.date))} (${o.name})`).join(', ')
    : '';
  const s = STATUS[entry.status] || STATUS.cho_duyet;
  const timeLabel = entry.session === 'gio'
    ? `${fmtTime(entry.start_time)}${entry.end_time ? ' - ' + fmtTime(entry.end_time) : ''}`
    : SESSIONS[entry.session];
  const driverLabel = vehicle
    ? [vehicle.driver_name, vehicle.plate].filter(Boolean).join(' · ')
    : '—';

  return (
    <div
      onClick={() => onView?.(entry)}
      title="Bấm để xem đầy đủ thông tin"
      className={`group relative rounded-lg border px-2 py-1.5 text-left ${entry.status === 'tu_choi' ? 'opacity-75' : ''} ${onView ? 'cursor-pointer transition' : ''}
        ${dupWarn ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-300 shadow-md shadow-violet-200' : `${s.border} ${s.bg} ${onView ? 'hover:ring-2 hover:ring-red-200' : ''}`}`}
    >
      {dupWarn && (
        <p className="flex items-start gap-1 text-[10px] font-bold text-white bg-violet-600 rounded px-1.5 py-0.5 mb-1 -mx-0.5" title={`Trùng địa điểm với: ${dupDetail} — cân nhắc gộp đoàn`}>
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span className={compact ? 'line-clamp-2' : ''}>TRÙNG ĐỊA ĐIỂM với: {dupDetail}</span>
        </p>
      )}
      <div className="flex items-start justify-between gap-1">
        <p className={`text-[12px] font-semibold leading-snug text-slate-800 ${entry.status === 'tu_choi' ? 'line-through' : ''}`}>
          {entry.content}
        </p>
        {(canEdit || canDuplicate) && (
          <span className="hidden group-hover:flex items-center gap-0.5 shrink-0 no-print">
            {canDuplicate && (
              <button title="Nhân bản (tạo mục mới giống mục này)" onClick={(e) => { e.stopPropagation(); onDuplicate?.(entry); }} className="p-0.5 rounded hover:bg-white/80 text-slate-500 hover:text-emerald-700"><Copy className="w-3 h-3" /></button>
            )}
            {canEdit && (
              <>
                <button title="Sửa" onClick={(e) => { e.stopPropagation(); onEdit?.(entry); }} className="p-0.5 rounded hover:bg-white/80 text-slate-500 hover:text-sky-700"><Pencil className="w-3 h-3" /></button>
                <button title="Xóa" onClick={(e) => { e.stopPropagation(); onDelete?.(entry); }} className="p-0.5 rounded hover:bg-white/80 text-slate-500 hover:text-rose-700"><Trash2 className="w-3 h-3" /></button>
              </>
            )}
          </span>
        )}
      </div>

      <div className="mt-1 space-y-0.5 text-[11px] text-slate-600">
        <p className="flex items-start gap-1 font-medium text-red-800">
          <UserRound className="w-3 h-3 shrink-0 mt-0.5" /> <span>{leader?.full_name || '—'}</span>
        </p>
        {entry.at_office ? (
          /* Làm việc tại cơ quan: chỉ Nội dung (ở trên) + dòng chữ in đậm nổi bật */
          <p className="flex items-center gap-1 mt-1 font-bold text-amber-800 bg-amber-100 rounded px-1.5 py-1">
            <Building2 className="w-3.5 h-3.5 shrink-0" /> <span>Làm việc tại cơ quan</span>
          </p>
        ) : (
          <>
            <p className="flex items-center gap-1"><Clock className="w-3 h-3 shrink-0 text-slate-400" /> {timeLabel}</p>
            <p className="flex items-start gap-1"><MapPin className="w-3 h-3 shrink-0 text-slate-400 mt-0.5" /> <span>{entry.location || '—'}</span></p>
            <p className="flex items-start gap-1" title={entry.participants || ''}>
              <Users className="w-3 h-3 shrink-0 text-slate-400 mt-0.5" />
              <span className={compact ? 'line-clamp-3' : ''}><b className="font-semibold">TP:</b> {entry.participants || '—'}</span>
            </p>
            <p className="flex items-center gap-1 font-medium text-slate-700">
              <Car className="w-3 h-3 shrink-0 text-slate-500" /> <span><b className="font-semibold">Lái xe:</b> {driverLabel}</span>
            </p>
          </>
        )}
        {entry.review_note && (
          <p className={`flex items-start gap-1 italic ${s.text}`}><MessageSquareText className="w-3 h-3 shrink-0 mt-0.5" /> {entry.review_note}</p>
        )}
      </div>

      <div className="mt-1"><StatusBadge status={entry.status} small /></div>
    </div>
  );
}
