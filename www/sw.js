/**
 * Gisa — Service Worker (Offline-First Cache Engine)
 */

const CACHE_NAME = 'gisa-app-v68';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css?v=68',
  './js/storage.js?v=68',
  './js/supabase_client.js?v=68',
  './js/similarity.js?v=68',
  './js/jszip.min.js',
  './js/parsers.js?v=68',
  './js/ai_assistant.js?v=68',
  './js/ui.js?v=68',
  './js/app.js?v=68',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install Event: pre-cache all app core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('Alguns recursos não puderam ser pré-cacheados:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: purge stale caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event: Network-First with Cache Fallback (Always Fresh on Network)
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Ignore non-GET or external API requests
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;
  if (req.url.includes('supabase.co')) return;

  event.respondWith(
    fetch(req)
      .then((networkResp) => {
        if (networkResp && networkResp.status === 200 && networkResp.type === 'basic') {
          const respToCache = networkResp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, respToCache));
        }
        return networkResp;
      })
      .catch(() => {
        return caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});
