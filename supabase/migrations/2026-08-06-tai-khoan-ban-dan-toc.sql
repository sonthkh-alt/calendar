-- =====================================================================
--  THÊM TÀI KHOẢN CÁN BỘ BAN DÂN TỘC (idempotent):
--   - bandt@thanhhoa.gov.vn (mật khẩu: 6) — vai trò 'cb_ban', theo dõi
--     RIÊNG Ban Dân tộc -> nhập/sửa lịch cho lãnh đạo thuộc Ban Dân tộc
--     (lịch khởi tạo 'cho_duyet', PCT duyệt).
--  Lưu ý: phải set các cột token = '' (NULL gây "Database error querying schema").
--  An toàn khi Actions chạy lại mỗi lần deploy: CHỈ ghi vai trò/Ban lúc TẠO MỚI,
--  không ghi đè phân quyền quản trị viên đã chỉnh trên web.
-- =====================================================================
create extension if not exists pgcrypto with schema extensions;

do $$
declare
  u record;
  uid uuid;
  created boolean;
begin
  for u in
    select * from (values
      ('bandt@thanhhoa.gov.vn', '6', 'Cán bộ Ban Dân tộc', 'Chuyên viên', 'cb_ban')
    ) as t(email, pw, full_name, position, role)
  loop
    created := false;
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
      created := true;
    end if;

    if created then
      -- Trigger handle_new_user đã tạo dòng profiles -> gán vai trò + Ban Dân tộc
      update profiles set
        role      = u.role,
        full_name = u.full_name,
        position  = u.position,
        ban_ids   = coalesce((select array_agg(id) from bans where name ilike '%Dân tộc%'), '{}')
      where email = u.email;
    end if;
  end loop;
end $$;
