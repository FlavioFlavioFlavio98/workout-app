'use strict';

const CACHE_NAME = 'workout-app-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './session.html',
  './history.html',
  './stats.html',
  './exercises.html',
  './manifest.json',
  './css/style.css',
  './js/firebase-config.js',
  './js/dashboard.js',
  './js/session.js',
  './js/history.js',
  './js/stats.js',
  './js/exercises.js',
  './js/pwa.js',
  './icons/icon.svg',
  './icons/icon-maskable.svg'
];

// Install: cache all local static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for local assets, network-only for external (Firebase/CDN)
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Pass through external requests (Firebase, CDN, Storage)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      // Serve from cache, revalidate in background
      const networkFetch = fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => null);

      return cached || networkFetch;
    })
  );
});
