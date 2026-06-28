# Kiến trúc & nơi sửa

Một trang (SPA), tabs bằng state trong `src/App.jsx` (không react-router).

## src/lib/
- `supabase.js` — createClient từ env (null nếu chưa cấu hình)
- `auth.js` — getSession/onAuthChange/signInWithOtp/signInWithPassword/setPassword(pw_set)/getMyProfile
- `api.js` — toàn bộ CRUD (entries, leaders, vehicles, profiles); mọi hàm trả `{data, error}`
- `permissions.js` — ma trận quyền: canCreateFor / canEditEntry / canReview / canAssignVehicle / canSeeEntry / initialStatus
- `dates.js` — "tuần công tác" = Thứ Bảy → Chủ nhật tuần sau (9 ngày: cuối tuần trước + T2–T6 +
  cuối tuần sau); ngày cuối tuần (T7/CN) tính thuộc tuần làm việc KẾ TIẾP (workWeekMonday). weekStart/
  weekEnd/weekDays(9)/weekLabel theo cửa sổ này; monthGrid vẫn tuần ISO T2–CN. `sessionsOverlap` (trùng buổi/giờ)
- `constants.js` — BOOTSTRAP_ADMIN_EMAILS, ROLES, STATUS (màu), SESSIONS, VEHICLE_TYPES
- `exporters.js` — `exportWeekDocx` xuất .docx (NẠP ĐỘNG docx + file-saver); bảng công văn
  A4 dọc như WeekPrintSheet; thêm "Đồng chí" trước tên cán bộ (withComrade), in đậm "(chờ
  duyệt)". `buildWeekPdfDocDefinition` (hàm thuần) + `exportWeekPdf` xuất .pdf MỘT CÚ BẤM
  bằng pdfmake (NẠP ĐỘNG pdfmake + vfs_fonts; Roboto kèm theo đủ glyph tiếng Việt; chuẩn
  hóa NFC). WeekView: "Xuất PDF" cho MỌI tài khoản; "Xuất Word" chỉ với email trong
  constants.DOCX_EXPORT_EMAILS (canExportDocx). Test: scripts/test-pdf.mjs (npm run test:pdf).

## src/components/
- `WeekView.jsx` — màn chính: bảng ngày×(Sáng/Chiều)×cột lãnh đạo; chế độ Đầy đủ/Gọn; nút In
- `MonthView.jsx` / `DayView.jsx` — lưới tháng (click ngày → DayView), ngày chia 2 khối Sáng/Chiều
- `ScheduleForm.jsx` — modal thêm/sửa; multi-leader (1 dòng/người, chung group_id); cảnh báo mềm trùng lịch
- `ApprovalQueue.jsx` — hàng chờ PCT: Duyệt / Điều chỉnh (form inline + ghi chú bắt buộc) / Từ chối; "Duyệt cả tuần"
- `VehicleBoard.jsx` — bảng xe×tuần + panel "Chuyến cần xe"; cảnh báo trùng xe (confirm) qua `findConflicts`
- `AdminUsers/AdminLeaders/AdminVehicles.jsx` — tab Quản trị. AdminUsers: TẠO tài khoản (form
  + tick vai trò/Ban) gọi `api/admin-create-user.js` (Vercel Serverless, service_role) +
  phân quyền tài khoản đã có. Cần env `SUPABASE_SERVICE_ROLE_KEY` trên Vercel.
- `FilterBar.jsx` — điều hướng tuần/tháng/ngày + lọc Ban/lãnh đạo/trạng thái
- `EntryCard.jsx` / `StatusBadge.jsx` — ô lịch + huy hiệu trạng thái dùng chung

## Nạp dữ liệu (App.jsx)
- Khoảng fetch = lưới tháng chứa `anchor` (luôn phủ tuần/ngày đang xem); refetch sau mỗi mutation (không realtime)
- Badge "Chờ duyệt" đếm entries `cho_duyet` trong khoảng đã nạp

## In ấn
- `@media print` trong `src/index.css`: A4 ngang, Times New Roman, đen trắng
- Vùng in: phần tử `.print-root`; tiêu đề `.print-header` chỉ hiện khi in; `.no-print` ẩn khi in
