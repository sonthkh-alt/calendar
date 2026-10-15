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
- `vehicleSlipData.js` — HÀM THUẦN dựng dữ liệu điền phiếu, dùng CHUNG cho hộp chi tiết lịch và
  bảng Điều xe: `sameEventEntries` / `chairLeaderOf` (người đề nghị = lãnh đạo chủ trì) /
  `slipVehiclesOf` / `buildSlipPayload` / `digitalSignInfo`. Test: npm run test:slip-data
- `vehicleSlipPdf.js` — CÙNG phiếu nhưng dựng PDF THẬT bằng pdfmake (nạp động pdfmake + pdfFonts):
  `buildVehicleSlipDocDefinition` (hàm thuần), `downloadVehicleSlipPdf`, `getVehicleSlipPdfBlob`
  (dành cho tích hợp ký số trực tiếp sau này). Test: scripts/test-slip-pdf.mjs (npm run test:slip-pdf)
- `exporters.js` — `exportWeekDocx` xuất .docx (NẠP ĐỘNG docx + file-saver); bảng công văn
  A4 dọc như WeekPrintSheet; thêm "Đồng chí" trước tên cán bộ (withComrade), in đậm "(chờ
  duyệt)". `buildWeekPdfDocDefinition` (hàm thuần) + `exportWeekPdf` xuất .pdf MỘT CÚ BẤM
  bằng pdfmake (NẠP ĐỘNG pdfmake + vfs_fonts; Roboto kèm theo đủ glyph tiếng Việt; chuẩn
  hóa NFC). WeekView: "Xuất PDF" cho MỌI tài khoản; "Xuất Word" chỉ với email trong
  constants.DOCX_EXPORT_EMAILS (canExportDocx). Test: scripts/test-pdf.mjs (npm run test:pdf).

- `stats.js` — THỐNG KÊ (HÀM THUẦN): kỳ báo cáo `periodRange`/`shiftAnchor`/`comparisonRange`
  (tuần/tháng/quý/6 tháng/9 tháng/năm/tùy chọn ≤5 năm; so kỳ liền trước | cùng kỳ năm trước),
  `classifyActivity` (loại hoạt động theo từ khóa, có THỨ TỰ ưu tiên — `ACTIVITY_CATEGORIES`),
  `buildStatsReport` -> MÔ HÌNH BÁO CÁO `{ meta, kpis, sections[] }` (mỗi section: columns/rows/
  total/notes/printColumns). Gom SỰ KIỆN bằng union-find (chung group_id HOẶC ngày+buổi+nội dung+
  địa điểm). Thêm bảng = thêm 1 section ở đây, màn hình + Excel/PDF/Word tự có. Test: npm run test:stats
- `statsExport.js` — xuất mô hình báo cáo: `buildStatsWorkbook` (xlsx, mỗi bảng 1 sheet, số/ngày/%
  là kiểu thật), `buildStatsPdfDocDefinition` (pdfmake, quốc hiệu + lề Nghị định 30, Trang x/y,
  khối chữ ký), `buildStatsDocx` (docx, Times New Roman). Thư viện NẠP ĐỘNG khi bấm xuất.
- `vehicleLog.js` — NHẬT TRÌNH XE (HÀM THUẦN) trên các LẦN GHI ODO (vehicle_odo_readings):
  `buildLogbook` gom theo xe/ngày, nối chuỗi ODO (không ghi xuất phát -> lấy lần ghi trước), km ngày,
  km từng lần ghi (`delta`), loại lần ghi "không tính" khỏi số liệu nhưng vẫn trả về để hiển thị,
  đối chiếu chuyến công tác (`tripsByDate`), cảnh báo (lùi số, chênh km, >800 km/ngày, quên ghi lúc
  về, có chuyến mà chưa ghi); `suggestKind`; nhắc thay dầu `lastOilChange` + `oilStatus` (book.oil;
  buildLogbook nhận `oilReadings` = các lần thay dầu ngoài khoảng nạp, api.fetchOilChanges); `buildLogbookWorkbook` (Excel: Tổng hợp + mỗi xe 1 sheet
  + "Chi tiết các lần ghi"). Test: npm run test:logbook
