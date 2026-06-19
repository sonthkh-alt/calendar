# Nhật ký dự án

## 2026-06-19 — Lịch ngày sắp xếp theo ưu tiên lãnh đạo (giống Lịch tuần)
- DayView: dùng makeEntrySorter(leaders) thay vì chỉ sort theo start_time. Mỗi khối
  Sáng/Chiều: `mergeEntries([...list].sort(entrySorter))` -> trong buổi xếp theo STT
  lãnh đạo (PCT trước, rồi các Ban...). Đồng nhất với WeekView.

## 2026-06-19 — Tìm kiếm thành Ô GÕ TRỰC TIẾP cạnh "Tuần sau" (bỏ tab)
- Bỏ tab "Tìm kiếm"; thay bằng SearchBox.jsx — ô gõ trực tiếp đặt trong FilterBar ngay cạnh
  nút "Tuần sau" (placeholder mờ "Tìm kiếm", icon kính lúp, nút X xóa).
- Kết quả XỔ XUỐNG ngay dưới ô (dropdown absolute, backdrop đóng khi bấm ra ngoài); cùng
  logic tìm/sắp xếp như cũ (api.searchEntries; Hôm nay&Sắp tới tăng dần rồi Đã qua; gộp
  group_id). Bấm 1 kết quả -> onView mở EntryDetail + đóng dropdown.
- FilterBar nhận prop onView; App truyền onView={setViewing} (cả 2 chỗ FilterBar). Xóa
  SearchView.jsx + tab 'search' + import Search trong App.

## 2026-06-19 — Tab "Tìm kiếm" lịch toàn hệ thống
- Tab mới "Tìm kiếm" (icon Search) cho MỌI tài khoản. SearchView.jsx: ô search debounce
  300ms; khớp Nội dung/Địa điểm/Thành phần/Tên nhóm (DB ilike) + Tên lãnh đạo (suy leaderIds
  ở bộ nhớ rồi thêm leader_id.in). Tìm TOÀN BỘ (mọi năm, mọi trạng thái).
- api.searchEntries(term, leaderIds): .or(content/location/participants/group_label ilike
  + leader_id.in); làm sạch ký tự phá .or() (, ( ) % *); limit 500.
- Gộp theo group_id -> 1 kết quả/sự kiện. Sắp xếp: HÔM NAY & SẮP TỚI (tăng dần) trước,
  rồi ĐÃ QUA (gần nhất trước) — 2 mục riêng. Bấm 1 kết quả -> mở EntryDetail (onView).
- App: tab 'search' (sau Lịch ngày), không hiện FilterBar; render SearchView leaders+onView.

## 2026-06-19 — Nút "Hôm nay" cuộn tới đúng vị trí hôm nay (lịch tuần)
- App: goToday() = setAnchor(now) + bump todayTick; truyền onToday vào FilterBar (cả 2 chỗ),
  todayTick vào WeekView.
- FilterBar: nút "Hôm nay" gọi onToday nếu có (fallback onAnchor(new Date())).
- WeekView: todayRef gắn vào ô hôm nay (chế độ Đầy đủ: <tr> dòng Sáng si===0) và khối hôm
  nay (chế độ Gọn: <div>); effect theo todayTick -> setTimeout 80ms -> scrollIntoView
  {behavior:'smooth', block:'center'} (chờ view cập nhật tuần mới trước khi cuộn).
- Month/Day không cần cuộn (anchor=hôm nay đã hiển thị đúng).

## 2026-06-16 — Đếm lượt truy cập (góc dưới phải) + thống kê khách trong Quản trị
- Ghi login_log cho MỌI tài khoản kể cả KHÁCH (trước bỏ qua khách) -> dùng làm nguồn đếm.
  App: effect ghi 1 dòng/phiên (sessionStorage chống trùng) rồi nạp fetchLoginCount() ->
  visitCount; badge "N lượt truy cập" cố định góc dưới phải (no-print, ai cũng thấy, kể cả khách).
- api: fetchLoginCount(email?) đếm head exact (email=null -> tổng; =GUEST.email -> lượt khách);
  fetchLoginLog(limit, excludeEmail?) loại 1 email khỏi danh sách.
