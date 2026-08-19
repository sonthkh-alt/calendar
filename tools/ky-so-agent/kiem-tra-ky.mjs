// KIỂM TRA KÝ SỐ — ký thử một mẩu dữ liệu bằng chính chứng thư trên USB token.
// Dùng khi trên web báo "Chưa ký số được" để biết lỗi nằm ở token/PIN hay ở chỗ khác.
// Chạy bằng cách BẤM ĐÚP tệp kiem-tra-ky.bat (phải chạy trong phiên làm việc của bạn
// thì hộp nhập mã PIN mới hiện lên được).
import { readFileSync } from 'node:fs';
import { listCertificates, signDetachedCms } from './winsign.mjs';

const cfg = (() => {
  try { return JSON.parse(readFileSync(new URL('./config.json', import.meta.url), 'utf8')); }
  catch { return {}; }
})();

console.log('=== KIỂM TRA KÝ SỐ BẰNG USB TOKEN ===\n');

const certs = await listCertificates();
if (!certs.length) {
  console.log('✗ Máy KHÔNG thấy chứng thư số nào có khóa riêng.');
  console.log('  -> Cắm USB token vào rồi chạy lại. Nếu đã cắm: mở VGCA Token Manager xem token có nhận không.');
  process.exit(1);
}

console.log(`Thấy ${certs.length} chứng thư có khóa riêng:`);
for (const c of certs) {
  console.log(`  - ${c.subjectName}  [${c.thumbprint}]`);
  console.log(`    cấp bởi: ${c.issuerName} | hết hạn: ${c.notAfter} | ký tài liệu: ${c.canSignDocument ? 'ĐƯỢC' : 'KHÔNG'}`);
}

const thumb = cfg.certThumbprint || certs.find((c) => c.canSignDocument)?.thumbprint;
if (!thumb) { console.log('\n✗ Không chọn được chứng thư để ký.'); process.exit(1); }
const chosen = certs.find((c) => c.thumbprint === thumb);
if (!chosen) {
  console.log(`\n✗ Chứng thư ghim trong config.json (${thumb}) KHÔNG có trên máy lúc này.`);
  console.log('  -> Cắm đúng token, hoặc sửa lại certThumbprint trong config.json.');
  process.exit(1);
}

console.log(`\nSẽ ký thử bằng: ${chosen.subjectName}`);
console.log('>>> SafeNet sẽ hiện hộp NHẬP MÃ PIN. Nếu không thấy, kiểm tra thanh tác vụ (taskbar)');
console.log('    xem hộp thoại có bị nấp sau cửa sổ khác không.\n');

try {
  const sig = await signDetachedCms(Buffer.from('KIEM TRA KY SO'), thumb);
  console.log(`\n✓ KÝ THÀNH CÔNG — chữ ký dài ${sig.length} byte.`);
  console.log('  Token và chứng thư hoạt động tốt. Nếu trên web vẫn lỗi thì vấn đề nằm ở');
  console.log('  cách khởi động trợ lý: hãy chạy trợ lý bằng cách BẤM ĐÚP chay-tro-ly.bat.');
} catch (e) {
  const msg = String(e?.message || e);
  console.log('\n✗ KÝ THẤT BẠI:');
  console.log('  ' + msg.split('\n')[0]);
  if (/canceled by the user|cancelled/i.test(msg)) {
    console.log('\n  Nguyên nhân thường gặp:');
    console.log('   1) Bấm Hủy ở hộp nhập PIN, hoặc hộp PIN bị nấp sau cửa sổ khác -> thử lại, nhìn taskbar.');
    console.log('   2) Hộp PIN KHÔNG hiện ra chút nào -> trợ lý đang chạy ở tiến trình không được phép hiện');
    console.log('      hộp thoại. Hãy tắt trợ lý cũ rồi BẤM ĐÚP chay-tro-ly.bat để chạy lại.');
    console.log('   3) Token bị khóa do nhập sai PIN nhiều lần -> mở VGCA Token Manager để kiểm tra.');
  }
  process.exitCode = 1;
}
