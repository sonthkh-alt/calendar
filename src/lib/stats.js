// THỐNG KÊ LỊCH CÔNG TÁC — HÀM THUẦN (không DOM / Supabase) để test được ở node.
// Đầu vào: các mục lịch thô (schedule_entries) + danh mục. Đầu ra: MÔ HÌNH BÁO CÁO
// { meta, kpis, sections[] } dùng CHUNG cho màn hình, Excel, PDF và Word (lib/statsExport)
// -> số liệu trên màn hình và trong mọi tệp xuất ra luôn khớp nhau.
//
// Đơn vị đếm (ghi rõ trong "Ghi chú phương pháp" của báo cáo):
//  - SỰ KIỆN: một hoạt động trong một ngày. Nhiều lãnh đạo cùng dự (chung group_id, hoặc
//    cùng ngày + buổi/giờ + nội dung + địa điểm) chỉ tính MỘT sự kiện.
//  - LƯỢT: mỗi lãnh đạo tham gia một sự kiện tính một lượt.
//  - BUỔI: nửa ngày (sáng/chiều) có lịch của một lãnh đạo; cả ngày = 2 buổi; nhiều
//    hoạt động cùng buổi của cùng một người chỉ tính 1 buổi.
import { addYears, differenceInCalendarDays, getISOWeekYear } from 'date-fns';
import {
  STATUS, VEHICLE_STATUS, VEHICLE_TYPES, UNIT_NAME, PCT_GROUP_LABEL, DOAN_GROUP_LABEL,
  UNIT_GROUP_FILTERS, TRUONG_BAN_FILTER_KEY, TRUONG_BAN_GROUP_NAME, ROLES,
  hasVehicleRequest, isPrivateVehicle, isHqLocation, leaderInUnits, communeKey, makeEntrySorter,
} from './constants';
import {
  addDays, addMonths, endOfMonth, parseISO, toISODate, getISOWeek, workWeekStart,
  fmtDMY, fmtDM, fmtTime, isoToDMY, sessionsOverlap,
} from './dates';

// ===================== KỲ BÁO CÁO =====================
// Các kỳ theo thông lệ báo cáo của cơ quan nhà nước: tuần, tháng, quý, 6 tháng, 9 tháng, năm.
export const PERIOD_TYPES = [
  { key: 'week', label: 'Tuần' },
  { key: 'month', label: 'Tháng' },
  { key: 'quarter', label: 'Quý' },
  { key: 'half', label: '6 tháng' },
  { key: 'nine', label: '9 tháng' },
  { key: 'year', label: 'Năm' },
  { key: 'custom', label: 'Tùy chọn' },
];

export const COMPARE_MODES = [
  { key: 'prev', label: 'So với kỳ liền trước' },
  { key: 'yoy', label: 'So với cùng kỳ năm trước' },
  { key: 'none', label: 'Không so sánh' },
];

// Khoảng tùy chọn dài nhất (ngày) — chặn truy vấn quá lớn
export const MAX_CUSTOM_DAYS = 366 * 5;

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
export const roman = (n) => ROMAN[n - 1] || String(n);

const customLabel = (s, e) => `Từ ngày ${fmtDMY(s)} đến ngày ${fmtDMY(e)}`;
const mkRange = (s, e, label, custom = false) => {
  const rangeText = `từ ngày ${fmtDMY(s)} đến ngày ${fmtDMY(e)}`;
  return {
    from: toISODate(s), to: toISODate(e), label, rangeText,
    fullLabel: custom ? label : `${label} (${rangeText})`,
    days: differenceInCalendarDays(e, s) + 1,
  };
};

/** Khoảng ngày của kỳ báo cáo chứa `anchor`. custom: { from, to } (ISO). */
export function periodRange(type, anchor, custom = {}) {
  const a = anchor instanceof Date && !Number.isNaN(+anchor) ? anchor : new Date();
  const y = a.getFullYear(), m = a.getMonth();
  switch (type) {
    case 'week': {
      const s = workWeekStart(a); // Thứ Hai tuần làm việc (T7/CN tính sang tuần kế tiếp)
      return mkRange(s, addDays(s, 6), `Tuần ${getISOWeek(s)} năm ${getISOWeekYear(s)}`);
    }
    case 'month': {
      const s = new Date(y, m, 1);
      return mkRange(s, endOfMonth(s), `Tháng ${m + 1} năm ${y}`);
    }
    case 'quarter': {
      const q = Math.floor(m / 3);
      const s = new Date(y, q * 3, 1);
      return mkRange(s, endOfMonth(new Date(y, q * 3 + 2, 1)), `Quý ${ROMAN[q]} năm ${y}`);
    }
    case 'half': {
      const h = m < 6 ? 0 : 1;
      const s = new Date(y, h * 6, 1);
      return mkRange(s, endOfMonth(new Date(y, h * 6 + 5, 1)), `${h ? '6 tháng cuối năm' : '6 tháng đầu năm'} ${y}`);
    }
    case 'nine':
      return mkRange(new Date(y, 0, 1), new Date(y, 8, 30), `9 tháng đầu năm ${y}`);
    case 'year':
      return mkRange(new Date(y, 0, 1), new Date(y, 11, 31), `Năm ${y}`);
    default: {
      let s = custom.from ? parseISO(custom.from) : a;
      let e = custom.to ? parseISO(custom.to) : s;
      if (Number.isNaN(+s)) s = a;
      if (Number.isNaN(+e)) e = s;
      if (e < s) [s, e] = [e, s];
      if (differenceInCalendarDays(e, s) + 1 > MAX_CUSTOM_DAYS) e = addDays(s, MAX_CUSTOM_DAYS - 1);
      return mkRange(s, e, customLabel(s, e), true);
    }
  }
}

/** Dời mốc sang kỳ trước (n<0) / kỳ sau (n>0). */
export function shiftAnchor(type, anchor, n) {
  switch (type) {
    case 'week': return addDays(anchor, 7 * n);
    case 'month': return addMonths(anchor, n);
    case 'quarter': return addMonths(anchor, 3 * n);
    case 'half': return addMonths(anchor, 6 * n);
    default: return addMonths(anchor, 12 * n); // 9 tháng, năm
  }
}

/** Kỳ so sánh. mode: 'prev' (kỳ liền trước) | 'yoy' (cùng kỳ năm trước) | 'none'. */
export function comparisonRange(type, anchor, cur, mode) {
  if (!cur || !mode || mode === 'none') return null;
  const shiftDates = (fn) => {
    const s = fn(parseISO(cur.from)), e = fn(parseISO(cur.to));
    return mkRange(s, e, customLabel(s, e), true);
  };
  if (mode === 'yoy' || type === 'nine') {
    // "9 tháng" không có kỳ liền trước cùng độ dài -> luôn so cùng kỳ năm trước
    const r = type === 'custom' ? shiftDates((d) => addYears(d, -1)) : periodRange(type, addYears(anchor, -1));
    return { ...r, kind: 'Cùng kỳ năm trước' };
  }
  if (type === 'custom') {
    const s = parseISO(cur.from);
    const ps = addDays(s, -cur.days), pe = addDays(s, -1);
    return { ...mkRange(ps, pe, customLabel(ps, pe), true), kind: 'Kỳ liền trước' };
  }
  return { ...periodRange(type, shiftAnchor(type, anchor, -1)), kind: 'Kỳ liền trước' };
}

