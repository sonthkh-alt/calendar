# BÀN GIAO — Tiếp tục dự án trên máy khác

> File này để **mai lên cơ quan, mở PC khác là dùng tiếp được ngay**.
> Mở thư mục dự án bằng Claude Code rồi bảo: *"đọc BAN-GIAO.md và tiếp tục"*.
> (CLAUDE.md đã tự nạp mỗi phiên; file này bổ sung phần "khôi phục môi trường".)

Cập nhật lần cuối: 15/06/2026 — commit mới nhất trên `main`: **Ghi chú "bản Demo thử nghiệm" + liên hệ ở footer & Login** (`24ad4dc`).
Toàn bộ đã `git push` lên `main`, cây làm việc **sạch**, đồng bộ `origin/main`. Mở máy là `git pull` rồi làm tiếp.

---

## 0. Dự án là gì (30 giây)
Website **Lịch công tác tuần** — Văn phòng Đoàn ĐBQH và HĐND tỉnh Thanh Hóa.
React 18 + Vite 5 + Tailwind 3 + Supabase (Postgres + Auth). UI tiếng Việt.
Đang **chạy thật**, không còn là bản nháp.

| Hạ tầng | Địa chỉ |
|---|---|
| Web (chạy thật) | https://calendar-beta-lac.vercel.app |
| Mã nguồn (GitHub) | https://github.com/sonthkh-alt/calendar — branch `main` |
| CSDL (Supabase) | project `psyudpexkrbtazxhkdjl`, vùng `aws-1-ap-northeast-2` (Seoul) |
| Triển khai | Vercel — **tự deploy mỗi khi push lên `main`** (~1–2 phút) |

---

## 1. Lấy mã nguồn trên PC cơ quan
**Cách A — OneDrive (dễ nhất):** PC cơ quan đăng nhập **cùng tài khoản OneDrive**
(thư mục `...\OneDrive\App\GoogleAnti\Calendar` sẽ tự đồng bộ về). Chỉ cần mở thư mục.

**Cách B — Git clone (máy lạ / không có OneDrive):**
```powershell
git clone https://github.com/sonthkh-alt/calendar.git
cd calendar
```

> Dù dùng cách nào, sau khi sửa xong **luôn `git push` lên `main`** để Vercel deploy
> và để máy còn lại đồng bộ (xem mục 5).

---

## 2. Cài đặt & chạy thử
Cần **Node.js 18+**.
```powershell
npm install
npm run dev      # http://localhost:5173
```

### ⚠️ Phải tạo file `.env` (KHÔNG có trên GitHub/đồng bộ)
`.env` bị `.gitignore` nên **không** nằm trên GitHub. Tạo file `.env` ở thư mục gốc:
```
VITE_SUPABASE_URL=<điền>
VITE_SUPABASE_ANON_KEY=<điền>
```
Lấy 2 giá trị này từ một trong hai nơi:
- **Supabase Dashboard** → Settings → API (Project URL + anon/public key), hoặc
- **Vercel** → Project `calendar` → Settings → Environment Variables (đã lưu sẵn ở đó).

> Lưu ý: `npm run build` **không có `.env`** sẽ ra bundle rỗng (supabase=null) — bình thường,
> không phải lỗi. Khi deploy, Vercel tự nạp biến môi trường nên web vẫn chạy.

Trước mỗi commit: `npm run build` phải **xanh**, `npm run lint` **không lỗi**.

---

## 3. Tài khoản & bí mật
- **Quản trị gốc:** `sonthkh@gmail.com` (đăng nhập email + mật khẩu; là `quan_tri` tuyệt đối).
- **Tài khoản khách (chỉ xem):** `user@thanhhoa.gov.vn` / `password`.
- **5 tài khoản test theo vai trò:** `hainq/lamlt/thttdn/hctcqt/ban @thanhhoa.gov.vn`,
  mật khẩu lần lượt `1`–`5` (xem `supabase/migrations/2026-06-12-tao-tai-khoan.sql`).
