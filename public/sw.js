/* Service Worker — Lịch công tác tuần (PWA)
 * - Cài lên màn hình điện thoại, mở như app.
 * - Điều hướng trang: network-first, mất mạng -> trả index đã lưu (vỏ app offline).
 * - Tài nguyên tĩnh (đã gắn hash): cache-first.
 * - Dữ liệu lịch (Supabase REST GET): network-first, mất mạng -> bản đã lưu gần nhất
 *   (xem lịch offline). Không đụng tới ghi dữ liệu (POST/PATCH/DELETE) và realtime (WebSocket).
 */
const CACHE = 'lichcongtac-v1';
const APP_SHELL = ['/', '/index.html', '/quoc-huy.svg', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // 1) Điều hướng trang -> network-first, fallback vỏ app
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  // 2) Tài nguyên tĩnh cùng origin (assets có hash) -> cache-first
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      }))
    );
    return;
  }

  // 3) Dữ liệu lịch từ Supabase (REST GET) -> network-first, fallback bản đã lưu
  if (url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/')) {
    e.respondWith(
      fetch(request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(request, copy));
        return res;
      }).catch(() => caches.match(request))
    );
  }
});
