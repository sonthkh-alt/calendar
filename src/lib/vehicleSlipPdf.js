// "PHIẾU ĐỀ NGHỊ SỬ DỤNG XE Ô TÔ CÔNG VỤ" — bản PDF (để KÝ SỐ bằng USB token).
//
// Khác với vehicleSlip.js (in nhanh ra giấy bằng cửa sổ trình duyệt), file này dựng
// PDF THẬT bằng pdfmake -> tải về một tệp .pdf đúng mẫu, đưa vào phần mềm ký số của
// Ban Cơ yếu để ký, rồi tải bản đã ký lên hệ thống (xem docs/KY-SO.md).
//
// buildVehicleSlipDocDefinition là HÀM THUẦN (test được bằng node — scripts/test-slip-pdf.mjs).

const CM = 28.35; // 1cm = 28.35pt

// Dòng kẻ ngang dưới tên đơn vị / tiêu ngữ
const bar = (w, x = 0) => ({ canvas: [{ type: 'line', x1: x, y1: 0, x2: x + w, y2: 0, lineWidth: 1 }], margin: [0, 2, 0, 0] });

// Dòng "Nhãn: giá trị" (giá trị in đậm khi cần)
const line = (label, value, bold = false) => ({
  text: [{ text: label + ' ' }, { text: value || '……………………………………', bold }],
  margin: [0, 0, 0, 5],
});

/**
 * @param {object} d — cùng bộ dữ liệu với vehicleSlip.buildVehicleSlipHtml:
 *  unitName1, unitName2, recipient, placeDateText, requesterName, requesterPosition,
 *  purpose, purposeMore, timeText, riderText, departure, plateText, driverText,
 *  hctcqtBlock, hctcqtSignTitle(2 dòng, ngăn bằng \n), hctcqtSigner,
 *  vpBlock, vpNote, vpSignTitle, vpSigner, vpSign(ảnh data URI), approvedAtText, signCode
 */
