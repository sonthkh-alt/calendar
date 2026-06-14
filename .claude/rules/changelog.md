# Nhật ký dự án

## 2026-06-14 — Người phê duyệt tự nhập lịch (tự duyệt) + từ chối gạch ngang
- permissions.canCreateFor: pct nhập được MỌI lịch; pho_truong_doan nhập lịch Đoàn (doan)
- permissions.initialStatus: pct/quan_tri tự nhập -> da_duyet; pho_truong_doan nhập Đoàn -> da_duyet
- permissions.canEditEntry: người phê duyệt sửa được lịch mình có quyền duyệt (canReviewEntry)
- TỪ CHỐI: EntryCard gạch ngang TOÀN BỘ thông tin (line-through, xám) khi tu_choi; giữ
  ghi chú lý do (no-underline, đỏ). Từ chối VÀI thành viên -> thành viên còn lại (cho_duyet)
  tự động da_duyet và hiển thị bình thường; thẻ từ chối tách riêng (merge key thêm cờ 'tc'
  ở WeekView/DayView; EntryDetail.same nhóm theo tu_choi / không-tu_choi)

## 2026-06-14 — Điều chỉnh / Từ chối lịch nhóm theo TỪNG thành viên
- EntryDetail "Xử lý nhanh": với sự kiện nhiều thành viên (merged > 1), form Điều chỉnh
  và Từ chối hiện danh sách CHECKBOX chọn thành viên (mặc định chọn tất cả) + nút
  "Tất cả"/"Bỏ chọn"; thao tác CHỈ áp dụng cho các mục được tick (selIds) thay vì cả nhóm
- doAdjust/doReject dùng selIds (bắt buộc >= 1); doApprove vẫn áp dụng cả nhóm (mergedIds)
- Thành viên không được chọn giữ nguyên trạng thái -> tách thành thẻ riêng trên lịch
- Memo hóa `merged` (useMemo) để hết cảnh báo deps; ApprovalQueue vốn đã xử lý từng mục

## 2026-06-14 — Phê duyệt lịch THEO NGÀY ngay trên màn hình lịch
- Người duyệt (pct/quan_tri: mọi lịch; pho_truong_doan: chỉ lịch Đoàn) thấy nút xanh
  "Duyệt ngày (N)" ngay trên màn hình Lịch tuần & Lịch ngày — không cần vào tab Chờ duyệt
- WeekView: ApproveDayBtn hiện trên ô tiêu đề Thứ/Ngày (chế độ Đầy đủ) + trên dải tiêu đề
  ngày (chế độ Gọn); N = số lịch CHỜ DUYỆT trong ngày thuộc các cột đang hiển thị mà người
  đó có quyền (canReviewEntry). Bấm -> confirm -> reviewEntries(ids,'da_duyet') -> onChanged
- DayView: thanh xanh đầu màn "Có N lịch chờ duyệt" + nút "Duyệt cả ngày (N)"
- pendingByDay/pendingIds BỎ QUA bộ lọc trạng thái để luôn bắt được mục chờ duyệt
- App.jsx truyền onChanged={refresh} vào WeekView + DayView

## 2026-06-12 — Header ngày (Gọn) nổi bật + sửa sắp xếp "Cả ngày"
- WeekView Gọn: dải tiêu đề ngày to/đậm thành BĂNG ĐỎ riêng rẽ (gradient đỏ, chữ
  trắng 18px + icon lịch, viền đáy 4px; hôm nay = băng vàng), khối cách nhau space-y-5
- constants.makeEntrySorter: "Cả ngày" KHÔNG còn hạng 0 (đứng trước mọi thứ) mà coi
  như BUỔI SÁNG (hạng 1) -> trong buổi sáng xếp theo STT lãnh đạo. Sửa lỗi lịch
  "Cả ngày" của Ban đứng trước lịch "Sáng" của PCT (PCT STT nhỏ -> nay lên trước)

## 2026-06-12 — Nâng cấp hạ tầng: PWA, sao lưu tự động, realtime, audit log + RLS
- **#7 PWA:** public/manifest.webmanifest + public/sw.js (network-first cho điều hướng &
  Supabase REST GET, cache-first cho asset) + đăng ký SW trong main.jsx + meta iOS trong
  index.html. Cài lên màn hình điện thoại, xem lịch offline (bản đã tải gần nhất).
- **#8 Sao lưu tự động:** .github/workflows/db-backup.yml — cron 22:00 UTC hằng ngày,
  psql xuất từng bảng ra JSON + backup-full.json, lưu artifact (90 ngày). Chỉ đọc.
