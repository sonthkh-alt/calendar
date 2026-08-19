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
- `schedule_entries` — group_id (sự kiện nhiều lãnh đạo), leader_id, date, session `sang|chieu|ca_ngay|gio`(+start/end_time), content/location/participants, status, review_note/reviewed_by/at, vehicle_id/vehicle_ids/vehicle_note/_by/_at, created_by
  + ĐỀ NGHỊ XE: `vehicle_requested` (ô tick khi nhập lịch), `rider_count`, `departure_place`,
  `vehicle_status`, `vehicle_requested_by/_at`, `vehicle_approve_note`, `vehicle_approved_by/_at`, `vehicle_sign_code`
- `profiles.signature_data` — ảnh chữ ký (data URI) in trên phiếu điều xe khi Quản trị duyệt

## Vai trò (profiles.role)
| role | quyền |
|---|---|
| quan_tri | toàn quyền (bootstrap: sonthkh@gmail.com) |
| pct | xem tất cả; duyệt/điều chỉnh/từ chối MỌI lịch (Ban + Đoàn), kể cả lịch ĐÃ duyệt; NHẬP lịch cho mọi đối tượng → tự động da_duyet. Gồm PCT + Chủ tịch HĐND tỉnh (phongnh@thanhhoa.gov.vn, chức vụ "Chủ tịch HĐND tỉnh") |
| pho_truong_doan | Phó Trưởng Đoàn ĐBQH: duyệt/điều chỉnh/từ chối CHỈ lịch Đoàn (doan); NHẬP lịch Đoàn → tự động da_duyet — đ/c Lương Thị Hoa |
| cb_ban | CRUD lịch lãnh đạo thuộc ban_ids; chỉ sửa khi cho_duyet/tu_choi |
| cb_tonghop | CRUD lịch MỌI đối tượng (PCT/Đoàn/các Ban/Văn phòng) + SỬA mọi lịch mọi lúc (vd thttdn@thanhhoa.gov.vn). Lịch PCT/Đoàn → da_duyet ngay; lịch Ban/VP → cho_duyet (PCT duyệt) |
| cb_ctqh | Cán bộ Công tác Quốc hội: CRUD lịch Đoàn ĐBQH → khởi tạo cho_duyet (Phó Trưởng Đoàn duyệt) |
| van_phong_xe | Phòng HC-TC-QT: PHÂN xe cho các chuyến có đề nghị (không tự phê duyệt; không điều được xe riêng) |
| nguoi_xem | xem tất cả lịch (kể cả chờ duyệt/từ chối — phân biệt bằng màu), không sửa |

permissions.js: `canReview` = ai là người duyệt (pct/quan_tri/pho_truong_doan) để hiện tab Chờ duyệt;
`canReviewEntry(profile, entry, leader)` = duyệt ĐÚNG mục (pct/quan_tri: mọi; pho_truong_doan: chỉ doan).

## Trạng thái & luồng
- `cho_duyet` (amber) → người duyệt xử lý → `da_duyet` (emerald) | `da_dieu_chinh` (sky, ghi chú bắt buộc) | `tu_choi` (rose, lý do bắt buộc)
- Lịch PCT/Đoàn (cb_tonghop nhập): vào thẳng `da_duyet`
- Lịch do NGƯỜI PHÊ DUYỆT tự nhập (pct/quan_tri mọi lịch; pho_truong_doan lịch Đoàn): vào thẳng `da_duyet` (xem permissions.initialStatus)
- Lịch Đoàn ĐBQH do cb_ctqh nhập: `cho_duyet` → Phó Trưởng Đoàn (pho_truong_doan) duyệt
- Sửa lịch `tu_choi` → tự quay về `cho_duyet`, xóa review_note
- Từ chối MỘT VÀI thành viên của sự kiện nhóm (EntryDetail): các thành viên CÒN LẠI đang
  `cho_duyet` được tự động `da_duyet`; thẻ bị từ chối gạch ngang tách riêng (merge key thêm cờ 'tc')
- Nhịp nghiệp vụ: thứ Sáu nhập lịch TUẦN SAU (nút "Tuần sau →" trên FilterBar)

## Điều xe (phiếu đề nghị sử dụng xe ô tô công vụ)
- Ô tick **"Đề nghị bố trí xe"** trong form nhập lịch. KHÔNG tick = `no_vehicle`, không vào danh sách điều xe.
- `vehicle_status`: `none` → `de_xuat` (chuyên viên đề nghị) → `da_phan_xe` (lãnh đạo Phòng HC-TC-QT
  xem xét, phân bổ xe/lái xe) → `da_duyet` (Lãnh đạo Văn phòng = vai trò `quan_tri` ký duyệt) |
  `tu_choi` (không bố trí được xe).
- TRÌNH TỰ BẮT BUỘC: nút "Phê duyệt & ký số" CHỈ hiện khi `vehicle_status = 'da_phan_xe'` — chưa phân
  xe thì Lãnh đạo Văn phòng không duyệt được (chỉ có thể "Không bố trí xe").
- Người đề nghị in trên phiếu ("Tên tôi là / Chức vụ / NGƯỜI BÁO XE") = **lãnh đạo CHỦ TRÌ cao nhất**
  của sự kiện (STT `leaders.sort_order` nhỏ nhất trong các mục đã gộp), KHÔNG phải chuyên viên nhập lịch.
- Lịch của **lãnh đạo Văn phòng** (`leader_type='vanphong'`) đề nghị xe được như pct/doan: vào thẳng
  danh sách điều xe, không chờ bước duyệt lịch (`permissions.entryNeedsVehicleOk`).
- Sửa lịch đã duyệt phiếu mà đổi thông tin chuyến (ngày/buổi/nội dung/địa điểm/số người/nơi xuất phát)
  → quay về `da_phan_xe` để duyệt lại. Bỏ tick → `none` + gỡ xe đã gán.
- **In Phiếu điều xe** ở hộp chi tiết lịch, chỉ khi `da_duyet` và không phải tài khoản `nguoi_xem`.
- **Xe riêng** (`vehicles.vehicle_type='rieng'`): KHÔNG hiển thị trên lịch tuần/ngày/chi tiết; chỉ
  `quan_tri` mới chọn được khi điều xe (permissions.canDispatchPrivateVehicle).
- Phê duyệt ghi `vehicle_approved_by/_at` + `vehicle_sign_code` (mã xác thực in trên phiếu) và in kèm
  ảnh chữ ký `profiles.signature_data` nếu có.
- Nhắc việc: `permissions.vehicleTodoCounts` -> huy hiệu tab "Điều xe" + băng vàng đầu trang cho
  van_phong_xe / quan_tri; EntryCard có chip trạng thái phiếu xe.
- **Ký số USB token**: bấm "Phê duyệt & ký số" -> tự tải PDF phiếu -> Lãnh đạo VP ký bằng phần mềm
  Ban Cơ yếu -> tải tệp đã ký lên (Supabase Storage bucket `phieu-dieu-xe`) -> lưu
  `vehicle_signed_path/_name/_at/_by`. Chuyên viên chỉ bấm "Tải phiếu đã ký số (PDF)". Xem `docs/KY-SO.md`.

## Trùng giờ (dates.js → sessionsOverlap)
- ca_ngay giao mọi buổi; gio×gio so khoảng; gio×buổi: trước 12:00 = sáng
- Trùng xe: cùng vehicle_id + cùng date + overlap, BỎ QUA cùng group_id