- AdminLoginLog: 3 thẻ thống kê (Tổng lượt / Khách chỉ xem / Tài khoản thật = tổng - khách);
  bảng đăng nhập loại tài khoản khách (fetchLoginLog 300, exclude GUEST.email) cho gọn.
- KHÔNG cần migration mới (dùng lại bảng login_log; khách có auth.uid() nên ghi được).

## 2026-06-16 — Bộ lọc đơn vị thêm "Trưởng các Ban HĐND tỉnh"
- Thêm 1 lựa chọn trong dropdown "Tất cả đơn vị": lọc riêng lịch của các đ/c Trưởng Ban.
- Nguồn thành viên = nhóm thành phần cùng tên "Trưởng các Ban HĐND tỉnh" (groupLeaderIds)
  -> admin tự quản lý danh sách qua tab Nhóm thành phần. Chỉ hiện tùy chọn khi nhóm có TV.
- constants: TRUONG_BAN_GROUP_NAME, TRUONG_BAN_FILTER_KEY ('grp:truong_ban'),
  truongBanLeaderIds(groups,leaders); leaderInUnit/leaderInUnits nhận thêm ctx
  {truongBanIds} -> khóa 'grp:truong_ban' khớp leader.id thuộc tập đó.
- App: truongBanIds = useMemo(truongBanLeaderIds(pGroups, leaders)); truyền xuống
  FilterBar (cả 2 chỗ) + WeekView/MonthView/DayView.
- FilterBar: thêm tùy chọn (sau 4 Ban, trước Văn phòng); leaderInUnits truyền unitCtx.
- WeekView.units: wantTruongBan -> hiện các cột Ban nhưng chỉ giữ lãnh đạo là Trưởng Ban
  (Ban được chọn riêng vẫn hiện đầy đủ). Month/Day lọc qua leaderInUnits + ctx.

## 2026-06-16 — Bấm thông báo xem chi tiết lịch + Nhật ký ĐĂNG NHẬP (Quản trị)
- **#1 Bấm thông báo -> chi tiết lịch:** NotificationBell mỗi mục thành nút bấm (trừ mục
  'delete' — lịch đã xóa, vô hiệu). Bấm -> onSelect(a) + đóng panel. App.onOpenActivity
  tra entry theo entry_id (dự phòng group_id) trong entries -> setViewing (mở EntryDetail);
  không tìm thấy (đã xóa / ngoài phạm vi) -> alert nhẹ. Truyền onSelect vào NotificationBell.
- **#2 Nhật ký đăng nhập:** bảng login_log mới + tab Quản trị "Đăng nhập".
  - supabase/migrations/2026-06-16-login-log.sql: bảng login_log (at, user_id, email,
    full_name, role); RLS đọc=authenticated, ghi (insert) chốt auth.uid()=user_id;
    grant select,insert. Idempotent (chạy lại mỗi deploy).
  - api.js: recordLogin({user_id,email,full_name,role}) + fetchLoginLog(limit).
  - App.jsx: effect ghi 1 dòng/phiên (bỏ qua tài khoản khách), chống trùng bằng
    sessionStorage key login_logged_<uid> (đóng/mở lại tab = phiên mới = lần đăng nhập mới).
  - src/components/AdminLoginLog.jsx: bảng 300 lần đăng nhập gần nhất (thời gian / họ tên /
    email / vai trò). Thêm tab admin 'logins' (icon LogIn) trong App.

## 2026-06-16 — Vào thẳng trang chủ (chế độ KHÁCH), đăng nhập qua nút góc phải
- Yêu cầu: không bắt đăng nhập trước; mặc định vào trang chủ CHỈ XEM; cần đăng nhập thì
  bấm nút ở góc trên bên phải.
- App.jsx: boot — chưa có phiên -> TỰ signInWithPassword(GUEST) để vào thẳng trang chủ;
  nếu lỗi (chưa tạo tài khoản khách) -> session null -> hiện màn Login đầy đủ (dự phòng).
  - state showLogin (modal); header: nếu isGuestEmail -> nút "Đăng nhập" (LogIn) góc phải
    mở modal; nếu tài khoản thật -> giữ thông tin user + đổi mật khẩu + đăng xuất.
  - handleSignOut: đăng xuất tài khoản thật -> tự đăng nhập KHÁCH lại (quay về trang chủ
    chỉ xem, không rơi về màn login). Effect: đăng nhập thật thành công -> đóng modal.