- **#5 Realtime:** schema.sql đưa schedule_entries + danh mục vào publication
  supabase_realtime (idempotent). App.jsx subscribe postgres_changes, gom 400ms rồi
  refetch — lịch tự cập nhật khi người khác sửa, không cần tải lại trang.
- **#4 Audit log + RLS:** migration 2026-06-12-audit-log-rls.sql — bảng activity_log +
  trigger log_schedule_change (bọc EXCEPTION để lỗi log không làm hỏng thao tác lịch);
  helper is_app_admin()/is_app_writer() SECURITY DEFINER; SIẾT RLS: SELECT mở cho
  authenticated, GHI danh mục/profiles=admin, GHI lịch=mọi vai trò trừ nguoi_xem
  (chốt admin gốc qua email JWT). Tab Quản trị "Nhật ký" (AdminLog.jsx) xem 300 thao
  tác gần nhất. GỠ: xóa file migration -> schema.sql tự khôi phục policy mở.

## 2026-06-12 — Sửa lịch: cho phép sửa cả danh sách "Lãnh đạo"
- ScheduleForm: hiện phần chọn Lãnh đạo + chip nhóm CẢ KHI SỬA (trước chỉ khi thêm mới);
  điền sẵn tất cả lãnh đạo của sự kiện (cùng group_id) + group_label
- Lưu khi sửa: ĐỐI CHIẾU theo group_id -> cập nhật mục của lãnh đạo còn lại (giữ id/xe),
  tạo mục cho lãnh đạo mới thêm (chung group_id), xóa mục của lãnh đạo bị bỏ
- api.createEntries: nhận group_id truyền sẵn (giữ nhóm khi thêm lãnh đạo vào sự kiện cũ)

## 2026-06-12 — Điều xe cho CẢ NHÓM + bỏ xe riêng mặc định khỏi bảng điều xe
- api.assignVehicles(ids, ...): gán/bỏ gán xe nhiều mục cùng lúc (.in)
- VehicleBoard: "Chuyến cần xe" gom theo group_id -> 1 mục, chọn xe gán cho CẢ NHÓM
  (assignVehicles); lưới xe gộp mục cùng group_id thành 1 ô, "Bỏ gán" gỡ cả nhóm
- usesVehicle CHỈ tính xe đã GÁN TAY (e.vehicle_id) -> xe riêng mặc định của PCT/Đoàn
  KHÔNG còn hiện/tính trên bảng + không tính khi cảnh báo trùng (bỏ nhánh dedicated)

## 2026-06-12 — SỬA LỖI nghiêm trọng: migration ghi đè HỌ TÊN lãnh đạo Ban
- Triệu chứng: sau mỗi lần deploy, họ tên thành viên Ban bị đổi thành tên Ban
  (vd "Hoàng Anh Tuấn" -> "Ban Kinh tế Ngân sách"); người dùng sửa tay rồi lại bị đổi
- Nguyên nhân: 2026-06-12-chuan-hoa-du-lieu.sql có bước "đồng bộ full_name dòng Ban =
  tên Ban" (cho mô hình cũ mỗi Ban 1 dòng đơn vị). Nay mỗi Ban gồm nhiều thành viên
  đích danh -> bước này GHI ĐÈ tên thành viên; Actions chạy lại mỗi deploy -> lặp lại
- Sửa: XÓA hẳn bước đó. Migration không còn đụng vào họ tên lãnh đạo
- (Dữ liệu lãnh đạo lưu ở bảng `leaders` trên Supabase Postgres)

## 2026-06-12 — Sửa khoảng trắng lớn khi in + lề trên/dưới 2cm
- Nguyên nhân khoảng trắng: .print-root tbody tr {break-inside: avoid} ép cả khối
  ngày (ô Ngày dùng rowSpan) sang trang sau -> đổi thành auto để nội dung lấp đầy trang
- Lề: @page margin 10mm 8mm -> 20mm 12mm (trên/dưới 2cm). Sửa CẢ index.css VÀ
  lib/print.js (print.js chèn @page lúc in nên đè CSS)

## 2026-06-12 — Thứ tự sắp xếp lịch tuần + bản in: Sáng->Chiều rồi theo STT nhóm/lãnh đạo
- constants.makeEntrySorter(leaders, groups): so sánh trong ngày -> (1) Sáng trước Chiều
  (ca_ngay đầu; gio theo mốc 12:00), (2) STT nhóm nếu có group_label, ngược lại STT lãnh đạo,
  tăng dần; tie-break: STT lãnh đạo -> start_time -> nội dung
- WeekView: cả Đầy đủ (sort trước khi gộp ô) và Gọn (sort dayEntries) dùng entrySorter
- WeekPrintSheet: mergeDay sort theo entrySorter (bỏ sortKey theo giờ cũ)

