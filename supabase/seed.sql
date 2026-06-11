-- =====================================================================
--  DỮ LIỆU MẪU — chạy SAU schema.sql (Supabase SQL Editor)
--  An toàn chạy lại: xóa dữ liệu danh mục cũ trước khi chèn lại.
--  LƯU Ý: tên lãnh đạo/biển số là VÍ DỤ — sửa trong tab Quản trị sau khi chạy.
-- =====================================================================

-- Xóa theo thứ tự phụ thuộc khóa ngoại
delete from schedule_entries;
delete from vehicles;
update profiles set leader_id = null, ban_ids = '{}';
delete from leaders;
delete from bans;

-- 1) Bốn Ban của HĐND tỉnh
insert into bans (id, name, short_name, sort_order) values
  ('11111111-1111-1111-1111-111111111101', 'Ban Kinh tế - Ngân sách', 'KT-NS', 1),
  ('11111111-1111-1111-1111-111111111102', 'Ban Pháp chế',            'PC',    2),
  ('11111111-1111-1111-1111-111111111103', 'Ban Văn hóa - Xã hội',    'VH-XH', 3),
  ('11111111-1111-1111-1111-111111111104', 'Ban Dân tộc',             'DT',    4);

-- 2) Lãnh đạo: 2 PCT + 12 lãnh đạo Ban + 3 lãnh đạo Văn phòng (ẩn mặc định)
insert into leaders (id, full_name, position, leader_type, ban_id, sort_order, active) values
  -- Thường trực HĐND tỉnh
  ('22222222-2222-2222-2222-222222222201', 'Đ/c Phó Chủ tịch 1', 'Phó Chủ tịch HĐND tỉnh', 'pct', null, 1, true),
  ('22222222-2222-2222-2222-222222222202', 'Đ/c Phó Chủ tịch 2', 'Phó Chủ tịch HĐND tỉnh', 'pct', null, 2, true),
  -- Ban Kinh tế - Ngân sách
  ('22222222-2222-2222-2222-222222222211', 'Đ/c Trưởng ban KT-NS',   'Trưởng ban',           'ban', '11111111-1111-1111-1111-111111111101', 11, true),
  ('22222222-2222-2222-2222-222222222212', 'Đ/c Phó ban KT-NS',      'Phó Trưởng ban',       'ban', '11111111-1111-1111-1111-111111111101', 12, true),
  ('22222222-2222-2222-2222-222222222213', 'Đ/c Ủy viên KT-NS',      'Ủy viên chuyên trách', 'ban', '11111111-1111-1111-1111-111111111101', 13, true),
  -- Ban Pháp chế
  ('22222222-2222-2222-2222-222222222221', 'Đ/c Trưởng ban Pháp chế','Trưởng ban',           'ban', '11111111-1111-1111-1111-111111111102', 21, true),
  ('22222222-2222-2222-2222-222222222222', 'Đ/c Phó ban Pháp chế',   'Phó Trưởng ban',       'ban', '11111111-1111-1111-1111-111111111102', 22, true),
  ('22222222-2222-2222-2222-222222222223', 'Đ/c Ủy viên Pháp chế',   'Ủy viên chuyên trách', 'ban', '11111111-1111-1111-1111-111111111102', 23, true),
  -- Ban Văn hóa - Xã hội
  ('22222222-2222-2222-2222-222222222231', 'Đ/c Trưởng ban VH-XH',   'Trưởng ban',           'ban', '11111111-1111-1111-1111-111111111103', 31, true),
  ('22222222-2222-2222-2222-222222222232', 'Đ/c Phó ban VH-XH',      'Phó Trưởng ban',       'ban', '11111111-1111-1111-1111-111111111103', 32, true),
  ('22222222-2222-2222-2222-222222222233', 'Đ/c Ủy viên VH-XH',      'Ủy viên chuyên trách', 'ban', '11111111-1111-1111-1111-111111111103', 33, true),
  -- Ban Dân tộc
  ('22222222-2222-2222-2222-222222222241', 'Đ/c Trưởng ban Dân tộc', 'Trưởng ban',           'ban', '11111111-1111-1111-1111-111111111104', 41, true),
  ('22222222-2222-2222-2222-222222222242', 'Đ/c Phó ban Dân tộc',    'Phó Trưởng ban',       'ban', '11111111-1111-1111-1111-111111111104', 42, true),
  ('22222222-2222-2222-2222-222222222243', 'Đ/c Ủy viên Dân tộc',    'Ủy viên chuyên trách', 'ban', '11111111-1111-1111-1111-111111111104', 43, true),
  -- Lãnh đạo Văn phòng (active=false: bật ở tab Quản trị nếu muốn hiển thị)
  ('22222222-2222-2222-2222-222222222251', 'Đ/c Chánh Văn phòng',    'Chánh Văn phòng',      'vanphong', null, 51, false),
  ('22222222-2222-2222-2222-222222222252', 'Đ/c Phó CVP 1',          'Phó Chánh Văn phòng',  'vanphong', null, 52, false),
  ('22222222-2222-2222-2222-222222222253', 'Đ/c Phó CVP 2',          'Phó Chánh Văn phòng',  'vanphong', null, 53, false);

