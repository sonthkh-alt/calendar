# Nhật ký dự án

## 2026-06-11 — Khởi tạo toàn bộ ứng dụng (v1)
- Scaffold Vite + React + Tailwind theo pattern HDNDKPI; auth magic link → mật khẩu
- schema.sql + seed.sql (4 Ban, 17 lãnh đạo, 4 xe, lịch mẫu tuần hiện tại)
- WeekView (bảng chính quyền Sáng/Chiều, chế độ Gọn mobile), MonthView, DayView
- ScheduleForm multi-leader + cảnh báo trùng; ApprovalQueue (duyệt/điều chỉnh/từ chối + duyệt cả tuần)
- VehicleBoard + cảnh báo trùng xe; Admin (tài khoản/lãnh đạo/xe); print CSS A4 ngang
- Build + lint xanh. CHƯA: tạo project Supabase thật, deploy Vercel, exporters Word/Excel (G6)
