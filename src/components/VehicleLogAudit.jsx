import { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Loader2, RotateCcw, X, Save, PencilLine, Trash2 } from 'lucide-react';
import { fetchVehicleLogAudit, editOdoReading } from '../lib/api';
import { READING_KINDS, ODO_SOURCES, fmtKm, fmtReadTime } from '../lib/vehicleLog';
import { FUEL_TYPES, fmtL, fmtMoney } from '../lib/fuel';
import { isoToDMY, toISODate } from '../lib/dates';
import { OdoPhoto } from './OdoForm';
import DateField from './DateField';

// Nhãn + cách hiển thị các trường khi đối chiếu cũ -> mới
const FIELDS = {
  vehicle_odo_readings: [
    ['reading_date', 'Ngày', (v) => isoToDMY(v)], ['read_at', 'Giờ ghi', (v) => fmtReadTime(v)],
    ['kind', 'Loại', (v) => READING_KINDS[v]?.short || v], ['odo', 'Số ODO', (v) => fmtKm(v)],
    ['route', 'Hành trình'], ['fuel_liters', 'Nhiên liệu (lít)', (v) => fmtL(v)], ['note', 'Ghi chú'],
    ['driver_id', 'Lái xe', null, true], ['oil_change', 'Thay dầu', (v) => (v ? 'Có' : 'Không')],
    ['borrowed', 'Mượn xe', (v) => (v ? 'Có' : 'Không')], ['odo_source', 'Nguồn số', (v) => ODO_SOURCES[v]?.label || v],
    ['voided', 'Không tính', (v) => (v ? 'Có' : 'Không')], ['void_reason', 'Lý do không tính'], ['vehicle_id', 'Xe', null, 'vehicle'],
  ],
  fuel_invoices: [
    ['invoice_date', 'Ngày HĐ', (v) => isoToDMY(v)], ['invoice_no', 'Số HĐ'], ['seller', 'Đơn vị bán'],
    ['fuel_type', 'Loại NL', (v) => FUEL_TYPES[v] || v], ['liters', 'Số lít', (v) => fmtL(v, 2)],
    ['unit_price', 'Đơn giá', (v) => fmtMoney(v)], ['amount', 'Thành tiền', (v) => fmtMoney(v)], ['odo', 'ODO', (v) => fmtKm(v)],
    ['driver_id', 'Lái xe', null, true], ['note', 'Ghi chú'], ['vehicle_id', 'Xe', null, 'vehicle'],
  ],
};

/**
 * LỊCH SỬ SỬA / XÓA nhật trình + hóa đơn nhiên liệu (bảng vehicle_log_audit — CSDL tự ghi bằng trigger,
 * không ai xóa được). Mỗi dòng: ai, lúc nào, sửa/xóa gì, lý do, các trường CŨ -> MỚI; xem ảnh gốc.
 */
