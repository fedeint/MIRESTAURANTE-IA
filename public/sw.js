const CACHE_NAME = 'mirestconia-v3';
const STATIC_ASSETS = [
  '/vendor/bootstrap/css/bootstrap.min.css',
  '/vendor/bootstrap/js/bootstrap.bundle.min.js',
  '/vendor/jquery/jquery.min.js',
  '/vendor/sweetalert2/sweetalert2.all.min.js',
  '/vendor/bootstrap-icons/bootstrap-icons.css',
  '/css/theme.css',
  '/js/offline-ui.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Vendor/static assets: Cache First
  if (url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/static/') ||
      url.pathname.startsWith('/css/') || url.pathname.match(/\.(js|css|woff2?|png|jpg|svg|ico)$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML pages and API: Network First with cache fallback
  if (event.request.headers.get('accept')?.includes('text/html') ||
      url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok && event.request.headers.get('accept')?.includes('text/html')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then(cached => {
            return cached || caches.match('/offline');
          });
        })
    );
    return;
  }
});

// Sync: queue offline transactions
self.addEventListener('sync', event => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(syncOfflineTransactions());
  }
});

async function syncOfflineTransactions() {
  // TODO: Read from IndexedDB and POST to server
  console.log('Syncing offline transactions...');
}
