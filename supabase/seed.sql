-- =====================================================================
--  DỮ LIỆU KHỞI TẠO — CHỈ CHẠY 1 LẦN khi mới tạo cơ sở dữ liệu
--  (chạy SAU schema.sql trong Supabase SQL Editor)
--  Lịch nhập theo "LỊCH LÀM VIỆC của lãnh đạo Thường trực HĐND tỉnh và
--  lãnh đạo Đoàn ĐBQH tỉnh — Tuần thứ 24 năm 2026 (08/6 - 14/6/2026)".
--
--  ⚠️ CẢNH BÁO: file này NẠP DỮ LIỆU MẪU. Để bảo vệ dữ liệu thật đã
--  nhập/sửa trên web, script TỰ DỪNG nếu phát hiện đã có dữ liệu.
--  Khi nâng cấp cấu trúc về sau: CHỈ cần chạy schema.sql (an toàn,
--  không mất dữ liệu) — KHÔNG chạy lại file này.
-- =====================================================================

-- CHỐT AN TOÀN: đã có dữ liệu -> dừng ngay, không xóa gì cả
do $$ begin
  if exists (select 1 from leaders) then
    raise exception E'ĐÃ CÓ DỮ LIỆU TRONG HỆ THỐNG — seed.sql chỉ dành cho lần khởi tạo đầu tiên.\nDữ liệu hiện tại KHÔNG bị thay đổi.\nNếu thật sự muốn XÓA TOÀN BỘ và nạp lại dữ liệu mẫu: bỏ chú thích khối DELETE trong file rồi chạy lại.';
  end if;
end $$;

-- Khối RESET (bình thường để nguyên; CHỈ bỏ chú thích khi cố ý xóa toàn bộ):
-- delete from schedule_entries;
-- delete from vehicles;
-- delete from participant_groups;
-- update profiles set leader_id = null, ban_ids = '{}';
-- delete from leaders;
-- delete from bans;

-- 1) Bốn Ban của HĐND tỉnh
insert into bans (id, name, short_name, sort_order) values
  ('11111111-1111-1111-1111-111111111101', 'Ban Kinh tế Ngân sách', 'Kinh tế Ngân sách', 1),
  ('11111111-1111-1111-1111-111111111102', 'Ban Pháp chế',          'Pháp chế',          2),
  ('11111111-1111-1111-1111-111111111103', 'Ban Văn hóa Xã hội',    'Văn hóa Xã hội',    3),
  ('11111111-1111-1111-1111-111111111104', 'Ban Dân tộc',           'Dân tộc',           4);

-- 2) Đối tượng có lịch:
--    - Lãnh đạo HĐND tỉnh (đích danh, gộp 1 cột) + Đoàn ĐBQH tỉnh (đích danh, 1 cột)
--    - 4 đơn vị Ban (mỗi Ban 1 cột; tên thành viên ghi trong nội dung)
--    - Lãnh đạo Văn phòng (cột trực lãnh đạo Văn phòng cuối tuần)
insert into leaders (id, full_name, position, leader_type, ban_id, sort_order, active) values
  -- Lãnh đạo HĐND tỉnh
  ('22222222-2222-2222-2222-222222222201', 'Lê Tiến Lam',      'Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh', 'pct',  null, 1, true),
  ('22222222-2222-2222-2222-222222222202', 'Nguyễn Quang Hải', 'Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh',                              'pct',  null, 2, true),
  -- Đoàn ĐBQH tỉnh
  ('22222222-2222-2222-2222-222222222203', 'Lương Thị Hoa',    'Tỉnh ủy viên, Phó Trưởng Đoàn ĐBQH tỉnh',                           'doan', null, 3, true),
  ('22222222-2222-2222-2222-222222222204', 'Bùi Văn Dũng',     'ĐBQH chuyên trách',                                                  'doan', null, 4, true),
  -- Các Ban
  ('22222222-2222-2222-2222-222222222210', 'Ban Kinh tế Ngân sách', '', 'ban', '11111111-1111-1111-1111-111111111101', 5, true),
  ('22222222-2222-2222-2222-222222222220', 'Ban Pháp chế',          '', 'ban', '11111111-1111-1111-1111-111111111102', 6, true),
  ('22222222-2222-2222-2222-222222222230', 'Ban Văn hóa Xã hội',    '', 'ban', '11111111-1111-1111-1111-111111111103', 7, true),
  ('22222222-2222-2222-2222-222222222240', 'Ban Dân tộc',           '', 'ban', '11111111-1111-1111-1111-111111111104', 8, true),
  -- Văn phòng (hiển thị mục trực lãnh đạo Văn phòng)
  ('22222222-2222-2222-2222-222222222250', 'Lãnh đạo Văn phòng',    '', 'vanphong', null, 9, true);