## 2026-06-12 — Ô nhập NGÀY định dạng dd/mm/yyyy (không theo locale trình duyệt)
- Lỗi: <input type="date"> hiện mm/dd/yyyy (kiểu Mỹ) theo locale trình duyệt, không ép được
- DateField.jsx: ô text dd/mm/yyyy + nút lịch (mở showPicker của input date ẩn);
  parse/format qua dates.isoToDMY / dmyToISO (giá trị vẫn lưu ISO yyyy-MM-dd)
- Thay 3 ô type=date: ScheduleForm (Ngày), ApprovalQueue + EntryDetail (điều chỉnh)
- Các nơi HIỂN THỊ ngày vốn đã dd/MM/yyyy (date-fns locale vi)

## 2026-06-12 — Luồng duyệt lịch Đoàn ĐBQH: cb_ctqh nhập -> Phó Trưởng Đoàn duyệt
- 2 vai trò mới: pho_truong_doan (duyệt CHỈ lịch doan) + cb_ctqh (nhập lịch doan -> cho_duyet)
- permissions: canCreateFor(cb_ctqh->doan); initialStatus(leader, profile) (cb_ctqh->cho_duyet);
  canReview thêm pho_truong_doan; thêm canReviewEntry(profile,entry,leader) phân loại theo doan
- ApprovalQueue lọc theo canReviewEntry; EntryDetail.canModerate dùng canReviewEntry;
  App.pendingCount đếm theo quyền; ScheduleForm truyền profile vào initialStatus
- schema: profiles role check thêm pho_truong_doan/cb_ctqh (+ALTER idempotent)
- Migration 2026-06-12-tai-khoan-ctqh-doan.sql: hoalt@thanhhoa.gov.vn (mk 6, Lương Thị Hoa,
  pho_truong_doan, gắn leader doan) + ctqh@thanhhoa.gov.vn (mk 7, cb_ctqh); token = '' (tránh lỗi GoTrue)

## 2026-06-12 — Nhóm thành phần: cột TT tự đánh số 1..N (như tab Lãnh đạo)
- AdminGroups: TT thành số thứ tự dòng tự động (đọc-only) + nút ↑↓ hoán đổi sort_order;
  bỏ ô nhập "Thứ tự" thủ công (form thêm + dòng sửa); thêm mới tự lấy sort_order = max+1

## 2026-06-12 — Tinh gọn thẻ lịch tuần + bỏ dòng "Gồm:" trong chi tiết
- EntryCard: thêm prop brief -> thẻ lịch tuần BỎ dòng TP và Lái xe, in ĐẬM + rõ Giờ
  (icon đỏ, font-bold). WeekView truyền brief; DayView vẫn hiện đầy đủ
- EntryDetail: bỏ dòng "Gồm: <danh sách lãnh đạo>" dưới Lãnh đạo/Đơn vị (Thành phần
  bên dưới đã liệt kê đủ)

## 2026-06-12 — Sửa cảnh báo trùng địa điểm SAI với sự kiện nhiều lãnh đạo
- Lỗi: 1 sự kiện có nhiều lãnh đạo Ban -> nhiều dòng cùng địa điểm -> tự cảnh báo
  "TRÙNG ĐỊA ĐIỂM" lẫn nhau (dù là cùng một sự kiện)
- App.dupMap: gom theo SỰ KIỆN (group_id, hoặc nội dung+ngày+buổi) trước khi đếm;
  chỉ cảnh báo khi có >= 2 SỰ KIỆN KHÁC NHAU cùng địa điểm; danh sách "trùng với"
  gộp tên các lãnh đạo của sự kiện kia

## 2026-06-12 — Sửa: "Làm việc tại cơ quan" KHÔNG in được Thành phần
- ScheduleForm: tick at_office trước đây lưu participants=null + ẩn ô Thành phần
  -> Sửa: ô Thành phần LUÔN hiện (chỉ ẩn Địa điểm); lưu participants bình thường
- WeekPrintSheet: bỏ việc để trống Thành phần cho at_office -> in group_label/compactParticipants
- EntryDetail: nhánh at_office hiện thêm dòng Thành phần (nếu có) để xem trước khi in
- EntryCard (ô lịch) vẫn tối giản: chỉ Nội dung + "Làm việc tại cơ quan"
- Lưu ý: mục at_office tạo TRƯỚC bản vá có participants=null -> sửa & lưu lại để in TP