- Login.jsx: prop onClose -> chế độ MODAL (fixed inset-0 z-[60] + nút X đóng); email/mật
  khẩu mặc định rỗng (thay vì điền sẵn khách); ẩn ô "Tài khoản khách" trong modal. Không
  có onClose -> màn đăng nhập đầy đủ như cũ.

## 2026-06-16 — Chuông THÔNG BÁO cho người duyệt + thu gọn chọn Lãnh đạo
- **#1 Thông báo:** chuông trên header (chỉ người duyệt: pct/quan_tri/pho_truong_doan).
  Nguồn = bảng activity_log có sẵn (trigger ghi mọi tạo/duyệt/sửa/điều xe/xóa).
  - src/lib/notifications.js: mốc "đã xem" lưu localStorage theo user (getNotifSeen/
    setNotifSeen); requestNotifyPermission + showOsNotification (ưu tiên SW
    registration.showNotification -> hiện cả khi tab nền; fallback new Notification).
  - src/components/NotificationBell.jsx: huy hiệu đếm mục có at > mốc đã xem; bấm chuông
    -> đặt mốc = now -> huy hiệu biến mất. Panel liệt kê 50 mục gần nhất (badge "mới").
    Nút "Bật thông báo trên thiết bị" khi chưa cấp quyền. Mục mới đến (qua realtime) ->
    bắn OS notification (gom nhiều mục thành 1).
  - App.jsx: state activity + loadActivity(80) (chỉ nạp khi canReview); realtime
    bumpEntries nạp lại cả activity; relevantActivity lọc bỏ thao tác của chính mình,
    pho_truong_doan chỉ nhận lịch Đoàn (tra leader_type qua entry/group). Đặt chuông
    sau DeviceSelect (hiện cả PC lẫn mobile).
  - public/sw.js: + notificationclick (focus/mở app); CACHE v5 -> v6.
  - GIỚI HẠN: OS notification chỉ chạy khi TRÌNH DUYỆT CÒN MỞ (kể cả tab nền). Thông báo
    khi đã ĐÓNG HẲN trình duyệt cần Web Push + máy chủ đẩy (VAPID) — chưa triển khai.
- **#2 Thu gọn chọn Lãnh đạo:** ScheduleForm — "Chọn nhanh theo nhóm" và danh sách
  "Lãnh đạo" thành 2 khối THU GỌN (mặc định đóng), bấm mũi tên (ChevronDown) để mở danh
  sách tick. Header hiện tóm tắt đã chọn (số lượng + vài tên đầu). Lưu khi chưa chọn
  lãnh đạo -> tự mở danh sách. groupOpen/leaderOpen state.

## 2026-06-15 — Icon PWA cho iOS (cài "Thêm vào màn hình chính" hiển thị quốc huy)
- iOS KHÔNG render SVG cho apple-touch-icon -> trước đây icon trên màn hình chính bị
  trắng/ảnh chụp trang. Bổ sung icon PNG nền trắng đục (chuẩn Apple).
