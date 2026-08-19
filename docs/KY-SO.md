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

**Đã kiểm tra Key Usage (19/08/2026): `DigitalSignature, NonRepudiation, KeyEncipherment,
DataEncipherment`** → chứng thư **ký được văn bản**, không phải xin cấp bổ sung.
(Thumbprint `3AE33E7147F770076C21B4192D056EA5585D5DB7`, chủ thể *Hà Ngọc Sơn*,
`E=sonhn@thanhhoa.gov.vn`.)

### 3.4. "Bấm Phê duyệt là ký luôn" — ĐÃ TRIỂN KHAI (Trợ lý ký số)

Trình duyệt **không** truy cập trực tiếp được USB token. Giải pháp đang dùng: một chương trình nhỏ
(**Trợ lý ký số**) chạy nền trên chính máy có cắm token; trang web gửi tệp PDF sang
`http://127.0.0.1:7878`, trợ lý ký bằng chứng thư trên token rồi trả lại tệp đã ký.

Mã nguồn + hướng dẫn cài đặt: **`tools/ky-so-agent/`** (xem `README.md` trong thư mục đó).

**Luồng khi bấm "Phê duyệt & ký số":**

1. Hệ thống ghi phê duyệt (người duyệt, thời điểm, mã xác thực).
2. Dựng phiếu PDF (pdfmake) → gửi sang trợ lý.
3. Trợ lý ký PKCS#7 **detached, SHA-256** qua kho chứng thư Windows → **SafeNet hiện hộp nhập mã PIN**.
4. Nhận lại PDF đã ký → tải lên Supabase Storage → ghi `vehicle_signed_path/_name/_at/_by`.
5. Chuyên viên vào mục lịch bấm **"Tải phiếu đã ký số (PDF)"**.

Trợ lý chưa chạy / ký lỗi → hệ thống **tự quay về cách thủ công** (tải PDF về, ký bằng phần mềm trên
máy, rồi "Hoặc tải lên tệp đã ký sẵn") — không tắc việc.

**Cách làm bên trong (không dùng thư viện phải biên dịch):**

| Thành phần | Việc |
|---|---|
| `agent.mjs` | HTTP cục bộ `/health`, `/certs`, `/sign`; CORS + `Access-Control-Allow-Private-Network`; chỉ nghe trên `127.0.0.1`; chỉ nhận yêu cầu từ tên miền trong `allowOrigins` |
| `pdfsign.mjs` | `@signpdf/placeholder-plain` chèn ô chữ ký, `@signpdf/signpdf` tính ByteRange và nhúng chữ ký |
| `winsign.ps1` | .NET `SignedCms` + `CmsSigner` ký qua CSP/KSP của SafeNet (chính nó bật hộp PIN) |
| `src/lib/signAgent.js` | Phía web: dò trợ lý (`/health`), gửi PDF đi ký |

**Kiểm chứng đã chạy thật trên máy Windows (19/08/2026):**
`npm test` trong `tools/ky-so-agent` — 11/11 đạt (dựng PDF → chèn ô chữ ký → ký PKCS#7 → nhúng lại →
.NET `CheckSignature` xác nhận chữ ký hợp lệ, detached, SHA-256, đúng chứng thư). Đường HTTP `/sign`
cũng đã thử: trả về PDF có `/adbe.pkcs7.detached` và từ chối (403) yêu cầu từ tên miền lạ.

**Giới hạn hiện tại:** chữ ký là loại **không hiển thị** (invisible) — trình đọc PDF báo ở bảng
*Signatures*, còn phần nhìn thấy trên giấy là ảnh chữ ký + mã xác thực đã in sẵn trong phiếu. Muốn ô
chữ ký số hiện thành hình trên trang thì phải dựng thêm "appearance stream", làm sau nếu cần.

### 3.5. Đã cài sẵn trên máy Lãnh đạo Văn phòng (19/08/2026)

| Mục | Giá trị |
|---|---|
| Thư mục cài | `C:\ky-so-agent` (để ngoài OneDrive cho khỏi đồng bộ thừa) |
| Node.js | v24.15.0 (đã có sẵn trên máy) |
| Cổng | `7878` — chỉ nghe trên `127.0.0.1` |
| Cho phép gọi từ | `https://calendar-beta-lac.vercel.app`, `http://localhost:5173`, `http://127.0.0.1:5173` |
| Chứng thư ghim sẵn | `3AE33E7147F770076C21B4192D056EA5585D5DB7` — *Hà Ngọc Sơn*, hết hạn 01/07/2028 |
| Tự chạy khi bật máy | Lối tắt **"Tro ly ky so"** trong thư mục Startup (`shell:startup`), cửa sổ thu nhỏ |
| Chạy tay | Bấm đúp `C:\ky-so-agent\chay-tro-ly.bat` |

Kiểm tra nhanh bất cứ lúc nào: mở trình duyệt vào `http://127.0.0.1:7878/health` → thấy `{"ok":true,...}`.

**Tắt trợ lý:** đóng cửa sổ đen "TRO LY KY SO" (hoặc kết thúc tiến trình `node.exe` đang giữ cổng 7878).
**Bỏ tự chạy khi bật máy:** `Win + R` → `shell:startup` → xóa lối tắt *Tro ly ky so*.

**Khi đổi/gia hạn chứng thư số:** thumbprint sẽ khác → sửa `certThumbprint` trong
`C:\ky-so-agent\config.json` (xem thumbprint mới tại `http://127.0.0.1:7878/certs`), hoặc để trống
chuỗi này nếu máy chỉ có duy nhất một chứng thư ký được.

**Khi mã nguồn trợ lý được cập nhật:** chép đè các tệp `*.mjs`, `winsign.ps1` từ `tools/ky-so-agent/`
trong dự án sang `C:\ky-so-agent` (giữ nguyên `config.json`), rồi khởi động lại trợ lý.

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
