import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Gauge, Loader2, RotateCcw, FileSpreadsheet, CheckCheck, X, AlertTriangle, Info, Car, CalendarDays, ChevronLeft, ChevronRight, PencilLine, Image as ImageIcon,
} from 'lucide-react';
import { fetchVehicleLogs, fetchEntries, updateVehicleLogs } from '../lib/api';
import { UNIT_NAME } from '../lib/constants';
import { canManageVehicleLog, canEditVehicleLog, DRIVER_EDIT_DAYS } from '../lib/permissions';
import { addDays, parseISO, toISODate, fmtDMY, fmtDM, startOfMonth, endOfMonth, addMonths } from '../lib/dates';
import { buildLogbook, canBulkConfirm, exportLogbookXlsx, fmtKm, LOG_STATUS, tripsByDate } from '../lib/vehicleLog';
import OdoForm, { OdoPhoto } from './OdoForm';
import DateField from './DateField';

const CHAIN_DAYS = 92; // nạp thêm 3 tháng trước kỳ để nối chuỗi ODO (km ngày đầu kỳ)
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const minIso = (a, b) => (a < b ? a : b);
const maxIso = (a, b) => (a > b ? a : b);

/**
 * Tab NHẬT TRÌNH XE.
 *  - Lái xe (lai_xe): cập nhật ODO hằng ngày cho xe mình (gõ số hoặc gửi ảnh), xem lịch sử.
 *  - Phòng HC-TC-QT / Quản trị: theo dõi hôm nay xe nào đã/chưa cập nhật, sổ nhật trình từng
 *    xe theo kỳ, đọc số từ ảnh, xác nhận, cảnh báo bất thường, xuất sổ Excel.
 */
export default function VehicleLogView({ profile, vehicles, profiles }) {
  return canManageVehicleLog(profile)
    ? <ManagerBoard profile={profile} vehicles={vehicles} profiles={profiles} />
    : <DriverPage profile={profile} vehicles={vehicles} profiles={profiles} />;
}

// Nạp nhật trình + lịch công tác cho khoảng [from,to] (kèm đoạn nối chuỗi phía trước)
function useLogData(from, to, vehicleId) {
  const [logs, setLogs] = useState([]);
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
    const [l, e] = await Promise.all([fetchVehicleLogs(chainFrom, to, vehicleId || null), fetchEntries(from, to)]);
    if (id !== req.current) return;
    if (l.error || e.error) setError((l.error || e.error).message || 'Không tải được dữ liệu.');
    setLogs(l.data || []); setEntries(e.data || []); setAt(new Date()); setLoading(false);
  }, [from, to, vehicleId]);
  useEffect(() => { load(); }, [load]);
  return { logs, entries, loading, error, at, load };
}

