import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Fuel, Upload, FileSpreadsheet, Loader2, AlertTriangle, Info, X, Save, PencilLine, Trash2, ScanLine, FileText, ChevronDown, CheckCircle2,
} from 'lucide-react';
import {
  fetchFuelNorms, saveFuelNorm, fetchFuelInvoices, addFuelInvoice, editFuelInvoice, deleteFuelInvoice, uploadInvoiceFile, getOdoPhotoUrl,
} from '../lib/api';
import { UNIT_NAME } from '../lib/constants';
import { addDays, parseISO, toISODate, isoToDMY } from '../lib/dates';
import { compressImage } from '../lib/images';
import { readInvoice } from '../lib/odoOcr';
import { fmtKm } from '../lib/vehicleLog';
import {
  buildFuelReport, exportFuelXlsx, FUEL_TYPES, FUEL_STATUS, fmtMoney, fmtL, invoiceAmount, invoicePrice,
} from '../lib/fuel';
import DateField from './DateField';

const LEVEL = {
  error: { icon: <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />, cls: 'text-rose-800' },
  warn: { icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />, cls: 'text-amber-900' },
  info: { icon: <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />, cls: 'text-slate-600' },
};
const num = (s) => { const t = String(s ?? '').replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); const v = Number(t); return t === '' || Number.isNaN(v) ? null : v; };

/**
 * NHIÊN LIỆU & ĐỊNH MỨC (Phòng HC-TC-QT / Quản trị): định mức từng xe, tải hóa đơn (máy tự đọc), tổng
 * hợp theo kỳ so với km nhật trình, cảnh báo, xuất Excel. Sửa / xóa hóa đơn bắt buộc lý do (lưu vết).
 * props: profile, vehicles, profiles, books (buildLogbook của kỳ), from, to, today, periodLabel
 */