- **Luồng Đoàn ĐBQH** (`supabase/migrations/2026-06-12-tai-khoan-ctqh-doan.sql`):
  `hoalt@thanhhoa.gov.vn` / `6` — đ/c Lương Thị Hoa, vai trò `pho_truong_doan` (DUYỆT lịch Đoàn);
  `ctqh@thanhhoa.gov.vn` / `7` — vai trò `cb_ctqh` (NHẬP lịch Đoàn → chờ duyệt).
- **Lưu ý token:** mọi migration tạo user phải set cột token = `''` (NULL gây lỗi
  "Database error querying schema" khi đăng nhập — đã từng vấp).
- **GitHub Actions secret `SUPABASE_DB_URL`:** Session pooler URI (vùng Seoul),
  ký tự `@` trong mật khẩu phải đổi thành `%40`. Dùng để tự chạy `schema.sql` khi push.

> Bí mật KHÔNG ghi ở đây: mật khẩu CSDL Supabase, service-role key — lấy lại từ Supabase Dashboard.

---

## 4. Đã làm xong (trạng thái hiện tại)
Toàn bộ nhật ký chi tiết: **`.claude/rules/changelog.md`**. Tóm tắt các mảng đã hoàn thiện:

- **Đăng nhập:** magic link lần đầu → đặt mật khẩu → email + mật khẩu (mẫu HDNDKPI).
- **Lịch tuần / tháng / ngày:** cột theo đơn vị (Lãnh đạo HĐND tỉnh, Đoàn ĐBQH, 4 Ban,
  Lãnh đạo Văn phòng); chế độ Đầy đủ / Gọn; đường nét đậm/nhạt tách khối từng ngày.
- **Nhập lịch:** ScheduleForm multi-leader, nhân bản, nhóm thành phần (tick nhanh).
- **Quy trình duyệt:** PCT Duyệt / Điều chỉnh / Từ chối + "Duyệt cả tuần"; lịch PCT auto duyệt.
- **Điều xe:** 2 xe riêng PCT (mặc định tuyệt đối) + 2 xe chung; cảnh báo trùng xe/giờ.
- **Cảnh báo trùng địa điểm** cả năm (tô tím); họp tại trụ sở thì bỏ điều xe.
- **Bản in công văn (A4 dọc):** gộp mục giống nhau, **gộp thành phần theo tên Nhóm**
  (đã sửa lỗi lệch tiền tố "Đ/c"/"Đồng chí" — `scripts/test-compact.mjs` 9/9 đạt).
- **Bộ lọc đơn vị** thêm 3 nhóm cột; **khung hình theo thiết bị** (Tự động/Máy tính/Điện thoại):
  điện thoại → lịch chuyển chế độ Gọn kéo dọc, lưới 1 cột.
- **Quản trị:** tài khoản / lãnh đạo / xe / nhóm thành phần / Sao lưu–Phục hồi.
- **Tự động hóa CSDL:** GitHub Actions chạy `schema.sql` idempotent khi push (đã xác minh chạy thật).

### Bổ sung phiên 12/06 (mới nhất — chi tiết trong changelog)
- **Chuẩn hóa dữ liệu:** bỏ "Đ/c" trong họ tên; tên 4 Ban đầy đủ; STT **tự đánh 1..N** + nút ↑↓
  ở tab Lãnh đạo & Nhóm thành phần. Đổi nhãn cột PCT → **"Lãnh đạo TTr HĐND tỉnh"**.
- **Làm việc tại cơ quan:** ô tick trong form → không cần duyệt; lịch chỉ hiện Nội dung +
  dòng đậm "Làm việc tại cơ quan"; Thành phần vẫn lưu & **in được**.
- **Lãnh đạo HĐND tỉnh + Đoàn ĐBQH:** ô Lái xe luôn để trống (tự bố trí xe riêng).
- **Chọn nhóm ở trường "Lãnh đạo":** tạo mục cho từng đơn vị, hiển thị theo **tên nhóm**;
  gộp các mục trùng trong 1 cột thành **1 thẻ**; duyệt/điều chỉnh/xóa/điều xe áp dụng **cả nhóm**.
