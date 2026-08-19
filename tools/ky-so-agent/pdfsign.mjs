// Chèn ô chữ ký vào PDF rồi nhúng chữ ký PKCS#7 lấy từ USB token.
//  - @signpdf/placeholder-plain: thêm chỗ trống cho chữ ký (ByteRange + /Contents)
//  - @signpdf/signpdf: tính ByteRange thật và nhét chữ ký vào đúng chỗ
// Chữ ký thuộc loại KHÔNG hiển thị (invisible): trình đọc PDF báo ở bảng Signatures.
// Phần "nhìn thấy được" (ảnh chữ ký + mã xác thực) đã được in sẵn trong phiếu.
// Dùng lớp SignPdf (không dùng default export) để tránh lệch CommonJS/ESM khi nạp
import { SignPdf } from '@signpdf/signpdf';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { Signer } from '@signpdf/utils';
import { signDetachedCms } from './winsign.mjs';

// Chừa chỗ cho chữ ký: kèm cả chuỗi chứng thư nên để rộng tay.
const SIGNATURE_LENGTH = 16384;

class WindowsTokenSigner extends Signer {
  constructor(thumbprint, opts = {}) {
    super();
    this.thumbprint = thumbprint;
    this.opts = opts;
  }

  // signpdf truyền vào đúng phần dữ liệu nằm trong ByteRange -> ký detached trên đó
  async sign(pdfBuffer) {
    return signDetachedCms(pdfBuffer, this.thumbprint, this.opts);
  }
}

/**
 * @param {Buffer} pdf — tệp PDF chưa ký
 * @param {string} thumbprint — chứng thư trên token
 * @param {object} info — { reason, name, location, contactInfo, sha1 }
 * @returns {Promise<Buffer>} PDF đã ký số
 */
export async function signPdfWithToken(pdf, thumbprint, info = {}) {
  const withPlaceholder = plainAddPlaceholder({
    pdfBuffer: pdf,
    reason: info.reason || 'Phê duyệt phiếu điều xe',
    contactInfo: info.contactInfo || '',
    name: info.name || '',
    location: info.location || 'Thanh Hoá',
    signatureLength: SIGNATURE_LENGTH,
  });
  return new SignPdf().sign(withPlaceholder, new WindowsTokenSigner(thumbprint, { sha1: !!info.sha1 }));
}