// ===================== PHÂN LOẠI HOẠT ĐỘNG =====================
const lower = (s) => (s || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
const isLetter = (ch) => !!ch && /\p{L}/u.test(ch);
// Cụm từ xuất hiện như MỘT TỪ trọn vẹn (giữ dấu tiếng Việt: "họp" khác "hợp" trong "phối hợp")
const hasPhrase = (text, p) => {
  let i = text.indexOf(p);
  while (i > -1) {
    if (!isLetter(text[i - 1]) && !isLetter(text[i + p.length])) return true;
    i = text.indexOf(p, i + 1);
  }
  return false;
};

// THỨ TỰ = ƯU TIÊN: nội dung khớp nhiều loại -> lấy loại đứng trước
// (vd "Hội nghị giám sát…" -> Giám sát; "Họp thẩm tra…" -> Thẩm tra).
export const ACTIVITY_CATEGORIES = [
  { key: 'tai_co_quan', label: 'Làm việc tại cơ quan', rule: 'Lịch đánh dấu "Làm việc tại cơ quan"' },
  { key: 'giam_sat', label: 'Giám sát', words: ['giám sát'] },
  { key: 'khao_sat', label: 'Khảo sát', words: ['khảo sát'] },
  { key: 'tham_tra', label: 'Thẩm tra, góp ý văn bản', words: ['thẩm tra', 'góp ý', 'cho ý kiến', 'lấy ý kiến', 'xem xét dự thảo'] },
  { key: 'tiep_xuc_cu_tri', label: 'Tiếp xúc, đối thoại cử tri', words: ['tiếp xúc cử tri', 'txct', 'đối thoại'] },
  { key: 'tiep_cong_dan', label: 'Tiếp công dân, xử lý đơn thư', words: ['tiếp công dân', 'tiếp dân', 'đơn thư', 'khiếu nại', 'tố cáo'] },
  { key: 'ky_hop', label: 'Kỳ họp, phiên họp HĐND / Quốc hội', words: ['kỳ họp', 'phiên họp', 'chất vấn'] },
  { key: 'tap_huan', label: 'Học tập, tập huấn, bồi dưỡng', words: ['tập huấn', 'bồi dưỡng', 'học tập', 'lớp học', 'quán triệt'] },
  { key: 'doi_ngoai', label: 'Đối ngoại, đón tiếp đoàn', words: ['đối ngoại', 'đoàn ra', 'đoàn vào', 'nước ngoài', 'quốc tế', 'đại sứ', 'tiếp đoàn'] },
  { key: 'tham_hoi', label: 'Thăm hỏi, chúc mừng, tặng quà', words: ['thăm', 'chúc mừng', 'chúc tết', 'tặng quà', 'viếng', 'dâng hương', 'tri ân'] },
  // "lễ" đứng riêng là một từ, trừ "lễ tân" (bộ phận lễ tân không phải dự lễ)
  { key: 'le_su_kien', label: 'Dự lễ, đại hội, sự kiện', re: [/(^|[^\p{L}])lễ(?!\p{L})(?! tân)/u], words: ['khánh thành', 'khởi công', 'kỷ niệm', 'đại hội', 'mít tinh', 'gặp mặt', 'tuyên dương', 'trao tặng', 'phát động'] },
  { key: 'lam_viec', label: 'Làm việc với cơ quan, địa phương', words: ['làm việc với', 'làm việc tại', 'làm việc cùng', 'tiếp và làm việc', 'kiểm tra'] },
  { key: 'hoi_nghi', label: 'Hội nghị, cuộc họp', words: ['hội nghị', 'họp', 'giao ban', 'hội thảo', 'tọa đàm', 'toạ đàm', 'phiên làm việc'] },
  { key: 'khac', label: 'Hoạt động khác', rule: 'Không khớp từ khóa nào ở trên' },
];
export const CATEGORY_LABEL = Object.fromEntries(ACTIVITY_CATEGORIES.map((c) => [c.key, c.label]));

/** Loại hoạt động của một mục lịch (theo cờ "tại cơ quan" + từ khóa trong Nội dung). */
export function classifyActivity(e) {
  if (e?.at_office) return 'tai_co_quan';
  const t = lower(e?.content);
  for (const c of ACTIVITY_CATEGORIES) {
    if ((c.re && c.re.some((r) => r.test(t))) || (c.words && c.words.some((w) => hasPhrase(t, w)))) return c.key;
  }
  return 'khac';
}

// ===================== TIỆN ÍCH =====================
/** Các nửa ngày ('S' sáng, 'C' chiều) mà mục lịch chiếm. */
export function slotsOf(e) {
  if (e.session === 'sang') return ['S'];
  if (e.session === 'chieu') return ['C'];
  if (e.session === 'ca_ngay') return ['S', 'C'];
  const s = fmtTime(e.start_time) || '08:00';
  const en = fmtTime(e.end_time);
  if (s >= '12:00') return ['C'];
  return en && en > '13:00' ? ['S', 'C'] : ['S'];
}

export const timeLabel = (e) => {
  if (e.session === 'gio') return `${fmtTime(e.start_time)}${e.end_time ? ' - ' + fmtTime(e.end_time) : ''}`;
  return e.session === 'sang' ? 'Sáng' : e.session === 'chieu' ? 'Chiều' : 'Cả ngày';
};

const WEEKDAY_LABEL = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const titleCase = (s) => (s || '').replace(/(^|\s)(\p{L})/gu, (_, sp, ch) => sp + ch.toLocaleUpperCase('vi'));
const fold = (s) => lower(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
export const slugify = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const ratio = (a, b) => (b > 0 ? a / b : null);
const hoursBetween = (a, b) => {
  const t1 = Date.parse(a), t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2) || t2 < t1) return null;
  return (t2 - t1) / 3600000;
};
const avg = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null);
const fmtStamp = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ngày ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
};

/** Hiển thị một ô theo kiểu cột (dùng chung màn hình / PDF / Word). */
export function formatCell(v, type) {
  const empty = v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));
  if (empty) return type === 'text' ? '' : '–';
  const n1 = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  switch (type) {
    case 'int':
    case 'num':
      return Number.isInteger(v) ? v.toLocaleString('vi-VN') : v.toLocaleString('vi-VN', n1);
    case 'pct':
      return `${(v * 100).toLocaleString('vi-VN', n1)}%`;
    case 'delta':
      if (v === 0) return '0';
      return `${v > 0 ? '+' : '−'}${Math.abs(v).toLocaleString('vi-VN', Number.isInteger(v) ? {} : n1)}`;
    case 'deltaPct':
      if (v === 0) return '0%';
      return `${v > 0 ? '+' : '−'}${(Math.abs(v) * 100).toLocaleString('vi-VN', n1)}%`;
    case 'date':
      return isoToDMY(v);
    default:
      return String(v);
  }
}
export const isNumericType = (t) => t && t !== 'text' && t !== 'date';
// Dòng tổng đã có nhãn chữ ("Tổng cộng…") chưa — chưa có thì ô đầu ghi "Cộng"
export const totalNeedsLabel = (s) => !!s.total && !s.columns.some((c) => !isNumericType(c.type) && s.total[c.key] != null);

// ===================== ĐƠN VỊ =====================
const unitOf = (leader, banById) => {
  if (!leader) return { key: '?', label: 'Không xác định', order: 9999 };
  switch (leader.leader_type) {
    case 'pct': return { key: 'grp:pct', label: PCT_GROUP_LABEL, order: 0 };
    case 'doan': return { key: 'grp:doan', label: DOAN_GROUP_LABEL, order: 1 };
    case 'vanphong': return { key: 'grp:vanphong', label: UNIT_GROUP_FILTERS[2].label, order: 900 };
    default: {
      const b = banById[leader.ban_id];
      return { key: leader.ban_id || 'ban', label: b?.name || 'Ban của HĐND tỉnh', order: 10 + (b?.sort_order ?? 0) };
    }
  }
};

// ===================== GOM SỰ KIỆN =====================
// Hợp nhất (union-find) các mục chung group_id HOẶC chung ngày + buổi/giờ + nội dung + địa
// điểm (khớp cách lịch tuần gộp thẻ) -> mỗi nhóm là MỘT sự kiện.
function groupEntries(list) {
  const parent = list.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; };
  const byGroup = new Map(), byKey = new Map();
  list.forEach((e, i) => {
    if (e.group_id) {
      if (byGroup.has(e.group_id)) union(byGroup.get(e.group_id), i); else byGroup.set(e.group_id, i);
    }
    const k = `${e.date}|${e.session}|${e.session === 'gio' ? fmtTime(e.start_time) : ''}|${lower(e.content)}|${lower(e.location)}`;
    if (byKey.has(k)) union(byKey.get(k), i); else byKey.set(k, i);
  });
  const out = new Map();
  list.forEach((e, i) => {
    const r = find(i);
    if (!out.has(r)) out.set(r, []);
    out.get(r).push(e);
  });
  return [...out.values()];
}

const aggStatus = (list) => {
  const st = new Set(list.map((e) => e.status));
  if (st.size === 1) return [...st][0];
  const live = list.filter((e) => e.status !== 'tu_choi');
  if (live.some((e) => e.status === 'cho_duyet')) return 'cho_duyet';
  if (live.some((e) => e.status === 'da_dieu_chinh')) return 'da_dieu_chinh';
  return 'da_duyet';
};

// ===================== DỰNG BÁO CÁO =====================
/**
 * @param {object} p
 *  entries           mục lịch của KỲ BÁO CÁO (đã nạp theo khoảng ngày; hàm tự lọc lại)
 *  compareEntries    mục lịch của KỲ SO SÁNH (tùy chọn)
 *  range, compareRange   kết quả periodRange / comparisonRange
 *  leaders, bans, vehicles, profiles
 *  unitKeys[]        bộ lọc đơn vị (như FilterBar: 'grp:pct' | 'grp:doan' | 'grp:vanphong' |
 *                    'grp:truong_ban' | UUID Ban); rỗng = mọi đơn vị
 *  leaderId          chỉ một lãnh đạo (tùy chọn)
 *  statusMode        'active' (bỏ lịch từ chối) | 'approved' (chỉ đã duyệt/điều chỉnh) | 'all'
 *  truongBanIds      Set leader id nhóm "Trưởng các Ban HĐND tỉnh"
 *  perms             { process, vehicle, privateVehicles } — phần báo cáo được xem
 *  today (ISO), now (Date), author (họ tên người lập)
 */
