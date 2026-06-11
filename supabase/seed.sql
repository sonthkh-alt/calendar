-- =====================================================================
--  DỮ LIỆU MẪU — chạy SAU schema.sql (Supabase SQL Editor)
--  An toàn chạy lại: xóa dữ liệu danh mục cũ trước khi chèn lại.
--  Lịch gắn với ĐƠN VỊ (Lãnh đạo HĐND tỉnh chọn đích danh PCT; các Ban
--  chọn Ban) — tên thành viên cụ thể ghi ngay trong Nội dung công việc.
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

-- 2) Đối tượng có lịch: 2 PCT (đích danh, phục vụ gắn xe riêng) + 4 đơn vị Ban
--    + 1 đơn vị Văn phòng (ẩn mặc định — bật ở tab Quản trị nếu muốn hiển thị)
insert into leaders (id, full_name, position, leader_type, ban_id, sort_order, active) values
  -- Lãnh đạo HĐND tỉnh (hiển thị gộp 1 cột trên lịch tuần)
  ('22222222-2222-2222-2222-222222222201', 'Đ/c Lê Tiến Lam',     'Ủy viên BTV Tỉnh ủy, PCT Thường trực HĐND tỉnh', 'pct', null, 1, true),
  ('22222222-2222-2222-2222-222222222202', 'Đ/c Nguyễn Quang Hải', 'Tỉnh ủy viên, PCT HĐND tỉnh',                   'pct', null, 2, true),
  -- Các Ban (mỗi Ban 1 cột; tên thành viên ghi trong nội dung lịch)
  ('22222222-2222-2222-2222-222222222210', 'Ban Kinh tế - Ngân sách', '', 'ban', '11111111-1111-1111-1111-111111111101', 11, true),
  ('22222222-2222-2222-2222-222222222220', 'Ban Pháp chế',            '', 'ban', '11111111-1111-1111-1111-111111111102', 21, true),
  ('22222222-2222-2222-2222-222222222230', 'Ban Văn hóa - Xã hội',    '', 'ban', '11111111-1111-1111-1111-111111111103', 31, true),
  ('22222222-2222-2222-2222-222222222240', 'Ban Dân tộc',             '', 'ban', '11111111-1111-1111-1111-111111111104', 41, true),
  -- Văn phòng (ẩn mặc định)
  ('22222222-2222-2222-2222-222222222250', 'Lãnh đạo Văn phòng',      '', 'vanphong', null, 51, false);

-- 3) Bốn xe công vụ (2 xe riêng gắn đích danh PCT, 2 xe dùng chung)
insert into vehicles (id, plate, driver_name, driver_phone, vehicle_type, assigned_leader_id, active) values
  ('33333333-3333-3333-3333-333333333301', '36A-001.01', 'Lái xe 1', '0912000001', 'rieng',      '22222222-2222-2222-2222-222222222201', true),
  ('33333333-3333-3333-3333-333333333302', '36A-002.02', 'Lái xe 2', '0912000002', 'rieng',      '22222222-2222-2222-2222-222222222202', true),
  ('33333333-3333-3333-3333-333333333303', '36A-003.03', 'Lái xe 3', '0912000003', 'dung_chung', null, true),
  ('33333333-3333-3333-3333-333333333304', '36A-004.04', 'Lái xe 4', '0912000004', 'dung_chung', null, true);

