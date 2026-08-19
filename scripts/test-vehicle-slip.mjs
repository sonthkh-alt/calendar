// Kiểm chứng "Phiếu đề nghị sử dụng xe ô tô công vụ" (src/lib/vehicleSlip.js).
// Chạy: npm run test:slip — không cần trình duyệt (buildVehicleSlipHtml là hàm thuần).
import { buildVehicleSlipHtml, makeSignCode } from '../src/lib/vehicleSlip.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

const html = buildVehicleSlipHtml({
  unitName: 'VĂN PHÒNG ĐOÀN ĐBQH\nVÀ HĐND TỈNH THANH HÓA',
  recipient: 'Lãnh đạo Văn phòng Đoàn ĐBQH và HĐND tỉnh Thanh Hóa',
  placeDateText: 'Thanh Hoá, ngày 19 tháng 8 năm 2026',
  requesterName: 'Nguyễn Văn A',
  requesterPosition: 'Chuyên viên phòng Công tác HĐND',
  purpose: 'Giám sát chuyên đề tại xã Quảng Lộc & <Ban Dân tộc>',
  purposeMore: 'Địa điểm: UBND xã Quảng Lộc',
  timeText: 'Sáng, ngày 20/08/2026',
  riderText: '5',
  departure: 'Trụ sở Đoàn ĐBQH và HĐND tỉnh',
  plateText: '36A-1234',
  driverText: 'Lê Văn B - 0912345678',
  hctcqtBlock: 'Ý KIẾN CỦA PHÒNG HÀNH CHÍNH, TỔ CHỨC, QUẢN TRỊ',
  hctcqtSignTitle: 'KT. TRƯỞNG PHÒNG\nPHÓ TRƯỞNG PHÒNG',
  hctcqtSigner: 'Ngô Ngọc Quyến',
  vpBlock: 'Ý KIẾN CỦA LÃNH ĐẠO VĂN PHÒNG',
  vpNote: 'Đồng ý bố trí xe theo đề nghị.',
  vpSignTitle: 'KT. CHÁNH VĂN PHÒNG\nPHÓ CHÁNH VĂN PHÒNG',
  vpSigner: 'Hà Ngọc Sơn',
  vpSign: 'data:image/png;base64,iVBORw0KGgo=',
  approvedAtText: '14:35 ngày 19/08/2026',
  signCode: 'A1B2-C3D4',
});

console.log('Phiếu đề nghị sử dụng xe ô tô công vụ:');
ok('là tài liệu HTML A4 dọc', html.startsWith('<!doctype html>') && html.includes('size: A4 portrait'));
ok('đủ quốc hiệu + tiêu ngữ', html.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM') && html.includes('Độc lập - Tự do - Hạnh phúc'));
ok('tiêu đề phiếu', html.includes('Đề nghị sử dụng xe ô tô công vụ'));
ok('người báo xe + chức vụ', html.includes('Nguyễn Văn A') && html.includes('Chuyên viên phòng Công tác HĐND'));
ok('nội dung / thời gian / số người / xuất phát', html.includes('Sáng, ngày 20/08/2026') && html.includes('>5<') && html.includes('Trụ sở Đoàn ĐBQH và HĐND tỉnh'));
ok('ý kiến Phòng HC-TC-QT: biển số + lái xe', html.includes('36A-1234') && html.includes('Lê Văn B - 0912345678'));
ok('ô ký 2 dòng (xuống dòng bằng <br/>)', html.includes('KT. TRƯỞNG PHÒNG<br/>PHÓ TRƯỞNG PHÒNG'));
ok('ý kiến + người ký của Lãnh đạo Văn phòng', html.includes('Đồng ý bố trí xe theo đề nghị.') && html.includes('Hà Ngọc Sơn'));
ok('in ảnh chữ ký data:image', html.includes('<img class="sig-img" src="data:image/png;base64,'));
ok('dòng xác thực phê duyệt điện tử', html.includes('14:35 ngày 19/08/2026') && html.includes('A1B2-C3D4'));
ok('thoát ký tự HTML trong dữ liệu người dùng', html.includes('&lt;Ban Dân tộc&gt;') && !html.includes('<Ban Dân tộc>'));

// Không có phê duyệt -> không in dòng xác thực; ảnh lạ (http) bị bỏ qua
const plain = buildVehicleSlipHtml({ vpSign: 'https://vidu.vn/chuky.png' });
ok('chưa duyệt thì không in mã xác thực', !plain.includes('Mã xác thực'));
ok('chỉ nhận ảnh chữ ký dạng data:image', !plain.includes('https://vidu.vn/chuky.png'));

const code = makeSignCode();
ok('mã xác thực dạng XXXX-XXXX', /^[0-9A-F]{4}-[0-9A-F]{4}$/.test(code));

console.log(`\n${pass}/${pass + fail} đạt`);
process.exit(fail ? 1 : 0);
