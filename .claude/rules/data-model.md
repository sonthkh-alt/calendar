# Mô hình dữ liệu & luồng nghiệp vụ

## Bảng (supabase/schema.sql)
- `bans` — 4 Ban HĐND (KT-NS, PC, VH-XH, DT)
- `leaders` — người CÓ LỊCH (không phải tài khoản): leader_type `pct|ban|vanphong`, ban_id, active
- `profiles` — 1-1 auth.users (trigger `handle_new_user` tự tạo); role + ban_ids[] + leader_id
- `vehicles` — 4 xe: `rieng` (gắn PCT qua assigned_leader_id) | `dung_chung`
- `schedule_entries` — group_id (sự kiện nhiều lãnh đạo), leader_id, date, session `sang|chieu|ca_ngay|gio`(+start/end_time), content/location/participants, status, review_note/reviewed_by/at, vehicle_id/vehicle_note/_by/_at, created_by

## Vai trò (profiles.role)
| role | quyền |
|---|---|
| quan_tri | toàn quyền (bootstrap: sonthkh@gmail.com) |
| pct | xem tất cả; duyệt/điều chỉnh/từ chối lịch Ban |
| cb_ban | CRUD lịch lãnh đạo thuộc ban_ids; chỉ sửa khi cho_duyet/tu_choi |
| cb_tonghop | CRUD lịch PCT → khởi tạo da_duyet (hiện ngay) |
| van_phong_xe | gán xe cho lịch đã duyệt / lịch PCT |
| nguoi_xem | chỉ xem lịch da_duyet/da_dieu_chinh |

## Trạng thái & luồng
- `cho_duyet` (amber) → PCT xử lý → `da_duyet` (emerald) | `da_dieu_chinh` (sky, ghi chú bắt buộc) | `tu_choi` (rose, lý do bắt buộc)
- Lịch PCT (cb_tonghop nhập): vào thẳng `da_duyet`
- Sửa lịch `tu_choi` → tự quay về `cho_duyet`, xóa review_note
- Nhịp nghiệp vụ: thứ Sáu nhập lịch TUẦN SAU (nút "Tuần sau →" trên FilterBar)

## Trùng giờ (dates.js → sessionsOverlap)
- ca_ngay giao mọi buổi; gio×gio so khoảng; gio×buổi: trước 12:00 = sáng
- Trùng xe: cùng vehicle_id + cùng date + overlap, BỎ QUA cùng group_id
