# Ký số khi phê duyệt Phiếu điều xe — nghiên cứu phương án

Tài liệu trả lời yêu cầu số (5): *"Nghiên cứu cách để admin ký số khi phê duyệt (nếu có)"*.
Trạng thái: **đã triển khai mức 1**; mức 2 và 3 cần điều kiện ngoài phần mềm (thiết bị, chứng thư số,
hợp đồng dịch vụ) nên chỉ nêu phương án + việc phải làm.

---

## 1. Ba mức "ký" và giá trị pháp lý

| Mức | Cách làm | Giá trị pháp lý | Điều kiện |
|---|---|---|---|
| **1. Chữ ký ảnh + mã xác thực** (ĐÃ LÀM) | Quản trị tải ảnh chữ ký ở tab *Quản trị → Tài khoản*; khi phê duyệt điều xe, hệ thống lưu người duyệt, thời điểm và sinh **mã xác thực** in trên phiếu | Không phải chữ ký số. Là bằng chứng nội bộ (có nhật ký thao tác trong `activity_log`) | Không cần gì thêm |
| **2. Ký số bằng USB token chuyên dùng** (Ban Cơ yếu Chính phủ cấp) | Kết xuất phiếu ra PDF rồi ký bằng phần mềm ký số của Ban Cơ yếu cài trên máy người duyệt | Chữ ký số đầy đủ giá trị pháp lý theo Luật Giao dịch điện tử | Có chứng thư số chuyên dùng + USB token + phần mềm ký cài trên máy |
| **3. Ký số từ xa (remote signing)** | Ký bằng ứng dụng trên điện thoại (VNPT SmartCA, Viettel-CA, MISA eSign, FPT.CA…), máy chủ gọi API của nhà cung cấp | Chữ ký số đầy đủ giá trị pháp lý | Hợp đồng dịch vụ + backend giữ khóa API (không để lộ trên trình duyệt) |

> Lưu ý: chữ ký ảnh ở mức 1 **không** thay thế được chữ ký số. Nếu phiếu điều xe chỉ lưu hành nội bộ
> Văn phòng thì mức 1 là đủ dùng; nếu cần lưu trữ điện tử có giá trị pháp lý thì phải lên mức 2 hoặc 3.

---

## 2. Mức 1 — đang chạy trong hệ thống

- `profiles.signature_data`: ảnh chữ ký (data URI PNG, tự thu nhỏ còn ≤ 400px ngang khi tải lên).
- Khi Quản trị bấm **Phê duyệt điều xe**, hệ thống ghi:
  `vehicle_approved_by`, `vehicle_approved_at`, `vehicle_approve_note`, `vehicle_sign_code` (dạng `A1B2-C3D4`).
- Phiếu in ra có ảnh chữ ký + dòng *"Phê duyệt điện tử trên Hệ thống lịch công tác lúc … — Mã xác thực: …"*.
- Đối chiếu khi nghi ngờ: tra mã xác thực trong CSDL (`schedule_entries.vehicle_sign_code`) và nhật ký
  thao tác (tab *Quản trị → Nhật ký*).

**Giới hạn cần biết:** ai đăng nhập được tài khoản Quản trị thì ký được. Vì vậy nên bật mật khẩu mạnh
cho tài khoản Quản trị và không dùng chung tài khoản.

---

## 3. Mức 2 — USB token chuyên dùng (Văn phòng ĐÃ CÓ token — làm được ngay)

### 3.1. Chuẩn bị máy tính của người ký (làm 1 lần)

1. **Cài driver USB token** (đĩa/bộ cài kèm token, hoặc tải ở trang của Ban Cơ yếu Chính phủ – `ca.gov.vn`).
   Cắm token, mở `certmgr.msc` → *Personal → Certificates*: phải thấy chứng thư mang tên người ký.
2. **Cài phần mềm ký số** của Ban Cơ yếu (bộ công cụ ký số văn bản điện tử / phần mềm ký PDF).
   Tải đúng bản dành cho chứng thư số **chuyên dùng Chính phủ**; hỏi văn thư cơ quan hoặc Cục Chứng
   thực số và Bảo mật thông tin nếu chưa có bộ cài.
3. **Đổi mã PIN mặc định** của token và ghi nhớ. Nhập sai PIN nhiều lần liên tiếp sẽ **khóa token**,
   phải mang đi mở khóa — đây là lỗi hay gặp nhất.
4. **Cài chứng thư gốc (Root CA) của Ban Cơ yếu** để máy tính/Adobe Reader hiểu chữ ký là hợp lệ.
   Thiếu bước này, file ký xong vẫn mở được nhưng Adobe báo *"Signature validity is unknown"*.

