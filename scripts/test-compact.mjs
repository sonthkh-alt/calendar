// Kiểm chứng logic gộp Thành phần theo nhóm (chạy: node scripts/test-compact.mjs)
const norm = (s) => (s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/đ/g, 'd')
  .replace(/\s+/g, ' ')
  .trim();

// Dữ liệu nhóm THẬT của người dùng (theo ảnh chụp tab Quản trị 12/6)
const groups = [
  { name: 'Thường trực HĐND tỉnh', members: 'Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh; Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh; Đ/c Lương Tiến Thành, Trưởng Ban DT; Đ/c Nguyễn Quốc Hải, Trưởng Ban PC; Đ/c Hoàng Anh Tuấn, Tỉnh ủy viên, Trưởng Ban KTNS; Đ/c Ngô Thị Hồng Hảo, Tỉnh ủy viên, Trưởng Ban VHXH' },
  { name: 'Đoàn ĐBQH tỉnh', members: 'Đ/c Lương Thị Hoa, Tỉnh ủy viên, Phó Trưởng Đoàn ĐBQH tỉnh; Đ/c Bùi Văn Dũng, ĐBQH chuyên trách' },
  { name: 'Trưởng các Ban HĐND tỉnh', members: 'Đ/c Lương Tiến Thành, Trưởng Ban DT; Đ/c Hoàng Anh Tuấn, Tỉnh ủy viên, Trưởng Ban KTNS; Đ/c Ngô Thị Hồng Hảo, Tỉnh ủy viên, Trưởng Ban VHXH; Đ/c Nguyễn Quốc Hải, Trưởng Ban PC' },
  { name: 'Lãnh đạo các Ban HĐND tỉnh', members: 'Đ/c Hoàng Anh Tuấn, Tỉnh ủy viên, Trưởng Ban KTNS; Đ/c Ngô Thị Hồng Hảo, Tỉnh ủy viên, Trưởng Ban VHXH; Đ/c Đỗ Ngọc Duy, PTB KTNS; Đ/c Lê Thị Hương, PTB PC; Đ/c Nguyễn Quốc Hải, Trưởng Ban PC; Đ/c Lương Tiến Thành, Trưởng Ban DT; Đ/c Cầm Bá Chái, PTB DT; Đ/c Nguyễn Tuấn Tưởng, PTB VHXH' },
  { name: 'Lãnh đạo Văn phòng', members: 'Đ/c Trần Mạnh Long, Chánh Văn phòng; Đ/c Hà Ngọc Sơn, Phó Chánh Văn phòng; Đ/c Lê Văn Mạnh, Phó Chánh Văn phòng' },
  { name: 'Toàn thể cơ quan', members: 'Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh; Đ/c Lương Tiến Thành, Trưởng Ban DT; Đ/c Cầm Bá Chái, PTB DT; Đ/c Nguyễn Tuấn Tưởng, PTB VHXH; Đ/c Nguyễn Quốc Hải, Trưởng Ban PC; Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh; Đ/c Lương Thị Hoa, Tỉnh ủy viên, Phó Trưởng Đoàn ĐBQH tỉnh; Đ/c Bùi Văn Dũng, ĐBQH chuyên trách; Đ/c Hoàng Anh Tuấn, Tỉnh ủy viên, Trưởng Ban KTNS; Đ/c Ngô Thị Hồng Hảo, Tỉnh ủy viên, Trưởng Ban VHXH; Đ/c Trần Mạnh Long, Chánh Văn phòng; Đ/c Lê Thị Hương, PTB PC; Đ/c Hà Ngọc Sơn, Phó Chánh Văn phòng; Đ/c Đỗ Ngọc Duy, PTB KTNS; Đ/c Lê Văn Mạnh, Phó Chánh Văn phòng' },
];

