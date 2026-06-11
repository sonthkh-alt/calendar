-- =====================================================================
--  TẠO 5 TÀI KHOẢN NỘI BỘ theo bảng phân công của Văn phòng (idempotent —
--  tài khoản đã tồn tại thì bỏ qua, không ghi đè mật khẩu ai đã đổi).
--  Đăng nhập bằng EMAIL đầy đủ: <user>@thanhhoa.gov.vn + mật khẩu trong bảng.
--  Chạy tự động qua GitHub Actions (db-migrate.yml).
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  u record;
  uid uuid;
begin
  for u in
    select * from (values
      ('hainq@thanhhoa.gov.vn',  '1', 'Đ/c Nguyễn Quang Hải',     'Phó Chủ tịch HĐND tỉnh',              'pct'),
      ('lamlt@thanhhoa.gov.vn',  '2', 'Đ/c Lê Tiến Lam',          'Phó Chủ tịch Thường trực HĐND tỉnh',  'pct'),
      ('thttdn@thanhhoa.gov.vn', '3', 'Cán bộ TH-TT-Dân nguyện',  'Chuyên viên',                          'cb_tonghop'),
      ('hctcqt@thanhhoa.gov.vn', '4', 'Văn phòng (điều xe)',      'Chuyên viên',                          'van_phong_xe'),
      ('ban@thanhhoa.gov.vn',    '5', 'Cán bộ theo dõi các Ban',  'Chuyên viên',                          'cb_ban')
    ) as t(email, pw, full_name, position, role)
  loop
    if not exists (select 1 from auth.users where email = u.email) then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        u.email, extensions.crypt(u.pw, extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('pw_set', true, 'full_name', u.full_name, 'position', u.position),
        now(), now());
      insert into auth.identities (id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true),
        'email', now(), now(), now());
    end if;
    -- Hồ sơ phân quyền (trigger handle_new_user đã tạo dòng profiles khi insert auth.users)
    update profiles set role = u.role, full_name = u.full_name, position = u.position
      where email = u.email;
  end loop;

  -- Phân công bổ sung:
  -- Tài khoản "Ban" theo dõi TẤT CẢ các Ban
  update profiles set ban_ids = coalesce((select array_agg(id) from bans), '{}')
    where email = 'ban@thanhhoa.gov.vn';
  -- Gắn tài khoản PCT với dòng lãnh đạo tương ứng (null nếu chưa khớp tên)
  update profiles set leader_id = (select id from leaders where leader_type = 'pct' and full_name ilike '%Quang Hải%' limit 1)
    where email = 'hainq@thanhhoa.gov.vn';
  update profiles set leader_id = (select id from leaders where leader_type = 'pct' and full_name ilike '%Tiến Lam%' limit 1)
    where email = 'lamlt@thanhhoa.gov.vn';
end $$;
