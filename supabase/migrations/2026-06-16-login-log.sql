-- =====================================================================
--  NHẬT KÝ ĐĂNG NHẬP (login_log)
--  Ghi lại mỗi lần người dùng (KHÔNG tính tài khoản khách) đăng nhập / mở
--  phiên làm việc. Client tự ghi 1 dòng cho CHÍNH MÌNH (RLS chốt user_id =
--  auth.uid()), admin xem trong tab Quản trị "Đăng nhập".
--  Chạy SAU schema.sql mỗi lần deploy (workflow db-migrate). Idempotent.
-- =====================================================================

create table if not exists login_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  email text,
  full_name text,
  role text
);
create index if not exists idx_login_at on login_log(at desc);
create index if not exists idx_login_user on login_log(user_id);

alter table login_log enable row level security;

-- Đọc: mọi tài khoản đã đăng nhập (UI chỉ mở cho admin). Ghi: chỉ ghi cho CHÍNH MÌNH.
drop policy if exists "login_sel" on login_log;
drop policy if exists "login_ins" on login_log;
create policy "login_sel" on login_log for select using (auth.role() = 'authenticated');
create policy "login_ins" on login_log for insert with check (auth.uid() = user_id);

grant select, insert on login_log to authenticated;
