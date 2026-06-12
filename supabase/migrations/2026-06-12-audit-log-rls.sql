-- =====================================================================
--  #4 — NHẬT KÝ THAO TÁC (audit log) + SIẾT RLS theo vai trò
--  Chạy SAU schema.sql mỗi lần deploy (workflow db-migrate). Idempotent.
--  An toàn: trigger ghi log bọc trong EXCEPTION -> lỗi log KHÔNG làm hỏng
--  thao tác lịch. RLS dùng helper SECURITY DEFINER (tránh đệ quy), giữ
--  quyền GHI cho mọi vai trò trừ "nguoi_xem", có chốt admin gốc qua email.
--  GỠ BỎ: xóa file này -> lần deploy sau schema.sql tự khôi phục policy mở.
-- =====================================================================

-- 1) Bảng nhật ký ------------------------------------------------------
create table if not exists activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,            -- auth.users id (không FK cứng để không chặn xóa user)
  actor_email text,
  action text not null,     -- create | status | vehicle | update | delete
  entry_id uuid,
  group_id uuid,
  entry_date date,
  content text,
  old_status text,
  new_status text,
  summary text
);
create index if not exists idx_activity_at on activity_log(at desc);
create index if not exists idx_activity_entry on activity_log(entry_id);

-- 2) Hàm trigger ghi nhật ký cho schedule_entries ---------------------
create or replace function log_schedule_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := auth.uid();
  v_email text := coalesce(nullif(auth.jwt() ->> 'email', ''),
                           (select email from profiles where id = auth.uid()));
  v_action text; v_summary text;
begin
  begin   -- bọc riêng: lỗi ghi log KHÔNG làm hỏng thao tác lịch
    if tg_op = 'INSERT' then
      insert into activity_log(actor_id,actor_email,action,entry_id,group_id,entry_date,content,old_status,new_status,summary)
        values (v_actor,v_email,'create',new.id,new.group_id,new.date,new.content,null,new.status,'Tạo lịch');
    elsif tg_op = 'UPDATE' then
      if old.status is distinct from new.status then
        v_action := 'status'; v_summary := 'Trạng thái: ' || old.status || ' → ' || new.status;
      elsif old.vehicle_id is distinct from new.vehicle_id then
        v_action := 'vehicle'; v_summary := case when new.vehicle_id is null then 'Bỏ gán xe' else 'Gán/đổi xe' end;
      else
        v_action := 'update'; v_summary := 'Chỉnh sửa nội dung';
      end if;
      insert into activity_log(actor_id,actor_email,action,entry_id,group_id,entry_date,content,old_status,new_status,summary)
        values (v_actor,v_email,v_action,new.id,new.group_id,new.date,new.content,old.status,new.status,v_summary);
    elsif tg_op = 'DELETE' then
      insert into activity_log(actor_id,actor_email,action,entry_id,group_id,entry_date,content,old_status,new_status,summary)
        values (v_actor,v_email,'delete',old.id,old.group_id,old.date,old.content,old.status,null,'Xóa lịch');
    end if;
  exception when others then
    null;  -- nuốt mọi lỗi ghi log
  end;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end; $$;

drop trigger if exists trg_log_schedule on schedule_entries;
create trigger trg_log_schedule
  after insert or update or delete on schedule_entries
  for each row execute function log_schedule_change();

-- 3) Helper phân quyền (SECURITY DEFINER -> đọc profiles, tránh đệ quy RLS)
--    Admin gốc nhận diện qua email (quyền quản trị trong app là cấp qua email,
--    DB không nhất thiết lưu role='quan_tri') — đồng bộ BOOTSTRAP_ADMIN_EMAILS.
create or replace function is_app_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select role = 'quan_tri' from profiles where id = auth.uid()), false)
      or coalesce(auth.jwt() ->> 'email', '') = 'sonthkh@gmail.com';
$$;

create or replace function is_app_writer() returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select role <> 'nguoi_xem' from profiles where id = auth.uid()), false)
      or coalesce(auth.jwt() ->> 'email', '') = 'sonthkh@gmail.com';
$$;

-- 4) SIẾT RLS ----------------------------------------------------------
--    SELECT mở cho mọi người đã đăng nhập (ai cũng xem được lịch/danh mục).
--    GHI: danh mục + phân quyền -> chỉ admin; lịch -> mọi vai trò trừ nguoi_xem.
do $$ declare t text;
begin
  -- 4a) Danh mục + profiles: đọc=authenticated, ghi=admin
  foreach t in array array['bans','leaders','vehicles','participant_groups','profiles','locations'] loop
    execute format('drop policy if exists "%s_auth_all" on %I', t, t);
    execute format('drop policy if exists "%s_sel" on %I', t, t);
    execute format('drop policy if exists "%s_admin_write" on %I', t, t);
    execute format('create policy "%s_sel" on %I for select using (auth.role() = ''authenticated'')', t, t);
    execute format('create policy "%s_admin_write" on %I for all using (is_app_admin()) with check (is_app_admin())', t, t);
  end loop;

  -- 4b) schedule_entries: đọc=authenticated, ghi=writer (không phải nguoi_xem)
  execute 'drop policy if exists "schedule_entries_auth_all" on schedule_entries';
  execute 'drop policy if exists "entries_sel" on schedule_entries';
  execute 'drop policy if exists "entries_write" on schedule_entries';
  execute 'create policy "entries_sel" on schedule_entries for select using (auth.role() = ''authenticated'')';
  execute 'create policy "entries_write" on schedule_entries for all using (is_app_writer()) with check (is_app_writer())';
end $$;

-- 5) RLS cho activity_log: đọc=authenticated; KHÔNG cho client ghi (chỉ trigger
--    chạy bằng owner ghi được). Policy insert with check(true) đảm bảo trigger
--    không bị RLS chặn dù môi trường nào; revoke quyền insert của client để
--    không ai giả mạo nhật ký.
alter table activity_log enable row level security;
drop policy if exists "activity_sel" on activity_log;
drop policy if exists "activity_ins" on activity_log;
create policy "activity_sel" on activity_log for select using (auth.role() = 'authenticated');
create policy "activity_ins" on activity_log for insert with check (true);
grant select on activity_log to authenticated;
revoke insert, update, delete on activity_log from authenticated, anon;
