/* PhenoType AI Service Worker */

const CACHE_VERSION = 'v3';
const CORE_CACHE = `phenotype-core-${CACHE_VERSION}`;
const RUNTIME_CACHE = `phenotype-runtime-${CACHE_VERSION}`;

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/app/index.html',
  '/app/styles.css',
  '/app/app.js',
  '/app/locales.js',
  '/app/morphology.js',
  '/app/morphology-profiles.json',
  '/app/phenotype-matcher.js',
  '/app/phenotype-worker.js',
  '/face-api.min.js',
  '/list.json',
  '/icon.png',
  '/manifest.webmanifest',
  '/404.html',
  '/models/tiny_face_detector_model-weights_manifest.json',
  '/models/tiny_face_detector_model-shard1',
  '/models/ssd_mobilenetv1_model-weights_manifest.json',
  '/models/ssd_mobilenetv1_model-shard1',
  '/models/ssd_mobilenetv1_model-shard2',
  '/models/mtcnn_model-weights_manifest.json',
  '/models/mtcnn_model-shard1',
  '/models/face_recognition_model-weights_manifest.json',
  '/models/face_recognition_model-shard1',
  '/models/face_recognition_model-shard2',
  '/models/face_landmark_68_tiny_model-weights_manifest.json',
  '/models/face_landmark_68_tiny_model-shard1',
  '/models/face_landmark_68_model-weights_manifest.json',
  '/models/face_landmark_68_model-shard1',
  '/models/face_expression_model-weights_manifest.json',
  '/models/face_expression_model-shard1',
  '/models/age_gender_model-weights_manifest.json',
  '/models/age_gender_model-shard1'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    const results = await Promise.allSettled(
      CORE_ASSETS.map(async (asset) => {
        const response = await fetch(asset, { cache: 'no-cache' });
        if (!response.ok) throw new Error(`${asset} -> HTTP ${response.status}`);
        await cache.put(asset, response.clone());
      })
    );

    const failed = results
      .map((result, index) => ({ result, asset: CORE_ASSETS[index] }))
      .filter(({ result }) => result.status === 'rejected');

    if (failed.length) {
      console.warn('[SW] Some core assets failed to cache during install:', failed);
    }

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CORE_CACHE && key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate' || req.destination === 'document') {
      event.respondWith(networkFirst(req));
      return;
    }
    event.respondWith(cacheFirst(req));
    return;
  }

  if (url.origin === 'https://cdn.jsdelivr.net' || url.origin === 'https://storage.googleapis.com') {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;

  const fresh = await fetch(req);
  if (fresh.ok || fresh.type === 'opaque') {
    cache.put(req, fresh.clone());
  }
  return fresh;
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh.ok || fresh.type === 'opaque') {
      cache.put(req, fresh.clone());
    }
    return fresh;
  } catch (err) {
    const cached = await cache.match(req);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((fresh) => {
    if (fresh.ok || fresh.type === 'opaque') {
      cache.put(req, fresh.clone());
    }
    return fresh;
  });
  return cached || fetchPromise;
}