-- 3) Bốn xe công vụ (biển số/lái xe MẪU — sửa trong tab Quản trị)
insert into vehicles (id, plate, driver_name, driver_phone, vehicle_type, assigned_leader_id, active) values
  ('33333333-3333-3333-3333-333333333301', '36A-001.01', 'Lái xe 1', '0912000001', 'rieng',      '22222222-2222-2222-2222-222222222201', true),
  ('33333333-3333-3333-3333-333333333302', '36A-002.02', 'Lái xe 2', '0912000002', 'rieng',      '22222222-2222-2222-2222-222222222202', true),
  ('33333333-3333-3333-3333-333333333303', '36A-003.03', 'Lái xe 3', '0912000003', 'dung_chung', null, true),
  ('33333333-3333-3333-3333-333333333304', '36A-004.04', 'Lái xe 4', '0912000004', 'dung_chung', null, true);

-- 3b) Nhóm thành phần dự họp — tick nhanh khi nhập lịch (sửa ở tab Quản trị)
insert into participant_groups (name, members, sort_order) values
  ('Thường trực HĐND tỉnh',
   'Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh; Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh', 1),
  ('Lãnh đạo Đoàn ĐBQH tỉnh',
   'Đ/c Lương Thị Hoa, Tỉnh ủy viên, Phó Trưởng Đoàn ĐBQH tỉnh; Đ/c Bùi Văn Dũng, ĐBQH chuyên trách', 2),
  ('Trưởng các Ban HĐND tỉnh',
   'Các đ/c Trưởng Ban: Kinh tế Ngân sách, Pháp chế, Văn hóa Xã hội, Dân tộc', 3),
  ('Lãnh đạo các Ban HĐND tỉnh',
   'Lãnh đạo các Ban: Kinh tế Ngân sách, Pháp chế, Văn hóa Xã hội, Dân tộc', 4),
  ('Lãnh đạo Văn phòng',
   'Đ/c Trần Mạnh Long, Tỉnh ủy viên, Chánh Văn phòng; các đ/c Phó Chánh Văn phòng', 5);