export function buildStatsReport({
  entries, compareEntries = null, range, compareRange = null,
  leaders = [], bans = [], vehicles = [], profiles = [],
  unitKeys = [], leaderId = null, statusMode = 'active', truongBanIds = null,
  perms = {}, today = toISODate(new Date()), now = new Date(), author = '',
}) {
  const leaderById = Object.fromEntries(leaders.map((l) => [l.id, l]));
  const banById = Object.fromEntries(bans.map((b) => [b.id, b]));
  const profById = Object.fromEntries(profiles.map((p) => [p.id, p]));
  const ctx = { truongBanIds: truongBanIds || new Set() };
  const leaderSort = (id) => leaderById[id]?.sort_order ?? 999;
  const leaderInScope = (l) => (!leaderId || l.id === leaderId) && leaderInUnits(l, unitKeys, ctx);
  const entryInScope = (e) => {
    if (leaderId && e.leader_id !== leaderId) return false;
    const l = leaderById[e.leader_id];
    return l ? leaderInUnits(l, unitKeys, ctx) : unitKeys.length === 0;
  };
  const statusOk = statusMode === 'approved'
    ? (s) => s === 'da_duyet' || s === 'da_dieu_chinh'
    : statusMode === 'all' ? () => true : (s) => s !== 'tu_choi';
  const unitOfLeader = (id) => unitOf(leaderById[id], banById);
  const personName = (id) => {
    const p = profById[id];
    return p ? (p.full_name || p.email || 'Tài khoản không rõ tên') : 'Không rõ';
  };
  const visibleVehicle = (v) => !!v && (perms.privateVehicles || !isPrivateVehicle(v));
  const vehicleById = Object.fromEntries(vehicles.map((v) => [v.id, v]));

  const makeEvent = (list) => {
    const sorted = [...list].sort((a, b) => leaderSort(a.leader_id) - leaderSort(b.leader_id));
    const first = sorted[0];
    const leaderIds = [...new Set(sorted.map((e) => e.leader_id))];
    const unitMap = new Map();
    for (const id of leaderIds) { const u = unitOfLeader(id); if (!unitMap.has(u.key)) unitMap.set(u.key, u); }
    const units = [...unitMap.values()].sort((a, b) => a.order - b.order);
    const atOfficeFlag = list.some((e) => e.at_office);
    const req = list.find(hasVehicleRequest);
    const vehicleIds = [...new Set(list.flatMap((e) =>
      ((e.vehicle_ids || []).length ? e.vehicle_ids : (e.vehicle_id ? [e.vehicle_id] : []))))];
    const byCreated = list.filter((e) => e.created_at).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const d = parseISO(first.date);
    const dow = d.getDay();
    return {
      id: first.id, entry: first, entries: list, date: first.date, dow, weekend: dow === 0 || dow === 6,
      session: first.session, start_time: first.start_time, end_time: first.end_time,
      content: first.content || '', location: first.location || '', group_label: first.group_label || '',
      at_office: atOfficeFlag, atOffice: atOfficeFlag || isHqLocation(first.location),
      commune: atOfficeFlag ? null : communeKey(first.location),
      leaderIds, units, status: aggStatus(list), category: classifyActivity({ ...first, at_office: atOfficeFlag }),
      slots: slotsOf(first), past: first.date <= today,
      createdAt: byCreated[0]?.created_at || null, createdBy: (byCreated[0] || first).created_by || null,
      edited: list.some((e) => e.edit_note),
      vehicle: req ? {
        status: req.vehicle_status || 'none', vehicleIds,
        riders: Number(req.rider_count) || 0,
        requestedAt: req.vehicle_requested_at || null, approvedAt: req.vehicle_approved_at || null,
        signed: list.some((e) => e.vehicle_signed_path),
      } : null,
    };
  };
  const whoOf = (ev) => ev.group_label
    || ev.leaderIds.map((id) => leaderById[id]?.full_name || 'Không rõ').join('; ');

  const analyze = (raw, rng) => {
    const scoped = (raw || []).filter((e) => e && e.date >= rng.from && e.date <= rng.to && entryInScope(e));
    const base = scoped.filter((e) => statusOk(e.status));
    const events = groupEntries(base).map(makeEvent);
    const allEvents = groupEntries(scoped).map(makeEvent);
    return { scoped, base, events, allEvents };
  };

  // ---------- Chỉ tiêu tổng hợp ----------
  const computeKpis = (A) => {
    const { events, allEvents } = A;
    const leaderSlots = new Map();
    for (const ev of events) {
      for (const id of ev.leaderIds) {
        if (!leaderSlots.has(id)) leaderSlots.set(id, new Set());
        for (const s of ev.slots) leaderSlots.get(id).add(`${ev.date}|${s}`);
      }
    }
    const cat = (k) => events.filter((e) => e.category === k).length;
    const trips = events.filter((e) => e.vehicle);
    const k = {
      events: events.length,
      occurrences: events.reduce((n, ev) => n + ev.leaderIds.length, 0),
      halfDays: [...leaderSlots.values()].reduce((n, s) => n + s.size, 0),
      activeDays: new Set(events.map((e) => e.date)).size,
      outside: events.filter((e) => !e.atOffice).length,
      atOffice: events.filter((e) => e.atOffice).length,
      communes: new Set(events.map((e) => e.commune).filter(Boolean)).size,
      weekend: events.filter((e) => e.weekend).length,
      past: events.filter((e) => e.past).length,
      upcoming: events.filter((e) => !e.past).length,
      giam_sat: cat('giam_sat'),
      khao_sat: cat('khao_sat'),
      tiep_xuc_cu_tri: cat('tiep_xuc_cu_tri'),
      tiep_cong_dan: cat('tiep_cong_dan'),
      pending: allEvents.filter((e) => e.status === 'cho_duyet').length,
      adjusted: allEvents.filter((e) => e.status === 'da_dieu_chinh').length,
      rejected: allEvents.filter((e) => e.status === 'tu_choi').length,
      trips: trips.length,
      tripsApproved: trips.filter((t) => t.vehicle.status === 'da_duyet').length,
    };
    return k;
  };

  const cur = analyze(entries, range);
  const prev = compareRange && compareEntries ? analyze(compareEntries, compareRange) : null;
  const kc = computeKpis(cur);
  const kp = prev ? computeKpis(prev) : null;

  const KPI_DEFS = [
    { key: 'events', label: 'Tổng số sự kiện, hoạt động', tile: true, hint: 'Mỗi hoạt động trong một ngày tính một lần, dù nhiều lãnh đạo cùng dự' },
    { key: 'occurrences', label: 'Tổng lượt lãnh đạo tham gia', tile: true, hint: 'Mỗi lãnh đạo dự một hoạt động tính một lượt' },
    { key: 'halfDays', label: 'Tổng số buổi công tác của lãnh đạo', tile: true, hint: 'Cộng số buổi (sáng/chiều) có lịch của từng lãnh đạo' },
    { key: 'activeDays', label: 'Số ngày có lịch công tác' },
    { key: 'outside', label: 'Hoạt động ngoài cơ quan', tile: true, hint: 'Không đánh dấu "Làm việc tại cơ quan" và địa điểm khác trụ sở' },
    { key: 'atOffice', label: 'Làm việc tại cơ quan, trụ sở' },
    { key: 'communes', label: 'Số xã, phường, thị trấn đã đến làm việc', tile: true },
    { key: 'giam_sat', label: 'Trong đó: hoạt động giám sát' },
    { key: 'khao_sat', label: 'Trong đó: hoạt động khảo sát' },
    { key: 'tiep_xuc_cu_tri', label: 'Trong đó: tiếp xúc, đối thoại cử tri' },
    { key: 'tiep_cong_dan', label: 'Trong đó: tiếp công dân, xử lý đơn thư' },
    { key: 'weekend', label: 'Hoạt động vào thứ Bảy, Chủ nhật' },
    { key: 'past', label: 'Đã diễn ra (tính đến ngày lập báo cáo)' },
    { key: 'upcoming', label: 'Dự kiến, chưa diễn ra' },
    { key: 'pending', label: 'Lịch đang chờ duyệt', tile: true },
    { key: 'adjusted', label: 'Lịch đã được điều chỉnh khi duyệt' },
    { key: 'rejected', label: 'Lịch bị từ chối' },
    ...(perms.vehicle ? [
      { key: 'trips', label: 'Chuyến có đề nghị bố trí xe ô tô công vụ' },
      { key: 'tripsApproved', label: 'Chuyến đã được duyệt điều xe' },
    ] : []),
  ];
  const kpis = KPI_DEFS.map((d) => {
    const value = kc[d.key];
    const p = kp ? kp[d.key] : null;
    return {
      ...d, value, prev: p,
      delta: kp ? value - p : null,
      deltaPct: kp && p > 0 ? (value - p) / p : null,
    };
  });

  const sections = [];
  const { events, allEvents } = cur;
  const totalEvents = events.length;

  // ---------- 1. Tổng hợp chung ----------
  sections.push({
    key: 'summary', group: 'overview', sheet: 'Tổng hợp',
    title: 'Kết quả tổng hợp',
    description: kp ? `So sánh với ${compareRange.kind.toLowerCase()}: ${compareRange.fullLabel}.` : 'Các chỉ tiêu chính của kỳ báo cáo.',
    columns: [
      { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
      { key: 'label', label: 'Chỉ tiêu', type: 'text', xw: 52 },
      { key: 'value', label: 'Kỳ báo cáo', type: 'num', pdfWidth: 50 },
      ...(kp ? [
        { key: 'prev', label: compareRange.kind, type: 'num', pdfWidth: 50, xw: 18 },
        { key: 'delta', label: 'Tăng (+) / giảm (−)', type: 'delta', pdfWidth: 50, xw: 16 },
        { key: 'deltaPct', label: 'Tỉ lệ thay đổi', type: 'deltaPct', pdfWidth: 50, xw: 14 },
      ] : []),
    ],
    rows: kpis.map((x, i) => ({ stt: i + 1, label: x.label, value: x.value, prev: x.prev, delta: x.delta, deltaPct: x.deltaPct })),
  });

  // ---------- 2. Theo đơn vị ----------
  {
    const agg = new Map();
    const seed = (u) => {
      if (!agg.has(u.key)) agg.set(u.key, { ...u, events: 0, occ: 0, outside: 0, atOffice: 0, weekend: 0, pending: 0, slots: new Set(), days: new Set() });
      return agg.get(u.key);
    };
    for (const l of leaders) if (l.active !== false && leaderInScope(l)) seed(unitOf(l, banById));
    for (const ev of events) {
      for (const u of ev.units) {
        const a = seed(u);
        a.events += 1;
        a.occ += ev.leaderIds.filter((id) => unitOfLeader(id).key === u.key).length;
        if (ev.atOffice) a.atOffice += 1; else a.outside += 1;
        if (ev.weekend) a.weekend += 1;
        if (ev.status === 'cho_duyet') a.pending += 1;
        a.days.add(ev.date);
        for (const s of ev.slots) a.slots.add(`${ev.date}|${s}`);
      }
    }
    const rows = [...agg.values()].sort((a, b) => a.order - b.order).map((a, i) => ({
      stt: i + 1, label: a.label, events: a.events, share: ratio(a.events, totalEvents), occ: a.occ,
      outside: a.outside, atOffice: a.atOffice, halfDays: a.slots.size, days: a.days.size,
      weekend: a.weekend, pending: a.pending,
    }));
    sections.push({
      key: 'units', group: 'units', sheet: 'Theo đơn vị',
      title: 'Thống kê theo đơn vị',
      description: 'Số sự kiện mỗi đơn vị có lãnh đạo tham gia; tỉ lệ tính trên tổng số sự kiện của kỳ.',
      chart: 'events',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
        { key: 'label', label: 'Đơn vị', type: 'text', xw: 34 },
        { key: 'events', label: 'Số sự kiện', type: 'int' },
        { key: 'share', label: 'Tỉ lệ', type: 'pct' },
        { key: 'occ', label: 'Lượt lãnh đạo', type: 'int' },
        { key: 'outside', label: 'Ngoài cơ quan', type: 'int' },
        { key: 'atOffice', label: 'Tại cơ quan', type: 'int' },
        { key: 'halfDays', label: 'Số buổi có lịch', type: 'int' },
        { key: 'days', label: 'Số ngày có lịch', type: 'int' },
        { key: 'weekend', label: 'Cuối tuần', type: 'int' },
        { key: 'pending', label: 'Chờ duyệt', type: 'int' },
      ],
      rows,
      total: {
        label: 'Tổng cộng (không trùng lặp)', events: totalEvents, share: totalEvents ? 1 : null,
        occ: kc.occurrences, outside: kc.outside, atOffice: kc.atOffice,
        halfDays: null, days: kc.activeDays, weekend: kc.weekend,
        pending: events.filter((e) => e.status === 'cho_duyet').length,
      },
      notes: ['Một sự kiện có nhiều đơn vị cùng tham gia được tính cho từng đơn vị, nhưng chỉ tính MỘT lần ở dòng Tổng cộng — vì vậy dòng Tổng cộng có thể nhỏ hơn tổng các dòng.'],
    });
  }

  // ---------- 3. Theo lãnh đạo ----------
  {
    const agg = new Map();
    const seed = (id) => {
      if (!agg.has(id)) {
        const l = leaderById[id];
        agg.set(id, {
          id, name: l?.full_name || 'Không rõ', position: l?.position || '', unit: unitOfLeader(id).label,
          sort: l?.sort_order ?? 999, events: 0, sang: 0, chieu: 0, caNgay: 0, gio: 0,
          outside: 0, atOffice: 0, weekend: 0, pending: 0, slots: new Set(), days: new Set(),
          cats: {},
        });
      }
      return agg.get(id);
    };
    for (const l of leaders) if (l.active !== false && leaderInScope(l)) seed(l.id);
    for (const ev of events) {
      for (const id of ev.leaderIds) {
        const a = seed(id);
        a.events += 1;
        if (ev.session === 'sang') a.sang += 1;
        else if (ev.session === 'chieu') a.chieu += 1;
        else if (ev.session === 'ca_ngay') a.caNgay += 1;
        else a.gio += 1;
        if (ev.atOffice) a.atOffice += 1; else a.outside += 1;
        if (ev.weekend) a.weekend += 1;
        if (ev.status === 'cho_duyet') a.pending += 1;
        a.days.add(ev.date);
        for (const s of ev.slots) a.slots.add(`${ev.date}|${s}`);
        a.cats[ev.category] = (a.cats[ev.category] || 0) + 1;
      }
    }
    const rows = [...agg.values()].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'vi')).map((a, i) => ({
      stt: i + 1, name: a.name, position: a.position, unit: a.unit,
      events: a.events, halfDays: a.slots.size, days: a.days.size,
      sang: a.sang, chieu: a.chieu, caNgay: a.caNgay, gio: a.gio,
      outside: a.outside, atOffice: a.atOffice, weekend: a.weekend, pending: a.pending,
      giam_sat: a.cats.giam_sat || 0, khao_sat: a.cats.khao_sat || 0,
      tiep_xuc_cu_tri: a.cats.tiep_xuc_cu_tri || 0, tiep_cong_dan: a.cats.tiep_cong_dan || 0,
    }));
    const sum = (k) => rows.reduce((n, r) => n + (r[k] || 0), 0);
    sections.push({
      key: 'leaders', group: 'leaders', sheet: 'Theo lãnh đạo',
      title: 'Thống kê theo lãnh đạo',
      description: 'Số hoạt động từng đồng chí lãnh đạo tham gia, số buổi và số ngày có lịch, phân theo buổi và nơi làm việc.',
      chart: 'events',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 20, xw: 6 },
        { key: 'name', label: 'Họ và tên', type: 'text', xw: 28 },
        { key: 'position', label: 'Chức vụ', type: 'text', xw: 34 },
        { key: 'unit', label: 'Đơn vị', type: 'text', pdfWidth: 72, xw: 28 },
        { key: 'events', label: 'Số hoạt động', type: 'int' },
        { key: 'halfDays', label: 'Số buổi', type: 'int' },
        { key: 'days', label: 'Số ngày', type: 'int' },
        { key: 'sang', label: 'Sáng', type: 'int' },
        { key: 'chieu', label: 'Chiều', type: 'int' },
        { key: 'caNgay', label: 'Cả ngày', type: 'int' },
        { key: 'gio', label: 'Theo giờ', type: 'int' },
        { key: 'outside', label: 'Ngoài cơ quan', type: 'int' },
        { key: 'atOffice', label: 'Tại cơ quan', type: 'int' },
        { key: 'weekend', label: 'Cuối tuần', type: 'int' },
        { key: 'giam_sat', label: 'Giám sát', type: 'int' },
        { key: 'khao_sat', label: 'Khảo sát', type: 'int' },
        { key: 'tiep_xuc_cu_tri', label: 'Tiếp xúc cử tri', type: 'int' },
        { key: 'tiep_cong_dan', label: 'Tiếp công dân', type: 'int' },
        { key: 'pending', label: 'Chờ duyệt', type: 'int' },
      ],
      printColumns: ['stt', 'name', 'unit', 'events', 'halfDays', 'days', 'outside', 'atOffice', 'weekend', 'pending'],
      rows,
      total: Object.fromEntries([['name', 'Tổng cộng'], ...['events', 'halfDays', 'days', 'sang', 'chieu', 'caNgay', 'gio', 'outside', 'atOffice', 'weekend', 'giam_sat', 'khao_sat', 'tiep_xuc_cu_tri', 'tiep_cong_dan', 'pending'].map((k) => [k, sum(k)])]),
      notes: ['Cột "Số hoạt động" ở dòng Tổng cộng chính là tổng số lượt lãnh đạo tham gia. Lãnh đạo không có lịch trong kỳ vẫn được liệt kê (số liệu 0).'],
    });
  }

  // ---------- 4. Theo loại hoạt động ----------
  {
    const unitCols = [];
    const seenUnit = new Set();
    const addUnit = (u) => { if (!seenUnit.has(u.key)) { seenUnit.add(u.key); unitCols.push(u); } };
    for (const l of leaders) if (l.active !== false && leaderInScope(l)) addUnit(unitOf(l, banById));
    for (const ev of events) ev.units.forEach(addUnit);
    unitCols.sort((a, b) => a.order - b.order);
    const rows = ACTIVITY_CATEGORIES.map((c, i) => {
      const list = events.filter((e) => e.category === c.key);
      const row = {
        stt: i + 1, label: c.label, events: list.length, share: ratio(list.length, totalEvents),
        occ: list.reduce((n, e) => n + e.leaderIds.length, 0),
        outside: list.filter((e) => !e.atOffice).length,
      };
      unitCols.forEach((u, j) => { row[`u${j}`] = list.filter((e) => e.units.some((x) => x.key === u.key)).length; });
      return row;
    });
    const total = { label: 'Tổng cộng', events: totalEvents, share: totalEvents ? 1 : null, occ: kc.occurrences, outside: kc.outside };
    unitCols.forEach((u, j) => { total[`u${j}`] = events.filter((e) => e.units.some((x) => x.key === u.key)).length; });
    sections.push({
      key: 'categories', group: 'categories', sheet: 'Theo loại hoạt động',
      title: 'Thống kê theo loại hoạt động',
      description: 'Phân loại tự động theo từ khóa trong nội dung lịch (xem Ghi chú phương pháp). Các cột đơn vị đếm số sự kiện có đơn vị đó tham gia.',
      chart: 'events',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
        { key: 'label', label: 'Loại hoạt động', type: 'text', xw: 36 },
        { key: 'events', label: 'Số sự kiện', type: 'int' },
        { key: 'share', label: 'Tỉ lệ', type: 'pct' },
        { key: 'occ', label: 'Lượt lãnh đạo', type: 'int' },
        { key: 'outside', label: 'Ngoài cơ quan', type: 'int' },
        ...unitCols.map((u, j) => ({ key: `u${j}`, label: u.label, type: 'int', xw: 16 })),
      ],
      printColumns: ['stt', 'label', 'events', 'share', 'occ', 'outside', ...(unitCols.length <= 4 ? unitCols.map((_, j) => `u${j}`) : [])],
      rows,
      total,
      notes: unitCols.length > 4 ? ['Bản PDF/Word lược bớt các cột theo đơn vị cho vừa khổ giấy; bản Excel có đầy đủ.'] : [],
    });
  }

  // ---------- 5. Diễn biến theo thời gian + theo thứ trong tuần ----------
  {
    const days = range.days;
    const gran = days <= 10 ? 'day' : days <= 62 ? 'week' : 'month';
    const start = parseISO(range.from), end = parseISO(range.to);
    const buckets = [];
    let c = start;
    while (c <= end && buckets.length < 400) {
      let e;
      if (gran === 'day') e = c;
      else if (gran === 'week') e = addDays(c, (7 - c.getDay()) % 7); // tới Chủ nhật
      else e = endOfMonth(c);
      if (e > end) e = end;
      const fromIso = toISODate(c), toIso = toISODate(e);
      let label;
      if (gran === 'day') label = `${WEEKDAY_LABEL[c.getDay()]} ${fmtDM(c)}`;
      else if (gran === 'week') label = `Tuần ${getISOWeek(c)}`;
      else label = `Tháng ${c.getMonth() + 1}/${c.getFullYear()}`;
      buckets.push({ label, from: fromIso, to: toIso, span: fromIso === toIso ? fmtDMY(c) : `${fmtDM(c)} – ${fmtDMY(e)}`, events: 0, occ: 0, outside: 0, atOffice: 0, pending: 0 });
      c = addDays(e, 1);
    }
    for (const ev of events) {
      const b = buckets.find((x) => ev.date >= x.from && ev.date <= x.to);
      if (!b) continue;
      b.events += 1; b.occ += ev.leaderIds.length;
      if (ev.atOffice) b.atOffice += 1; else b.outside += 1;
      if (ev.status === 'cho_duyet') b.pending += 1;
    }
    const granLabel = { day: 'ngày', week: 'tuần', month: 'tháng' }[gran];
    sections.push({
      key: 'timeline', group: 'time', sheet: 'Theo thời gian',
      title: `Diễn biến theo ${granLabel}`,
      description: `Số sự kiện trong từng ${granLabel} của kỳ báo cáo.`,
      chart: 'events', chartType: 'column',
      columns: [
        { key: 'label', label: granLabel === 'ngày' ? 'Ngày' : granLabel === 'tuần' ? 'Tuần' : 'Tháng', type: 'text', pdfWidth: 70, xw: 18 },
        { key: 'span', label: 'Thời gian', type: 'text', xw: 24 },
        { key: 'events', label: 'Số sự kiện', type: 'int' },
        { key: 'occ', label: 'Lượt lãnh đạo', type: 'int' },
        { key: 'outside', label: 'Ngoài cơ quan', type: 'int' },
        { key: 'atOffice', label: 'Tại cơ quan', type: 'int' },
        { key: 'pending', label: 'Chờ duyệt', type: 'int' },
      ],
      rows: buckets.map(({ from: _f, to: _t, ...r }) => r),
      total: { label: 'Tổng cộng', events: totalEvents, occ: kc.occurrences, outside: kc.outside, atOffice: kc.atOffice, pending: events.filter((e) => e.status === 'cho_duyet').length },
    });

    const order = [1, 2, 3, 4, 5, 6, 0];
    const wd = order.map((dow) => {
      const list = events.filter((e) => e.dow === dow);
      return {
        label: WEEKDAY_LABEL[dow],
        sang: list.filter((e) => e.session === 'sang').length,
        chieu: list.filter((e) => e.session === 'chieu').length,
        caNgay: list.filter((e) => e.session === 'ca_ngay').length,
        gio: list.filter((e) => e.session === 'gio').length,
        events: list.length, share: ratio(list.length, totalEvents),
      };
    });
    const s = (k) => wd.reduce((n, r) => n + r[k], 0);
    sections.push({
      key: 'weekday', group: 'time', sheet: 'Theo thứ - buổi',
      title: 'Phân bố theo thứ trong tuần và buổi',
      description: 'Giúp nhận diện ngày, buổi tập trung nhiều hoạt động để điều phối lịch hợp lý.',
      chart: 'events',
      columns: [
        { key: 'label', label: 'Thứ', type: 'text', xw: 14 },
        { key: 'sang', label: 'Buổi sáng', type: 'int' },
        { key: 'chieu', label: 'Buổi chiều', type: 'int' },
        { key: 'caNgay', label: 'Cả ngày', type: 'int' },
        { key: 'gio', label: 'Theo giờ', type: 'int' },
        { key: 'events', label: 'Tổng sự kiện', type: 'int' },
        { key: 'share', label: 'Tỉ lệ', type: 'pct' },
      ],
      rows: wd,
      total: { label: 'Tổng cộng', sang: s('sang'), chieu: s('chieu'), caNgay: s('caNgay'), gio: s('gio'), events: totalEvents, share: totalEvents ? 1 : null },
    });
  }

  // ---------- 6. Địa bàn (xã/phường) + địa điểm ----------
  {
    const byCommune = new Map();
    for (const ev of events) {
      if (!ev.commune) continue;
      if (!byCommune.has(ev.commune)) byCommune.set(ev.commune, { label: titleCase(ev.commune), events: 0, occ: 0, units: new Set(), last: '' });
      const a = byCommune.get(ev.commune);
      a.events += 1; a.occ += ev.leaderIds.length;
      ev.units.forEach((u) => a.units.add(u.label));
      if (ev.date > a.last) a.last = ev.date;
    }
    const rows = [...byCommune.values()]
      .sort((a, b) => b.events - a.events || a.label.localeCompare(b.label, 'vi'))
      .map((a, i) => ({ stt: i + 1, label: a.label, events: a.events, occ: a.occ, units: [...a.units].join('; '), last: a.last }));
    const noCommune = events.filter((e) => !e.atOffice && !e.commune).length;
    sections.push({
      key: 'communes', group: 'places', sheet: 'Địa bàn xã phường',
      title: 'Địa bàn xã, phường, thị trấn đã đến làm việc',
      description: 'Nhận diện từ địa điểm có ghi "xã …", "phường …", "thị trấn …" (cùng quy tắc với cảnh báo trùng địa điểm).',
      chart: 'events',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
        { key: 'label', label: 'Xã / phường / thị trấn', type: 'text', xw: 28 },
        { key: 'events', label: 'Số sự kiện', type: 'int' },
        { key: 'occ', label: 'Lượt lãnh đạo', type: 'int' },
        { key: 'units', label: 'Đơn vị đã đến', type: 'text', xw: 50 },
        { key: 'last', label: 'Lần gần nhất', type: 'date', pdfWidth: 56, xw: 13 },
      ],
      rows,
      total: rows.length ? { label: `Tổng cộng: ${rows.length} địa bàn`, events: rows.reduce((n, r) => n + r.events, 0), occ: rows.reduce((n, r) => n + r.occ, 0) } : null,
      notes: noCommune > 0 ? [`Có ${noCommune} hoạt động ngoài cơ quan không ghi rõ xã/phường trong địa điểm (vd trụ sở các cơ quan cấp tỉnh) nên không tính vào bảng này.`] : [],
    });

    const byLoc = new Map();
    for (const ev of events) {
      if (ev.at_office || !ev.location.trim()) continue;
      const k = lower(ev.location);
      if (!byLoc.has(k)) byLoc.set(k, { label: ev.location.trim(), events: 0, units: new Set() });
      const a = byLoc.get(k);
      a.events += 1;
      ev.units.forEach((u) => a.units.add(u.label));
    }
    const LIMIT = 50;
    const all = [...byLoc.values()].sort((a, b) => b.events - a.events || a.label.localeCompare(b.label, 'vi'));
    sections.push({
      key: 'locations', group: 'places', sheet: 'Địa điểm',
      title: 'Các địa điểm có nhiều hoạt động',
      description: `${Math.min(LIMIT, all.length)} địa điểm diễn ra nhiều hoạt động nhất (gom theo cách ghi địa điểm, không phân biệt hoa/thường).`,
      chart: 'events',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
        { key: 'label', label: 'Địa điểm', type: 'text', xw: 50 },
        { key: 'events', label: 'Số sự kiện', type: 'int' },
        { key: 'units', label: 'Đơn vị', type: 'text', xw: 50 },
      ],
      rows: all.slice(0, LIMIT).map((a, i) => ({ stt: i + 1, label: a.label, events: a.events, units: [...a.units].join('; ') })),
      notes: all.length > LIMIT ? [`Còn ${all.length - LIMIT} địa điểm khác ít hoạt động hơn không liệt kê.`] : [],
    });
  }

  // ---------- 7. Quy trình duyệt lịch (người duyệt / cán bộ tổng hợp) ----------
  if (perms.process) {
    const scopedAll = cur.scoped;
    const totalAll = allEvents.length;
    sections.push({
      key: 'status', group: 'process', sheet: 'Trạng thái duyệt',
      title: 'Tình hình duyệt lịch',
      description: 'Tính trên TOÀN BỘ lịch trong kỳ (kể cả lịch bị từ chối), không phụ thuộc lựa chọn "Lịch được tính".',
      chart: 'events', chartStatus: true,
      columns: [
        { key: 'label', label: 'Trạng thái', type: 'text', xw: 24 },
        { key: 'events', label: 'Số sự kiện', type: 'int' },
        { key: 'share', label: 'Tỉ lệ', type: 'pct' },
        { key: 'occ', label: 'Số lượt (mục lịch)', type: 'int' },
      ],
      rows: Object.entries(STATUS).map(([k, v]) => {
        const n = allEvents.filter((e) => e.status === k).length;
        return { key: k, label: v.label, events: n, share: ratio(n, totalAll), occ: scopedAll.filter((e) => e.status === k).length };
      }),
      total: { label: 'Tổng cộng', events: totalAll, share: totalAll ? 1 : null, occ: scopedAll.length },
      notes: ['Sự kiện nhiều lãnh đạo có trạng thái khác nhau: tính theo trạng thái còn hiệu lực (chờ duyệt > đã điều chỉnh > đã duyệt); chỉ tính "Từ chối" khi mọi lãnh đạo đều bị từ chối.'],
    });

    // Người duyệt
    const entryEvent = new Map();
    for (const ev of allEvents) for (const e of ev.entries) entryEvent.set(e.id, ev);
    const rev = new Map();
    const seen = new Set();
    for (const e of scopedAll) {
      if (!e.reviewed_by || !['da_duyet', 'da_dieu_chinh', 'tu_choi'].includes(e.status)) continue;
      const ev = entryEvent.get(e.id);
      const k = `${ev?.id}|${e.reviewed_by}|${e.status}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!rev.has(e.reviewed_by)) {
        const p = profById[e.reviewed_by];
        rev.set(e.reviewed_by, { name: personName(e.reviewed_by), position: p?.position || ROLES[p?.role] || '', da_duyet: 0, da_dieu_chinh: 0, tu_choi: 0, hours: [] });
      }
      const a = rev.get(e.reviewed_by);
      a[e.status] += 1;
      const h = hoursBetween(ev?.createdAt || e.created_at, e.reviewed_at);
      if (h != null) a.hours.push(h);
    }
    const autoApproved = allEvents.filter((ev) => ev.status === 'da_duyet' && !ev.entries.some((e) => e.reviewed_by)).length;
    const rrows = [...rev.values()].sort((a, b) => (b.da_duyet + b.da_dieu_chinh + b.tu_choi) - (a.da_duyet + a.da_dieu_chinh + a.tu_choi))
      .map((a, i) => ({ stt: i + 1, name: a.name, position: a.position, da_duyet: a.da_duyet, da_dieu_chinh: a.da_dieu_chinh, tu_choi: a.tu_choi, total: a.da_duyet + a.da_dieu_chinh + a.tu_choi, avgHours: avg(a.hours) }));
    if (autoApproved) rrows.push({ stt: rrows.length + 1, name: 'Duyệt tự động khi nhập', position: 'Lịch TTr HĐND, Đoàn ĐBQH, làm việc tại cơ quan hoặc do người có thẩm quyền tự nhập', da_duyet: autoApproved, da_dieu_chinh: 0, tu_choi: 0, total: autoApproved, avgHours: null });
    sections.push({
      key: 'reviewers', group: 'process', sheet: 'Người duyệt',
      title: 'Kết quả xử lý của người duyệt',
      description: 'Số sự kiện mỗi người đã duyệt / điều chỉnh / từ chối và thời gian xử lý bình quân (từ lúc nhập lịch đến lúc duyệt).',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
        { key: 'name', label: 'Người duyệt', type: 'text', xw: 28 },
        { key: 'position', label: 'Chức vụ', type: 'text', xw: 36 },
        { key: 'da_duyet', label: 'Duyệt', type: 'int' },
        { key: 'da_dieu_chinh', label: 'Điều chỉnh', type: 'int' },
        { key: 'tu_choi', label: 'Từ chối', type: 'int' },
        { key: 'total', label: 'Tổng', type: 'int' },
        { key: 'avgHours', label: 'TB xử lý (giờ)', type: 'num', xw: 14 },
      ],
      rows: rrows,
      notes: ['Lịch đã sửa lại sau khi tạo được tính từ thời điểm tạo ban đầu, nên thời gian xử lý có thể dài hơn thực tế.'],
    });

    // Người nhập lịch & tính kịp thời (hạn: trước Thứ Hai của tuần công tác)
    const cr = new Map();
    for (const ev of allEvents) {
      const key = ev.createdBy || '?';
      if (!cr.has(key)) {
        const p = profById[ev.createdBy];
        cr.set(key, { name: ev.createdBy ? personName(ev.createdBy) : 'Không rõ người nhập', role: ROLES[p?.role] || '', total: 0, before: 0, during: 0, after: 0, unknown: 0, edited: 0 });
      }
      const a = cr.get(key);
      a.total += 1;
      if (ev.edited) a.edited += 1;
      const created = ev.createdAt ? new Date(ev.createdAt) : null;
      if (!created || Number.isNaN(+created)) { a.unknown += 1; continue; }
      const deadline = workWeekStart(parseISO(ev.date)); // 00:00 Thứ Hai của tuần công tác
      const createdDay = toISODate(created);
      if (created < deadline) a.before += 1;
      else if (createdDay <= ev.date) a.during += 1;
      else a.after += 1;
    }
    const crow = [...cr.values()].sort((a, b) => b.total - a.total).map((a, i) => ({
      stt: i + 1, name: a.name, role: a.role, total: a.total, before: a.before, during: a.during, after: a.after,
      onTime: ratio(a.before, a.total - a.unknown), edited: a.edited,
    }));
    const tsum = (k) => crow.reduce((n, r) => n + r[k], 0);
    const known = [...cr.values()].reduce((n, a) => n + a.total - a.unknown, 0);
    sections.push({
      key: 'creators', group: 'process', sheet: 'Người nhập lịch',
      title: 'Tình hình nhập lịch (tính kịp thời)',
      description: 'Đúng hạn = nhập trước 0 giờ Thứ Hai của tuần công tác (quy trình: thứ Sáu nhập lịch tuần sau). Phát sinh = nhập trong tuần, trước hoặc trong ngày diễn ra. Nhập bù = nhập sau ngày diễn ra.',
      chart: 'total',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
        { key: 'name', label: 'Người nhập', type: 'text', xw: 28 },
        { key: 'role', label: 'Vai trò', type: 'text', xw: 30 },
        { key: 'total', label: 'Số sự kiện', type: 'int' },
        { key: 'before', label: 'Đúng hạn', type: 'int' },
        { key: 'during', label: 'Phát sinh trong tuần', type: 'int' },
        { key: 'after', label: 'Nhập bù', type: 'int' },
        { key: 'onTime', label: 'Tỉ lệ đúng hạn', type: 'pct' },
        { key: 'edited', label: 'Sửa sau khi duyệt', type: 'int' },
      ],
      printColumns: ['stt', 'name', 'total', 'before', 'during', 'after', 'onTime', 'edited'],
      rows: crow,
      total: { name: 'Tổng cộng', total: tsum('total'), before: tsum('before'), during: tsum('during'), after: tsum('after'), onTime: ratio(tsum('before'), known), edited: tsum('edited') },
    });
  }

  // ---------- 8. Điều xe ô tô công vụ ----------
  if (perms.vehicle) {
    const trips = events.filter((e) => e.vehicle);
    const totalTrips = trips.length;
    const stOrder = ['de_xuat', 'da_phan_xe', 'da_duyet', 'tu_choi', 'none'];
    const stLabel = (k) => (k === 'none' ? 'Đã gán xe (trước khi áp dụng phiếu đề nghị)' : VEHICLE_STATUS[k]?.label || k);
    const signed = trips.filter((t) => t.vehicle.signed).length;
    const apprHours = trips.map((t) => hoursBetween(t.vehicle.requestedAt, t.vehicle.approvedAt)).filter((h) => h != null);
    sections.push({
      key: 'vehicleStatus', group: 'vehicles', sheet: 'Phiếu điều xe',
      title: 'Tình hình đề nghị và điều xe ô tô công vụ',
      description: 'Theo trạng thái phiếu đề nghị sử dụng xe (mỗi chuyến = một sự kiện có đề nghị bố trí xe).',
      chart: 'trips',
      columns: [
        { key: 'label', label: 'Trạng thái phiếu', type: 'text', xw: 40 },
        { key: 'trips', label: 'Số chuyến', type: 'int' },
        { key: 'share', label: 'Tỉ lệ', type: 'pct' },
        { key: 'riders', label: 'Số người đi', type: 'int' },
      ],
      rows: stOrder.map((k) => {
        const list = trips.filter((t) => t.vehicle.status === k);
        return { key: k, label: stLabel(k), trips: list.length, share: ratio(list.length, totalTrips), riders: list.reduce((n, t) => n + t.vehicle.riders, 0) };
      }).filter((r) => r.key !== 'none' || r.trips > 0),
      total: { label: 'Tổng cộng', trips: totalTrips, share: totalTrips ? 1 : null, riders: trips.reduce((n, t) => n + t.vehicle.riders, 0) },
      notes: [
        `Phiếu đã có bản PDF ký số: ${signed}/${trips.filter((t) => t.vehicle.status === 'da_duyet').length} phiếu đã duyệt.`,
        apprHours.length ? `Thời gian bình quân từ lúc đề nghị đến lúc Lãnh đạo Văn phòng duyệt: ${formatCell(avg(apprHours), 'num')} giờ.` : 'Chưa có phiếu đủ dữ liệu để tính thời gian xử lý.',
      ],
    });

    const use = new Map();
    const seedV = (v) => {
      if (!use.has(v.id)) use.set(v.id, { plate: v.plate, driver: v.driver_name || '', type: VEHICLE_TYPES[v.vehicle_type] || '', trips: 0, days: new Set(), slots: new Set() });
      return use.get(v.id);
    };
    for (const v of vehicles) if (v.active !== false && visibleVehicle(v)) seedV(v);
    let unassigned = 0;
    for (const t of trips) {
      const ids = t.vehicle.vehicleIds.filter((id) => visibleVehicle(vehicleById[id]));
      if (!t.vehicle.vehicleIds.length && t.vehicle.status !== 'tu_choi') unassigned += 1;
      for (const id of ids) {
        const a = seedV(vehicleById[id]);
        a.trips += 1; a.days.add(t.date);
        for (const s of t.slots) a.slots.add(`${t.date}|${s}`);
      }
    }
    const vrows = [...use.values()].sort((a, b) => b.trips - a.trips || a.plate.localeCompare(b.plate))
      .map((a, i) => ({ stt: i + 1, plate: a.plate, driver: a.driver, type: a.type, trips: a.trips, days: a.days.size, halfDays: a.slots.size }));
    sections.push({
      key: 'vehicleUsage', group: 'vehicles', sheet: 'Sử dụng xe',
      title: 'Tần suất sử dụng từng xe',
      description: 'Số chuyến, số ngày và số buổi mỗi xe được phân công phục vụ trong kỳ.',
      chart: 'trips',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
        { key: 'plate', label: 'Biển số', type: 'text', pdfWidth: 70, xw: 14 },
        { key: 'driver', label: 'Lái xe', type: 'text', xw: 24 },
        { key: 'type', label: 'Loại xe', type: 'text', xw: 26 },
        { key: 'trips', label: 'Số chuyến', type: 'int' },
        { key: 'days', label: 'Số ngày', type: 'int' },
        { key: 'halfDays', label: 'Số buổi', type: 'int' },
      ],
      rows: vrows,
      notes: [
        ...(unassigned ? [`Còn ${unassigned} chuyến có đề nghị nhưng chưa được phân xe.`] : []),
        ...(!perms.privateVehicles ? ['Không hiển thị xe riêng phục vụ lãnh đạo (theo phân quyền).'] : []),
      ],
    });

    const vu = new Map();
    for (const t of trips) {
      for (const u of t.units) {
        if (!vu.has(u.key)) vu.set(u.key, { ...u, trips: 0, approved: 0, waiting: 0, refused: 0, riders: 0 });
        const a = vu.get(u.key);
        a.trips += 1; a.riders += t.vehicle.riders;
        if (t.vehicle.status === 'da_duyet' || t.vehicle.status === 'none') a.approved += 1;
        else if (t.vehicle.status === 'tu_choi') a.refused += 1;
        else a.waiting += 1;
      }
    }
    sections.push({
      key: 'vehicleUnits', group: 'vehicles', sheet: 'Xe theo đơn vị',
      title: 'Nhu cầu xe theo đơn vị',
      description: 'Số chuyến các đơn vị đề nghị bố trí xe và kết quả xử lý.',
      chart: 'trips',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
        { key: 'label', label: 'Đơn vị', type: 'text', xw: 34 },
        { key: 'trips', label: 'Số chuyến đề nghị', type: 'int' },
        { key: 'approved', label: 'Đã duyệt', type: 'int' },
        { key: 'waiting', label: 'Đang xử lý', type: 'int' },
        { key: 'refused', label: 'Không bố trí được', type: 'int' },
        { key: 'riders', label: 'Số người đi', type: 'int' },
      ],
      rows: [...vu.values()].sort((a, b) => a.order - b.order).map((a, i) => ({ stt: i + 1, label: a.label, trips: a.trips, approved: a.approved, waiting: a.waiting, refused: a.refused, riders: a.riders })),
      total: { label: 'Tổng cộng (không trùng lặp)', trips: totalTrips, approved: trips.filter((t) => ['da_duyet', 'none'].includes(t.vehicle.status)).length, waiting: trips.filter((t) => ['de_xuat', 'da_phan_xe'].includes(t.vehicle.status)).length, refused: trips.filter((t) => t.vehicle.status === 'tu_choi').length, riders: trips.reduce((n, t) => n + t.vehicle.riders, 0) },
    });
  }

  // ---------- 9. Cảnh báo, việc cần xử lý ----------
  {
    const issues = [];
    const push = (ev, issue, level, extra = '') => issues.push({
      date: ev.date, time: timeLabel(ev), who: whoOf(ev), content: ev.content + (extra ? ` / ${extra}` : ''), issue, level, _entry: ev.entry,
    });
    for (const ev of allEvents) {
      if (ev.status === 'cho_duyet' && ev.date < today) push(ev, 'Đã qua ngày diễn ra nhưng lịch vẫn chờ duyệt', 'Cần xử lý');
    }
    for (const ev of events) {
      if (!ev.at_office && !ev.location.trim()) push(ev, 'Chưa ghi địa điểm', 'Cần bổ sung');
    }
    // Trùng thời gian của CÙNG một lãnh đạo (2 hoạt động khác nhau giao buổi/giờ)
    const byLeaderDay = new Map();
    for (const ev of events) {
      if (ev.at_office) continue;
      for (const id of ev.leaderIds) {
        const k = `${id}|${ev.date}`;
        if (!byLeaderDay.has(k)) byLeaderDay.set(k, []);
        byLeaderDay.get(k).push(ev);
      }
    }
    for (const [k, list] of byLeaderDay) {
      if (list.length < 2) continue;
      const lid = k.split('|')[0];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          if (!sessionsOverlap(list[i], list[j])) continue;
          issues.push({
            date: list[i].date, time: `${timeLabel(list[i])} / ${timeLabel(list[j])}`,
            who: leaderById[lid]?.full_name || 'Không rõ',
            content: `${list[i].content} / ${list[j].content}`,
            issue: 'Một lãnh đạo có 2 hoạt động trùng thời gian', level: 'Cần kiểm tra', _entry: list[i].entry,
          });
        }
      }
    }
    if (perms.vehicle) {
      for (const ev of events) {
        if (!ev.vehicle) continue;
        if (['de_xuat', 'da_phan_xe'].includes(ev.vehicle.status) && ev.date < today) push(ev, 'Chuyến đã qua ngày nhưng phiếu xe chưa được duyệt', 'Cần xử lý');
        else if (ev.vehicle.status === 'de_xuat' && ev.date >= today && differenceInCalendarDays(parseISO(ev.date), parseISO(today)) <= 1) push(ev, 'Chuyến sắp diễn ra (trong 1 ngày) chưa được phân xe', 'Khẩn');
        if (ev.vehicle.status === 'da_duyet' && !ev.vehicle.signed) push(ev, 'Phiếu xe đã duyệt nhưng chưa có bản PDF ký số', 'Cần bổ sung');
      }
    }
    const levelRank = { 'Khẩn': 0, 'Cần xử lý': 1, 'Cần kiểm tra': 2, 'Cần bổ sung': 3 };
    issues.sort((a, b) => (levelRank[a.level] ?? 9) - (levelRank[b.level] ?? 9) || a.date.localeCompare(b.date));
    sections.push({
      key: 'issues', group: 'issues', sheet: 'Cảnh báo',
      title: 'Cảnh báo và việc cần xử lý',
      description: 'Rà soát tự động: lịch quá hạn chưa duyệt, thiếu địa điểm, lãnh đạo trùng thời gian' + (perms.vehicle ? ', phiếu điều xe chưa hoàn tất' : '') + '.',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
        { key: 'level', label: 'Mức độ', type: 'text', pdfWidth: 50, xw: 13 },
        { key: 'date', label: 'Ngày', type: 'date', pdfWidth: 52, xw: 12 },
        { key: 'time', label: 'Thời gian', type: 'text', pdfWidth: 46, xw: 14 },
        { key: 'who', label: 'Lãnh đạo / Đơn vị', type: 'text', xw: 30 },
        { key: 'content', label: 'Nội dung', type: 'text', xw: 60 },
        { key: 'issue', label: 'Vấn đề', type: 'text', xw: 42 },
      ],
      printColumns: ['stt', 'level', 'date', 'who', 'content', 'issue'],
      rows: issues.map((r, i) => ({ stt: i + 1, ...r })),
      notes: ['Trùng thời gian có thể là hợp lý (dự khai mạc rồi chuyển sang hoạt động khác) — cần kiểm tra lại với đơn vị.'],
    });
  }

  // ---------- 10. Danh sách chi tiết (sổ theo dõi) ----------
  {
    const sorter = makeEntrySorter(leaders);
    const list = [...events].sort((a, b) => a.date.localeCompare(b.date)
      || sorter({ ...a.entry, _leaderIds: a.leaderIds }, { ...b.entry, _leaderIds: b.leaderIds }));
    const vehicleText = (ev) => {
      if (!ev.vehicle) return 'Không đề nghị';
      const plates = ev.vehicle.vehicleIds.map((id) => vehicleById[id]).filter(visibleVehicle).map((v) => v.plate);
      const st = ev.vehicle.status === 'none' ? 'Đã gán xe' : (VEHICLE_STATUS[ev.vehicle.status]?.label || '');
      return plates.length ? `${plates.join(', ')} (${st})` : st;
    };
    sections.push({
      key: 'detail', group: 'detail', sheet: 'Danh sách chi tiết',
      title: 'Danh sách chi tiết các hoạt động',
      description: 'Sổ theo dõi toàn bộ hoạt động trong kỳ (mỗi dòng một sự kiện).',
      columns: [
        { key: 'stt', label: 'STT', type: 'int', pdfWidth: 22, xw: 6 },
        { key: 'date', label: 'Ngày', type: 'date', pdfWidth: 50, xw: 12 },
        { key: 'weekday', label: 'Thứ', type: 'text', xw: 10 },
        { key: 'time', label: 'Thời gian', type: 'text', pdfWidth: 40, xw: 12 },
        { key: 'content', label: 'Nội dung', type: 'text', xw: 60 },
        { key: 'location', label: 'Địa điểm', type: 'text', xw: 36 },
        { key: 'who', label: 'Lãnh đạo / Đơn vị', type: 'text', xw: 36 },
        { key: 'units', label: 'Đơn vị', type: 'text', xw: 30 },
        { key: 'category', label: 'Loại hoạt động', type: 'text', xw: 26 },
        { key: 'statusLabel', label: 'Trạng thái', type: 'text', pdfWidth: 50, xw: 14 },
        ...(perms.vehicle ? [{ key: 'vehicle', label: 'Xe công vụ', type: 'text', xw: 30 }] : []),
        ...(perms.process ? [{ key: 'creator', label: 'Người nhập', type: 'text', xw: 24 }] : []),
      ],
      printColumns: ['stt', 'date', 'time', 'content', 'location', 'who', 'statusLabel'],
      rows: list.map((ev, i) => ({
        stt: i + 1, date: ev.date, weekday: WEEKDAY_LABEL[ev.dow], time: timeLabel(ev),
        content: ev.content, location: ev.at_office ? 'Làm việc tại cơ quan' : ev.location,
        who: whoOf(ev), units: ev.units.map((u) => u.label).join('; '),
        category: CATEGORY_LABEL[ev.category], categoryKey: ev.category,
        statusLabel: STATUS[ev.status]?.label || ev.status, status: ev.status,
        vehicle: vehicleText(ev), creator: ev.createdBy ? personName(ev.createdBy) : '',
        _entry: ev.entry,
      })),
    });
  }

  // ---------- Thông tin chung ----------
  const unitOptionLabel = (k) => {
    if (k === TRUONG_BAN_FILTER_KEY) return TRUONG_BAN_GROUP_NAME;
    const g = UNIT_GROUP_FILTERS.find((x) => x.value === k);
    if (g) return g.label;
    return banById[k]?.name || k;
  };
  const scopeParts = [];
  scopeParts.push(unitKeys.length ? unitKeys.map(unitOptionLabel).join('; ') : 'Toàn bộ: Thường trực HĐND tỉnh, Đoàn ĐBQH tỉnh, các Ban HĐND tỉnh, Lãnh đạo Văn phòng');
  if (leaderId) scopeParts.push(`lãnh đạo: ${leaderById[leaderId]?.full_name || ''}`);
  const statusLabel = {
    active: 'Lịch đã duyệt, đã điều chỉnh và đang chờ duyệt (không tính lịch bị từ chối)',
    approved: 'Chỉ lịch đã duyệt và đã điều chỉnh',
    all: 'Toàn bộ lịch, kể cả lịch bị từ chối',
  }[statusMode] || '';

  const meta = {
    unitName: UNIT_NAME,
    title: 'BÁO CÁO THỐNG KÊ',
    subtitle: 'Tình hình thực hiện lịch công tác',
    period: range,
    compare: compareRange && kp ? { kind: compareRange.kind, fullLabel: compareRange.fullLabel } : null,
    scopeLabel: scopeParts.join(' — '),
    statusLabel,
    generatedAt: now,
    generatedText: fmtStamp(now),
    author,
    today,
    fileBase: `Thong-ke-lich-cong-tac_${slugify(range.label)}`,
    notes: [
      'Sự kiện: một hoạt động trong một ngày. Nhiều lãnh đạo cùng tham gia (cùng nhóm, hoặc cùng ngày, buổi/giờ, nội dung và địa điểm) chỉ tính một sự kiện; hoạt động kéo dài nhiều ngày tính mỗi ngày một sự kiện.',
      'Lượt: mỗi lãnh đạo tham gia một sự kiện tính một lượt.',
      'Buổi: nửa ngày (sáng/chiều) có lịch của một lãnh đạo; "Cả ngày" tính 2 buổi; lịch theo giờ bắt đầu từ 12 giờ tính buổi chiều, kéo qua 13 giờ tính cả 2 buổi; nhiều hoạt động trong cùng một buổi của một người chỉ tính 1 buổi.',
      'Ngoài cơ quan: lịch không đánh dấu "Làm việc tại cơ quan" và địa điểm khác "Trụ sở Đoàn ĐBQH và HĐND tỉnh".',
      `Loại hoạt động được phân loại tự động theo từ khóa trong nội dung, theo thứ tự ưu tiên: ${ACTIVITY_CATEGORIES.filter((c) => c.words).map((c) => `${c.label} (${[...(c.re ? ['lễ'] : []), ...c.words].slice(0, 3).join(', ')}…)`).join('; ')}; còn lại là "Hoạt động khác".`,
      `Lịch được tính: ${statusLabel}.`,
      `Số liệu trích xuất từ Hệ thống quản lý lịch công tác lúc ${fmtStamp(now)}; lịch phát sinh hoặc điều chỉnh sau thời điểm này chưa được phản ánh.`,
    ],
  };

  return { meta, kpis, sections };
}

// Nhóm hiển thị trên màn hình (mỗi nhóm một thẻ con)
export const STAT_GROUPS = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'units', label: 'Theo đơn vị' },
  { key: 'leaders', label: 'Theo lãnh đạo' },
  { key: 'categories', label: 'Loại hoạt động' },
  { key: 'time', label: 'Theo thời gian' },
  { key: 'places', label: 'Địa bàn' },
  { key: 'process', label: 'Duyệt & nhập lịch', perm: 'process' },
  { key: 'vehicles', label: 'Điều xe', perm: 'vehicle' },
  { key: 'issues', label: 'Cảnh báo' },
  { key: 'detail', label: 'Danh sách chi tiết' },
];
