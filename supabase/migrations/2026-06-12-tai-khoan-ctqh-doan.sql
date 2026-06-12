-- =====================================================================
--  THÊM 2 TÀI KHOẢN cho luồng duyệt lịch ĐOÀN ĐBQH (idempotent):
--   - hoalt@thanhhoa.gov.vn (mk 6) — đ/c Lương Thị Hoa, Phó Trưởng Đoàn ĐBQH
--     tỉnh -> vai trò pho_truong_doan: DUYỆT lịch của Đoàn ĐBQH.
--   - ctqh@thanhhoa.gov.vn  (mk 7) — Cán bộ phòng Công tác Quốc hội ->
--     vai trò cb_ctqh: NHẬP lịch Đoàn ĐBQH (vào trạng thái chờ duyệt).
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
      ('hoalt@thanhhoa.gov.vn', '6', 'Lương Thị Hoa',                  'Phó Trưởng Đoàn ĐBQH tỉnh', 'pho_truong_doan'),
      ('ctqh@thanhhoa.gov.vn',  '7', 'Cán bộ phòng Công tác Quốc hội', 'Chuyên viên',               'cb_ctqh')
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
    update profiles set role = u.role, full_name = u.full_name, position = u.position
      where email = u.email;
  end loop;

  -- Gắn tài khoản đ/c Lương Thị Hoa với dòng lãnh đạo Đoàn ĐBQH tương ứng
  update profiles set leader_id = (select id from leaders where leader_type = 'doan' and full_name ilike '%Lương Thị Hoa%' limit 1)
    where email = 'hoalt@thanhhoa.gov.vn';
end $$;
