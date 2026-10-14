// Ma trận phân quyền — thực thi phía ứng dụng (RLS chỉ chặn người chưa đăng nhập).
// profile: { role, ban_ids, leader_id } — role đã được App.jsx nâng thành 'quan_tri'
// nếu email thuộc BOOTSTRAP_ADMIN_EMAILS.

// Được tạo lịch cho lãnh đạo này không?
export function canCreateFor(profile, leader) {
  if (!profile || !leader) return false;
  if (profile.role === 'quan_tri') return true;
  // Người phê duyệt cũng nhập được lịch (PCT: mọi lịch; Phó Trưởng Đoàn: chỉ lịch Đoàn)
  if (profile.role === 'pct') return true;
  if (profile.role === 'pho_truong_doan') return leader.leader_type === 'doan';
  if (profile.role === 'cb_ban')
    return leader.leader_type === 'ban' && (profile.ban_ids || []).includes(leader.ban_id);
  // Cán bộ TH-TT-Dân nguyện (vd thttdn): NHẬP lịch cho MỌI đối tượng (PCT/Đoàn/các Ban/
  // Văn phòng) + SỬA mọi lịch (xem canEditEntry). Lịch Ban vẫn vào cho_duyet để PCT duyệt.
  if (profile.role === 'cb_tonghop')
    return true;
  // Cán bộ Công tác Quốc hội: nhập lịch cho lãnh đạo Đoàn ĐBQH (cần Phó Trưởng Đoàn duyệt)
  if (profile.role === 'cb_ctqh')
    return leader.leader_type === 'doan';
  return false;
}

// Trạng thái khởi tạo khi tạo lịch cho đối tượng này
// - Người PHÊ DUYỆT tự nhập lịch -> TỰ ĐỘNG DUYỆT (PCT/Quản trị: mọi lịch; Phó Trưởng
//   Đoàn: lịch Đoàn) — họ chính là người duyệt nên không cần qua bước chờ duyệt
// - Cán bộ Công tác Quốc hội nhập lịch Đoàn -> CHỜ DUYỆT (Phó Trưởng Đoàn duyệt)
// - Lịch lãnh đạo HĐND / Đoàn ĐBQH do phòng TH-TT-DN nhập hiển thị ngay, không qua duyệt
export function initialStatus(leader, profile) {
  if (profile?.role === 'quan_tri' || profile?.role === 'pct') return 'da_duyet';
  if (profile?.role === 'pho_truong_doan' && leader?.leader_type === 'doan') return 'da_duyet';
  if (profile?.role === 'cb_ctqh') return 'cho_duyet';
  return leader?.leader_type === 'pct' || leader?.leader_type === 'doan' ? 'da_duyet' : 'cho_duyet';
}

// Được sửa / xóa mục lịch này không?
export function canEditEntry(profile, entry, leader) {
  if (!profile || !entry) return false;
  if (profile.role === 'quan_tri') return true;
  // Người phê duyệt sửa được lịch mình có quyền duyệt (kể cả lịch mình tự nhập đã duyệt)
  if (canReviewEntry(profile, entry, leader)) return true;
  if (!canCreateFor(profile, leader)) return false;
  // Người TẠO lịch sửa được MỌI LÚC — kể cả lịch ĐÃ DUYỆT. Khi sửa lịch đã duyệt,
  // ScheduleForm bắt nhập "Lý do chỉnh sửa" và chuyển lịch về CHỜ DUYỆT (duyệt lại).
  return true;
}

// Có phải người duyệt (để hiện tab "Chờ duyệt" / khu xử lý nhanh) không?
// PCT + Quản trị: duyệt mọi lịch. Phó Trưởng Đoàn: chỉ duyệt lịch Đoàn ĐBQH.
export function canReview(profile) {
  return profile?.role === 'pct' || profile?.role === 'quan_tri' || profile?.role === 'pho_truong_doan';
}

// Được duyệt / điều chỉnh / từ chối ĐÚNG mục lịch này không (phân theo loại đối tượng)?
export function canReviewEntry(profile, entry, leader) {
  if (!profile || !entry) return false;
  if (profile.role === 'quan_tri' || profile.role === 'pct') return true;
  if (profile.role === 'pho_truong_doan') return leader?.leader_type === 'doan';
  return false;
}

// Được PHÂN XE không? (Phòng HC-TC-QT — vai trò van_phong_xe; Quản trị làm thay được)
export function canAssignVehicle(profile) {
  return profile?.role === 'van_phong_xe' || profile?.role === 'quan_tri';
}

// Được PHÊ DUYỆT điều xe không? — Lãnh đạo Văn phòng, trong hệ thống là Quản trị.
// Phòng HC-TC-QT chỉ phân xe; phiếu chỉ in được sau khi khâu này duyệt.
export function canApproveVehicle(profile) {
  return profile?.role === 'quan_tri';
}

// Được điều XE RIÊNG (xe phục vụ lãnh đạo) không? — CHỈ Quản trị.
// Xe riêng cũng không hiển thị trên lịch công tác (xem constants.isPrivateVehicle).
export function canDispatchPrivateVehicle(profile) {
  return profile?.role === 'quan_tri';
}

// Được IN "Phiếu đề nghị sử dụng xe ô tô công vụ" của mục lịch này không?
// Điều kiện: phiếu ĐÃ ĐƯỢC PHÊ DUYỆT và người xem là tài khoản làm việc (không phải
// tài khoản chỉ xem/khách).
export function canPrintVehicleSlip(profile, entry) {
  if (!profile || !entry) return false;
  if (profile.role === 'nguoi_xem') return false;
  return entry.vehicle_status === 'da_duyet';
}

