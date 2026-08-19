// "PHIẾU ĐỀ NGHỊ SỬ DỤNG XE Ô TÔ CÔNG VỤ" — dựng đúng mẫu văn bản của Văn phòng
// (docs/Đề nghị sử dụng xe oto.docx): khổ A4 dọc, Times New Roman 14, lề trên 1.5cm,
// phải 2cm, dưới 1cm, trái 3cm; bảng 2 cột KHÔNG kẻ viền (43% / 57%).
//
// buildVehicleSlipHtml là HÀM THUẦN (test được, không đụng DOM). printVehicleSlip mở
// một cửa sổ in RIÊNG -> không lẫn CSS của ứng dụng, in ra đúng một tờ phiếu.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Xuống dòng trong ô ký tên: "KT. TRƯỞNG PHÒNG\nPHÓ TRƯỞNG PHÒNG"
const escLines = (s) => esc(s).replace(/\n/g, '<br/>');

// Ảnh chữ ký (data URI) — chỉ nhận data:image để không nạp tài nguyên ngoài
const signImg = (data) => (/^data:image\//.test(data || '')
  ? `<img class="sig-img" src="${esc(data)}" alt="Chữ ký" />` : '');

/**
 * @param {object} d
 *  unitName, unitLine2      — tên đơn vị ở góc trái (2 dòng)
 *  recipient                — "Kính gửi: ..."
 *  placeDateText            — "Thanh Hoá, ngày 19 tháng 8 năm 2026"
 *  requesterName, requesterPosition
 *  purpose                  — nội dung chuyến công tác (đề nghị bố trí xe phục vụ)
 *  timeText, riderText, departure
 *  plateText, driverText    — ý kiến Phòng HC-TC-QT
 *  hctcqtBlock, hctcqtSignTitle, hctcqtSigner, hctcqtSign(ảnh)
 *  vpBlock, vpSignTitle, vpSigner, vpSign(ảnh), vpNote
 *  approvedAtText, signCode — dòng xác thực phê duyệt điện tử (rỗng -> không in)
 */