## 2026-06-12 — Cho phép Điều chỉnh / Từ chối lịch ĐÃ DUYỆT (trong chi tiết)
- EntryDetail "Xử lý nhanh": canModerate cho cả cho_duyet/da_duyet/da_dieu_chinh
  (trước chỉ cho_duyet). Đã duyệt -> ẩn nút Phê duyệt, hiện Điều chỉnh + Từ chối
- Thêm form Điều chỉnh inline (nội dung/ngày/buổi/địa điểm + ghi chú bắt buộc) ->
  trạng thái da_dieu_chinh; áp dụng cho CẢ NHÓM (mergedIds) qua api.updateEntries
- Từ chối lịch đã duyệt -> tu_choi kèm lý do (cả nhóm)

## 2026-06-12 — Duyệt 1 thẻ (lịch tuần) = duyệt cả nhóm thành viên
- api.reviewEntries(ids, ...): cập nhật trạng thái nhiều mục cùng lúc (.in('id', ids))
- EntryDetail "Xử lý nhanh": doApprove/doReject áp dụng cho TẤT CẢ mục đã gộp
  (mergedIds = các mục cùng nội dung+ngày+buổi/giờ) -> duyệt/từ chối cả nhóm 1 lần
- ApprovalQueue giữ nguyên (duyệt từng mục / "Duyệt cả tuần")

## 2026-06-12 — Lịch nhập theo nhóm KHÔNG cảnh báo trùng địa điểm
- App.dupMap: bỏ qua entry có group_label -> chọn nhanh theo nhóm là chủ đích, không
  tự cảnh báo trùng địa điểm lẫn nhau và không gây cảnh báo cho mục khác

## 2026-06-12 — Gộp mục trùng (nhóm nhiều đơn vị cùng cột) -> 1 thẻ trên lịch
- Vấn đề: chọn nhóm (vd Ban Pháp chế) gồm nhiều thành viên cùng 1 cột -> tạo nhiều
  mục giống hệt -> hiện nhiều thẻ trùng trong cùng cột
- WeekView chế độ Đầy đủ: dùng mergeEntries + renderMergedCard (như chế độ Gọn) để
  gộp mục cùng nội dung+buổi/giờ+địa điểm thành 1 thẻ (bỏ renderCard cũ)
- DayView: gộp tương tự trong mỗi khối Sáng/Chiều; MonthView: đếm theo SỰ KIỆN (dedupe)
- Xóa thẻ đã gộp -> xóa CẢ NHÓM mục: api.deleteEntries(ids) + App.onDeleteMany
  (truyền vào WeekView/DayView); mergeEntries thu thập ids các mục con
- Lưu ý: ApprovalQueue vẫn liệt kê từng mục (duyệt từng cái / "Duyệt cả tuần")

## 2026-06-12 — Nhóm ở trường Lãnh đạo dùng CHUNG định nghĩa với ô Thành phần
- Bỏ định nghĩa riêng "Đơn vị thuộc nhóm" (UnitTicks + cột participant_groups.leader_ids)
- Thành viên nhóm = các lãnh đạo được tick trong "Danh sách thành phần" (suy từ members):
  constants.leaderLabel + groupLeaderIds(group, leaders) = leaders mà members chứa nhãn
- ScheduleForm: chip nhóm ở trường Lãnh đạo dùng groupLeaderIds (lọc theo quyền) -> tạo
  mục cho đúng các lãnh đạo + group_label + điền Thành phần; hai nơi luôn đồng nhất
- AdminGroups: bỏ UnitTicks, dùng leaderLabel từ constants; cập nhật hướng dẫn
- schema.sql/seed.sql: bỏ cột leader_ids; xóa migration 2026-06-12-gan-don-vi-cho-nhom.sql
  (cột cũ trên DB nếu còn thì vô hại, không dùng tới)

## 2026-06-12 — Chọn Nhóm thành phần ở trường Lãnh đạo (lịch ghi theo tên nhóm)
- schema.sql: participant_groups.leader_ids uuid[] (đơn vị thuộc nhóm) +
  schedule_entries.group_label text (nhãn nhóm hiển thị thay tên đơn vị)
- Migration 2026-06-12-gan-don-vi-cho-nhom.sql: tự gán leader_ids cho các nhóm
  sẵn có theo tên (Thường trực->pct, Đoàn->doan, Ban->ban, Văn phòng->vanphong); idempotent
- AdminGroups: thêm UnitTicks (ô vàng) gán đơn vị/lãnh đạo thuộc nhóm -> leader_ids
- ScheduleForm: trường Lãnh đạo có chip "Chọn nhanh theo nhóm"; chọn nhóm -> thêm
  các leader_ids (lọc theo quyền) + đặt group_label; lưu group_label vào từng mục
