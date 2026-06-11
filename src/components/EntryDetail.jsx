import { useMemo } from 'react';
import { X, Clock, MapPin, Users, Car, MessageSquareText, Pencil, Trash2, Building2, Copy } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { SESSIONS, UNIT_GROUP_LABELS } from '../lib/constants';
import { fmtTime, fmtDMY, dayName, parseISO } from '../lib/dates';

/**
 * Modal chi tiết 1 mục lịch — hiển thị ĐẦY ĐỦ, không cắt chữ.
 * Các mục TRÙNG nội dung + thời gian (chỉ khác thành phần, vd cùng hội nghị
 * cho cả Lãnh đạo HĐND và Đoàn ĐBQH) được GỘP: thành phần nối lại với nhau.
 * props: entry, entries, leaders, vehicles, canEdit, onEdit, onDelete, onClose
 */
export default function EntryDetail({ entry, entries, leaders, vehicles, canEdit, canDuplicate, dupWarn, onEdit, onDelete, onDuplicate, onClose }) {
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);
  const vehicleById = useMemo(() => Object.fromEntries((vehicles || []).map((v) => [v.id, v])), [vehicles]);

  // Gộp các mục trùng nội dung + ngày + thời gian (khác thành phần / đơn vị)
  const same = useMemo(
    () => (entries || []).filter((e) =>
      e.content === entry.content &&
      e.date === entry.date &&
      e.session === entry.session &&
      (e.start_time || '') === (entry.start_time || '') &&
      e.status !== 'tu_choi'
    ),
    [entries, entry]
  );
  const merged = same.length > 0 ? same : [entry];

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
    merged.map((e) => (e.vehicle_id ? vehicleById[e.vehicle_id] : dedicatedByLeader[e.leader_id]))
      .filter(Boolean).map((v) => [v.id, v])
  ).values()];

  const d = parseISO(entry.date);
  const timeLabel = entry.session === 'gio'
    ? `${fmtTime(entry.start_time)}${entry.end_time ? ' - ' + fmtTime(entry.end_time) : ''}`
    : SESSIONS[entry.session];

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
          {dupWarn && (
            <p className="flex items-start gap-2 text-[13px] font-bold text-violet-900 bg-violet-50 border border-violet-300 rounded-xl p-3">
              ⚠️ Trong tuần này có lịch khác của các Ban cũng tới địa điểm "{entry.location}" — đề nghị cân nhắc gộp đoàn hoặc điều phối chung xe.
            </p>
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
              <p className={val}>{leaderNames.join('; ') || unitLabels.join(' · ') || '—'}</p>
            </div>
          </div>

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

          {/* Lái xe / Xe phục vụ — luôn hiển thị */}
          <div className={row}>
            <Car className={ic} />
            <div>
              <p className={lab}>Lái xe / Xe phục vụ</p>
              <p className={val}>{mergedVehicles.length > 0
                ? mergedVehicles.map((v) => `${[v.driver_name, v.plate].filter(Boolean).join(' · ')}${v.driver_phone ? ` (${v.driver_phone})` : ''}`).join('; ')
                : '—'}</p>
            </div>
          </div>

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
