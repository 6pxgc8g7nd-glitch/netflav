/* Netflav 離線快取
   1) 頁面：網路優先（更新會立刻生效），沒網路時改用快取
   2) 封面圖：存起來的封面直接讀手機，不用等網路（沒網路也能看）；也可從設定「預先下載封面」 */
const CACHE = 'netflav-v3';
const IMG_CACHE = 'netflav-img-v1';
const MAX_IMG = 500; // 封面快取最多張數，超過會刪掉最舊的

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html', './styles.css', './app.js'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimImgCache(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_IMG; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin !== location.origin) {
    // 外部圖片（封面）：存起來的直接用（不用等網路），沒有才去抓並存起來
    if (req.destination === 'image' && !url.searchParams.has('_chk')) { // _chk = 「檢查失效封面」的探測請求，不走快取也不存進快取
      e.respondWith(
        caches.match(req, { cacheName: IMG_CACHE }).then(hit => hit || fetch(req).then(res => {
          if (res.ok || res.type === 'opaque') {
            const copy = res.clone();
            caches.open(IMG_CACHE).then(c => c.put(req, copy).then(() => trimImgCache(c))).catch(() => {});
          }
          return res;
        })).catch(() => Response.error())
      );
    }
    return; // 其他外部請求（GitHub API 等）不處理
  }

  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});

/* 預先下載所有封面 */
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'precache') return;
  const urls = e.data.urls || [];
  e.waitUntil((async () => {
    const cache = await caches.open(IMG_CACHE);
    let ok = 0, i = 0;
    async function worker() {
      while (i < urls.length) {
        const u = urls[i++];
        try {
          if (await cache.match(u)) { ok++; continue; }
          const res = await fetch(new Request(u, { mode: 'no-cors', referrerPolicy: 'no-referrer' }));
          if (res.ok || res.type === 'opaque') { await cache.put(u, res); ok++; }
        } catch (err) {}
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    await trimImgCache(cache);
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'precache-done', ok, total: urls.length }));
  })());
});
