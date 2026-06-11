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
