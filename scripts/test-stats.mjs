// Kiểm chứng THỐNG KÊ: kỳ báo cáo, phân loại hoạt động, cách đếm sự kiện / lượt / buổi,
// phạm vi + trạng thái, cảnh báo, điều xe, và XUẤT THẬT ra PDF (pdfmake + pdf-parse),
// Excel (xlsx đọc lại) và Word (docx -> đọc document.xml). npm run test:stats
import { createRequire } from 'module';
import { build } from 'esbuild';
import { ROBOTO_VFS } from '../src/lib/pdfFonts.js';
const require = createRequire(import.meta.url);

await build({
  entryPoints: ['src/lib/statsExport.js'],
  bundle: true, format: 'cjs', platform: 'node',
  outfile: 'scripts/.stats.cjs',
  external: ['pdfmake', 'docx', 'file-saver', 'xlsx'],
  logLevel: 'silent',
});
await build({
  entryPoints: ['src/lib/stats.js'],
  bundle: true, format: 'cjs', platform: 'node',
  outfile: 'scripts/.stats-core.cjs',
  logLevel: 'silent',
});
const S = require('./.stats-core.cjs');
const X = require('./.stats.cjs');

let pass = true;
const must = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if (!cond) pass = false; };
const eq = (a, b, msg) => must(a === b, `${msg} (được ${JSON.stringify(a)}, cần ${JSON.stringify(b)})`);

// ---------- Kỳ báo cáo ----------
const q3 = S.periodRange('quarter', new Date(2026, 7, 15));
eq(`${q3.from}..${q3.to}`, '2026-07-01..2026-09-30', 'Quý III/2026 đúng khoảng');
eq(q3.label, 'Quý III năm 2026', 'Nhãn quý số La Mã');
const wk = S.periodRange('week', new Date(2025, 11, 30));
eq(`${wk.from} ${wk.label}`, '2025-12-29 Tuần 1 năm 2026', 'Tuần vắt năm dùng năm ISO');
eq(S.periodRange('week', new Date(2026, 9, 10)).from, '2026-10-12', 'Thứ Bảy thuộc tuần làm việc kế tiếp');
eq(S.periodRange('half', new Date(2026, 8, 1)).label, '6 tháng cuối năm 2026', '6 tháng cuối năm');
eq(S.periodRange('nine', new Date(2026, 1, 1)).to, '2026-09-30', '9 tháng đến 30/9');
eq(S.periodRange('month', new Date(2028, 1, 10)).to, '2028-02-29', 'Tháng 2 năm nhuận');
eq(S.periodRange('custom', new Date(), { from: '2026-03-10', to: '2026-03-01' }).from, '2026-03-01', 'Khoảng tùy chọn đảo ngược tự sửa');
eq(S.comparisonRange('quarter', new Date(2026, 7, 15), q3, 'prev').from, '2026-04-01', 'Kỳ liền trước của quý = quý II');
eq(S.comparisonRange('quarter', new Date(2026, 7, 15), q3, 'yoy').from, '2025-07-01', 'Cùng kỳ năm trước');
const cus = S.periodRange('custom', new Date(), { from: '2026-03-11', to: '2026-03-20' });
const cusPrev = S.comparisonRange('custom', new Date(), cus, 'prev');
eq(`${cusPrev.from}..${cusPrev.to}`, '2026-03-01..2026-03-10', 'Tùy chọn: kỳ trước cùng độ dài');
eq(S.comparisonRange('nine', new Date(2026, 4, 1), S.periodRange('nine', new Date(2026, 4, 1)), 'prev').kind, 'Cùng kỳ năm trước', '9 tháng luôn so cùng kỳ');
eq(S.comparisonRange('month', new Date(), q3, 'none'), null, 'Không so sánh');

