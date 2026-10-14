// Kiểm chứng NHẬT TRÌNH XE: nối chuỗi ODO, tính km, cảnh báo (lùi số, chênh km, ảnh chưa đọc,
// thiếu nhật trình khi có chuyến), tổng hợp, xuất Excel; đăng nhập bằng tên ngắn; phân quyền
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
const today = '2026-10-14';
must(L.canEditVehicleLog(R('lai_xe'), { status: 'cho_xac_nhan', log_date: '2026-10-10' }, today), 'Lái xe sửa ngày chưa xác nhận trong 7 ngày');
must(!L.canEditVehicleLog(R('lai_xe'), { status: 'da_xac_nhan', log_date: '2026-10-13' }, today), 'Lái xe KHÔNG sửa ngày đã xác nhận');
must(!L.canEditVehicleLog(R('lai_xe'), null, today, '2026-10-01'), 'Lái xe KHÔNG sửa ngày quá 7 ngày');
must(!L.canEditVehicleLog(R('lai_xe'), null, today, '2026-10-15'), 'Lái xe KHÔNG ghi trước cho ngày mai');
must(L.canEditVehicleLog(R('van_phong_xe'), { status: 'da_xac_nhan', log_date: '2025-01-01' }, today), 'HC-TC-QT sửa mọi ngày');

// ---------- Sổ nhật trình ----------
const vehicles = [
  { id: 'v1', plate: '36A-03668', driver_name: 'Chân', vehicle_type: 'rieng', active: true },
  { id: 'v2', plate: '36A-00342', driver_name: 'Châu', vehicle_type: 'dung_chung', active: true },
];
const profiles = [{ id: 'chan', full_name: 'Chân', role: 'lai_xe' }, { id: 'chau', full_name: 'Châu', role: 'lai_xe' }];
const log = (o) => ({ status: 'cho_xac_nhan', ...o });
const logs = [
  log({ id: 'a0', vehicle_id: 'v2', log_date: '2026-09-30', odo_end: 50000 }),            // trước kỳ: nối chuỗi
  log({ id: 'a1', vehicle_id: 'v2', log_date: '2026-10-01', odo_start: 50000, odo_end: 50120, driver_id: 'chau', fuel_liters: 10, status: 'da_xac_nhan' }),
  log({ id: 'a2', vehicle_id: 'v2', log_date: '2026-10-02', odo_end: 50200, driver_id: 'chau' }),        // chỉ số lúc về -> km = 80
  log({ id: 'a3', vehicle_id: 'v2', log_date: '2026-10-05', odo_start: 50260, odo_end: 50300 }),          // chênh +60 km
  log({ id: 'a4', vehicle_id: 'v2', log_date: '2026-10-06', odo_start: 50250, odo_end: 50400 }),          // LÙI số
  log({ id: 'a5', vehicle_id: 'v2', log_date: '2026-10-07', odo_start: 50400, photo_end_path: 'p.jpg' }), // chỉ ảnh lúc về
  log({ id: 'a6', vehicle_id: 'v2', log_date: '2026-10-09', odo_start: 50500, odo_end: 51500 }),          // 1000 km bất thường
  log({ id: 'b1', vehicle_id: 'v1', log_date: '2026-10-03', odo_start: 1000, odo_end: 1100, fuel_liters: 8 }), // xe riêng
];
const entries = [
  { id: 'e1', date: '2026-10-01', session: 'sang', content: 'Giám sát', location: 'xã Biện Thượng', vehicle_ids: ['v2'], status: 'da_duyet', vehicle_status: 'da_duyet' },
  { id: 'e2', date: '2026-10-08', session: 'chieu', content: 'Khảo sát', location: 'xã Nga Sơn', vehicle_ids: ['v2'], status: 'da_duyet', vehicle_status: 'da_duyet' },
  { id: 'e3', date: '2026-10-20', session: 'sang', content: 'Tương lai', location: 'xã A', vehicle_ids: ['v2'], status: 'da_duyet' },
  { id: 'e4', date: '2026-10-08', session: 'sang', content: 'Bị từ chối xe', location: 'xã B', vehicle_ids: ['v2'], status: 'da_duyet', vehicle_status: 'tu_choi' },
];
const books = L.buildLogbook({ logs, vehicles, entries, profiles, from: '2026-10-01', to: '2026-10-31', today, showPrivate: true });
const b2 = books.find((b) => b.vehicle.id === 'v2');
const row = (d) => b2.rows.find((r) => r.date === d);
const has = (r, re) => r.warnings.some((w) => re.test(w.text));
eq(row('2026-10-01').km, 120, 'Km = về − xuất phát');
eq(row('2026-10-02').km, 80, 'Thiếu số xuất phát -> lấy ODO cuối lần trước');
must(row('2026-10-02').startInferred, 'Đánh dấu số xuất phát là suy ra');
must(has(row('2026-10-05'), /Chênh \+60 km/), 'Cảnh báo chênh km giữa hai lần ghi (chạy ngoài nhật trình)');
must(has(row('2026-10-06'), /ODO lùi/) && row('2026-10-06').warnings.some((w) => w.level === 'error'), 'Lỗi: ODO lùi số');
must(row('2026-10-07').needRead && has(row('2026-10-07'), /đọc số từ ảnh/), 'Chỉ gửi ảnh -> chờ đọc số');
must(has(row('2026-10-09'), /bất thường/), 'Cảnh báo quãng đường > 800 km/ngày');
must(row('2026-10-08')?.missing && has(row('2026-10-08'), /chưa ghi nhật trình/), 'Ngày có chuyến mà không ghi -> thiếu nhật trình');
eq(row('2026-10-08').trips.length, 1, 'Bỏ chuyến bị từ chối xe khỏi đối chiếu');
must(!row('2026-10-20'), 'Không báo thiếu cho ngày tương lai');
must(!b2.rows.some((r) => r.date === '2026-09-30'), 'Dòng trước kỳ chỉ để nối chuỗi, không hiện');
eq(row('2026-10-01').trips.length, 1, 'Ghép chuyến công tác theo lịch vào ngày');
eq(b2.summary.totalKm, 120 + 80 + 40 + 150 + 1000, 'Tổng km kỳ');
eq(b2.summary.missing, 1, 'Đếm ngày thiếu nhật trình');
eq(b2.summary.fuel, 10, 'Tổng nhiên liệu');
must(L.canBulkConfirm(row('2026-10-02')) && !L.canBulkConfirm(row('2026-10-06')) && !L.canBulkConfirm(row('2026-10-07')) && !L.canBulkConfirm(row('2026-10-01')),
  'Xác nhận hàng loạt chỉ dòng hợp lệ, chưa xác nhận');
