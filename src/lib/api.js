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
