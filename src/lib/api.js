// CRUD với Supabase — mọi hàm trả { data, error } để component tự xử lý thông báo.
import { supabase } from './supabase';

const NO_DB = { data: null, error: { message: 'Hệ thống chưa cấu hình máy chủ (.env).' } };

// ===== Danh mục =====
export async function fetchBans() {
  if (!supabase) return NO_DB;
  return supabase.from('bans').select('*').order('sort_order');
}

export async function fetchLeaders() {
  if (!supabase) return NO_DB;
  return supabase.from('leaders').select('*').order('sort_order');
}

export async function fetchVehicles() {
  if (!supabase) return NO_DB;
  return supabase.from('vehicles').select('*').order('vehicle_type').order('plate');
}

export async function fetchProfiles() {
  if (!supabase) return NO_DB;
  return supabase.from('profiles').select('*').order('email');
}

export async function fetchParticipantGroups() {
  if (!supabase) return NO_DB;
  return supabase.from('participant_groups').select('*').order('sort_order');
}

export async function upsertParticipantGroup(row) {
  if (!supabase) return NO_DB;
  return supabase.from('participant_groups').upsert(row).select();
}

export async function deleteParticipantGroup(id) {
  if (!supabase) return NO_DB;
  return supabase.from('participant_groups').delete().eq('id', id);
}

// ===== Mục lịch =====
// Lấy lịch trong khoảng ngày [fromISO, toISO] (yyyy-MM-dd)
export async function fetchEntries(fromISO, toISO) {
  if (!supabase) return NO_DB;
  return supabase
    .from('schedule_entries')
    .select('*')
    .gte('date', fromISO)
    .lte('date', toISO)
    .order('date')
    .order('session');
}

// Tạo lịch cho nhiều lãnh đạo: 1 dòng / lãnh đạo, chung group_id
export async function createEntries(base, leaderStatusPairs) {
  if (!supabase) return NO_DB;
  const group_id = crypto.randomUUID();
  const rows = leaderStatusPairs.map(({ leaderId, status }) => ({
    ...base, leader_id: leaderId, status, group_id,
  }));
  return supabase.from('schedule_entries').insert(rows).select();
}

export async function updateEntry(id, patch) {
  if (!supabase) return NO_DB;
  return supabase
    .from('schedule_entries')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select();
}

export async function deleteEntry(id) {
  if (!supabase) return NO_DB;
  return supabase.from('schedule_entries').delete().eq('id', id);
}

// Xóa nhiều mục cùng lúc (vd: thẻ đã gộp nhiều đơn vị của một nhóm)
export async function deleteEntries(ids) {
  if (!supabase) return NO_DB;
  return supabase.from('schedule_entries').delete().in('id', ids);
}

// Duyệt / điều chỉnh / từ chối
export async function reviewEntry(id, status, note, reviewerId) {
  return updateEntry(id, {
    status,
    review_note: note || null,
    reviewed_by: reviewerId,
    reviewed_at: new Date().toISOString(),
  });
}

// Gán / bỏ gán xe
export async function assignVehicle(id, vehicleId, note, assignerId) {
  return updateEntry(id, {
    vehicle_id: vehicleId,
    vehicle_note: note || null,
    vehicle_assigned_by: vehicleId ? assignerId : null,
    vehicle_assigned_at: vehicleId ? new Date().toISOString() : null,
  });
}

// ===== Quản trị danh mục =====
export async function upsertLeader(row) {
  if (!supabase) return NO_DB;
  return supabase.from('leaders').upsert(row).select();
}

export async function deleteLeader(id) {
  if (!supabase) return NO_DB;
  return supabase.from('leaders').delete().eq('id', id);
}

export async function upsertVehicle(row) {
  if (!supabase) return NO_DB;
  return supabase.from('vehicles').upsert(row).select();
}

export async function deleteVehicle(id) {
  if (!supabase) return NO_DB;
  return supabase.from('vehicles').delete().eq('id', id);
}