-- 4) Lịch mẫu cho TUẦN HIỆN TẠI (date_trunc('week', ...) = Thứ Hai)
--    Tên người tham gia ghi NGAY TRONG NỘI DUNG.
with w as (select date_trunc('week', now())::date as t2)
insert into schedule_entries (leader_id, date, session, start_time, end_time, content, location, participants, status, vehicle_id) values
  -- Đ/c Lê Tiến Lam: đã duyệt sẵn (lịch lãnh đạo HĐND hiển thị ngay), có xe riêng
  ('22222222-2222-2222-2222-222222222201', (select t2 from w),     'sang',  null, null, 'Đ/c Lê Tiến Lam chủ trì Hội nghị giao ban Thường trực HĐND tỉnh', 'Phòng họp tầng 2, Trụ sở HĐND tỉnh', 'Thường trực HĐND, lãnh đạo các Ban, CVP', 'da_duyet', '33333333-3333-3333-3333-333333333301'),
  ('22222222-2222-2222-2222-222222222201', (select t2+2 from w),   'ca_ngay', null, null, 'Đ/c Lê Tiến Lam làm Trưởng đoàn giám sát chuyên đề tại huyện Thọ Xuân', 'UBND huyện Thọ Xuân', 'Đoàn giám sát theo QĐ số .../QĐ-HĐND', 'da_duyet', '33333333-3333-3333-3333-333333333301'),
  -- Đ/c Nguyễn Quang Hải
  ('22222222-2222-2222-2222-222222222202', (select t2+1 from w),   'gio', '08:00', '11:30', 'Đ/c Nguyễn Quang Hải tiếp công dân định kỳ', 'Trụ sở Tiếp công dân tỉnh', 'Ban Pháp chế, Văn phòng', 'da_duyet', '33333333-3333-3333-3333-333333333302'),
  -- Ban KT-NS: chờ duyệt
  ('22222222-2222-2222-2222-222222222210', (select t2+1 from w),   'sang',  null, null, 'Đ/c Trưởng ban chủ trì thẩm tra dự thảo Nghị quyết về phân bổ ngân sách', 'Phòng họp Ban KT-NS', 'Lãnh đạo Ban, Sở Tài chính', 'cho_duyet', null),
  ('22222222-2222-2222-2222-222222222210', (select t2+3 from w),   'chieu', null, null, 'Đ/c Phó ban và đ/c Ủy viên chuyên trách khảo sát dự án đầu tư công tại TP Sầm Sơn', 'UBND TP Sầm Sơn', 'Lãnh đạo Ban, UBND TP Sầm Sơn', 'cho_duyet', null),
  -- Ban Pháp chế: đã duyệt, dùng xe chung
  ('22222222-2222-2222-2222-222222222220', (select t2+2 from w),   'sang',  null, null, 'Đ/c Trưởng ban làm việc với Công an tỉnh về tình hình ANTT', 'Công an tỉnh', 'Lãnh đạo Ban Pháp chế', 'da_duyet', '33333333-3333-3333-3333-333333333303'),
  -- Ban VH-XH: đã điều chỉnh
  ('22222222-2222-2222-2222-222222222230', (select t2+4 from w),   'chieu', null, null, 'Đoàn giám sát của Ban (đ/c Trưởng ban làm Trưởng đoàn) giám sát thực hiện chính sách BHYT tại huyện Quảng Xương', 'UBND huyện Quảng Xương', 'Đoàn giám sát Ban VH-XH', 'da_dieu_chinh', null),
  -- Ban Dân tộc: 1 từ chối + 1 chờ duyệt
  ('22222222-2222-2222-2222-222222222240', (select t2+4 from w),   'sang',  null, null, 'Đ/c Trưởng ban khảo sát chương trình 1719 tại huyện Mường Lát', 'UBND huyện Mường Lát', 'Lãnh đạo Ban Dân tộc', 'tu_choi', null),
  ('22222222-2222-2222-2222-222222222240', (select t2+5 from w),   'sang',  null, null, 'Đ/c Ủy viên chuyên trách dự hội nghị tổng kết công tác dân tộc', 'Hội trường 25B', 'Ủy viên chuyên trách Ban Dân tộc', 'cho_duyet', null);

-- Ghi chú mẫu cho mục bị từ chối / điều chỉnh
update schedule_entries set review_note = 'Trùng lịch giám sát của Thường trực, đề nghị chuyển sang tuần sau'
  where status = 'tu_choi';
update schedule_entries set review_note = 'Điều chỉnh: gộp đoàn với Ban Dân tộc, xuất phát 13h00'
  where status = 'da_dieu_chinh';
