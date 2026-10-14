import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, X, Save, Trash2, Gauge, Route, Fuel, CheckCircle2, AlertTriangle, ExternalLink } from 'lucide-react';
import { saveVehicleLog, uploadOdoPhoto, deleteOdoPhoto, getOdoPhotoUrl, deleteVehicleLog } from '../lib/api';
import { MAX_DAILY_KM, fmtKm, lastReading, suggestRoute } from '../lib/vehicleLog';
import { canManageVehicleLog } from '../lib/permissions';
import { compressImage } from '../lib/images';
import { fmtDMY, parseISO, dayName } from '../lib/dates';

// Ảnh trong kho (bucket riêng tư) -> link có hạn; cache trong phiên
const urlCache = new Map();
export function OdoPhoto({ path, className = 'w-16 h-16', label }) {
  const [url, setUrl] = useState(() => urlCache.get(path) || null);
  useEffect(() => {
    let alive = true;
    if (!path || urlCache.has(path)) { setUrl(urlCache.get(path) || null); return undefined; }
    getOdoPhotoUrl(path).then(({ data }) => {
      if (data?.signedUrl) urlCache.set(path, data.signedUrl);
      if (alive) setUrl(data?.signedUrl || null);
    });
    return () => { alive = false; };
  }, [path]);
  if (!path) return null;
  return (
    <a href={url || undefined} target="_blank" rel="noreferrer" title={`Mở ảnh ${label || ''} cỡ lớn`}
      className={`${className} relative block rounded-lg overflow-hidden border border-slate-300 bg-slate-100 shrink-0`}>
      {url ? <img src={url} alt={`Ảnh đồng hồ ODO ${label || ''}`} className="w-full h-full object-cover" /> : <Loader2 className="w-4 h-4 animate-spin text-slate-400 absolute inset-0 m-auto" />}
    </a>
  );
}

const digits = (s) => (s == null ? '' : String(s).replace(/\D+/g, ''));
const toInt = (s) => { const d = digits(s); return d ? parseInt(d, 10) : null; };
const fmtInput = (s) => { const d = digits(s); return d ? Number(d).toLocaleString('vi-VN') : ''; };

