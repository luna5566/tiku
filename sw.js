// Service Worker：静态资源缓存优先，题库数据网络优先（离线时回退缓存）
// 更新版本号即可让老客户端在下一次访问时替换缓存；发布新版 js/css/页面时务必递增
const VERSION = "tiku-v9";
const CORE = [
  "./", "./index.html", "./industry.html", "./quiz.html", "./exam.html", "./wrong.html",
  "./css/style.css", "./js/app.js", "./js/quiz.js", "./js/exam.js", "./js/wrong.js", "./js/stats.js", "./js/sync.js", "./js/track.js",
  "./manifest.webmanifest", "./data/manifest.json", "./icons/icon-192.png", "./icons/icon-512.png",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;

  // 题库 JSON 与工具产物（审计报告等）：网络优先，失败回退缓存（保证更新及时、离线可用）
  if ((url.pathname.includes("/data/") || url.pathname.includes("/tools/")) && url.pathname.endsWith(".json")) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 其余静态资源：缓存优先
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
      return res;
    }))
  );
});