const b1 = books.find((b) => b.vehicle.id === 'v1');
must(!b1.rows[0].warnings.some((w) => /không có chuyến/.test(w.text)), 'Xe riêng không bị đối chiếu chuyến trên lịch');
eq(Math.round(b1.summary.per100), 8, 'Lít/100 km');
const hidden = L.buildLogbook({ logs, vehicles, entries, profiles, from: '2026-10-01', to: '2026-10-31', today, showPrivate: false });
must(!hidden.some((b) => b.vehicle.id === 'v1'), 'showPrivate=false ẩn xe riêng');
eq(L.suggestRoute(row('2026-10-01').trips), 'Trụ sở → xã Biện Thượng → Trụ sở', 'Gợi ý hành trình từ lịch');

// ---------- Excel ----------
const XLSX = require('xlsx');
const wb = L.buildLogbookWorkbook(books, XLSX, { unitName: 'Văn phòng', periodLabel: 'tháng 10/2026', generatedText: 'x' });
const wb2 = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true });
must(wb2.SheetNames.includes('Tổng hợp') && wb2.SheetNames.includes('36A-00342'), `Excel: sheet tổng hợp + mỗi xe một sheet (${wb2.SheetNames.join(', ')})`);
const ws = wb2.Sheets['36A-00342'];
eq(ws.A7?.t, 'n', 'Excel: cột Ngày là ngày thật');
eq(ws.F7?.v, 120, 'Excel: số km');

console.log(pass ? '\nTẤT CẢ ĐẠT' : '\nCÓ LỖI');
process.exit(pass ? 0 : 1);
