// Kiểm chứng NHIÊN LIỆU & ĐỊNH MỨC: tiêu hao thực tế so định mức, tiền vượt, các cảnh báo hóa đơn
// (trùng số, vượt dung tích bình, sai loại, đơn giá lệch, thành tiền sai, biển số khác, ngày không chạy,
// lái xe khai lệch hóa đơn...) và xuất Excel. npm run test:fuel
import { createRequire } from 'module';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
await build({
  stdin: { contents: "export * from './src/lib/fuel.js'; export { buildLogbook } from './src/lib/vehicleLog.js';", resolveDir: '.', loader: 'js' },
  bundle: true, format: 'cjs', platform: 'node', outfile: 'scripts/.fuel.cjs', logLevel: 'silent', external: ['xlsx'],
});
const F = require('./.fuel.cjs');
let pass = true;
const must = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) pass = false; };
const eq = (a, b, m) => must(a === b, `${m} (được ${JSON.stringify(a)}, cần ${JSON.stringify(b)})`);
const has = (alerts, re, plate) => alerts.some((a) => re.test(a.text) && (!plate || a.plate === plate));

const today = '2026-10-31';
const vehicles = [
  { id: 'v1', plate: '36A-00342', driver_name: 'Châu', vehicle_type: 'dung_chung', active: true },
  { id: 'v2', plate: '36A-12368', driver_name: 'Quyết', vehicle_type: 'dung_chung', active: true },
  { id: 'v3', plate: '36A-00936', driver_name: 'Tiến', vehicle_type: 'dung_chung', active: true },
];
const norms = [
  { vehicle_id: 'v1', norm_l100: 12, fuel_type: 'dau', tank_liters: 60 },
  { vehicle_id: 'v2', norm_l100: 10, fuel_type: 'xang', tank_liters: 50 },
];
// Nhật trình: v1 chạy 1.000 km (01/10 -> 30/10), v2 chạy 500 km, v3 chạy 400 km
let n = 0;
const rd = (v, d, odo, o = {}) => ({ id: 'r' + (++n), vehicle_id: v, reading_date: d, read_at: `${d}T07:00:00+07:00`, kind: 'xuat_phat', odo, photo_path: 'p', voided: false, ...o });
const readings = [
  rd('v1', '2026-10-01', 10000), rd('v1', '2026-10-10', 10400, { fuel_liters: 40 }), rd('v1', '2026-10-30', 11000),
  rd('v2', '2026-10-01', 20000), rd('v2', '2026-10-15', 20500, { fuel_liters: 30 }),
  rd('v3', '2026-10-02', 30000), rd('v3', '2026-10-20', 30400),
];
const books = F.buildLogbook({ readings, vehicles, entries: [], profiles: [], from: '2026-10-01', to: '2026-10-31', today });
const inv = (o) => ({ id: 'i' + (++n), invoice_date: '2026-10-10', fuel_type: 'dau', ...o });
const invoices = [
  // v1: tổng 150 lít / 1000 km = 15 l/100 (định mức 12 -> vượt 25%)
  inv({ vehicle_id: 'v1', invoice_no: '0001', seller: 'CHXD Số 1', liters: 40, unit_price: 20000, amount: 800000 }),
  inv({ vehicle_id: 'v1', invoice_no: '0002', seller: 'CHXD Số 1', liters: 55, unit_price: 20000, amount: 1100000, invoice_date: '2026-10-30' }),
  inv({ vehicle_id: 'v1', invoice_no: '0003', seller: 'CHXD Số 1', liters: 55, unit_price: 20000, amount: 1100000, invoice_date: '2026-10-30' }),
  // v2: 58 lít / 500 km = 11,6 l/100 (vượt định mức 10 -> +16%) — hóa đơn trùng số, sai loại, vượt bình
  inv({ vehicle_id: 'v2', invoice_no: '0001', seller: 'CHXD Số 1', liters: 58, unit_price: 26000, amount: 1300000, fuel_type: 'dau', invoice_date: '2026-10-15' }),
  // v3: không có định mức; 1 hóa đơn đổ vào ngày xe không chạy, biển số trên hóa đơn là xe v1
  inv({ vehicle_id: 'v3', invoice_no: '9999', seller: 'CHXD Số 2', liters: 30, unit_price: 20000, amount: 600000, invoice_date: '2026-10-25', ocr_data: { plate: '36A-003.42' } }),
  // Hóa đơn năm trước cùng số + cùng cửa hàng với 0003 -> trùng
  inv({ vehicle_id: 'v1', invoice_no: '0003', seller: 'chxd số 1', liters: 20, unit_price: 19000, amount: 380000, invoice_date: '2025-12-01' }),
];
const R = F.buildFuelReport({ vehicles, norms, invoices, books, from: '2026-10-01', to: '2026-10-31', today });
const row = (id) => R.rows.find((r) => r.vehicle.id === id);

