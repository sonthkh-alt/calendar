// NHẬT TRÌNH XE — HÀM THUẦN (không DOM / Supabase) để test được ở node.
// Dữ liệu: các LẦN GHI ODO (vehicle_odo_readings) — mỗi lần lái xe cập nhật là một dòng riêng,
// bắt buộc số ODO + ảnh đồng hồ, lưu ngay không chờ duyệt, không sửa/xóa (chỉ người quản lý đánh
// dấu "không tính" khi ghi nhầm, dòng đó vẫn hiển thị). Từ đó dựng sổ nhật trình từng xe theo ngày:
// ODO đầu/cuối ngày, km, đối chiếu chuyến công tác trên lịch, cảnh báo bất thường, tổng hợp kỳ.
import { isPrivateVehicle } from './constants';
import { addDays, parseISO, toISODate, fmtDM, fmtTime } from './dates';

// Quãng đường một ngày vượt ngưỡng này -> cảnh báo bất thường (km)
export const MAX_DAILY_KM = 800;

export const READING_KINDS = {
  xuat_phat: { label: 'Xuất phát', short: 'Xuất phát', cls: 'bg-slate-100 text-slate-700 border-slate-300' },
  khac: { label: 'Ghi thêm (khi về, dọc đường…)', short: 'Ghi thêm', cls: 'bg-sky-50 text-sky-800 border-sky-200' },
  ve: { label: 'Lúc về (dữ liệu cũ)', short: 'Về', cls: 'bg-red-50 text-red-800 border-red-200' }, // chỉ còn ở dữ liệu cũ
};
// Loại lần ghi lái xe chọn khi nhập: CHỈ 2 loại — Xuất phát và Ghi thêm (khi về, dọc đường...);
// cả hai đều có ảnh đồng hồ + hành trình, nhiên liệu, ghi chú.
export const FORM_KINDS = ['xuat_phat', 'khac'];

// Nguồn của số ODO (lái xe chỉ chụp ảnh, hệ thống tự đọc số)
export const ODO_SOURCES = {
  may_doc: { label: 'Máy đọc từ ảnh', cls: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  nhap_tay: { label: 'Nhập tay (máy không đọc được)', cls: 'bg-amber-50 text-amber-800 border-amber-300' },
  sua_so: { label: 'Đã sửa số máy đọc', cls: 'bg-rose-50 text-rose-800 border-rose-300' },
};

// Ghi chú tự sinh khi lái xe MƯỢN xe của lái xe khác
export const borrowNote = (driverName, plate, ownerName) =>
  `Lái xe ${driverName || ''} mượn xe ${plate || ''}${ownerName ? ` (xe của lái xe ${ownerName})` : ''}`.replace(/\s+/g, ' ').trim();

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
export const fmtKm = (v) => (v == null ? '' : Number(v).toLocaleString('vi-VN'));
// Giờ:phút của lần ghi (theo giờ máy người xem — máy ở Việt Nam)
export const fmtReadTime = (ts) => {
  const d = new Date(ts);
  return Number.isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
// Lần ghi có được TÍNH vào số liệu không (không bị đánh dấu hủy, có số ODO)
export const isCounted = (r) => !!r && !r.voided && num(r.odo) != null;
const byTime = (a, b) => a.reading_date.localeCompare(b.reading_date)
  || String(a.read_at || '').localeCompare(String(b.read_at || '')) || String(a.id).localeCompare(String(b.id));

/** Lần ghi hợp lệ GẦN NHẤT của một xe (để so sánh khi ghi mới) */
export function lastCountedReading(readings, vehicleId) {
  const list = (readings || []).filter((r) => r.vehicle_id === vehicleId && isCounted(r)).sort(byTime);
  return list.length ? list[list.length - 1] : null;
}

/** Loại lần ghi gợi ý: chưa có "Xuất phát" hôm nay -> Xuất phát, có rồi -> Ghi thêm */
export function suggestKind(todayReadings) {
  return (todayReadings || []).some((r) => r.kind === 'xuat_phat' && !r.voided) ? 'khac' : 'xuat_phat';
}

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
    out.get(e.date).push({ id: e.id, content: e.content || '', location: e.at_office ? 'Tại cơ quan' : (e.location || ''), time });
  }
  return out;
}

// Gợi ý hành trình từ các chuyến trong ngày: "Trụ sở → địa điểm 1 → địa điểm 2 → Trụ sở"
export function suggestRoute(trips, base = 'Trụ sở') {
  const stops = [...new Set((trips || []).map((t) => (t.location || '').trim()).filter((l) => l && l !== 'Tại cơ quan'))];
  return stops.length ? [base, ...stops, base].join(' → ') : '';
}