- Hiển thị: EntryCard/EntryDetail/WeekPrintSheet -> ghi group_label thay tên đơn vị
  (mỗi đơn vị 1 ô đều ghi tên nhóm; chi tiết liệt kê "Gồm:" các đơn vị)
- seed.sql: participant_groups có leader_ids theo leader_type

## 2026-06-12 — Chuẩn hóa dữ liệu: STT tự động, bỏ "Đ/c" tên, tên Ban đầy đủ
- Migration 2026-06-12-chuan-hoa-du-lieu.sql (idempotent): bỏ tiền tố Đ/c/Đồng chí
  trong leaders.full_name; đổi tên 4 Ban đầy đủ (giữ "Ban", bỏ viết tắt/gạch ngang):
  Ban Kinh tế Ngân sách / Ban Pháp chế / Ban Văn hóa Xã hội / Ban Dân tộc
  (short_name = phần không có "Ban"); sort_order đánh lại liền mạch 1..N
- AdminLeaders: cột TT TỰ đánh số 1,2,3 (đọc-only) + nút ↑↓ hoán đổi sort_order;
  "Thêm lãnh đạo" tự lấy sort_order = max+1 (bỏ ô nhập thứ tự thủ công)
- seed.sql đồng bộ chuẩn mới (tên không Đ/c, Ban đầy đủ, sort_order 1..9, nhóm TP bỏ viết tắt)
- Nội dung/Thành phần lịch VẪN ghi "Đ/c" tự do (không đụng) — chỉ chuẩn hóa danh mục lãnh đạo

## 2026-06-12 — Cờ "Làm việc tại cơ quan" (at_office)
- schema.sql: ALTER ADD COLUMN at_office boolean not null default false (idempotent)
- ScheduleForm: checkbox "Làm việc tại cơ quan"; tick -> ẩn + bỏ bắt buộc Địa điểm/Thành phần,
  lưu location/participants = null, vào THẲNG da_duyet (không cần phê duyệt mọi vai trò)
- EntryCard / EntryDetail: at_office -> chỉ hiện Nội dung (+Lãnh đạo) + dòng in đậm nổi bật
  "Làm việc tại cơ quan" (nền amber), ẩn Thời gian/Địa điểm/Thành phần/Lái xe
- WeekPrintSheet: cột Địa điểm in đậm "Làm việc tại cơ quan", Thành phần để trống
- VehicleBoard: loại entry at_office khỏi panel "Chuyến cần xe"

## 2026-06-12 — Lãnh đạo HĐND tỉnh + Đoàn ĐBQH: ô Lái xe LUÔN để trống
- Yêu cầu: lịch của pct/doan không hiển thị lái xe (các đ/c tự bố trí xe riêng),
  kể cả khi Văn phòng có gán xe thủ công -> đảo lại quyết định "Xe riêng PCT mặc định"
- constants.js: thêm hidesDriver(leaderType) = leaderType ∈ {pct, doan}
- WeekView (Đầy đủ + Gọn), DayView, EntryDetail: hidesDriver -> vehicle = null ('—')
- EntryDetail: ẩn luôn khu "gán xe nhanh" cho pct/doan (showVehicle += !hidesDriver)
- KHÔNG đổi VehicleBoard (bảng điều xe nội bộ vẫn theo dõi xe riêng để tránh trùng);
  WeekPrintSheet vốn đã bỏ cột Lái xe nên không ảnh hưởng

## 2026-06-12 — SỬA LỖI đăng nhập "Database error querying schema"
- Triệu chứng: nhập email+mật khẩu -> "Database error querying schema" (lỗi GoTrue, không phải app)
- Nguyên nhân GỐC: migration tạo 5 tài khoản chèn thẳng vào auth.users nhưng bỏ trống các
  cột token (confirmation_token, recovery_token, email_change, email_change_token_new/current,
  reauthentication_token) -> mặc định NULL. GoTrue (Go) quét các cột này vào string non-nullable
  -> gặp NULL thì ném lỗi khi đăng nhập.
- Sửa 2026-06-12-tao-tai-khoan.sql: INSERT set các cột token = '' cho user mới + thêm khối
  UPDATE auth.users coalesce(...,'') sửa mọi tài khoản đã tạo trước (idempotent, gồm cả khách)
- Áp dụng: push -> GitHub Actions db-migrate tự chạy, HOẶC dán khối UPDATE vào Supabase SQL Editor

