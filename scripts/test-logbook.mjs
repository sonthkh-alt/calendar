// Kiểm chứng NHẬT TRÌNH XE (mỗi lần ghi ODO 1 dòng): nối chuỗi ODO, tính km, lần ghi "không tính",
// cảnh báo (lùi số, chênh km, quên ghi lúc về, thiếu nhật trình khi có chuyến), tổng hợp, Excel; đăng nhập bằng tên ngắn; phân quyền
// module (chỉ lái xe / HC-TC-QT / Quản trị). npm run test:logbook
import { createRequire } from 'module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);

await build({
  stdin: {
    contents: "export * from './src/lib/vehicleLog.js'; export * from './src/lib/permissions.js'; export { toLoginEmail } from './src/lib/constants.js';",
    resolveDir: '.', loader: 'js',
  },
  bundle: true, format: 'cjs', platform: 'node', outfile: 'scripts/.logbook.cjs', logLevel: 'silent', external: ['xlsx'],
});
const L = require('./.logbook.cjs');

let pass = true;
const must = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) pass = false; };
const eq = (a, b, m) => must(a === b, `${m} (được ${JSON.stringify(a)}, cần ${JSON.stringify(b)})`);

// ---------- Đăng nhập bằng tên ngắn ----------
eq(L.toLoginEmail('chan'), 'chan@thanhhoa.gov.vn', 'Tên ngắn -> email cơ quan');
eq(L.toLoginEmail('  Chan '), 'chan@thanhhoa.gov.vn', 'Bỏ khoảng trắng + chữ hoa');
eq(L.toLoginEmail('sonthkh@gmail.com'), 'sonthkh@gmail.com', 'Email đầy đủ giữ nguyên');

// ---------- Phân quyền ----------
const R = (role) => ({ id: 'u-' + role, role });
must(['lai_xe', 'van_phong_xe', 'quan_tri'].every((r) => L.canUseVehicleLog(R(r))), 'Lái xe / HC-TC-QT / Quản trị thấy module');
must(['pct', 'cb_ban', 'cb_tonghop', 'nguoi_xem', 'pho_truong_doan', 'cb_ctqh'].every((r) => !L.canUseVehicleLog(R(r))), 'Các vai trò khác KHÔNG thấy module');
must(!L.canManageVehicleLog(R('lai_xe')) && L.canManageVehicleLog(R('van_phong_xe')), 'Chỉ HC-TC-QT / Quản trị quản lý');
must(!L.canViewStats(R('lai_xe')), 'Lái xe không thấy tab Thống kê');
must(!L.canCreateFor(R('lai_xe'), { leader_type: 'pct' }), 'Lái xe không nhập lịch công tác');
must(L.canVoidOdoReading(R('van_phong_xe')) && L.canVoidOdoReading(R('quan_tri')) && !L.canVoidOdoReading(R('lai_xe')), 'Chỉ HC-TC-QT / Quản trị đánh dấu "không tính"; lái xe không');
const today = '2026-10-14';

