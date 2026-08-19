// Kiểm chứng lib dựng dữ liệu Phiếu điều xe (src/lib/vehicleSlipData.js) — hàm thuần,
// dùng CHUNG cho hộp chi tiết lịch và bảng Điều xe (phê duyệt/ký hàng loạt).
import { createRequire } from 'module';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);

await build({
  entryPoints: ['src/lib/vehicleSlipData.js'],
  bundle: true, format: 'cjs', platform: 'node',
  outfile: 'scripts/.vehicleSlipData.cjs',
  logLevel: 'silent',
});
const { buildSlipPayload, sameEventEntries, chairLeaderOf, digitalSignInfo } = require('./.vehicleSlipData.cjs');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra); } };

const leaders = [
  { id: 'lam', full_name: 'Lê Tiến Lam', position: 'Phó Chủ tịch Thường trực HĐND tỉnh', sort_order: 1 },
  { id: 'hao', full_name: 'Ngô Thị Hồng Hảo', position: 'Trưởng ban Văn hóa Xã hội', sort_order: 6 },
  { id: 'long', full_name: 'Trần Mạnh Long', position: 'Trưởng ban Pháp chế', sort_order: 8 },
];
const vehicles = [
  { id: 'v1', plate: '36A-1234', driver_name: 'Lê Văn B', driver_phone: '0912345678', vehicle_type: 'dung_chung' },
  { id: 'v2', plate: '36A-5678', driver_name: 'Trần Văn C', vehicle_type: 'dung_chung' },
];
const profiles = [
  { id: 'p-cv', full_name: 'Chuyên viên Nguyễn Văn A', position: 'Chuyên viên' },
  { id: 'p-hc', full_name: 'Ngô Ngọc Quyến', position: 'Phó Trưởng phòng HC-TC-QT', signature_data: 'data:image/png;base64,AAA' },
  { id: 'p-vp', full_name: 'Hà Ngọc Sơn', position: 'Phó Chánh Văn phòng' },
];

// Sự kiện 2 lãnh đạo (nhập sai thứ tự: Long trước Lam) + 2 xe
const base = {
  group_id: 'g1', date: '2026-08-20', session: 'sang', content: 'Giám sát chuyên đề tại xã Quảng Lộc',
  location: 'UBND xã Quảng Lộc', status: 'da_duyet', rider_count: 5, departure_place: 'Trụ sở Đoàn ĐBQH và HĐND tỉnh',
  vehicle_ids: ['v1', 'v2'], vehicle_status: 'da_phan_xe', vehicle_assigned_by: 'p-hc',
  vehicle_requested_by: 'p-cv', vehicle_requested_at: '2026-08-18T03:00:00.000Z', created_by: 'p-cv',
};
const entries = [
  { ...base, id: 'e1', leader_id: 'long' },
  { ...base, id: 'e2', leader_id: 'lam' },
  // lịch khác cùng ngày — KHÔNG được gộp vào
  { id: 'e3', leader_id: 'hao', date: '2026-08-20', session: 'sang', content: 'Việc khác', status: 'da_duyet', vehicle_ids: [] },
];

console.log('Dữ liệu Phiếu điều xe:');

const merged = sameEventEntries(entries[0], entries);
ok('gộp đúng các mục cùng sự kiện (2 mục, không lẫn lịch khác)', merged.length === 2 && merged.every((e) => e.group_id === 'g1'));

const chair = chairLeaderOf(merged, Object.fromEntries(leaders.map((l) => [l.id, l])));
ok('lãnh đạo chủ trì = STT nhỏ nhất (Lê Tiến Lam), không phải dòng đầu', chair?.id === 'lam', chair?.full_name);

const p = buildSlipPayload({ entry: entries[0], entries, leaders, vehicles, profiles });
ok('người đề nghị trên phiếu = lãnh đạo chủ trì', p.requesterName === 'Lê Tiến Lam', p.requesterName);
ok('chức vụ lấy theo lãnh đạo chủ trì', p.requesterPosition === 'Phó Chủ tịch Thường trực HĐND tỉnh');
ok('KHÔNG lấy tên chuyên viên nhập lịch', !p.requesterName.includes('Chuyên viên'));
ok('liệt kê ĐỦ các xe của chuyến', p.plateText === '36A-1234; 36A-5678', p.plateText);
ok('lái xe kèm số điện thoại nếu có', p.driverText === 'Lê Văn B - 0912345678; Trần Văn C', p.driverText);
ok('số người + nơi xuất phát', p.riderText === '5' && p.departure === 'Trụ sở Đoàn ĐBQH và HĐND tỉnh');
ok('thời gian ghi theo buổi + ngày', p.timeText === 'Sáng, ngày 20/08/2026', p.timeText);
ok('nội dung + địa điểm', p.purpose.includes('Quảng Lộc') && p.purposeMore === 'Địa điểm: UBND xã Quảng Lộc');
ok('người ký ô Phòng HC-TC-QT = người phân xe', p.hctcqtSigner === 'Ngô Ngọc Quyến' && p.hctcqtSign === 'data:image/png;base64,AAA');
ok('chưa duyệt thì chưa có mã xác thực', p.signCode === '' && p.approvedAtText === '');

// Sau khi phê duyệt (dữ liệu ghi đè lúc vừa duyệt xong, entry chưa kịp làm mới)
const p2 = buildSlipPayload({
  entry: entries[0], entries, leaders, vehicles, profiles,
  extra: { signCode: 'A1B2-C3D4', approvedAt: '2026-08-19T07:35:00.000Z', approvedById: 'p-vp', approveNote: 'Đồng ý bố trí xe.' },
});
ok('ghi đè lúc vừa duyệt: người ký Lãnh đạo Văn phòng', p2.vpSigner === 'Hà Ngọc Sơn', p2.vpSigner);
ok('ghi đè lúc vừa duyệt: ý kiến + mã xác thực', p2.vpNote === 'Đồng ý bố trí xe.' && p2.signCode === 'A1B2-C3D4');
ok('có dòng thời điểm phê duyệt', /\d{1,2}:\d{2} ngày 19\/08\/2026/.test(p2.approvedAtText), p2.approvedAtText);

// Chuyến chưa nhập nơi xuất phát -> dùng mặc định
const p3 = buildSlipPayload({ entry: { ...entries[0], departure_place: null, rider_count: null }, entries, leaders, vehicles, profiles });
ok('nơi xuất phát trống -> mặc định trụ sở', p3.departure === 'Trụ sở Đoàn ĐBQH và HĐND tỉnh');
ok('số người trống -> để trống', p3.riderText === '');

const ds = digitalSignInfo({ subjectName: 'Hà Ngọc Sơn', issuerName: 'CA phục vụ các cơ quan Nhà nước G2' }, new Date(2026, 7, 19, 14, 35));
ok('thông tin ô ĐÃ KÝ SỐ đầy đủ', ds.signer === 'Hà Ngọc Sơn' && ds.issuer.includes('G2') && ds.timeText === '14:35 ngày 19/08/2026', JSON.stringify(ds));
ok('không có chứng thư -> không vẽ ô ký số', digitalSignInfo(null) === null);

console.log(`\n${pass}/${pass + fail} đạt`);
process.exit(fail ? 1 : 0);
