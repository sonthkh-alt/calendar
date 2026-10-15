// Kiểm chứng NHẬT TRÌNH XE (mỗi lần ghi ODO 1 dòng): nối chuỗi ODO, tính km, lần ghi "không tính",
// cảnh báo (lùi số, chênh km, quên ghi lúc về, thiếu nhật trình khi có chuyến), tổng hợp, Excel; đăng nhập bằng tên ngắn; phân quyền
// module (chỉ lái xe / HC-TC-QT / Quản trị). npm run test:logbook
import { createRequire } from 'module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);

await build({
  stdin: {
    contents: "export * from './src/lib/vehicleLog.js'; export * from './src/lib/permissions.js'; export { toLoginEmail } from './src/lib/constants.js'; export { pickOdoCandidate, checkPlausible } from './src/lib/odoOcr.js';",
    resolveDir: '.', loader: 'js',
  },
  bundle: true, format: 'cjs', platform: 'node', outfile: 'scripts/.logbook.cjs', logLevel: 'silent', external: ['xlsx', 'tesseract.js'],
  define: { 'import.meta.env': '{}' },
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
  rd('v2', '2026-09-30', '17:00', 've', 50000),  // dữ liệu CŨ loại 'về'                                         // trước kỳ: nối chuỗi
  rd('v2', '2026-10-01', '07:30', 'xuat_phat', 50000),
  rd('v2', '2026-10-01', '11:00', 'khac', 50060, { fuel_liters: 10, note: 'Đổ dầu', odo_source: 'sua_so', odo_ocr: 50006 }),
  rd('v2', '2026-10-01', '17:00', 'khac', 50120, { route: 'Trụ sở → xã Biện Thượng → Trụ sở' }),
  rd('v2', '2026-10-02', '17:30', 'khac', 50200, { odo_source: 'nhap_tay' }),                                         // không ghi xuất phát -> 80 km
  rd('v2', '2026-10-05', '07:00', 'xuat_phat', 50260, { borrowed: true, driver_id: 'chan', created_by: 'chan' }), rd('v2', '2026-10-05', '17:00', 'khac', 50300, { borrowed: true, driver_id: 'chan', created_by: 'chan' }), // chênh +60
  rd('v2', '2026-10-06', '07:00', 'xuat_phat', 50300), rd('v2', '2026-10-06', '12:00', 'khac', 50280), rd('v2', '2026-10-06', '17:00', 'khac', 50400), // lùi trong ngày
  rd('v2', '2026-10-07', '07:00', 'xuat_phat', 50400), rd('v2', '2026-10-07', '17:00', 'khac', 59999, { voided: true, void_reason: 'Ghi nhầm số' }), rd('v2', '2026-10-07', '17:05', 'khac', 50450),
  rd('v2', '2026-10-09', '07:00', 'xuat_phat', 50500), rd('v2', '2026-10-09', '18:00', 'khac', 51500), // 1000 km bất thường
  rd('v2', '2026-10-10', '07:00', 'xuat_phat', 51500),                                  // quên ghi lúc về
  rd('v2', today, '07:00', 'xuat_phat', 51520),
  rd('v1', '2026-10-03', '07:00', 'xuat_phat', 1000), rd('v1', '2026-10-03', '17:00', 'khac', 1100, { fuel_liters: 8 }), // xe riêng
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
must(has(row('2026-10-10'), /chưa ghi thêm số ODO khi kết thúc/), 'Cảnh báo chỉ có Xuất phát, chưa ghi thêm khi kết thúc (ngày đã qua)');
must(!has(row(today), /chưa ghi thêm số ODO/), 'Hôm nay đang chạy: không cảnh báo');
must(!has(row('2026-10-01'), /chưa ghi thêm số ODO/), 'Có Ghi thêm sau Xuất phát: không cảnh báo');
must(row('2026-10-08')?.missing && has(row('2026-10-08'), /chưa ghi nhật trình/), 'Ngày có chuyến mà không ghi -> thiếu nhật trình');
eq(row('2026-10-08').trips.length, 1, 'Bỏ chuyến bị từ chối xe khỏi đối chiếu');
must(!row('2026-10-20'), 'Không báo thiếu cho ngày tương lai');
must(!b2.rows.some((r) => r.date === '2026-09-30'), 'Lần ghi trước kỳ chỉ để nối chuỗi, không hiện');
eq(b2.summary.totalKm, 120 + 80 + 40 + 100 + 50 + 1000 + 0 + 0, 'Tổng km kỳ (hôm nay mới xuất phát: 0 km)');
eq(b2.summary.readings, 15, 'Đếm số lần ghi trong kỳ (không tính lần bị hủy)');
eq(b2.summary.voided, 1, 'Đếm lần ghi bị đánh dấu không tính');
eq(b2.today.count, 1, 'Hôm nay: số lần đã ghi');
eq(b2.lastCounted.odo, 51520, 'Lần ghi hợp lệ gần nhất');
eq(L.suggestKind(b2.today.readings), 'khac', 'Đã ghi Xuất phát hôm nay -> gợi ý "Ghi thêm"');
eq(L.FORM_KINDS.join(','), 'xuat_phat,khac', 'Form chỉ còn 2 loại: Xuất phát + Ghi thêm');
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
must(det.some((r) => r[14] === 'Ghi nhầm số'), 'Excel: ghi rõ lý do không tính');
must(det.some((r) => r[9] === 'Đã sửa số máy đọc') && det.some((r) => r[10] === 'Mượn xe'), 'Excel: cột Nguồn số ODO + Mượn xe');

// ---------- Mượn xe + nguồn số ODO ----------
eq(L.borrowNote('Chân', '36A-00342', 'Châu'), 'Lái xe Chân mượn xe 36A-00342 (xe của lái xe Châu)', 'Ghi chú mượn xe tự sinh');
const bw = row('2026-10-05');
must(bw.borrowers.includes('Chân') && bw.items.some((i) => i.borrowed), 'Lần ghi mượn xe tính vào xe đi + ghi nhận người mượn');
eq(bw.km, 40, 'Km ngày mượn xe vẫn tính cho xe đi');
must(has(row('2026-10-01'), /sửa số máy đọc \(máy đọc 50\.006 → ghi 50\.060\)/), 'Cảnh báo lái xe sửa số máy đọc (kèm số máy đọc)');
must(row('2026-10-02').warnings.some((w) => w.level === 'info' && /nhập tay/.test(w.text)), 'Ghi chú số nhập tay (máy không đọc được)');

// ---------- Chọn số ODO từ văn bản nhận dạng (dự phòng Tesseract) ----------
eq(L.pickOdoCandidate('ODO 055266 km  TRIP 123.4', 55235).value, 55266, 'Chọn ODO, bỏ TRIP có thập phân');
eq(L.pickOdoCandidate('12:45  24  55.266', 55235).value, 55266, 'Số có dấu chấm phân nhóm nghìn');
eq(L.pickOdoCandidate('55266 123', null).value, 55266, 'Không có lần trước: chọn số nhiều chữ số nhất');
eq(L.pickOdoCandidate('51234', 55235).value, null, 'Số nhỏ hơn lần trước -> không tin (bắt gõ tay)');
eq(L.pickOdoCandidate('99999', 55235).value, null, 'Số nhảy quá xa -> không tin');
eq(L.pickOdoCandidate('', 55235).value, null, 'Không đọc được gì -> gõ tay');
eq(L.pickOdoCandidate('85 12', null).value, null, 'Chỉ có số ngắn -> không tin');
must(L.checkPlausible(55300, 55235).ok && !L.checkPlausible(55000, 55235).ok && L.checkPlausible(55300, null).ok, 'Kiểm tra số hợp lý so với lần ghi trước');

console.log(pass ? '\nTẤT CẢ ĐẠT' : '\nCÓ LỖI');
process.exit(pass ? 0 : 1);
