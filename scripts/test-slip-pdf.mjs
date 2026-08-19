// Kiểm chứng PDF "Phiếu đề nghị sử dụng xe ô tô công vụ" (bản để KÝ SỐ):
// dựng docDefinition thật -> render bằng pdfmake (PdfPrinter + phông Roboto tự nhúng)
// -> trích xuất chữ để xác nhận PDF hợp lệ và tiếng Việt round-trip đúng.
import { createRequire } from 'module';
import { build } from 'esbuild';
import { ROBOTO_VFS } from '../src/lib/pdfFonts.js';

const require = createRequire(import.meta.url);
const PdfPrinter = require('pdfmake');
const { PDFParse } = require('pdf-parse');

await build({
  entryPoints: ['src/lib/vehicleSlipPdf.js'],
  bundle: true, format: 'cjs', platform: 'node',
  outfile: 'scripts/.vehicleSlipPdf.cjs',
  external: ['pdfmake'],
  logLevel: 'silent',
});
const { buildVehicleSlipDocDefinition, vehicleSlipFileName } = require('./.vehicleSlipPdf.cjs');

const b = (n) => Buffer.from(ROBOTO_VFS[n], 'base64');
const fonts = { Roboto: { normal: b('Roboto-Regular.ttf'), bold: b('Roboto-Medium.ttf'), italics: b('Roboto-Italic.ttf'), bolditalics: b('Roboto-MediumItalic.ttf') } };

const data = {
  recipient: 'Lãnh đạo Văn phòng Đoàn ĐBQH và HĐND tỉnh Thanh Hóa',
  placeDateText: 'Thanh Hoá, ngày 19 tháng 8 năm 2026',
  requesterName: 'Nguyễn Văn A',
  requesterPosition: 'Chuyên viên phòng Công tác HĐND',
  purpose: 'Giám sát chuyên đề việc thực hiện chính sách dân tộc tại xã Quảng Lộc',
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
  approvedAtText: '14:35 ngày 19/08/2026',
  signCode: 'A1B2-C3D4',
  dateISO: '2026-08-20',
};

const printer = new PdfPrinter(fonts);
const doc = printer.createPdfKitDocument(buildVehicleSlipDocDefinition(data));
const chunks = [];
doc.on('data', (c) => chunks.push(c));
const done = new Promise((res) => doc.on('end', res));
doc.end();
await done;
const buf = Buffer.concat(chunks);

const parsed = await new PDFParse({ data: new Uint8Array(buf) }).getText();
const txt = (parsed.text || '').normalize('NFC').replace(/\s+/g, ' ');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name); } };

console.log('PDF phiếu điều xe (bản để ký số):');
ok('PDF hợp lệ (%PDF header, > 3KB)', buf.slice(0, 5).toString() === '%PDF-' && buf.length > 3000);
ok('tiêu đề phiếu (tiếng Việt round-trip)', txt.includes('ĐỀ NGHỊ SỬ DỤNG XE Ô TÔ CÔNG VỤ'));
ok('quốc hiệu + tiêu ngữ', txt.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM') && txt.includes('Độc lập - Tự do - Hạnh phúc'));
ok('người báo xe + chức vụ', txt.includes('Nguyễn Văn A') && txt.includes('Chuyên viên phòng Công tác HĐND'));
ok('nội dung chuyến', txt.includes('chính sách dân tộc tại xã Quảng Lộc'));
ok('thời gian / số người / nơi xuất phát', txt.includes('Sáng, ngày 20/08/2026') && txt.includes('Số người: 5') && txt.includes('Trụ sở Đoàn ĐBQH và HĐND tỉnh'));
ok('ý kiến Phòng HC-TC-QT + biển số + lái xe', txt.includes('HÀNH CHÍNH, TỔ CHỨC, QUẢN TRỊ') && txt.includes('36A-1234') && txt.includes('Lê Văn B'));
ok('ô ký Phòng HC-TC-QT', txt.includes('KT. TRƯỞNG PHÒNG') && txt.includes('Ngô Ngọc Quyến'));
ok('ý kiến + ô ký Lãnh đạo Văn phòng', txt.includes('Đồng ý bố trí xe theo đề nghị.') && txt.includes('KT. CHÁNH VĂN PHÒNG') && txt.includes('Hà Ngọc Sơn'));
ok('dòng xác thực phê duyệt điện tử', txt.includes('A1B2-C3D4'));
ok('không lẫn ký tự lỗi phông', !txt.includes('�'));
ok('tên tệp không dấu, có mã xác thực', vehicleSlipFileName(data) === 'Phieu-dieu-xe-20260820-A1B2-C3D4.pdf');

console.log(`\n${pass}/${pass + fail} đạt`);
process.exit(fail ? 1 : 0);