### 3.2. Ký Phiếu điều xe — quy trình dùng được NGAY (không cần sửa phần mềm)

1. Trên hệ thống: mở **chi tiết lịch** → phê duyệt điều xe → bấm **In Phiếu điều xe**.
2. Trong hộp in của trình duyệt, chọn máy in **"Microsoft Print to PDF"** (hoặc *Save as PDF*) →
   lưu thành file, ví dụ `Phieu-dieu-xe-20-08-2026.pdf`.
3. Mở **phần mềm ký số** → chọn file PDF vừa lưu → chọn chứng thư trên token → **đặt vị trí chữ ký
   vào ô "KT. CHÁNH VĂN PHÒNG"** (góc dưới bên phải phiếu) → nhập PIN → lưu file đã ký.
4. **Kiểm tra**: mở file đã ký bằng Adobe Acrobat Reader, xem bảng *Signatures* — phải hiện
   *"Signed and all signatures are valid"*. Nếu báo *unknown* → quay lại bước 3.1.4 (cài Root CA).
5. Lưu/gửi file PDF đã ký. Đây là bản có giá trị pháp lý; bản in giấy chỉ là bản sao để đối chiếu.

> Mẹo: hệ thống đã in sẵn mã xác thực + ảnh chữ ký ở ô Lãnh đạo Văn phòng. Chữ ký số nên đặt **cạnh
> hoặc chồng lên** ô đó để người nhận thấy rõ đây là văn bản đã ký số.

### 3.3. Nâng cấp tiếp theo (tùy chọn, cần lập trình)

**Phương án A — lưu file đã ký vào hệ thống (đơn giản, khuyến nghị làm trước):**
thêm nút *"Tải lên phiếu đã ký số"* trong hộp chi tiết lịch → file vào Supabase Storage → mọi người
tải về từ chính mục lịch đó. Cần: tạo bucket + policy trên Supabase, thêm cột `vehicle_signed_pdf_url`.

**Phương án B — ký thẳng từ trang web:** phần mềm ký số của Ban Cơ yếu có bản chạy nền như một
*dịch vụ cục bộ* trên máy người ký; trang web gửi file sang dịch vụ đó (địa chỉ `localhost`), người ký
nhập PIN, dịch vụ trả lại file đã ký. Trước khi làm cần chuẩn bị:

- [ ] **Tên + phiên bản** phần mềm ký số đang cài và **tài liệu API** kèm theo (địa chỉ/cổng dịch vụ,
      tên hàm, tham số). Các thông số này khác nhau theo phiên bản — phải đọc đúng tài liệu của bản
      đang dùng, không suy đoán.
- [ ] Thử nghiệm rào cản **mixed content**: hệ thống chạy HTTPS (Vercel) mà dịch vụ ký chạy HTTP trên
      `localhost` thì trình duyệt sẽ chặn. Cách xử lý: dùng cổng HTTPS nếu phần mềm có hỗ trợ, hoặc
      giữ cách ký bằng ứng dụng máy trạm ở mục 3.2.
- [ ] Xác định máy nào được ký (chỉ máy của Lãnh đạo Văn phòng có token).

## 4. Mức 3 — ký số từ xa qua nhà cung cấp dịch vụ

Phù hợp khi người duyệt hay đi công tác (ký bằng điện thoại, không cần cắm token).

- Cần: hợp đồng với nhà cung cấp (VNPT SmartCA, Viettel-CA, MISA eSign, FPT.CA…), tài khoản ký số cho
  người duyệt, và **một backend** giữ khóa/bí mật gọi API.
- Dự án đã có sẵn chỗ đặt backend: thư mục `api/` chạy trên Vercel Serverless (giống `api/admin-create-user.js`).
  Thêm `api/sign-vehicle-slip.js`: nhận id mục lịch → dựng PDF → gọi API nhà cung cấp → nhận PDF đã ký → lưu.
- Bí mật đặt trong Environment Variables của Vercel, **không** để trong mã nguồn hay trình duyệt.

---

## 5. Khuyến nghị

1. **Giai đoạn hiện tại:** dùng mức 1 (đang chạy) — đủ cho phiếu điều xe nội bộ, không phát sinh chi phí.
2. **Khi cần giá trị pháp lý:** Văn phòng ĐÃ CÓ token chuyên dùng → dùng quy trình mục 3.2
   (in ra PDF → ký bằng phần mềm máy trạm → lưu file đã ký). Chạy ổn định rồi mới tính phương án A
   (lưu file đã ký vào hệ thống) và phương án B (ký thẳng từ web) ở mục 3.3.
3. Dù ở mức nào cũng giữ nguyên **mã xác thực + nhật ký thao tác** để tra soát nội bộ.
