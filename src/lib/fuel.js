// NHIÊN LIỆU & ĐỊNH MỨC — HÀM THUẦN (test ở node). Đầu vào: hóa đơn nhiên liệu (fuel_invoices), định
// mức từng xe (vehicle_fuel_norms) và sổ nhật trình đã dựng (buildLogbook — km, lít lái xe tự khai,
// ngày có ghi ODO). Đầu ra: tổng hợp từng xe trong kỳ + danh sách cảnh báo; xuất Excel.
//
// Cách tính (ghi trong báo cáo): Tiêu hao thực tế = lít trên hóa đơn trong kỳ / km × 100, với km = QUÃNG
// ĐƯỜNG THEO ĐỒNG HỒ ODO trong kỳ (ODO cuối kỳ − ODO đầu kỳ, nối từ lần ghi trước kỳ) — gồm cả quãng chạy
// giữa các ngày mà nhật trình không cộng vào km ngày, vì xe vẫn tốn nhiên liệu cho quãng đó.
// Vì bình nhiên liệu đầu kỳ / cuối kỳ không đầy như nhau, kỳ càng dài (tháng, quý) càng chính xác;
// xe chạy dưới MIN_KM_FOR_RATE km trong kỳ thì không kết luận vượt định mức.
import { fmtKm } from './vehicleLog';
import { parseISO, addDays, toISODate, fmtDM, isoToDMY } from './dates';

export const FUEL_TYPES = { xang: 'Xăng', dau: 'Dầu diesel' };
export const OVER_WARN = 0.10;       // vượt định mức từ 10% -> cảnh báo
export const OVER_ERROR = 0.20;      // từ 20% -> nghiêm trọng
export const PRICE_DEVIATION = 0.15; // đơn giá lệch >15% so với mức phổ biến cùng loại
export const MIN_KM_FOR_RATE = 100;  // dưới mức này chưa đủ dữ liệu để kết luận tiêu hao

export const FUEL_STATUS = {
  dat: { label: 'Trong định mức', cls: 'text-emerald-700' },
  vuot: { label: 'Vượt định mức', cls: 'text-amber-700' },
  vuot_nang: { label: 'Vượt nhiều', cls: 'text-rose-700' },
  chua_dinh_muc: { label: 'Chưa có định mức', cls: 'text-slate-500' },
  it_du_lieu: { label: 'Chưa đủ dữ liệu', cls: 'text-slate-400' },
};

const n = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
export const fmtMoney = (v) => (v == null ? '' : `${Math.round(v).toLocaleString('vi-VN')} đ`);
export const fmtL = (v, d = 1) => (v == null ? '' : Number(v).toLocaleString('vi-VN', { maximumFractionDigits: d }));
const normPlate = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
// Thành tiền của hóa đơn (ưu tiên số trên hóa đơn; thiếu thì lít × đơn giá)
export const invoiceAmount = (inv) => n(inv.amount) ?? (n(inv.liters) != null && n(inv.unit_price) != null ? n(inv.liters) * n(inv.unit_price) : null);
export const invoicePrice = (inv) => n(inv.unit_price) || (n(inv.amount) && n(inv.liters) ? n(inv.amount) / n(inv.liters) : null);

/**
 * @param vehicles  danh mục xe; norms: vehicle_fuel_norms[]
 * @param invoices  hóa đơn — NÊN kèm hóa đơn trước kỳ (vd 1 năm) để phát hiện trùng số hóa đơn
 * @param books     buildLogbook(...) của CÙNG kỳ [from, to]
 */