- **Duyệt:** cho phép **Điều chỉnh / Từ chối lịch ĐÃ duyệt**; Phó Trưởng Đoàn chỉ duyệt lịch Đoàn.
- **Sắp xếp** (xem + in): Sáng→Chiều, rồi theo STT nhóm/lãnh đạo. **Ngày nhập dd/mm/yyyy** (component `DateField`).
- **In:** sửa khoảng trắng lớn (bỏ `break-inside:avoid`), **lề trên/dưới 2cm**.
- **Sửa lịch:** nay **sửa được cả danh sách "Lãnh đạo"** (đối chiếu theo group_id, giữ id/xe).

### Bổ sung phiên 15/06 (mới nhất — chi tiết trong changelog)
- **Xuất PDF một cú bấm** (pdfmake + phông Roboto tiếng Việt nhúng sẵn `src/lib/pdfFonts.js`)
  cho MỌI tài khoản; **Xuất Word** (.docx) cho 2 email trong `constants.DOCX_EXPORT_EMAILS`;
  đã bỏ nút "In lịch tuần". Test: `npm run test:pdf` (11–12 ca).
- **Lọc đơn vị CHỌN NHIỀU** cùng lúc (filters.banIds là mảng); **"Chọn nhanh theo nhóm"
  chọn NHIỀU nhóm**; thẻ **TTr HĐND tỉnh tô nền xanh** (cả Đầy đủ + Gọn).
- **Sắp xếp lịch (xem + in + PDF/Word):** LUÔN theo **STT lãnh đạo cao nhất** của sự kiện
  (`makeEntrySorter` dùng leaderPrio = STT nhỏ nhất trong `_leaderIds`; ĐÃ BỎ thang STT nhóm
  vì group_label gộp nhiều nhóm gây lệch — vd "Hội nghị giao ban" có Thường trực phải lên đầu).
- **Người TẠO lịch sửa được lịch ĐÃ DUYỆT:** nút Sửa hiện cả khi da_duyet -> bắt nhập
  **"Lý do chỉnh sửa"** -> lịch về **chờ duyệt** (lưu cột `edit_note`, xóa thông tin duyệt cũ);
  EntryDetail/ApprovalQueue hiển thị lý do cho người duyệt. (Người duyệt vẫn dùng "Điều chỉnh".)
- **Chân trang + Login:** hiện **"Đây là bản Demo thử nghiệm"** + **"Chi tiết xin liên hệ
  Hà Ngọc Sơn, PCVP Đoàn ĐBQH và HĐND tỉnh"** (constants `DEMO_NOTICE`, `CONTACT_INFO`).

---

## 5. ⚠️ Việc CẦN KIỂM TRA NGAY khi về nhà
- [ ] **Kiểm tra họ tên lãnh đạo Ban** ở tab Quản trị → Lãnh đạo: trước đây 1 migration ghi đè
  tên thành viên thành tên Ban (vd "Hoàng Anh Tuấn" → "Ban Kinh tế Ngân sách") mỗi lần deploy.
  **Đã sửa** (xóa bước đó trong `2026-06-12-chuan-hoa-du-lieu.sql`) nên KHÔNG tái diễn; nhưng nếu
  còn dòng nào đang bị sai tên thì sửa tay & Lưu **một lần**.
- [ ] **Đăng nhập thử** `hoalt@`(6) và `ctqh@`(7) sau khi Actions deploy xong (cần migration mới chạy).

## 5a-bis. Nâng cấp hạ tầng phiên 12/06 (ĐÃ LÀM — kiểm chứng khi rảnh)
- [x] **PWA** — cài lên màn hình điện thoại, xem offline. KIỂM: mở web trên điện thoại →
  "Thêm vào màn hình chính"; tắt mạng → vẫn xem được lịch đã tải.
- [x] **Sao lưu tự động** — Actions "Sao luu du lieu" chạy hằng ngày. KIỂM: GitHub → Actions →
  chạy thử (workflow_dispatch) → tải artifact `backup-*` xem có JSON các bảng không.
