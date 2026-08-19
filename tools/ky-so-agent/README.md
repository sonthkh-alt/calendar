# TRỢ LÝ KÝ SỐ — ký phiếu điều xe bằng USB token

Chương trình nhỏ chạy **trên máy của Lãnh đạo Văn phòng** (máy có cắm USB token). Hệ thống lịch công tác
gửi tệp PDF sang đây, chương trình ký bằng chứng thư số trên token rồi trả lại tệp đã ký — nhờ vậy trên
web chỉ cần bấm **"Phê duyệt & ký số"**, nhập mã PIN là xong.

Vì sao phải có chương trình này: trình duyệt **không được phép** truy cập USB token (quy định bảo mật).

---

## 1. Cài đặt (làm một lần)

1. **Cài Node.js** bản LTS: https://nodejs.org (chọn *Windows Installer .msi*, bấm Next đến hết).
2. Chép **cả thư mục `ky-so-agent`** này sang máy có token, ví dụ vào `C:\ky-so-agent`.
3. Mở thư mục đó, gõ `cmd` vào ô địa chỉ của File Explorer rồi Enter (mở Command Prompt tại đây), chạy:

   ```
   npm install
   ```

4. Tạo tệp cấu hình: chép `config.example.json` thành **`config.json`**, sửa `allowOrigins` cho đúng
   địa chỉ hệ thống đang dùng (mặc định đã điền sẵn địa chỉ hiện tại).

## 2. Chạy

```
npm start
```

Cửa sổ hiện dòng `Đang chạy tại http://127.0.0.1:7878` là được. **Giữ cửa sổ này mở** khi cần ký;
đóng cửa sổ là tắt trợ lý.

**Cho chạy sẵn mỗi lần bật máy:** tạo tệp `chay-tro-ly.bat` trong thư mục này với nội dung

```bat
@echo off
cd /d "%~dp0"
node agent.mjs
```

rồi bấm `Win + R` → gõ `shell:startup` → Enter → chép **lối tắt (shortcut)** của tệp `.bat` vào đó.

## 3. Dùng

1. Cắm USB token.
2. Trên hệ thống lịch công tác: mở lịch → **"Phê duyệt & ký số"** → nhập ý kiến.
3. SafeNet hiện hộp **nhập mã PIN** → nhập → xong. Hệ thống tự lưu PDF đã ký; chuyên viên vào tải về.

Nếu trợ lý chưa chạy, hệ thống tự chuyển sang cách thủ công (tải PDF về, ký bằng phần mềm trên máy,
rồi tải bản đã ký lên) — không bị tắc việc.

## 4. Kiểm tra nhanh

- Trợ lý sống chưa: mở trình duyệt vào `http://127.0.0.1:7878/health` → thấy `{"ok":true,...}`.
- Máy nhìn thấy chứng thư nào: `http://127.0.0.1:7878/certs` (chỉ mở được từ địa chỉ trong `allowOrigins`).
- Thử toàn bộ đường ống **không cần token** (tạo chứng thư tự ký tạm rồi tự xóa):

  ```
  npm test
  ```

## 5. Cấu hình (`config.json`)

| Khóa | Ý nghĩa |
|---|---|
| `port` | Cổng của trợ lý (mặc định 7878). Đổi thì nhớ báo lại để sửa cấu hình phía web. |
| `allowOrigins` | Danh sách địa chỉ web được phép gọi. Không có trong danh sách thì bị từ chối. |
| `certThumbprint` | Bắt buộc dùng đúng một chứng thư. Để trống: máy chỉ có một chứng thư ký được thì tự chọn. |

Trợ lý **chỉ lắng nghe trên 127.0.0.1** — máy khác trong mạng không gọi vào được.

## 6. Cách hoạt động (cho người bảo trì)

| Tệp | Việc |
|---|---|
| `agent.mjs` | Máy chủ HTTP cục bộ: `/health`, `/certs`, `/sign`; CORS + `Access-Control-Allow-Private-Network` |
| `pdfsign.mjs` | Chèn ô chữ ký vào PDF (`@signpdf/placeholder-plain`), tính ByteRange và nhúng chữ ký (`@signpdf/signpdf`) |
| `winsign.mjs` + `winsign.ps1` | Gọi .NET/CryptoAPI của Windows để tạo PKCS#7 detached SHA-256 bằng khóa trên token (SafeNet hiện hộp PIN) |
| `test-local.mjs` | Kiểm thử toàn bộ đường ống bằng chứng thư tự ký tạm |

Không dùng thư viện phải biên dịch (native) nào — cài đặt nhẹ, ít hỏng vặt.

Chữ ký tạo ra là **chữ ký không hiển thị** (invisible): trình đọc PDF báo ở bảng *Signatures*.
Phần nhìn thấy trên giấy (ảnh chữ ký + mã xác thực) đã được in sẵn trong phiếu.
