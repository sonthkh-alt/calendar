-- =====================================================================
--  THÊM TÀI KHOẢN Chủ tịch HĐND tỉnh (idempotent):
--   - phongnh@thanhhoa.gov.vn (mk Phongnh@123) — đ/c Nguyễn Hồng Phong,
--     Chủ tịch HĐND tỉnh -> vai trò 'pct': XEM tất cả; ĐIỀU CHỈNH / PHÊ DUYỆT /
--     TỪ CHỐI MỌI lịch công tác (kể cả lịch ĐÃ duyệt — xem EntryDetail.canModerate).
--   - Chức vụ ghi "Chủ tịch HĐND tỉnh" -> chi tiết lịch hiện "Người phê duyệt:
--     Chủ tịch HĐND tỉnh — Nguyễn Hồng Phong" (App tra cứu profiles theo reviewed_by).
--  Lưu ý: phải set các cột token = '' (NULL gây "Database error querying schema").
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  u record;
  uid uuid;
begin
  for u in
    select * from (values
      ('phongnh@thanhhoa.gov.vn', 'Phongnh@123', 'Nguyễn Hồng Phong', 'Chủ tịch HĐND tỉnh', 'pct')
    ) as t(email, pw, full_name, position, role)
  loop
    if not exists (select 1 from auth.users where email = u.email) then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change,
        email_change_token_new, email_change_token_current, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        u.email, extensions.crypt(u.pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('pw_set', true, 'full_name', u.full_name, 'position', u.position),
        now(), now(),
        '', '', '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true),
        'email', now(), now(), now());
    end if;
    -- Cập nhật vai trò + chức vụ + họ tên (idempotent, áp cả khi tài khoản đã tồn tại)
    update profiles set role = u.role, full_name = u.full_name, position = u.position
      where email = u.email;
  end loop;
end $$;
