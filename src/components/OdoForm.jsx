import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Send, Gauge, Route, Fuel, CheckCircle2, AlertTriangle, Lock, ScanLine, PencilLine, RefreshCw, Repeat, Droplet } from 'lucide-react';
import { addOdoReading, uploadOdoPhoto, getOdoPhotoUrl } from '../lib/api';
import { MAX_DAILY_KM, READING_KINDS, FORM_KINDS, borrowNote, fmtKm, fmtReadTime, suggestKind, suggestRoute } from '../lib/vehicleLog';
import { recognizeOdo } from '../lib/odoOcr';
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
 * GHI MỘT LẦN ODO. Lái xe CHỈ CHỤP ẢNH đồng hồ — hệ thống tự đọc số; không đọc được thì mới
 * yêu cầu gõ tay. Lưu ngay (không chờ duyệt), không sửa/xóa.
 * props: profile, vehicle, lastReading, todayReadings, trips (chuyến hôm nay), drivers (ghi hộ),
 *        borrowed + ownerName (lái xe đang MƯỢN xe của lái xe khác), oil (tình trạng thay dầu), onSaved(), onClose
 */
export default function OdoReadingForm({ profile, vehicle, lastReading, todayReadings = [], trips = [], drivers = [], borrowed = false, ownerName = '', oil = null, onSaved, onClose }) {
  const manager = canManageVehicleLog(profile);
  const [kind, setKind] = useState(() => suggestKind(todayReadings));
  const [photo, setPhoto] = useState(null);          // File gốc
  const [blob, setBlob] = useState(null);            // ảnh đã nén (dùng để đọc số + tải lên)
  const [ocr, setOcr] = useState({ status: 'idle' }); // idle | reading | done {value, engine, plausible}
  const [manual, setManual] = useState('');          // số gõ tay
  const [manualMode, setManualMode] = useState(false);
  const [confirmOdd, setConfirmOdd] = useState(false); // xác nhận số máy đọc dù bất thường
  const [route, setRoute] = useState('');
  const [fuel, setFuel] = useState('');
  const [note, setNote] = useState('');
  const [oilChange, setOilChange] = useState(false); // lần ghi này là lúc THAY DẦU
  // Người quản lý GHI HỘ: chọn ngày, giờ, lái xe
  const [date, setDate] = useState(() => toISODate(new Date()));
  const [time, setTime] = useState(nowHM);
  const [driverId, setDriverId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { ok, text }
  const camRef = useRef(null);
  const pickRef = useRef(null);
  const runRef = useRef(0);
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const todayCount = todayReadings.length;
  // Đổi xe / có lần ghi mới -> gợi ý lại loại lần ghi (chưa xuất phát -> Xuất phát, rồi -> Ghi thêm)
  useEffect(() => { setKind(suggestKind(todayReadings)); }, [vehicle?.id, todayCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastValue = lastReading ? Number(lastReading.odo) : null;

  // Chọn ảnh -> nén -> TỰ ĐỌC SỐ ODO
  const takePhoto = async (file) => {
    if (!file) return;
    const run = ++runRef.current;
    setPhoto(file); setBlob(null); setMsg(null);
    setManual(''); setManualMode(false); setConfirmOdd(false);
    setOcr({ status: 'reading' });
    const small = await compressImage(file);
    if (run !== runRef.current) return;
    setBlob(small);
    const r = await recognizeOdo(small, { lastOdo: lastValue });
    if (run !== runRef.current) return;
    setOcr({ status: 'done', ...r });
    if (r.value == null) setManualMode(true); // không đọc được -> bắt buộc gõ tay
  };
  const resetPhoto = () => { runRef.current += 1; setPhoto(null); setBlob(null); setOcr({ status: 'idle' }); setManual(''); setManualMode(false); setConfirmOdd(false); };

  // Số ODO sẽ ghi + nguồn
  const ocrValue = ocr.status === 'done' ? ocr.value : null;
  const value = manualMode ? toInt(manual) : ocrValue;
  const source = manualMode ? (ocrValue != null ? 'sua_so' : 'nhap_tay') : (ocrValue != null ? 'may_doc' : null);
  const odd = !manualMode && ocrValue != null && ocr.plausible && !ocr.plausible.ok;
  const delta = value != null && lastValue != null ? value - lastValue : null;
  const ready = !!blob && value != null && (!odd || confirmOdd) && !busy;

  const submit = async () => {
    setMsg(null);
    if (!photo) { setMsg({ ok: false, text: 'Bắt buộc chụp ảnh đồng hồ ODO.' }); return; }
    if (!blob || ocr.status === 'reading') { setMsg({ ok: false, text: 'Đang đọc số trên ảnh, vui lòng chờ…' }); return; }
    if (value == null) { setMsg({ ok: false, text: 'Hệ thống chưa đọc được số — vui lòng gõ số ODO.' }); return; }
    if (odd && !confirmOdd) { setMsg({ ok: false, text: 'Số đọc được chênh bất thường so với lần ghi trước — xác nhận "Đúng số này" hoặc gõ lại số.' }); return; }
    if (manualMode && delta != null && delta < 0 && !window.confirm(`Số ${fmtKm(value)} NHỎ HƠN lần ghi trước (${fmtKm(lastValue)} km). Lần ghi lưu vĩnh viễn, không sửa được. Vẫn gửi?`)) return;
    if (manualMode && delta != null && delta > MAX_DAILY_KM && !window.confirm(`Tăng ${fmtKm(delta)} km so với lần ghi trước là bất thường. Vẫn gửi?`)) return;
    const fuelNum = fuel.trim() ? Number(fuel.replace(',', '.')) : null;
    if (fuelNum != null && (Number.isNaN(fuelNum) || fuelNum < 0)) { setMsg({ ok: false, text: 'Số lít nhiên liệu không hợp lệ.' }); return; }

    setBusy(true);
    try {
      const dateISO = manager ? date : toISODate(new Date());
      const up = await uploadOdoPhoto(vehicle.id, dateISO, kind, blob);
      if (up.error) throw new Error('Không gửi được ảnh: ' + up.error.message);
      const driverName = manager ? (drivers.find((d) => d.id === driverId)?.full_name || '') : (profile.full_name || '');
      const notes = [
        borrowed ? borrowNote(driverName, vehicle.plate, ownerName) : '',
        note.trim(),
        manager ? 'Phòng HC-TC-QT ghi hộ' : '',
      ].filter(Boolean);
      const row = {
        vehicle_id: vehicle.id, kind, odo: value, photo_path: up.data.path,
        odo_source: source, odo_ocr: ocrValue,
        borrowed: !!borrowed,
        oil_change: oilChange,
        driver_id: manager ? (driverId || null) : profile.id,
        route: route.trim() || null,
        fuel_liters: fuelNum,
        note: notes.join('; ') || null,
      };
      // Lái xe: ngày + giờ do MÁY CHỦ ghi (không tự chọn). Người quản lý ghi hộ: theo ngày giờ chọn.
      if (manager) {
        row.reading_date = date;
        row.read_at = new Date(`${date}T${time || '00:00'}:00`).toISOString();
      }
      const { error } = await addOdoReading(row);
      if (error) throw new Error(error.message);
      setMsg({ ok: true, text: `Đã ghi nhận "${READING_KINDS[kind].short}" lúc ${nowHM()}: ${fmtKm(value)} km${oilChange ? ' — đã ghi mốc THAY DẦU' : ''}.` });
      resetPhoto(); setRoute(''); setFuel(''); setNote(''); setOilChange(false);
      onSaved?.();
    } catch (e) {
      setMsg({ ok: false, text: e.message || String(e) });
    }
    setBusy(false);
  };

  const field = 'w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-[14px] outline-none focus:border-red-500';
  const routeHint = suggestRoute(trips);
  const engineLabel = ocr.engine === 'ai' ? 'AI đọc ảnh' : ocr.engine === 'tesseract' ? 'nhận dạng chữ số' : '';

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

      {borrowed && (
        <p className="flex items-start gap-1.5 text-[12.5px] rounded-lg bg-amber-50 border border-amber-300 text-amber-900 px-3 py-2">
          <Repeat className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Đang <b>mượn xe</b>{ownerName ? <> của lái xe <b>{ownerName}</b></> : ''}: lần ghi tính vào nhật trình xe <b>{vehicle.plate}</b>, kèm ghi chú mượn xe.</span>
        </p>
      )}

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

      {/* Loại lần ghi: CHỈ 2 loại */}
      <div className="grid grid-cols-2 gap-1.5">
        {FORM_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`px-2 py-2.5 rounded-lg text-[14px] font-bold border transition ${kind === k ? 'bg-red-700 text-white border-red-700 shadow' : 'bg-white text-slate-600 border-slate-300'}`}>
            {READING_KINDS[k].short}
          </button>
        ))}
      </div>
      <p className="text-[11.5px] text-slate-500 -mt-1.5">
        {kind === 'xuat_phat' ? 'Khi bắt đầu chuyến: chụp đồng hồ + ghi hành trình, nhiên liệu, ghi chú (nếu có).' : 'Khi về / dọc đường: chụp đồng hồ + ghi hành trình, nhiên liệu, ghi chú (nếu có).'}
      </p>

      {/* ẢNH ĐỒNG HỒ — bắt buộc; hệ thống tự đọc số */}
      {!photo ? (
        <div className="space-y-1.5">
          <button type="button" onClick={() => camRef.current?.click()} className="w-full flex items-center justify-center gap-2 px-3 py-4 rounded-xl bg-slate-800 text-white text-[16px] font-bold active:scale-[0.99]">
            <Camera className="w-6 h-6" /> Chụp ảnh đồng hồ ODO
          </button>
          <button type="button" onClick={() => pickRef.current?.click()} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-[13px] font-semibold">
            <ImagePlus className="w-4 h-4" /> Chọn ảnh có sẵn
          </button>
          <p className="text-[11.5px] text-slate-500 text-center">Chụp rõ, thẳng vào số ODO; hệ thống tự đọc số — không cần gõ.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 flex gap-3">
          <img src={preview} alt="Ảnh đồng hồ vừa chụp" className="w-24 h-24 rounded-lg object-cover border border-slate-300 shrink-0" />
          <div className="flex-1 min-w-0 space-y-1.5">
            {ocr.status === 'reading' && (
              <p className="flex items-center gap-2 text-[14px] font-semibold text-slate-700 pt-2"><Loader2 className="w-5 h-5 animate-spin text-red-700" /> Đang đọc số ODO trên ảnh…</p>
            )}
            {ocr.status === 'done' && !manualMode && ocrValue != null && (
              <>
                <p className="text-[11.5px] text-slate-500 flex items-center gap-1"><ScanLine className="w-3.5 h-3.5" /> Hệ thống đọc được{engineLabel && ` (${engineLabel})`}:</p>
                <p className="text-[26px] leading-none font-extrabold text-slate-900 tabular-nums">{fmtKm(ocrValue)} <span className="text-[14px] font-semibold text-slate-400">km</span></p>
                {delta != null && !odd && <p className="text-[12.5px] font-semibold text-emerald-700">+{fmtKm(delta)} km so với lần ghi gần nhất</p>}
                {odd && (
                  <div className="text-[12.5px] text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1.5">
                    <p className="font-semibold">{ocr.plausible.reason === 'lower' ? `Nhỏ hơn lần ghi trước (${fmtKm(lastValue)} km)` : `Tăng bất thường ${fmtKm(delta)} km so với lần ghi trước`} — có thể đọc nhầm.</p>
                    <label className="flex items-center gap-1.5 mt-1 cursor-pointer"><input type="checkbox" checked={confirmOdd} onChange={(e) => setConfirmOdd(e.target.checked)} className="accent-rose-700 w-4 h-4" /> Đúng số này</label>
                  </div>
                )}
                <button type="button" onClick={() => { setManualMode(true); setManual(''); }} className="flex items-center gap-1 text-[12.5px] font-semibold text-sky-700 hover:underline">
                  <PencilLine className="w-3.5 h-3.5" /> Số không đúng? Gõ lại số
                </button>
              </>
            )}
            {ocr.status === 'done' && manualMode && (
              <>
                <p className={`text-[12.5px] font-semibold ${ocrValue == null ? 'text-amber-800' : 'text-slate-600'}`}>
                  {ocrValue == null ? 'Hệ thống không nhận dạng được số trên ảnh — vui lòng gõ số ODO:' : `Gõ số đúng (máy đọc ${fmtKm(ocrValue)} km):`}
                </p>
                <div className="flex items-center gap-2 bg-white border-2 border-amber-400 rounded-xl px-3 focus-within:border-red-500">
                  <Gauge className="w-5 h-5 text-slate-400 shrink-0" />
                  <input autoFocus inputMode="numeric" pattern="[0-9.]*" value={manual} onChange={(e) => setManual(fmtInput(e.target.value))}
                    placeholder="Số ODO" className="flex-1 min-w-0 py-2.5 text-[22px] font-bold tabular-nums outline-none bg-transparent" />
                  <span className="text-[13px] text-slate-400">km</span>
                </div>
                {delta != null && <p className={`text-[12.5px] font-semibold ${delta < 0 || delta > MAX_DAILY_KM ? 'text-rose-700' : 'text-emerald-700'}`}>{delta >= 0 ? `+${fmtKm(delta)}` : `−${fmtKm(-delta)}`} km so với lần ghi gần nhất</p>}
                {ocrValue != null && <button type="button" onClick={() => setManualMode(false)} className="text-[12px] font-semibold text-slate-500 hover:underline">Dùng lại số máy đọc</button>}
              </>
            )}
            <button type="button" onClick={() => camRef.current?.click()} className="flex items-center gap-1 text-[12.5px] font-semibold text-slate-600 hover:underline">
              <RefreshCw className="w-3.5 h-3.5" /> Chụp lại
            </button>
          </div>
        </div>
      )}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { takePhoto(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={pickRef} type="file" accept="image/*" className="hidden" onChange={(e) => { takePhoto(e.target.files?.[0]); e.target.value = ''; }} />

      {/* Hành trình / nhiên liệu / ghi chú: CẢ Xuất phát lẫn Ghi thêm */}
          <div>
            <label className="text-[12px] font-semibold text-slate-600 flex items-center gap-1 mb-1"><Route className="w-3.5 h-3.5" /> Nội dung hành trình</label>
            <textarea rows={2} value={route} onChange={(e) => setRoute(e.target.value)} placeholder="Vd: Trụ sở → xã Biện Thượng → Trụ sở" className={field} />
            {routeHint && route.trim() !== routeHint && (
              <button type="button" onClick={() => setRoute(routeHint)} className="mt-1 text-[12px] text-sky-700 font-semibold hover:underline">Điền theo lịch: {routeHint}</button>
            )}
          </div>
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

      {/* Thay dầu: một dòng nhỏ; nổi màu khi xe sắp / đến hạn thay dầu */}
      <label className={`flex items-center gap-2 cursor-pointer rounded-lg px-2.5 py-1.5 text-[12.5px] ${oilChange ? 'bg-violet-50 border border-violet-300 text-violet-900 font-semibold' : ['soon', 'due'].includes(oil?.level) ? 'bg-amber-50 border border-amber-200 text-amber-900' : 'text-slate-500'}`}>
        <input type="checkbox" checked={oilChange} onChange={(e) => setOilChange(e.target.checked)} className="accent-violet-700 w-4 h-4" />
        <Droplet className="w-3.5 h-3.5 shrink-0" /> Lần ghi này là lúc thay dầu
        {['soon', 'due'].includes(oil?.level) && !oilChange && <span className="ml-auto text-[11.5px] font-semibold">đã chạy {fmtKm(oil.since)} km</span>}
      </label>

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
        <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" /> Mỗi lần gửi được lưu ngay (không chờ duyệt) kèm giờ gửi, ảnh và nguồn số (máy đọc / gõ tay); đã gửi thì không sửa, không xóa được.
      </p>
    </div>
  );
}