// ---------- Sổ nhật trình (mỗi lần ghi 1 dòng) ----------
const vehicles = [
  { id: 'v1', plate: '36A-03668', driver_name: 'Chân', vehicle_type: 'rieng', active: true },
  { id: 'v2', plate: '36A-00342', driver_name: 'Châu', vehicle_type: 'dung_chung', active: true },
];
const profiles = [{ id: 'chan', full_name: 'Chân', role: 'lai_xe' }, { id: 'chau', full_name: 'Châu', role: 'lai_xe' }, { id: 'hc', full_name: 'HC-TC-QT', role: 'van_phong_xe' }];
let n = 0;
const rd = (vehicle_id, reading_date, hm, kind, odo, o = {}) => ({ id: 'r' + String(++n).padStart(3, '0'), vehicle_id, reading_date, read_at: `${reading_date}T${hm}:00+07:00`, kind, odo, photo_path: `p${n}.jpg`, driver_id: vehicle_id === 'v2' ? 'chau' : 'chan', created_by: vehicle_id === 'v2' ? 'chau' : 'chan', voided: false, ...o });
const readings = [
  rd('v2', '2026-09-30', '17:00', 've', 50000),                                         // trước kỳ: nối chuỗi
  rd('v2', '2026-10-01', '07:30', 'xuat_phat', 50000),
  rd('v2', '2026-10-01', '11:00', 'khac', 50060, { fuel_liters: 10, note: 'Đổ dầu' }),
  rd('v2', '2026-10-01', '17:00', 've', 50120, { route: 'Trụ sở → xã Biện Thượng → Trụ sở' }),
  rd('v2', '2026-10-02', '17:30', 've', 50200),                                         // không ghi xuất phát -> 80 km
  rd('v2', '2026-10-05', '07:00', 'xuat_phat', 50260), rd('v2', '2026-10-05', '17:00', 've', 50300), // chênh +60
  rd('v2', '2026-10-06', '07:00', 'xuat_phat', 50300), rd('v2', '2026-10-06', '12:00', 'khac', 50280), rd('v2', '2026-10-06', '17:00', 've', 50400), // lùi trong ngày
  rd('v2', '2026-10-07', '07:00', 'xuat_phat', 50400), rd('v2', '2026-10-07', '17:00', 've', 59999, { voided: true, void_reason: 'Ghi nhầm số' }), rd('v2', '2026-10-07', '17:05', 've', 50450),
  rd('v2', '2026-10-09', '07:00', 'xuat_phat', 50500), rd('v2', '2026-10-09', '18:00', 've', 51500), // 1000 km bất thường
  rd('v2', '2026-10-10', '07:00', 'xuat_phat', 51500),                                  // quên ghi lúc về
  rd('v2', today, '07:00', 'xuat_phat', 51520),
  rd('v1', '2026-10-03', '07:00', 'xuat_phat', 1000), rd('v1', '2026-10-03', '17:00', 've', 1100, { fuel_liters: 8 }), // xe riêng
];
const entries = [
  { id: 'e1', date: '2026-10-01', session: 'sang', content: 'Giám sát', location: 'xã Biện Thượng', vehicle_ids: ['v2'], status: 'da_duyet', vehicle_status: 'da_duyet' },
  { id: 'e2', date: '2026-10-08', session: 'chieu', content: 'Khảo sát', location: 'xã Nga Sơn', vehicle_ids: ['v2'], status: 'da_duyet', vehicle_status: 'da_duyet' },
  { id: 'e3', date: '2026-10-20', session: 'sang', content: 'Tương lai', location: 'xã A', vehicle_ids: ['v2'], status: 'da_duyet' },
  { id: 'e4', date: '2026-10-08', session: 'sang', content: 'Bị từ chối xe', location: 'xã B', vehicle_ids: ['v2'], status: 'da_duyet', vehicle_status: 'tu_choi' },
  { id: 'e5', date: today, session: 'sang', content: 'Hôm nay', location: 'xã C', vehicle_ids: ['v1'], status: 'da_duyet' },
];
const books = L.buildLogbook({ readings, vehicles, entries, profiles, from: '2026-10-01', to: '2026-10-31', today });
const b2 = books.find((b) => b.vehicle.id === 'v2');
const row = (d) => b2.rows.find((r) => r.date === d);
const has = (r, re) => r.warnings.some((w) => re.test(w.text));
eq(row('2026-10-01').count, 3, 'Ghi nhận ĐỦ mọi lần ghi trong ngày (3 lần)');
eq(row('2026-10-01').km, 120, 'Km ngày = lần ghi cuối − lúc xuất phát');
eq(row('2026-10-01').items[1].delta, 60, 'Mỗi lần ghi có km so với lần ghi trước');
eq(row('2026-10-01').fuel, 10, 'Cộng nhiên liệu trong ngày');
eq(row('2026-10-02').km, 80, 'Không ghi xuất phát -> tính từ lần ghi trước');
must(row('2026-10-02').startInferred, 'Đánh dấu số đầu ngày là suy ra');
must(has(row('2026-10-05'), /Chênh \+60 km/), 'Cảnh báo chênh km giữa hai lần ghi (chạy ngoài nhật trình)');
must(has(row('2026-10-06'), /ODO lùi trong ngày/), 'Lỗi: ODO lùi giữa các lần ghi trong ngày');
eq(row('2026-10-07').km, 50, 'Lần ghi "không tính" bị loại khỏi km');
must(row('2026-10-07').items.length === 3 && row('2026-10-07').items.some((i) => i.voided), 'Lần ghi "không tính" VẪN hiển thị');
eq(row('2026-10-07').voidedCount, 1, 'Đếm lần ghi không tính');
must(has(row('2026-10-09'), /bất thường/), 'Cảnh báo quãng đường > 800 km/ngày');
must(has(row('2026-10-10'), /Chưa ghi ODO lúc về/), 'Cảnh báo quên ghi lúc về (ngày đã qua)');
must(!has(row(today), /Chưa ghi ODO lúc về/), 'Hôm nay chưa về: không cảnh báo');
must(row('2026-10-08')?.missing && has(row('2026-10-08'), /chưa ghi nhật trình/), 'Ngày có chuyến mà không ghi -> thiếu nhật trình');
eq(row('2026-10-08').trips.length, 1, 'Bỏ chuyến bị từ chối xe khỏi đối chiếu');
must(!row('2026-10-20'), 'Không báo thiếu cho ngày tương lai');
must(!b2.rows.some((r) => r.date === '2026-09-30'), 'Lần ghi trước kỳ chỉ để nối chuỗi, không hiện');
eq(b2.summary.totalKm, 120 + 80 + 40 + 100 + 50 + 1000 + 0 + 0, 'Tổng km kỳ (hôm nay mới xuất phát: 0 km)');
eq(b2.summary.readings, 15, 'Đếm số lần ghi trong kỳ (không tính lần bị hủy)');
eq(b2.summary.voided, 1, 'Đếm lần ghi bị đánh dấu không tính');
eq(b2.today.count, 1, 'Hôm nay: số lần đã ghi');
eq(b2.lastCounted.odo, 51520, 'Lần ghi hợp lệ gần nhất');
eq(L.suggestKind(b2.today.readings), 've', 'Đã ghi xuất phát hôm nay -> gợi ý "Về"');
eq(L.suggestKind([]), 'xuat_phat', 'Chưa ghi -> gợi ý "Xuất phát"');
const b1 = books.find((b) => b.vehicle.id === 'v1');
must(!b1.rows.find((r) => r.date === '2026-10-03').warnings.some((w) => /không có chuyến/.test(w.text)), 'Xe riêng không bị đối chiếu chuyến trên lịch');
must(!b1.rows.some((r) => r.date === today && r.missing), 'Chuyến HÔM NAY chưa ghi: chưa coi là thiếu');
eq(Math.round(b1.summary.per100), 8, 'Lít/100 km');
const hidden = L.buildLogbook({ readings, vehicles, entries, profiles, from: '2026-10-01', to: '2026-10-31', today, showPrivate: false });
must(!hidden.some((b) => b.vehicle.id === 'v1'), 'showPrivate=false ẩn xe riêng');
eq(L.suggestRoute(row('2026-10-01').trips), 'Trụ sở → xã Biện Thượng → Trụ sở', 'Gợi ý hành trình từ lịch');

