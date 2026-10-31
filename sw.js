// Noi quattro - service worker: app usabile offline + notifiche (Firebase Cloud Messaging).
// A ogni pubblicazione alzare VERSIONE, altrimenti i telefoni restano sulla copia vecchia.
const VERSIONE = 'noi4-v16';
const LIBRERIE = ['www.gstatic.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const FILE = ['./', 'index.html', 'stile.css', 'morphdom.js', 'app.js', 'dati.js', 'config.js', 'manifest.json', 'icona-180.png', 'icona-512.png'];

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
              'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js',
              'config.js');
// Basta inizializzare la messaggistica: le notifiche inviate con il campo "notification" le mostra Firebase da solo.
if (self.CONFIG && self.CONFIG.firebase && self.CONFIG.firebase.apiKey) {
  firebase.initializeApp(self.CONFIG.firebase);
  firebase.messaging();
}

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(FILE))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSIONE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
// Prima la rete (per avere sempre l'ultima versione), la copia solo se manca internet.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Librerie e caratteri esterni (hanno la versione nell'indirizzo): prima la copia, così l'app si apre subito anche senza rete.
  if (LIBRERIE.includes(u.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => { const c = n.clone(); caches.open(VERSIONE).then(x => x.put(e.request, c)); return n; })));
    return;
  }
  if (u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSIONE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
// Toccando la notifica si apre (o si porta davanti) l'app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.length ? l[0].focus() : clients.openWindow('./')));
});