// ---------- Phân loại ----------
const cls = (content, at_office = false) => S.classifyActivity({ content, at_office });
eq(cls('Phối hợp tổng hợp báo cáo'), 'khac', '"phối hợp" KHÔNG bị nhận là "họp"');
eq(cls('Họp Thường trực HĐND tỉnh'), 'hoi_nghi', 'Họp -> Hội nghị, cuộc họp');
eq(cls('Hội nghị giám sát chuyên đề'), 'giam_sat', 'Ưu tiên Giám sát hơn Hội nghị');
eq(cls('Họp thẩm tra nội dung trình kỳ họp'), 'tham_tra', 'Ưu tiên Thẩm tra hơn Kỳ họp');
eq(cls('Dự Lễ khánh thành cầu'), 'le_su_kien', 'Dự lễ');
eq(cls('Tiếp xúc cử tri trước kỳ họp'), 'tiep_xuc_cu_tri', 'Tiếp xúc cử tri');
eq(cls('Bất kỳ', true), 'tai_co_quan', 'Cờ "Làm việc tại cơ quan"');
eq(cls('Trao đổi lễ tân'), 'khac', '"lễ tân" không phải "lễ"... ');

// ---------- Dữ liệu mẫu ----------
const bans = [{ id: 'b1', name: 'Ban Pháp chế', sort_order: 2 }, { id: 'b2', name: 'Ban Văn hóa - Xã hội', sort_order: 3 }];
const leaders = [
  { id: 'lam', full_name: 'Lê Tiến Lam', position: 'PCT TT HĐND tỉnh', leader_type: 'pct', sort_order: 1, active: true },
  { id: 'hai', full_name: 'Nguyễn Quang Hải', position: 'PCT HĐND tỉnh', leader_type: 'pct', sort_order: 2, active: true },
  { id: 'hoa', full_name: 'Lương Thị Hoa', position: 'Phó Trưởng Đoàn', leader_type: 'doan', sort_order: 3, active: true },
  { id: 'hao', full_name: 'Ngô Thị Hồng Hảo', position: 'Trưởng ban', leader_type: 'ban', ban_id: 'b2', sort_order: 6, active: true },
  { id: 'long', full_name: 'Trần Mạnh Long', position: 'Trưởng ban', leader_type: 'ban', ban_id: 'b1', sort_order: 8, active: true },
  { id: 'vp', full_name: 'Hà Ngọc Sơn', position: 'PCVP', leader_type: 'vanphong', sort_order: 20, active: true },
];
const vehicles = [
  { id: 'v1', plate: '36A-111.11', driver_name: 'Lái xe A', vehicle_type: 'dung_chung', active: true },
  { id: 'v2', plate: '36A-222.22', driver_name: 'Lái xe B', vehicle_type: 'rieng', active: true },
];
const profiles = [
  { id: 'u1', full_name: 'Cán bộ Tổng hợp', role: 'cb_tonghop' },
  { id: 'u2', full_name: 'Nguyễn Hồng Phong', position: 'Chủ tịch HĐND tỉnh', role: 'pct' },
];
const base = { status: 'da_duyet', created_by: 'u1' };
const entries = [
  ...['lam', 'long', 'hao'].map((l, i) => ({ ...base, id: 'g1' + i, group_id: 'G1', leader_id: l, date: '2026-07-06', session: 'sang', content: 'Hội nghị giám sát việc thực hiện chính sách', location: 'UBND xã Biện Thượng', created_at: '2026-07-02T09:00:00+07:00' })),
  { ...base, id: 'e2', leader_id: 'hai', date: '2026-07-07', session: 'ca_ngay', content: 'Khảo sát tình hình giáo dục', location: 'Phường Hạc Thành', created_at: '2026-07-07T07:00:00+07:00' },
  { ...base, id: 'e3', leader_id: 'hai', date: '2026-07-07', session: 'sang', content: 'Dự lễ khánh thành nhà văn hóa', location: 'xã Biện Thượng', status: 'cho_duyet', created_at: '2026-07-08T10:00:00+07:00' },
  { ...base, id: 'e4', leader_id: 'long', date: '2026-07-08', session: 'chieu', content: 'Phối hợp tổng hợp báo cáo', location: 'Trụ sở Đoàn ĐBQH và HĐND tỉnh' },
  { ...base, id: 'e5', leader_id: 'hao', date: '2026-07-11', session: 'sang', content: 'Tiếp xúc cử tri trước kỳ họp', location: 'Xã Biện Thượng', status: 'da_dieu_chinh', reviewed_by: 'u2', created_at: '2026-07-03T08:00:00+07:00', reviewed_at: '2026-07-03T12:00:00+07:00' },
  { ...base, id: 'e6', leader_id: 'hoa', date: '2026-08-03', session: 'sang', content: 'Tiếp công dân định kỳ', location: 'Trụ sở Tiếp công dân tỉnh', status: 'tu_choi', reviewed_by: 'u2', created_at: '2026-07-30T08:00:00+07:00', reviewed_at: '2026-07-30T10:00:00+07:00' },
  { ...base, id: 'e7', leader_id: 'lam', date: '2026-09-21', session: 'ca_ngay', content: 'Làm việc tại cơ quan', at_office: true },
  { ...base, id: 'e8', leader_id: 'vp', date: '2026-09-10', session: 'gio', start_time: '08:00:00', end_time: '16:00:00', content: 'Làm việc với UBND xã Quảng Phú', location: 'xã Quảng Phú', vehicle_requested: true, vehicle_status: 'da_phan_xe', vehicle_ids: ['v1'], rider_count: 4 },
  { ...base, id: 'e9', leader_id: 'long', date: '2026-09-16', session: 'sang', content: 'Họp thẩm tra dự thảo nghị quyết', location: 'Phòng họp số 2', vehicle_requested: true, vehicle_status: 'de_xuat', vehicle_ids: [], rider_count: 2 },
  { ...base, id: 'e10', leader_id: 'hai', date: '2026-07-20', session: 'sang', content: 'Kiểm tra công trình trọng điểm', location: 'xã Nga Sơn', vehicle_requested: true, vehicle_status: 'da_duyet', vehicle_ids: ['v2'], rider_count: 3 },
  { ...base, id: 'e11', leader_id: 'hoa', date: '2026-08-05', session: 'chieu', content: 'Dự Đại hội Hội Nông dân', location: null },
  { ...base, id: 'out', leader_id: 'lam', date: '2026-10-01', session: 'sang', content: 'Ngoài kỳ', location: 'xã X' },
];
const prevEntries = [
  { ...base, id: 'p1', leader_id: 'lam', date: '2026-04-10', session: 'sang', content: 'Giám sát', location: 'xã A' },
  { ...base, id: 'p2', leader_id: 'hai', date: '2026-05-10', session: 'sang', content: 'Họp', location: 'xã B' },
];
const anchor = new Date(2026, 7, 15);
const prevRange = S.comparisonRange('quarter', anchor, q3, 'prev');
const common = { leaders, bans, vehicles, profiles, range: q3, today: '2026-09-15', now: new Date(2026, 8, 15, 9, 30), author: 'Người Lập Biểu' };
const R = S.buildStatsReport({ ...common, entries, compareEntries: prevEntries, compareRange: prevRange, perms: { process: true, vehicle: true, privateVehicles: false } });
const kpi = Object.fromEntries(R.kpis.map((k) => [k.key, k]));
const sec = Object.fromEntries(R.sections.map((s) => [s.key, s]));