- `images.js` — `compressImage` (nén ảnh chụp đồng hồ ≤1600px JPEG trước khi tải lên)
- `odoOcr.js` — ĐỌC SỐ ODO TỪ ẢNH: `recognizeOdo(blob, {lastOdo})` gọi `/api/ocr-odo` (Claude) -> máy chủ
  chưa cấu hình/lỗi thì dự phòng Tesseract.js trong trình duyệt (nạp động) -> không ra số thì value=null
  (giao diện bắt gõ tay). Hàm thuần `pickOdoCandidate` (chọn số hợp lý từ văn bản, bỏ TRIP có thập phân)
  + `checkPlausible` (không lùi, không nhảy quá 2.000 km). Test trong npm run test:logbook

## api/ (Vercel Serverless — KHÔNG chạy ở vite dev)
- `admin-create-user.js` — tạo tài khoản (service_role)
- `ocr-odo.js` — đọc số ODO: xác thực JWT + vai trò module, gửi ảnh tới Claude `claude-opus-5-5`
  (@anthropic-ai/sdk, `client.beta.messages.create`, `output_config.format` JSON schema, effort `low`,
  `fallbacks: "default"`). Cần env `ANTHROPIC_API_KEY`; thiếu -> 501 (client chuyển Tesseract).
  `vercel.json` đặt maxDuration 30s. Test giả lập: npm run test:ocr
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
  trong danh sách chọn; cảnh báo trùng xe (confirm) qua `findConflicts`.
  HÀNG LOẠT: chọn khoảng ngày (từ/đến, mặc định tuần đang xem) + tick nhiều chuyến ->
  `bulkAssign` (1 xe cho N chuyến) và `bulkApprove` (duyệt N phiếu + ký số lần lượt qua trợ lý)
- `AdminUsers/AdminLeaders/AdminVehicles.jsx` — tab Quản trị. AdminUsers: TẠO tài khoản (form
  + tick vai trò/Ban) gọi `api/admin-create-user.js` (Vercel Serverless, service_role) +
  phân quyền tài khoản đã có. Cần env `SUPABASE_SERVICE_ROLE_KEY` trên Vercel.
- `StatsView.jsx` — tab **Thống kê**: chọn kỳ + so sánh + phạm vi (đơn vị/lãnh đạo/trạng thái), TỰ
  NẠP dữ liệu theo kỳ (fetchEntries, độc lập với năm đang xem), thẻ chỉ tiêu, thẻ con theo nhóm
  bảng (STAT_GROUPS), biểu đồ đơn sắc, danh sách chi tiết bấm mở EntryDetail; nút Excel / PDF /
  Word (Word theo canExportDocx) + chọn bảng đưa vào bản in.
- `VehicleLogView.jsx` — tab **Nhật trình xe** (chỉ lai_xe / van_phong_xe / quan_tri; là tab MẶC ĐỊNH
  và đứng đầu với lái xe — App.tab = tabSel ?? theo vai trò). Lái xe: chọn xe (mặc định
  profiles.vehicle_id) -> form ghi ODO HÔM NAY + "Đã ghi hôm nay" + lịch sử 30 ngày (mở xem từng lần).
  Lái xe MƯỢN xe: nút "Mượn xe khác" -> chọn xe -> lần ghi tính cho xe đi (borrowed + ghi chú).
  HC-TC-QT / Quản trị: "Hôm nay x/7 xe đã ghi", tổng hợp các xe theo kỳ, sổ từng xe với mọi lần ghi +
  ảnh, "Ghi hộ lái xe", "Không tính" lần ghi nhầm (có lý do), xuất Excel. Realtime: tự nạp lại khi có
  lần ghi mới.
- `OdoForm.jsx` — `OdoReadingForm`: MỘT lần ghi = loại (CHỈ 2: Xuất phát — kèm hành trình, nhiên liệu,
  ghi chú / Ghi thêm — cũng có hành trình, nhiên liệu, ghi chú) + CHỤP ẢNH đồng hồ (bắt buộc) -> TỰ ĐỌC SỐ (odoOcr); không đọc được hoặc
  lái xe báo sai -> gõ tay (lưu `odo_source` nhap_tay/sua_so + `odo_ocr`); số máy đọc bất thường phải tick
  "Đúng số này". `borrowed`/`ownerName` -> ghi chú mượn xe tự sinh. Lưu ngay, không sửa/xóa. Người quản
  lý ghi hộ: chọn ngày, giờ, lái xe. `OdoPhoto` = ảnh thu nhỏ qua link có hạn.
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
