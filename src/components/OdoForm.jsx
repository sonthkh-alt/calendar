import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, X, Send, Gauge, Route, Fuel, CheckCircle2, AlertTriangle, Lock } from 'lucide-react';
import { addOdoReading, uploadOdoPhoto, getOdoPhotoUrl } from '../lib/api';
import { MAX_DAILY_KM, READING_KINDS, fmtKm, fmtReadTime, suggestKind, suggestRoute } from '../lib/vehicleLog';
import { canManageVehicleLog } from '../lib/permissions';
import { compressImage } from '../lib/images';
import { fmtDMY, parseISO, toISODate } from '../lib/dates';
import DateField from './DateField';

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
  if (!path) return <div className={`${className} rounded-lg border border-dashed border-slate-300 bg-slate-50 text-[9px] text-slate-400 flex items-center justify-center text-center shrink-0`}>không ảnh</div>;
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
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/**
 * GHI MỘT LẦN ODO: bắt buộc SỐ ODO + ẢNH ĐỒNG HỒ. Lưu ngay (không chờ duyệt), không sửa/xóa.
 * props: profile, vehicle, lastReading (lần ghi hợp lệ gần nhất của xe), todayReadings,
 *        trips (chuyến công tác hôm nay), drivers (cho người quản lý ghi hộ), onSaved(), onClose
 */
