-- =====================================================================
--  TẠO 7 TÀI KHOẢN LÁI XE (idempotent) — vai trò 'lai_xe', mật khẩu mặc định 123.
--  Đăng nhập bằng TÊN NGẮN (vd "chan") — màn đăng nhập tự thêm "@thanhhoa.gov.vn".
--  Mỗi tài khoản gắn với xe có vehicles.driver_name trùng tên lái xe (dữ liệu 29/09/2026):
--    chau  - Châu  - 36A-00342      quyet - Quyết - 36A-12368
--    dung  - Dũng  - 36A-04567      quang - Quang - 36A-00861
--    chan  - Chân  - 36A-03668      tu    - Từ    - 36A-15689
--    tien  - Tiến  - 36A-00936
--  Lưu ý: phải set các cột token = '' (NULL gây "Database error querying schema").
--  An toàn khi Actions chạy lại mỗi lần deploy: CHỈ ghi vai trò/họ tên/xe lúc TẠO MỚI,
--  không ghi đè phân quyền quản trị viên đã chỉnh trên web; riêng xe được gắn BÙ nếu
--  tài khoản đã có mà còn trống xe (vd xe được khai tên lái xe sau).
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  u record;
  uid uuid;
  created boolean;
  vid uuid;
begin
  for u in
    select * from (values
      ('chau@thanhhoa.gov.vn',  'Châu',  '36A-00342'),
      ('quyet@thanhhoa.gov.vn', 'Quyết', '36A-12368'),
      ('dung@thanhhoa.gov.vn',  'Dũng',  '36A-04567'),
      ('quang@thanhhoa.gov.vn', 'Quang', '36A-00861'),
      ('chan@thanhhoa.gov.vn',  'Chân',  '36A-03668'),
      ('tu@thanhhoa.gov.vn',    'Từ',    '36A-15689'),
      ('tien@thanhhoa.gov.vn',  'Tiến',  '36A-00936')
    ) as t(email, driver, plate)
  loop
    created := false;
    if not exists (select 1 from auth.users where email = u.email) then
      uid := gen_random_uuid();
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change,
        email_change_token_new, email_change_token_current, reauthentication_token)
      values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        u.email, extensions.crypt('123', extensions.gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('pw_set', true, 'full_name', u.driver, 'position', 'Lái xe'),
        now(), now(),
        '', '', '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider,
        last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid, uid::text,
        jsonb_build_object('sub', uid::text, 'email', u.email, 'email_verified', true),
        'email', now(), now(), now());
      created := true;
    end if;

    -- Xe phụ trách: ưu tiên xe khai đúng tên lái xe, dự phòng theo biển số
    select id into vid from vehicles
      where lower(trim(driver_name)) = lower(u.driver)
      order by active desc nulls last limit 1;
    if vid is null then
      select id into vid from vehicles
        where regexp_replace(upper(plate), '[^0-9A-Z]', '', 'g') = regexp_replace(u.plate, '[^0-9A-Z]', '', 'g')
        limit 1;
    end if;

    if created then
      -- Trigger handle_new_user đã tạo dòng profiles -> gán vai trò lái xe + xe phụ trách
      update profiles set
        role       = 'lai_xe',
        full_name  = u.driver,
        position   = 'Lái xe',
        ban_ids    = '{}',
        vehicle_id = vid
      where email = u.email;
    else
      update profiles set vehicle_id = vid
      where email = u.email and vehicle_id is null and role = 'lai_xe' and vid is not null;
    end if;
  end loop;
end $$;