## 2026-06-12 — Khung hình theo thiết bị (Tự động/Máy tính/Điện thoại)
- DeviceSelect.jsx: dropdown ở header chọn 'auto'|'desktop'|'mobile', lưu localStorage
- App.jsx: matchMedia('(max-width:767px)') -> isMobile (ép thủ công hoặc auto+màn hẹp);
  phoneFrame = ép 'mobile' trên màn rộng -> bọc <main> trong khung điện thoại (ring bezel)
- WeekView: nhận isMobile -> ép chế độ Gọn (khối từng ngày, kéo dọc), lưới grid-cols-1,
  ẩn nút Đầy đủ/Gọn, thay bằng nhãn "Chế độ điện thoại"

## 2026-06-12 — Đường nét lịch tuần đậm/nhạt tách khối ngày + lọc theo nhóm cột
- WeekView (chế độ Đầy đủ): đường DỌC giữa cột nhạt (slate-200), đường ngang giữa
  Sáng/Chiều rất nhạt (slate-100), đường ngang giữa các NGÀY ĐẬM 2px (slate-300,
  ngày hôm nay = amber-300) -> mỗi ngày thành 1 khối nổi bật
- FilterBar "đơn vị": thêm Lãnh đạo HĐND tỉnh / Đoàn ĐBQH / Lãnh đạo Văn phòng
  (giá trị 'grp:<leader_type>'); constants.leaderInUnit() dùng chung cho Week/Day/Month

## 2026-06-12 — Sửa lỗi GỐC không gộp tên nhóm khi in: lệch tiền tố kính ngữ
- Triệu chứng: in ra vẫn liệt kê đủ tên dù đã định nghĩa nhóm. Nguyên nhân: `present`
  so khớp bằng `norm(s).includes(memberName)` — đòi cả tiền tố; nhóm lưu "Đ/c X" mà
  lịch ghi "Đồng chí X" (hoặc tên trần) -> includes=false -> coi như thiếu người -> bỏ gộp
- Sửa WeekPrintSheet: thêm coreName() (bỏ tiền tố Đ/c|Đồng chí|Ông|Bà) + isSamePerson()
  dùng CHUNG cho cả bước kiểm đủ người lẫn bước thay thế (trước đây 2 bước lệch nhau)
- test-compact.mjs: thêm ca 8 (lịch "Đồng chí" vs nhóm "Đ/c") + ca 9 (tên trần) — 9/9 đạt

## 2026-06-12 — Bản in: gộp cột Thành phần + sửa lỗi nhận diện nhóm
- Gộp Đơn vị/Lãnh đạo + Thành phần thành 1 cột "Thành phần" (5 cột)
- compactParticipants: THAY đoạn thành viên khớp nhóm bằng tên nhóm, GIỮ phần sau
  dấu chấm (Cán bộ tham dự...); sửa bug chức vụ "PCT Thường trực HĐND tỉnh" chứa
  tên nhóm gây bỏ qua gộp; kiểm chứng bằng scripts/test-compact.mjs (5 ca đạt)

## 2026-06-12 — Tick lãnh đạo khi soạn nhóm + tinh gọn bản in
- AdminGroups: LeaderTicks — tick lãnh đạo/đơn vị để chèn "tên, chức vụ" vào members
- WeekPrintSheet: BỎ cột Lái xe; cột Đơn vị/Lãnh đạo ghi GỌN bằng tên Nhóm thành phần
  nếu Thành phần chứa members của nhóm (groups truyền từ App qua WeekView)

## 2026-06-12 — Xe riêng PCT mặc định tuyệt đối
- Lịch PCT luôn hiện lái xe riêng (kể cả họp tại trụ sở); lịch PCT vốn không cần duyệt
- VehicleBoard: lãnh đạo có xe riêng -> chuyến KHÔNG vào "Chuyến cần xe"; dòng xe riêng
  hiển thị cả chuyến mặc định "(xe riêng mặc định)" không có nút bỏ gán;
  usesVehicle/findConflicts tính cả chuyến mặc định khi cảnh báo trùng giờ

## 2026-06-12 — Xử lý nhanh trong hộp chi tiết lịch
- EntryDetail thêm khu "Xử lý nhanh": Phê duyệt / Từ chối (canReview + status cho_duyet)
  và chọn xe tại chỗ (canAssignVehicle, gợi ý xe riêng đầu, cảnh báo trùng giờ, bỏ gán)
- Sau thao tác: refresh + đóng modal; App truyền profile + onChanged vào EntryDetail

## 2026-06-12 — Họp tại cơ quan không cần điều xe
- isHqLocation (constants): địa điểm 'Trụ sở Đoàn ĐBQH và HĐND tỉnh' -> bỏ khỏi
  panel "Chuyến cần xe" (VehicleBoard) và không tự hiện lái xe riêng
  (WeekView/DayView/EntryDetail/WeekPrintSheet); xe gán tay vẫn hiển thị