export function buildVehicleSlipHtml(d = {}) {
  const eSign = (d.approvedAtText || d.signCode)
    ? `<p class="esign">Phê duyệt điện tử trên Hệ thống lịch công tác${d.approvedAtText ? ` lúc ${esc(d.approvedAtText)}` : ''}${d.signCode ? `<br/>Mã xác thực: <b>${esc(d.signCode)}</b>` : ''}</p>`
    : '';
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8" />
<title>${esc(d.fileTitle || 'Phieu de nghi su dung xe o to cong vu')}</title>
<style>
  @page { size: A4 portrait; margin: 1.5cm 2cm 1cm 3cm; }
  * { box-sizing: border-box; }
  body { font-family: "Times New Roman", Times, serif; font-size: 14pt; line-height: 1.45; color: #000; margin: 0; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 0; }
  .c { text-align: center; }
  .b { font-weight: bold; }
  .i { font-style: italic; }
  .unit { font-size: 13pt; font-weight: bold; text-transform: uppercase; }
  .bar { width: 55%; margin: 3px auto 0; border-bottom: 1px solid #000; }
  .bar-sm { width: 35%; margin: 3px auto 0; border-bottom: 1px solid #000; }
  .title { text-align: center; font-weight: bold; font-size: 15pt; margin: 22px 0 4px; text-transform: uppercase; }
  .kg { margin: 14px 0 12px; font-style: italic; }
  .row { display: flex; align-items: baseline; gap: 6px; margin-top: 6px; }
  .row .val { flex: 1; border-bottom: 1px dotted #000; min-height: 1.4em; }
  .row .val.b { font-weight: bold; }
  .fill { border-bottom: 1px dotted #000; height: 1.5em; }
  .sign { text-align: center; }
  .sign .role { font-weight: bold; text-transform: uppercase; font-size: 13pt; }
  .sign .name { font-weight: bold; margin-top: 4px; }
  .sig-img { display: block; margin: 4px auto 0; max-height: 70px; max-width: 190px; }
  .sig-space { height: 52px; }
  .block { margin-top: 18px; }
  .block .head { font-weight: bold; text-transform: uppercase; font-size: 13pt; }
  .esign { font-size: 10pt; font-style: italic; margin-top: 4px; }
  @media screen { body { background: #f1f5f9; } .page { background: #fff; width: 21cm; min-height: 29.7cm; margin: 16px auto; padding: 1.5cm 2cm 1cm 3cm; box-shadow: 0 2px 12px rgba(0,0,0,.2); } }
  @media print { .page { padding: 0; } }
</style></head>
<body><div class="page">

  <table><tr>
    <td style="width:43%" class="c">
      <div class="unit">${escLines(d.unitName || '')}</div>
      <div class="bar"></div>
    </td>
    <td style="width:57%" class="c">
      <div class="b" style="font-size:13pt">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
      <div class="b">Độc lập - Tự do - Hạnh phúc</div>
      <div class="bar-sm"></div>
      <div class="i" style="margin-top:10px">${esc(d.placeDateText || '')}</div>
    </td>
  </tr></table>

  <div class="title">Đề nghị sử dụng xe ô tô công vụ</div>

  <p class="kg b">Kính gửi: ${esc(d.recipient || '')}</p>

  <div class="row"><span>Tên tôi là:</span><span class="val b">${esc(d.requesterName || '')}</span></div>
  <div class="row"><span>Chức vụ:</span><span class="val">${esc(d.requesterPosition || '')}</span></div>
  <div class="row"><span>Đề nghị được bố trí xe ô tô công vụ phục vụ:</span><span class="val">${esc(d.purpose || '')}</span></div>
  ${d.purposeMore ? `<div class="row"><span class="val">${esc(d.purposeMore)}</span></div>` : '<div class="fill"></div>'}
  <div class="row">
    <span>Thời gian:</span><span class="val">${esc(d.timeText || '')}</span>
    <span>Số người:</span><span class="val" style="max-width:28%">${esc(d.riderText || '')}</span>
  </div>
  <div class="row"><span>Địa điểm xuất phát:</span><span class="val">${esc(d.departure || '')}</span></div>
  ${d.requesterStaff ? `<div class="row"><span>Chuyên viên đề nghị:</span><span class="val b">${esc(d.requesterStaff)}</span></div>` : ''}

  <table style="margin-top:10px"><tr>
    <td style="width:50%"></td>
    <td style="width:50%" class="sign">
      <div class="role">Người báo xe</div>
      ${d.requesterSign ? signImg(d.requesterSign) : '<div class="sig-space"></div>'}
      <div class="name">${esc(d.requesterName || '')}</div>
    </td>
  </tr></table>

  <div class="block"><table><tr>
    <td style="width:52%">
      <div class="head">${esc(d.hctcqtBlock || '')}</div>
      <div class="row"><span>Điều xe biển số:</span><span class="val b">${esc(d.plateText || '')}</span></div>
      <div class="row"><span>Lái xe:</span><span class="val">${esc(d.driverText || '')}</span></div>
    </td>
    <td style="width:48%" class="sign">
      <div class="role">${escLines(d.hctcqtSignTitle || '')}</div>
      ${d.hctcqtSign ? signImg(d.hctcqtSign) : '<div class="sig-space"></div>'}
      <div class="name">${esc(d.hctcqtSigner || '')}</div>
    </td>
  </tr></table></div>

  <div class="block"><table><tr>
    <td style="width:52%">
      <div class="head">${esc(d.vpBlock || '')}</div>
      <div class="row"><span class="val">${esc(d.vpNote || '')}</span></div>
      <div class="fill"></div>
    </td>
    <td style="width:48%" class="sign">
      <div class="role">${escLines(d.vpSignTitle || '')}</div>
      ${d.vpSign ? signImg(d.vpSign) : '<div class="sig-space"></div>'}
      <div class="name">${esc(d.vpSigner || '')}</div>
      ${eSign}
    </td>
  </tr></table></div>

</div>
<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 250); });</script>
</body></html>`;
}

// Mở cửa sổ in riêng cho phiếu. Trả về false nếu trình duyệt CHẶN cửa sổ bật lên.
export function printVehicleSlip(data) {
  const w = window.open('', '_blank', 'width=900,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(buildVehicleSlipHtml(data));
  w.document.close();
  return true;
}

// Mã xác thực phê duyệt điện tử — in trên phiếu để đối chiếu với hệ thống.
// Dạng XXXX-XXXX (chữ HOA + số), sinh từ crypto.randomUUID khi Lãnh đạo VP duyệt.
export function makeSignCode() {
  const raw = (globalThis.crypto?.randomUUID?.() || String(Date.now()) + Math.random())
    .replace(/[^0-9a-f]/gi, '').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}
