// Service worker: ให้เปิดใช้ออฟไลน์ได้ (network-first: มีเน็ตใช้ไฟล์ล่าสุดเสมอ ไม่มีเน็ตใช้สำเนาที่เก็บไว้)
const CACHE = 'linkmap-2026-10-11.1922';
const ASSETS = ['./', 'index.html', 'styles.css', 'manifest.webmanifest',
  'src/main.js', 'src/graph.js', 'src/layout.js', 'src/analysis.js', 'src/csv.js', 'src/render.js', 'src/ui.js',
  'src/export.js', 'src/types.js', 'src/sample.js', 'src/outline.js', 'src/pdf.js', 'assets/icon-192.png', 'assets/icon-512.png'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS).catch(() => {})).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