function compactParticipants(parts) {
  let segs = parts.join('; ').split(';').map((s) => s.trim()).filter(Boolean);
  const segName = (s) => norm(s.split(',')[0]);
  const ordered = [...groups].sort((a, b) =>
    (b.members || '').split(';').length - (a.members || '').split(';').length);
  for (const g of ordered) {
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
  // 1. Đủ 6 thành viên Thường trực (nhập bằng tick nhóm) + cán bộ tham dự
  [['Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh; Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh; Đ/c Lương Tiến Thành, Trưởng Ban DT; Đ/c Nguyễn Quốc Hải, Trưởng Ban PC; Đ/c Hoàng Anh Tuấn, Tỉnh ủy viên, Trưởng Ban KTNS; Đ/c Ngô Thị Hồng Hảo, Tỉnh ủy viên, Trưởng Ban VHXH. Cán bộ tham dự: Đ/c Sơn, PCVP'],
   '-> Thường trực HĐND tỉnh; Cán bộ tham dự: Đ/c Sơn, PCVP'],
  // 2. Chỉ 4 Trưởng Ban -> phải ra "Trưởng các Ban HĐND tỉnh" (không nhầm Thường trực)
  [['Đ/c Lương Tiến Thành, Trưởng Ban DT; Đ/c Hoàng Anh Tuấn, Trưởng Ban KTNS; Đ/c Ngô Thị Hồng Hảo, Trưởng Ban VHXH; Đ/c Nguyễn Quốc Hải, Trưởng Ban PC'],
   '-> Trưởng các Ban HĐND tỉnh'],
  // 3. Đủ 8 lãnh đạo Ban -> phải ra nhóm LỚN "Lãnh đạo các Ban", không tách thành Trưởng+lẻ
  [['Đ/c Hoàng Anh Tuấn, Trưởng Ban KTNS; Đ/c Ngô Thị Hồng Hảo, Trưởng Ban VHXH; Đ/c Đỗ Ngọc Duy, PTB KTNS; Đ/c Lê Thị Hương, PTB PC; Đ/c Nguyễn Quốc Hải, Trưởng Ban PC; Đ/c Lương Tiến Thành, Trưởng Ban DT; Đ/c Cầm Bá Chái, PTB DT; Đ/c Nguyễn Tuấn Tưởng, PTB VHXH'],
   '-> Lãnh đạo các Ban HĐND tỉnh'],
  // 4. Chỉ 2 PCT -> KHÔNG đủ 6 người của nhóm Thường trực -> giữ nguyên 2 tên
  [['Đ/c Lê Tiến Lam, PCT Thường trực HĐND tỉnh; Đ/c Nguyễn Quang Hải, PCT HĐND tỉnh'],
   '-> giữ nguyên 2 tên (nhóm Thường trực cần đủ 6 người)'],
  // 5. Thường trực (6 người) + Đoàn ĐBQH (2 người) cùng dự
  [['Đ/c Lê Tiến Lam, UV BTV; Đ/c Nguyễn Quang Hải, TUV; Đ/c Lương Tiến Thành, TB DT; Đ/c Nguyễn Quốc Hải, TB PC; Đ/c Hoàng Anh Tuấn, TB KTNS; Đ/c Ngô Thị Hồng Hảo, TB VHXH', 'Đ/c Lương Thị Hoa, Phó Trưởng Đoàn; Đ/c Bùi Văn Dũng, ĐBQH chuyên trách'],
   '-> Thường trực HĐND tỉnh; Đoàn ĐBQH tỉnh'],
  // 6. Lãnh đạo Văn phòng đủ 3 đ/c
  [['Đ/c Trần Mạnh Long, Chánh Văn phòng; Đ/c Hà Ngọc Sơn, PCVP; Đ/c Lê Văn Mạnh, PCVP'],
   '-> Lãnh đạo Văn phòng'],
  // 7. TÌNH HUỐNG THẬT (in "Học Nghị quyết"): 15 tên KHÔNG chức vụ, mã Unicode
  //    TỔ HỢP (NFD) khác với nhóm (NFC) -> trước đây trượt khớp
  [['Đ/c Hà Ngọc Sơn; Đ/c Lê Tiến Lam; Đ/c Nguyễn Quang Hải; Đ/c Lương Thị Hoa; Đ/c Bùi Văn Dũng; Đ/c Hoàng Anh Tuấn; Đ/c Đỗ Ngọc Duy; Đ/c Lê Thị Hương; Đ/c Nguyễn Quốc Hải; Đ/c Ngô Thị Hồng Hảo; Đ/c Nguyễn Tuấn Tưởng; Đ/c Lương Tiến Thành; Đ/c Cầm Bá Chái; Đ/c Lê Văn Mạnh; Đ/c Trần Mạnh Long'.normalize('NFD')],
   '-> Toàn thể cơ quan'],
];

let ok = 0;
for (const [parts, expect] of cases) {
  const out = compactParticipants(parts);
  console.log(`VÀO : ${parts.join(' | ')}\nRA  : ${out}\n(mong đợi: ${expect})\n---`);
  ok++;
}
console.log(`Đã chạy ${ok} ca kiểm thử.`);