// Một khối "lúc xuất phát" / "lúc về": gõ số HOẶC chụp/gửi ảnh đồng hồ
function ReadingBlock({ title, hint, value, onValue, photoPath, newPhoto, onPhoto, onClearPhoto, disabled, tone }) {
  const camRef = useRef(null);
  const pickRef = useRef(null);
  const preview = useMemo(() => (newPhoto ? URL.createObjectURL(newPhoto) : null), [newPhoto]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${tone}`}>
      <p className="text-[13px] font-bold text-slate-800">{title}</p>
      <p className="text-[11.5px] text-slate-500 mb-2">{hint}</p>
      <div className="flex items-center gap-2 bg-white border border-slate-300 rounded-lg px-3 focus-within:border-red-500">
        <Gauge className="w-5 h-5 text-slate-400 shrink-0" />
        <input inputMode="numeric" pattern="[0-9.]*" disabled={disabled} value={value} onChange={(e) => onValue(fmtInput(e.target.value))}
          placeholder="Gõ số ODO (km)" className="flex-1 min-w-0 py-2.5 text-[20px] font-bold tabular-nums outline-none bg-transparent disabled:text-slate-400" />
        <span className="text-[13px] text-slate-400">km</span>
      </div>
      <div className="flex items-center gap-2 mt-2">
        {(preview || photoPath) && (
          <div className="relative">
            {preview
              ? <img src={preview} alt="Ảnh đồng hồ mới chọn" className="w-16 h-16 rounded-lg object-cover border border-slate-300" />
              : <OdoPhoto path={photoPath} label={title} />}
            {!disabled && (
              <button type="button" onClick={onClearPhoto} title="Bỏ ảnh" className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
            )}
          </div>
        )}
        {!disabled && (
          <div className="flex flex-col gap-1.5 flex-1">
            <button type="button" onClick={() => camRef.current?.click()} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-[13px] font-semibold active:scale-[0.98]">
              <Camera className="w-4 h-4" /> Chụp ảnh đồng hồ
            </button>
            <button type="button" onClick={() => pickRef.current?.click()} className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-[12.5px] font-semibold">
              <ImagePlus className="w-4 h-4" /> Chọn ảnh có sẵn
            </button>
          </div>
        )}
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        <input ref={pickRef} type="file" accept="image/*" className="hidden" onChange={(e) => { onPhoto(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    </div>
  );
}

/**
 * Form cập nhật nhật trình MỘT xe MỘT ngày.
 * props: profile, vehicle, date (ISO), log (dòng hiện có | null), prevLog (lần ghi trước | null),
 *        trips (chuyến công tác trong ngày theo lịch), drivers (hồ sơ lái xe — cho người quản lý),
 *        canEdit, onSaved(), onClose (nếu hiển thị dạng hộp thoại)
 */
export default function OdoForm({ profile, vehicle, date, log, prevLog, trips = [], drivers = [], canEdit = true, onSaved, onClose }) {
  const manager = canManageVehicleLog(profile);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [route, setRoute] = useState('');
  const [fuel, setFuel] = useState('');
  const [note, setNote] = useState('');
  const [driverId, setDriverId] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [photoStart, setPhotoStart] = useState(null); // path đang lưu
  const [photoEnd, setPhotoEnd] = useState(null);
  const [newStart, setNewStart] = useState(null);     // File mới chọn
  const [newEnd, setNewEnd] = useState(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState(null); // { ok, text }

  // Nạp lại khi đổi xe / ngày / dữ liệu
  useEffect(() => {
    setStart(log?.odo_start != null ? Number(log.odo_start).toLocaleString('vi-VN') : '');
    setEnd(log?.odo_end != null ? Number(log.odo_end).toLocaleString('vi-VN') : '');
    setRoute(log?.route || '');
    setFuel(log?.fuel_liters != null ? String(log.fuel_liters).replace('.', ',') : '');
    setNote(log?.note || '');
    setDriverId(log?.driver_id || (profile?.role === 'lai_xe' ? profile.id : ''));
    setConfirm(log?.status === 'da_xac_nhan');
    setPhotoStart(log?.photo_start_path || null);
    setPhotoEnd(log?.photo_end_path || null);
    setNewStart(null); setNewEnd(null); setMsg(null);
  }, [log, vehicle?.id, date, profile]);

  const prevValue = lastReading(prevLog);
  const sNum = toInt(start), eNum = toInt(end);
  const base = sNum ?? prevValue;
  const km = eNum != null && base != null ? eNum - base : null;
  const confirmed = log?.status === 'da_xac_nhan';
  const locked = !canEdit;

  const save = async () => {
    setMsg(null);
    const hasStart = sNum != null || photoStart || newStart;
    const hasEnd = eNum != null || photoEnd || newEnd;
    if (!hasStart && !hasEnd) { setMsg({ ok: false, text: 'Hãy gõ số ODO hoặc gửi ảnh đồng hồ (lúc xuất phát hoặc lúc về).' }); return; }
    if (sNum != null && eNum != null && eNum < sNum) { setMsg({ ok: false, text: 'ODO lúc về không được nhỏ hơn ODO lúc xuất phát.' }); return; }
    const first = sNum ?? eNum;
    if (prevValue != null && first != null && first < prevValue
      && !window.confirm(`Số ODO ${fmtKm(first)} NHỎ HƠN lần ghi trước (${fmtKm(prevValue)} km, ngày ${fmtDMY(parseISO(prevLog.log_date))}). Kiểm tra lại — vẫn lưu?`)) return;
    if (km != null && km > MAX_DAILY_KM && !window.confirm(`Quãng đường ${fmtKm(km)} km trong một ngày là bất thường. Vẫn lưu?`)) return;
    const fuelNum = fuel.trim() ? Number(fuel.replace(',', '.')) : null;
    if (fuelNum != null && (Number.isNaN(fuelNum) || fuelNum < 0)) { setMsg({ ok: false, text: 'Số lít nhiên liệu không hợp lệ.' }); return; }

    setBusy('save');
    try {
      const replaced = [];
      let ps = photoStart, pe = photoEnd;
      if (newStart) {
        const { data, error } = await uploadOdoPhoto(vehicle.id, date, 'start', await compressImage(newStart));
        if (error) throw new Error('Không gửi được ảnh lúc xuất phát: ' + error.message);
        if (log?.photo_start_path) replaced.push(log.photo_start_path);
        ps = data.path;
      } else if (!photoStart && log?.photo_start_path) replaced.push(log.photo_start_path);
      if (newEnd) {
        const { data, error } = await uploadOdoPhoto(vehicle.id, date, 'end', await compressImage(newEnd));
        if (error) throw new Error('Không gửi được ảnh lúc về: ' + error.message);
        if (log?.photo_end_path) replaced.push(log.photo_end_path);
        pe = data.path;
      } else if (!photoEnd && log?.photo_end_path) replaced.push(log.photo_end_path);

      const row = {
        vehicle_id: vehicle.id, log_date: date,
        driver_id: driverId || null,
        odo_start: sNum, odo_end: eNum,
        photo_start_path: ps, photo_end_path: pe,
        route: route.trim() || null, fuel_liters: fuelNum, note: note.trim() || null,
        updated_by: profile.id,
      };
      if (manager) {
        row.status = confirm ? 'da_xac_nhan' : 'cho_xac_nhan';
        row.confirmed_by = confirm ? (log?.confirmed_by || profile.id) : null;
        row.confirmed_at = confirm ? (log?.confirmed_at || new Date().toISOString()) : null;
      }
      const { error } = await saveVehicleLog(row);
      if (error) throw new Error(error.message);
      for (const p of replaced) await deleteOdoPhoto(p); // dọn ảnh cũ đã được thay
      const onlyPhoto = (ps && sNum == null) || (pe && eNum == null);
      setMsg({ ok: true, text: onlyPhoto ? 'Đã gửi. Phòng HC-TC-QT sẽ đọc số từ ảnh.' : 'Đã lưu nhật trình.' });
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: e.message || String(e) });
    }
    setBusy('');
  };

  const remove = async () => {
    if (!log || !window.confirm(`Xóa nhật trình xe ${vehicle.plate} ngày ${fmtDMY(parseISO(date))}?`)) return;
    setBusy('del');
    const { error } = await deleteVehicleLog(log.id);
    if (!error) for (const p of [log.photo_start_path, log.photo_end_path].filter(Boolean)) await deleteOdoPhoto(p);
    setBusy('');
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    onSaved?.(); onClose?.();
  };

  const field = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-red-500 disabled:bg-slate-50';
  const routeHint = suggestRoute(trips);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[16px] font-extrabold text-slate-800">Xe {vehicle.plate}</p>
          <p className="text-[12.5px] text-slate-500">{dayName(parseISO(date))}, {fmtDMY(parseISO(date))}
            {prevValue != null && <> · Lần ghi trước: <b className="text-slate-700 tabular-nums">{fmtKm(prevValue)} km</b> ({fmtDMY(parseISO(prevLog.log_date))})</>}
          </p>
        </div>
        {log && <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full border ${confirmed ? 'bg-emerald-50 text-emerald-800 border-emerald-300' : 'bg-amber-50 text-amber-800 border-amber-300'}`}>{confirmed ? 'Đã xác nhận' : 'Chờ xác nhận'}</span>}
      </div>

      {locked && (
        <p className="text-[12.5px] rounded-lg bg-slate-100 text-slate-600 px-3 py-2">
          {confirmed ? 'Nhật trình ngày này đã được Phòng HC-TC-QT xác nhận.' : 'Đã quá hạn tự sửa.'} Cần điều chỉnh, vui lòng báo Phòng HC-TC-QT.
        </p>
      )}

      {trips.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
          <p className="text-[12px] font-bold text-sky-900 mb-1">Chuyến công tác được phân trong ngày</p>
          <ul className="space-y-0.5">
            {trips.map((t) => <li key={t.id} className="text-[12.5px] text-sky-900">• {t.time && <b>{t.time}: </b>}{t.content}{t.location && <span className="text-sky-700"> — {t.location}</span>}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <ReadingBlock title="Lúc xuất phát" hint="Số ODO khi bắt đầu chạy (có thể bỏ trống nếu bằng lần ghi trước)"
          value={start} onValue={setStart} photoPath={photoStart} newPhoto={newStart} disabled={locked} tone="border-slate-200 bg-slate-50"
          onPhoto={(f) => f && setNewStart(f)} onClearPhoto={() => { setNewStart(null); setPhotoStart(null); }} />
        <ReadingBlock title="Lúc về" hint="Số ODO khi kết thúc chuyến / cuối ngày"
          value={end} onValue={setEnd} photoPath={photoEnd} newPhoto={newEnd} disabled={locked} tone="border-red-200 bg-red-50/50"
          onPhoto={(f) => f && setNewEnd(f)} onClearPhoto={() => { setNewEnd(null); setPhotoEnd(null); }} />
      </div>
      <p className="text-[12px] text-slate-500">Có thể <b>gõ số</b> hoặc <b>chỉ gửi ảnh chụp đồng hồ</b> — khi chỉ có ảnh, Phòng HC-TC-QT sẽ đọc số giúp.</p>

      {km != null && (
        <p className={`text-[14px] font-bold ${km < 0 || km > MAX_DAILY_KM ? 'text-rose-700' : 'text-emerald-700'}`}>
          Quãng đường: {fmtKm(km)} km{sNum == null && prevValue != null ? ' (tính từ lần ghi trước)' : ''}
        </p>
      )}

      <div>
        <label className="text-[12px] font-semibold text-slate-600 flex items-center gap-1 mb-1"><Route className="w-3.5 h-3.5" /> Hành trình</label>
        <textarea rows={2} disabled={locked} value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Vd: Trụ sở → xã Biện Thượng → Trụ sở" className={field} />
        {!locked && routeHint && route.trim() !== routeHint && (
          <button type="button" onClick={() => setRoute(routeHint)} className="mt-1 text-[12px] text-sky-700 font-semibold hover:underline">Điền theo lịch: {routeHint}</button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="text-[12px] font-semibold text-slate-600 flex items-center gap-1 mb-1"><Fuel className="w-3.5 h-3.5" /> Nhiên liệu đổ (lít)</label>
          <input inputMode="decimal" disabled={locked} value={fuel} onChange={(e) => setFuel(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Nếu có" className={field} />
        </div>
        {manager ? (
          <div>
            <label className="text-[12px] font-semibold text-slate-600 mb-1 block">Lái xe</label>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={field}>
              <option value="">— Chọn lái xe —</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
            </select>
          </div>
        ) : <div />}
      </div>
      <div>
        <label className="text-[12px] font-semibold text-slate-600 mb-1 block">Ghi chú</label>
        <input disabled={locked} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vd: bảo dưỡng, rửa xe, xe hỏng…" className={field} />
      </div>

      {manager && (
        <label className="flex items-center gap-2 text-[13px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 cursor-pointer">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="accent-emerald-700 w-4 h-4" />
          Xác nhận nhật trình ngày này (lái xe không tự sửa được nữa)
        </label>
      )}

      {msg && (
        <p className={`text-[13px] flex items-center gap-1.5 rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />} {msg.text}
        </p>
      )}

      {!locked && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button onClick={save} disabled={!!busy} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-red-700 hover:bg-red-800 text-white text-[15px] font-bold shadow disabled:opacity-60">
            {busy === 'save' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} {log ? 'Cập nhật nhật trình' : 'Gửi nhật trình'}
          </button>
          {manager && log && (
            <button onClick={remove} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-300 text-rose-700 text-[13px] font-semibold hover:bg-rose-50">
              {busy === 'del' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Xóa
            </button>
          )}
          {onClose && <button onClick={onClose} className="px-3 py-2.5 rounded-xl text-[13px] font-semibold text-slate-600 hover:bg-slate-100">Đóng</button>}
        </div>
      )}
      {locked && onClose && <button onClick={onClose} className="px-4 py-2 rounded-xl text-[13px] font-semibold text-slate-600 bg-slate-100">Đóng</button>}
      {(photoStart || photoEnd) && manager && (
        <p className="text-[11.5px] text-slate-400 flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Bấm vào ảnh để mở cỡ lớn khi đọc số.</p>
      )}
    </div>
  );
}
