/* CHOFU LIT — Service Worker
 * 役割: オフライン表示用のキャッシュ。
 * 更新時は CACHE_VERSION を上げること（古いキャッシュは activate で自動削除）。
 */
const CACHE_VERSION = 'chofulit-v1';

// 最低限これだけあればオフラインでもトップが開く
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      // 1つでも失敗すると addAll ごと落ちるので個別に入れる
      .then((cache) => Promise.all(
        PRECACHE.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 他オリジン(Stripe・Google Fonts・埋め込み等)はそのまま通す
  if (url.origin !== self.location.origin) return;

  // ページ遷移: ネットワーク優先（常に最新を出す）→ 落ちてたらキャッシュ
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/')))
    );
    return;
  }

  // それ以外の同一オリジン資産: キャッシュ即返し＋裏で更新
  event.respondWith(
    caches.match(req).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
