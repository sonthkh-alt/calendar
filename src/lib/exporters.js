// Xuất LỊCH CÔNG TÁC TUẦN ra file Word (.docx) — định dạng công văn A4 dọc,
// bám theo bản in (WeekPrintSheet). docx + file-saver được NẠP ĐỘNG (dynamic import)
// để không làm phình bundle chính.
import { makeEntrySorter, UNIT_NAME } from './constants';
import { weekDays, toISODate, dayName, fmtDM, fmtDMY, fmtTime, weekStart, weekEnd, getISOWeek } from './dates';

// ---- Chuẩn hóa tiếng Việt (khớp tên không phụ thuộc dấu / kính ngữ) ----
const norm = (s) => (s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd').replace(/\s+/g, ' ').trim();
const coreName = (s) => norm(String(s).split(',')[0])
  .replace(/^(d\s*\/\s*c|dong chi|ong|ba)\s+/, '').trim();
const isSamePerson = (segCore, n) =>
  segCore === n || segCore.startsWith(n + ' ') || n.startsWith(segCore + ' ');

// ---- Thêm "Đồng chí" trước TÊN CÁN BỘ trong cột Thành phần ----
// - Đoạn đã có kính ngữ "Đ/c | Đ.c | đc | Đồng chí" -> chuẩn hóa thành "Đồng chí".
// - Đoạn đã có "Ông/Bà/Bác" -> giữ nguyên (đã là người, kính ngữ khác).
// - Đoạn là TÊN NGƯỜI (2–5 từ viết hoa, không bắt đầu bằng từ chỉ ĐƠN VỊ/NHÓM)
//   -> thêm "Đồng chí". Tên tổ chức/đơn vị (Ban, Văn phòng, Sở, UBND...) giữ nguyên.
const COMRADE_RE = /^(đồng\s*chí|đ\s*\/\s*c|đ\.c|đc)\s+/i;
const OTHER_HONOR_RE = /^(ông|bà|bác)\s+/i;
const ORG_RE = /^(văn\s*phòng|ban|sở|phòng|ubnd|hđnd|hdnd|thường\s*trực|lãnh\s*đạo|đại\s*diện|các|đoàn|tổ|hội|đảng|chi\s*cục|cục|trung\s*tâm|công\s*an|viện|tòa|toà|chi\s*bộ|thành\s*viên|cán\s*bộ|chuyên\s*viên|đại\s*biểu|thanh\s*tra|mặt\s*trận|liên\s*đoàn|ủy\s*ban|uỷ\s*ban|trường|bệnh\s*viện|công\s*ty|tập\s*thể|toàn\s*thể|đại\s*đội|trung\s*đoàn)\b/i;

const isUpperWord = (w) => {
  const c = (w || '')[0] || '';
  return c.toLocaleUpperCase('vi') === c && c.toLocaleLowerCase('vi') !== c;
};

const comradeSegment = (seg) => {
  const s = (seg || '').trim();
  if (!s) return s;
  if (COMRADE_RE.test(s)) return s.replace(COMRADE_RE, 'Đồng chí ');
  if (OTHER_HONOR_RE.test(s)) return s;
  const name = s.split(',')[0].trim();
  if (ORG_RE.test(name)) return s;
  const words = name.split(/\s+/);
  if (words.length < 2 || words.length > 5) return s;
  if (!words.every(isUpperWord)) return s;
  return 'Đồng chí ' + s;
};
const withComrade = (text) =>
  !text ? text : text.split(';').map((x) => comradeSegment(x.trim())).filter(Boolean).join('; ');

// ---- Gộp mục giống nhau trong ngày (như bản in) ----
const timeLabel = (e) => {
  if (e.session === 'gio') return `${fmtTime(e.start_time)}${e.end_time ? ' - ' + fmtTime(e.end_time) : ''}`;
  return e.session === 'sang' ? 'Sáng' : e.session === 'chieu' ? 'Chiều' : 'Cả ngày';
};

// THÀNH PHẦN GỌN: thay nhóm thành viên bằng tên Nhóm (giống WeekPrintSheet).
// SẮP XẾP theo thứ tự ƯU TIÊN HỌ VÀ TÊN = sort_order của lãnh đạo (chức vụ cao -> trước);
// nhóm xếp theo STT nhỏ nhất của thành viên; đoạn không khớp lãnh đạo giữ thứ tự cuối.
const compactParticipants = (m, groups, leaderById) => {
  // coreName(họ tên lãnh đạo) -> sort_order, để xếp ưu tiên theo chức vụ
  const coreToSort = (Object.values(leaderById) || [])
    .map((l) => [coreName(l.full_name), l.sort_order ?? 999]);
  const sortOfName = (seg) => {
    const c = coreName(seg);
    for (const [lc, ord] of coreToSort) if (isSamePerson(c, lc) || isSamePerson(lc, c)) return ord;
    return 9999;
  };
  const sortOfSeg = (seg) => {
    const g = (groups || []).find((gr) => gr.name === seg);
    if (g) {
      const ords = (g.members || '').split(';').map((x) => sortOfName(x)).filter((v) => v < 9999);
      return ords.length ? Math.min(...ords) : (g.sort_order ?? 9998);
    }
    return sortOfName(seg);
  };
  // sắp ổn định theo ưu tiên (đoạn không khớp -> giữ nguyên thứ tự tương đối, ra cuối)
  const byPriority = (arr) => arr
    .map((s, i) => [s, sortOfSeg(s), i])
    .sort((a, b) => a[1] - b[1] || a[2] - b[2])
    .map((x) => x[0]);

  let segs = m._parts.join('; ').split(';').map((s) => s.trim()).filter(Boolean);
  const ordered = [...(groups || [])].sort((a, b) =>
    (b.members || '').split(';').length - (a.members || '').split(';').length);
  for (const g of ordered) {
    if (!g.members || !g.name) continue;
    const memberNames = g.members.split(';').map((x) => coreName(x)).filter(Boolean);
    if (!memberNames.length) continue;
    const present = memberNames.every((n) => segs.some((s) => isSamePerson(coreName(s), n)));
    if (!present) continue;
    let inserted = false;
    segs = segs.flatMap((s) => {
      const isMember = memberNames.some((n) => isSamePerson(coreName(s), n));
      if (!isMember) return [s];
      const dot = s.indexOf('. ');
      const tail = dot > -1 ? [s.slice(dot + 1).trim()] : [];
      if (!inserted) { inserted = true; return [g.name, ...tail]; }
      return tail;
    });
    if (!inserted) segs.unshift(g.name);
  }
  const text = byPriority([...new Set(segs)]).join('; ');
  if (text) return text;
  // Nhánh dự phòng: tên các lãnh đạo của mục -> xếp theo sort_order
  const names = [...new Set(m._leaderIds.map((id) => leaderById[id]?.full_name).filter(Boolean))];
  return byPriority(names).join('; ');
};

/**
 * Xuất lịch tuần ra .docx.
 * @param {Date} anchor  ngày bất kỳ trong tuần cần xuất
 * @param {Array} entries  các mục lịch ĐÃ LỌC theo cột đang hiển thị (tu_choi sẽ bị bỏ)
 * @param {Array} leaders
 * @param {Array} groups  nhóm thành phần (để gộp tên nhóm)
 */
export async function exportWeekDocx({ anchor, entries, leaders, groups }) {
  const [docx, fileSaverMod] = await Promise.all([import('docx'), import('file-saver')]);
  const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    WidthType, AlignmentType, VerticalAlign, BorderStyle, PageOrientation,
  } = docx;
  const saveAs = fileSaverMod.saveAs || fileSaverMod.default;

  const days = weekDays(anchor);
  const leaderById = Object.fromEntries((leaders || []).map((l) => [l.id, l]));
  const entrySorter = makeEntrySorter(leaders, groups);
  const ws = weekStart(anchor), we = weekEnd(anchor);

  const mergeDay = (list) => {
    const map = new Map();
    const out = [];
    for (const e of list) {
      const key = `${e.content}|${e.session}|${e.start_time || ''}|${(e.location || '').trim().toLowerCase()}`;
      const m = map.get(key);
      if (!m) {
        const item = { ...e, _leaderIds: [e.leader_id], _parts: e.participants ? [e.participants] : [] };
        map.set(key, item); out.push(item);
      } else {
        if (!m._leaderIds.includes(e.leader_id)) m._leaderIds.push(e.leader_id);
        if (e.participants && !m._parts.includes(e.participants)) m._parts.push(e.participants);
      }
    }
    return out.sort(entrySorter);
  };

  // Khung viền mỏng cho mọi ô
  const B = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const CELL_BORDERS = { top: B, bottom: B, left: B, right: B };

  const para = (text, opts = {}) => new Paragraph({
    alignment: opts.align,
    children: [new TextRun({ text: text ?? '', bold: opts.bold, italics: opts.italics })],
  });
  const cell = (children, opts = {}) => new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    rowSpan: opts.rowSpan,
    columnSpan: opts.columnSpan,
    verticalAlign: opts.valign || VerticalAlign.TOP,
    borders: CELL_BORDERS,
    children: Array.isArray(children) ? children : [children],
  });

  const headerRow = new TableRow({
    tableHeader: true,
    children: ['Ngày', 'Thời gian', 'Nội dung công việc', 'Địa điểm', 'Thành phần']
      .map((t, i) => cell([para(t, { bold: true, align: AlignmentType.CENTER })], {
        width: [9, 10, 33, 15, 33][i], valign: VerticalAlign.CENTER,
      })),
  });

  const rows = [headerRow];
  for (const d of days) {
    const dISO = toISODate(d);
    const list = mergeDay((entries || []).filter((e) => e.date === dISO && e.status !== 'tu_choi'));
    const span = Math.max(list.length, 1);
    const dayCell = cell(
      [para(dayName(d), { bold: true, align: AlignmentType.CENTER }), para(fmtDM(d), { align: AlignmentType.CENTER })],
      { width: 9, rowSpan: span, valign: VerticalAlign.CENTER },
    );
    if (!list.length) {
      rows.push(new TableRow({ children: [dayCell, cell([para('')], { columnSpan: 4 })] }));
      continue;
    }
    list.forEach((m, i) => {
      // Cột Nội dung: nội dung + (chờ duyệt) IN ĐẬM nếu đang chờ duyệt
      const contentRuns = [new TextRun({ text: m.content || '' })];
      if (m.status === 'cho_duyet') contentRuns.push(new TextRun({ text: ' (chờ duyệt)', bold: true }));
      else if (m.status === 'da_dieu_chinh' && m.review_note) contentRuns.push(new TextRun({ text: ` (${m.review_note})`, italics: true }));

      const partText = m.group_label || compactParticipants(m, groups, leaderById);

      const cells = [];
      if (i === 0) cells.push(dayCell);
      cells.push(cell([para(timeLabel(m), { align: AlignmentType.CENTER })], { width: 10, valign: VerticalAlign.CENTER }));
      cells.push(cell([new Paragraph({ children: contentRuns })], { width: 33 }));
      cells.push(cell([m.at_office ? para('Làm việc tại cơ quan', { bold: true }) : para(m.location || '')], { width: 15 }));
      cells.push(cell([para(withComrade(partText))], { width: 33 }));
      rows.push(new TableRow({ children: cells }));
    });
  }

  const titleP = (text, o = {}) => new Paragraph({
    alignment: AlignmentType.CENTER, spacing: { after: o.after ?? 40 },
    children: [new TextRun({ text, bold: o.bold, italics: o.italics, size: o.size, allCaps: o.caps })],
  });

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Times New Roman', size: 23 } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: PageOrientation.PORTRAIT },
          margin: { top: 1134, bottom: 1134, left: 1134, right: 851 }, // 2cm / 1.5cm
        },
      },
      children: [
        titleP(UNIT_NAME, { caps: true, size: 24 }),
        titleP('LỊCH CÔNG TÁC TUẦN', { bold: true, size: 34, after: 60 }),
        titleP('của lãnh đạo HĐND tỉnh, lãnh đạo Đoàn ĐBQH tỉnh và các Ban HĐND tỉnh', { size: 26 }),
        titleP(`Tuần thứ ${getISOWeek(ws)} năm ${ws.getFullYear()} (từ ngày ${fmtDMY(ws)} đến ngày ${fmtDMY(we)})`, { italics: true, size: 26, after: 160 }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `Lich-cong-tac-tuan-${getISOWeek(ws)}-${ws.getFullYear()}.docx`);
}

