import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Gauge, Loader2, RotateCcw, FileSpreadsheet, X, AlertTriangle, Info, Car, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, PencilLine, Ban, Lock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fetchOdoReadings, fetchEntries, voidOdoReading } from '../lib/api';
import { UNIT_NAME } from '../lib/constants';
import { canManageVehicleLog, canVoidOdoReading } from '../lib/permissions';
import { addDays, parseISO, toISODate, fmtDMY, fmtDM, startOfMonth, endOfMonth, addMonths } from '../lib/dates';
import { buildLogbook, exportLogbookXlsx, fmtKm, fmtReadTime, READING_KINDS, tripsByDate } from '../lib/vehicleLog';
import OdoReadingForm, { OdoPhoto } from './OdoForm';
import DateField from './DateField';

const CHAIN_DAYS = 92; // nạp thêm 3 tháng trước kỳ để nối chuỗi ODO (km ngày đầu kỳ)
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const minIso = (a, b) => (a < b ? a : b);
const maxIso = (a, b) => (a > b ? a : b);

/**
 * Tab NHẬT TRÌNH XE. Mỗi lần ghi ODO (bắt buộc số + ảnh) được lưu NGAY, hiển thị ngay, không chờ
 * duyệt; lái xe không sửa/xóa được.
 *  - Lái xe: ghi ODO cho hôm nay, xem các lần đã ghi hôm nay + lịch sử 30 ngày.
 *  - Phòng HC-TC-QT / Quản trị: theo dõi hôm nay (cập nhật tức thời), sổ nhật trình từng xe theo
 *    kỳ, ghi hộ, đánh dấu "không tính" lần ghi nhầm (vẫn giữ + hiển thị), xuất sổ Excel.
 */
export default function VehicleLogView({ profile, vehicles, profiles }) {
  return canManageVehicleLog(profile)
    ? <ManagerBoard profile={profile} vehicles={vehicles} profiles={profiles} />
    : <DriverPage profile={profile} vehicles={vehicles} profiles={profiles} />;
}