- public/: thêm apple-touch-icon.png (180), icon-192.png, icon-512.png — rasterize từ
  quoc-huy.svg bằng Chrome headless (nền #fff, căn giữa, padding ~8%)
- index.html: apple-touch-icon -> /apple-touch-icon.png (sizes 180x180)
- manifest.webmanifest: icons thêm 192/512 PNG (purpose any) + 512 maskable; giữ SVG cuối
- sw.js: CACHE 'lichcongtac-v1' -> 'v2' (dọn cache cũ, lấy manifest mới) + thêm 3 PNG vào APP_SHELL
- Cài trên iPhone/iPad: mở Safari -> Chia sẻ -> "Thêm vào Màn hình chính" (PWA, không cần App Store)
- LƯU Ý: chưa chạy npm build (máy hiện tại chưa cài Node); thay đổi chỉ là asset tĩnh +
  HTML/JSON, không đụng JS bundle. JSON manifest đã validate hợp lệ

## 2026-06-15 — Ghi chú Demo + liên hệ ở chân trang & màn hình Login
- constants: DEMO_NOTICE ("Đây là bản Demo thử nghiệm") + CONTACT_INFO
  ("Chi tiết xin liên hệ Hà Ngọc Sơn, PCVP Đoàn ĐBQH và HĐND tỉnh")
- App footer: thêm dòng Demo (đậm amber) + liên hệ + © đơn vị
- Login: thay dòng liên hệ cũ bằng CONTACT_INFO + thêm dòng Demo

## 2026-06-15 — Sắp xếp: LUÔN theo STT lãnh đạo cao nhất (bỏ thang STT nhóm)
- Lỗi: makeEntrySorter.prio dùng STT NHÓM khi group_label khớp 1 nhóm đơn lẻ, nhưng dùng
  STT lãnh đạo khi group_label gộp NHIỀU nhóm (vd "Hội nghị giao ban" = Thường trực + các
  Ban + Văn phòng) -> 2 thang đo lệch nhau -> "Làm việc tại cơ quan" (Đoàn) xếp TRƯỚC sự
  kiện có Thường trực HĐND tỉnh
- Sửa: bỏ hẳn nhánh groupSort; comparator chỉ dùng leaderPrio (STT nhỏ nhất trong _leaderIds
  với mục đã gộp, hoặc STT lãnh đạo của mục lẻ). makeEntrySorter(leaders) — bỏ tham số groups
  (caller truyền dư vô hại). test:pdf 12/12 đạt

## 2026-06-15 — Người tạo lịch sửa được lịch ĐÃ DUYỆT (nêu lý do -> chờ duyệt lại)
- permissions.canEditEntry: người có canCreateFor sửa được MỌI LÚC (kể cả da_duyet/da_dieu_chinh)
- schema: + cột schedule_entries.edit_note (lý do chỉnh sửa) — ALTER idempotent
- ScheduleForm: isReEdit = sửa (editing) lịch da_duyet/da_dieu_chinh bởi người KHÔNG phải
  người duyệt & KHÔNG at_office -> hiện ô "Lý do chỉnh sửa" (bắt buộc); statusFor -> cho_duyet;
  patch lưu edit_note + xóa review_note/reviewed_by/reviewed_at (chờ duyệt lại)
- EntryDetail: hiện "Lý do chỉnh sửa (chờ duyệt lại)" khi status cho_duyet; ApprovalQueue:
  hiện badge "Lý do chỉnh sửa" trên mục chờ để người duyệt nắm
- Người duyệt vẫn dùng "Điều chỉnh" (isAdjust) như cũ; nút Sửa vẫn ẩn với người duyệt mục đó

## 2026-06-15 — ScheduleForm: "Chọn nhanh theo nhóm" cho phép chọn NHIỀU nhóm
- Trước: groupLabel giữ 1 tên nhóm -> chọn nhóm mới bỏ nhóm cũ
- Nay: groupLabel = các tên nhóm nối "; "; isGroupSelected(g) = tên g có trong groupLabel
- toggleLeaderGroup: chọn -> hợp leaderIds + thêm members + nối tên; BỎ chọn -> chỉ gỡ
  lãnh đạo KHÔNG thuộc nhóm khác còn chọn (keepIds), gỡ members + tên nhóm khỏi nhãn
- Lưu group_label = nhãn gộp -> EntryCard/PDF/Word hiển thị đúng các nhóm đã chọn

## 2026-06-15 — Lọc "đơn vị" CHỌN NHIỀU cùng lúc (vd TTr HĐND + Đoàn ĐBQH)
- filters.banId (chọn 1) -> filters.banIds (MẢNG khóa: 'grp:pct'|'grp:doan'|'grp:vanphong'|UUID Ban)
- constants.leaderInUnits(leader, unitKeys): rỗng -> mọi đơn vị; ngược lại khớp BẤT KỲ khóa nào
- FilterBar: nút dropdown + danh sách CHECKBOX đơn vị (badge đếm số đã chọn, "Bỏ chọn tất cả");
  đổi chọn -> reset leaderId. visibleLeaders lọc theo leaderInUnits
- WeekView.units: wantGroup/ban lọc theo banIds (mảng); MonthView/DayView dùng leaderInUnits
- App: filters mặc định { banIds: [], leaderId, status }; "Xóa lọc" -> banIds: []

## 2026-06-15 — Sắp lịch theo ƯU TIÊN lãnh đạo cao nhất của sự kiện (PDF/Word/In)
- Lỗi: mục đã GỘP (PDF/Word/bản in gộp trước rồi sắp) dùng STT của lãnh đạo DÒNG ĐẦU
  (theo thứ tự DB) -> sự kiện có đ/c Lê Tiến Lam (STT1) bị xếp sau "Cả ngày" của Ban
- Sửa constants.makeEntrySorter: thêm leaderPrio(e) — mục có _leaderIds (đã gộp) lấy
  STT NHỎ NHẤT trong các thành viên; prio + tie-break dùng leaderPrio. Áp dụng cho mọi
  nơi sắp qua makeEntrySorter trên mục đã gộp (exporters PDF + Word, WeekPrintSheet)
- WeekView (sắp entry THÔ rồi mới gộp) không có _leaderIds -> giữ nguyên, vẫn đúng
- test-pdf.mjs: thêm ca "Hội nghị BCH" (nhóm có Lam, dòng đầu là Long STT8) phải xếp
  TRƯỚC "Dự Đại hội" Cả ngày của Hảo (STT6) — 12/12 đạt

## 2026-06-15 — Tô nền thẻ theo đơn vị: TTr HĐND tỉnh XANH (cả Đầy đủ + Gọn)
- EntryCard.unitAccent: pct = border-emerald-400 bg-emerald-100 (XANH, đậm hơn chút so
  với Ban/đơn vị khác); doan = border-yellow-300 bg-yellow-100 (vàng nhạt); khác giữ theo trạng thái
- WeekView: truyền unitTint=true cho CẢ chế độ Đầy đủ lẫn Gọn (renderMergedCard m,_,true)
- (Trước đó pct dùng đỏ + chỉ áp dụng Gọn -> nay đổi xanh + áp dụng cả hai chế độ)
- Thẻ từ chối / cảnh báo trùng vẫn ưu tiên kiểu riêng; StatusBadge giữ thông tin trạng thái

## 2026-06-15 — Sửa lỗi PDF "Cannot read properties of undefined (reading 'pdfMake')"
- Nguyên nhân: import 'pdfmake/build/vfs_fonts' — file đó chạy `this.pdfMake = ...`; Vite/
  Rollup đóng gói ESM strict -> `this` = undefined -> vỡ NGAY khi nạp (trên Vercel). Bản
  thân 'pdfmake/build/pdfmake' nạp OK (lỗi rơi đúng ở bước vfs_fonts kế tiếp)
- Sửa: TỰ NHÚNG phông -> src/lib/pdfFonts.js (ROBOTO_VFS + ROBOTO_FONTS, ~766KB base64,
  sinh từ vfs_fonts). exportWeekPdf nạp động './pdfFonts.js' (chunk lazy riêng), gán
  pdfMake.vfs + pdfMake.fonts; KHÔNG còn import vfs_fonts của pdfmake
- test-pdf.mjs: lấy phông từ chính pdfFonts.js (đúng dữ liệu trình duyệt dùng) -> 11/11 đạt

## 2026-06-15 — Xuất PDF MỘT CÚ BẤM bằng pdfmake (tải file trực tiếp)
- BỎ cách "mở hộp In"; dùng pdfmake dựng PDF trực tiếp từ dữ liệu -> tải ngay file .pdf
- Phông Roboto kèm pdfmake: ĐÃ KIỂM CHỨNG đủ glyph tiếng Việt (parser cmap: đ/ệ/ử/ố/ậ/
  ằ/ợ/Đ/ỹ đều map gid≠0). Văn bản chuẩn hóa NFC để khớp glyph dựng sẵn
- exporters.buildWeekPdfDocDefinition (HÀM THUẦN, test được) dựng bảng công văn A4 dọc:
  Ngày(rowSpan) | Thời gian | Nội dung | Địa điểm | Thành phần; "(chờ duyệt)" IN ĐẬM
  (rich text), at_office in đậm, Thành phần thêm "Đồng chí" + sắp ưu tiên Họ tên (như Word)
- exporters.exportWeekPdf: nạp động pdfmake + vfs_fonts -> createPdf().download()
- WeekView: nút "Xuất PDF" gọi exportWeekPdf (state exportingPdf); gỡ printForPdf
- KIỂM CHỨNG: scripts/test-pdf.mjs (esbuild bundle exporters -> PdfPrinter render ->
  pdf-parse trích xuất) — 11/11 đạt: PDF hợp lệ, tiếng Việt round-trip, (chờ duyệt),
  Làm việc tại cơ quan, "Đồng chí", thứ tự ưu tiên Lam<Long, NFC sạch. npm run test:pdf
- devDeps: pdf-parse + esbuild (chỉ phục vụ test)

## 2026-06-15 — Xuất PDF: BỎ html2canvas, dùng hộp In của trình duyệt
- html2pdf/html2canvas vẫn ra trang TRẮNG (nhiều khả năng không phân tích được toàn bộ
  CSS Tailwind của trang) -> BỎ hẳn html2pdf.js (gỡ dependency + exportWeekPdf)
- print.printForPdf(filename, orientation): đặt document.title = tên file rồi window.print()
  -> người dùng chọn đích "Lưu thành PDF / Save as PDF"; bản công văn @media print vốn đã
  render chuẩn, tiếng Việt đẹp; khôi phục title sau afterprint
- WeekView.onExportPdf: gọi printForPdf('Lich-cong-tac-tuan-<tuần>-<năm>'); gỡ state exportingPdf

## 2026-06-15 — Xuất PDF (mặc định) + Word (riêng 2 tài khoản)
- exporters.exportWeekPdf: nạp động html2pdf.js, nhân bản #week-print-root (bản in
  WeekPrintSheet, đang display:none) ra ngoài màn hình -> render A4 dọc -> tải .pdf;
  PDF khớp HỆT bản in, tiếng Việt chuẩn (html2canvas render bằng font trình duyệt)