eq(row('v1').km, 1000, 'Km = quãng đường theo đồng hồ ODO trong kỳ (kể cả quãng giữa các ngày)');
eq(books.find((b) => b.vehicle.id === 'v1').summary.totalKm, 0, '  (tổng km ngày của nhật trình = 0 vì chỉ ghi Xuất phát — không dùng để tính nhiên liệu)');
eq(row('v1').liters, 150, 'Cộng lít trên hóa đơn trong kỳ (bỏ hóa đơn ngoài kỳ)');
eq(row('v1').allowed, 120, 'Lít theo định mức = km × định mức / 100');
eq(row('v1').actual, 15, 'Tiêu hao thực tế (lít/100 km)');
eq(Math.round(row('v1').overPct * 100), 25, 'Vượt định mức %');
eq(row('v1').status, 'vuot_nang', 'Vượt ≥20% -> vượt nhiều');
eq(row('v1').overAmount, 30 * 20000, 'Tiền vượt định mức = lít vượt × đơn giá bình quân');
must(has(R.alerts, /vượt định mức 12 lít\/100 km 25%/, '36A-00342'), 'Cảnh báo vượt định mức kèm số liệu');
eq(row('v2').status, 'vuot', 'Vượt 16% (10–20%) -> cảnh báo vượt định mức');
eq(row('v3').status, 'chua_dinh_muc', 'Chưa có định mức');
must(has(R.alerts, /Chưa khai báo định mức/, '36A-00936'), 'Nhắc khai báo định mức');

must(has(R.alerts, /HĐ 0003.*trùng số hóa đơn \(nhập 2 lần\)/, '36A-00342'), 'Phát hiện trùng số hóa đơn (kể cả hóa đơn năm trước, không phân biệt hoa/thường)');
must(has(R.alerts, /HĐ 0001.*58 lít vượt dung tích bình 50 lít/, '36A-12368'), 'Số lít vượt dung tích bình (quá 5% dung sai)');
must(has(R.alerts, /loại nhiên liệu Dầu diesel khác loại của xe \(Xăng\)/, '36A-12368'), 'Sai loại nhiên liệu');
must(has(R.alerts, /HĐ 0001.*đơn giá .* lệch 30% so với mức phổ biến/, '36A-12368'), 'Đơn giá lệch bất thường so với mức phổ biến');
must(has(R.alerts, /không khớp số lít × đơn giá/, '36A-12368'), 'Thành tiền không khớp số lít × đơn giá');
must(has(R.alerts, /biển số trên hóa đơn \(36A-003\.42\) khác xe 36A-00936 — có thể là hóa đơn của xe 36A-00342/, '36A-00936'), 'Biển số trên hóa đơn khác xe (gợi ý xe đúng)');
must(has(R.alerts, /HĐ 9999.*không có lần ghi ODO trong ±1 ngày/, '36A-00936'), 'Đổ nhiên liệu vào ngày xe không ghi ODO');
must(has(R.alerts, /Ngày 30\/10\/2026: tổng 110 lít trên nhiều hóa đơn vượt dung tích bình 60 lít/, '36A-00342'), 'Nhiều hóa đơn cùng ngày vượt dung tích bình');
must(has(R.alerts, /Lái xe ghi đổ 40 lít trong nhật trình, hóa đơn 150 lít/, '36A-00342'), 'Lít lái xe khai lệch hóa đơn');
must(has(R.alerts, /Ngày 15\/10: lái xe ghi đổ 30 lít/, '36A-12368') === false, 'Có hóa đơn cùng ngày -> không báo thiếu hóa đơn');
const R2 = F.buildFuelReport({ vehicles, norms, invoices: [], books, from: '2026-10-01', to: '2026-10-31', today });
must(has(R2.alerts, /Ngày 10\/10: lái xe ghi đổ 40 lít nhưng chưa có hóa đơn/, '36A-00342'), 'Lái xe khai đổ nhiên liệu nhưng chưa có hóa đơn');
must(has(R2.alerts, /chạy 1\.000 km nhưng chưa có hóa đơn/, '36A-00342'), 'Xe chạy nhiều mà không có hóa đơn');
const R3 = F.buildFuelReport({ vehicles, norms, invoices: [inv({ vehicle_id: 'v1', liters: 10, invoice_date: '2026-10-05' })], books: books.map((b) => ({ ...b, summary: { ...b.summary, totalKm: 50, odoFirst: 10000, odoLast: 10050 } })), from: '2026-10-01', to: '2026-10-31', today });
eq(R3.rows.find((r) => r.vehicle.id === 'v1').status, 'it_du_lieu', 'Xe chạy dưới 100 km -> chưa kết luận tiêu hao');
eq(R.alerts[0].level, 'error', 'Cảnh báo nghiêm trọng xếp đầu');
eq(R.totals.invoices, 5, 'Tổng số hóa đơn trong kỳ');

const XLSX = require('xlsx');
const wb = XLSX.read(XLSX.write(F.buildFuelWorkbook(R, XLSX, { unitName: 'VP', periodLabel: 'tháng 10/2026', generatedText: 'x' }), { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer', cellNF: true });
must(['Tổng hợp nhiên liệu', 'Hóa đơn', 'Cảnh báo'].every((s) => wb.SheetNames.includes(s)), 'Excel: 3 sheet tổng hợp / hóa đơn / cảnh báo');
const s1 = wb.Sheets['Tổng hợp nhiên liệu'];
eq(s1.J7?.v, 15, 'Excel: tiêu hao thực tế là số thật');
eq(s1.K7?.z, '0.0%', 'Excel: % vượt định mức định dạng phần trăm');
eq(wb.Sheets['Hóa đơn'].A7?.t, 'n', 'Excel: ngày hóa đơn là ngày thật');

console.log(pass ? '\nTẤT CẢ ĐẠT' : '\nCÓ LỖI');
process.exit(pass ? 0 : 1);