// Nạp các lần ghi + lịch công tác cho khoảng [from,to] (kèm đoạn nối chuỗi phía trước);
// tự nạp lại khi có lần ghi mới (realtime) — người quản lý thấy ngay khi lái xe vừa gửi.
function useReadings(from, to, vehicleId) {
  const [readings, setReadings] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [at, setAt] = useState(null);
  const req = useRef(0);
  const load = useCallback(async () => {
    if (!from || !to) return;
    const id = ++req.current;
    setLoading(true); setError('');
    const chainFrom = toISODate(addDays(parseISO(from), -CHAIN_DAYS));
    const [r, e] = await Promise.all([fetchOdoReadings(chainFrom, to, vehicleId || null), fetchEntries(from, to)]);
    if (id !== req.current) return;
    if (r.error || e.error) setError((r.error || e.error).message || 'Không tải được dữ liệu.');
    setReadings(r.data || []); setEntries(e.data || []); setAt(new Date()); setLoading(false);
  }, [from, to, vehicleId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!supabase) return undefined;
    let t;
    const ch = supabase.channel(`odo-${vehicleId || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'vehicle_odo_readings' }, () => { clearTimeout(t); t = setTimeout(load, 400); })
      .subscribe();
    return () => { clearTimeout(t); supabase.removeChannel(ch); };
  }, [load, vehicleId]);
  return { readings, entries, loading, error, at, load };
}

// Danh sách các lần ghi trong ngày (chỉ xem; người quản lý có nút "Không tính")
function ReadingList({ items, onVoid, compact = false }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li key={it.id} className={`flex items-start gap-2.5 rounded-lg border px-2.5 py-2 ${it.voided ? 'bg-slate-50 border-slate-200 opacity-70' : 'bg-white border-slate-200'}`}>
          <OdoPhoto path={it.photo_path} className={compact ? 'w-11 h-11' : 'w-14 h-14'} label={READING_KINDS[it.kind]?.short} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] font-bold text-slate-500 tabular-nums">{fmtReadTime(it.read_at)}</span>
              <span className={`text-[10.5px] font-bold px-1.5 py-0.5 rounded border ${READING_KINDS[it.kind]?.cls || ''}`}>{READING_KINDS[it.kind]?.short || it.kind}</span>
              <span className={`text-[15px] font-bold tabular-nums ${it.voided ? 'line-through text-slate-400' : 'text-slate-900'}`}>{it.odo != null ? `${fmtKm(it.odo)} km` : 'chưa có số'}</span>
              {it.delta != null && !it.voided && <span className={`text-[12px] font-semibold ${it.delta < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{it.delta >= 0 ? '+' : ''}{fmtKm(it.delta)} km</span>}
            </div>
            <p className="text-[11.5px] text-slate-500">
              {it.driverName && <>Lái xe {it.driverName}</>}
              {it.byName && it.byName !== it.driverName && <> · ghi bởi {it.byName}</>}
              {it.fuel_liters != null && <> · đổ {Number(it.fuel_liters).toLocaleString('vi-VN')} lít</>}
            </p>
            {it.route && <p className="text-[12px] text-slate-700">{it.route}</p>}
            {it.note && <p className="text-[11.5px] text-slate-500 italic">{it.note}</p>}
            {it.voided && <p className="text-[11.5px] text-rose-700 font-semibold">Không tính: {it.void_reason || 'ghi nhầm'}</p>}
          </div>
          {onVoid && !it.voided && (
            <button onClick={() => onVoid(it)} title="Đánh dấu KHÔNG TÍNH lần ghi nhầm (vẫn lưu và hiển thị)" className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md text-[11.5px] font-semibold text-slate-500 hover:text-rose-700 hover:bg-rose-50">
              <Ban className="w-3.5 h-3.5" /> Không tính
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

const warnIcon = {
  error: <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />,
  warn: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />,
  info: <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />,
};

// ===================== LÁI XE =====================
function DriverPage({ profile, vehicles, profiles }) {
  const today = toISODate(new Date());
  const active = (vehicles || []).filter((v) => v.active !== false);
  const defaultVehicle = profile.vehicle_id
    || active.find((v) => (v.driver_name || '').trim().toLowerCase() === (profile.full_name || '').trim().toLowerCase())?.id
    || '';
  const [vehicleId, setVehicleId] = useState(defaultVehicle);
  // Danh mục xe nạp SAU khi mở trang -> tự chọn xe phụ trách khi đã biết
  useEffect(() => { if (!vehicleId && defaultVehicle) setVehicleId(defaultVehicle); }, [vehicleId, defaultVehicle]);
  const [openDay, setOpenDay] = useState(null);
  const from = toISODate(addDays(parseISO(today), -30));
  const { readings, entries, loading, error, load } = useReadings(from, today, vehicleId);
  const vehicle = (vehicles || []).find((v) => v.id === vehicleId);
  const book = useMemo(() => (vehicle ? buildLogbook({ readings, vehicles: [vehicle], entries, profiles, from, to: today, today })[0] : null),
    [readings, vehicle, entries, profiles, from, today]);
  const todayRow = book?.rows.find((r) => r.date === today);
  const trips = useMemo(() => (vehicleId ? tripsByDate(entries, vehicleId).get(today) || [] : []), [entries, vehicleId, today]);

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="rounded-2xl bg-gradient-to-r from-red-800 to-red-700 text-white px-4 py-3 shadow">
        <p className="text-[12px] text-red-100">Nhật trình xe — lái xe {profile.full_name || ''} · {WEEKDAY[new Date().getDay()]} {fmtDMY(new Date())}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <Car className="w-5 h-5 text-amber-300" />
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="bg-white/15 border border-white/30 rounded-lg px-2 py-1.5 text-[15px] font-bold outline-none">
            <option value="" className="text-slate-800">— Chọn xe —</option>
            {active.map((v) => <option key={v.id} value={v.id} className="text-slate-800">{v.plate}{v.driver_name ? ` (${v.driver_name})` : ''}</option>)}
          </select>
          {vehicleId && vehicleId !== defaultVehicle && <span className="text-[11.5px] text-amber-200">Đang ghi cho xe khác xe phụ trách</span>}
        </div>
      </div>

      {!vehicle ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">Tài khoản chưa được gắn xe phụ trách — hãy chọn xe đang lái ở trên (hoặc báo Phòng HC-TC-QT gắn xe).</p>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <OdoReadingForm profile={profile} vehicle={vehicle} lastReading={book?.lastCounted} todayReadings={book?.today.readings || []}
              trips={trips} onSaved={load} />
            {error && <p className="mt-2 text-[12.5px] text-rose-700">{error}</p>}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
              <p className="text-[14px] font-bold text-slate-800 mr-auto">Đã ghi hôm nay {book ? `(${book.today.readings.length} lần)` : ''}</p>
              {todayRow?.km != null && <p className="text-[13px] text-slate-600">Quãng đường: <b className="text-slate-900 tabular-nums">{fmtKm(todayRow.km)} km</b></p>}
              {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
            </div>
            <div className="p-3">
              {todayRow?.items?.length
                ? <ReadingList items={todayRow.items} />
                : <p className="text-[13px] text-slate-400 text-center py-3">Hôm nay chưa ghi lần nào.</p>}
              {todayRow?.warnings.filter((w) => w.level !== 'info').map((w) => <p key={w.text} className="mt-2 flex items-start gap-1 text-[12px] text-amber-800">{warnIcon[w.level]}{w.text}</p>)}
            </div>
          </div>

          {book && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <p className="text-[14px] font-bold text-slate-800">30 ngày gần nhất</p>
                <p className="text-[12.5px] text-slate-500">Tổng <b className="text-slate-800 tabular-nums">{fmtKm(book.summary.totalKm)} km</b></p>
              </div>
              <ul className="divide-y divide-slate-100">
                {[...book.rows].reverse().filter((r) => r.date !== today).map((r) => (
                  <li key={r.date}>
                    <button onClick={() => setOpenDay((d) => (d === r.date ? null : r.date))} className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50">
                      <div className="w-14 shrink-0">
                        <p className="text-[13px] font-bold text-slate-800">{fmtDM(parseISO(r.date))}</p>
                        <p className="text-[11px] text-slate-400">{WEEKDAY[parseISO(r.date).getDay()]}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        {r.missing
                          ? <p className="text-[13px] text-rose-700 font-semibold">Chưa ghi nhật trình (có chuyến công tác)</p>
                          : <p className="text-[13px] text-slate-700 tabular-nums">{fmtKm(r.start) || '…'} → {fmtKm(r.end) || '…'}{r.km != null && <b className="ml-2 text-slate-900">{fmtKm(r.km)} km</b>}<span className="text-slate-400"> · {r.count} lần ghi</span></p>}
                        {r.warnings.filter((w) => w.level !== 'info').slice(0, 1).map((w) => <p key={w.text} className="text-[11.5px] text-amber-700 truncate">{w.text}</p>)}
                      </div>
                      {r.items.length > 0 && <ChevronDown className={`w-4 h-4 text-slate-400 transition ${openDay === r.date ? 'rotate-180' : ''}`} />}
                    </button>
                    {openDay === r.date && r.items.length > 0 && <div className="px-4 pb-3"><ReadingList items={r.items} compact /></div>}
                  </li>
                ))}
                {!book.rows.some((r) => r.date !== today) && <li className="px-4 py-5 text-center text-[13px] text-slate-400">Chưa có nhật trình nào trong 30 ngày qua.</li>}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ===================== PHÒNG HC-TC-QT / QUẢN TRỊ =====================
function ManagerBoard({ profile, vehicles, profiles }) {
  const today = toISODate(new Date());
  const [from, setFrom] = useState(() => toISODate(startOfMonth(new Date())));
  const [to, setTo] = useState(() => toISODate(endOfMonth(new Date())));
  const [vehicleSel, setVehicleSel] = useState(''); // '' = tất cả xe
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [writing, setWriting] = useState(null); // vehicleId đang ghi hộ
  const [busy, setBusy] = useState('');
  const { readings, entries, loading, error, at, load } = useReadings(minIso(from, today), maxIso(to, today), null);
  const drivers = useMemo(() => (profiles || []).filter((p) => p.role === 'lai_xe'), [profiles]);

  const books = useMemo(() => buildLogbook({ readings, vehicles, entries, profiles, from, to, today }),
    [readings, vehicles, entries, profiles, from, to, today]);
  // "Hôm nay" luôn tính theo ngày hiện tại, kể cả khi kỳ đang xem là tháng khác
  const todayBooks = useMemo(() => buildLogbook({ readings, vehicles, entries, profiles, from: today, to: today, today }),
    [readings, vehicles, entries, profiles, today]);
  const cur = books.find((b) => b.vehicle.id === vehicleSel) || null;
  const periodLabel = `từ ${fmtDMY(parseISO(from))} đến ${fmtDMY(parseISO(to))}`;

  const setMonth = (n) => {
    const base = addMonths(parseISO(from), n);
    setFrom(toISODate(startOfMonth(base))); setTo(toISODate(endOfMonth(base)));
  };
  const doExport = async () => {
    setBusy('xlsx');
    try {
      await exportLogbookXlsx(cur ? [cur] : books, {
        unitName: UNIT_NAME, periodLabel, generatedText: new Date().toLocaleString('vi-VN'),
        fileTag: `${cur ? cur.vehicle.plate + '_' : ''}${from}_${to}`,
      });
    } catch (e) { alert('Không xuất được: ' + (e?.message || e)); }
    setBusy('');
  };
  const onVoid = canVoidOdoReading(profile) ? async (it) => {
    const reason = window.prompt(`Đánh dấu KHÔNG TÍNH lần ghi ${fmtKm(it.odo)} km lúc ${fmtReadTime(it.read_at)} ${fmtDM(parseISO(it.reading_date))}?\nLần ghi vẫn được giữ và hiển thị (gạch ngang). Nhập lý do:`, 'Ghi nhầm số');
    if (reason == null) return;
    if (!reason.trim()) { alert('Cần nhập lý do.'); return; }
    const { error: err } = await voidOdoReading(it.id, reason.trim(), profile.id);
    if (err) alert('Không thực hiện được: ' + err.message);
    load();
  } : null;

  const writeVehicle = writing ? (vehicles || []).find((v) => v.id === writing) : null;
  const writeBook = writing ? todayBooks.find((b) => b.vehicle.id === writing) : null;
  const updatedToday = todayBooks.filter((b) => b.today.count > 0).length;

  return (
    <div className="space-y-3">
      {/* ===== Hôm nay ===== */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <Gauge className="w-4 h-4 text-red-700" />
          <h3 className="text-[14px] font-bold text-slate-800">Hôm nay {fmtDMY(parseISO(today))}: <span className={updatedToday === todayBooks.length ? 'text-emerald-700' : 'text-amber-700'}>{updatedToday}/{todayBooks.length} xe đã ghi ODO</span></h3>
          <div className="flex-1" />
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold text-slate-600 border border-slate-200 hover:bg-red-50" title="Tự cập nhật khi lái xe gửi; bấm để nạp lại">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} {at ? `Cập nhật lúc ${at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Tải'}
          </button>
        </header>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {todayBooks.map((b) => {
            const t = b.today;
            return (
              <button key={b.vehicle.id} onClick={() => setVehicleSel(b.vehicle.id)}
                className={`text-left rounded-lg border px-3 py-2 transition hover:shadow ${t.count ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-bold text-slate-800">{b.vehicle.plate}</p>
                  <p className="text-[12px] text-slate-500 truncate">{b.vehicle.driver_name}</p>
                  {t.count > 0 && <span className="ml-auto text-[11px] font-bold text-emerald-800">{t.count} lần</span>}
                </div>
                {t.last ? (
                  <p className="text-[12.5px] text-emerald-800 tabular-nums">
                    {fmtReadTime(t.last.read_at)} {READING_KINDS[t.last.kind]?.short.toLowerCase()}: <b>{fmtKm(t.last.odo)}</b>{t.km != null && <> · {fmtKm(t.km)} km</>}
                  </p>
                ) : <p className="text-[12.5px] text-slate-500">Chưa ghi ODO</p>}
                {b.todayTrips.length > 0 && <p className="text-[11.5px] text-sky-700">{b.todayTrips.length} chuyến công tác hôm nay</p>}
              </button>
            );
          })}
        </div>
      </section>

      {/* ===== Kỳ + xe ===== */}
      <div className="no-print rounded-xl border border-slate-200 bg-white/95 shadow-sm p-3 flex flex-wrap items-center gap-2">
        <CalendarDays className="w-4 h-4 text-slate-500" />
        <button onClick={() => setMonth(-1)} className="p-1.5 rounded-lg hover:bg-red-50" title="Tháng trước"><ChevronLeft className="w-4 h-4" /></button>
        <div className="w-[140px]"><DateField value={from} onChange={(v) => setFrom(v > to ? to : v)} /></div>
        <span className="text-[13px] text-slate-500">đến</span>
        <div className="w-[140px]"><DateField value={to} onChange={(v) => setTo(v < from ? from : v)} /></div>
        <button onClick={() => setMonth(1)} className="p-1.5 rounded-lg hover:bg-red-50" title="Tháng sau"><ChevronRight className="w-4 h-4" /></button>
        <button onClick={() => { setFrom(toISODate(startOfMonth(new Date()))); setTo(toISODate(endOfMonth(new Date()))); }} className="px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold border border-slate-200 text-slate-600 hover:bg-red-50">Tháng này</button>
        <label className="flex items-center gap-1.5 text-[13px] text-slate-600 ml-1 cursor-pointer">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="accent-red-700 w-4 h-4" /> Chỉ ngày có cảnh báo
        </label>
        <div className="flex-1" />
        <button onClick={doExport} disabled={!!busy || !books.length} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50">
          {busy === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Xuất sổ nhật trình {cur ? `xe ${cur.vehicle.plate}` : '(tất cả xe)'}
        </button>
      </div>
      {error && <p className="rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[13px] px-3 py-2">{error}</p>}

      <div className="flex gap-1 overflow-x-auto pb-0.5">
        <button onClick={() => setVehicleSel('')} className={`shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-semibold ${!vehicleSel ? 'bg-red-700 text-white shadow' : 'bg-white/90 border border-slate-200 text-slate-600 hover:bg-red-50'}`}>Tổng hợp các xe</button>
        {books.map((b) => {
          const n = b.summary.missing + b.summary.errors;
          return (
            <button key={b.vehicle.id} onClick={() => setVehicleSel(b.vehicle.id)} className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold ${vehicleSel === b.vehicle.id ? 'bg-red-700 text-white shadow' : 'bg-white/90 border border-slate-200 text-slate-600 hover:bg-red-50'}`}>
              {b.vehicle.plate}
              {n > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${vehicleSel === b.vehicle.id ? 'bg-white text-red-800' : 'bg-amber-400 text-red-900'}`}>{n}</span>}
            </button>
          );
        })}
      </div>

      {!cur ? <SummaryTable books={books} periodLabel={periodLabel} onPick={setVehicleSel} />
        : <VehicleBook book={cur} onlyIssues={onlyIssues} onVoid={onVoid} onWrite={() => setWriting(cur.vehicle.id)} />}

      {writeVehicle && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setWriting(null)}>
          <div className="bg-white w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end -mb-2"><button onClick={() => setWriting(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button></div>
            <OdoReadingForm profile={profile} vehicle={writeVehicle} lastReading={writeBook?.lastCounted} todayReadings={writeBook?.today.readings || []}
              trips={writeBook?.todayTrips || []} drivers={drivers} onSaved={load} onClose={() => setWriting(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryTable({ books, periodLabel, onPick }) {
  const th = 'px-2.5 py-2 font-bold whitespace-nowrap';
  const totalKm = books.reduce((n, b) => n + b.summary.totalKm, 0);
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 border-b border-slate-100">
        <h3 className="text-[14px] font-bold text-slate-800">Tổng hợp nhật trình các xe {periodLabel}</h3>
        <p className="text-[12px] text-slate-500">Bấm vào một xe để xem sổ nhật trình từng ngày với đủ các lần ghi và ảnh đồng hồ.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[940px]">
          <thead>
            <tr className="bg-red-800 text-white text-right">
              <th className={`${th} text-left`}>Xe</th><th className={`${th} text-left`}>Lái xe</th>
              <th className={th}>ODO đầu kỳ</th><th className={th}>ODO cuối kỳ</th><th className={th}>Tổng km</th>
              <th className={th}>Ngày có ghi</th><th className={th}>Ngày chạy</th><th className={th}>Số lần ghi</th><th className={th}>Chuyến CT</th>
              <th className={th}>Nhiên liệu (lít)</th><th className={th}>Lít/100km</th>
              <th className={th}>Thiếu nhật trình</th><th className={th}>Có lỗi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-right tabular-nums">
            {books.map((b) => {
              const s = b.summary;
              const warn = (n, cls) => (n > 0 ? <span className={`font-bold ${cls}`}>{n}</span> : <span className="text-slate-300">0</span>);
              return (
                <tr key={b.vehicle.id} onClick={() => onPick(b.vehicle.id)} className="cursor-pointer hover:bg-red-50">
                  <td className="px-2.5 py-2 text-left font-bold text-slate-800">{b.vehicle.plate}</td>
                  <td className="px-2.5 py-2 text-left text-slate-600">{b.vehicle.driver_name}</td>
                  <td className="px-2.5 py-2">{fmtKm(s.odoFirst)}</td><td className="px-2.5 py-2">{fmtKm(s.odoLast)}</td>
                  <td className="px-2.5 py-2 font-bold text-slate-900">{fmtKm(s.totalKm)}</td>
                  <td className="px-2.5 py-2">{s.daysLogged}</td><td className="px-2.5 py-2">{s.daysMoving}</td>
                  <td className="px-2.5 py-2">{s.readings}{s.voided > 0 && <span className="text-slate-400"> (+{s.voided} không tính)</span>}</td>
                  <td className="px-2.5 py-2">{s.trips}</td>
                  <td className="px-2.5 py-2">{s.fuel ? s.fuel.toLocaleString('vi-VN') : ''}</td>
                  <td className="px-2.5 py-2">{s.per100 != null ? s.per100.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : ''}</td>
                  <td className="px-2.5 py-2">{warn(s.missing, 'text-rose-700')}</td><td className="px-2.5 py-2">{warn(s.errors, 'text-rose-700')}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold text-right tabular-nums border-t-2 border-slate-300">
              <td className="px-2.5 py-2 text-left" colSpan={4}>Tổng cộng</td>
              <td className="px-2.5 py-2">{fmtKm(totalKm)}</td>
              <td colSpan={8} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function VehicleBook({ book, onlyIssues, onVoid, onWrite }) {
  const rows = [...book.rows].reverse().filter((r) => !onlyIssues || r.warnings.some((w) => w.level !== 'info'));
  const s = book.summary;
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h3 className="text-[14px] font-bold text-slate-800">Sổ nhật trình xe {book.vehicle.plate}{book.vehicle.driver_name ? ` — lái xe ${book.vehicle.driver_name}` : ''}</h3>
          <p className="text-[12px] text-slate-500 tabular-nums">Tổng {fmtKm(s.totalKm)} km · {s.daysMoving} ngày chạy · {s.readings} lần ghi · {s.trips} chuyến công tác{s.fuel ? ` · ${s.fuel.toLocaleString('vi-VN')} lít` : ''}{s.per100 != null ? ` (${s.per100.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} lít/100 km)` : ''}</p>
        </div>
        <button onClick={onWrite} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-slate-200 text-slate-700 hover:bg-red-50"><PencilLine className="w-4 h-4" /> Ghi hộ lái xe</button>
      </header>
      <p className="px-4 py-1.5 text-[11.5px] text-slate-500 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Các lần ghi không sửa/xóa được; ghi nhầm thì bấm "Không tính" (vẫn lưu, hiển thị gạch ngang, không cộng vào km).
      </p>
      <div className="divide-y divide-slate-100">
        {rows.length === 0 && <p className="px-3 py-6 text-center text-slate-400 italic text-[13px]">Không có ngày nào {onlyIssues ? 'có cảnh báo' : 'trong kỳ'}.</p>}
        {rows.map((r) => (
          <div key={r.date} className={`px-4 py-3 grid lg:grid-cols-[170px_1fr_320px] gap-3 ${r.missing ? 'bg-rose-50/50' : ''}`}>
            <div>
              <p className="text-[14px] font-bold text-slate-800">{fmtDM(parseISO(r.date))} <span className="text-slate-400 font-normal text-[12px]">{WEEKDAY[parseISO(r.date).getDay()]}</span></p>
              {r.missing ? <p className="text-[12.5px] text-rose-700 font-semibold">Chưa ghi</p> : (
                <>
                  <p className={`text-[12.5px] tabular-nums ${r.startInferred ? 'text-slate-500' : 'text-slate-700'}`} title={r.startInferred ? 'Không ghi lúc xuất phát — lấy theo lần ghi trước' : ''}>{fmtKm(r.start)} → {fmtKm(r.end)}</p>
                  {r.km != null && <p className="text-[16px] font-extrabold text-slate-900 tabular-nums">{fmtKm(r.km)} km</p>}
                  <p className="text-[11.5px] text-slate-500">{r.count} lần ghi{r.voidedCount ? ` · ${r.voidedCount} không tính` : ''}</p>
                </>
              )}
            </div>
            <div className="min-w-0">
              <ReadingList items={r.items} onVoid={onVoid} compact />
              {r.trips.length > 0 && (
                <div className="mt-1.5">{r.trips.map((t) => <p key={t.id} className="text-[11.5px] text-sky-800">• Chuyến công tác: {t.time && `${t.time}: `}{t.content}{t.location && ` — ${t.location}`}</p>)}</div>
              )}
            </div>
            <div>
              {r.warnings.map((w) => <p key={w.text} className="flex items-start gap-1 text-[12px] text-slate-700 mb-0.5">{warnIcon[w.level]}{w.text}</p>)}
              {!r.warnings.length && <p className="text-[12px] text-emerald-700">Không có cảnh báo</p>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