- WeekPrintSheet: thêm id="week-print-root" để exporter dùng lại
- constants.DOCX_EXPORT_EMAILS = [thttdn@thanhhoa.gov.vn, sonthkh@gmail.com] + canExportDocx
- WeekView: nút "Xuất PDF" (đỏ) cho MỌI tài khoản; nút "Xuất Word" (xanh) CHỈ hiện với
  2 email trên. Cài thêm dependency html2pdf.js@0.10.1 (lazy, không phình bundle chính)

## 2026-06-14 — Mặc định lịch tuần ở chế độ "Gọn"
- WeekView: mode mặc định 'compact' (trước 'full' trên máy tính) -> truy cập trang
  thấy ngay bản Gọn; vẫn bấm "Đầy đủ" để đổi

## 2026-06-14 — Ẩn nút "Sửa" với người phê duyệt (đã có "Điều chỉnh")
- EntryDetail: nút "Sửa" chỉ hiện khi canEdit && KHÔNG phải người duyệt mục đó
  (isReviewerOfEntry = canReviewEntry). pct/quan_tri ẩn Sửa mọi lịch; pho_truong_doan
  ẩn Sửa với lịch Đoàn -> họ dùng "Điều chỉnh". "Xóa"/"Nhân bản" giữ nguyên
- cb_ban/cb_tonghop (không phải người duyệt) vẫn có nút "Sửa" bình thường

