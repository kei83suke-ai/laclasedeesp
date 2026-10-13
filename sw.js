const CACHE_NAME = 'spanish-classroom-2026-10-13-c9105da8b217';
const APP_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/data.js",
  "./js/dictionary/nouns-001.js",
  "./js/dictionary/nouns-002.js",
  "./js/dictionary/nouns-003.js",
  "./js/dictionary/nouns-004.js",
  "./js/dictionary/nouns-005.js",
  "./js/dictionary/nouns-006.js",
  "./js/dictionary/nouns-007.js",
  "./js/dictionary/nouns-008.js",
  "./js/dictionary/nouns-009.js",
  "./js/dictionary/nouns-010.js",
  "./js/dictionary/nouns-011.js",
  "./js/dictionary/nouns-012.js",
  "./js/dictionary/nouns-013.js",
  "./js/dictionary/nouns-014.js",
  "./js/dictionary/nouns-015.js",
  "./js/dictionary/nouns-016.js",
  "./js/dictionary/nouns-017.js",
  "./js/dictionary/nouns-018.js",
  "./js/dictionary/nouns-019.js",
  "./js/dictionary/nouns-020.js",
  "./js/dictionary/nouns-021.js",
  "./js/dictionary/verbs-001.js",
  "./js/dictionary/verbs-002.js",
  "./js/dictionary/verbs-003.js",
  "./js/dictionary/adjectives-001.js",
  "./js/dictionary/adjectives-002.js",
  "./js/dictionary/adjectives-003.js",
  "./js/dictionary/adjectives-004.js",
  "./js/dictionary/adjectives-005.js",
  "./js/dictionary/adverbs-001.js",
  "./js/dictionary/adverbs-002.js",
  "./js/dictionary/prepositions-001.js",
  "./js/learning.js",
  "./js/app.js"
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('spanish-classroom-') && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match('./index.html', { ignoreSearch: true })))
  );
});
