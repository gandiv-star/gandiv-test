// ગાંડિવ એકેડેમી V2 — offline માટે. કોડ બદલાય ત્યારે VERSION વધારવું.
const VERSION = "gv2-1";
const FILES = ["./", "index.html", "app.css", "config.js", "fb.js", "core.js", "auth.js", "admin.js", "logo.png", "icon-192.png", "manifest.json"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// પહેલાં નેટમાંથી (નવું વર્ઝન), નેટ ન હોય તો ફોનમાં સચવાયેલું
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