export default function OdoReadingForm({ profile, vehicle, lastReading, todayReadings = [], trips = [], drivers = [], onSaved, onClose }) {
  const manager = canManageVehicleLog(profile);
  const [kind, setKind] = useState(() => suggestKind(todayReadings));
  const [odo, setOdo] = useState('');
  const [photo, setPhoto] = useState(null);
  const [route, setRoute] = useState('');
  const [fuel, setFuel] = useState('');
  const [note, setNote] = useState('');
  // Người quản lý GHI HỘ: chọn ngày, giờ, lái xe
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [time, setTime] = useState(nowHM);
  const [driverId, setDriverId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const camRef = useRef(null);
  const pickRef = useRef(null);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const todayCount = todayReadings.length;
  // Đổi xe / có lần ghi mới -> gợi ý lại loại lần ghi (chưa xuất phát -> Xuất phát, rồi -> Về)
  useEffect(() => { setKind(suggestKind(todayReadings)); }, [vehicle?.id, todayCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = toInt(odo);
  const lastValue = lastReading ? Number(lastReading.odo) : null;
  const delta = value != null && lastValue != null ? value - lastValue : null;

  const submit = async () => {
    setMsg(null);
    if (value == null) { setMsg({ ok: false, text: 'Bắt buộc gõ số ODO.' }); return; }
    if (!photo) { setMsg({ ok: false, text: 'Bắt buộc chụp (hoặc chọn) ảnh đồng hồ ODO.' }); return; }
    if (delta != null && delta < 0 && !window.confirm(`Số ${fmtKm(value)} NHỎ HƠN lần ghi trước (${fmtKm(lastValue)} km). Lần ghi được lưu vĩnh viễn, không sửa được. Kiểm tra lại — vẫn gửi?`)) return;
    if (delta != null && delta > MAX_DAILY_KM && !window.confirm(`Tăng ${fmtKm(delta)} km so với lần ghi trước là bất thường. Vẫn gửi?`)) return;
    const fuelNum = fuel.trim() ? Number(fuel.replace(',', '.')) : null;
    if (fuelNum != null && (Number.isNaN(fuelNum) || fuelNum < 0)) { setMsg({ ok: false, text: 'Số lít nhiên liệu không hợp lệ.' }); return; }

    setBusy(true);
    try {
      const dateISO = manager ? date : toISODate(new Date());
      const up = await uploadOdoPhoto(vehicle.id, dateISO, kind, await compressImage(photo));
      if (up.error) throw new Error('Không gửi được ảnh: ' + up.error.message);
      const row = {
        vehicle_id: vehicle.id, kind, odo: value, photo_path: up.data.path,
        driver_id: manager ? (driverId || null) : profile.id,
        route: route.trim() || null, fuel_liters: fuelNum, note: note.trim() || null,
      };
      // Lái xe: ngày + giờ do MÁY CHỦ ghi (không tự chọn). Người quản lý ghi hộ: theo ngày giờ chọn.
      if (manager) {
        row.reading_date = date;
        row.read_at = new Date(`${date}T${time || '00:00'}:00`).toISOString();
        if (!row.note) row.note = 'Phòng HC-TC-QT ghi hộ';
      }
      const { error } = await addOdoReading(row);
      if (error) throw new Error(error.message);
      setMsg({ ok: true, text: `Đã ghi nhận "${READING_KINDS[kind].short}" lúc ${nowHM()}: ${fmtKm(value)} km.` });
      setOdo(''); setPhoto(null); setRoute(''); setFuel(''); setNote('');
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: e.message || String(e) });
    }
    setBusy(false);
  };

  const field = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-red-500';
  const routeHint = suggestRoute(trips);
  const ready = value != null && !!photo;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[16px] font-extrabold text-slate-800">Ghi ODO xe {vehicle.plate}</p>
        <p className="text-[12.5px] text-slate-500">
          {lastValue != null
            ? <>Lần ghi gần nhất: <b className="text-slate-700 tabular-nums">{fmtKm(lastValue)} km</b> ({fmtReadTime(lastReading.read_at)} {fmtDMY(parseISO(lastReading.reading_date))})</>
            : 'Chưa có lần ghi nào trước đó.'}
        </p>
      </div>

      {trips.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
          <p className="text-[12px] font-bold text-sky-900 mb-1">Chuyến công tác được phân hôm nay</p>
          <ul className="space-y-0.5">
            {trips.map((t) => <li key={t.id} className="text-[12.5px] text-sky-900">• {t.time && <b>{t.time}: </b>}{t.content}{t.location && <span className="text-sky-700"> — {t.location}</span>}</li>)}
          </ul>
        </div>
      )}

      {manager && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl bg-amber-50 border border-amber-200 p-2.5">
          <div><label className="text-[11.5px] font-semibold text-amber-900 block mb-0.5">Ngày (ghi hộ)</label><DateField value={date} onChange={setDate} /></div>
          <div><label className="text-[11.5px] font-semibold text-amber-900 block mb-0.5">Giờ</label><input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} /></div>
          <div>
            <label className="text-[11.5px] font-semibold text-amber-900 block mb-0.5">Lái xe</label>
            <select value={driverId} onChange={(e) => setDriverId(e.target.value)} className={field}>
              <option value="">— Chọn lái xe —</option>
              {drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Loại lần ghi */}
      <div className="grid grid-cols-3 gap-1.5">
        {Object.entries(READING_KINDS).map(([k, v]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`px-2 py-2 rounded-lg text-[13px] font-bold border transition ${kind === k ? 'bg-red-700 text-white border-red-700 shadow' : 'bg-white text-slate-600 border-slate-300'}`}>
            {v.short}
          </button>
        ))}
      </div>

      {/* 1) SỐ ODO — bắt buộc */}
      <div>
        <label className="text-[12px] font-bold text-slate-700 mb-1 block">1. Số ODO <span className="text-rose-600">*</span></label>
        <div className="flex items-center gap-2 bg-white border-2 border-slate-300 rounded-xl px-3 focus-within:border-red-500">
          <Gauge className="w-5 h-5 text-slate-400 shrink-0" />
          <input inputMode="numeric" pattern="[0-9.]*" value={odo} onChange={(e) => setOdo(fmtInput(e.target.value))}
            placeholder="Gõ số trên đồng hồ" className="flex-1 min-w-0 py-3 text-[22px] font-bold tabular-nums outline-none bg-transparent" />
          <span className="text-[13px] text-slate-400">km</span>
        </div>
        {delta != null && (
          <p className={`text-[12.5px] mt-1 font-semibold ${delta < 0 || delta > MAX_DAILY_KM ? 'text-rose-700' : 'text-emerald-700'}`}>
            {delta >= 0 ? `+${fmtKm(delta)}` : `−${fmtKm(-delta)}`} km so với lần ghi gần nhất
          </p>
        )}
      </div>

      {/* 2) ẢNH ĐỒNG HỒ — bắt buộc */}
      <div>
        <label className="text-[12px] font-bold text-slate-700 mb-1 block">2. Ảnh chụp đồng hồ ODO <span className="text-rose-600">*</span></label>
        <div className="flex items-center gap-2">
          {preview && (
            <div className="relative">
              <img src={preview} alt="Ảnh đồng hồ vừa chọn" className="w-20 h-20 rounded-lg object-cover border border-slate-300" />
              <button type="button" onClick={() => setPhoto(null)} title="Chọn lại ảnh" className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-800 text-white flex items-center justify-center"><X className="w-3 h-3" /></button>
            </div>
          )}
          <div className="flex flex-col gap-1.5 flex-1">
            <button type="button" onClick={() => camRef.current?.click()} className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-[14px] font-semibold active:scale-[0.98] ${photo ? 'bg-white border border-slate-300 text-slate-700' : 'bg-slate-800 text-white'}`}>
              <Camera className="w-4 h-4" /> {photo ? 'Chụp lại' : 'Chụp ảnh đồng hồ'}
            </button>
            <button type="button" onClick={() => pickRef.current?.click()} className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-[12.5px] font-semibold">
              <ImagePlus className="w-4 h-4" /> Chọn ảnh có sẵn
            </button>
          </div>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setPhoto(e.target.files[0]); e.target.value = ''; }} />
        <input ref={pickRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) setPhoto(e.target.files[0]); e.target.value = ''; }} />
      </div>

      {kind === 've' && (
        <div>
          <label className="text-[12px] font-semibold text-slate-600 flex items-center gap-1 mb-1"><Route className="w-3.5 h-3.5" /> Hành trình</label>
          <textarea rows={2} value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Vd: Trụ sở → xã Biện Thượng → Trụ sở" className={field} />
          {routeHint && route.trim() !== routeHint && (
            <button type="button" onClick={() => setRoute(routeHint)} className="mt-1 text-[12px] text-sky-700 font-semibold hover:underline">Điền theo lịch: {routeHint}</button>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className="text-[12px] font-semibold text-slate-600 flex items-center gap-1 mb-1"><Fuel className="w-3.5 h-3.5" /> Nhiên liệu đổ (lít)</label>
          <input inputMode="decimal" value={fuel} onChange={(e) => setFuel(e.target.value.replace(/[^\d.,]/g, ''))} placeholder="Nếu có" className={field} />
        </div>
        <div>
          <label className="text-[12px] font-semibold text-slate-600 mb-1 block">Ghi chú</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nếu có" className={field} />
        </div>
      </div>

      {msg && (
        <p className={`text-[13px] flex items-center gap-1.5 rounded-lg px-3 py-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
          {msg.ok ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />} {msg.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={submit} disabled={busy} className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white text-[15px] font-bold shadow disabled:opacity-60 ${ready ? 'bg-red-700 hover:bg-red-800' : 'bg-slate-400'}`}>
          {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />} Gửi — {READING_KINDS[kind].short}
        </button>
        {onClose && <button onClick={onClose} className="px-3 py-2.5 rounded-xl text-[13px] font-semibold text-slate-600 hover:bg-slate-100">Đóng</button>}
      </div>
      <p className="text-[11.5px] text-slate-500 flex items-start gap-1.5">
        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Mỗi lần gửi được lưu ngay vào nhật trình (không chờ duyệt) kèm giờ gửi và ảnh; đã gửi thì không sửa, không xóa được. Ghi nhầm thì gửi lần mới kèm ghi chú và báo Phòng HC-TC-QT.
      </p>
    </div>
  );
}