## 2026-06-14 — Điều chỉnh = mở form đầy đủ như Sửa (chế độ điều chỉnh)
- Trước: "Điều chỉnh" là form inline rút gọn (chỉ Nội dung/Ngày/Buổi/Địa điểm + chọn TV)
- Nay: bấm "Điều chỉnh" mở ScheduleForm ĐẦY ĐỦ như "Sửa" (đủ Lãnh đạo/Thời gian/Nội dung/
  Địa điểm/Thành phần/at_office), thêm ô "Ghi chú điều chỉnh" BẮT BUỘC; lưu -> trạng thái
  'da_dieu_chinh' + review_note/reviewed_by/reviewed_at cho mọi mục của sự kiện (nút xanh dương)
- ScheduleForm: prop `adjusting`; isAdjust dùng chung luồng edit (edit = editing||adjusting),
  statusFor -> da_dieu_chinh, reviewPatch ghi vào cả updateEntry lẫn createEntries (TV mới)
- App: state adjusting + onAdjust; truyền vào ScheduleForm + EntryDetail
- EntryDetail: gỡ form điều chỉnh inline (adjContent/adjDate/adjSession/adjLocation/doAdjust);
  nút "Điều chỉnh" -> onClose()+onAdjust(entry); gỡ import DateField thừa. Từ chối GIỮ NGUYÊN
  (vẫn chọn từng thành viên inline)