eq(kpi.events.value, 10, 'Sự kiện: nhóm 3 lãnh đạo tính 1; bỏ lịch từ chối + ngoài kỳ');
eq(kpi.occurrences.value, 12, 'Lượt lãnh đạo');
eq(kpi.halfDays.value, 14, 'Số buổi (gộp các hoạt động cùng buổi của một người)');
eq(kpi.atOffice.value, 2, 'Tại cơ quan = cờ at_office + địa điểm trụ sở');
eq(kpi.outside.value, 8, 'Ngoài cơ quan');
eq(kpi.communes.value, 4, 'Xã/phường khác nhau (gom "UBND xã Biện Thượng" = "Xã Biện Thượng")');
eq(kpi.weekend.value, 1, 'Hoạt động cuối tuần');
eq(kpi.pending.value, 1, 'Chờ duyệt');
eq(kpi.rejected.value, 1, 'Từ chối đếm riêng, không tính vào tổng');
eq(kpi.upcoming.value, 2, 'Chưa diễn ra (sau ngày lập báo cáo)');
eq(kpi.events.prev, 2, 'Kỳ so sánh');
eq(kpi.events.delta, 8, 'Tăng/giảm');
eq(kpi.events.deltaPct, 4, 'Tỉ lệ thay đổi');
eq(sec.summary.columns.length, 6, 'Bảng tổng hợp có cột so sánh');