/**
 * Dựng sổ nhật trình.
 * @param readings  vehicle_odo_readings — NÊN kèm các lần ghi TRƯỚC `from` (vd 3 tháng) để nối chuỗi ODO
 * @param vehicles  danh mục xe; entries: lịch công tác; profiles: hồ sơ (tên lái xe / người ghi)
 * @param from,to   kỳ xem (ISO); today (ISO); showPrivate: hiện xe riêng; vehicleIds: giới hạn xe
 */
// ===================== NHẮC THAY DẦU =====================
// Thay dầu mỗi OIL_CHANGE_KM; từ OIL_SOON_KM bắt đầu nhắc "sắp đến hạn".
export const OIL_CHANGE_KM = 5000;
export const OIL_SOON_KM = 4500;

/**
 * Mốc thay dầu gần nhất của xe = số ODO LỚN HƠN giữa: lần ghi đánh dấu thay dầu (oil_change, không bị
 * "không tính") và mốc ban đầu Quản trị nhập (vehicles.oil_change_odo). Trả { odo, date, source } | null.
 */
export function lastOilChange(vehicle, oilReadings = []) {
  let best = null;
  for (const r of oilReadings) {
    if (r.vehicle_id !== vehicle?.id || !r.oil_change || r.voided || num(r.odo) == null) continue;
    if (!best || num(r.odo) > best.odo) best = { odo: num(r.odo), date: r.reading_date, source: 'reading' };
  }
  const base = num(vehicle?.oil_change_odo);
  if (base != null && (!best || base > best.odo)) best = { odo: base, date: null, source: 'admin' };
  return best;
}

/** Tình trạng thay dầu: level 'unknown' (chưa có mốc/số) | 'ok' | 'soon' (≥4.500 km) | 'due' (≥5.000 km) */
export function oilStatus(currentOdo, oil) {
  const cur = num(currentOdo);
  if (cur == null || !oil || oil.odo == null || cur < oil.odo) return { level: 'unknown', oil: oil || null };
  const since = cur - oil.odo;
  const level = since >= OIL_CHANGE_KM ? 'due' : since >= OIL_SOON_KM ? 'soon' : 'ok';
  return { level, since, remaining: OIL_CHANGE_KM - since, oil };
}