-- 3) Bốn xe công vụ
insert into vehicles (id, plate, driver_name, driver_phone, vehicle_type, assigned_leader_id, active) values
  ('33333333-3333-3333-3333-333333333301', '36A-001.01', 'Lái xe 1', '0912000001', 'rieng',      '22222222-2222-2222-2222-222222222201', true),
  ('33333333-3333-3333-3333-333333333302', '36A-002.02', 'Lái xe 2', '0912000002', 'rieng',      '22222222-2222-2222-2222-222222222202', true),
  ('33333333-3333-3333-3333-333333333303', '36A-003.03', 'Lái xe 3', '0912000003', 'dung_chung', null, true),
  ('33333333-3333-3333-3333-333333333304', '36A-004.04', 'Lái xe 4', '0912000004', 'dung_chung', null, true);

-- 4) Lịch mẫu cho TUẦN HIỆN TẠI (date_trunc('week', ...) = Thứ Hai)
with w as (select date_trunc('week', now())::date as t2)
insert into schedule_entries (leader_id, date, session, start_time, end_time, content, location, participants, status, vehicle_id) values
  -- PCT 1: đã duyệt sẵn (lịch PCT hiển thị ngay), có xe riêng
  ('22222222-2222-2222-2222-222222222201', (select t2 from w),     'sang',  null, null, 'Hội nghị giao ban Thường trực HĐND tỉnh', 'Phòng họp tầng 2, Trụ sở HĐND tỉnh', 'Thường trực HĐND, lãnh đạo các Ban, CVP', 'da_duyet', '33333333-3333-3333-3333-333333333301'),
  ('22222222-2222-2222-2222-222222222201', (select t2+2 from w),   'ca_ngay', null, null, 'Giám sát chuyên đề tại huyện Thọ Xuân', 'UBND huyện Thọ Xuân', 'Đoàn giám sát theo QĐ số .../QĐ-HĐND', 'da_duyet', '33333333-3333-3333-3333-333333333301'),
  -- PCT 2
  ('22222222-2222-2222-2222-222222222202', (select t2+1 from w),   'gio', '08:00', '11:30', 'Tiếp công dân định kỳ', 'Trụ sở Tiếp công dân tỉnh', 'Ban Pháp chế, Văn phòng', 'da_duyet', '33333333-3333-3333-3333-333333333302'),
  -- Ban KT-NS: chờ duyệt
  ('22222222-2222-2222-2222-222222222211', (select t2+1 from w),   'sang',  null, null, 'Thẩm tra dự thảo Nghị quyết về phân bổ ngân sách', 'Phòng họp Ban KT-NS', 'Lãnh đạo Ban, Sở Tài chính', 'cho_duyet', null),
  ('22222222-2222-2222-2222-222222222212', (select t2+3 from w),   'chieu', null, null, 'Khảo sát dự án đầu tư công tại TP Sầm Sơn', 'UBND TP Sầm Sơn', 'Phó ban, Ủy viên chuyên trách', 'cho_duyet', null),
  -- Ban Pháp chế: đã duyệt, dùng xe chung
  ('22222222-2222-2222-2222-222222222221', (select t2+2 from w),   'sang',  null, null, 'Làm việc với Công an tỉnh về tình hình ANTT', 'Công an tỉnh', 'Lãnh đạo Ban Pháp chế', 'da_duyet', '33333333-3333-3333-3333-333333333303'),
  -- Ban VH-XH: đã điều chỉnh
  ('22222222-2222-2222-2222-222222222231', (select t2+4 from w),   'chieu', null, null, 'Giám sát thực hiện chính sách BHYT tại huyện Quảng Xương', 'UBND huyện Quảng Xương', 'Đoàn giám sát Ban VH-XH', 'da_dieu_chinh', null),
  -- Ban Dân tộc: 1 từ chối + 1 chờ duyệt
  ('22222222-2222-2222-2222-222222222241', (select t2+4 from w),   'sang',  null, null, 'Khảo sát chương trình 1719 tại huyện Mường Lát', 'UBND huyện Mường Lát', 'Lãnh đạo Ban Dân tộc', 'tu_choi', null),
  ('22222222-2222-2222-2222-222222222243', (select t2+5 from w),   'sang',  null, null, 'Dự hội nghị tổng kết công tác dân tộc', 'Hội trường 25B', 'Ủy viên chuyên trách', 'cho_duyet', null);

-- Ghi chú mẫu cho mục bị từ chối / điều chỉnh
update schedule_entries set review_note = 'Trùng lịch giám sát của Thường trực, đề nghị chuyển sang tuần sau'
  where status = 'tu_choi';
update schedule_entries set review_note = 'Điều chỉnh: gộp đoàn với Ban Dân tộc, xuất phát 13h00'
  where status = 'da_dieu_chinh';
