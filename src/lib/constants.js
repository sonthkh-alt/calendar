// Hằng số dùng chung toàn ứng dụng

// Quản trị gốc: luôn có quyền quản trị bất kể role trong profiles
export const BOOTSTRAP_ADMIN_EMAILS = ['sonthkh@gmail.com'];

export const UNIT_NAME = 'Văn phòng Đoàn ĐBQH và HĐND tỉnh Thanh Hóa';
export const APP_NAME = 'Lịch công tác tuần';

// Vai trò người dùng (profiles.role)
export const ROLES = {
  quan_tri: 'Quản trị hệ thống',
  pct: 'Phó Chủ tịch HĐND tỉnh',
  cb_ban: 'Cán bộ theo dõi Ban',
  cb_tonghop: 'Cán bộ TH-TT-Dân nguyện',
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

// Loại lãnh đạo
export const LEADER_TYPES = {
  pct: 'Thường trực HĐND tỉnh',
  ban: 'Lãnh đạo Ban',
  vanphong: 'Lãnh đạo Văn phòng',
};

// Loại xe
export const VEHICLE_TYPES = {
  rieng: 'Xe riêng (phục vụ PCT)',
  dung_chung: 'Xe dùng chung',
};