-- 4) LỊCH TUẦN 24 NĂM 2026 (08/6 - 14/6/2026) — theo văn bản đã ban hành
insert into schedule_entries (leader_id, date, session, start_time, end_time, content, location, participants, status) values

  -- ===== Thứ 2, 08/6 — Cả ngày =====
  ('22222222-2222-2222-2222-222222222201', '2026-06-08', 'ca_ngay', null, null,
   'Thường trực HĐND tỉnh và lãnh đạo Đoàn ĐBQH tỉnh làm việc tại cơ quan',
   'Trụ sở Đoàn ĐBQH và HĐND tỉnh', 'Thường trực HĐND tỉnh', 'da_duyet'),
  ('22222222-2222-2222-2222-222222222203', '2026-06-08', 'ca_ngay', null, null,
   'Thường trực HĐND tỉnh và lãnh đạo Đoàn ĐBQH tỉnh làm việc tại cơ quan',
   'Trụ sở Đoàn ĐBQH và HĐND tỉnh', 'Lãnh đạo Đoàn ĐBQH tỉnh', 'da_duyet'),

  -- ===== Thứ 3, 09/6 =====
  -- 8h00: Hội nghị BCH Đảng bộ tỉnh lần thứ 7 (cả lãnh đạo HĐND và Đoàn ĐBQH)
  ('22222222-2222-2222-2222-222222222201', '2026-06-09', 'gio', '08:00', null,
   'Dự Hội nghị Ban Chấp hành Đảng bộ tỉnh lần thứ 7',
   'Phòng họp Ban Chấp hành Đảng bộ tỉnh',
   'Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh; Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh. Cán bộ tham dự: các đ/c Trưởng các Ban HĐND tỉnh; CVP', 'da_duyet'),
  ('22222222-2222-2222-2222-222222222203', '2026-06-09', 'gio', '08:00', null,
   'Dự Hội nghị Ban Chấp hành Đảng bộ tỉnh lần thứ 7',
   'Phòng họp Ban Chấp hành Đảng bộ tỉnh',
   'Đ/c Lương Thị Hoa, Tỉnh ủy viên, Phó Trưởng Đoàn ĐBQH tỉnh', 'da_duyet'),
  -- 14h00: Tiếp xúc cử tri — đ/c Nguyễn Quang Hải
  ('22222222-2222-2222-2222-222222222202', '2026-06-09', 'gio', '14:00', null,
   'Tiếp xúc cử tri trước kỳ họp thường lệ giữa năm 2026, HĐND tỉnh khóa XIX',
   'Phường Đông Quang',
   'Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh. Cán bộ tham dự: Đ/c Sơn, PCVP', 'da_duyet'),

  -- ===== Thứ 4, 10/6 =====
  -- 14h00: Làm việc với Sở Tài chính — đ/c Nguyễn Quang Hải
  ('22222222-2222-2222-2222-222222222202', '2026-06-10', 'gio', '14:00', null,
   'Làm việc với Sở Tài chính',
   'Trụ sở Sở Tài chính',
   'Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh. Cán bộ tham dự: Đại diện lãnh đạo Ban KT-NS', 'da_duyet'),
  -- 14h00: Tiếp xúc cử tri — đ/c Lê Tiến Lam
  ('22222222-2222-2222-2222-222222222201', '2026-06-10', 'gio', '14:00', null,
   'Tiếp xúc cử tri trước kỳ họp thường lệ giữa năm 2026, HĐND tỉnh khóa XIX',
   'Xã Yên Phú',
   'Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh. Cán bộ tham dự: Đ/c Mạnh, PCVP', 'da_duyet'),

  -- ===== Thứ 5, 11/6 =====
  -- Sáng: Hội nghị Ban Thường vụ Tỉnh ủy — đ/c Lê Tiến Lam
  ('22222222-2222-2222-2222-222222222201', '2026-06-11', 'sang', null, null,
   'Dự Hội nghị Ban Thường vụ Tỉnh ủy',
   'Phòng họp Ban Thường vụ Tỉnh ủy',
   'Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh', 'da_duyet'),
  -- Sáng: Làm việc với Phòng TH-TT-DN — đ/c Lương Thị Hoa
  ('22222222-2222-2222-2222-222222222203', '2026-06-11', 'sang', null, null,
   'Làm việc với Phòng Tổng hợp, Thông tin, Dân nguyện',
   'Trụ sở Đoàn ĐBQH và HĐND tỉnh',
   'Đ/c Lương Thị Hoa, Tỉnh ủy viên, Phó Trưởng Đoàn ĐBQH tỉnh. Cán bộ tham dự: Đ/c Mạnh, PCVP', 'da_duyet'),

  -- ===== Thứ 6, 12/6 =====
  -- 8h00: Họp Thường trực HĐND tỉnh (cả 2 PCT)
  ('22222222-2222-2222-2222-222222222201', '2026-06-12', 'gio', '08:00', null,
   'Dự họp Thường trực HĐND tỉnh',
   'Trụ sở Đoàn ĐBQH và HĐND tỉnh',
   'Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh; Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh. Cán bộ tham dự: Lãnh đạo các Ban; Văn phòng', 'da_duyet'),
  -- 10h00: Làm việc với các ban, đơn vị trực thuộc HĐND tỉnh (cả 2 PCT)
  ('22222222-2222-2222-2222-222222222201', '2026-06-12', 'gio', '10:00', null,
   'Làm việc với các ban, đơn vị trực thuộc HĐND tỉnh',
   'Trụ sở Đoàn ĐBQH và HĐND tỉnh',
   'Đ/c Lê Tiến Lam, Ủy viên Ban Thường vụ Tỉnh ủy, Phó Chủ tịch Thường trực HĐND tỉnh; Đ/c Nguyễn Quang Hải, Tỉnh ủy viên, Phó Chủ tịch HĐND tỉnh. Cán bộ tham dự: Lãnh đạo các Ban; Văn phòng', 'da_duyet'),

  -- ===== Thứ 7, 13/6 & Chủ nhật, 14/6 — Trực lãnh đạo Văn phòng =====
  ('22222222-2222-2222-2222-222222222250', '2026-06-13', 'ca_ngay', null, null,
   'Trực lãnh đạo Văn phòng',
   'Trụ sở Đoàn ĐBQH và HĐND tỉnh', 'Đ/c Trần Mạnh Long, Tỉnh ủy viên, Chánh Văn phòng', 'da_duyet'),
  ('22222222-2222-2222-2222-222222222250', '2026-06-14', 'ca_ngay', null, null,
   'Trực lãnh đạo Văn phòng',
   'Trụ sở Đoàn ĐBQH và HĐND tỉnh', 'Đ/c Hà Ngọc Sơn, Phó Chánh Văn phòng', 'da_duyet');