export default function FuelPanel({ profile, vehicles, profiles, books, from, to, today, periodLabel }) {
  const [norms, setNorms] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null); // { invoice? } -> hộp thoại hóa đơn
  const [normEdit, setNormEdit] = useState(null); // { vehicle_id, norm_l100, fuel_type, tank_liters }
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [busy, setBusy] = useState('');
  const req = useRef(0);
  const load = useCallback(async () => {
    const id = ++req.current;
    setLoading(true); setError('');
    // nạp thêm 1 năm trước kỳ để phát hiện trùng số hóa đơn
    const [nr, iv] = await Promise.all([fetchFuelNorms(), fetchFuelInvoices(toISODate(addDays(parseISO(from), -365)), to)]);
    if (id !== req.current) return;
    if (nr.error || iv.error) setError((nr.error || iv.error).message);
    setNorms(nr.data || []); setInvoices(iv.data || []); setLoading(false);
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const report = useMemo(() => buildFuelReport({ vehicles: vehicles.filter((v) => v.active !== false), norms, invoices, books, from, to, today }),
    [vehicles, norms, invoices, books, from, to, today]);
  const nameOf = useCallback((id) => { const p = (profiles || []).find((x) => x.id === id); return p ? (p.full_name || p.email) : ''; }, [profiles]);
  const drivers = useMemo(() => (profiles || []).filter((p) => p.role === 'lai_xe'), [profiles]);
  const t = report.totals;

  const saveNorm = async () => {
    const row = {
      vehicle_id: normEdit.vehicle_id,
      norm_l100: num(normEdit.norm_l100), fuel_type: normEdit.fuel_type || null, tank_liters: num(normEdit.tank_liters),
      updated_by: profile.id,
    };
    if (row.norm_l100 != null && (row.norm_l100 <= 0 || row.norm_l100 > 100)) { alert('Định mức không hợp lệ (lít/100 km).'); return; }
    setBusy('norm');
    const { error: err } = await saveFuelNorm(row);
    setBusy('');
    if (err) { alert('Không lưu được định mức: ' + err.message); return; }
    setNormEdit(null); load();
  };
  const removeInvoice = async (inv) => {
    const reason = window.prompt(`XÓA hóa đơn ${inv.invoice_no || ''} ngày ${isoToDMY(inv.invoice_date)} (${fmtL(inv.liters)} lít)?\nNội dung cũ và tệp hóa đơn vẫn được lưu trong "Lịch sử sửa/xóa". Nhập lý do xóa:`);
    if (reason == null) return;
    if (!reason.trim()) { alert('Bắt buộc nhập lý do.'); return; }
    const { error: err } = await deleteFuelInvoice(inv.id, reason.trim());
    if (err) alert('Không xóa được: ' + err.message);
    load();
  };
  const doExport = async () => {
    setBusy('xlsx');
    try { await exportFuelXlsx(report, { unitName: UNIT_NAME, periodLabel, generatedText: new Date().toLocaleString('vi-VN'), fileTag: `${from}_${to}`, nameOf }); }
    catch (e) { alert('Không xuất được: ' + (e?.message || e)); }
    setBusy('');
  };

  const alerts = showAllAlerts ? report.alerts : report.alerts.slice(0, 8);
  const tile = (label, value, cls = 'text-slate-800') => (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2"><p className="text-[11.5px] text-slate-500">{label}</p><p className={`text-[18px] font-extrabold tabular-nums ${cls}`}>{value}</p></div>
  );
  const th = 'px-2.5 py-2 font-bold whitespace-nowrap';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[15px] font-bold text-slate-800 flex items-center gap-1.5 mr-auto"><Fuel className="w-4 h-4 text-red-700" /> Nhiên liệu & định mức {periodLabel}</h3>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        <button onClick={() => setForm({})} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold bg-red-700 text-white hover:bg-red-800"><Upload className="w-4 h-4" /> Tải hóa đơn lên</button>
        <button onClick={doExport} disabled={!!busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50">
          {busy === 'xlsx' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} Xuất báo cáo nhiên liệu
        </button>
      </div>
      {error && <p className="rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[13px] px-3 py-2">{error}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {tile('Lít trên hóa đơn', fmtL(t.liters))}
        {tile('Thành tiền', fmtMoney(t.amount))}
        {tile('Số hóa đơn', t.invoices)}
        {tile('Lít theo định mức', fmtL(t.allowed))}
        {tile('Tiền vượt định mức', t.overAmount ? fmtMoney(t.overAmount) : '0 đ', t.overAmount ? 'text-rose-700' : 'text-slate-800')}
        {tile('Cảnh báo', `${t.errors} nghiêm trọng · ${t.warns}`, t.errors ? 'text-rose-700' : t.warns ? 'text-amber-700' : 'text-emerald-700')}
      </div>

      {/* Tổng hợp theo xe + định mức (sửa tại chỗ) */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[1100px]">
            <thead>
              <tr className="bg-red-800 text-white text-right">
                <th className={`${th} text-left`}>Xe</th><th className={`${th} text-left`}>Loại NL</th><th className={th}>Định mức (l/100km)</th><th className={th}>Bình (lít)</th>
                <th className={th}>Km</th><th className={th}>Lít theo ĐM</th><th className={th}>Lít hóa đơn</th><th className={th}>Lít LX khai</th>
                <th className={th}>Thực tế (l/100km)</th><th className={th}>Vượt</th><th className={th}>Thành tiền</th><th className={`${th} text-left`}>Đánh giá</th><th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-right tabular-nums">
              {report.rows.map((r) => {
                const ed = normEdit?.vehicle_id === r.vehicle.id;
                const inp = 'w-[70px] bg-white border border-slate-300 rounded px-1.5 py-1 text-right';
                return (
                  <tr key={r.vehicle.id} className={ed ? 'bg-amber-50' : 'hover:bg-slate-50'}>
                    <td className="px-2.5 py-2 text-left font-bold text-slate-800">{r.vehicle.plate}<span className="block text-[11px] font-normal text-slate-500">{r.vehicle.driver_name}</span></td>
                    <td className="px-2.5 py-2 text-left">
                      {ed ? (
                        <select value={normEdit.fuel_type || ''} onChange={(e) => setNormEdit({ ...normEdit, fuel_type: e.target.value })} className="bg-white border border-slate-300 rounded px-1 py-1">
                          <option value="">—</option>{Object.entries(FUEL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      ) : (FUEL_TYPES[r.norm?.fuel_type] || <span className="text-slate-300">—</span>)}
                    </td>
                    <td className="px-2.5 py-2">{ed ? <input className={inp} inputMode="decimal" value={normEdit.norm_l100 ?? ''} onChange={(e) => setNormEdit({ ...normEdit, norm_l100: e.target.value })} /> : (r.norm?.norm_l100 != null ? fmtL(r.norm.norm_l100, 2) : <span className="text-slate-300">chưa đặt</span>)}</td>
                    <td className="px-2.5 py-2">{ed ? <input className={inp} inputMode="decimal" value={normEdit.tank_liters ?? ''} onChange={(e) => setNormEdit({ ...normEdit, tank_liters: e.target.value })} /> : fmtL(r.norm?.tank_liters)}</td>
                    <td className="px-2.5 py-2">{fmtKm(r.km)}</td>
                    <td className="px-2.5 py-2">{fmtL(r.allowed)}</td>
                    <td className="px-2.5 py-2 font-bold text-slate-900">{fmtL(r.liters)}</td>
                    <td className="px-2.5 py-2 text-slate-500">{fmtL(r.reported)}</td>
                    <td className="px-2.5 py-2">{fmtL(r.actual)}</td>
                    <td className={`px-2.5 py-2 font-semibold ${FUEL_STATUS[r.status].cls}`}>{r.overPct != null ? `${r.overPct > 0 ? '+' : ''}${Math.round(r.overPct * 100)}%` : ''}</td>
                    <td className="px-2.5 py-2">{fmtMoney(r.amount || null)}</td>
                    <td className={`px-2.5 py-2 text-left font-semibold ${FUEL_STATUS[r.status].cls}`}>{FUEL_STATUS[r.status].label}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      {ed ? (
                        <span className="inline-flex gap-1">
                          <button onClick={saveNorm} disabled={busy === 'norm'} className="p-1.5 rounded bg-emerald-600 text-white" title="Lưu định mức"><Save className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setNormEdit(null)} className="p-1.5 rounded hover:bg-slate-200" title="Hủy"><X className="w-3.5 h-3.5" /></button>
                        </span>
                      ) : (
                        <button onClick={() => setNormEdit({ vehicle_id: r.vehicle.id, norm_l100: r.norm?.norm_l100 ?? '', fuel_type: r.norm?.fuel_type || '', tank_liters: r.norm?.tank_liters ?? '' })}
                          className="text-[12px] font-semibold text-red-700 hover:underline">Định mức</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-[11.5px] text-slate-500 border-t border-slate-100">
          Tiêu hao thực tế = lít trên hóa đơn ÷ km theo đồng hồ ODO trong kỳ (ODO cuối − ODO đầu) × 100. Bình đầu kỳ/cuối kỳ không đầy như nhau nên nên xem theo tháng/quý; xe chạy dưới 100 km chưa kết luận. Vượt từ 10%: cảnh báo, từ 20%: nghiêm trọng.
        </p>
      </section>

      {/* Cảnh báo */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" /><h4 className="text-[14px] font-bold text-slate-800">Cảnh báo ({report.alerts.length})</h4>
        </header>
        <ul className="px-4 py-2 space-y-1">
          {!report.alerts.length && <li className="text-[13px] text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Không có cảnh báo trong kỳ.</li>}
          {alerts.map((a, i) => <li key={i} className={`flex items-start gap-1.5 text-[12.5px] ${LEVEL[a.level].cls}`}>{LEVEL[a.level].icon}<b className="shrink-0">{a.plate}:</b> {a.text}</li>)}
        </ul>
        {report.alerts.length > 8 && (
          <button onClick={() => setShowAllAlerts((x) => !x)} className="w-full px-4 py-2 border-t border-slate-100 text-[12.5px] font-semibold text-red-700 flex items-center justify-center gap-1">
            {showAllAlerts ? 'Thu gọn' : `Xem tất cả ${report.alerts.length} cảnh báo`} <ChevronDown className={`w-4 h-4 transition ${showAllAlerts ? 'rotate-180' : ''}`} />
          </button>
        )}
      </section>

      {/* Hóa đơn trong kỳ */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <header className="px-4 py-2.5 border-b border-slate-100"><h4 className="text-[14px] font-bold text-slate-800">Hóa đơn trong kỳ ({report.invoices.length})</h4></header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px] min-w-[1000px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className={`${th} text-left`}>Ngày</th><th className={`${th} text-left`}>Xe</th><th className={`${th} text-left`}>Số HĐ</th><th className={`${th} text-left`}>Đơn vị bán</th>
                <th className={`${th} text-left`}>Loại</th><th className={`${th} text-right`}>Lít</th><th className={`${th} text-right`}>Đơn giá</th><th className={`${th} text-right`}>Thành tiền</th>
                <th className={`${th} text-left`}>Tệp</th><th className={`${th} text-left`}>Người nhập</th><th className={th} />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!report.invoices.length && <tr><td colSpan={11} className="px-3 py-5 text-center text-slate-400 italic">Chưa có hóa đơn nào trong kỳ.</td></tr>}
              {[...report.invoices].sort((a, b) => b.invoice_date.localeCompare(a.invoice_date)).map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="px-2.5 py-1.5 whitespace-nowrap">{isoToDMY(i.invoice_date)}</td>
                  <td className="px-2.5 py-1.5 font-semibold">{report.vehicleBy[i.vehicle_id]?.plate}</td>
                  <td className="px-2.5 py-1.5">{i.invoice_no}{i.edited_at && <span className="ml-1 text-[10px] font-bold px-1 rounded bg-sky-50 text-sky-700 border border-sky-200">đã sửa</span>}</td>
                  <td className="px-2.5 py-1.5 max-w-[220px] truncate" title={i.seller}>{i.seller}</td>
                  <td className="px-2.5 py-1.5">{FUEL_TYPES[i.fuel_type] || ''}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums font-semibold">{fmtL(i.liters, 2)}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtMoney(invoicePrice(i))}</td>
                  <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtMoney(invoiceAmount(i))}</td>
                  <td className="px-2.5 py-1.5">{i.file_path ? <FileLink path={i.file_path} name={i.file_name} /> : <span className="text-slate-300">—</span>}</td>
                  <td className="px-2.5 py-1.5 text-slate-500">{nameOf(i.created_by)}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">
                    <button onClick={() => setForm({ invoice: i })} className="p-1 rounded hover:bg-red-50 text-slate-500 hover:text-red-700" title="Sửa (bắt buộc lý do)"><PencilLine className="w-3.5 h-3.5" /></button>
                    <button onClick={() => removeInvoice(i)} className="p-1 rounded hover:bg-rose-50 text-slate-500 hover:text-rose-700" title="Xóa (bắt buộc lý do, lưu vết)"><Trash2 className="w-3.5 h-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {form && (
        <InvoiceForm profile={profile} vehicles={vehicles.filter((v) => v.active !== false)} drivers={drivers} invoice={form.invoice || null}
          existing={invoices} onSaved={() => { setForm(null); load(); }} onClose={() => setForm(null)} />
      )}
    </div>
  );
}

function FileLink({ path, name }) {
  const open = async () => {
    const { data } = await getOdoPhotoUrl(path);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };
  return <button onClick={open} className="inline-flex items-center gap-1 text-[12px] text-sky-700 hover:underline"><FileText className="w-3.5 h-3.5" />{name ? (name.length > 16 ? name.slice(0, 14) + '…' : name) : 'Xem'}</button>;
}

const normPlate = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

// Hộp thoại TẢI / SỬA hóa đơn nhiên liệu. Tải lên: chọn ảnh/PDF -> máy tự đọc -> người nhập kiểm tra,
// sửa -> Lưu. Sửa: bắt buộc lý do (CSDL lưu nội dung cũ).
function InvoiceForm({ profile, vehicles, drivers, invoice, existing, onSaved, onClose }) {
  const edit = !!invoice;
  const [f, setF] = useState(() => ({
    vehicle_id: invoice?.vehicle_id || '', invoice_date: invoice?.invoice_date || toISODate(new Date()), invoice_no: invoice?.invoice_no || '',
    seller: invoice?.seller || '', fuel_type: invoice?.fuel_type || '', liters: invoice?.liters ?? '', unit_price: invoice?.unit_price ?? '',
    amount: invoice?.amount ?? '', odo: invoice?.odo ?? '', driver_id: invoice?.driver_id || '', note: invoice?.note || '',
  }));
  const [file, setFile] = useState(null); // { blob, name, ext, isPdf }
  const [ocr, setOcr] = useState({ status: 'idle' });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const pick = async (fl) => {
    if (!fl) return;
    const isPdf = fl.type === 'application/pdf' || /\.pdf$/i.test(fl.name);
    const blob = isPdf ? fl : await compressImage(fl);
    setFile({ blob, name: fl.name, ext: isPdf ? 'pdf' : 'jpg', isPdf });
    setOcr({ status: 'reading' }); setMsg('');
    const r = await readInvoice(blob);
    if (!r.ok) { setOcr({ status: 'failed', message: r.message }); return; }
    const d = r.data;
    setOcr({ status: 'done', data: d });
    const plateMatch = d.plate ? vehicles.find((v) => normPlate(v.plate) === normPlate(d.plate)) : null;
    setF((x) => ({
      ...x,
      vehicle_id: x.vehicle_id || plateMatch?.id || '',
      invoice_date: d.invoice_date || x.invoice_date, invoice_no: d.invoice_no || x.invoice_no, seller: d.seller || x.seller,
      fuel_type: d.fuel_type || x.fuel_type, liters: d.liters || x.liters, unit_price: d.unit_price || x.unit_price, amount: d.amount || x.amount,
    }));
  };

  const L = num(f.liters), P = num(f.unit_price), A = num(f.amount);
  const calc = L != null && P != null ? Math.round(L * P) : null;
  const save = async () => {
    setMsg('');
    if (!f.vehicle_id) return setMsg('Chọn xe.');
    if (!f.invoice_date) return setMsg('Nhập ngày hóa đơn.');
    if (!L || L <= 0) return setMsg('Số lít phải lớn hơn 0.');
    if (!edit && !file) return setMsg('Tải ảnh hoặc PDF hóa đơn lên (để lưu chứng từ đối chiếu).');
    if (edit && !reason.trim()) return setMsg('Bắt buộc nhập lý do sửa.');
    const dup = f.invoice_no && existing.find((i) => i.id !== invoice?.id && String(i.invoice_no || '').replace(/\s+/g, '').toLowerCase() === f.invoice_no.replace(/\s+/g, '').toLowerCase()
      && String(i.seller || '').trim().toLowerCase() === f.seller.trim().toLowerCase());
    if (dup && !window.confirm(`Số hóa đơn ${f.invoice_no} của "${f.seller}" ĐÃ được nhập (ngày ${isoToDMY(dup.invoice_date)}). Vẫn lưu?`)) return;
    const row = {
      vehicle_id: f.vehicle_id, invoice_date: f.invoice_date, invoice_no: f.invoice_no.trim() || null, seller: f.seller.trim() || null,
      fuel_type: f.fuel_type || null, liters: L, unit_price: P, amount: A ?? calc, odo: num(f.odo), driver_id: f.driver_id || null, note: f.note.trim() || null,
    };
    setBusy(true);
    try {
      if (edit) {
        const { error } = await editFuelInvoice(invoice.id, row, reason.trim());
        if (error) throw new Error(error.message);
      } else {
        const up = await uploadInvoiceFile(f.vehicle_id, file.blob, file.ext);
        if (up.error) throw new Error('Không tải được tệp hóa đơn: ' + up.error.message);
        const { error } = await addFuelInvoice({ ...row, file_path: up.data.path, file_name: file.name, ocr_data: ocr.data || null, created_by: profile.id });
        if (error) throw new Error(error.message);
      }
      onSaved();
    } catch (e) { setMsg(e.message || String(e)); }
    setBusy(false);
  };

  const field = 'w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-[13.5px] outline-none focus:border-red-500';
  const lab = 'text-[11.5px] font-semibold text-slate-600 block mb-0.5';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-extrabold text-slate-800">{edit ? 'Sửa hóa đơn nhiên liệu' : 'Tải hóa đơn nhiên liệu'}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>
        {!edit && (
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3">
            <label className="flex items-center justify-center gap-2 cursor-pointer text-[14px] font-semibold text-slate-700">
              <Upload className="w-5 h-5" /> {file ? `Đã chọn: ${file.name}` : 'Chọn ảnh hoặc PDF hóa đơn (hóa đơn điện tử, phiếu in)'}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {ocr.status === 'reading' && <p className="mt-2 text-[13px] text-slate-600 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin text-red-700" /> Đang đọc hóa đơn…</p>}
            {ocr.status === 'done' && <p className="mt-2 text-[12.5px] text-emerald-700 flex items-center justify-center gap-1.5"><ScanLine className="w-4 h-4" /> Đã tự điền từ hóa đơn — kiểm tra lại trước khi lưu.{ocr.data?.plate && ` Biển số trên HĐ: ${ocr.data.plate}.`}</p>}
            {ocr.status === 'failed' && <p className="mt-2 text-[12.5px] text-amber-800 text-center">{ocr.message}</p>}
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div><label className={lab}>Xe *</label>
            <select value={f.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)} className={field}>
              <option value="">— Chọn xe —</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.plate}{v.driver_name ? ` (${v.driver_name})` : ''}</option>)}
            </select></div>
          <div><label className={lab}>Ngày hóa đơn *</label><DateField value={f.invoice_date} onChange={(v) => set('invoice_date', v)} /></div>
          <div><label className={lab}>Số hóa đơn</label><input className={field} value={f.invoice_no} onChange={(e) => set('invoice_no', e.target.value)} /></div>
          <div className="col-span-2"><label className={lab}>Đơn vị bán</label><input className={field} value={f.seller} onChange={(e) => set('seller', e.target.value)} placeholder="Cửa hàng xăng dầu…" /></div>
          <div><label className={lab}>Loại nhiên liệu</label>
            <select value={f.fuel_type} onChange={(e) => set('fuel_type', e.target.value)} className={field}>
              <option value="">—</option>{Object.entries(FUEL_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select></div>
          <div><label className={lab}>Số lít *</label><input className={field} inputMode="decimal" value={f.liters} onChange={(e) => set('liters', e.target.value)} /></div>
          <div><label className={lab}>Đơn giá (đ/lít)</label><input className={field} inputMode="numeric" value={f.unit_price} onChange={(e) => set('unit_price', e.target.value)} /></div>
          <div><label className={lab}>Thành tiền (đ)</label><input className={field} inputMode="numeric" value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder={calc != null ? String(calc) : ''} />
            {calc != null && A != null && Math.abs(calc - A) > Math.max(2000, 0.02 * A) && <p className="text-[11px] text-amber-700 mt-0.5">Khác số lít × đơn giá ({fmtMoney(calc)})</p>}</div>
          <div><label className={lab}>ODO lúc đổ (nếu có)</label><input className={field} inputMode="numeric" value={f.odo} onChange={(e) => set('odo', e.target.value.replace(/\D+/g, ''))} /></div>
          <div><label className={lab}>Lái xe</label>
            <select value={f.driver_id} onChange={(e) => set('driver_id', e.target.value)} className={field}>
              <option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.full_name || d.email}</option>)}
            </select></div>
          <div className="col-span-2 sm:col-span-3"><label className={lab}>Ghi chú</label><input className={field} value={f.note} onChange={(e) => set('note', e.target.value)} /></div>
          {edit && <div className="col-span-2 sm:col-span-3"><label className={`${lab} text-rose-700`}>Lý do sửa * (lưu vết, giữ nội dung cũ để đối chiếu)</label><input className={field} value={reason} onChange={(e) => setReason(e.target.value)} /></div>}
        </div>
        {msg && <p className="text-[13px] text-rose-800 bg-rose-50 rounded-lg px-3 py-2">{msg}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={busy || ocr.status === 'reading'} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-bold disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {edit ? 'Lưu thay đổi' : 'Lưu hóa đơn'}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold">Hủy</button>
        </div>
      </div>
    </div>
  );
}
