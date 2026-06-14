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
export default function EntryCard({ entry, leader, vehicle, canEdit, canDuplicate, dupInfo, onEdit, onDelete, onDuplicate, onView, compact, brief, unitTint }) {
  const dupOthers = dupInfo?.others;
  const dupWarn = dupOthers?.length > 0;
  const dupWeek = dupInfo?.severity === 'week'; // cùng tuần -> ĐỎ; cả năm -> VÀNG
  const dupDetail = dupWarn
    ? dupOthers.map((o) => `${fmtDM(parseISO(o.date))}${o.name ? ` (${o.name})` : ''}`).join(', ')
    : '';
  const s = STATUS[entry.status] || STATUS.cho_duyet;
  const rejected = entry.status === 'tu_choi'; // từ chối -> gạch ngang TẤT CẢ thông tin
  // Tô nền theo ĐƠN VỊ: TTr HĐND tỉnh (pct) nền XANH đậm hơn chút so với các Ban/đơn vị
  // khác; Đoàn ĐBQH (doan) vàng nhạt — để phân biệt nhanh với các thành phần khác.
  const unitAccent = (unitTint && !rejected)
    ? (leader?.leader_type === 'pct' ? 'border-emerald-400 bg-emerald-100'
      : leader?.leader_type === 'doan' ? 'border-yellow-300 bg-yellow-100'
        : null)
    : null;
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
        ${dupWarn
          ? (dupWeek
              ? 'border-red-500 bg-red-50 ring-2 ring-red-300 shadow-md shadow-red-200'
              : 'border-amber-400 bg-amber-50 ring-2 ring-amber-300 shadow-md shadow-amber-200')
          : `${unitAccent || `${s.border} ${s.bg}`} ${onView ? 'hover:ring-2 hover:ring-red-200' : ''}`}`}
    >
      {dupWarn && (
        <p className={`flex items-start gap-1 text-[10px] font-bold text-white rounded px-1.5 py-0.5 mb-1 -mx-0.5 ${dupWeek ? 'bg-red-600' : 'bg-amber-500'}`}
           title={`${dupWeek ? 'TRÙNG ĐỊA ĐIỂM trong TUẦN' : 'Trùng địa điểm trong năm'}: ${dupDetail} — cân nhắc gộp đoàn / điều phối chung xe`}>
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
          <span className={compact ? 'line-clamp-2' : ''}>{dupWeek ? 'TRÙNG ĐỊA ĐIỂM TRONG TUẦN' : 'Trùng địa điểm trong năm'}: {dupDetail}</span>
        </p>
      )}
      <div className="flex items-start justify-between gap-1">
        {/* Khung GIỜ nổi bật (to ~1.15 lần, in đậm) đứng TRƯỚC nội dung; nội dung
            chảy inline nên khi xuống dòng sẽ canh về cùng đầu hàng với icon đồng hồ. */}
        <p className={`text-[12px] font-semibold leading-snug text-slate-800 min-w-0 ${rejected ? 'line-through decoration-rose-500/70 text-slate-400' : ''}`}>
          <span className="inline-flex items-center gap-1 align-bottom mr-1 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-[13px] font-bold leading-none text-red-700">
            <Clock className="w-[15px] h-[15px] shrink-0" /> {timeLabel}
          </span>
          <span>{entry.content}</span>
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

      <div className={`mt-1 space-y-0.5 text-[11px] text-slate-600 ${rejected ? 'line-through decoration-rose-500/70 text-slate-400' : ''}`}>
        <p className="flex items-start gap-1 font-medium text-red-800">
          <UserRound className="w-3 h-3 shrink-0 mt-0.5" /> <span>{entry.group_label || leader?.full_name || '—'}</span>
        </p>
        {entry.at_office ? (
          /* Làm việc tại cơ quan: chỉ Nội dung (ở trên) + dòng chữ in đậm nổi bật */
          <p className="flex items-center gap-1 mt-1 font-bold text-amber-800 bg-amber-100 rounded px-1.5 py-1">
            <Building2 className="w-3.5 h-3.5 shrink-0" /> <span>Làm việc tại cơ quan</span>
          </p>
        ) : (
          <>
            <p className="flex items-start gap-1"><MapPin className="w-3 h-3 shrink-0 text-slate-400 mt-0.5" /> <span>{entry.location || '—'}</span></p>
            {!brief && (
              <>
                <p className="flex items-start gap-1" title={entry.participants || ''}>
                  <Users className="w-3 h-3 shrink-0 text-slate-400 mt-0.5" />
                  <span className={compact ? 'line-clamp-3' : ''}><b className="font-semibold">TP:</b> {entry.participants || '—'}</span>
                </p>
                <p className="flex items-center gap-1 font-medium text-slate-700">
                  <Car className="w-3 h-3 shrink-0 text-slate-500" /> <span><b className="font-semibold">Lái xe:</b> {driverLabel}</span>
                </p>
              </>
            )}
          </>
        )}
        {entry.review_note && (
          <p className={`flex items-start gap-1 italic no-underline ${rejected ? 'text-rose-700' : s.text}`}><MessageSquareText className="w-3 h-3 shrink-0 mt-0.5" /> {entry.review_note}</p>
        )}
      </div>

      <div className="mt-1"><StatusBadge status={entry.status} small /></div>
    </div>
  );
}