## 2026-06-12 — Bản in lịch tuần kiểu CÔNG VĂN (A4 dọc)
- WeekPrintSheet.jsx: bản in riêng chỉ hiện khi in (hidden print:block) — bảng theo ngày:
  Ngày | Thời gian | Nội dung | Địa điểm | Đơn vị/Lãnh đạo | Thành phần | Lái xe;
  gộp mục giống nhau; mục chờ duyệt chú thích "(chờ duyệt)"; bỏ mục từ chối
- lib/print.js: printPage(orientation) chèn @page tạm — lịch tuần in DỌC, điều xe in NGANG
- Màn hình giữ nguyên (print:hidden khi in); thead lặp lại mỗi trang

## 2026-06-12 — Chế độ Gọn gộp mục trùng + in A4 ngang chuẩn
- WeekView Gọn: mergeEntries gộp mục cùng nội dung+buổi/giờ+địa điểm thành 1 thẻ
  (lãnh đạo và thành phần nối '; '); Sửa/Xóa/Chi tiết thao tác trên mục gốc đầu tiên
- Print CSS: bảng width 100% table-layout fixed font 9.5px vừa A4 ngang; thead lặp lại
  khi sang trang (table-header-group); không cắt đôi hàng; bỏ line-clamp; đen trắng toàn bộ

## 2026-06-12 — Trùng địa điểm quét CẢ NĂM + chi tiết ngày; mở quyền xem
- App nạp entries cả năm (anchor year); dupMap: id -> [{date, name}] các mục trùng
- Hiển thị rõ "TRÙNG ĐỊA ĐIỂM với: 15/06 (Ban X); ..." ở ô lịch / chi tiết / Chờ duyệt
- canSeeEntry: mọi vai trò (kể cả nguoi_xem) thấy cả lịch chưa duyệt

## 2026-06-12 — Cảnh báo trùng địa điểm trong tuần (màu tím)
- >= 2 lịch của các Ban cùng tuần + cùng địa điểm (chuẩn hóa chữ thường, bỏ địa điểm
  trong COMMON_LOCATIONS) -> dupLocIds (App.jsx) -> tô tím nổi bật: viền+nền+huy hiệu
  trên EntryCard, ghi chú trong EntryDetail, chip + viền trái tím ở ApprovalQueue
- Mục đích: người duyệt thấy ngay để gộp đoàn / điều phối chung xe

## 2026-06-12 — Nhân bản lịch + 5 tài khoản nội bộ tự động
- Nút Nhân bản (Copy) trên ô lịch + modal chi tiết: mở form điền sẵn, lưu thành mục MỚI
- supabase/migrations/2026-06-12-tao-tai-khoan.sql: 5 user (hainq/lamlt/thttdn/hctcqt/ban
  @thanhhoa.gov.vn, mật khẩu 1-5, pw_set=true, role gán sẵn; "ban" theo dõi cả 4 Ban)
