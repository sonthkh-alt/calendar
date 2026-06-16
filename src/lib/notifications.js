// Thông báo thay đổi lịch cho người phê duyệt.
// - Huy hiệu "chưa đọc" trong app: tính theo mốc "đã xem" lưu localStorage (mỗi user).
// - Thông báo HỆ ĐIỀU HÀNH (icon ngoài màn hình PC/điện thoại): dùng Notification API,
//   ưu tiên service worker (registration.showNotification) để hiện cả khi tab ở chế độ nền.
//   LƯU Ý: chỉ hoạt động khi TRÌNH DUYỆT CÒN CHẠY (kể cả tab nền). Thông báo khi đã
//   đóng hẳn trình duyệt cần Web Push + máy chủ đẩy riêng (chưa triển khai).

const seenKey = (id) => `notif_seen_${id || 'anon'}`;

// Mốc thời gian đã xem thông báo gần nhất (ISO). '' nếu chưa từng xem.
export function getNotifSeen(id) {
  try { return localStorage.getItem(seenKey(id)) || ''; } catch { return ''; }
}
export function setNotifSeen(id, iso) {
  try { localStorage.setItem(seenKey(id), iso); } catch { /* bỏ qua */ }
}

export function notifSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}
export function notifPermission() {
  return notifSupported() ? Notification.permission : 'denied';
}
export async function requestNotifyPermission() {
  if (!notifSupported()) return 'denied';
  try { return await Notification.requestPermission(); } catch { return Notification.permission; }
}

// Hiện 1 thông báo hệ điều hành. Ưu tiên qua service worker (ổn định trên di động),
// fallback sang new Notification() nếu không có SW.
export async function showOsNotification(title, opts = {}) {
  if (notifPermission() !== 'granted') return;
  const options = { icon: '/icon-192-v2.png', badge: '/icon-192-v2.png', ...opts };
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) { reg.showNotification(title, options); return; }
    }
  } catch { /* rơi xuống dùng Notification trực tiếp */ }
  try { new Notification(title, options); } catch { /* bỏ qua */ }
}