## 2026-06-14 — Tài khoản Chủ tịch HĐND tỉnh + hiện "Người phê duyệt"
- Migration 2026-06-14-tai-khoan-chu-tich-hdnd.sql: phongnh@thanhhoa.gov.vn / Phongnh@123 —
  Nguyễn Hồng Phong, chức vụ "Chủ tịch HĐND tỉnh", vai trò 'pct' (duyệt/điều chỉnh/từ chối
  MỌI lịch, kể cả lịch đã duyệt). Theo pattern token='' tránh lỗi GoTrue; idempotent
- App: nạp profiles toàn cục (loadCatalogs += fetchProfiles) -> reviewerById; truyền
  reviewer={reviewerById[viewing.reviewed_by]} vào EntryDetail
- EntryDetail: thêm dòng "Người phê duyệt: <chức vụ> — <họ tên>" (hiện khi da_duyet/
  da_dieu_chinh/tu_choi) -> Chủ tịch duyệt thì hiện "Chủ tịch HĐND tỉnh — Nguyễn Hồng Phong"

## 2026-06-14 — Xuất Word: cột Thành phần sắp theo ƯU TIÊN HỌ VÀ TÊN
- exporters.compactParticipants: sắp các đoạn Thành phần theo sort_order lãnh đạo (chức vụ
  cao -> trước), áp dụng CẢ nhánh text thành phần lẫn nhánh dự phòng (tên lãnh đạo của mục);
  nhóm xếp theo STT nhỏ nhất của thành viên; đoạn không khớp lãnh đạo giữ thứ tự gốc, ra cuối
- Sửa lỗi: trước đây tên xếp theo thứ tự nhập (vd "Trần Mạnh Long; Lê Tiến Lam") -> nay
  "Lê Tiến Lam (PCT TT); Trần Mạnh Long" đúng ưu tiên. Kiểm chứng bằng node test 3 ca

## 2026-06-14 — Module XUẤT LỊCH TUẦN RA WORD (.docx)
- src/lib/exporters.js: exportWeekDocx({anchor,entries,leaders,groups}) — NẠP ĐỘNG docx +
  file-saver (dynamic import, không phình bundle chính); dựng bảng công văn A4 dọc giống
  WeekPrintSheet (Ngày | Thời gian | Nội dung | Địa điểm | Thành phần), gộp mục giống nhau,
  rowSpan ô Ngày, tên nhóm thay thành viên (compactParticipants dùng chung logic bản in)
- YÊU CẦU 1 — cột THÀNH PHẦN: thêm "Đồng chí" trước TÊN CÁN BỘ (withComrade): chuẩn hóa
  kính ngữ Đ/c|đc|Đồng chí -> "Đồng chí"; giữ Ông/Bà; tên người 2–5 từ viết hoa (không phải
  từ chỉ đơn vị: Ban/Văn phòng/Sở/UBND/Thường trực/Lãnh đạo/Đoàn... ORG_RE) -> thêm "Đồng chí"
- YÊU CẦU 2 — Nội dung lịch CHỜ DUYỆT: thêm chữ " (chờ duyệt)" IN ĐẬM (bold TextRun);
  da_dieu_chinh -> "(ghi chú)" in nghiêng
- WeekView: nút "Xuất Word" (xanh dương) cạnh nút In; xuất đúng các cột đang hiển thị
- Đã kiểm chứng API docx v9 (rowSpan/columnSpan/borders/allCaps/PageOrientation/Packer) dựng OK
- (Lưu ý: build local KHÔNG .env tree-shake hết nên chưa thấy chunk docx — Vercel build đủ)

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
