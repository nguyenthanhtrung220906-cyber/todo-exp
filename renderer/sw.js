const CACHE_NAME = 'todo-exp-v1';
const ASSETS = [
  './index.html',
  './style.css',
  './app.js',
  '../assets/icon.png'
];

// Cài đặt và lưu cache
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

// Chạy app từ cache khi offline
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});