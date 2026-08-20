// Kiểm chứng quy tắc ĐIỀU XE trong src/lib/permissions.js (hàm thuần, không cần trình duyệt):
//  - chuyến nào được vào bảng điều xe của Phòng HC-TC-QT (entryNeedsVehicleOk)
//  - đếm việc đang chờ đến lượt từng vai trò (vehicleTodoCounts)
import { entryNeedsVehicleOk, vehicleTodoCounts } from '../src/lib/permissions.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra); } };

const banLeader = { id: 'l1', leader_type: 'ban' };
const pctLeader = { id: 'l2', leader_type: 'pct' };
const vpLeader = { id: 'l3', leader_type: 'vanphong' };

console.log('Quy tắc vào bảng điều xe:');
ok('lịch Ban CHỜ DUYỆT + có đề nghị xe -> Phòng HC-TC-QT vẫn thấy',
  entryNeedsVehicleOk({ status: 'cho_duyet', vehicle_status: 'de_xuat' }, banLeader) === true);
ok('lịch Ban CHỜ DUYỆT + đã phân xe -> vẫn thấy',
  entryNeedsVehicleOk({ status: 'cho_duyet', vehicle_status: 'da_phan_xe' }, banLeader) === true);
ok('lịch Ban CHỜ DUYỆT + KHÔNG đề nghị xe -> không vào bảng',
  entryNeedsVehicleOk({ status: 'cho_duyet', vehicle_status: 'none' }, banLeader) === false);
ok('lịch Ban ĐÃ DUYỆT (không đề nghị) -> vẫn vào bảng như trước',
  entryNeedsVehicleOk({ status: 'da_duyet', vehicle_status: 'none' }, banLeader) === true);
ok('lịch Ban ĐÃ ĐIỀU CHỈNH -> vào bảng',
  entryNeedsVehicleOk({ status: 'da_dieu_chinh' }, banLeader) === true);
ok('lịch TTr HĐND chờ duyệt -> vào bảng (quy định cũ)',
  entryNeedsVehicleOk({ status: 'cho_duyet' }, pctLeader) === true);
ok('lịch Lãnh đạo Văn phòng chờ duyệt -> vào bảng',
  entryNeedsVehicleOk({ status: 'cho_duyet' }, vpLeader) === true);

console.log('\nĐếm việc chờ xử lý:');
const entries = [
  // 1 sự kiện 3 lãnh đạo, chờ phân xe -> tính 1 việc
  { id: 'a1', group_id: 'g1', status: 'cho_duyet', vehicle_status: 'de_xuat' },
  { id: 'a2', group_id: 'g1', status: 'cho_duyet', vehicle_status: 'de_xuat' },
  { id: 'a3', group_id: 'g1', status: 'cho_duyet', vehicle_status: 'de_xuat' },
  // 1 sự kiện đã phân xe, chờ Lãnh đạo VP ký duyệt
  { id: 'b1', group_id: 'g2', status: 'da_duyet', vehicle_status: 'da_phan_xe' },
  // lịch bị từ chối -> không tính
  { id: 'c1', group_id: 'g3', status: 'tu_choi', vehicle_status: 'de_xuat' },
  // đã duyệt xe -> không còn là việc
  { id: 'd1', group_id: 'g4', status: 'da_duyet', vehicle_status: 'da_duyet' },
];
const hc = vehicleTodoCounts(entries, { role: 'van_phong_xe' });
ok('gộp theo SỰ KIỆN: 1 chuyến chờ phân xe (không phải 3)', hc.needAssign === 1, JSON.stringify(hc));
ok('đếm 1 phiếu chờ ký duyệt', hc.needApprove === 1);
ok('bỏ qua lịch đã bị từ chối', !JSON.stringify(hc).includes('2'));
ok('Phòng HC-TC-QT: huy hiệu = việc phân xe', hc.mine === 1);

const admin = vehicleTodoCounts(entries, { role: 'quan_tri' });
ok('Quản trị: huy hiệu = việc KÝ DUYỆT', admin.mine === 1 && admin.needApprove === 1);

const other = vehicleTodoCounts(entries, { role: 'cb_ban' });
ok('vai trò khác: không có việc điều xe', other.mine === 0 && other.needAssign === 0);

console.log(`\n${pass}/${pass + fail} đạt`);
process.exit(fail ? 1 : 0);