const prevLogOf = (logs, vehicleId, date) => logs
  .filter((l) => l.vehicle_id === vehicleId && l.log_date < date && (l.odo_end != null || l.odo_start != null))
  .sort((a, b) => b.log_date.localeCompare(a.log_date))[0] || null;

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
  const [date, setDate] = useState(today);
  const from = toISODate(addDays(parseISO(today), -30));
  const { logs, entries, loading, error, load } = useLogData(from, today, vehicleId);
  const vehicle = active.find((v) => v.id === vehicleId) || (vehicles || []).find((v) => v.id === vehicleId);
  const log = logs.find((l) => l.vehicle_id === vehicleId && l.log_date === date) || null;
  const trips = useMemo(() => (vehicleId ? tripsByDate(entries, vehicleId).get(date) || [] : []), [entries, vehicleId, date]);
  const book = useMemo(() => (vehicle ? buildLogbook({ logs, vehicles: [vehicle], entries, profiles, from, to: today, today, showPrivate: true })[0] : null),
    [logs, vehicle, entries, profiles, from, today]);
  const minDate = toISODate(addDays(parseISO(today), -DRIVER_EDIT_DAYS));
  const shiftDate = (n) => {
    const d = toISODate(addDays(parseISO(date), n));
    if (d >= minDate && d <= today) setDate(d);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-3">
      <div className="rounded-2xl bg-gradient-to-r from-red-800 to-red-700 text-white px-4 py-3 shadow">
        <p className="text-[12px] text-red-100">Nhật trình xe — lái xe {profile.full_name || ''}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          <Car className="w-5 h-5 text-amber-300" />
          <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="bg-white/15 border border-white/30 rounded-lg px-2 py-1.5 text-[15px] font-bold outline-none">
            <option value="" className="text-slate-800">— Chọn xe —</option>
            {active.map((v) => <option key={v.id} value={v.id} className="text-slate-800">{v.plate}{v.driver_name ? ` (${v.driver_name})` : ''}</option>)}
          </select>
          {vehicleId && vehicleId !== defaultVehicle && <span className="text-[11.5px] text-amber-200">Đang ghi cho xe khác xe phụ trách</span>}
        </div>
      </div>

      {!vehicleId ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">Tài khoản chưa được gắn xe phụ trách — hãy chọn xe đang lái ở trên (hoặc báo Phòng HC-TC-QT gắn xe).</p>
      ) : (
        <>
          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-2 py-1.5 shadow-sm">
            <button onClick={() => shiftDate(-1)} disabled={date <= minDate} className="p-2 rounded-lg hover:bg-red-50 disabled:opacity-30"><ChevronLeft className="w-5 h-5" /></button>
            <div className="flex-1 text-center">
              <p className="text-[15px] font-bold text-slate-800">{date === today ? 'Hôm nay' : WEEKDAY[parseISO(date).getDay()]} — {fmtDMY(parseISO(date))}</p>
              <p className="text-[11px] text-slate-400">Được tự sửa nhật trình trong {DRIVER_EDIT_DAYS} ngày gần nhất (khi chưa xác nhận)</p>
            </div>
            <button onClick={() => shiftDate(1)} disabled={date >= today} className="p-2 rounded-lg hover:bg-red-50 disabled:opacity-30"><ChevronRight className="w-5 h-5" /></button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            {!vehicle ? null : loading && !logs.length ? (
              <p className="text-center text-slate-400 py-6"><Loader2 className="w-5 h-5 animate-spin inline" /> Đang tải…</p>
            ) : (
              <OdoForm profile={profile} vehicle={vehicle} date={date} log={log} prevLog={prevLogOf(logs, vehicleId, date)} trips={trips}
                canEdit={canEditVehicleLog(profile, log, today, date)} onSaved={load} />
            )}
            {error && <p className="mt-2 text-[12.5px] text-rose-700">{error}</p>}
          </div>

          {book && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <p className="text-[14px] font-bold text-slate-800">30 ngày gần nhất</p>
                <p className="text-[12.5px] text-slate-500">Tổng <b className="text-slate-800 tabular-nums">{fmtKm(book.summary.totalKm)} km</b></p>
              </div>
              <ul className="divide-y divide-slate-100">
                {[...book.rows].reverse().map((r) => (
                  <li key={r.date}>
                    <button onClick={() => r.date >= minDate && setDate(r.date)} className={`w-full text-left px-4 py-2.5 flex items-center gap-3 ${r.date === date ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
                      <div className="w-14 shrink-0">
                        <p className="text-[13px] font-bold text-slate-800">{fmtDM(parseISO(r.date))}</p>
                        <p className="text-[11px] text-slate-400">{WEEKDAY[parseISO(r.date).getDay()]}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        {r.missing
                          ? <p className="text-[13px] text-rose-700 font-semibold">Chưa ghi nhật trình (có chuyến công tác)</p>
                          : <p className="text-[13px] text-slate-700 tabular-nums">{r.start != null ? fmtKm(r.start) : '…'} → {r.end != null ? fmtKm(r.end) : '…'}{r.km != null && <b className="ml-2 text-slate-900">{fmtKm(r.km)} km</b>}</p>}
                        {r.warnings.filter((w) => w.level !== 'info').slice(0, 1).map((w) => <p key={w.text} className="text-[11.5px] text-amber-700 truncate">{w.text}</p>)}
                      </div>
                      {r.status && <span className={`shrink-0 text-[10.5px] font-bold px-1.5 py-0.5 rounded border ${LOG_STATUS[r.status].cls}`}>{LOG_STATUS[r.status].label}</span>}
                    </button>
                  </li>
                ))}
                {!book.rows.length && <li className="px-4 py-5 text-center text-[13px] text-slate-400">Chưa có nhật trình nào trong 30 ngày qua.</li>}
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
  const [editing, setEditing] = useState(null); // { vehicleId, date }
  const [busy, setBusy] = useState('');
  const loadFrom = minIso(from, today), loadTo = maxIso(to, today);
  const { logs, entries, loading, error, at, load } = useLogData(loadFrom, loadTo, null);
  const drivers = useMemo(() => (profiles || []).filter((p) => p.role === 'lai_xe'), [profiles]);

  const books = useMemo(() => buildLogbook({ logs, vehicles, entries, profiles, from, to, today, showPrivate: true }),
    [logs, vehicles, entries, profiles, from, to, today]);
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
  const confirmRows = async (rows) => {
    const ids = rows.map((r) => r.log.id);
    if (!ids.length || !window.confirm(`Xác nhận ${ids.length} ngày nhật trình? Lái xe sẽ không tự sửa được các ngày này.`)) return;
    setBusy('confirm');
    const { error: err } = await updateVehicleLogs(ids, { status: 'da_xac_nhan', confirmed_by: profile.id, confirmed_at: new Date().toISOString() });
    setBusy('');
    if (err) alert('Không xác nhận được: ' + err.message);
    load();
  };

  const editVehicle = editing ? (vehicles || []).find((v) => v.id === editing.vehicleId) : null;
  const editLog = editing ? logs.find((l) => l.vehicle_id === editing.vehicleId && l.log_date === editing.date) || null : null;
  const updatedToday = books.filter((b) => b.todayLog).length;

  return (
    <div className="space-y-3">
      {/* ===== Hôm nay ===== */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
          <Gauge className="w-4 h-4 text-red-700" />
          <h3 className="text-[14px] font-bold text-slate-800">Hôm nay {fmtDMY(parseISO(today))}: <span className={updatedToday === books.length ? 'text-emerald-700' : 'text-amber-700'}>{updatedToday}/{books.length} xe đã cập nhật ODO</span></h3>
          <div className="flex-1" />
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold text-slate-600 border border-slate-200 hover:bg-red-50">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} {at ? `Cập nhật lúc ${at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : 'Tải'}
          </button>
        </header>
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {books.map((b) => {
            const t = b.todayLog;
            const km = t && t.odo_end != null && t.odo_start != null ? t.odo_end - t.odo_start : null;
            return (
              <button key={b.vehicle.id} onClick={() => setEditing({ vehicleId: b.vehicle.id, date: today })}
                className={`text-left rounded-lg border px-3 py-2 transition hover:shadow ${t ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-bold text-slate-800">{b.vehicle.plate}</p>
                  <p className="text-[12px] text-slate-500 truncate">{b.vehicle.driver_name}</p>
                  {(t?.photo_start_path || t?.photo_end_path) && <ImageIcon className="w-3.5 h-3.5 text-slate-400 ml-auto" />}
                </div>
                {t ? (
                  <p className="text-[12.5px] text-emerald-800 tabular-nums">
                    {t.odo_start != null ? fmtKm(t.odo_start) : (t.photo_start_path ? 'ảnh' : '…')} → {t.odo_end != null ? fmtKm(t.odo_end) : (t.photo_end_path ? 'ảnh' : 'chưa về')}
                    {km != null && <b> · {fmtKm(km)} km</b>}
                  </p>
                ) : <p className="text-[12.5px] text-slate-500">Chưa cập nhật ODO</p>}
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
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="accent-red-700 w-4 h-4" /> Chỉ dòng cần xử lý
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
          const n = b.summary.needRead + b.summary.missing + b.summary.errors;
          return (
            <button key={b.vehicle.id} onClick={() => setVehicleSel(b.vehicle.id)} className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold ${vehicleSel === b.vehicle.id ? 'bg-red-700 text-white shadow' : 'bg-white/90 border border-slate-200 text-slate-600 hover:bg-red-50'}`}>
              {b.vehicle.plate}
              {n > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${vehicleSel === b.vehicle.id ? 'bg-white text-red-800' : 'bg-amber-400 text-red-900'}`}>{n}</span>}
            </button>
          );
        })}
      </div>

      {!cur ? <SummaryTable books={books} periodLabel={periodLabel} onPick={setVehicleSel} />
        : <VehicleBook book={cur} onlyIssues={onlyIssues} busy={busy} onEdit={(date) => setEditing({ vehicleId: cur.vehicle.id, date })}
            onConfirm={confirmRows} onAdd={() => setEditing({ vehicleId: cur.vehicle.id, date: today })} />}

      {editing && editVehicle && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setEditing(null)}>
          <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <div className="w-[150px]"><DateField value={editing.date} onChange={(d) => setEditing((x) => ({ ...x, date: d }))} /></div>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <OdoForm profile={profile} vehicle={editVehicle} date={editing.date} log={editLog}
              prevLog={prevLogOf(logs, editVehicle.id, editing.date)}
              trips={tripsByDate(entries, editVehicle.id).get(editing.date) || []} drivers={drivers}
              canEdit onSaved={load} onClose={() => setEditing(null)} />
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
        <p className="text-[12px] text-slate-500">Bấm vào một xe để xem sổ nhật trình từng ngày, đọc số từ ảnh và xác nhận.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[980px]">
          <thead>
            <tr className="bg-red-800 text-white text-right">
              <th className={`${th} text-left`}>Xe</th><th className={`${th} text-left`}>Lái xe</th>
              <th className={th}>ODO đầu kỳ</th><th className={th}>ODO cuối kỳ</th><th className={th}>Tổng km</th>
              <th className={th}>Ngày ghi</th><th className={th}>Ngày chạy</th><th className={th}>Chuyến CT</th>
              <th className={th}>Nhiên liệu (lít)</th><th className={th}>Lít/100km</th>
              <th className={th}>Chờ xác nhận</th><th className={th}>Cần đọc ảnh</th><th className={th}>Thiếu nhật trình</th><th className={th}>Có lỗi</th>
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
                  <td className="px-2.5 py-2">{s.daysLogged}</td><td className="px-2.5 py-2">{s.daysMoving}</td><td className="px-2.5 py-2">{s.trips}</td>
                  <td className="px-2.5 py-2">{s.fuel ? s.fuel.toLocaleString('vi-VN') : ''}</td>
                  <td className="px-2.5 py-2">{s.per100 != null ? s.per100.toLocaleString('vi-VN', { maximumFractionDigits: 1 }) : ''}</td>
                  <td className="px-2.5 py-2">{warn(s.pending, 'text-amber-700')}</td><td className="px-2.5 py-2">{warn(s.needRead, 'text-amber-700')}</td>
                  <td className="px-2.5 py-2">{warn(s.missing, 'text-rose-700')}</td><td className="px-2.5 py-2">{warn(s.errors, 'text-rose-700')}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-bold text-right tabular-nums border-t-2 border-slate-300">
              <td className="px-2.5 py-2 text-left" colSpan={4}>Tổng cộng</td>
              <td className="px-2.5 py-2">{fmtKm(totalKm)}</td>
              <td colSpan={9} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function VehicleBook({ book, onlyIssues, busy, onEdit, onConfirm, onAdd }) {
  const rows = [...book.rows].reverse().filter((r) => !onlyIssues || r.missing || r.needRead || r.status === 'cho_xac_nhan' || r.warnings.some((w) => w.level !== 'info'));
  const confirmable = book.rows.filter(canBulkConfirm);
  const s = book.summary;
  const icon = { error: <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />, warn: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />, info: <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" /> };
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h3 className="text-[14px] font-bold text-slate-800">Sổ nhật trình xe {book.vehicle.plate}{book.vehicle.driver_name ? ` — lái xe ${book.vehicle.driver_name}` : ''}</h3>
          <p className="text-[12px] text-slate-500 tabular-nums">Tổng {fmtKm(s.totalKm)} km · {s.daysMoving} ngày chạy · {s.trips} chuyến công tác{s.fuel ? ` · ${s.fuel.toLocaleString('vi-VN')} lít` : ''}{s.per100 != null ? ` (${s.per100.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} lít/100 km)` : ''}</p>
        </div>
        <button onClick={onAdd} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-slate-200 text-slate-700 hover:bg-red-50"><PencilLine className="w-4 h-4" /> Nhập / sửa một ngày</button>
        <button onClick={() => onConfirm(confirmable)} disabled={!confirmable.length || !!busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-40" title="Chỉ xác nhận các ngày đủ số, không có lỗi">
          {busy === 'confirm' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />} Xác nhận {confirmable.length} ngày hợp lệ
        </button>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[1050px]">
          <thead>
            <tr className="bg-red-800 text-white">
              <th className="px-2.5 py-2 text-left">Ngày</th><th className="px-2.5 py-2 text-left">Lái xe</th>
              <th className="px-2.5 py-2 text-right">ODO xuất phát</th><th className="px-2.5 py-2 text-right">ODO về</th><th className="px-2.5 py-2 text-right">Km</th>
              <th className="px-2.5 py-2 text-left">Ảnh</th><th className="px-2.5 py-2 text-left">Hành trình / chuyến công tác</th>
              <th className="px-2.5 py-2 text-right">Lít</th><th className="px-2.5 py-2 text-left">Trạng thái / cảnh báo</th><th className="px-2.5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {rows.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400 italic">Không có dòng nào {onlyIssues ? 'cần xử lý' : 'trong kỳ'}.</td></tr>}
            {rows.map((r) => (
              <tr key={r.date} className={r.missing ? 'bg-rose-50/50' : r.needRead ? 'bg-amber-50/50' : ''}>
                <td className="px-2.5 py-2 whitespace-nowrap"><b>{fmtDM(parseISO(r.date))}</b> <span className="text-slate-400">{WEEKDAY[parseISO(r.date).getDay()]}</span></td>
                <td className="px-2.5 py-2 text-slate-600">{r.driver}</td>
                <td className={`px-2.5 py-2 text-right tabular-nums ${r.startInferred ? 'text-slate-400 italic' : ''}`} title={r.startInferred ? 'Lấy theo ODO lần ghi trước' : ''}>{fmtKm(r.start)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums">{fmtKm(r.end)}</td>
                <td className="px-2.5 py-2 text-right tabular-nums font-bold">{fmtKm(r.km)}</td>
                <td className="px-2.5 py-2"><div className="flex gap-1">{r.log && <OdoPhoto path={r.log.photo_start_path} className="w-10 h-10" label="lúc xuất phát" />}{r.log && <OdoPhoto path={r.log.photo_end_path} className="w-10 h-10" label="lúc về" />}</div></td>
                <td className="px-2.5 py-2 max-w-[320px]">
                  {r.route && <p className="text-slate-700">{r.route}</p>}
                  {r.trips.map((t) => <p key={t.id} className="text-[11.5px] text-sky-800">• {t.time && `${t.time}: `}{t.content}{t.location && ` — ${t.location}`}</p>)}
                  {r.note && <p className="text-[11.5px] text-slate-500 italic">{r.note}</p>}
                </td>
                <td className="px-2.5 py-2 text-right tabular-nums">{r.fuel != null ? r.fuel.toLocaleString('vi-VN') : ''}</td>
                <td className="px-2.5 py-2 max-w-[300px]">
                  {r.status && <span className={`inline-block text-[10.5px] font-bold px-1.5 py-0.5 rounded border mb-1 ${LOG_STATUS[r.status].cls}`}>{LOG_STATUS[r.status].label}</span>}
                  {r.warnings.map((w) => <p key={w.text} className="flex items-start gap-1 text-[11.5px] text-slate-700">{icon[w.level]}{w.text}</p>)}
                </td>
                <td className="px-2.5 py-2 whitespace-nowrap">
                  <button onClick={() => onEdit(r.date)} className="px-2 py-1 rounded-md text-[12px] font-semibold text-red-700 hover:bg-red-50">{r.missing ? 'Nhập' : r.needRead ? 'Đọc số' : 'Sửa'}</button>
                  {canBulkConfirm(r) && <button onClick={() => onConfirm([r])} className="px-2 py-1 rounded-md text-[12px] font-semibold text-emerald-700 hover:bg-emerald-50">Xác nhận</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