export function buildVehicleSlipDocDefinition(d = {}) {
  const signTitle = (s) => (s || '').split('\n').map((t) => ({ text: t, bold: true, alignment: 'center', fontSize: 12 }));
  // Ảnh chữ ký; nếu không có ảnh thì chừa khoảng trống để ký tay (spacer pt).
  // fit [rộng, CAO]: chặn cả CHIỀU CAO ảnh chữ ký -> phiếu luôn gọn trong 1 trang A4
  // (ảnh chữ ký người dùng tải lên có thể rất cao, trước đây làm tràn sang trang 2).
  const img = (data, spacer = 34, width = 100, height = 40) => (/^data:image\//.test(data || '')
    ? [{ image: data, fit: [width, height], alignment: 'center', margin: [0, 3, 0, 0] }]
    : (spacer ? [{ text: ' ', margin: [0, 0, 0, spacer] }] : []));

  // Ô CHỮ KÝ SỐ nhìn thấy được (kiểu văn bản điện tử của cơ quan nhà nước).
  // Chữ ký mật mã bản thân nó là "vô hình" — nhiều trình xem PDF không hiện bảng
  // Signatures, nên phải VẼ khối thông tin này lên trang thì người đọc mới thấy.
  const dsBox = [];
  if (d.digitalSign?.signer) {
    const ds = d.digitalSign;
    dsBox.push({
      margin: [0, 6, 0, 0],
      table: {
        widths: ['*'],
        body: [[{
          border: [true, true, true, true],
          stack: [
            { text: 'ĐÃ KÝ SỐ', bold: true, fontSize: 8, color: '#166534' },
            { text: `Ký bởi: ${ds.signer}`, fontSize: 8.5, color: '#14532d' },
            ...(ds.org ? [{ text: `Cơ quan: ${ds.org}`, fontSize: 8, color: '#14532d' }] : []),
            ...(ds.issuer ? [{ text: `Chứng thư do ${ds.issuer} cấp`, fontSize: 7.5, color: '#14532d' }] : []),
            ...(ds.timeText ? [{ text: `Ký ngày: ${ds.timeText}`, fontSize: 8, color: '#14532d' }] : []),
            ...(d.signCode ? [{ text: `Mã xác thực: ${d.signCode}`, fontSize: 7.5, color: '#14532d' }] : []),
          ],
        }]],
      },
      layout: {
        hLineColor: () => '#16a34a', vLineColor: () => '#16a34a',
        hLineWidth: () => 0.8, vLineWidth: () => 0.8,
        paddingLeft: () => 4, paddingRight: () => 4, paddingTop: () => 3, paddingBottom: () => 3,
      },
    });
  }

  const eSign = [];
  if (!d.digitalSign?.signer && (d.approvedAtText || d.signCode)) {
    eSign.push({
      text: `Phê duyệt điện tử trên Hệ thống lịch công tác${d.approvedAtText ? ` lúc ${d.approvedAtText}` : ''}`
        + `${d.signCode ? `\nMã xác thực: ${d.signCode}` : ''}`,
      fontSize: 8, italics: true, alignment: 'center', margin: [0, 3, 0, 0],
    });
  }

  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    // lề theo mẫu Word: trái 3cm, trên 1.5cm, phải 2cm, dưới 1cm
    pageMargins: [3 * CM, 1.5 * CM, 2 * CM, 1 * CM],
    defaultStyle: { font: 'Roboto', fontSize: 13, lineHeight: 1.3 },
    content: [
      {
        columns: [
          {
            width: '43%',
            stack: [
              { text: d.unitName1 || 'VĂN PHÒNG ĐOÀN ĐBQH', bold: true, alignment: 'center', fontSize: 12 },
              { text: d.unitName2 || 'VÀ HĐND TỈNH THANH HÓA', bold: true, alignment: 'center', fontSize: 12 },
              bar(90, 30),
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM', bold: true, alignment: 'center', fontSize: 12 },
              { text: 'Độc lập - Tự do - Hạnh phúc', bold: true, alignment: 'center', fontSize: 13 },
              bar(120, 40),
              { text: d.placeDateText || '', italics: true, alignment: 'center', margin: [0, 10, 0, 0] },
            ],
          },
        ],
      },

      { text: 'ĐỀ NGHỊ SỬ DỤNG XE Ô TÔ CÔNG VỤ', bold: true, alignment: 'center', fontSize: 15, margin: [0, 20, 0, 12] },
      { text: `Kính gửi: ${d.recipient || ''}`, bold: true, alignment: 'center', margin: [0, 0, 0, 14] },

      line('Tên tôi là:', d.requesterName, true),
      line('Chức vụ:', d.requesterPosition),
      line('Đề nghị được bố trí xe ô tô công vụ phục vụ:', d.purpose),
      ...(d.purposeMore ? [{ text: d.purposeMore, margin: [0, 0, 0, 5] }] : []),
      {
        columns: [
          { width: '58%', text: [{ text: 'Thời gian: ' }, { text: d.timeText || '', bold: true }] },
          { width: '*', text: [{ text: 'Số người: ' }, { text: d.riderText || '', bold: true }] },
        ],
        margin: [0, 0, 0, 5],
      },
      line('Địa điểm xuất phát:', d.departure),
      ...(d.requesterStaff ? [line('Chuyên viên đề nghị:', d.requesterStaff, true)] : []),

      {
        columns: [
          { width: '50%', text: '' },
          {
            width: '*',
            stack: [
              { text: 'NGƯỜI BÁO XE', bold: true, alignment: 'center', fontSize: 12 },
              { text: ' ', margin: [0, 0, 0, 28] },
              { text: d.requesterName || '', bold: true, alignment: 'center' },
            ],
          },
        ],
        margin: [0, 14, 0, 0],
      },

      {
        columns: [
          {
            width: '52%',
            stack: [
              { text: d.hctcqtBlock || '', bold: true, fontSize: 12, margin: [0, 0, 0, 6] },
              line('Điều xe biển số:', d.plateText, true),
              line('Lái xe:', d.driverText),
            ],
          },
          {
            width: '*',
            stack: [
              ...signTitle(d.hctcqtSignTitle),
              ...img(d.hctcqtSign),
              { text: d.hctcqtSigner || '', bold: true, alignment: 'center', margin: [0, 4, 0, 0] },
            ],
          },
        ],
        margin: [0, 16, 0, 0],
      },

      {
        columns: [
          {
            width: '52%',
            stack: [
              { text: d.vpBlock || '', bold: true, fontSize: 12, margin: [0, 0, 0, 6] },
              { text: d.vpNote || '……………………………………' },
            ],
          },
          {
            width: '*',
            stack: [
              ...signTitle(d.vpSignTitle),
              ...img(d.vpSign, d.digitalSign?.signer ? 0 : 34, d.digitalSign?.signer ? 68 : 100, d.digitalSign?.signer ? 26 : 40),
              { text: d.vpSigner || '', bold: true, alignment: 'center', margin: [0, 4, 0, 0] },
              ...dsBox,
              ...eSign,
            ],
          },
        ],
        margin: [0, 22, 0, 0],
      },
    ],
  };
}

// Tên tệp PDF: Phieu-dieu-xe-<ngày>-<mã xác thực>.pdf (không dấu, an toàn cho mọi máy)
export function vehicleSlipFileName(d = {}) {
  const date = (d.dateISO || '').replace(/-/g, '') || 'phieu';
  return `Phieu-dieu-xe-${date}${d.signCode ? '-' + d.signCode : ''}.pdf`;
}

// Nạp pdfmake + phông Roboto tự nhúng (đủ glyph tiếng Việt) — giống exporters.js
async function loadPdfMake() {
  const mod = await import('pdfmake/build/pdfmake');
  const { ROBOTO_VFS, ROBOTO_FONTS } = await import('./pdfFonts.js');
  const pdfMake = mod.default || mod;
  pdfMake.vfs = ROBOTO_VFS;
  pdfMake.fonts = ROBOTO_FONTS;
  return pdfMake;
}

// Tải phiếu PDF về máy (để đưa vào phần mềm ký số)
export async function downloadVehicleSlipPdf(data) {
  const pdfMake = await loadPdfMake();
  pdfMake.createPdf(buildVehicleSlipDocDefinition(data)).download(vehicleSlipFileName(data));
}

// Lấy phiếu PDF dạng Blob (dùng khi cần tải thẳng lên máy chủ / gửi sang dịch vụ ký số)
export async function getVehicleSlipPdfBlob(data) {
  const pdfMake = await loadPdfMake();
  return new Promise((resolve) => {
    pdfMake.createPdf(buildVehicleSlipDocDefinition(data)).getBlob((blob) => resolve(blob));
  });
}
