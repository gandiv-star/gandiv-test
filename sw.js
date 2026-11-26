// ગાંડિવ એકેડેમી V2 — ઝડપ અને offline માટે. કોડ બદલાય ત્યારે VERSION વધારવું.
const VERSION = "gv2-28";
const FILES = ["./", "index.html", "app.css", "config.js", "fb.js", "core.js", "auth.js", "admin.js", "students.js", "fees.js", "att.js", "home.js", "diary.js", "results.js", "toppers.js", "notify.js", "logo.png", "icon-192.png", "manifest.json"];
const SDK = ["firebase-app.js", "firebase-auth.js", "firebase-firestore.js"].map(f => "https://www.gstatic.com/firebasejs/10.12.2/" + f);

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(async c => {
    // GitHub નું 10 મિનિટનું cache ટાળો: નવી ફાઇલો સીધી લાવો
    await c.addAll(FILES.map(f => new Request(f, { cache: "reload" })));
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

// ---------- ફોન નોટિફિકેશન (Apps Script → Firebase Cloud Messaging → અહીં) ----------
self.addEventListener("push", e => {
  let p = {}; try { p = e.data ? e.data.json() : {}; } catch { p = { data: { title: "ગાંડિવ એકેડેમી", body: e.data?.text() || "" } }; }
  const n = p.data || p.notification || p;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const vis = list.find(c => c.visibilityState === "visible");
    if (vis) { vis.postMessage({ gvPush: n }); return; } // એપ ખુલ્લી છે: એપમાં જ મધુર ટ્યુન સાથે બતાવો
    await self.registration.showNotification(n.title || "ગાંડિવ એકેડેમી", {
      body: n.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: n.tag || undefined, renotify: !!n.tag,
      vibrate: [120, 60, 120, 60, 200], data: { link: n.link || "#/notices" }, lang: "gu"
    });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const link = e.notification.data?.link || "#/notices", url = new URL("./" + link, self.registration.scope).href;
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const c = list.find(x => x.url.startsWith(self.registration.scope));
    if (c) { await c.focus(); c.navigate ? c.navigate(url).catch(() => {}) : null; return; }
    await self.clients.openWindow(url);
  })());
});
