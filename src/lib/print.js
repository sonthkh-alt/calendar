// In trang với hướng giấy chỉ định (dọc cho lịch tuần kiểu công văn,
// ngang cho bảng điều xe). Chèn @page tạm thời rồi gỡ sau khi in.
export function printPage(orientation = 'portrait') {
  const s = document.createElement('style');
  s.textContent = `@page { size: A4 ${orientation}; margin: 20mm 12mm; }`;
  document.head.appendChild(s);
  const cleanup = () => { s.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

// "Xuất PDF": dùng chính hộp In của trình duyệt (đã render bản công văn chuẩn,
// tiếng Việt đẹp) — người dùng chọn đích "Lưu thành PDF / Save as PDF".
// Đặt document.title = tên file để hộp lưu gợi ý sẵn tên PDF, xong khôi phục.
export function printForPdf(filename, orientation = 'portrait') {
  const prevTitle = document.title;
  if (filename) document.title = filename;
  const s = document.createElement('style');
  s.textContent = `@page { size: A4 ${orientation}; margin: 20mm 12mm; }`;
  document.head.appendChild(s);
  const cleanup = () => {
    s.remove();
    document.title = prevTitle;
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
