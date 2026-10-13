// XUẤT BÁO CÁO THỐNG KÊ ra Excel (.xlsx) / PDF / Word (.docx) từ MÔ HÌNH BÁO CÁO
// (lib/stats.buildStatsReport). Các hàm build* là HÀM THUẦN, nhận thư viện qua tham số
// -> test được ở node (scripts/test-stats.mjs). Thư viện xlsx / pdfmake / docx được NẠP
// ĐỘNG khi bấm xuất nên không làm phình bundle chính.
import { formatCell, isNumericType, roman, totalNeedsLabel } from './stats';

const nfc = (s) => (s == null ? '' : String(s)).normalize('NFC');
const pad2 = (n) => String(n).padStart(2, '0');

// Thể thức (Nghị định 30/2020/NĐ-CP): ngày < 10 và tháng 1, 2 ghi thêm số 0 phía trước
export const placeDateLine = (d, place = 'Thanh Hóa') => {
  const m = d.getMonth() + 1;
  return `${place}, ngày ${pad2(d.getDate())} tháng ${m < 3 ? pad2(m) : m} năm ${d.getFullYear()}`;
};

// Tên cơ quan 2 dòng: "VĂN PHÒNG ĐOÀN ĐBQH VÀ HĐND" / "TỈNH THANH HÓA"
const orgLines = (unitName) => {
  const up = nfc(unitName).toLocaleUpperCase('vi');
  const i = up.lastIndexOf(' TỈNH ');
  return i > 0 ? [up.slice(0, i), up.slice(i + 1)] : [up];
};

// Cột in (PDF/Word) — có thể lược bớt cho vừa khổ A4 dọc (section.printColumns)
const printCols = (s) => (s.printColumns ? s.columns.filter((c) => s.printColumns.includes(c.key)) : s.columns);

// Độ rộng cột (pt) trên khổ in: cột số cố định, cột chữ chia đều phần còn lại
const resolveWidths = (cols, totalWidth) => {
  const many = cols.length > 8;
  const fixed = cols.map((c) => c.pdfWidth || (isNumericType(c.type) ? (many ? 34 : 44) : null));
  const used = fixed.reduce((n, w) => n + (w || 0), 0);
  const flex = fixed.filter((w) => w == null).length;
  const each = flex ? Math.max(40, (totalWidth - used) / flex) : 0;
  return fixed.map((w) => (w == null ? each : w));
};

const cellText = (row, c) => nfc(formatCell(row?.[c.key], c.type));

// ======================================================================
// EXCEL
// ======================================================================
// Ngày ISO -> số sê-ri Excel (định dạng dd/mm/yyyy, lọc/sắp xếp được như ngày thật)
const excelSerial = (iso) => {
  const [y, m, d] = (iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
};
const EXCEL_FMT = { pct: '0.0%', delta: '+#,##0;-#,##0;0', deltaPct: '+0.0%;-0.0%;0.0%', date: 'dd/mm/yyyy' };
const safeSheetName = (name, used) => {
  let base = nfc(name).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31).trim() || 'Sheet';
  let n = base, i = 2;
  while (used.has(n)) { const suf = ` (${i++})`; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n);
  return n;
};