// Mục lịch này đã đủ điều kiện gán xe chưa? (đã duyệt / đã điều chỉnh / lịch lãnh đạo)
export function entryNeedsVehicleOk(entry, leader) {
  // Đã có ĐỀ NGHỊ BỐ TRÍ XE -> vào thẳng bảng điều xe của Phòng HC-TC-QT, KỂ CẢ khi lịch
  // còn "chờ duyệt": Văn phòng cần thấy sớm để bố trí/điều phối; ô chuyến có nhãn
  // "Lịch chờ duyệt" để biết mà cân nhắc. (Lịch bị TỪ CHỐI đã lọc bỏ từ trước.)
  if (entry?.vehicle_status && entry.vehicle_status !== 'none') return true;
  // Lãnh đạo TTr HĐND tỉnh / Đoàn ĐBQH / VĂN PHÒNG: không phải chờ bước duyệt lịch.
  if (['pct', 'doan', 'vanphong'].includes(leader?.leader_type)) return true;
  return entry.status === 'da_duyet' || entry.status === 'da_dieu_chinh';
}

// Việc ĐIỀU XE đang chờ đến lượt người này (để hiện huy hiệu + băng nhắc việc):
//  - Phòng HC-TC-QT (van_phong_xe): chuyến 'de_xuat' chờ PHÂN XE
//  - Lãnh đạo Văn phòng (quan_tri): phiếu 'da_phan_xe' chờ KÝ DUYỆT (và cả chờ phân xe
//    để nắm tình hình, nhưng chỉ việc ký duyệt mới tính vào huy hiệu nhắc việc)
export function vehicleTodoCounts(entries, profile) {
  const zero = { needAssign: 0, needApprove: 0, mine: 0 };
  if (!profile) return zero;
  const canAssign = canAssignVehicle(profile);
  const canApprove = canApproveVehicle(profile);
  if (!canAssign && !canApprove) return zero;
  const seen = new Set();
  let needAssign = 0;
  let needApprove = 0;
  for (const e of entries || []) {
    if (e.status === 'tu_choi') continue;
    const key = e.group_id || e.id; // mỗi SỰ KIỆN tính 1 lần
    if (seen.has(key)) continue;
    if (e.vehicle_status === 'de_xuat') { seen.add(key); needAssign += 1; }
    else if (e.vehicle_status === 'da_phan_xe') { seen.add(key); needApprove += 1; }
  }
  return {
    needAssign,
    needApprove,
    mine: (canApprove ? needApprove : 0) + (canAssign && !canApprove ? needAssign : 0),
  };
}

// ===== THỐNG KÊ / BÁO CÁO =====
// Tab Thống kê: mọi TÀI KHOẢN LÀM VIỆC (không gồm khách / người chỉ xem).
export function canViewStats(profile) {
  return !!profile?.role && !['nguoi_xem', 'lai_xe'].includes(profile.role);
}
// Báo cáo QUY TRÌNH (tình hình duyệt lịch, người duyệt, người nhập lịch & đúng hạn):
// người duyệt + cán bộ tổng hợp (theo dõi, đôn đốc việc nhập lịch).
export function canViewProcessStats(profile) {
  return canReview(profile) || profile?.role === 'cb_tonghop';
}
// Báo cáo ĐIỀU XE: Phòng HC-TC-QT, Lãnh đạo Văn phòng (Quản trị) và Thường trực HĐND.
// Xe RIÊNG chỉ hiện trong số liệu với người được điều xe riêng (canDispatchPrivateVehicle).
export function canViewVehicleStats(profile) {
  return canAssignVehicle(profile) || profile?.role === 'pct';
}

// ===== NHẬT TRÌNH XE (cập nhật ODO hằng ngày) =====
// CHỈ lái xe, Phòng HC-TC-QT và Quản trị thấy module (RLS bảng vehicle_logs cũng chặn tương tự).
export function canUseVehicleLog(profile) {
  return ['lai_xe', 'van_phong_xe', 'quan_tri'].includes(profile?.role);
}
// Người QUẢN LÝ nhật trình: xem mọi xe, đọc số từ ảnh, sửa, xác nhận, xuất sổ.
export function canManageVehicleLog(profile) {
  return profile?.role === 'van_phong_xe' || profile?.role === 'quan_tri';
}
// Lái xe sửa được nhật trình CHƯA xác nhận trong vòng DRIVER_EDIT_DAYS ngày gần nhất;
// cũ hơn hoặc đã xác nhận -> nhờ Phòng HC-TC-QT sửa.
export const DRIVER_EDIT_DAYS = 7;
export function canEditVehicleLog(profile, log, todayISO, dateISO) {
  if (canManageVehicleLog(profile)) return true;
  if (profile?.role !== 'lai_xe') return false;
  if (log && log.status === 'da_xac_nhan') return false;
  const d = dateISO || log?.log_date;
  if (!d || !todayISO || d > todayISO) return false;
  const diff = (Date.parse(todayISO) - Date.parse(d)) / 86400000;
  return diff <= DRIVER_EDIT_DAYS;
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
// Mọi người đã đăng nhập (kể cả Người xem) thấy TẤT CẢ lịch, gồm cả mục
// chưa phê duyệt / từ chối — trạng thái được phân biệt bằng màu huy hiệu.
export function canSeeEntry(_profile, entry) {
  return !!entry;
}