export async function updateProfile(id, patch) {
  if (!supabase) return NO_DB;
  return supabase.from('profiles').update(patch).eq('id', id).select();
}

// ===== Sao lưu / Phục hồi toàn bộ dữ liệu =====
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const BACKUP_MARKER = 'lichcongtac-hdndth';

// Tải toàn bộ dữ liệu về một object JSON (kể cả phân quyền profiles)
export async function backupAll() {
  if (!supabase) return NO_DB;
  const tables = ['bans', 'leaders', 'vehicles', 'participant_groups', 'schedule_entries', 'profiles'];
  const data = {};
  for (const t of tables) {
    const { data: rows, error } = await supabase.from(t).select('*');
    if (error) return { data: null, error };
    data[t] = rows || [];
  }
  return {
    data: { app: BACKUP_MARKER, version: 1, exported_at: new Date().toISOString(), data },
    error: null,
  };
}

// Phục hồi từ bản sao lưu: XÓA toàn bộ dữ liệu hiện tại rồi nạp lại.
// - Giữ nguyên id nên các liên kết Ban/lãnh đạo/xe khớp như cũ.
// - profiles không tạo mới được (gắn với tài khoản đăng nhập): chỉ cập nhật
//   vai trò/phân công cho các email đang tồn tại; tham chiếu người tạo/duyệt
//   tới tài khoản không còn sẽ được xóa trắng để không lỗi khóa ngoại.
export async function restoreAll(payload) {
  if (!supabase) return NO_DB;
  if (payload?.app !== BACKUP_MARKER || !payload?.data) {
    return { data: null, error: { message: 'Tệp không phải bản sao lưu của hệ thống này.' } };
  }
  const d = payload.data;

  // Hồ sơ đang tồn tại (để giữ/loại tham chiếu profile)
  const { data: curProfiles, error: pErr } = await supabase.from('profiles').select('id, email');
  if (pErr) return { data: null, error: pErr };
  const profileIds = new Set((curProfiles || []).map((p) => p.id));
  const keepRef = (id) => (id && profileIds.has(id) ? id : null);

  // 1) Xóa theo thứ tự phụ thuộc khóa ngoại
  for (const t of ['schedule_entries', 'vehicles', 'participant_groups']) {
    const { error } = await supabase.from(t).delete().neq('id', NIL_UUID);
    if (error) return { data: null, error };
  }
  {
    const { error } = await supabase.from('profiles').update({ leader_id: null }).neq('id', NIL_UUID);
    if (error) return { data: null, error };
  }
  for (const t of ['leaders', 'bans']) {
    const { error } = await supabase.from(t).delete().neq('id', NIL_UUID);
    if (error) return { data: null, error };
  }

  // 2) Nạp lại theo thứ tự
  const inserts = [
    ['bans', d.bans || []],
    ['leaders', d.leaders || []],
    ['vehicles', d.vehicles || []],
    ['participant_groups', d.participant_groups || []],
    ['schedule_entries', (d.schedule_entries || []).map((e) => ({
      ...e,
      created_by: keepRef(e.created_by),
      reviewed_by: keepRef(e.reviewed_by),
      vehicle_assigned_by: keepRef(e.vehicle_assigned_by),
    }))],
  ];
  for (const [t, rows] of inserts) {
    if (!rows.length) continue;
    const { error } = await supabase.from(t).insert(rows);
    if (error) return { data: null, error: { message: `Lỗi nạp bảng ${t}: ${error.message}` } };
  }

  // 3) Khôi phục phân quyền cho các email đang tồn tại
  const byEmail = Object.fromEntries((curProfiles || []).map((p) => [p.email.toLowerCase(), p.id]));
  for (const bp of d.profiles || []) {
    const id = byEmail[(bp.email || '').toLowerCase()];
    if (!id) continue;
    await supabase.from('profiles').update({
      full_name: bp.full_name, position: bp.position,
      role: bp.role, ban_ids: bp.ban_ids || [], leader_id: bp.leader_id || null,
    }).eq('id', id);
  }

  return { data: true, error: null };
}
