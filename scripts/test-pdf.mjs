// Kiểm chứng xuất PDF: dựng docDefinition thật (buildWeekPdfDocDefinition) -> render
// bằng pdfmake (PdfPrinter, phông Roboto kèm theo) -> trích xuất chữ để xác nhận:
//  (1) tiếng Việt round-trip đúng, (2) thêm "Đồng chí" + sắp ưu tiên Họ tên,
//  (3) nội dung chờ duyệt có "(chờ duyệt)", (4) "Làm việc tại cơ quan", (5) PDF hợp lệ.
import { createRequire } from 'module';
import { build } from 'esbuild';
import { ROBOTO_VFS } from '../src/lib/pdfFonts.js';
const require = createRequire(import.meta.url);
const PdfPrinter = require('pdfmake');
const { PDFParse } = require('pdf-parse');

// Bundle exporters.js (Vite-style import không đuôi) -> CJS để require ở node
await build({
  entryPoints: ['src/lib/exporters.js'],
  bundle: true, format: 'cjs', platform: 'node',
  outfile: 'scripts/.exporters.cjs',
  external: ['pdfmake', 'docx', 'file-saver'],
  logLevel: 'silent',
});
const { buildWeekPdfDocDefinition } = require('./.exporters.cjs');

// Phông cho PdfPrinter LẤY TỪ chính module tự nhúng (giống hệt trình duyệt dùng)
const b = (n) => Buffer.from(ROBOTO_VFS[n], 'base64');
const fonts = { Roboto: { normal: b('Roboto-Regular.ttf'), bold: b('Roboto-Medium.ttf'), italics: b('Roboto-Italic.ttf'), bolditalics: b('Roboto-MediumItalic.ttf') } };

// ---- Dữ liệu mẫu (tuần chứa 15/06/2026) ----
const anchor = new Date(2026, 5, 15);
const leaders = [
  { id: 'lam', full_name: 'Lê Tiến Lam', position: 'PCT Thường trực HĐND tỉnh', leader_type: 'pct', sort_order: 1, active: true },
  { id: 'hai', full_name: 'Nguyễn Quang Hải', position: 'PCT HĐND tỉnh', leader_type: 'pct', sort_order: 2, active: true },
  { id: 'hao', full_name: 'Ngô Thị Hồng Hảo', position: 'Trưởng ban VH-XH', leader_type: 'ban', sort_order: 6, active: true },
  { id: 'long', full_name: 'Trần Mạnh Long', position: 'Trưởng ban Pháp chế', leader_type: 'ban', sort_order: 8, active: true },
];
const groups = [];
const entries = [
  { id: 'e1', leader_id: 'hao', date: '2026-06-15', session: 'sang', content: 'Dự gặp mặt đại biểu dự Đại hội đại biểu Phụ nữ toàn quốc lần thứ XIV nhiệm kỳ 2026 – 2031', location: 'Hội trường tầng 8, Hội liên hiệp phụ nữ tỉnh Thanh Hoá', participants: null, status: 'cho_duyet' },
  // sự kiện 2 người, NHẬP sai thứ tự (Long trước Lam) -> phải sắp Lam (STT 1) lên trước + thêm "Đồng chí"
  { id: 'e2a', group_id: 'g2', leader_id: 'long', date: '2026-06-17', session: 'sang', content: 'Hội nghị Ban Thường vụ Tỉnh ủy', location: 'Trụ sở Tỉnh ủy', participants: 'Trần Mạnh Long, Trưởng ban Pháp chế; Lê Tiến Lam, PCT Thường trực HĐND tỉnh', status: 'da_duyet' },
  { id: 'e2b', group_id: 'g2', leader_id: 'lam', date: '2026-06-17', session: 'sang', content: 'Hội nghị Ban Thường vụ Tỉnh ủy', location: 'Trụ sở Tỉnh ủy', participants: 'Trần Mạnh Long, Trưởng ban Pháp chế; Lê Tiến Lam, PCT Thường trực HĐND tỉnh', status: 'da_duyet' },
  { id: 'e3', leader_id: 'lam', date: '2026-06-18', session: 'ca_ngay', content: 'Rà soát, hoàn thiện báo cáo giám sát', location: null, participants: null, at_office: true, status: 'da_duyet' },
  { id: 'e4', leader_id: 'hai', date: '2026-06-16', session: 'chieu', content: 'Họp thẩm tra nội dung kỳ họp', location: 'Phòng họp tầng 3', participants: 'Nguyễn Quang Hải', status: 'da_dieu_chinh', review_note: 'Đổi sang 14h00' },
];

const docDef = buildWeekPdfDocDefinition({ anchor, entries, leaders, groups });

const printer = new PdfPrinter(fonts);
const pdfDoc = printer.createPdfKitDocument(docDef);
const chunks = [];
pdfDoc.on('data', (c) => chunks.push(c));
pdfDoc.on('end', async () => {
  const buf = Buffer.concat(chunks);
  let pass = true;
  const must = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) pass = false; };

  must(buf.slice(0, 5).toString() === '%PDF-', 'File là PDF hợp lệ (header %PDF-)');
  must(buf.length > 3000, `Kích thước hợp lý (${buf.length} bytes)`);

  const parser = new PDFParse({ data: buf });
  const data = await parser.getText();
  const text = data.text.replace(/\s+/g, ' ');
  must((data.total || data.numpages || 1) >= 1, `Số trang = ${data.total || data.numpages || 1}`);
  must(text.includes('LỊCH CÔNG TÁC TUẦN'), 'Tiêu đề tiếng Việt round-trip đúng');
  must(text.includes('Phụ nữ toàn quốc'), 'Nội dung tiếng Việt dài hiển thị đúng (dấu)');
  must(text.includes('(chờ duyệt)'), 'Lịch chờ duyệt có chữ "(chờ duyệt)"');
  must(text.includes('Làm việc tại cơ quan'), 'at_office hiển thị "Làm việc tại cơ quan"');
  must(text.includes('Đồng chí Lê Tiến Lam'), 'Thêm "Đồng chí" trước tên cán bộ');
  must(text.includes('Đồng chí Trần Mạnh Long'), 'Thêm "Đồng chí" cho tên thứ hai');
  const iLam = text.indexOf('Lê Tiến Lam');
  const iLong = text.indexOf('Trần Mạnh Long');
  must(iLam > -1 && iLong > -1 && iLam < iLong, `Sắp ƯU TIÊN: Lê Tiến Lam (STT1) trước Trần Mạnh Long (vt ${iLam} < ${iLong})`);
  // không còn dấu tổ hợp lạ (tofu/khoảng trắng chèn giữa dấu) — kiểm chứng mềm
  must(!/[̀-ͯ]/.test(data.text), 'Không còn dấu tổ hợp rời (đã NFC)');

  console.log('\nĐoạn trích văn bản PDF:\n' + data.text.split('\n').filter(Boolean).slice(0, 12).join('\n'));
  console.log('\nKẾT QUẢ:', pass ? 'ĐẠT TẤT CẢ' : 'CÓ LỖI');
  process.exit(pass ? 0 : 1);
});
pdfDoc.end();
