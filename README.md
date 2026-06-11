# Lịch công tác tuần — Văn phòng Đoàn ĐBQH và HĐND tỉnh Thanh Hóa

Website quản lý lịch làm việc hàng tuần: lịch của 2 Phó Chủ tịch HĐND tỉnh và lãnh đạo
4 Ban (Trưởng ban, Phó Trưởng ban, Ủy viên chuyên trách); quy trình phê duyệt của PCT;
điều xe công vụ. Xem theo tuần / tháng / ngày, in lịch tuần và lịch điều xe khổ A4 ngang.

## Cài đặt lần đầu

### 1. Tạo cơ sở dữ liệu Supabase (miễn phí)
1. Vào https://supabase.com → New project (chọn region Singapore).
2. Mở **SQL Editor** → New query → dán toàn bộ `supabase/schema.sql` → **Run**.
3. Tiếp tục dán `supabase/seed.sql` → **Run** (tạo 4 Ban, lãnh đạo mẫu, 4 xe, lịch mẫu).
4. Vào **Settings → API**: chép `Project URL` và `anon public key`.

### 2. Cấu hình & chạy thử
```bash
# Sao chép .env.example thành .env rồi điền 2 giá trị ở bước 1.4
npm install
npm run dev   # mở http://localhost:5173
```

### 3. Đăng nhập lần đầu (quản trị gốc)
1. Trang đăng nhập → **"Lần đầu đăng nhập / Quên mật khẩu"** → nhập `sonthkh@gmail.com`.
2. Mở email, bấm liên kết → hệ thống yêu cầu nhập Họ tên, Chức vụ và **tạo mật khẩu**.
3. Các lần sau đăng nhập bằng email + mật khẩu.

### 4. Thiết lập ban đầu (tab Quản trị)
- **Lãnh đạo**: sửa tên thật của 2 PCT, 12 lãnh đạo Ban (seed chỉ là tên mẫu).
- **Xe công vụ**: sửa biển số, tên + SĐT lái xe thật.
- **Tài khoản**: hướng dẫn từng cán bộ tự kích hoạt (như bước 3) rồi gán vai trò:
  PCT HĐND / Cán bộ theo dõi Ban (chọn Ban) / Cán bộ TH-TT-DN / Văn phòng điều xe / Người xem.

## Triển khai Vercel
1. Đẩy code lên GitHub → Vercel → Import project (framework: Vite).
2. Thêm Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Supabase → **Authentication → URL Configuration**: đặt Site URL = địa chỉ Vercel
   (để liên kết kích hoạt email trỏ về đúng trang).

## Nghiệp vụ chính
- **Thứ Sáu hàng tuần**: cán bộ Văn phòng bấm "Tuần sau →" và nhập lịch lãnh đạo Ban
  cho tuần kế tiếp (trạng thái *Chờ duyệt*).
- **PCT HĐND tỉnh**: tab *Chờ duyệt* → Duyệt / Điều chỉnh / Từ chối (có ghi chú);
  nút "Duyệt cả tuần" xử lý nhanh.
- **Lịch của PCT**: do cán bộ phòng TH-TT-Dân nguyện nhập, hiển thị ngay không cần duyệt.
- **Điều xe**: tab *Điều xe* → panel "Chuyến cần xe" → chọn xe (cảnh báo nếu trùng giờ);
  in Lịch điều xe tuần cho lái xe.

## Lệnh
| Lệnh | Ý nghĩa |
|---|---|
| `npm run dev` | Chạy máy chủ phát triển |
| `npm run build` | Đóng gói sản phẩm (cần env để ra bundle đầy đủ) |
| `npm run lint` | Kiểm tra lỗi mã nguồn |
