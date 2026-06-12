-- =====================================================================
--  CHUẨN HÓA DỮ LIỆU (idempotent — an toàn chạy lại nhiều lần qua Actions)
--  1) Bỏ tiền tố kính ngữ "Đ/c"/"Đồng chí" trong HỌ TÊN lãnh đạo
--     (nội dung/thành phần lịch vẫn được ghi "Đ/c" tự do — không đụng tới).
--  2) Tên 4 Ban viết ĐẦY ĐỦ (giữ chữ "Ban", bỏ viết tắt và gạch ngang):
--     KT-NS -> Ban Kinh tế Ngân sách | PC -> Ban Pháp chế
--     VH-XH -> Ban Văn hóa Xã hội    | DT -> Ban Dân tộc
--  3) Số thứ tự (sort_order) đánh lại LIỀN MẠCH 1..N theo thứ tự hiện tại.
-- =====================================================================

-- 1) Bỏ tiền tố kính ngữ ở ĐẦU họ tên (chỉ leaders — đối tượng có lịch)
update leaders
  set full_name = regexp_replace(full_name, '^(Đ/c|Đ/C|Đồng chí)\s+', '')
  where full_name like 'Đ/c %' or full_name like 'Đ/C %' or full_name like 'Đồng chí %';

-- 2) Tên 4 Ban viết đầy đủ (match theo viết tắt cũ HOẶC tên mới -> idempotent)
update bans set name = 'Ban Kinh tế Ngân sách', short_name = 'Kinh tế Ngân sách'
  where short_name in ('KT-NS', 'Kinh tế Ngân sách');
update bans set name = 'Ban Pháp chế', short_name = 'Pháp chế'
  where short_name in ('PC', 'Pháp chế');
update bans set name = 'Ban Văn hóa Xã hội', short_name = 'Văn hóa Xã hội'
  where short_name in ('VH-XH', 'Văn hóa Xã hội');
update bans set name = 'Ban Dân tộc', short_name = 'Dân tộc'
  where short_name in ('DT', 'Dân tộc');

-- 3) Dòng đơn vị Ban trong leaders đồng bộ theo tên Ban mới
update leaders l set full_name = b.name
  from bans b
  where l.leader_type = 'ban' and l.ban_id = b.id and l.full_name <> b.name;

-- 4) Đánh lại số thứ tự liền mạch 1..N (giữ nguyên thứ tự tương đối hiện tại)
with ordered as (
  select id, row_number() over (order by sort_order, full_name) as rn from leaders
)
update leaders l set sort_order = o.rn
  from ordered o where l.id = o.id and l.sort_order <> o.rn;

with ordered as (
  select id, row_number() over (order by sort_order, name) as rn from bans
)
update bans b set sort_order = o.rn
  from ordered o where b.id = o.id and b.sort_order <> o.rn;
