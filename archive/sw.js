/* =====================================================================
   Seat'Em – Service Worker (Etappe 5.4)
   Nur für GitHub Pages: Liegt neben index.html. Die Web-App vom Home-Bildschirm startet damit auch ohne
   Internet. index.html funktioniert ohne diese Datei genauso (z. B. per file://).

   - Beim Einrichten wird index.html (und diese Datei) im Zwischenspeicher abgelegt.
   - Aufrufe der Seite (./ oder ./index.html) kommen aus dem Zwischenspeicher – schnell und offline.
   - Die Seite bittet beim Start um einen Abgleich ({ type: 'seatem-check' }): index.html wird frisch vom
     Server geladen und mit dem Zwischenspeicher verglichen. Ist sie anders, wird die neue Fassung abgelegt
     und die Seite erfährt es ({ type: 'seatem-update' }) – sie zeigt „Neue Version verfügbar“ mit „Neu laden“.
     Neu geladen wird nie ungefragt.
   - Alle anderen Anfragen (z. B. der Lizenzlink, Test5.html) laufen am Service Worker vorbei.

   Für eine neue Programmversion genügt es, index.html hochzuladen. CACHE nur ändern, wenn sich diese
   Datei ändert (dann werden alte Zwischenspeicher gelöscht).

   Version V1.2 10/2026 – vibe coded by Verena Lohmüller & Claude
   Lizenz: CC BY-NC-SA 4.0, https://creativecommons.org/licenses/by-nc-sa/4.0/deed.de
   ===================================================================== */
'use strict';

const CACHE = 'seatem-sw-1';                                   // Versionskennung des Zwischenspeichers
const SCOPE = self.registration.scope;                         // z. B. https://name.github.io/seatem/
const INDEX = new URL('index.html', SCOPE).href;
const SELF = self.location.href;

/* ./ und ./index.html (auch mit ?…) sind die Seite selbst */
function isAppPage(url) {
  const u = new URL(url);
  u.search = ''; u.hash = '';
  return u.href === SCOPE || u.href === INDEX;
}
/* frisch vom Server (am Browser-Cache vorbei geprüft) */
async function fetchFresh(url) {
  const r = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r;
}
function htmlResponse(text) {
  return new Response(text, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const text = await (await fetchFresh(INDEX)).text();
    await cache.put(INDEX, htmlResponse(text));
    try { await cache.put(SELF, await fetchFresh(SELF)); } catch (e) { /* nicht nötig für den Start */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('seatem-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate' || !isAppPage(req.url)) return;   // alles andere: wie ohne Service Worker
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(INDEX);
    if (hit) return hit;
    // noch nichts abgelegt: aus dem Netz und für das nächste Mal merken
    const r = await fetch(req);
    if (r.ok && r.type === 'basic') {
      try { await cache.put(INDEX, htmlResponse(await r.clone().text())); } catch (e) { /* egal */ }
    }
    return r;
  })());
});

self.addEventListener('message', event => {
  const d = event.data;
  if (!d || d.type !== 'seatem-check') return;
  const client = event.source;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      const fresh = await (await fetchFresh(INDEX)).text();
      const old = await cache.match(INDEX);
      const oldText = old ? await old.text() : null;
      if (oldText === fresh) return;
      await cache.put(INDEX, htmlResponse(fresh));
      if (oldText !== null && client) client.postMessage({ type: 'seatem-update' });
    } catch (e) { /* offline oder Server nicht erreichbar: beim nächsten Start wieder */ }
  })());
});