const catRow = (k) => sec.categories.rows.find((r) => r.label === S.CATEGORY_LABEL[k]).events;
eq(catRow('le_su_kien'), 2, 'Loại: Dự lễ, đại hội');
eq(catRow('lam_viec'), 2, 'Loại: Làm việc với cơ quan, địa phương');
eq(sec.categories.rows.reduce((n, r) => n + r.events, 0), 10, 'Tổng các loại = tổng sự kiện');

const unitRow = (label) => sec.units.rows.find((r) => r.label === label);
eq(unitRow('Lãnh đạo TTr HĐND tỉnh').events, 5, 'Đơn vị TTr HĐND');
eq(unitRow('Ban Pháp chế').events, 3, 'Đơn vị Ban Pháp chế');
eq(sec.units.total.events, 10, 'Tổng đơn vị không trùng lặp');
must(sec.units.rows.findIndex((r) => r.label === 'Lãnh đạo Văn phòng') === sec.units.rows.length - 1, 'Thứ tự đơn vị: Văn phòng cuối');

const lr = Object.fromEntries(sec.leaders.rows.map((r) => [r.name, r]));
eq(lr['Nguyễn Quang Hải'].halfDays, 3, 'Buổi của PCT Hải (ca_ngay + sáng cùng ngày = 2, +1)');
eq(lr['Nguyễn Quang Hải'].events, 3, 'Hoạt động của PCT Hải');
eq(sec.leaders.total.events, 12, 'Tổng cột hoạt động = tổng lượt');

eq(sec.communes.rows[0].label, 'Xã Biện Thượng', 'Địa bàn nhiều nhất + viết hoa tên');
eq(sec.communes.rows[0].events, 3, 'Số sự kiện tại xã Biện Thượng');
eq(sec.timeline.rows.length, 3, 'Quý -> diễn biến theo 3 tháng');
eq(sec.weekday.rows.find((r) => r.label === 'Thứ Bảy').events, 1, 'Phân bố theo thứ');

// Quy trình
eq(sec.status.total.events, 11, 'Bảng trạng thái tính cả lịch từ chối');
const rv = sec.reviewers.rows.find((r) => r.name === 'Nguyễn Hồng Phong');
eq(`${rv.da_dieu_chinh}/${rv.tu_choi}`, '1/1', 'Người duyệt: điều chỉnh / từ chối');
eq(rv.avgHours, 3, 'Thời gian xử lý bình quân (giờ)');
const cr = sec.creators.rows.find((r) => r.name === 'Cán bộ Tổng hợp');
eq(`${cr.before}/${cr.during}/${cr.after}`, '3/1/1', 'Đúng hạn / phát sinh / nhập bù');

