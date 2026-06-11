import { useMemo } from 'react';
import { UNIT_NAME } from '../lib/constants';
import { weekDays, toISODate, dayName, fmtDM, fmtDMY, fmtTime, weekStart, weekEnd, getISOWeek } from '../lib/dates';

/**
 * BẢN IN lịch tuần theo định dạng công văn (A4 DỌC) — chỉ hiện khi in.
 * Bảng theo ngày: Ngày | Thời gian | Nội dung | Địa điểm | Đơn vị/Lãnh đạo | Thành phần.
 * - Các mục giống nhau (nhiều đơn vị cùng dự) được gộp 1 hàng.
 * - Cột Đơn vị/Lãnh đạo: nếu Thành phần khớp với một "Nhóm thành phần" đã định
 *   nghĩa thì ghi GỌN bằng tên nhóm (vd "Thường trực HĐND tỉnh").
 */
export default function WeekPrintSheet({ anchor, entries, leaders, groups }) {
  const days = useMemo(() => weekDays(anchor), [anchor]);
  const leaderById = useMemo(() => Object.fromEntries((leaders || []).map((l) => [l.id, l])), [leaders]);

  const ws = weekStart(anchor), we = weekEnd(anchor);

  // Sắp xếp trong ngày: cả ngày -> sáng -> chiều (theo giờ nếu có)
  const sortKey = (e) => {
    if (e.session === 'ca_ngay') return '0';
    if (e.session === 'gio') return e.start_time || '08:00';
    return e.session === 'sang' ? '08:00' : '14:00';
  };

  // Gộp mục giống nhau (cùng nội dung + buổi/giờ + địa điểm) thành 1 hàng
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
    return out.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  };

  const timeLabel = (e) => {
    if (e.session === 'gio') return `${fmtTime(e.start_time)}${e.end_time ? ' - ' + fmtTime(e.end_time) : ''}`;
    return e.session === 'sang' ? 'Sáng' : e.session === 'chieu' ? 'Chiều' : 'Cả ngày';
  };

  // THÀNH PHẦN GỌN (cột gộp Đơn vị/Lãnh đạo + Thành phần):
  // - Nếu danh sách chứa đủ TÊN mọi thành viên của một Nhóm thành phần
  //   -> các mục đó được THAY bằng tên nhóm; phần còn lại (cán bộ tham dự,
  //   đơn vị ngoài...) giữ nguyên.
  // - So khớp mềm: chữ thường, bỏ thừa khoảng trắng, chỉ cần khớp phần TÊN
  //   trước dấu phẩy (không phụ thuộc chức vụ, thứ tự).
  // - Thành phần trống -> ghi tên lãnh đạo/đơn vị của mục lịch.
  const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const compactParticipants = (m) => {
    let segs = m._parts.join('; ').split(';').map((s) => s.trim()).filter(Boolean);
    const segName = (s) => norm(s.split(',')[0]);
    for (const g of groups || []) {
      if (!g.members || !g.name) continue;
      const memberNames = g.members.split(';').map((x) => norm(x.split(',')[0])).filter(Boolean);
      if (!memberNames.length) continue;
      const present = memberNames.every((n) => segs.some((s) => norm(s).includes(n)));
      if (!present) continue;
      let inserted = false;
      segs = segs.flatMap((s) => {
        const isMember = memberNames.some((n) => segName(s) === n || segName(s).startsWith(n));
        if (!isMember) return [s];
        // Giữ phần thông tin thêm sau dấu chấm (vd "... Cán bộ tham dự: ...")
        const dot = s.indexOf('. ');
        const tail = dot > -1 ? [s.slice(dot + 1).trim()] : [];
        if (!inserted) { inserted = true; return [g.name, ...tail]; }
        return tail;
      });
      if (!inserted) segs.unshift(g.name);
    }
    const text = [...new Set(segs)].join('; ');
    if (text) return text;
    return [...new Set(m._leaderIds.map((id) => leaderById[id]?.full_name).filter(Boolean))].join('; ');
  };

  const td = { border: '0.5pt solid #000', padding: '4px 5px', verticalAlign: 'top', wordWrap: 'break-word' };
  const th = { ...td, fontWeight: 700, textAlign: 'center', verticalAlign: 'middle' };

  return (
    <div className="hidden print:block print-root" style={{ fontFamily: "'Times New Roman', Times, serif", color: '#000' }}>
      {/* Tiêu đề kiểu công văn */}
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <p style={{ fontSize: 12, textTransform: 'uppercase' }}>{UNIT_NAME}</p>
        <p style={{ fontSize: 17, fontWeight: 700, marginTop: 6 }}>LỊCH CÔNG TÁC TUẦN</p>
        <p style={{ fontSize: 13, marginTop: 2 }}>của lãnh đạo HĐND tỉnh, lãnh đạo Đoàn ĐBQH tỉnh và các Ban HĐND tỉnh</p>
        <p style={{ fontSize: 13, fontStyle: 'italic', marginTop: 2 }}>
          Tuần thứ {getISOWeek(ws)} năm {ws.getFullYear()} <b>(từ ngày {fmtDMY(ws)} đến ngày {fmtDMY(we)})</b>
        </p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: 11.5, lineHeight: 1.4 }}>
        <colgroup>
          <col style={{ width: '9%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '33%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '33%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={th}>Ngày</th>
            <th style={th}>Thời gian</th>
            <th style={th}>Nội dung công việc</th>
            <th style={th}>Địa điểm</th>
            <th style={th}>Thành phần</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const dISO = toISODate(d);
            const list = mergeDay((entries || []).filter((e) => e.date === dISO && e.status !== 'tu_choi'));
            const dayCell = (
              <td style={{ ...td, textAlign: 'center', verticalAlign: 'middle', fontWeight: 700 }} rowSpan={Math.max(list.length, 1)}>
                {dayName(d)}<br /><span style={{ fontWeight: 400 }}>{fmtDM(d)}</span>
              </td>
            );
            if (list.length === 0) {
              return (
                <tr key={dISO}>
                  {dayCell}
                  <td style={td} colSpan={4}>&nbsp;</td>
                </tr>
              );
            }
            return list.map((m, i) => (
              <tr key={m.id}>
                {i === 0 && dayCell}
                <td style={{ ...td, textAlign: 'center' }}>{timeLabel(m)}</td>
                <td style={td}>
                  {m.content}
                  {m.status === 'cho_duyet' && <i> (chờ duyệt)</i>}
                  {m.status === 'da_dieu_chinh' && m.review_note && <i> ({m.review_note})</i>}
                </td>
                <td style={td}>{m.location || ''}</td>
                <td style={td}>{compactParticipants(m)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}
