// In trang với hướng giấy chỉ định (dọc cho lịch tuần kiểu công văn,
// ngang cho bảng điều xe). Chèn @page tạm thời rồi gỡ sau khi in.
export function printPage(orientation = 'portrait') {
  const s = document.createElement('style');
  s.textContent = `@page { size: A4 ${orientation}; margin: 10mm 8mm; }`;
  document.head.appendChild(s);
  const cleanup = () => { s.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