// ===== XUẤT PDF (pdfmake) =====
const nfc = (s) => (s == null ? '' : String(s)).normalize('NFC'); // chuẩn dựng sẵn -> Roboto đủ glyph
export const pdfFileName = (anchor) => {
  const ws = weekStart(anchor);
  return `Lich-cong-tac-tuan-${getISOWeek(ws)}-${ws.getFullYear()}.pdf`;
};

/**
 * Dựng docDefinition (pdfmake) cho lịch tuần — HÀM THUẦN (không dùng DOM / pdfmake)
 * để test được ở node. Bảng công văn A4 dọc giống bản in:
 * Ngày | Thời gian | Nội dung | Địa điểm | Thành phần.
 * - Thành phần: thêm "Đồng chí" trước tên cán bộ + sắp theo ưu tiên (như Word).
 * - Nội dung CHỜ DUYỆT: thêm " (chờ duyệt)" IN ĐẬM; đã điều chỉnh -> ghi chú in nghiêng.
 */
export function buildWeekPdfDocDefinition({ anchor, entries, leaders, groups }) {
  const days = weekDays(anchor);
  const leaderById = Object.fromEntries((leaders || []).map((l) => [l.id, l]));
  const entrySorter = makeEntrySorter(leaders, groups);
  const ws = weekStart(anchor), we = weekEnd(anchor);

  const mergeDay = (list) => {
    const map = new Map();
    const out = [];
    for (const e of list) {
      const key = `${e.content}|${e.session}|${e.start_time || ''}|${(e.location || '').trim().toLowerCase()}`;
      const m = map.get(key);
      if (!m) {
        const item = { ...e, _leaderIds: [e.leader_id], _parts: e.participants ? [e.participants] : [] };
        map.set(key, item); out.push(item);
      } else {
        if (!m._leaderIds.includes(e.leader_id)) m._leaderIds.push(e.leader_id);
        if (e.participants && !m._parts.includes(e.participants)) m._parts.push(e.participants);
      }
    }
    return out.sort(entrySorter);
  };

  const headerRow = ['Ngày', 'Thời gian', 'Nội dung công việc', 'Địa điểm', 'Thành phần']
    .map((t) => ({ text: t, bold: true, alignment: 'center', fillColor: '#eeeeee' }));
  const body = [headerRow];

  for (const d of days) {
    const dISO = toISODate(d);
    const list = mergeDay((entries || []).filter((e) => e.date === dISO && e.status !== 'tu_choi'));
    const dayCell = { text: `${nfc(dayName(d))}\n${fmtDM(d)}`, bold: true, alignment: 'center' };
    if (!list.length) {
      body.push([{ ...dayCell }, { text: '', colSpan: 4 }, {}, {}, {}]);
      continue;
    }
    list.forEach((m, i) => {
      const contentRuns = [{ text: nfc(m.content) }];
      if (m.status === 'cho_duyet') contentRuns.push({ text: ' (chờ duyệt)', bold: true });
      else if (m.status === 'da_dieu_chinh' && m.review_note) contentRuns.push({ text: ` (${nfc(m.review_note)})`, italics: true });

      const partText = nfc(withComrade(m.group_label || compactParticipants(m, groups, leaderById)));
      const ngay = i === 0 ? { ...dayCell, rowSpan: list.length } : {};
      const diaDiem = m.at_office ? { text: 'Làm việc tại cơ quan', bold: true } : { text: nfc(m.location || '') };
      body.push([
        ngay,
        { text: timeLabel(m), alignment: 'center' },
        { text: contentRuns },
        diaDiem,
        { text: partText },
      ]);
    });
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    pageMargins: [40, 36, 30, 36],
    defaultStyle: { font: 'Roboto', fontSize: 10, lineHeight: 1.15 },
    content: [
      { text: nfc(UNIT_NAME).toUpperCase(), alignment: 'center', fontSize: 11 },
      { text: 'LỊCH CÔNG TÁC TUẦN', alignment: 'center', bold: true, fontSize: 15, margin: [0, 4, 0, 0] },
      { text: 'của lãnh đạo HĐND tỉnh, lãnh đạo Đoàn ĐBQH tỉnh và các Ban HĐND tỉnh', alignment: 'center', fontSize: 11 },
      {
        text: [`Tuần thứ ${getISOWeek(ws)} năm ${ws.getFullYear()} `, { text: `(từ ngày ${fmtDMY(ws)} đến ngày ${fmtDMY(we)})`, bold: true }],
        alignment: 'center', italics: true, fontSize: 11, margin: [0, 2, 0, 8],
      },
      {
        table: { headerRows: 1, dontBreakRows: true, widths: [46, 42, '*', 74, 150], body },
        layout: {
          hLineWidth: () => 0.5, vLineWidth: () => 0.5,
          hLineColor: () => '#000000', vLineColor: () => '#000000',
          paddingLeft: () => 3, paddingRight: () => 3, paddingTop: () => 2, paddingBottom: () => 2,
        },
      },
    ],
  };
}

/**
 * Xuất lịch tuần ra .pdf (MỘT CÚ BẤM) — NẠP ĐỘNG pdfmake + phông Roboto kèm theo
 * (đã kiểm chứng đủ glyph tiếng Việt). Văn bản chuẩn hóa NFC để khớp glyph dựng sẵn.
 */
export async function exportWeekPdf({ anchor, entries, leaders, groups }) {
  const pdfMakeMod = await import('pdfmake/build/pdfmake');
  // TỰ NHÚNG phông Roboto — KHÔNG import 'pdfmake/build/vfs_fonts' (file đó dùng
  // this.pdfMake nên Vite/Rollup đóng gói -> 'this' undefined -> vỡ khi nạp).
  const { ROBOTO_VFS, ROBOTO_FONTS } = await import('./pdfFonts.js');
  const pdfMake = pdfMakeMod.default || pdfMakeMod;
  pdfMake.vfs = ROBOTO_VFS;
  pdfMake.fonts = ROBOTO_FONTS;

  const docDefinition = buildWeekPdfDocDefinition({ anchor, entries, leaders, groups });
  pdfMake.createPdf(docDefinition).download(pdfFileName(anchor));
}
