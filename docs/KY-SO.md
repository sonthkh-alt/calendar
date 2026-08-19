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

## 3. Mức 2 — USB token chuyên dùng (khuyến nghị nếu Văn phòng đã có token)

Cách phổ biến của các hệ thống dùng chứng thư số chuyên dùng: cài **phần mềm ký số của Ban Cơ yếu
Chính phủ** (bộ công cụ ký số / *sign service*) lên máy người ký. Phần mềm này chạy một dịch vụ cục bộ
trên máy; trang web gọi tới dịch vụ đó (địa chỉ `localhost`) để đẩy file cần ký sang, người ký nhập mã
PIN của token, dịch vụ trả lại file đã ký.

Luồng ghép vào ứng dụng này:

1. Người duyệt bấm **Ký số phiếu điều xe** trong hộp chi tiết lịch.
2. Ứng dụng kết xuất phiếu ra **PDF** (dùng lại pdfmake đã có trong dự án — xem `src/lib/exporters.js`)
   thay vì mở cửa sổ in.
3. Gửi PDF sang dịch vụ ký cục bộ → người ký nhập PIN → nhận lại PDF đã ký.
4. Tải PDF đã ký lên **Supabase Storage**, lưu đường dẫn vào cột mới (vd `vehicle_signed_pdf_url`).
5. Nút "In phiếu" chuyển thành "Tải phiếu đã ký số".

Việc phải làm trước khi lập trình:

- [ ] Xác nhận Văn phòng **đã được cấp chứng thư số chuyên dùng** cho người sẽ ký (Lãnh đạo Văn phòng).
- [ ] Lấy **bộ cài + tài liệu API** của phần mềm ký số (cổng dịch vụ, tên hàm, định dạng tham số) — các
      thông số này **khác nhau theo phiên bản**, phải đọc đúng tài liệu kèm bản cài đang dùng, không suy đoán.
- [ ] Kiểm tra rào cản kỹ thuật: trang web chạy **HTTPS** gọi dịch vụ **HTTP localhost** có thể bị trình
      duyệt chặn (mixed content). Cách xử lý thường gặp: dùng cổng HTTPS do phần mềm ký cung cấp, hoặc
      chấp nhận ký trên ứng dụng máy trạm rồi tải file đã ký lên hệ thống.
- [ ] Quy định vị trí đặt hình ảnh chữ ký số trên trang phiếu (thường góc dưới bên phải, ô "Lãnh đạo Văn phòng").

**Phương án dự phòng, không cần lập trình gì thêm:** in/kết xuất phiếu ra PDF từ hệ thống → ký bằng phần
mềm ký số trên máy → tải file đã ký lên (có thể dùng tính năng đính kèm nếu bổ sung sau). Đây là cách
nhiều đơn vị đang làm và có thể áp dụng ngay hôm nay.

---

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
2. **Khi cần giá trị pháp lý:** hỏi bộ phận văn thư xem Văn phòng đã có chứng thư số chuyên dùng chưa.
   - Có rồi → làm mức 2, bắt đầu bằng phương án dự phòng (kết xuất PDF, ký bằng phần mềm máy trạm),
     rồi mới tính tích hợp trực tiếp.
   - Chưa có / muốn ký bằng điện thoại → làm mức 3.
3. Dù ở mức nào cũng giữ nguyên **mã xác thực + nhật ký thao tác** để tra soát nội bộ.
