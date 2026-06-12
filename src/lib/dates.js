// Tiện ích ngày tháng — tuần làm việc Việt Nam: Thứ Hai -> Chủ nhật
import {
  startOfWeek, endOfWeek, addDays, addWeeks, addMonths,
  startOfMonth, endOfMonth, format, isSameDay, isSameMonth, parseISO, getISOWeek,
} from 'date-fns';
import { vi } from 'date-fns/locale';

export const WEEK_OPTS = { weekStartsOn: 1 }; // Thứ Hai

export const weekStart = (d) => startOfWeek(d, WEEK_OPTS);
export const weekEnd = (d) => endOfWeek(d, WEEK_OPTS);
export { addDays, addWeeks, addMonths, startOfMonth, endOfMonth, isSameDay, isSameMonth, parseISO, getISOWeek };

// 7 ngày của tuần chứa d (Thứ Hai -> Chủ nhật)
export const weekDays = (d) => Array.from({ length: 7 }, (_, i) => addDays(weekStart(d), i));

// 'yyyy-MM-dd' cho cột date của Postgres
export const toISODate = (d) => format(d, 'yyyy-MM-dd');

// 'Thứ Hai', 'Chủ Nhật'...
export const dayName = (d) => {
  const s = format(d, 'EEEE', { locale: vi });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export const fmtDM = (d) => format(d, 'dd/MM');
export const fmtDMY = (d) => format(d, 'dd/MM/yyyy');

// Chuyển đổi giữa ISO ('yyyy-MM-dd' — định dạng lưu DB) và hiển thị 'dd/MM/yyyy'
export const isoToDMY = (iso) => {
  const [y, m, d] = (iso || '').split('-');
  return y && m && d ? `${d}/${m}/${y}` : '';
};
// 'dd/MM/yyyy' (chấp nhận d/M/yyyy, ngăn cách / - .) -> 'yyyy-MM-dd'; null nếu sai
export const dmyToISO = (s) => {
  const m = (s || '').trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

// Nhãn tuần: 'Tuần 24: 08/06 – 14/06/2026'
export const weekLabel = (d) => {
  const ws = weekStart(d), we = weekEnd(d);
  return `Tuần ${getISOWeek(ws)}: ${fmtDM(ws)} – ${fmtDMY(we)}`;
};

// 'hh:mm' từ time Postgres ('08:30:00' -> '08:30')
export const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');

// Lưới tháng: mảng các tuần (mỗi tuần 7 ngày) phủ kín tháng chứa d
export const monthGrid = (d) => {
  const first = weekStart(startOfMonth(d));
  const last = weekEnd(endOfMonth(d));
  const weeks = [];
  let cur = first;
  while (cur <= last) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(cur, i)));
    cur = addDays(cur, 7);
  }
  return weeks;
};

// ===== ÂM LỊCH (thuật toán Hồ Ngọc Đức, múi giờ +7) =====
function jdFromDate(dd, mm, yy) {
  const a = Math.floor((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
  if (jd < 2299161) jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  return jd;
}
function getNewMoonDay(k, tz) {
  const T = k / 1236.85;
  const T2 = T * T, T3 = T2 * T, dr = Math.PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr) + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat = T < -11
    ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
    : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return Math.floor(Jd1 + C1 - deltat + 0.5 + tz / 24);
}
function getSunLongitude(jdn, tz) {
  const T = (jdn - 2451545.5 - tz / 24) / 36525;
  const T2 = T * T, dr = Math.PI / 180;
  const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L = L - Math.PI * 2 * Math.floor(L / (Math.PI * 2));
  return Math.floor(L / Math.PI * 6);
}
function getLunarMonth11(yy, tz) {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = Math.floor(off / 29.530588853);
  let nm = getNewMoonDay(k, tz);
  if (getSunLongitude(nm, tz) >= 9) nm = getNewMoonDay(k - 1, tz);
  return nm;
}
function getLeapMonthOffset(a11, tz) {
  const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last = 0, i = 1;
  let arc = getSunLongitude(getNewMoonDay(k + i, tz), tz);
  do { last = arc; i++; arc = getSunLongitude(getNewMoonDay(k + i, tz), tz); } while (arc !== last && i < 14);
  return i - 1;
}
// Đổi ngày dương -> âm: trả { day, month, year, leap }
export function solarToLunar(date) {
  const tz = 7;
  const dd = date.getDate(), mm = date.getMonth() + 1, yy = date.getFullYear();
  const dayNumber = jdFromDate(dd, mm, yy);
  const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = getNewMoonDay(k + 1, tz);
  if (monthStart > dayNumber) monthStart = getNewMoonDay(k, tz);
  let a11 = getLunarMonth11(yy, tz), b11 = a11, lunarYear;
  if (a11 >= monthStart) { lunarYear = yy; a11 = getLunarMonth11(yy - 1, tz); }
  else { lunarYear = yy + 1; b11 = getLunarMonth11(yy + 1, tz); }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = Math.floor((monthStart - a11) / 29);
  let lunarLeap = 0, lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapMonthDiff = getLeapMonthOffset(a11, tz);
    if (diff >= leapMonthDiff) { lunarMonth = diff + 10; if (diff === leapMonthDiff) lunarLeap = 1; }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { day: lunarDay, month: lunarMonth, year: lunarYear, leap: lunarLeap };
}

// Hai mục lịch có giao nhau về thời gian trong cùng một ngày không?
// (dùng cho cảnh báo trùng xe / trùng lịch lãnh đạo)
export function sessionsOverlap(a, b) {
  // a, b: { session, start_time, end_time }
  if (a.session === 'ca_ngay' || b.session === 'ca_ngay') return true;
  if (a.session === 'gio' && b.session === 'gio') {
    const s1 = a.start_time || '00:00', e1 = a.end_time || '23:59';
    const s2 = b.start_time || '00:00', e2 = b.end_time || '23:59';
    return s1 < e2 && s2 < e1;
  }
  // 'gio' so với buổi: sáng = trước 12:00, chiều = từ 12:00
  const sessionOf = (x) => {
    if (x.session !== 'gio') return x.session;
    return (x.start_time || '08:00') < '12:00' ? 'sang' : 'chieu';
  };
  return sessionOf(a) === sessionOf(b);
}
