# Kiến trúc & nơi sửa

Một trang (SPA), tabs bằng state trong `src/App.jsx` (không react-router).

## src/lib/
- `supabase.js` — createClient từ env (null nếu chưa cấu hình)
- `auth.js` — getSession/onAuthChange/signInWithOtp/signInWithPassword/setPassword(pw_set)/getMyProfile
- `api.js` — toàn bộ CRUD (entries, leaders, vehicles, profiles); mọi hàm trả `{data, error}`.
  Kho tệp phiếu đã ký số: `uploadSignedSlip` / `getSignedSlipUrl` / `deleteSignedSlip`
  (Supabase Storage, bucket riêng tư `phieu-dieu-xe`)
- `permissions.js` — ma trận quyền: canCreateFor / canEditEntry / canReview / canAssignVehicle / canSeeEntry / initialStatus
- `dates.js` — "tuần công tác" = Thứ Bảy → Chủ nhật tuần sau (9 ngày: cuối tuần trước + T2–T6 +
  cuối tuần sau); ngày cuối tuần (T7/CN) tính thuộc tuần làm việc KẾ TIẾP (workWeekMonday). weekStart/
  weekEnd/weekDays(9)/weekLabel theo cửa sổ này; monthGrid vẫn tuần ISO T2–CN. `sessionsOverlap` (trùng buổi/giờ)
- `constants.js` — BOOTSTRAP_ADMIN_EMAILS, ROLES, STATUS (màu), SESSIONS, VEHICLE_TYPES,
  VEHICLE_STATUS (trạng thái phiếu điều xe), VEHICLE_SLIP (mẫu phiếu), DEFAULT_DEPARTURE,
  isPrivateVehicle / hasVehicleRequest
- `vehicleSlip.js` — `buildVehicleSlipHtml` (HÀM THUẦN, dựng "Phiếu đề nghị sử dụng xe ô tô
  công vụ" theo mẫu docs/Đề nghị sử dụng xe oto.docx: A4 dọc, Times New Roman, lề 1.5/2/1/3cm)
  + `printVehicleSlip` (mở cửa sổ in riêng) + `makeSignCode`. Test: scripts/test-vehicle-slip.mjs
  (npm run test:slip)
- `vehicleSlipPdf.js` — CÙNG phiếu nhưng dựng PDF THẬT bằng pdfmake (nạp động pdfmake + pdfFonts):
  `buildVehicleSlipDocDefinition` (hàm thuần), `downloadVehicleSlipPdf`, `getVehicleSlipPdfBlob`
  (dành cho tích hợp ký số trực tiếp sau này). Test: scripts/test-slip-pdf.mjs (npm run test:slip-pdf)
- `exporters.js` — `exportWeekDocx` xuất .docx (NẠP ĐỘNG docx + file-saver); bảng công văn
  A4 dọc như WeekPrintSheet; thêm "Đồng chí" trước tên cán bộ (withComrade), in đậm "(chờ
  duyệt)". `buildWeekPdfDocDefinition` (hàm thuần) + `exportWeekPdf` xuất .pdf MỘT CÚ BẤM
  bằng pdfmake (NẠP ĐỘNG pdfmake + vfs_fonts; Roboto kèm theo đủ glyph tiếng Việt; chuẩn
  hóa NFC). WeekView: "Xuất PDF" cho MỌI tài khoản; "Xuất Word" chỉ với email trong
  constants.DOCX_EXPORT_EMAILS (canExportDocx). Test: scripts/test-pdf.mjs (npm run test:pdf).

- `signAgent.js` — gọi TRỢ LÝ KÝ SỐ chạy trên máy có USB token (`http://127.0.0.1:7878`):
  `probeAgent` (dò nhanh 2,5s), `listAgentCerts`, `signPdfViaAgent` (chờ tối đa 4 phút vì phải nhập PIN).
  Đổi địa chỉ không cần build lại: `localStorage.kySoAgentUrl`.

## tools/ky-so-agent/  (chạy trên máy Lãnh đạo Văn phòng, KHÔNG deploy lên web)
- `agent.mjs` — HTTP cục bộ /health /certs /sign; CORS + Private Network Access; chỉ nghe 127.0.0.1
- `pdfsign.mjs` — @signpdf: chèn ô chữ ký + nhúng PKCS#7 vào PDF
- `winsign.mjs` + `winsign.ps1` — .NET SignedCms ký qua CSP/KSP SafeNet (hộp nhập PIN do SafeNet hiện)
- `test-local.mjs` — kiểm thử toàn bộ bằng chứng thư TỰ KÝ tạm, không cần token (`npm test`)
- README.md — hướng dẫn cài Node.js, chạy nền khi khởi động Windows, cấu hình allowOrigins

## src/components/
- `WeekView.jsx` — màn chính: bảng ngày×(Sáng/Chiều)×cột lãnh đạo; chế độ Đầy đủ/Gọn; nút In
- `MonthView.jsx` / `DayView.jsx` — lưới tháng (click ngày → DayView), ngày chia 2 khối Sáng/Chiều
- `ScheduleForm.jsx` — modal thêm/sửa; multi-leader (1 dòng/người, chung group_id); cảnh báo mềm trùng lịch
- `ApprovalQueue.jsx` — hàng chờ PCT: Duyệt / Điều chỉnh (form inline + ghi chú bắt buộc) / Từ chối; "Duyệt cả tuần"
- `VehicleBoard.jsx` — bảng xe×tuần + panel "Đề nghị bố trí xe" (CHỈ chuyến chuyên viên đã tick
  đề nghị); phân xe -> `da_phan_xe`, Quản trị phê duyệt -> `da_duyet`; xe RIÊNG chỉ Quản trị thấy
  trong danh sách chọn; cảnh báo trùng xe (confirm) qua `findConflicts`
- `AdminUsers/AdminLeaders/AdminVehicles.jsx` — tab Quản trị. AdminUsers: TẠO tài khoản (form
  + tick vai trò/Ban) gọi `api/admin-create-user.js` (Vercel Serverless, service_role) +
  phân quyền tài khoản đã có. Cần env `SUPABASE_SERVICE_ROLE_KEY` trên Vercel.
- `FilterBar.jsx` — điều hướng tuần/tháng/ngày + lọc Ban/lãnh đạo/trạng thái
- `EntryCard.jsx` / `StatusBadge.jsx` — ô lịch + huy hiệu trạng thái dùng chung. EntryCard nhận
  `vehicles` (mảng xe của chuyến, đã lọc bỏ xe riêng) -> dòng "Xe:"; chế độ Gọn chỉ hiện dòng này
  khi lịch có đề nghị bố trí xe; kèm chip trạng thái phiếu xe
- `EntryDetail.jsx` — chi tiết lịch; khối "Đề nghị bố trí xe" (trạng thái/số người/nơi xuất phát/
  xe/ý kiến), nút Phê duyệt điều xe (Quản trị) và **In Phiếu điều xe** (sau khi duyệt)

## Nạp dữ liệu (App.jsx)
- Khoảng fetch = lưới tháng chứa `anchor` (luôn phủ tuần/ngày đang xem); refetch sau mỗi mutation (không realtime)
- Badge "Chờ duyệt" đếm entries `cho_duyet` trong khoảng đã nạp

## In ấn
- `@media print` trong `src/index.css`: A4 ngang, Times New Roman, đen trắng
- Vùng in: phần tử `.print-root`; tiêu đề `.print-header` chỉ hiện khi in; `.no-print` ẩn khi in