export function buildLogbook({ readings = [], vehicles = [], entries = [], profiles = [], from, to, today, showPrivate = true, vehicleIds = null, oilReadings = [] }) {
  const profById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const nameOf = (id) => (id && (profById[id]?.full_name || profById[id]?.email)) || '';
  const list = vehicles
    .filter((v) => showPrivate || !isPrivateVehicle(v))
    .filter((v) => !vehicleIds || vehicleIds.includes(v.id))
    .filter((v) => v.active !== false || readings.some((r) => r.vehicle_id === v.id && r.reading_date >= from && r.reading_date <= to));

  return list.map((v) => {
    const all = readings.filter((r) => r.vehicle_id === v.id).sort(byTime);
    const trips = tripsByDate(entries, v.id);
    const byDay = new Map();
    for (const r of all) {
      if (!byDay.has(r.reading_date)) byDay.set(r.reading_date, []);
      byDay.get(r.reading_date).push(r);
    }
    const rows = [];
    let prev = null; // lần ghi hợp lệ cuối cùng trước đó: { value, date }
    for (const [date, dayAll] of byDay) {
      const valid = dayAll.filter(isCounted);
      // Từng lần ghi + quãng đường so với lần ghi hợp lệ liền trước (cả chuỗi)
      let chainPrev = prev?.value ?? null;
      const items = dayAll.map((r) => {
        const counted = isCounted(r);
        const delta = counted && chainPrev != null ? num(r.odo) - chainPrev : null;
        if (counted) chainPrev = num(r.odo);
        return { ...r, counted, delta, driverName: nameOf(r.driver_id), byName: nameOf(r.created_by) };
      });
      const startR = valid.find((r) => r.kind === 'xuat_phat');
      const dayStart = startR ? num(startR.odo) : (prev?.value ?? (valid[0] ? num(valid[0].odo) : null));
      const dayEnd = valid.length ? num(valid[valid.length - 1].odo) : null;
      const km = dayStart != null && dayEnd != null ? dayEnd - dayStart : null;
      const warnings = [];
      for (let i = 1; i < valid.length; i++) {
        if (num(valid[i].odo) < num(valid[i - 1].odo)) {
          warnings.push({ level: 'error', text: `ODO lùi trong ngày (${fmtReadTime(valid[i - 1].read_at)}: ${fmtKm(valid[i - 1].odo)} → ${fmtReadTime(valid[i].read_at)}: ${fmtKm(valid[i].odo)})` });
        }
      }
      if (startR && prev && num(startR.odo) < prev.value) {
        warnings.push({ level: 'error', text: `ODO lúc xuất phát nhỏ hơn lần ghi trước (${fmtDM(parseISO(prev.date))}: ${fmtKm(prev.value)})` });
      } else if (startR && prev && num(startR.odo) - prev.value > 0) {
        warnings.push({ level: 'warn', text: `Chênh +${fmtKm(num(startR.odo) - prev.value)} km so với lần ghi trước (${fmtDM(parseISO(prev.date))}) — có quãng đường chưa ghi nhật trình` });
      }
      if (!startR && prev && valid.length && prev.date !== toISODate(addDays(parseISO(date), -1))) {
        warnings.push({ level: 'info', text: `Không ghi lúc xuất phát — quãng đường tính gộp từ lần ghi ${fmtDM(parseISO(prev.date))}` });
      }
      if (km != null && km > MAX_DAILY_KM) warnings.push({ level: 'warn', text: `Quãng đường trong ngày lớn bất thường (${fmtKm(km)} km)` });
      // Ngày đã qua mà lần ghi cuối vẫn là "Xuất phát" -> thiếu số ODO khi kết thúc chuyến
      if (valid.length && date < today && valid[valid.length - 1].kind === 'xuat_phat') {
        warnings.push({ level: 'warn', text: 'Sau lần xuất phát chưa ghi thêm số ODO khi kết thúc chuyến' });
      }
      // Số không do máy đọc từ ảnh -> người quản lý cần đối chiếu ảnh
      for (const r of valid) {
        if (r.odo_source === 'sua_so') warnings.push({ level: 'warn', text: `${fmtReadTime(r.read_at)}: lái xe sửa số máy đọc (máy đọc ${fmtKm(r.odo_ocr)} → ghi ${fmtKm(r.odo)}) — đối chiếu ảnh` });
        else if (r.odo_source === 'nhap_tay') warnings.push({ level: 'info', text: `${fmtReadTime(r.read_at)}: số ${fmtKm(r.odo)} nhập tay (máy không đọc được ảnh) — đối chiếu ảnh` });
      }
      const dayTrips = trips.get(date) || [];
      // Xe RIÊNG phục vụ lãnh đạo không điều qua lịch -> không đối chiếu chuyến
      if (km != null && km > 0 && !dayTrips.length && !isPrivateVehicle(v)) warnings.push({ level: 'info', text: 'Xe có chạy nhưng không có chuyến công tác được phân trên lịch' });

      if (date >= from && date <= to) {
        rows.push({
          date, items, count: valid.length, voidedCount: dayAll.filter((r) => r.voided).length,
          start: dayStart, startInferred: !startR && !!prev && valid.length > 0,
          end: dayEnd, km, trips: dayTrips, warnings,
          drivers: [...new Set(valid.map((r) => nameOf(r.driver_id)).filter(Boolean))],
          borrowers: [...new Set(valid.filter((r) => r.borrowed).map((r) => nameOf(r.driver_id) || nameOf(r.created_by)).filter(Boolean))],
          route: [...new Set(valid.map((r) => (r.route || '').trim()).filter(Boolean))].join('; '),
          notes: valid.map((r) => (r.note || '').trim()).filter(Boolean).join('; '),
          fuel: valid.reduce((n, r) => n + (num(r.fuel_liters) || 0), 0) || null,
        });
      }
      if (valid.length) prev = { value: dayEnd, date };
    }
    // Ngày CÓ chuyến công tác (đã qua / hôm nay) nhưng KHÔNG có lần ghi hợp lệ nào
    for (const [d, t] of trips) {
      if (d < from || d > to || d > today) continue;
      if ((byDay.get(d) || []).some(isCounted)) continue;
      if (d === today) continue; // hôm nay còn đang chạy — chưa coi là thiếu
      const existing = rows.find((r) => r.date === d);
      const warn = { level: 'error', text: 'Có chuyến công tác nhưng chưa ghi nhật trình' };
      if (existing) existing.warnings.push(warn);
      else rows.push({ date: d, items: [], count: 0, voidedCount: 0, missing: true, trips: t, start: null, end: null, km: null, drivers: [], route: '', notes: '', fuel: null, warnings: [warn] });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));

    const withKm = rows.filter((r) => r.km != null && r.km >= 0);
    const totalKm = withKm.reduce((n, r) => n + r.km, 0);
    const fuel = rows.reduce((n, r) => n + (r.fuel || 0), 0);
    const counted = rows.filter((r) => r.count > 0);
    const summary = {
      daysLogged: counted.length,
      daysMoving: withKm.filter((r) => r.km > 0).length,
      readings: rows.reduce((n, r) => n + r.count, 0),
      voided: rows.reduce((n, r) => n + r.voidedCount, 0),
      totalKm,
      trips: rows.reduce((n, r) => n + r.trips.length, 0),
      fuel,
      per100: totalKm > 0 && fuel > 0 ? (fuel / totalKm) * 100 : null,
      odoFirst: counted.length ? counted[0].start : null,
      odoLast: counted.length ? counted[counted.length - 1].end : null,
      errors: rows.filter((r) => r.warnings.some((w) => w.level === 'error')).length,
      warns: rows.filter((r) => r.warnings.some((w) => w.level === 'warn')).length,
      missing: rows.filter((r) => r.missing || r.warnings.some((w) => /chưa ghi nhật trình/.test(w.text))).length,
    };
    const todayAll = byDay.get(today) || [];
    const todayValid = todayAll.filter(isCounted);
    return {
      vehicle: v, rows, summary,
      today: {
        readings: todayAll, count: todayValid.length,
        last: todayValid.length ? todayValid[todayValid.length - 1] : null,
        km: (() => {
          const r = rows.find((x) => x.date === today);
          return r ? r.km : null;
        })(),
      },
      todayTrips: trips.get(today) || [],
      lastCounted: all.filter(isCounted).pop() || null,
      // Thay dầu: tính trên số ODO mới nhất (mốc thay dầu có thể nằm ngoài khoảng đã nạp -> oilReadings riêng)
      oil: oilStatus(all.filter(isCounted).pop()?.odo, lastOilChange(v, [...oilReadings, ...all])),
    };
  });
}

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

