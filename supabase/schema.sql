-- =====================================================================
--  LỊCH CÔNG TÁC TUẦN — LƯỢC ĐỒ CƠ SỞ DỮ LIỆU (Supabase / PostgreSQL)
--  Văn phòng Đoàn ĐBQH và HĐND tỉnh Thanh Hóa
--  Chạy trong: Supabase Dashboard -> SQL Editor -> New query -> Run
--  An toàn chạy lại nhiều lần (idempotent).
-- =====================================================================
--  PHÂN QUYỀN quản lý NGAY TRONG TRANG WEB (src/lib/permissions.js):
--    - Mặc định mọi người đăng nhập là "Người xem" (nguoi_xem).
--    - Quản trị gốc: email trong BOOTSTRAP_ADMIN_EMAILS (src/lib/constants.js),
--      hiện là sonthkh@gmail.com.
--    - Quản trị vào tab "Quản trị", đặt Vai trò + Ban theo dõi cho từng tài khoản.
--  ĐĂNG NHẬP: lần đầu magic link qua email -> tạo mật khẩu (pw_set trong
--  user_metadata) -> các lần sau đăng nhập email + mật khẩu.
-- ---------------------------------------------------------------------

-- 1) Ban của HĐND tỉnh
create table if not exists bans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  sort_order int default 0
);

-- 2) Đối tượng có lịch được quản lý (KHÔNG phải tài khoản đăng nhập)
--    pct = PCT HĐND tỉnh (đích danh) | doan = lãnh đạo Đoàn ĐBQH tỉnh (đích danh)
--    ban = đơn vị Ban (1 dòng/Ban)   | vanphong = lãnh đạo Văn phòng
create table if not exists leaders (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  position text not null,           -- '' nếu là dòng đơn vị (Ban)
  leader_type text not null check (leader_type in ('pct','doan','ban','vanphong')),
  ban_id uuid references bans(id),  -- null nếu không phải 'ban'
  sort_order int default 0,
  active boolean default true
);

-- Nâng cấp từ bản cũ: bổ sung loại 'doan' vào ràng buộc (an toàn chạy lại)
alter table leaders drop constraint if exists leaders_leader_type_check;
alter table leaders add constraint leaders_leader_type_check
  check (leader_type in ('pct','doan','ban','vanphong'));

-- 3) Hồ sơ phân quyền (1-1 với auth.users, tự tạo khi user đăng nhập lần đầu)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  position text,
  role text not null default 'nguoi_xem'
    check (role in ('quan_tri','pct','cb_ban','cb_tonghop','van_phong_xe','nguoi_xem')),
  ban_ids uuid[] default '{}',          -- cb_ban: các Ban được phân công theo dõi
  leader_id uuid references leaders(id),-- pct: trỏ tới dòng leaders của chính mình
  created_at timestamptz default now()
);

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 4) Xe công vụ
create table if not exists vehicles (
  id uuid primary key default gen_random_uuid(),
  plate text not null,                -- biển số
  driver_name text,
  driver_phone text,
  vehicle_type text not null default 'dung_chung'
    check (vehicle_type in ('rieng','dung_chung')),
  assigned_leader_id uuid references leaders(id), -- xe riêng: PCT được gắn
  active boolean default true
);

-- 4b) Nhóm thành phần dự họp — quản trị tạo sẵn để tick nhanh khi nhập lịch
--     (vd: "Thường trực HĐND tỉnh" gồm danh sách các đ/c PCT...)
create table if not exists participant_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,                 -- tên nhóm hiển thị trên ô tick
  members text not null,              -- chuỗi thành phần sẽ chèn vào ô Thành phần
  leader_ids uuid[] default '{}',     -- các đơn vị/lãnh đạo thuộc nhóm (chọn ở trường Lãnh đạo)
  sort_order int default 0
);
-- Nâng cấp DB cũ: bổ sung cột leader_ids (an toàn chạy lại)
alter table participant_groups add column if not exists leader_ids uuid[] default '{}';

-- 5) Mục lịch công tác
create table if not exists schedule_entries (
  id uuid primary key default gen_random_uuid(),
  group_id uuid,                      -- chung khi 1 sự kiện tạo cho nhiều lãnh đạo
  leader_id uuid not null references leaders(id) on delete cascade,
  date date not null,
  session text not null default 'sang'
    check (session in ('sang','chieu','ca_ngay','gio')),
  start_time time,                    -- chỉ dùng khi session='gio'
  end_time time,
  content text not null,              -- Nội dung
  location text,                      -- Địa điểm
  participants text,                  -- Thành phần
  status text not null default 'cho_duyet'
    check (status in ('cho_duyet','da_duyet','tu_choi','da_dieu_chinh')),
  review_note text,                   -- ghi chú từ chối / điều chỉnh của PCT
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  vehicle_id uuid references vehicles(id),
  vehicle_note text,
  vehicle_assigned_by uuid references profiles(id),
  vehicle_assigned_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_entries_date on schedule_entries(date);
create index if not exists idx_entries_leader_date on schedule_entries(leader_id, date);
create index if not exists idx_entries_vehicle_date on schedule_entries(vehicle_id, date) where vehicle_id is not null;

-- Nâng cấp: cờ "Làm việc tại cơ quan" — mục chỉ hiển thị Nội dung + dòng chữ in đậm
-- "Làm việc tại cơ quan", vào thẳng trạng thái đã duyệt (không cần phê duyệt).
-- An toàn chạy lại trên DB cũ.
alter table schedule_entries add column if not exists at_office boolean not null default false;

-- Nâng cấp: nhãn nhóm — khi nhập lịch theo "Nhóm thành phần" ở trường Lãnh đạo,
-- mỗi đơn vị 1 mục nhưng đều ghi TÊN NHÓM thay cho tên đơn vị riêng lẻ.
alter table schedule_entries add column if not exists group_label text;

-- 6) RLS: chỉ người ĐÃ ĐĂNG NHẬP mới đọc/ghi; phân quyền chi tiết do app xử lý.
do $$ declare t text;
begin
  foreach t in array array['bans','leaders','profiles','vehicles','schedule_entries','participant_groups'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s_auth_all" on %I', t, t);
    execute format(
      'create policy "%s_auth_all" on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')',
      t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- NÂNG CẤP SAU (TÙY CHỌN): siết RLS theo vai trò thay vì kiểm tra trong app.
-- Ví dụ chỉ cho phép sửa schedule_entries khi vai trò phù hợp:
--   create policy "entries_update_by_role" on schedule_entries for update
--   using (exists (select 1 from profiles p where p.id = auth.uid()
--                  and p.role in ('quan_tri','pct','cb_ban','cb_tonghop','van_phong_xe')));
-- Hiện tại giữ mô hình đơn giản (văn phòng nội bộ ~15 tài khoản tin cậy).
-- ---------------------------------------------------------------------
