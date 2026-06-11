# CLAUDE.md — Bộ nhớ dự án (đọc tự động mỗi phiên)

Hệ thống **Quản lý lịch công tác tuần** — Văn phòng Đoàn ĐBQH và HĐND tỉnh Thanh Hóa.

Quản lý lịch của 2 PCT HĐND tỉnh + 12 lãnh đạo 4 Ban (KT-NS, Pháp chế, VH-XH, Dân tộc);
quy trình: cán bộ Văn phòng nhập lịch tuần sau (thứ Sáu) → PCT duyệt/điều chỉnh/từ chối
→ Văn phòng điều xe (2 xe riêng PCT + 2 xe chung, có cảnh báo trùng).

## Công nghệ
- React 18 + Vite 5 + Tailwind 3 + lucide-react + date-fns (calendar tự xây, KHÔNG dùng FullCalendar)
- Supabase: Postgres chuẩn hóa (bans, leaders, profiles, vehicles, schedule_entries) + Auth
- Đăng nhập: lần đầu magic link → tạo mật khẩu (`user_metadata.pw_set`) → email + mật khẩu
- Phân quyền TRONG APP (`src/lib/permissions.js`); RLS chỉ chặn người chưa đăng nhập
- Quản trị gốc: `BOOTSTRAP_ADMIN_EMAILS` trong `src/lib/constants.js` (sonthkh@gmail.com)
- Triển khai: Vercel (env vars + Supabase Auth redirect URL)

## Lệnh
- `npm run dev` — chạy thử http://localhost:5173 (cần `.env`, xem `.env.example`)
- `npm run build` — PHẢI xanh trước mỗi commit; `npm run lint` — không lỗi
- Lưu ý: build KHÔNG có `.env` sẽ ra bundle rỗng (tree-shake vì supabase=null) — bình thường

## Quy tắc chi tiết — `.claude/rules/` (tự nạp)
- `architecture.md` — cấu trúc file, nơi sửa từng chức năng
- `data-model.md` — bảng, vai trò, trạng thái, luồng duyệt
- `changelog.md` — nhật ký; cập nhật khi hoàn thành việc lớn

## Quy ước
- Toàn bộ UI tiếng Việt UTF-8 có dấu; tông màu đỏ/vàng chính quyền (theme từ dự án HDNDKPI)
- Dự án tham chiếu pattern: `../HDNDKPI` (auth, cấu hình, hiệu ứng CSS)
- KHÔNG commit `.env` / secret
