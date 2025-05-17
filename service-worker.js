const CACHE_NAME = 'mtss-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/firebaseConfig.js',
  '/icon-192x192.png',
  '/icon-512x512.png',
  // Add other assets you want cached
];

// Install event: cache files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
});

// Fetch event: serve cached files if offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request)
    )
  );
});