/** Dựng workbook (XLSX = module 'xlsx'). Excel luôn có ĐỦ mọi cột của mọi bảng. */
export function buildStatsWorkbook(report, XLSX, { sectionKeys } = {}) {
  const { meta } = report;
  const U = XLSX.utils;
  const wb = U.book_new();
  const used = new Set();
  const headLines = [
    nfc(meta.unitName).toLocaleUpperCase('vi'),
    `${meta.title} — ${meta.subtitle}`.toLocaleUpperCase('vi'),
    `Kỳ báo cáo: ${meta.period.fullLabel}`,
    `Phạm vi: ${meta.scopeLabel}`,
  ];

  // Sheet 1: thông tin chung + ghi chú phương pháp
  const info = [
    [headLines[0]], [headLines[1]], [],
    ['Kỳ báo cáo', meta.period.fullLabel],
    ['Kỳ so sánh', meta.compare ? `${meta.compare.kind}: ${meta.compare.fullLabel}` : 'Không so sánh'],
    ['Phạm vi đơn vị', meta.scopeLabel],
    ['Lịch được tính', meta.statusLabel],
    ['Thời điểm trích xuất', meta.generatedText],
    ['Người lập', meta.author || ''],
    [],
    ['GHI CHÚ PHƯƠNG PHÁP TÍNH'],
    ...meta.notes.map((n, i) => [`${i + 1}.`, n]),
  ].map((r) => r.map(nfc));
  const wsInfo = U.aoa_to_sheet(info);
  wsInfo['!cols'] = [{ wch: 24 }, { wch: 120 }];
  wsInfo['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } }];
  U.book_append_sheet(wb, wsInfo, safeSheetName('Thông tin báo cáo', used));

  const sections = report.sections.filter((s) => !sectionKeys || sectionKeys.includes(s.key));
  for (const s of sections) {
    const cols = s.columns;
    const HDR = 5; // 4 dòng tiêu đề + 1 dòng trống
    const aoa = [
      [headLines[0]],
      [nfc(s.title).toLocaleUpperCase('vi')],
      [`Kỳ báo cáo: ${nfc(meta.period.fullLabel)}`],
      [`Phạm vi: ${nfc(meta.scopeLabel)}`],
      [],
      cols.map((c) => nfc(c.label)),
    ];
    const dataRow = (r) => cols.map((c) => {
      const v = r?.[c.key];
      if (v == null || v === '') return null;
      if (c.type === 'date') return excelSerial(v);
      if (c.type === 'text') return nfc(v);
      return typeof v === 'number' ? v : nfc(v);
    });
    for (const r of s.rows) aoa.push(dataRow(r));
    if (!s.rows.length) aoa.push(['Không có dữ liệu trong kỳ báo cáo']);
    const lastData = aoa.length - 1;
    if (s.total) {
      const t = dataRow(s.total);
      if (t[0] == null && totalNeedsLabel(s)) t[0] = 'Tổng cộng';
      aoa.push(t);
    }
    const notes = [s.description, ...(s.notes || [])].filter(Boolean);
    if (notes.length) { aoa.push([]); notes.forEach((n) => aoa.push([`Ghi chú: ${nfc(n)}`])); }

    const ws = U.aoa_to_sheet(aoa);
    // Định dạng số theo kiểu cột (phần trăm, tăng/giảm, ngày)
    const lastNum = s.total ? lastData + 1 : lastData;
    for (let r = HDR + 1; r <= lastNum; r++) {
      cols.forEach((c, ci) => {
        const cell = ws[U.encode_cell({ r, c: ci })];
        if (!cell || cell.t !== 'n') return;
        if (EXCEL_FMT[c.type]) cell.z = EXCEL_FMT[c.type];
        else if (c.type === 'num' && !Number.isInteger(cell.v)) cell.z = '0.0';
      });
    }
    ws['!cols'] = cols.map((c) => ({ wch: c.xw || (isNumericType(c.type) ? Math.max(10, Math.ceil(nfc(c.label).length * 0.9)) : 24) }));
    const lastCol = Math.max(cols.length - 1, 1);
    ws['!merges'] = [0, 1, 2, 3].map((r) => ({ s: { r, c: 0 }, e: { r, c: lastCol } }));
    if (s.rows.length) ws['!autofilter'] = { ref: U.encode_range({ s: { r: HDR, c: 0 }, e: { r: lastData, c: cols.length - 1 } }) };
    U.book_append_sheet(wb, ws, safeSheetName(s.sheet || s.title, used));
  }
  wb.Props = { Title: `${meta.title} ${meta.period.label}`, Author: meta.author || meta.unitName, CreatedDate: meta.generatedAt };
  return wb;
}

export async function exportStatsXlsx(report, opts = {}) {
  const mod = await import('xlsx');
  const XLSX = mod.utils ? mod : mod.default;
  const wb = buildStatsWorkbook(report, XLSX, opts);
  XLSX.writeFile(wb, `${report.meta.fileBase}.xlsx`, { compression: true });
}

// ======================================================================
// PDF (pdfmake)
// ======================================================================
const PDF_MARGINS = [85, 57, 43, 57]; // trái 3cm, trên 2cm, phải 1,5cm, dưới 2cm (pt)
const PDF_CONTENT_W = 595.28 - PDF_MARGINS[0] - PDF_MARGINS[2];

const pdfTable = (s) => {
  const cols = printCols(s);
  const many = cols.length > 8;
  const fs = many ? 7.5 : 9;
  const widths = resolveWidths(cols, PDF_CONTENT_W - cols.length * 4.5);
  const align = (c) => (isNumericType(c.type) ? 'right' : c.type === 'date' ? 'center' : 'left');
  const body = [cols.map((c) => ({ text: nfc(c.label), bold: true, alignment: 'center', fillColor: '#eeeeee' }))];
  if (!s.rows.length) {
    body.push([{ text: 'Không có dữ liệu trong kỳ báo cáo', italics: true, alignment: 'center', colSpan: cols.length }, ...cols.slice(1).map(() => ({}))]);
  }
  for (const r of s.rows) body.push(cols.map((c) => ({ text: cellText(r, c), alignment: align(c) })));
  if (s.total) {
    body.push(cols.map((c, i) => {
      let t = s.total[c.key] != null ? cellText(s.total, c) : '';
      if (i === 0 && !t && totalNeedsLabel(s)) t = 'Cộng';
      return { text: t, bold: true, alignment: align(c), fillColor: '#f7f7f7' };
    }));
  }
  return {
    table: { headerRows: 1, dontBreakRows: true, keepWithHeaderRows: 1, widths, body },
    fontSize: fs,
    layout: {
      hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#000000', vLineColor: () => '#000000',
      paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 1.5, paddingBottom: () => 1.5,
    },
  };
};

/** docDefinition cho báo cáo (HÀM THUẦN). sectionKeys: chọn bảng đưa vào báo cáo in. */
export function buildStatsPdfDocDefinition(report, { sectionKeys } = {}) {
  const { meta } = report;
  const sections = report.sections.filter((s) => !sectionKeys || sectionKeys.includes(s.key));
  const org = orgLines(meta.unitName);
  const LEFT_W = 210, RIGHT_W = PDF_CONTENT_W - LEFT_W;
  const underline = (w, len) => ({ canvas: [{ type: 'line', x1: (w - len) / 2, y1: 2, x2: (w + len) / 2, y2: 2, lineWidth: 0.6 }] });

  const content = [
    {
      columns: [
        { width: LEFT_W, stack: [...org.map((t) => ({ text: t, bold: true, alignment: 'center', fontSize: 10.5 })), underline(LEFT_W, 70)] },
        { width: RIGHT_W, stack: [
          { text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, alignment: 'center', fontSize: 10.5 },
          { text: 'Độc lập - Tự do - Hạnh phúc', bold: true, alignment: 'center', fontSize: 11 },
          underline(RIGHT_W, 130),
        ] },
      ],
    },
    { text: nfc(placeDateLine(meta.generatedAt)), italics: true, alignment: 'right', margin: [0, 8, 0, 14] },
    { text: nfc(meta.title), bold: true, alignment: 'center', fontSize: 14 },
    { text: nfc(meta.subtitle), bold: true, alignment: 'center', fontSize: 12.5 },
    { text: nfc(meta.period.fullLabel), italics: true, alignment: 'center', margin: [0, 2, 0, 12] },

    { text: 'I. THÔNG TIN CHUNG', bold: true, margin: [0, 4, 0, 4] },
    {
      ul: [
        { text: [{ text: 'Kỳ báo cáo: ', bold: true }, nfc(meta.period.fullLabel)] },
        { text: [{ text: 'Kỳ so sánh: ', bold: true }, nfc(meta.compare ? `${meta.compare.kind} — ${meta.compare.fullLabel}` : 'Không so sánh')] },
        { text: [{ text: 'Phạm vi: ', bold: true }, nfc(meta.scopeLabel)] },
        { text: [{ text: 'Lịch được tính: ', bold: true }, nfc(meta.statusLabel)] },
        { text: [{ text: 'Thời điểm trích xuất số liệu: ', bold: true }, nfc(meta.generatedText)] },
      ],
      fontSize: 10, margin: [8, 0, 0, 4],
    },
  ];

  sections.forEach((s, i) => {
    content.push({ text: `${roman(i + 2)}. ${nfc(s.title).toLocaleUpperCase('vi')}`, bold: true, margin: [0, 12, 0, 3], headlineLevel: 1 });
    if (s.description) content.push({ text: nfc(s.description), italics: true, fontSize: 9, margin: [0, 0, 0, 4] });
    content.push(pdfTable(s));
    for (const n of s.notes || []) content.push({ text: `Ghi chú: ${nfc(n)}`, italics: true, fontSize: 8.5, margin: [0, 2, 0, 0] });
  });

  content.push({ text: `${roman(sections.length + 2)}. GHI CHÚ PHƯƠNG PHÁP TÍNH`, bold: true, margin: [0, 12, 0, 3] });
  content.push({ ol: meta.notes.map(nfc), fontSize: 9, margin: [8, 0, 0, 0] });

  content.push({
    unbreakable: true, margin: [0, 18, 0, 0],
    columns: [
      { width: '*', stack: [
        { text: 'NGƯỜI LẬP BIỂU', bold: true, alignment: 'center' },
        { text: '(Ký, ghi rõ họ tên)', italics: true, alignment: 'center', fontSize: 9 },
        { text: ' ', margin: [0, 40, 0, 0] },
        { text: nfc(meta.author || ''), bold: true, alignment: 'center' },
      ] },
      { width: '*', stack: [
        { text: 'LÃNH ĐẠO VĂN PHÒNG', bold: true, alignment: 'center' },
        { text: '(Ký, ghi rõ họ tên)', italics: true, alignment: 'center', fontSize: 9 },
      ] },
    ],
  });

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: PDF_MARGINS,
    info: { title: nfc(`${meta.title} ${meta.period.label}`), author: nfc(meta.author || meta.unitName), subject: nfc(meta.subtitle) },
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.15 },
    // Không để tiêu đề mục đứng trơ trọi cuối trang
    pageBreakBefore: (node) => node.headlineLevel === 1
      && node.startPosition.top > 841.89 - PDF_MARGINS[3] - 80,
    footer: (cur, total) => ({
      margin: [PDF_MARGINS[0], 14, PDF_MARGINS[2], 0],
      columns: [
        { text: nfc(`Trích xuất từ Hệ thống quản lý lịch công tác lúc ${meta.generatedText}`), fontSize: 7, color: '#666666' },
        { text: `Trang ${cur}/${total}`, alignment: 'right', fontSize: 8 },
      ],
    }),
    content,
  };
}