/** Workbook: Tổng hợp + mỗi xe một sheet (theo ngày) + sheet Chi tiết các lần ghi. */
export function buildLogbookWorkbook(books, XLSX, { unitName = '', periodLabel = '', generatedText = '' } = {}) {
  const U = XLSX.utils;
  const wb = U.book_new();
  const used = new Set();
  const head = (title) => [[unitName.toLocaleUpperCase('vi')], [title], [`Kỳ: ${periodLabel}`], [`Trích xuất lúc ${generatedText}`], []];
  const titleMerges = (n) => [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: n - 1 } }));
  const dateFmt = (ws, rows, col = 0) => { for (let r = 6; r < 6 + rows; r++) { const c = ws[U.encode_cell({ r, c: col })]; if (c) c.z = 'dd/mm/yyyy'; } };

  const sumHdr = ['STT', 'Biển số', 'Lái xe', 'ODO đầu kỳ', 'ODO cuối kỳ', 'Tổng km', 'Số ngày có ghi', 'Số ngày xe chạy', 'Số lần ghi', 'Số chuyến công tác', 'Nhiên liệu (lít)', 'Lít/100 km', 'Ngày thiếu nhật trình', 'Ngày có lỗi', 'ODO lần thay dầu gần nhất', 'Km từ lần thay dầu'];
  const sumRows = books.map((b, i) => [i + 1, b.vehicle.plate, b.vehicle.driver_name || '', b.summary.odoFirst, b.summary.odoLast, b.summary.totalKm,
    b.summary.daysLogged, b.summary.daysMoving, b.summary.readings, b.summary.trips, b.summary.fuel || null, b.summary.per100, b.summary.missing, b.summary.errors,
    b.oil?.oil?.odo ?? null, b.oil?.since ?? null]);
  const tot = (k) => books.reduce((n, b) => n + (b.summary[k] || 0), 0);
  const ws0 = U.aoa_to_sheet([...head('TỔNG HỢP NHẬT TRÌNH XE Ô TÔ CÔNG VỤ'), sumHdr, ...sumRows,
    ['', 'Tổng cộng', '', null, null, tot('totalKm'), tot('daysLogged'), tot('daysMoving'), tot('readings'), tot('trips'), tot('fuel') || null, null, tot('missing'), tot('errors'), null, null]]);
  ws0['!cols'] = [6, 14, 16, 13, 13, 11, 13, 14, 11, 16, 14, 11, 18, 12, 16, 14].map((w) => ({ wch: w }));
  ws0['!merges'] = titleMerges(sumHdr.length);
  for (let r = 6; r < 6 + sumRows.length; r++) { const c = ws0[U.encode_cell({ r, c: 11 })]; if (c && c.t === 'n') c.z = '0.0'; }
  U.book_append_sheet(wb, ws0, sheetName('Tổng hợp', used));

  const hdr = ['Ngày', 'Thứ', 'Lái xe', 'ODO đầu ngày', 'ODO cuối ngày', 'Số km', 'Số lần ghi', 'Hành trình', 'Chuyến công tác (theo lịch)', 'Nhiên liệu (lít)', 'Ghi chú', 'Cảnh báo'];
  for (const b of books) {
    const rows = b.rows.map((r) => [
      excelSerial(r.date), WEEKDAY[parseISO(r.date).getDay()], r.drivers.join(', '), r.start, r.end, r.km, r.count, r.route,
      r.trips.map((t) => `${t.time ? t.time + ': ' : ''}${t.content}${t.location ? ' (' + t.location + ')' : ''}`).join('\n'),
      r.fuel, r.notes, r.warnings.map((w) => w.text).join('; '),
    ]);
    const title = `SỔ NHẬT TRÌNH XE ${b.vehicle.plate}${b.vehicle.driver_name ? ' — LÁI XE ' + b.vehicle.driver_name.toLocaleUpperCase('vi') : ''}`;
    const ws = U.aoa_to_sheet([...head(title), hdr, ...rows, ['', 'Cộng', '', null, null, b.summary.totalKm, b.summary.readings, '', '', b.summary.fuel || null]]);
    dateFmt(ws, rows.length);
    ws['!cols'] = [12, 6, 16, 14, 14, 9, 10, 40, 50, 12, 30, 50].map((w) => ({ wch: w }));
    ws['!merges'] = titleMerges(hdr.length);
    if (rows.length) ws['!autofilter'] = { ref: U.encode_range({ s: { r: 5, c: 0 }, e: { r: 5 + rows.length, c: hdr.length - 1 } }) };
    U.book_append_sheet(wb, ws, sheetName(b.vehicle.plate, used));
  }

  // Chi tiết TỪNG lần ghi (kể cả lần đã đánh dấu không tính) — bằng chứng đối chiếu
  const dHdr = ['Ngày', 'Giờ ghi', 'Biển số', 'Loại', 'Số ODO', 'Km so với lần trước', 'Lái xe', 'Người ghi', 'Có ảnh', 'Nguồn số ODO', 'Mượn xe', 'Thay dầu', 'Hành trình', 'Nhiên liệu (lít)', 'Ghi chú', 'Không tính (lý do)'];
  const dRows = books.flatMap((b) => b.rows.flatMap((r) => r.items.map((it) => [
    excelSerial(r.date), fmtReadTime(it.read_at), b.vehicle.plate, READING_KINDS[it.kind]?.short || it.kind, num(it.odo), it.delta,
    it.driverName, it.byName, it.photo_path ? 'Có' : 'Không',
    ODO_SOURCES[it.odo_source]?.label || '', it.borrowed ? 'Mượn xe' : '', it.oil_change ? 'Thay dầu' : '',
    it.route || '', num(it.fuel_liters), it.note || '', it.voided ? (it.void_reason || 'Không tính') : '',
  ])));
  const wsD = U.aoa_to_sheet([...head('CHI TIẾT CÁC LẦN GHI ODO'), dHdr, ...dRows]);
  dateFmt(wsD, dRows.length);
  wsD['!cols'] = [12, 8, 13, 11, 11, 12, 16, 16, 8, 22, 10, 10, 36, 12, 30, 30].map((w) => ({ wch: w }));
  wsD['!merges'] = titleMerges(dHdr.length);
  if (dRows.length) wsD['!autofilter'] = { ref: U.encode_range({ s: { r: 5, c: 0 }, e: { r: 5 + dRows.length, c: dHdr.length - 1 } }) };
  U.book_append_sheet(wb, wsD, sheetName('Chi tiết các lần ghi', used));
  return wb;
}

export async function exportLogbookXlsx(books, meta) {
  const mod = await import('xlsx');
  const XLSX = mod.utils ? mod : mod.default;
  const wb = buildLogbookWorkbook(books, XLSX, meta);
  XLSX.writeFile(wb, `So-nhat-trinh-xe_${(meta.fileTag || 'ky').replace(/[^\w-]+/g, '-')}.xlsx`, { compression: true });
}