- [x] **Realtime** — lịch tự cập nhật. KIỂM: mở 2 trình duyệt, sửa ở cái này → cái kia tự đổi.
  (Cần publication supabase_realtime đã thêm bảng — schema.sql tự làm khi deploy.)
- [x] **Audit log + siết RLS** — tab Quản trị "Nhật ký" + bảng `activity_log`.
  ⚠️ KIỂM SAU DEPLOY: đăng nhập từng vai trò thử TẠO/SỬA/DUYỆT lịch xem có bị chặn nhầm không.
  Nếu writer nào bị chặn: xem `is_app_writer()` trong `migrations/2026-06-12-audit-log-rls.sql`.
  GỠ NHANH toàn bộ siết RLS: **xóa file migration đó** → deploy lại → schema.sql khôi phục policy mở.

## 5b. Việc CÒN LẠI / có thể làm tiếp
- [ ] **Xuất Word/Excel (G6)** — chưa làm (dự kiến lazy-import `docx` + `xlsx`, mẫu `HDNDKPI/src/lib/exporters.js`).
- [ ] Cấu hình **Site URL + Redirect URLs** trong Supabase Auth nếu email xác thực còn trỏ về `localhost`.
- [ ] (Tùy chọn) ApprovalQueue: duyệt 1 dòng = duyệt cả nhóm cho đồng bộ với lịch tuần.
- [ ] (Ghi thêm yêu cầu mới phát sinh vào đây.)

---

## 6. QUY TẮC bắt buộc khi làm tiếp (đã từng vấp)
1. **TUYỆT ĐỐI không chạy lại `seed.sql`** — đã từng gây **mất dữ liệu** đã sửa trên web.
   Nâng cấp cấu trúc chỉ dùng `schema.sql` (idempotent) hoặc migration nhỏ. `seed.sql` có
   chốt an toàn tự dừng nếu bảng đã có dữ liệu.
2. **Tự động push:** sau mỗi lần sửa xong, **commit + push lên `main`** (không cần hỏi) —
   Vercel sẽ tự deploy. Đây là quy ước đã thống nhất.
3. **Build xanh trước commit**; UI luôn **tiếng Việt có dấu UTF-8**; tông màu đỏ/vàng chính quyền.
4. Cuối commit ghi: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
5. **GitHub Actions chạy LẠI mọi migration mỗi lần deploy** (không phải 1 lần). Migration
   phải idempotent VÀ **không ghi đè dữ liệu người dùng đã sửa** (đã từng làm hỏng họ tên).
   Tránh `update <bảng> set <trường người dùng nhập> = <giá trị suy ra>` không có guard chặt.

---

## 7. Bản đồ mã nguồn (chi tiết ở `.claude/rules/`)
- `CLAUDE.md` — bộ nhớ dự án (tự nạp mỗi phiên).
- `.claude/rules/architecture.md` — cấu trúc file, nơi sửa từng chức năng.
- `.claude/rules/data-model.md` — bảng CSDL, vai trò, trạng thái, luồng duyệt.
- `.claude/rules/changelog.md` — **nhật ký đầy đủ** (đọc khi cần biết "đã làm gì, vì sao").
- `src/lib/` — `supabase.js`, `auth.js`, `api.js`, `permissions.js`, `dates.js`, `constants.js`, `print.js`.
- `src/components/` — WeekView / MonthView / DayView / ScheduleForm / ApprovalQueue /
  VehicleBoard / FilterBar / DeviceSelect / EntryCard / EntryDetail / WeekPrintSheet / Admin*.

---

### Checklist mở máy ở cơ quan
1. Mở thư mục `Calendar` (OneDrive) **hoặc** `git clone` rồi `git pull`.
2. `npm install`.
3. Tạo `.env` (URL + anon key từ Supabase/Vercel) — xem mục 2.
4. `npm run dev` → kiểm tra http://localhost:5173.
5. Làm việc → `npm run build` xanh → `git commit` → `git push` (Vercel tự deploy).