export function buildFuelReport({ vehicles = [], norms = [], invoices = [], books = [], from, to, today }) {
  const normBy = Object.fromEntries(norms.map((x) => [x.vehicle_id, x]));
  const bookBy = Object.fromEntries(books.map((b) => [b.vehicle.id, b]));
  const vehicleBy = Object.fromEntries(vehicles.map((v) => [v.id, v]));
  const inPeriod = invoices.filter((i) => i.invoice_date >= from && i.invoice_date <= to);
  const alerts = [];
  const push = (level, vehicle, text, extra = {}) => alerts.push({ level, vehicleId: vehicle?.id, plate: vehicle?.plate || '', text, ...extra });

  // Đơn giá phổ biến (trung vị) theo loại nhiên liệu trong kỳ
  const medPrice = {};
  for (const t of Object.keys(FUEL_TYPES)) {
    const ps = inPeriod.filter((i) => i.fuel_type === t).map(invoicePrice).filter((p) => p > 0);
    medPrice[t] = ps.length >= 3 ? median(ps) : null;
  }
  // Trùng số hóa đơn (cùng số + cùng đơn vị bán) trên toàn bộ hóa đơn đã nạp
  const dupKey = (i) => (i.invoice_no ? `${String(i.invoice_no).replace(/\s+/g, '').toLowerCase()}|${String(i.seller || '').trim().toLowerCase()}` : null);
  const dupCount = {};
  for (const i of invoices) { const k = dupKey(i); if (k) dupCount[k] = (dupCount[k] || 0) + 1; }

  const rows = vehicles.filter((v) => bookBy[v.id] || inPeriod.some((i) => i.vehicle_id === v.id)).map((v) => {
    const book = bookBy[v.id];
    const norm = normBy[v.id] || null;
    const normL = n(norm?.norm_l100);
    // Km theo đồng hồ ODO trong kỳ (đủ cả quãng giữa các ngày); thiếu số thì dùng tổng km ngày
    const s = book?.summary;
    const span = s && s.odoFirst != null && s.odoLast != null && s.odoLast >= s.odoFirst ? s.odoLast - s.odoFirst : null;
    const km = span ?? (s?.totalKm || 0);
    const reported = book?.summary.fuel || 0;
    const inv = inPeriod.filter((i) => i.vehicle_id === v.id).sort((a, b) => a.invoice_date.localeCompare(b.invoice_date));
    const liters = inv.reduce((s, i) => s + (n(i.liters) || 0), 0);
    const amount = inv.reduce((s, i) => s + (invoiceAmount(i) || 0), 0);
    const allowed = normL && km > 0 ? (km * normL) / 100 : null;
    const actual = km >= MIN_KM_FOR_RATE && liters > 0 ? (liters / km) * 100 : null;
    const overPct = actual != null && normL ? (actual - normL) / normL : null;
    const overLiters = allowed != null ? liters - allowed : null;
    const avgPrice = liters > 0 && amount > 0 ? amount / liters : null;
    const overAmount = overLiters != null && overLiters > 0 && avgPrice ? overLiters * avgPrice : 0;
    let status = 'dat';
    if (!normL) status = 'chua_dinh_muc';
    else if (actual == null) status = 'it_du_lieu';
    else if (overPct >= OVER_ERROR) status = 'vuot_nang';
    else if (overPct >= OVER_WARN) status = 'vuot';

    // ----- Cảnh báo theo xe -----
    if (!normL && (km > 0 || liters > 0)) push('info', v, 'Chưa khai báo định mức nhiên liệu cho xe');
    if (status === 'vuot_nang' || status === 'vuot') {
      push(status === 'vuot_nang' ? 'error' : 'warn', v,
        `Tiêu hao ${fmtL(actual)} lít/100 km, vượt định mức ${fmtL(normL)} lít/100 km ${Math.round(overPct * 100)}% (≈ ${fmtL(overLiters)} lít${overAmount ? `, ${fmtMoney(overAmount)}` : ''})`);
    }
    if (liters > 0 && km === 0) push('warn', v, `Có ${fmtL(liters)} lít nhiên liệu trên hóa đơn nhưng xe không ghi nhận km nào trong kỳ`);
    if (km >= 300 && liters === 0) push('info', v, `Xe chạy ${fmtKm(km)} km nhưng chưa có hóa đơn nhiên liệu nào trong kỳ`);
    const diff = Math.abs(reported - liters);
    if ((reported > 0 || liters > 0) && diff > Math.max(5, 0.1 * Math.max(reported, liters))) {
      push('warn', v, `Lái xe ghi đổ ${fmtL(reported)} lít trong nhật trình, hóa đơn ${fmtL(liters)} lít (lệch ${fmtL(diff)} lít)`);
    }

    // ----- Cảnh báo theo hóa đơn -----
    const loggedDays = new Set((book?.rows || []).filter((r) => r.count > 0).map((r) => r.date));
    const near = (d) => [-1, 0, 1].some((k) => loggedDays.has(toISODate(addDays(parseISO(d), k))));
    const tank = n(norm?.tank_liters);
    const perDay = {};
    for (const i of inv) {
      const L = n(i.liters) || 0;
      const tag = `HĐ ${i.invoice_no || '(không số)'} ngày ${isoToDMY(i.invoice_date)}`;
      const k = dupKey(i);
      if (k && dupCount[k] > 1) push('error', v, `${tag}: trùng số hóa đơn (nhập ${dupCount[k]} lần)`, { invoiceId: i.id });
      if (today && i.invoice_date > today) push('error', v, `${tag}: ngày hóa đơn ở tương lai`, { invoiceId: i.id });
      if (tank && L > tank * 1.05) push('error', v, `${tag}: ${fmtL(L)} lít vượt dung tích bình ${fmtL(tank)} lít`, { invoiceId: i.id });
      perDay[i.invoice_date] = (perDay[i.invoice_date] || 0) + L;
      if (norm?.fuel_type && i.fuel_type && i.fuel_type !== norm.fuel_type) {
        push('warn', v, `${tag}: loại nhiên liệu ${FUEL_TYPES[i.fuel_type]} khác loại của xe (${FUEL_TYPES[norm.fuel_type]})`, { invoiceId: i.id });
      }
      const price = invoicePrice(i);
      const med = medPrice[i.fuel_type];
      if (price && med && Math.abs(price - med) / med > PRICE_DEVIATION) {
        push('warn', v, `${tag}: đơn giá ${fmtMoney(price)}/lít lệch ${Math.round((Math.abs(price - med) / med) * 100)}% so với mức phổ biến ${fmtMoney(med)}/lít`, { invoiceId: i.id });
      }
      if (n(i.amount) && n(i.unit_price) && L) {
        const calc = L * n(i.unit_price);
        if (Math.abs(calc - n(i.amount)) > Math.max(2000, 0.02 * n(i.amount))) {
          push('warn', v, `${tag}: thành tiền ${fmtMoney(i.amount)} không khớp số lít × đơn giá (${fmtMoney(calc)})`, { invoiceId: i.id });
        }
      }
      const ocrPlate = normPlate(i.ocr_data?.plate);
      if (ocrPlate && ocrPlate !== normPlate(v.plate)) {
        const other = vehicles.find((x) => normPlate(x.plate) === ocrPlate);
        push('warn', v, `${tag}: biển số trên hóa đơn (${i.ocr_data.plate}) khác xe ${v.plate}${other ? ` — có thể là hóa đơn của xe ${other.plate}` : ''}`, { invoiceId: i.id });
      }
      if (book && !near(i.invoice_date)) push('info', v, `${tag}: đổ nhiên liệu nhưng xe không có lần ghi ODO trong ±1 ngày`, { invoiceId: i.id });
    }
    for (const [d, L] of Object.entries(perDay)) {
      if (tank && L > tank * 1.05 && inv.filter((i) => i.invoice_date === d).length > 1) {
        push('warn', v, `Ngày ${isoToDMY(d)}: tổng ${fmtL(L)} lít trên nhiều hóa đơn vượt dung tích bình ${fmtL(tank)} lít`);
      }
    }
    // Lái xe khai đổ nhiên liệu trong nhật trình nhưng không có hóa đơn ±1 ngày
    const invDays = new Set(inv.map((i) => i.invoice_date));
    for (const r of book?.rows || []) {
      if (!r.fuel) continue;
      const has = [-1, 0, 1].some((k) => invDays.has(toISODate(addDays(parseISO(r.date), k))));
      if (!has) push('info', v, `Ngày ${fmtDM(parseISO(r.date))}: lái xe ghi đổ ${fmtL(r.fuel)} lít nhưng chưa có hóa đơn`);
    }

    return { vehicle: v, norm, km, reported, invoices: inv, count: inv.length, liters, amount, allowed, actual, overPct, overLiters, avgPrice, overAmount, status };
  });

  const levelRank = { error: 0, warn: 1, info: 2 };
  alerts.sort((a, b) => levelRank[a.level] - levelRank[b.level] || a.plate.localeCompare(b.plate));
  const totals = {
    km: rows.reduce((s, r) => s + r.km, 0),
    liters: rows.reduce((s, r) => s + r.liters, 0),
    amount: rows.reduce((s, r) => s + r.amount, 0),
    allowed: rows.reduce((s, r) => s + (r.allowed || 0), 0),
    overAmount: rows.reduce((s, r) => s + r.overAmount, 0),
    invoices: inPeriod.length,
    errors: alerts.filter((a) => a.level === 'error').length,
    warns: alerts.filter((a) => a.level === 'warn').length,
  };
  return { rows, alerts, totals, invoices: inPeriod, vehicleBy };
}

