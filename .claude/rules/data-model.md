# Mô hình dữ liệu & luồng nghiệp vụ

## Bảng (supabase/schema.sql)
- `bans` — 4 Ban HĐND (KT-NS, PC, VH-XH, DT)
- `leaders` — ĐỐI TƯỢNG CÓ LỊCH (không phải tài khoản): leader_type `pct|doan|ban|vanphong`, ban_id, active.
  QUAN TRỌNG: pct/doan là dòng đích danh (đ/c Lê Tiến Lam, đ/c Nguyễn Quang Hải / đ/c Lương Thị Hoa,
  đ/c Bùi Văn Dũng — để gắn xe riêng + lọc); mỗi Ban là MỘT dòng đơn vị (full_name = tên Ban, position rỗng).
  Tên thành viên ghi trong Nội dung/Thành phần. Lịch tuần hiển thị cột: "Lãnh đạo HĐND tỉnh" (gộp 2 PCT)
  + "Đoàn ĐBQH tỉnh" (gộp 2 lãnh đạo Đoàn) + 4 Ban + "Lãnh đạo Văn phòng" (trực cuối tuần).
- `profiles` — 1-1 auth.users (trigger `handle_new_user` tự tạo); role + ban_ids[] + leader_id
- `vehicles` — 4 xe: `rieng` (gắn PCT qua assigned_leader_id) | `dung_chung`
- `schedule_entries` — group_id (sự kiện nhiều lãnh đạo), leader_id, date, session `sang|chieu|ca_ngay|gio`(+start/end_time), content/location/participants, status, review_note/reviewed_by/at, vehicle_id/vehicle_note/_by/_at, created_by

## Vai trò (profiles.role)
| role | quyền |
|---|---|
| quan_tri | toàn quyền (bootstrap: sonthkh@gmail.com) |
| pct | xem tất cả; duyệt/điều chỉnh/từ chối MỌI lịch (Ban + Đoàn) |
| pho_truong_doan | Phó Trưởng Đoàn ĐBQH: duyệt/điều chỉnh/từ chối CHỈ lịch Đoàn ĐBQH (doan) — đ/c Lương Thị Hoa |
| cb_ban | CRUD lịch lãnh đạo thuộc ban_ids; chỉ sửa khi cho_duyet/tu_choi |
| cb_tonghop | CRUD lịch PCT/Đoàn → khởi tạo da_duyet (hiện ngay) |
| cb_ctqh | Cán bộ Công tác Quốc hội: CRUD lịch Đoàn ĐBQH → khởi tạo cho_duyet (Phó Trưởng Đoàn duyệt) |
| van_phong_xe | gán xe cho lịch đã duyệt / lịch PCT |
| nguoi_xem | xem tất cả lịch (kể cả chờ duyệt/từ chối — phân biệt bằng màu), không sửa |

permissions.js: `canReview` = ai là người duyệt (pct/quan_tri/pho_truong_doan) để hiện tab Chờ duyệt;
`canReviewEntry(profile, entry, leader)` = duyệt ĐÚNG mục (pct/quan_tri: mọi; pho_truong_doan: chỉ doan).

## Trạng thái & luồng
- `cho_duyet` (amber) → người duyệt xử lý → `da_duyet` (emerald) | `da_dieu_chinh` (sky, ghi chú bắt buộc) | `tu_choi` (rose, lý do bắt buộc)
- Lịch PCT/Đoàn (cb_tonghop nhập): vào thẳng `da_duyet`
- Lịch Đoàn ĐBQH do cb_ctqh nhập: `cho_duyet` → Phó Trưởng Đoàn (pho_truong_doan) duyệt
- Sửa lịch `tu_choi` → tự quay về `cho_duyet`, xóa review_note
- Nhịp nghiệp vụ: thứ Sáu nhập lịch TUẦN SAU (nút "Tuần sau →" trên FilterBar)

## Trùng giờ (dates.js → sessionsOverlap)
- ca_ngay giao mọi buổi; gio×gio so khoảng; gio×buổi: trước 12:00 = sáng
- Trùng xe: cùng vehicle_id + cùng date + overlap, BỎ QUA cùng group_id