export async function exportStatsPdf(report, opts = {}) {
  const pdfMakeMod = await import('pdfmake/build/pdfmake');
  // Phông Roboto TỰ NHÚNG (xem exporters.exportWeekPdf — không dùng vfs_fonts của pdfmake)
  const { ROBOTO_VFS, ROBOTO_FONTS } = await import('./pdfFonts.js');
  const pdfMake = pdfMakeMod.default || pdfMakeMod;
  pdfMake.vfs = ROBOTO_VFS;
  pdfMake.fonts = ROBOTO_FONTS;
  pdfMake.createPdf(buildStatsPdfDocDefinition(report, opts)).download(`${report.meta.fileBase}.pdf`);
}

// ======================================================================
// WORD (docx)
// ======================================================================
/** Dựng Document (docx = module 'docx'). Times New Roman, lề theo Nghị định 30. */
export function buildStatsDocx(report, docx, { sectionKeys } = {}) {
  const {
    Document, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType,
    VerticalAlign, BorderStyle, Footer, PageNumber, ShadingType,
  } = docx;
  const { meta } = report;
  const sections = report.sections.filter((s) => !sectionKeys || sectionKeys.includes(s.key));
  const B = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const BORDERS = { top: B, bottom: B, left: B, right: B };
  const NB = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const NO_BORDERS = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

  const p = (runs, o = {}) => new Paragraph({
    alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 60 }, indent: o.indent,
    children: (Array.isArray(runs) ? runs : [runs]).map((r) => (typeof r === 'string' ? new TextRun({ text: nfc(r), size: o.size }) : r)),
  });
  const run = (text, o = {}) => new TextRun({ text: nfc(text), bold: o.bold, italics: o.italics, size: o.size });

  const org = orgLines(meta.unitName);
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS,
    rows: [new TableRow({
      children: [
        new TableCell({
          width: { size: 42, type: WidthType.PERCENTAGE }, borders: NO_BORDERS,
          children: [...org.map((t) => p(run(t, { bold: true, size: 24 }), { align: AlignmentType.CENTER, after: 0 })), p(run('―――――', { size: 20 }), { align: AlignmentType.CENTER })],
        }),
        new TableCell({
          width: { size: 58, type: WidthType.PERCENTAGE }, borders: NO_BORDERS,
          children: [
            p(run('CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', { bold: true, size: 24 }), { align: AlignmentType.CENTER, after: 0 }),
            p(run('Độc lập - Tự do - Hạnh phúc', { bold: true, size: 26 }), { align: AlignmentType.CENTER, after: 0 }),
            p(run('――――――――――', { size: 20 }), { align: AlignmentType.CENTER }),
          ],
        }),
      ],
    })],
  });

  const tableOf = (s) => {
    const cols = printCols(s);
    const many = cols.length > 8;
    const size = many ? 17 : 21; // 8,5pt / 10,5pt
    const w = resolveWidths(cols, 467);
    const sum = w.reduce((n, x) => n + x, 0);
    const pct = w.map((x) => Math.max(3, Math.round((x / sum) * 100)));
    const align = (c) => (isNumericType(c.type) ? AlignmentType.RIGHT : c.type === 'date' ? AlignmentType.CENTER : AlignmentType.LEFT);
    const cell = (text, c, i, o = {}) => new TableCell({
      width: { size: pct[i], type: WidthType.PERCENTAGE }, borders: BORDERS, verticalAlign: VerticalAlign.CENTER,
      columnSpan: o.span,
      shading: o.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: o.fill } : undefined,
      children: [p(run(text, { bold: o.bold, italics: o.italics, size }), { align: o.align ?? align(c), after: 0 })],
    });
    const rows = [new TableRow({ tableHeader: true, children: cols.map((c, i) => cell(c.label, c, i, { bold: true, align: AlignmentType.CENTER, fill: 'EEEEEE' })) })];
    if (!s.rows.length) rows.push(new TableRow({ children: [cell('Không có dữ liệu trong kỳ báo cáo', cols[0], 0, { span: cols.length, italics: true, align: AlignmentType.CENTER })] }));
    for (const r of s.rows) rows.push(new TableRow({ cantSplit: true, children: cols.map((c, i) => cell(cellText(r, c), c, i)) }));
    if (s.total) {
      rows.push(new TableRow({
        cantSplit: true,
        children: cols.map((c, i) => {
          let t = s.total[c.key] != null ? cellText(s.total, c) : '';
          if (i === 0 && !t && totalNeedsLabel(s)) t = 'Cộng';
          return cell(t, c, i, { bold: true, fill: 'F7F7F7' });
        }),
      }));
    }
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
  };

  const children = [
    headerTable,
    p(run(placeDateLine(meta.generatedAt), { italics: true }), { align: AlignmentType.RIGHT, before: 120, after: 240 }),
    p(run(meta.title, { bold: true, size: 28 }), { align: AlignmentType.CENTER, after: 0 }),
    p(run(meta.subtitle, { bold: true }), { align: AlignmentType.CENTER, after: 0 }),
    p(run(meta.period.fullLabel, { italics: true }), { align: AlignmentType.CENTER, after: 240 }),
    p(run('I. THÔNG TIN CHUNG', { bold: true }), { before: 120 }),
    ...[
      ['Kỳ báo cáo: ', meta.period.fullLabel],
      ['Kỳ so sánh: ', meta.compare ? `${meta.compare.kind} — ${meta.compare.fullLabel}` : 'Không so sánh'],
      ['Phạm vi: ', meta.scopeLabel],
      ['Lịch được tính: ', meta.statusLabel],
      ['Thời điểm trích xuất số liệu: ', meta.generatedText],
    ].map(([k, v]) => p([run('- ' + k, { bold: true }), run(v)], { indent: { firstLine: 567 } })),
  ];
  sections.forEach((s, i) => {
    children.push(p(run(`${roman(i + 2)}. ${nfc(s.title).toLocaleUpperCase('vi')}`, { bold: true }), { before: 240 }));
    if (s.description) children.push(p(run(s.description, { italics: true, size: 22 }), { indent: { firstLine: 567 } }));
    children.push(tableOf(s));
    for (const n of s.notes || []) children.push(p(run(`Ghi chú: ${n}`, { italics: true, size: 20 }), { before: 40 }));
  });
  children.push(p(run(`${roman(sections.length + 2)}. GHI CHÚ PHƯƠNG PHÁP TÍNH`, { bold: true }), { before: 240 }));
  meta.notes.forEach((n, i) => children.push(p(run(`${i + 1}. ${n}`, { size: 22 }), { indent: { firstLine: 567 } })));

  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS,
    rows: [new TableRow({
      cantSplit: true,
      children: [
        ['NGƯỜI LẬP BIỂU', meta.author || ''],
        ['LÃNH ĐẠO VĂN PHÒNG', ''],
      ].map(([title, name]) => new TableCell({
        width: { size: 50, type: WidthType.PERCENTAGE }, borders: NO_BORDERS,
        children: [
          p(run(title, { bold: true }), { align: AlignmentType.CENTER, before: 360, after: 0 }),
          p(run('(Ký, ghi rõ họ tên)', { italics: true, size: 22 }), { align: AlignmentType.CENTER, after: 1200 }),
          p(run(name, { bold: true }), { align: AlignmentType.CENTER }),
        ],
      })),
    })],
  }));

  return new Document({
    creator: nfc(meta.author || meta.unitName),
    title: nfc(`${meta.title} ${meta.period.label}`),
    styles: { default: { document: { run: { font: 'Times New Roman', size: 26 } } } },
    sections: [{
      properties: {
        page: { margin: { top: 1134, bottom: 1134, left: 1701, right: 851 } }, // 2 / 2 / 3 / 1,5 cm
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [new TextRun({ children: ['Trang ', PageNumber.CURRENT, '/', PageNumber.TOTAL_PAGES], size: 18 })],
          })],
        }),
      },
      children,
    }],
  });
}

export async function exportStatsDocx(report, opts = {}) {
  const [docx, fileSaverMod] = await Promise.all([import('docx'), import('file-saver')]);
  const saveAs = fileSaverMod.saveAs || fileSaverMod.default;
  const blob = await docx.Packer.toBlob(buildStatsDocx(report, docx, opts));
  saveAs(blob, `${report.meta.fileBase}.docx`);
}