// Điều xe
eq(sec.vehicleStatus.total.trips, 3, 'Số chuyến có đề nghị xe');
must(!sec.vehicleUsage.rows.some((r) => r.plate === '36A-222.22'), 'Ẩn xe riêng khi không có quyền');
eq(sec.vehicleUsage.rows.find((r) => r.plate === '36A-111.11').halfDays, 2, 'Xe chung: lịch 8h-16h = 2 buổi');
const R2 = S.buildStatsReport({ ...common, entries, perms: { vehicle: true, privateVehicles: true } });
must(R2.sections.find((s) => s.key === 'vehicleUsage').rows.some((r) => r.plate === '36A-222.22'), 'Quản trị thấy xe riêng');
must(!R2.sections.some((s) => s.key === 'creators'), 'Không có quyền quy trình -> không có bảng người nhập');
const R3 = S.buildStatsReport({ ...common, entries, perms: {} });
must(!R3.sections.some((s) => s.group === 'vehicles') && !R3.kpis.some((k) => k.key === 'trips'), 'Không có quyền xe -> không lộ số liệu xe');

// Cảnh báo
const iss = sec.issues.rows.map((r) => r.issue);
must(iss.includes('Đã qua ngày diễn ra nhưng lịch vẫn chờ duyệt'), 'Cảnh báo: chờ duyệt quá hạn');
must(iss.includes('Chưa ghi địa điểm'), 'Cảnh báo: thiếu địa điểm');
must(iss.includes('Một lãnh đạo có 2 hoạt động trùng thời gian'), 'Cảnh báo: trùng thời gian');
must(iss.includes('Chuyến đã qua ngày nhưng phiếu xe chưa được duyệt'), 'Cảnh báo: phiếu xe quá hạn');
must(iss.includes('Phiếu xe đã duyệt nhưng chưa có bản PDF ký số'), 'Cảnh báo: chưa ký số');
eq(sec.issues.rows[0].level, 'Khẩn', 'Cảnh báo khẩn (chuyến ngày mai chưa phân xe) lên đầu');

// Phạm vi + trạng thái
const Rpct = S.buildStatsReport({ ...common, entries, unitKeys: ['grp:pct'], perms: {} });
eq(Rpct.kpis.find((k) => k.key === 'events').value, 5, 'Lọc đơn vị TTr HĐND');
const Rapp = S.buildStatsReport({ ...common, entries, statusMode: 'approved', perms: {} });
eq(Rapp.kpis.find((k) => k.key === 'events').value, 9, 'Chỉ lịch đã duyệt');
const Rall = S.buildStatsReport({ ...common, entries, statusMode: 'all', perms: {} });
eq(Rall.kpis.find((k) => k.key === 'events').value, 11, 'Kể cả lịch từ chối');
const Rlead = S.buildStatsReport({ ...common, entries, leaderId: 'long', perms: {} });
eq(Rlead.sections.find((s) => s.key === 'leaders').rows.length, 1, 'Lọc một lãnh đạo');
const Rempty = S.buildStatsReport({ ...common, entries: [], perms: { process: true, vehicle: true } });
eq(Rempty.kpis[0].value, 0, 'Kỳ không có dữ liệu vẫn dựng được báo cáo');

// Định dạng
eq(S.formatCell(1234, 'int'), '1.234', 'Số kiểu Việt Nam');
eq(S.formatCell(0.125, 'pct'), '12,5%', 'Phần trăm');
eq(S.formatCell(-3, 'delta'), '−3', 'Giảm');
eq(S.formatCell(null, 'pct'), '–', 'Không xác định');
eq(X.placeDateLine(new Date(2026, 1, 5)), 'Thanh Hóa, ngày 05 tháng 02 năm 2026', 'Ngày tháng theo Nghị định 30');
eq(R.meta.fileBase, 'Thong-ke-lich-cong-tac_quy-iii-nam-2026', 'Tên tệp không dấu');