export function VehicleLogAudit({ vehicles, profiles }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState(''); // '' | vehicle_odo_readings | fuel_invoices
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await fetchVehicleLogAudit(500);
    setRows(data || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  const nameOf = (id) => { const p = (profiles || []).find((x) => x.id === id); return p ? (p.full_name || p.email) : ''; };
  const plateOf = (id) => (vehicles || []).find((v) => v.id === id)?.plate || '';
  const show = (f, v) => {
    const [, , fmt, ref] = f;
    if (v == null || v === '') return '—';
    if (ref === 'vehicle') return plateOf(v) || v;
    if (ref) return nameOf(v) || v;
    return fmt ? (fmt(v) || String(v)) : String(v);
  };
  const list = useMemo(() => rows.filter((r) => !kind || r.table_name === kind), [rows, kind]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <header className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center gap-2">
        <History className="w-4 h-4 text-red-700" />
        <h3 className="text-[14px] font-bold text-slate-800 mr-auto">Lịch sử sửa / xóa nhật trình và hóa đơn</h3>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[13px]">
          <option value="">Tất cả</option><option value="vehicle_odo_readings">Lần ghi ODO</option><option value="fuel_invoices">Hóa đơn nhiên liệu</option>
        </select>
        <button onClick={load} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] font-semibold text-slate-600 border border-slate-200 hover:bg-red-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />} Làm mới
        </button>
      </header>
      <p className="px-4 py-1.5 text-[11.5px] text-slate-500 bg-slate-50 border-b border-slate-100">Hệ thống TỰ ghi mọi lần sửa / xóa (kể cả đánh dấu "Không tính"), giữ nguyên nội dung cũ và ảnh / tệp gốc; không ai sửa hay xóa được lịch sử này.</p>
      <ul className="divide-y divide-slate-100">
        {!list.length && <li className="px-4 py-6 text-center text-[13px] text-slate-400">{loading ? 'Đang tải…' : 'Chưa có lần sửa / xóa nào.'}</li>}
        {list.map((r) => {
          const fields = FIELDS[r.table_name] || [];
          const o = r.old_data || {};
          const nw = r.new_data || {};
          const changed = r.action === 'update' ? fields.filter((f) => JSON.stringify(o[f[0]] ?? null) !== JSON.stringify(nw[f[0]] ?? null)) : [];
          const isOdo = r.table_name === 'vehicle_odo_readings';
          const d = new Date(r.at);
          return (
            <li key={r.id} className="px-4 py-3 flex gap-3">
              {isOdo && <OdoPhoto path={o.photo_path} className="w-12 h-12" label="gốc" />}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-slate-800">
                  <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded border mr-1.5 ${r.action === 'delete' ? 'bg-rose-50 text-rose-800 border-rose-200' : 'bg-sky-50 text-sky-800 border-sky-200'}`}>
                    {r.action === 'delete' ? <Trash2 className="w-3 h-3" /> : <PencilLine className="w-3 h-3" />}{r.action === 'delete' ? 'Xóa' : 'Sửa'}
                  </span>
                  <b>{isOdo ? `Lần ghi ODO ${fmtKm(o.odo)} km` : `Hóa đơn ${o.invoice_no || ''} (${fmtL(o.liters, 2)} lít)`}</b>
                  {' — xe '}{plateOf(o.vehicle_id)}{' ngày '}{isoToDMY(isOdo ? o.reading_date : o.invoice_date)}
                </p>
                <p className="text-[11.5px] text-slate-500">
                  {d.toLocaleString('vi-VN')} · bởi {nameOf(r.actor_id) || r.actor_email || 'không rõ'}
                  {r.reason ? <> · Lý do: <b className="text-slate-700">{r.reason}</b></> : <span className="text-amber-700"> · (không ghi lý do)</span>}
                </p>
                {r.action === 'update' && (
                  <ul className="mt-1 space-y-0.5">
                    {changed.map((f) => (
                      <li key={f[0]} className="text-[12px] text-slate-700"><span className="text-slate-500">{f[1]}:</span> <span className="line-through text-rose-700">{show(f, o[f[0]])}</span> → <b className="text-emerald-800">{show(f, nw[f[0]])}</b></li>
                    ))}
                    {!changed.length && <li className="text-[12px] text-slate-400">Không đổi trường nội dung nào.</li>}
                  </ul>
                )}
                {r.action === 'delete' && (
                  <p className="mt-1 text-[12px] text-slate-600">Nội dung đã xóa: {fields.filter((f) => o[f[0]] != null && o[f[0]] !== '' && !['vehicle_id'].includes(f[0])).map((f) => `${f[1]}: ${show(f, o[f[0]])}`).join(' · ')}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Giờ:phút (giờ máy) <-> ISO
const hm = (ts) => fmtReadTime(ts) || '08:00';

/** SỬA một lần ghi ODO (người quản lý) — bắt buộc lý do; CSDL lưu bản cũ. */
export function ReadingEditForm({ reading, vehicles, drivers, onSaved, onClose }) {
  const [f, setF] = useState(() => ({
    vehicle_id: reading.vehicle_id, reading_date: reading.reading_date, time: hm(reading.read_at), kind: reading.kind,
    odo: reading.odo ?? '', route: reading.route || '', fuel_liters: reading.fuel_liters ?? '', note: reading.note || '',
    driver_id: reading.driver_id || '', oil_change: !!reading.oil_change, borrowed: !!reading.borrowed,
  }));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => {
    setMsg('');
    const odo = String(f.odo).replace(/\D+/g, '');
    if (!odo) return setMsg('Số ODO không được để trống.');
    if (!reason.trim()) return setMsg('Bắt buộc nhập lý do sửa.');
    const fuel = String(f.fuel_liters).trim() ? Number(String(f.fuel_liters).replace(',', '.')) : null;
    if (fuel != null && (Number.isNaN(fuel) || fuel < 0)) return setMsg('Số lít không hợp lệ.');
    const patch = {
      vehicle_id: f.vehicle_id, reading_date: f.reading_date, read_at: new Date(`${f.reading_date}T${f.time || '00:00'}:00`).toISOString(),
      kind: f.kind, odo: parseInt(odo, 10), route: f.route.trim() || null, fuel_liters: fuel, note: f.note.trim() || null,
      driver_id: f.driver_id || null, oil_change: f.oil_change, borrowed: f.borrowed,
    };
    // Giữ nguyên giờ ghi gốc nếu không đổi ngày/giờ (tránh lệch giây)
    if (f.reading_date === reading.reading_date && f.time === hm(reading.read_at)) delete patch.read_at;
    setBusy(true);
    const { error } = await editOdoReading(reading.id, patch, reason.trim());
    setBusy(false);
    if (error) return setMsg(error.message);
    onSaved();
  };
  const field = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-[13.5px] outline-none focus:border-red-500';
  const lab = 'text-[11.5px] font-semibold text-slate-600 block mb-0.5';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-extrabold text-slate-800">Sửa lần ghi ODO</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 border border-slate-200 p-2">
          <OdoPhoto path={reading.photo_path} className="w-20 h-20" label="gốc" />
          <p className="text-[12px] text-slate-600">Ảnh gốc giữ nguyên. Nội dung trước khi sửa được lưu trong "Lịch sử sửa/xóa" để đối chiếu.
            {reading.odo_ocr != null && <> Máy đọc: <b>{fmtKm(reading.odo_ocr)} km</b>.</>}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div><label className={lab}>Xe</label>
            <select value={f.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)} className={field}>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></div>
          <div><label className={lab}>Ngày</label><DateField value={f.reading_date} onChange={(v) => set('reading_date', v || toISODate(new Date()))} /></div>
          <div><label className={lab}>Giờ</label><input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} className={field} /></div>
          <div><label className={lab}>Loại</label>
            <select value={f.kind} onChange={(e) => set('kind', e.target.value)} className={field}>{Object.entries(READING_KINDS).map(([k, v]) => <option key={k} value={k}>{v.short}</option>)}</select></div>
          <div><label className={lab}>Số ODO (km)</label><input className={field} inputMode="numeric" value={f.odo} onChange={(e) => set('odo', e.target.value)} /></div>
          <div><label className={lab}>Nhiên liệu (lít)</label><input className={field} inputMode="decimal" value={f.fuel_liters} onChange={(e) => set('fuel_liters', e.target.value)} /></div>
          <div className="col-span-2 sm:col-span-3"><label className={lab}>Hành trình</label><input className={field} value={f.route} onChange={(e) => set('route', e.target.value)} /></div>
          <div className="col-span-2"><label className={lab}>Ghi chú</label><input className={field} value={f.note} onChange={(e) => set('note', e.target.value)} /></div>
          <div><label className={lab}>Lái xe</label>
            <select value={f.driver_id} onChange={(e) => set('driver_id', e.target.value)} className={field}>
              <option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
            </select></div>
          <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={f.oil_change} onChange={(e) => set('oil_change', e.target.checked)} className="w-4 h-4" /> Thay dầu</label>
          <label className="flex items-center gap-1.5 text-[13px]"><input type="checkbox" checked={f.borrowed} onChange={(e) => set('borrowed', e.target.checked)} className="w-4 h-4" /> Mượn xe</label>
          <div className="col-span-2 sm:col-span-3"><label className={`${lab} text-rose-700`}>Lý do sửa * (lưu vết)</label><input className={field} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Vd: Lái xe đọc nhầm số, đối chiếu ảnh là 55.266" /></div>
        </div>
        {msg && <p className="text-[13px] text-rose-800 bg-rose-50 rounded-lg px-3 py-2">{msg}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Lưu thay đổi
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold">Hủy</button>
        </div>
      </div>
    </div>
  );
}
