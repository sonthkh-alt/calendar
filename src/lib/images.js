// Xử lý ảnh phía trình duyệt (cần DOM: Image + canvas).
// Nén ảnh chụp đồng hồ (điện thoại thường 3–8 MB) về cạnh dài ≤1600px, JPEG ~0,82 —
// vẫn đọc rõ số, nhẹ để gửi qua 4G. Ảnh không giải mã được -> gửi nguyên tệp.
export function compressImage(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      cv.toBlob((b) => resolve(b || file), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