- Workflow chạy thêm supabase/migrations/*.sql (idempotent) + đếm tài khoản trong notice

## 2026-06-12 — Ô lịch đủ 6 mục + lái xe riêng tự động
- EntryCard (cả Đầy đủ và Gọn): Nội dung, Lãnh đạo, Thời gian, Địa điểm, TP, Lái xe (thiếu -> "—")
- Lịch PCT / Phó Trưởng Đoàn chưa gán xe -> tự hiện lái xe + biển số xe riêng của đồng chí đó
  (dedicatedByLeader: vehicle_type='rieng' + assigned_leader_id)
- AdminVehicles: gắn xe riêng được cho cả leader_type 'doan'; EntryDetail luôn có dòng Lái xe

## 2026-06-12 — ĐÃ XÁC MINH chạy thật: workflow CSDL xanh
- Secret SUPABASE_DB_URL = Session pooler URI vùng aws-1-ap-northeast-2 (Seoul), @ trong mật khẩu -> %40
- Workflow tự cắt khoảng trắng thừa khi dán secret; lỗi báo ra annotations (che mật khẩu)
- Run cuối: success; 6 bảng xác nhận: bans, leaders, profiles, vehicles, schedule_entries, participant_groups

## 2026-06-12 — Tự động cập nhật cấu trúc CSDL qua GitHub Actions
- .github/workflows/db-migrate.yml: push thay đổi supabase/schema.sql -> tự chạy
  psql schema.sql vào Supabase (cần secret SUPABASE_DB_URL, Session pooler URI)
- Chỉ chạy schema.sql idempotent; seed.sql không bao giờ chạy tự động

## 2026-06-12 — Chọn lãnh đạo theo cột + Sao lưu/Phục hồi
- Bấm "+" ở ô của cột nào -> form chỉ hiện nhóm lãnh đạo cột đó (prefill.leaderIds)
- Tab Quản trị "Sao lưu": tải toàn bộ dữ liệu ra .json; Phục hồi từ file (xóa + nạp lại,
  giữ id; profiles chỉ cập nhật theo email tồn tại, tham chiếu mồ côi được null hóa)

## 2026-06-12 — SỰ CỐ + chốt an toàn seed.sql
- Người dùng chạy lại seed.sql theo hướng dẫn cũ -> mất dữ liệu đã sửa trên web
- Khắc phục: seed.sql tự DỪNG (raise exception) nếu bảng leaders đã có dữ liệu;
  khối DELETE chuyển thành comment, chỉ bỏ comment khi cố ý reset
- QUY TẮC từ nay: nâng cấp cấu trúc -> chỉ đưa schema.sql (idempotent) hoặc
  snippet migration nhỏ; TUYỆT ĐỐI không bảo người dùng chạy lại seed.sql

## 2026-06-12 — Hiển thị đủ 4 mục + modal chi tiết + nhóm thành phần
- EntryCard luôn hiện đủ: Nội dung, Thời gian, Địa điểm, TP (— nếu trống); bấm vào ô → EntryDetail
- EntryDetail: hiện đầy đủ không cắt chữ; GỘP thành phần của các mục trùng nội dung+ngày+giờ
- ScheduleForm: Địa điểm + Thành phần thành bắt buộc; ô tick "nhóm thành phần" chèn nhanh
- Bảng mới participant_groups (schema + seed 5 nhóm mẫu) + tab Quản trị "Nhóm thành phần"

## 2026-06-12 — Tài khoản khách (chỉ xem) trên trang đăng nhập
- Ô vàng + nút "Vào xem ngay": user@thanhhoa.gov.vn / password (pattern HDNDKPI)
- Là tài khoản Supabase THẬT (role nguoi_xem) vì RLS yêu cầu đăng nhập — tạo 1 lần
  trong Dashboard -> Authentication -> Add user (Auto Confirm); xem README mục 3b
- Khách bỏ qua màn bắt tạo mật khẩu (isGuestEmail) và không có nút đổi mật khẩu

## 2026-06-12 — Thêm cột Đoàn ĐBQH tỉnh + dữ liệu lịch thật tuần 24
- leader_type mới 'doan': đ/c Lương Thị Hoa (TUV, Phó Trưởng Đoàn), đ/c Bùi Văn Dũng (ĐBQH chuyên trách)
- cb_tonghop nhập được lịch pct + doan (auto da_duyet); cảnh báo trùng + điều xe áp dụng cả doan
- schema.sql có ALTER idempotent mở rộng check constraint — chạy lại được trên DB cũ
- seed.sql: thay dữ liệu mẫu bằng lịch tuần 24/2026 (08-14/6) theo văn bản thật; bật cột Lãnh đạo Văn phòng (trực T7/CN)

## 2026-06-11 — Chuyển lịch tuần sang cột ĐƠN VỊ (yêu cầu người dùng)
- 5 cột: "Lãnh đạo HĐND tỉnh" (gộp 2 PCT) + 4 Ban; tên người ghi trong Nội dung
- seed: PCT đích danh (đ/c Lê Tiến Lam — UV BTV, PCT TT; đ/c Nguyễn Quang Hải — TUV, PCT);
  12 thành viên Ban gộp thành 4 dòng đơn vị Ban; bỏ nhãn "Thường trực HĐND tỉnh"
- Nhập lịch vẫn chọn đích danh PCT/Ban (giữ gợi ý xe riêng); cảnh báo trùng buổi chỉ cho PCT

## 2026-06-11 — Khởi tạo toàn bộ ứng dụng (v1)
- Scaffold Vite + React + Tailwind theo pattern HDNDKPI; auth magic link → mật khẩu
- schema.sql + seed.sql (4 Ban, 17 lãnh đạo, 4 xe, lịch mẫu tuần hiện tại)
- WeekView (bảng chính quyền Sáng/Chiều, chế độ Gọn mobile), MonthView, DayView
- ScheduleForm multi-leader + cảnh báo trùng; ApprovalQueue (duyệt/điều chỉnh/từ chối + duyệt cả tuần)
- VehicleBoard + cảnh báo trùng xe; Admin (tài khoản/lãnh đạo/xe); print CSS A4 ngang
- Build + lint xanh. CHƯA: tạo project Supabase thật, deploy Vercel, exporters Word/Excel (G6)
