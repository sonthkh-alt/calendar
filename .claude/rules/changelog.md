# Nhật ký dự án

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