// ===================== XUẤT EXCEL: BÁO CÁO NHIÊN LIỆU =====================
const excelSerial = (iso) => {
  const [y, m, d] = (iso || '').split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};

export function buildFuelWorkbook(report, XLSX, { unitName = '', periodLabel = '', generatedText = '', nameOf = () => '' } = {}) {
  const U = XLSX.utils;
  const wb = U.book_new();
  const head = (title) => [[unitName.toLocaleUpperCase('vi')], [title], [`Kỳ: ${periodLabel}`], [`Trích xuất lúc ${generatedText}`], []];
  const merge = (cols) => [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: cols - 1 } }));

  const h1 = ['STT', 'Biển số', 'Loại nhiên liệu', 'Định mức (lít/100 km)', 'Km nhật trình', 'Lít theo định mức', 'Số hóa đơn', 'Lít trên hóa đơn', 'Lít lái xe khai', 'Tiêu hao thực tế (lít/100 km)', 'Vượt định mức (%)', 'Lít vượt', 'Thành tiền (đ)', 'Đơn giá bình quân (đ/lít)', 'Tiền vượt định mức (đ)', 'Đánh giá'];
  const r1 = report.rows.map((r, i) => [i + 1, r.vehicle.plate, FUEL_TYPES[r.norm?.fuel_type] || '', n(r.norm?.norm_l100), r.km, r.allowed, r.count, r.liters, r.reported,
    r.actual, r.overPct, r.overLiters, r.amount, r.avgPrice, r.overAmount || null, FUEL_STATUS[r.status].label]);
  const t = report.totals;
  const ws1 = U.aoa_to_sheet([...head('TỔNG HỢP NHIÊN LIỆU THEO ĐỊNH MỨC'), h1, ...r1,
    ['', 'Tổng cộng', '', null, t.km, t.allowed, t.invoices, t.liters, null, null, null, null, t.amount, null, t.overAmount || null, '']]);
  for (let r = 6; r < 7 + r1.length; r++) {
    [[5, '#,##0.0'], [7, '#,##0.0'], [9, '0.0'], [10, '0.0%'], [11, '#,##0.0'], [12, '#,##0'], [13, '#,##0'], [14, '#,##0']].forEach(([c, z]) => {
      const cell = ws1[U.encode_cell({ r, c })]; if (cell && cell.t === 'n') cell.z = z;
    });
  }
  ws1['!cols'] = [6, 13, 12, 12, 12, 12, 10, 12, 12, 14, 12, 10, 14, 14, 14, 16].map((w) => ({ wch: w }));
  ws1['!merges'] = merge(h1.length);
  U.book_append_sheet(wb, ws1, 'Tổng hợp nhiên liệu');

  const h2 = ['Ngày', 'Biển số', 'Số hóa đơn', 'Đơn vị bán', 'Loại', 'Số lít', 'Đơn giá (đ/lít)', 'Thành tiền (đ)', 'ODO', 'Lái xe', 'Ghi chú', 'Người nhập'];
  const r2 = report.invoices.slice().sort((a, b) => a.invoice_date.localeCompare(b.invoice_date)).map((i) => [
    excelSerial(i.invoice_date), report.vehicleBy[i.vehicle_id]?.plate || '', i.invoice_no || '', i.seller || '', FUEL_TYPES[i.fuel_type] || '',
    n(i.liters), n(i.unit_price), invoiceAmount(i), n(i.odo), nameOf(i.driver_id), i.note || '', nameOf(i.created_by)]);
  const ws2 = U.aoa_to_sheet([...head('DANH SÁCH HÓA ĐƠN NHIÊN LIỆU'), h2, ...r2]);
  for (let r = 6; r < 6 + r2.length; r++) {
    const c0 = ws2[U.encode_cell({ r, c: 0 })]; if (c0) c0.z = 'dd/mm/yyyy';
    [[6, '#,##0'], [7, '#,##0']].forEach(([c, z]) => { const cell = ws2[U.encode_cell({ r, c })]; if (cell && cell.t === 'n') cell.z = z; });
  }
  ws2['!cols'] = [12, 13, 14, 30, 10, 9, 13, 14, 10, 14, 30, 16].map((w) => ({ wch: w }));
  ws2['!merges'] = merge(h2.length);
  if (r2.length) ws2['!autofilter'] = { ref: U.encode_range({ s: { r: 5, c: 0 }, e: { r: 5 + r2.length, c: h2.length - 1 } }) };
  U.book_append_sheet(wb, ws2, 'Hóa đơn');

  const LV = { error: 'Nghiêm trọng', warn: 'Cảnh báo', info: 'Lưu ý' };
  const h3 = ['Mức độ', 'Biển số', 'Nội dung'];
  const ws3 = U.aoa_to_sheet([...head('CẢNH BÁO NHIÊN LIỆU'), h3, ...report.alerts.map((a) => [LV[a.level], a.plate, a.text])]);
  ws3['!cols'] = [14, 13, 110].map((w) => ({ wch: w }));
  ws3['!merges'] = merge(h3.length);
  U.book_append_sheet(wb, ws3, 'Cảnh báo');
  return wb;
}

export async function exportFuelXlsx(report, meta) {
  const mod = await import('xlsx');
  const XLSX = mod.utils ? mod : mod.default;
  XLSX.writeFile(buildFuelWorkbook(report, XLSX, meta), `Bao-cao-nhien-lieu_${(meta.fileTag || 'ky').replace(/[^\w-]+/g, '-')}.xlsx`, { compression: true });
}
