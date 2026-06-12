// Hằng số dùng chung toàn ứng dụng

// Quản trị gốc: luôn có quyền quản trị bất kể role trong profiles
export const BOOTSTRAP_ADMIN_EMAILS = ['sonthkh@gmail.com'];

export const UNIT_NAME = 'Văn phòng Đoàn ĐBQH và HĐND tỉnh Thanh Hóa';
export const APP_NAME = 'Lịch công tác tuần';

// Vai trò người dùng (profiles.role)
export const ROLES = {
  quan_tri: 'Quản trị hệ thống',
  pct: 'Phó Chủ tịch HĐND tỉnh',
  pho_truong_doan: 'Phó Trưởng Đoàn ĐBQH (duyệt lịch Đoàn)',
  cb_ban: 'Cán bộ theo dõi Ban',
  cb_tonghop: 'Cán bộ TH-TT-Dân nguyện',
  cb_ctqh: 'Cán bộ Công tác Quốc hội (nhập lịch Đoàn)',
  van_phong_xe: 'Văn phòng (điều xe)',
  nguoi_xem: 'Người xem',
};

// Trạng thái mục lịch
export const STATUS = {
  cho_duyet: { label: 'Chờ duyệt', color: 'amber', bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-700', dot: 'bg-amber-500' },
  da_duyet: { label: 'Đã duyệt', color: 'emerald', bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  da_dieu_chinh: { label: 'Đã điều chỉnh', color: 'sky', bg: 'bg-sky-50', border: 'border-sky-300', text: 'text-sky-700', dot: 'bg-sky-500' },
  tu_choi: { label: 'Từ chối', color: 'rose', bg: 'bg-rose-50', border: 'border-rose-300', text: 'text-rose-700', dot: 'bg-rose-500' },
};

// Buổi làm việc
export const SESSIONS = {
  sang: 'Sáng',
  chieu: 'Chiều',
  ca_ngay: 'Cả ngày',
  gio: 'Theo giờ',
};

// Loại đối tượng có lịch (đơn vị hoặc cá nhân)
export const LEADER_TYPES = {
  pct: 'Lãnh đạo TTr HĐND tỉnh',
  doan: 'Đoàn ĐBQH tỉnh',
  ban: 'Ban của HĐND tỉnh',
  vanphong: 'Lãnh đạo Văn phòng',
};

// Nhãn cột gộp trên lịch tuần (cá nhân hiển thị chung 1 cột theo đơn vị)
export const PCT_GROUP_LABEL = 'Lãnh đạo TTr HĐND tỉnh';
export const DOAN_GROUP_LABEL = 'Đoàn ĐBQH tỉnh';
export const UNIT_GROUP_LABELS = { pct: PCT_GROUP_LABEL, doan: DOAN_GROUP_LABEL };

// Bộ lọc "đơn vị" ngoài 4 Ban: 3 nhóm cột theo leader_type. Dùng tiền tố 'grp:'
// để giá trị lọc không lẫn với UUID của Ban.
export const UNIT_GROUP_FILTERS = [
  { value: 'grp:pct', label: PCT_GROUP_LABEL },
  { value: 'grp:doan', label: DOAN_GROUP_LABEL },
  { value: 'grp:vanphong', label: 'Lãnh đạo Văn phòng' },
];

// Lãnh đạo có thuộc bộ lọc đơn vị hiện hành không.
// banId: rỗng -> mọi đơn vị; 'grp:<leader_type>' -> theo nhóm; còn lại -> UUID Ban.
export function leaderInUnit(leader, banId) {
  if (!banId) return true;
  if (banId.startsWith('grp:')) return leader?.leader_type === banId.slice(4);
  return leader?.ban_id === banId;
}

// Nhãn chèn vào "Danh sách thành phần" khi tick một lãnh đạo/đơn vị
export const leaderLabel = (l) => `${l.full_name}${l.position ? ', ' + l.position : ''}`;

// Các lãnh đạo/đơn vị THUỘC NHÓM = những người có nhãn xuất hiện trong members.
// Dùng CHUNG cho ô tick ở Quản trị và cho việc chọn nhanh nhóm ở trường Lãnh đạo
// -> nhóm ở hai nơi luôn gồm đúng các thành viên giống nhau.
export const groupLeaderIds = (group, leaders) =>
  (leaders || []).filter((l) => (group?.members || '').includes(leaderLabel(l))).map((l) => l.id);

// Lịch của Lãnh đạo HĐND tỉnh (pct) và Đoàn ĐBQH (doan) LUÔN để trống ô Lái xe
// (các đồng chí tự bố trí xe riêng — không hiển thị trên lịch công tác, kể cả khi
// Văn phòng có gán xe thủ công). Áp dụng cho mọi nơi hiển thị + bản in.
export const hidesDriver = (leaderType) => leaderType === 'pct' || leaderType === 'doan';

// Làm việc TẠI CƠ QUAN -> không cần điều xe (bỏ khỏi danh sách chuyến cần xe,
// không tự hiện lái xe riêng)
export const isHqLocation = (loc) =>
  (loc || '').trim().toLowerCase().replace(/\s+/g, ' ') === 'trụ sở đoàn đbqh và hđnd tỉnh';

// Địa điểm gợi ý khi nhập lịch (vẫn gõ tự do được)
export const COMMON_LOCATIONS = [
  'Trụ sở Tỉnh ủy',
  'Trụ sở UBND tỉnh',
  'Trụ sở Đoàn ĐBQH và HĐND tỉnh',
  'UBND phường Hạc Thành',
  'Trụ sở Tiếp công dân tỉnh',
  'Hội trường 25B',
];

// Loại xe
export const VEHICLE_TYPES = {
  rieng: 'Xe riêng (phục vụ lãnh đạo)',
  dung_chung: 'Xe dùng chung',
};
