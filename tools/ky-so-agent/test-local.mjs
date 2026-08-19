// Kiểm thử TRỢ LÝ KÝ SỐ ngay trên máy phát triển — KHÔNG cần USB token.
// Cách làm: tạo một chứng thư TỰ KÝ tạm trong kho CurrentUser\My, ký thử phiếu điều xe
// thật (dựng bằng pdfmake của dự án), kiểm tra PDF đã ký rồi XÓA chứng thư tạm đi.
// Nhờ vậy toàn bộ đường ống (PDF -> ô chữ ký -> PKCS#7 -> nhúng lại) được xác nhận;
// trên máy có token chỉ khác ở chỗ chọn chứng thư nào và phải nhập mã PIN.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractSignature } from '@signpdf/utils';
import { signPdfWithToken } from './pdfsign.mjs';
import { listCertificates } from './winsign.mjs';
import { buildVehicleSlipDocDefinition } from '../../src/lib/vehicleSlipPdf.js';
import { ROBOTO_VFS } from '../../src/lib/pdfFonts.js';

const require = createRequire(import.meta.url);
const PdfPrinter = require('pdfmake');

const PS = 'powershell.exe';
const ps = (script) => execFileSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], { encoding: 'utf8' }).trim();

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra); }
};

// ---- 1. Dựng phiếu PDF thật ----
const b = (n) => Buffer.from(ROBOTO_VFS[n], 'base64');
const printer = new PdfPrinter({ Roboto: { normal: b('Roboto-Regular.ttf'), bold: b('Roboto-Medium.ttf'), italics: b('Roboto-Italic.ttf'), bolditalics: b('Roboto-MediumItalic.ttf') } });
const doc = printer.createPdfKitDocument(buildVehicleSlipDocDefinition({
  recipient: 'Lãnh đạo Văn phòng Đoàn ĐBQH và HĐND tỉnh Thanh Hóa',
  placeDateText: 'Thanh Hoá, ngày 19 tháng 8 năm 2026',
  requesterName: 'Lê Tiến Lam',
  requesterPosition: 'Phó Chủ tịch Thường trực HĐND tỉnh',
  purpose: 'Giám sát chuyên đề tại xã Quảng Lộc',
  timeText: 'Sáng, ngày 20/08/2026',
  riderText: '5',
  departure: 'Trụ sở Đoàn ĐBQH và HĐND tỉnh',
  plateText: '36A-1234',
  driverText: 'Lê Văn B - 0912345678',
  vpSigner: 'Hà Ngọc Sơn',
  signCode: 'A1B2-C3D4',
  dateISO: '2026-08-20',
}));
const chunks = [];
doc.on('data', (c) => chunks.push(c));
await new Promise((r) => { doc.on('end', r); doc.end(); });
const pdf = Buffer.concat(chunks);
console.log('Trợ lý ký số — kiểm thử cục bộ:');
ok('dựng được phiếu PDF từ pdfmake', pdf.slice(0, 5).toString() === '%PDF-' && pdf.length > 3000);

// ---- 2. Tạo chứng thư tự ký tạm ----
const SUBJECT = 'CN=KIEM THU KY SO - XOA SAU KHI TEST';
let thumb = '';
try {
  thumb = ps(`$c = New-SelfSignedCertificate -Subject '${SUBJECT}' -CertStoreLocation Cert:\\CurrentUser\\My -KeyUsage DigitalSignature,NonRepudiation -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays(2); $c.Thumbprint`);
  ok('tạo được chứng thư tự ký tạm', /^[0-9A-F]{40}$/.test(thumb), thumb);

  // ---- 3. Trợ lý thấy chứng thư trong kho ----
  const certs = await listCertificates();
  const mine = certs.find((c) => c.thumbprint === thumb);
  ok('liệt kê được chứng thư có khóa riêng', !!mine);
  ok('nhận diện chứng thư ký được tài liệu (Key Usage)', !!mine?.canSignDocument, mine?.keyUsage);

  // ---- 4. Ký PDF ----
  const signed = await signPdfWithToken(pdf, thumb, { reason: 'Phê duyệt phiếu điều xe', name: 'Hà Ngọc Sơn' });
  ok('PDF đã ký vẫn là PDF hợp lệ', signed.slice(0, 5).toString() === '%PDF-' && signed.length > pdf.length);
  const s = signed.toString('latin1');
  ok('có trường chữ ký /Sig + /adbe.pkcs7.detached', s.includes('/Type /Sig') || s.includes('/Type/Sig'));
  ok('ByteRange đã được tính thật (không còn chỗ trống)', /\/ByteRange\s*\[\s*0\s+\d+\s+\d+\s+\d+\s*\]/.test(s));

  // ---- 5. Bóc chữ ký ra và kiểm tra bằng .NET ----
  const { signature, signedData } = extractSignature(signed);
  const dir = os.tmpdir();
  const fContent = path.join(dir, 'kyso-test-content.bin');
  const fSig = path.join(dir, 'kyso-test-sig.der');
  const fOut = path.join(dir, 'kyso-test-verify.json');
  await fs.writeFile(fContent, signedData);
  await fs.writeFile(fSig, Buffer.from(signature, 'latin1'));
  execFileSync(PS, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(import.meta.dirname, 'winsign.ps1'),
    '-Mode', 'verify', '-In', fContent, '-Sig', fSig, '-Out', fOut], { encoding: 'utf8' });
  const v = JSON.parse(await fs.readFile(fOut, 'utf8'));
  ok('chữ ký PKCS#7 hợp lệ trên đúng phần dữ liệu của PDF', v.ok === true);
  ok('là chữ ký tách rời (detached) đúng chuẩn PDF', v.detached === true);
  ok('băm bằng SHA-256', v.digestOid === '2.16.840.1.101.3.4.2.1', v.digestOid);
  ok('chữ ký mang đúng chứng thư người ký', (v.subject || '').includes('KIEM THU KY SO'), v.subject);
  await Promise.all([fs.rm(fContent, { force: true }), fs.rm(fSig, { force: true }), fs.rm(fOut, { force: true })]);

  // Lưu lại để xem thử bằng Adobe Reader nếu cần
  const sample = path.join(import.meta.dirname, 'mau-phieu-da-ky.pdf');
  await fs.writeFile(sample, signed);
  console.log('  (đã lưu bản mẫu để xem thử:', sample, ')');
} finally {
  if (thumb) {
    try { ps(`Remove-Item -Path Cert:\\CurrentUser\\My\\${thumb} -Force`); console.log('  (đã xóa chứng thư tự ký tạm)'); }
    catch (e) { console.log('  ! Chưa xóa được chứng thư tạm:', e.message); }
  }
}

console.log(`\n${pass}/${pass + fail} đạt`);
process.exit(fail ? 1 : 0);
