// ગાંડિવ એકેડેમી V2 — ઝડપ અને offline માટે. કોડ બદલાય ત્યારે VERSION વધારવું.
const VERSION = "gv2-2";
const FILES = ["./", "index.html", "app.css", "config.js", "fb.js", "core.js", "auth.js", "admin.js", "logo.png", "icon-192.png", "manifest.json"];
const SDK = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map(f => "https://www.gstatic.com/firebasejs/10.12.2/" + f);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    await c.addAll(FILES);
    await Promise.all(SDK.map(u => c.add(new Request(u, { mode: "cors" })).catch(() => {})));
  }).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET") return;
  // Firebase કોડ અને ફોન્ટ ક્યારેય બદલાતા નથી: ફોનમાંથી તરત (નેટની રાહ નહીં)
  if (u.hostname === "www.gstatic.com" || u.hostname === "fonts.gstatic.com" || u.hostname === "fonts.googleapis.com") {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === "opaque") { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return r;
    })));
    return;
  }
  if (u.origin !== location.origin) return;
  // આપણી ફાઇલો: ફોનમાંથી તરત બતાવો, અને પાછળથી નવું વર્ઝન લાવી રાખો
  e.respondWith(caches.open(VERSION).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || c.match("index.html");
  }));
});
