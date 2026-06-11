// Ma trận phân quyền — thực thi phía ứng dụng (RLS chỉ chặn người chưa đăng nhập).
// profile: { role, ban_ids, leader_id } — role đã được App.jsx nâng thành 'quan_tri'
// nếu email thuộc BOOTSTRAP_ADMIN_EMAILS.

// Được tạo lịch cho lãnh đạo này không?
export function canCreateFor(profile, leader) {
  if (!profile || !leader) return false;
  if (profile.role === 'quan_tri') return true;
  if (profile.role === 'cb_ban')
    return leader.leader_type === 'ban' && (profile.ban_ids || []).includes(leader.ban_id);
  if (profile.role === 'cb_tonghop') return leader.leader_type === 'pct';
  return false;
}

// Trạng thái khởi tạo khi tạo lịch cho lãnh đạo này
// (lịch PCT do phòng TH-TT-DN nhập hiển thị ngay, không qua duyệt)
export function initialStatus(leader) {
  return leader?.leader_type === 'pct' ? 'da_duyet' : 'cho_duyet';
}

// Được sửa / xóa mục lịch này không?
export function canEditEntry(profile, entry, leader) {
  if (!profile || !entry) return false;
  if (profile.role === 'quan_tri') return true;
  if (!canCreateFor(profile, leader)) return false;
  // cb_tonghop sửa lịch PCT mọi lúc; cb_ban chỉ sửa khi chưa duyệt hoặc bị từ chối
  if (profile.role === 'cb_tonghop') return true;
  return entry.status === 'cho_duyet' || entry.status === 'tu_choi';
}

// Được duyệt / điều chỉnh / từ chối lịch không? (PCT và Quản trị)
export function canReview(profile) {
  return profile?.role === 'pct' || profile?.role === 'quan_tri';
}

// Được gán xe không?
export function canAssignVehicle(profile) {
  return profile?.role === 'van_phong_xe' || profile?.role === 'quan_tri';
}

// Mục lịch này đã đủ điều kiện gán xe chưa? (đã duyệt / đã điều chỉnh / lịch PCT)
export function entryNeedsVehicleOk(entry, leader) {
  if (leader?.leader_type === 'pct') return true;
  return entry.status === 'da_duyet' || entry.status === 'da_dieu_chinh';
}

// Quản trị hệ thống
export function canAdmin(profile) {
  return profile?.role === 'quan_tri';
}

// Có được tạo lịch cho ít nhất một lãnh đạo không (hiện nút "Thêm lịch")
export function canCreateAny(profile, leaders) {
  return (leaders || []).some((l) => canCreateFor(profile, l));
}

// Người này có nhìn thấy mục lịch không?
// - Lịch đã duyệt/điều chỉnh: ai cũng thấy.
// - Chờ duyệt/từ chối: người nhập (theo Ban), PCT, quản trị thấy.
export function canSeeEntry(profile, entry, leader) {
  if (!entry) return false;
  if (entry.status === 'da_duyet' || entry.status === 'da_dieu_chinh') return true;
  if (!profile) return false;
  if (profile.role === 'quan_tri' || profile.role === 'pct') return true;
  return canCreateFor(profile, leader);
}
