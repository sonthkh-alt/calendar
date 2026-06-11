# Kiến trúc & nơi sửa

Một trang (SPA), tabs bằng state trong `src/App.jsx` (không react-router).

## src/lib/
- `supabase.js` — createClient từ env (null nếu chưa cấu hình)
- `auth.js` — getSession/onAuthChange/signInWithOtp/signInWithPassword/setPassword(pw_set)/getMyProfile
- `api.js` — toàn bộ CRUD (entries, leaders, vehicles, profiles); mọi hàm trả `{data, error}`
- `permissions.js` — ma trận quyền: canCreateFor / canEditEntry / canReview / canAssignVehicle / canSeeEntry / initialStatus
- `dates.js` — tuần T2–CN (date-fns, locale vi), weekDays/monthGrid/weekLabel, `sessionsOverlap` (thuật toán trùng buổi/giờ)
- `constants.js` — BOOTSTRAP_ADMIN_EMAILS, ROLES, STATUS (màu), SESSIONS, VEHICLE_TYPES

## src/components/
- `WeekView.jsx` — màn chính: bảng ngày×(Sáng/Chiều)×cột lãnh đạo; chế độ Đầy đủ/Gọn; nút In
- `MonthView.jsx` / `DayView.jsx` — lưới tháng (click ngày → DayView), ngày chia 2 khối Sáng/Chiều
- `ScheduleForm.jsx` — modal thêm/sửa; multi-leader (1 dòng/người, chung group_id); cảnh báo mềm trùng lịch
- `ApprovalQueue.jsx` — hàng chờ PCT: Duyệt / Điều chỉnh (form inline + ghi chú bắt buộc) / Từ chối; "Duyệt cả tuần"
- `VehicleBoard.jsx` — bảng xe×tuần + panel "Chuyến cần xe"; cảnh báo trùng xe (confirm) qua `findConflicts`
- `AdminUsers/AdminLeaders/AdminVehicles.jsx` — tab Quản trị
- `FilterBar.jsx` — điều hướng tuần/tháng/ngày + lọc Ban/lãnh đạo/trạng thái
- `EntryCard.jsx` / `StatusBadge.jsx` — ô lịch + huy hiệu trạng thái dùng chung

## Nạp dữ liệu (App.jsx)
- Khoảng fetch = lưới tháng chứa `anchor` (luôn phủ tuần/ngày đang xem); refetch sau mỗi mutation (không realtime)
- Badge "Chờ duyệt" đếm entries `cho_duyet` trong khoảng đã nạp

## In ấn
- `@media print` trong `src/index.css`: A4 ngang, Times New Roman, đen trắng
- Vùng in: phần tử `.print-root`; tiêu đề `.print-header` chỉ hiện khi in; `.no-print` ẩn khi in
