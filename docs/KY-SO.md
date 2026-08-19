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

### 3.2. Ký Phiếu điều xe — luồng đã cài sẵn trong hệ thống

Mọi thao tác nằm trong hộp **chi tiết lịch** của mục lịch có đề nghị bố trí xe.

1. Sau khi **Phòng HC-TC-QT đã phân bổ xe** (phiếu chuyển sang *"Đã phân xe — chờ Lãnh đạo Văn phòng
   duyệt"*), **Lãnh đạo Văn phòng bấm "Phê duyệt & ký số"** → nhập ý kiến → hệ thống ghi phê duyệt
   (người duyệt, thời điểm, mã xác thực) và **tự tải về tệp PDF của phiếu** (`Phieu-dieu-xe-<ngày>-<mã>.pdf`).
2. Mở **phần mềm ký số** của Ban Cơ yếu → chọn tệp PDF vừa tải → chọn chứng thư trên token →
   đặt vị trí chữ ký vào ô **"KT. CHÁNH VĂN PHÒNG"** (góc dưới bên phải) → nhập PIN → lưu.
3. Quay lại hộp chi tiết lịch, bấm **"Tải phiếu ĐÃ KÝ SỐ lên"** và chọn tệp vừa ký.
   Hệ thống lưu tệp vào kho (Supabase Storage, bucket riêng tư `phieu-dieu-xe`).
4. **Chuyên viên** vào đúng mục lịch đó, bấm **"Tải phiếu đã ký số (PDF)"** để lấy file — không phải
   làm thêm bước nào. Khi chưa có bản ký số, họ vẫn xuất được bản PDF thường ("Xuất PDF phiếu") hoặc in giấy.

Kiểm tra chữ ký: mở tệp bằng Adobe Acrobat Reader → bảng *Signatures* phải hiện
*"Signed and all signatures are valid"*. Nếu báo *unknown* → làm lại bước 3.1.4 (cài Root CA).

> Kho tệp: cột `schedule_entries.vehicle_signed_path` (+ `_name`, `_at`, `_by`) trỏ tới tệp trong bucket
> `phieu-dieu-xe`. `schema.sql` tự tạo bucket khi cập nhật CSDL; nếu tài khoản migration không đủ quyền
> trên schema `storage`, tạo tay: **Supabase → Storage → New bucket → tên `phieu-dieu-xe`, để Private**.

### 3.3. Thiết bị ký số hiện có của Văn phòng (đã kiểm tra 19/08/2026)

| Mục | Giá trị |
|---|---|
| Thiết bị | **SafeNet eToken 5110** (Java Card, eToken Java Applet 1.7.7, FIPS 140-2 L3) |
| Tên token / Serial | Hà Ngọc Sơn / `02AA324C` |
| Phần mềm đang cài | VGCA Token Manager v1.0 + SafeNet Authentication Client |
| Giao diện lập trình | **PKCS#11** (thư viện SafeNet, thường là `C:\Windows\System32\eTPKCS11.dll`) và Windows CryptoAPI/CNG qua *eToken Base Cryptographic Provider* / *SafeNet Smart Card Key Storage Provider* |
| Chứng thư số | Cấp cho **Hà Ngọc Sơn**, CA cấp: **CA phục vụ các cơ quan Nhà nước G2**, hiệu lực **07/02/2025 – 07/01/2028** |
| Mã PIN | dài 6–16 ký tự, còn 15 lần thử sai |
| Hỗ trợ | Cục Chứng thực số và BMTT — `ca@bcy.gov.vn` — https://ca.gov.vn |

**Cần kiểm tra trước khi ký PDF:** mở chứng thư → tab *Details* → dòng **Key Usage**. Phải có
`Digital Signature` (và tốt nhất là `Non-Repudiation`) thì Adobe Reader mới chấp nhận là chữ ký tài liệu.
Ở tab *General*, chứng thư này liệt kê mục đích: xác thực máy chủ từ xa, bảo vệ thư điện tử,
`2.16.704.1.1.1.1.1`, Smart Card Logon — **chưa thấy ghi rõ "ký tài liệu"**. Nếu Key Usage không có
`Digital Signature`, phải xin Cục CTSBMTT cấp/bổ sung chứng thư dùng cho **ký số văn bản**.

### 3.4. Ghép "bấm Phê duyệt là ký luôn" — hai đường đi

Trình duyệt **không** truy cập trực tiếp được USB token (bảo mật của trình duyệt). Bắt buộc phải có một
**chương trình chạy trên máy có cắm token**, web gọi sang chương trình đó qua `http://127.0.0.1:<cổng>`.
Điểm kỹ thuật quan trọng: Chrome/Edge coi `127.0.0.1` là nguồn tin cậy nên trang HTTPS **gọi được**, nhưng
chương trình cục bộ phải trả đúng các header CORS, gồm `Access-Control-Allow-Private-Network: true`
(yêu cầu Private Network Access của Chrome đời mới).

**Đường A — dùng dịch vụ ký số sẵn có của Ban Cơ yếu (khuyến nghị).**
Liên hệ `ca@bcy.gov.vn` (hoặc hotline trong VGCA Token Manager) xin:
1. Bộ cài **phần mềm ký số dành cho ứng dụng web** (dịch vụ ký chạy nền, thường gọi là *vgca-sign-service*
   / *plugin ký số* — không phải Token Manager, cũng không phải bản ký tay trên desktop);
2. **Tài liệu tích hợp/API**: cổng dịch vụ, đường dẫn (endpoint), định dạng dữ liệu gửi/nhận, cách chỉ định
   vị trí ô chữ ký trên trang PDF.
Có 2 thứ đó là ghép vào nút "Phê duyệt & ký số" được ngay — phía ứng dụng đã chuẩn bị sẵn
`getVehicleSlipPdfBlob()` trong `src/lib/vehicleSlipPdf.js` để lấy đúng tệp PDF cần ký.

**Đường B — tự viết "trợ lý ký số" chạy trên máy Lãnh đạo Văn phòng.**
Một chương trình nhỏ (Node.js) chạy nền trên máy đã cắm token:
- mở cổng `http://127.0.0.1:7878`, chỉ nhận yêu cầu từ đúng tên miền của hệ thống;
- nhận tệp PDF → gọi **PKCS#11** của SafeNet (`eTPKCS11.dll`) → người ký nhập PIN → trả lại PDF đã ký;
- chạy cùng Windows để lúc nào cũng sẵn sàng.
Ưu điểm: không phụ thuộc lịch cấp phát phần mềm của cấp trên. Nhược: phải cài Node.js trên máy đó và
**bắt buộc thử nghiệm trực tiếp trên máy có token** (không mô phỏng được ở nơi khác).

Trong cả hai đường, luồng người dùng cuối giống nhau và không đổi:
**bấm "Phê duyệt & ký số" → nhập PIN → hệ thống tự lưu PDF đã ký → chuyên viên vào tải về.**

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
