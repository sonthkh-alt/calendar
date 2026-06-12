-- =====================================================================
--  Gán "đơn vị/lãnh đạo thuộc nhóm" (leader_ids) cho các Nhóm thành phần
--  SẴN CÓ để dùng ngay ở trường Lãnh đạo khi nhập lịch. Idempotent — chỉ
--  điền khi nhóm CHƯA có leader_ids; admin có thể chỉnh lại trong Quản trị.
-- =====================================================================
do $$
begin
  -- Thường trực HĐND tỉnh -> 2 đ/c PCT (leader_type='pct')
  update participant_groups
    set leader_ids = coalesce((select array_agg(id) from leaders where leader_type = 'pct'), '{}')
    where coalesce(array_length(leader_ids, 1), 0) = 0 and name ilike '%Thường trực HĐND%';

  -- Lãnh đạo Đoàn ĐBQH tỉnh -> leader_type='doan'
  update participant_groups
    set leader_ids = coalesce((select array_agg(id) from leaders where leader_type = 'doan'), '{}')
    where coalesce(array_length(leader_ids, 1), 0) = 0 and name ilike '%Đoàn ĐBQH%';

  -- Lãnh đạo Văn phòng -> leader_type='vanphong'
  update participant_groups
    set leader_ids = coalesce((select array_agg(id) from leaders where leader_type = 'vanphong'), '{}')
    where coalesce(array_length(leader_ids, 1), 0) = 0 and name ilike '%Văn phòng%';

  -- Trưởng/Lãnh đạo các Ban -> tất cả 4 đơn vị Ban (leader_type='ban')
  update participant_groups
    set leader_ids = coalesce((select array_agg(id) from leaders where leader_type = 'ban'), '{}')
    where coalesce(array_length(leader_ids, 1), 0) = 0 and name ilike '%Ban%';
end $$;