// ---------- XUẤT EXCEL ----------
const XLSX = require('xlsx');
const wb = X.buildStatsWorkbook(R, XLSX);
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
const wb2 = XLSX.read(buf, { type: 'buffer', cellNF: true });
must(wb2.SheetNames.includes('Theo đơn vị') && wb2.SheetNames.includes('Danh sách chi tiết'), `Excel đủ sheet (${wb2.SheetNames.length} sheet)`);
const wsU = wb2.Sheets['Theo đơn vị'];
eq(wsU.B7?.v, 'Lãnh đạo TTr HĐND tỉnh', 'Excel: dòng dữ liệu đầu tiên');
eq(wsU.C7?.v, 5, 'Excel: ô số là SỐ thật');
eq(wsU.D7?.z, '0.0%', 'Excel: định dạng phần trăm');
const wsD = wb2.Sheets['Danh sách chi tiết'];
eq(wsD.B7?.t, 'n', 'Excel: cột Ngày là ngày thật (sê-ri)');
must(!!wsU['!autofilter'], 'Excel: có bộ lọc tiêu đề');

// ---------- XUẤT WORD ----------
const docx = require('docx');
const JSZip = require('jszip');
const docBuf = await docx.Packer.toBuffer(X.buildStatsDocx(R, docx, { sectionKeys: ['summary', 'units', 'categories'] }));
const zip = await JSZip.loadAsync(docBuf);
const xml = (await zip.file('word/document.xml').async('string')).replace(/<[^>]+>/g, '');
must(xml.includes('BÁO CÁO THỐNG KÊ') && xml.includes('Quý III năm 2026'), 'Word: tiêu đề + kỳ báo cáo');
must(xml.includes('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM') && xml.includes('Thanh Hóa, ngày 15 tháng 9 năm 2026'), 'Word: quốc hiệu, địa danh ngày tháng');
must(xml.includes('II. KẾT QUẢ TỔNG HỢP') && xml.includes('IV. THỐNG KÊ THEO LOẠI HOẠT ĐỘNG'), 'Word: đánh số mục La Mã theo bảng đã chọn');
must(!xml.includes('DANH SÁCH CHI TIẾT'), 'Word: bỏ bảng không chọn');

// ---------- XUẤT PDF ----------
const PdfPrinter = require('pdfmake');
const { PDFParse } = require('pdf-parse');
const b = (n) => Buffer.from(ROBOTO_VFS[n], 'base64');
const printer = new PdfPrinter({ Roboto: { normal: b('Roboto-Regular.ttf'), bold: b('Roboto-Medium.ttf'), italics: b('Roboto-Italic.ttf'), bolditalics: b('Roboto-MediumItalic.ttf') } });
const pdfBuf = await new Promise((resolve) => {
  const doc = printer.createPdfKitDocument(X.buildStatsPdfDocDefinition(R));
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.end();
});
must(pdfBuf.slice(0, 4).toString() === '%PDF', 'PDF hợp lệ');
const parsed = await new PDFParse({ data: new Uint8Array(pdfBuf) }).getText();
const text = parsed.text.normalize('NFC');
must(text.includes('BÁO CÁO THỐNG KÊ') && text.includes('Quý III năm 2026'), 'PDF: tiêu đề + kỳ (tiếng Việt round-trip)');
must(text.includes('Xã Biện Thượng'), 'PDF: bảng địa bàn');
must(/Trang 1\/\d+/.test(text), 'PDF: số trang "Trang x/y"');
must(text.includes('NGƯỜI LẬP BIỂU') && text.includes('Người Lập Biểu'), 'PDF: khối chữ ký người lập');
console.log(`  (PDF ${parsed.total} trang, ${Math.round(pdfBuf.length / 1024)} KB)`);

// Muốn mở xem tệp mẫu: STATS_DUMP=<thư mục> npm run test:stats
if (process.env.STATS_DUMP) {
  const fs = require('fs'), path = require('path');
  fs.writeFileSync(path.join(process.env.STATS_DUMP, 'bao-cao-mau.pdf'), pdfBuf);
  fs.writeFileSync(path.join(process.env.STATS_DUMP, 'bao-cao-mau.xlsx'), buf);
  fs.writeFileSync(path.join(process.env.STATS_DUMP, 'bao-cao-mau.docx'), docBuf);
}

console.log(pass ? '\nTẤT CẢ ĐẠT' : '\nCÓ LỖI');
process.exit(pass ? 0 : 1);
