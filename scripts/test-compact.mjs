// Kiểm chứng logic gộp Thành phần theo nhóm (chạy: node scripts/test-compact.mjs)
const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const groups = [
  { name: 'Thường trực HĐND tỉnh', members: 'Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh; Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh' },
  { name: 'Lãnh đạo Đoàn ĐBQH tỉnh', members: 'Đ/c Lương Thị Hoa, Tỉnh ủy viên, Phó Trưởng Đoàn ĐBQH tỉnh; Đ/c Bùi Văn Dũng, ĐBQH chuyên trách' },
];

function compactParticipants(parts) {
  let segs = parts.join('; ').split(';').map((s) => s.trim()).filter(Boolean);
  const segName = (s) => norm(s.split(',')[0]);
  for (const g of groups) {
    if (!g.members || !g.name) continue;
    const memberNames = g.members.split(';').map((x) => norm(x.split(',')[0])).filter(Boolean);
    if (!memberNames.length) continue;
    const present = memberNames.every((n) => segs.some((s) => norm(s).includes(n)));
    if (!present) continue;
    let inserted = false;
    segs = segs.flatMap((s) => {
      const isMember = memberNames.some((n) => segName(s) === n || segName(s).startsWith(n));
      if (!isMember) return [s];
      const dot = s.indexOf('. ');
      const tail = dot > -1 ? [s.slice(dot + 1).trim()] : [];
      if (!inserted) { inserted = true; return [g.name, ...tail]; }
      return tail;
    });
    if (!inserted) segs.unshift(g.name);
  }
  return [...new Set(segs)].join('; ');
}

const cases = [
  // 1. Nguyên văn đầy đủ chức vụ + cán bộ tham dự kèm theo
  [['Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh; Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh. Cán bộ tham dự: các đ/c Trưởng các Ban; CVP'],
   'Thường trực HĐND tỉnh + giữ phần cán bộ tham dự'],
  // 2. Chỉ tên, KHÔNG chức vụ, khác thứ tự, khác hoa thường
  [['đ/c nguyễn quang hải; Đ/C LÊ TIẾN LAM'], 'chỉ còn tên nhóm'],
  // 3. Gộp 2 nhóm (2 mục merge từ 2 entry)
  [['Đ/c Lê Tiến Lam, UV BTV; Đ/c Nguyễn Quang Hải, TUV', 'Đ/c Lương Thị Hoa, Phó Trưởng Đoàn; Đ/c Bùi Văn Dũng, ĐBQH chuyên trách'], '2 tên nhóm'],
  // 4. Chỉ 1 thành viên -> KHÔNG gộp
  [['Đ/c Lê Tiến Lam, Ủy viên BTV Tỉnh ủy'], 'giữ nguyên (thiếu đ/c Hải)'],
  // 5. Đã ghi sẵn tên nhóm
  [['Thường trực HĐND tỉnh và lãnh đạo các Ban'], 'giữ nguyên, không lặp'],
];

let ok = 0;
for (const [parts, expect] of cases) {
  const out = compactParticipants(parts);
  console.log(`VÀO : ${parts.join(' | ')}\nRA  : ${out}\n(mong đợi: ${expect})\n---`);
  ok++;
}
console.log(`Đã chạy ${ok} ca kiểm thử.`);