// ---------- Excel ----------
const XLSX = require('xlsx');
const wb = L.buildLogbookWorkbook(books, XLSX, { unitName: 'Văn phòng', periodLabel: 'tháng 10/2026', generatedText: 'x' });
const wb2 = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true });
must(['Tổng hợp', '36A-00342', 'Chi tiết các lần ghi'].every((x) => wb2.SheetNames.includes(x)), `Excel: tổng hợp + mỗi xe + chi tiết lần ghi (${wb2.SheetNames.join(', ')})`);
const ws = wb2.Sheets['36A-00342'];
eq(ws.A7?.t, 'n', 'Excel: cột Ngày là ngày thật');
eq(ws.F7?.v, 120, 'Excel: số km ngày');
const det = XLSX.utils.sheet_to_json(wb2.Sheets['Chi tiết các lần ghi'], { header: 1 }).slice(6);
eq(det.length, readings.filter((r) => r.reading_date >= '2026-10-01').length, 'Excel: chi tiết có ĐỦ mọi lần ghi (kể cả lần không tính)');
must(det.some((r) => r[12] === 'Ghi nhầm số'), 'Excel: ghi rõ lý do không tính');

console.log(pass ? '\nTẤT CẢ ĐẠT' : '\nCÓ LỖI');
process.exit(pass ? 0 : 1);
