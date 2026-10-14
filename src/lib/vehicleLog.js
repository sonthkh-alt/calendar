// NHẬT TRÌNH XE — HÀM THUẦN (không DOM / Supabase) để test được ở node.
// Từ các dòng vehicle_logs (mỗi xe 1 dòng/ngày: ODO lúc xuất phát / lúc về, ảnh đồng hồ,
// hành trình, nhiên liệu) + lịch công tác -> sổ nhật trình từng xe: km từng ngày, đối chiếu
// chuyến công tác được phân, cảnh báo bất thường, tổng hợp theo kỳ. Dùng chung cho màn hình
// quản lý (VehicleLogView) và tệp Excel xuất ra.
import { isPrivateVehicle } from './constants';
import { addDays, parseISO, toISODate, fmtDM, fmtTime, isoToDMY } from './dates';

// Quãng đường một ngày vượt ngưỡng này -> cảnh báo bất thường (km)
export const MAX_DAILY_KM = 800;

export const LOG_STATUS = {
  cho_xac_nhan: { label: 'Chờ xác nhận', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  da_xac_nhan: { label: 'Đã xác nhận', cls: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
};

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
export const fmtKm = (v) => (v == null ? '' : Number(v).toLocaleString('vi-VN'));

// Số ODO "đọc được" cuối cùng của một dòng (ưu tiên lúc về)
export const lastReading = (log) => num(log?.odo_end) ?? num(log?.odo_start);

/** Chuyến công tác (theo lịch) được phân cho xe vehicleId, gom theo ngày -> [{ content, location, time }] */
export function tripsByDate(entries, vehicleId) {
  const out = new Map();
  const seen = new Set();
  for (const e of entries || []) {
    const ids = (e.vehicle_ids || []).length ? e.vehicle_ids : (e.vehicle_id ? [e.vehicle_id] : []);
    if (!ids.includes(vehicleId)) continue;
    if (e.status === 'tu_choi' || e.vehicle_status === 'tu_choi') continue;
    const key = `${e.date}|${e.group_id || `${e.content}|${e.session}|${e.start_time || ''}`}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const time = e.session === 'gio'
      ? `${fmtTime(e.start_time)}${e.end_time ? '-' + fmtTime(e.end_time) : ''}`
      : ({ sang: 'Sáng', chieu: 'Chiều', ca_ngay: 'Cả ngày' }[e.session] || '');
    if (!out.has(e.date)) out.set(e.date, []);
    out.get(e.date).push({ id: e.id, content: e.content || '', location: e.at_office ? 'Tại cơ quan' : (e.location || ''), time, departure: e.departure_place || '' });
  }
  return out;
}

// Gợi ý hành trình từ các chuyến trong ngày: "Trụ sở -> địa điểm 1 -> địa điểm 2 -> Trụ sở"
export function suggestRoute(trips, base = 'Trụ sở') {
  const stops = [...new Set((trips || []).map((t) => (t.location || '').trim()).filter((l) => l && l !== 'Tại cơ quan'))];
  return stops.length ? [base, ...stops, base].join(' → ') : '';
}

/**
 * Dựng sổ nhật trình.
 * @param logs     vehicle_logs — NÊN kèm các dòng TRƯỚC `from` (vd 3 tháng) để nối chuỗi ODO
 * @param vehicles danh mục xe
 * @param entries  lịch công tác (để đối chiếu chuyến được phân)
 * @param profiles hồ sơ tài khoản (tên lái xe / người xác nhận)
 * @param from,to  kỳ xem (ISO); today (ISO)
 * @param showPrivate hiện xe riêng (chỉ Quản trị)
 * @param vehicleIds giới hạn các xe (tùy chọn)
 */
export function buildLogbook({ logs = [], vehicles = [], entries = [], profiles = [], from, to, today, showPrivate = false, vehicleIds = null }) {
  const profById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const nameOf = (id) => (id && (profById[id]?.full_name || profById[id]?.email)) || '';
  const list = vehicles
    .filter((v) => (showPrivate || !isPrivateVehicle(v)))
    .filter((v) => !vehicleIds || vehicleIds.includes(v.id))
    .filter((v) => v.active !== false || logs.some((l) => l.vehicle_id === v.id && l.log_date >= from && l.log_date <= to));

  const books = list.map((v) => {
    const vlogs = logs.filter((l) => l.vehicle_id === v.id).sort((a, b) => a.log_date.localeCompare(b.log_date));
    const trips = tripsByDate(entries, v.id);
    const rows = [];
    let prev = null; // { value, date }
    for (const log of vlogs) {
      const start = num(log.odo_start);
      const end = num(log.odo_end);
      const startUsed = start ?? prev?.value ?? null;
      const km = end != null && startUsed != null ? end - startUsed : null;
      const warnings = [];
      if (start != null && end != null && end < start) warnings.push({ level: 'error', text: 'ODO lúc về nhỏ hơn lúc xuất phát' });
      if (prev && start != null && start < prev.value) {
        warnings.push({ level: 'error', text: `ODO lùi so với lần ghi trước (${fmtDM(parseISO(prev.date))}: ${fmtKm(prev.value)})` });
      } else if (prev && start != null && start - prev.value > 0) {
        warnings.push({ level: 'warn', text: `Chênh +${fmtKm(start - prev.value)} km so với ODO lần ghi trước (${fmtDM(parseISO(prev.date))}) — có quãng đường chưa ghi nhật trình`, gap: start - prev.value });
      }
      if (start == null && end != null && prev && prev.date !== toISODate(addDays(parseISO(log.log_date), -1))) {
        warnings.push({ level: 'info', text: `Quãng đường tính gộp từ lần ghi ${fmtDM(parseISO(prev.date))}` });
      }
      if (km != null && km > MAX_DAILY_KM) warnings.push({ level: 'warn', text: `Quãng đường trong ngày lớn bất thường (${fmtKm(km)} km)` });
      const needRead = (log.photo_start_path && start == null) || (log.photo_end_path && end == null);
      if (needRead) warnings.push({ level: 'warn', text: 'Có ảnh đồng hồ nhưng chưa có số — cần đọc số từ ảnh', needRead: true });
      if (end == null && !log.photo_end_path && log.log_date < today) warnings.push({ level: 'warn', text: 'Chưa cập nhật ODO lúc về' });
      const dayTrips = trips.get(log.log_date) || [];
      // Xe RIÊNG phục vụ lãnh đạo không điều qua lịch -> không đối chiếu chuyến
      if (km != null && km > 0 && !dayTrips.length && !isPrivateVehicle(v)) warnings.push({ level: 'info', text: 'Xe có chạy nhưng không có chuyến công tác được phân trên lịch' });

      if (log.log_date >= from && log.log_date <= to) {
        rows.push({
          date: log.log_date, log, driver: nameOf(log.driver_id), start: startUsed, startInferred: start == null && startUsed != null,
          end, km, fuel: num(log.fuel_liters), route: log.route || '', note: log.note || '',
          trips: dayTrips, warnings, needRead: !!needRead, status: log.status,
          confirmedBy: nameOf(log.confirmed_by),
        });
      }
      const r = lastReading(log);
      if (r != null) prev = { value: r, date: log.log_date };
    }
    // Ngày CÓ chuyến công tác (đã qua) nhưng KHÔNG có nhật trình
    const logged = new Set(vlogs.map((l) => l.log_date));
    for (const [d, t] of trips) {
      if (d < from || d > to || d > today || logged.has(d)) continue;
      rows.push({ date: d, log: null, missing: true, trips: t, start: null, end: null, km: null, fuel: null, route: '', note: '', driver: '', status: null,
        warnings: [{ level: 'error', text: 'Có chuyến công tác nhưng chưa ghi nhật trình' }] });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));

    const withKm = rows.filter((r) => r.km != null && r.km >= 0);
    const totalKm = withKm.reduce((n, r) => n + r.km, 0);
    const fuel = rows.reduce((n, r) => n + (r.fuel || 0), 0);
    const readings = rows.filter((r) => !r.missing).flatMap((r) => [r.start, r.end]).filter((x) => x != null);
    const summary = {
      daysLogged: rows.filter((r) => !r.missing).length,
      daysMoving: withKm.filter((r) => r.km > 0).length,
      totalKm,
      trips: rows.reduce((n, r) => n + r.trips.length, 0),
      fuel,
      per100: totalKm > 0 && fuel > 0 ? (fuel / totalKm) * 100 : null,
      odoFirst: readings.length ? readings[0] : null,
      odoLast: readings.length ? readings[readings.length - 1] : null,
      errors: rows.filter((r) => r.warnings.some((w) => w.level === 'error')).length,
      warns: rows.filter((r) => r.warnings.some((w) => w.level === 'warn')).length,
      needRead: rows.filter((r) => r.needRead).length,
      pending: rows.filter((r) => r.status === 'cho_xac_nhan').length,
      missing: rows.filter((r) => r.missing).length,
      lastLog: vlogs.length ? vlogs[vlogs.length - 1] : null,
    };
    const todayLog = vlogs.find((l) => l.log_date === today) || null;
    return { vehicle: v, rows, summary, todayLog, todayTrips: trips.get(today) || [] };
  });
  return books;
}

// Dòng "sạch" (đủ số, không lỗi, chưa xác nhận) -> xác nhận hàng loạt được
export const canBulkConfirm = (row) => !!row.log && row.status === 'cho_xac_nhan' && row.end != null
  && !row.needRead && !row.warnings.some((w) => w.level === 'error');

// ===================== XUẤT EXCEL: SỔ NHẬT TRÌNH =====================
const excelSerial = (iso) => {
  const [y, m, d] = (iso || '').split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};
const sheetName = (s, used) => {
  let n = String(s).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Xe';
  let i = 2;
  while (used.has(n)) n = `${String(s).slice(0, 27)} (${i++})`;
  used.add(n);
  return n;
};

/** Workbook: sheet Tổng hợp + mỗi xe một sheet (XLSX = module 'xlsx'). */
export function buildLogbookWorkbook(books, XLSX, { unitName = '', periodLabel = '', generatedText = '' } = {}) {
  const U = XLSX.utils;
  const wb = U.book_new();
  const used = new Set();
  const head = (title) => [[unitName.toLocaleUpperCase('vi')], [title], [`Kỳ: ${periodLabel}`], [`Trích xuất lúc ${generatedText}`], []];

  const sumHdr = ['STT', 'Biển số', 'Lái xe', 'ODO đầu kỳ', 'ODO cuối kỳ', 'Tổng km', 'Số ngày ghi', 'Số ngày xe chạy', 'Số chuyến công tác', 'Nhiên liệu (lít)', 'Lít/100 km', 'Chờ xác nhận', 'Ngày thiếu nhật trình', 'Dòng có lỗi'];
  const sumRows = books.map((b, i) => [i + 1, b.vehicle.plate, b.vehicle.driver_name || '', b.summary.odoFirst, b.summary.odoLast, b.summary.totalKm,
    b.summary.daysLogged, b.summary.daysMoving, b.summary.trips, b.summary.fuel || null, b.summary.per100, b.summary.pending, b.summary.missing, b.summary.errors]);
  const total = ['', 'Tổng cộng', '', null, null, books.reduce((n, b) => n + b.summary.totalKm, 0), books.reduce((n, b) => n + b.summary.daysLogged, 0),
    books.reduce((n, b) => n + b.summary.daysMoving, 0), books.reduce((n, b) => n + b.summary.trips, 0), books.reduce((n, b) => n + b.summary.fuel, 0) || null, null,
    books.reduce((n, b) => n + b.summary.pending, 0), books.reduce((n, b) => n + b.summary.missing, 0), books.reduce((n, b) => n + b.summary.errors, 0)];
  const ws0 = U.aoa_to_sheet([...head('TỔNG HỢP NHẬT TRÌNH XE Ô TÔ CÔNG VỤ'), sumHdr, ...sumRows, total]);
  ws0['!cols'] = [6, 14, 16, 13, 13, 11, 12, 14, 16, 14, 11, 13, 18, 12].map((w) => ({ wch: w }));
  ws0['!merges'] = [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: sumHdr.length - 1 } }));
  for (let r = 6; r < 6 + sumRows.length; r++) { const c = ws0[U.encode_cell({ r, c: 10 })]; if (c && c.t === 'n') c.z = '0.0'; }
  U.book_append_sheet(wb, ws0, sheetName('Tổng hợp', used));

  const hdr = ['Ngày', 'Thứ', 'Lái xe', 'ODO lúc xuất phát', 'ODO lúc về', 'Số km', 'Hành trình', 'Chuyến công tác (theo lịch)', 'Nhiên liệu (lít)', 'Ghi chú', 'Trạng thái', 'Cảnh báo'];
  for (const b of books) {
    const rows = b.rows.map((r) => [
      excelSerial(r.date), WEEKDAY[parseISO(r.date).getDay()], r.driver, r.start, r.end, r.km, r.route,
      r.trips.map((t) => `${t.time ? t.time + ': ' : ''}${t.content}${t.location ? ' (' + t.location + ')' : ''}`).join('\n'),
      r.fuel, r.note, r.missing ? 'Chưa ghi' : (LOG_STATUS[r.status]?.label || ''), r.warnings.map((w) => w.text).join('; '),
    ]);
    const title = `SỔ NHẬT TRÌNH XE ${b.vehicle.plate}${b.vehicle.driver_name ? ' — LÁI XE ' + b.vehicle.driver_name.toLocaleUpperCase('vi') : ''}`;
    const ws = U.aoa_to_sheet([...head(title), hdr, ...rows, ['', 'Cộng', '', null, null, b.summary.totalKm, '', '', b.summary.fuel || null]]);
    for (let r = 6; r < 6 + rows.length; r++) { const c = ws[U.encode_cell({ r, c: 0 })]; if (c) c.z = 'dd/mm/yyyy'; }
    ws['!cols'] = [12, 6, 14, 14, 12, 9, 40, 50, 12, 24, 13, 50].map((w) => ({ wch: w }));
    ws['!merges'] = [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: hdr.length - 1 } }));
    if (rows.length) ws['!autofilter'] = { ref: U.encode_range({ s: { r: 5, c: 0 }, e: { r: 5 + rows.length, c: hdr.length - 1 } }) };
    U.book_append_sheet(wb, ws, sheetName(b.vehicle.plate, used));
  }
  return wb;
}

export async function exportLogbookXlsx(books, meta) {
  const mod = await import('xlsx');
  const XLSX = mod.utils ? mod : mod.default;
  const wb = buildLogbookWorkbook(books, XLSX, meta);
  XLSX.writeFile(wb, `So-nhat-trinh-xe_${(meta.fileTag || 'ky').replace(/[^\w-]+/g, '-')}.xlsx`, { compression: true });
}

export { isoToDMY };
