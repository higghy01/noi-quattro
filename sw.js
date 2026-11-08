// NDSZ - service worker: app usabile offline + notifiche (Firebase Cloud Messaging).
// A ogni pubblicazione alzare VERSIONE, altrimenti i telefoni restano sulla copia vecchia.
const VERSIONE = 'noi4-v91';
// Le librerie esterne hanno la versione nell'indirizzo: stanno in una copia a parte che NON si cancella a ogni
// aggiornamento, così l'app si apre anche senza rete subito dopo una nuova versione.
const CACHE_LIB = 'noi4-librerie';
const FB = 'https://www.gstatic.com/firebasejs/10.14.1/';
const LIB_FILE = ['app', 'auth', 'firestore', 'messaging', 'storage'].map(n => FB + 'firebase-' + n + '-compat.js')
  .concat(['https://cdn.jsdelivr.net/npm/ical.js@1.5.0/build/ical.min.js']);
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

self.addEventListener('install', e => {
  e.waitUntil(Promise.all([
    caches.open(VERSIONE).then(c => c.addAll(FILE)),
    // Le librerie: si scaricano solo quelle che mancano (se una non arriva, l'aggiornamento va avanti lo stesso).
    caches.open(CACHE_LIB).then(c => Promise.all(LIB_FILE.map(u => c.match(u).then(r => r || c.add(u).catch(() => {})))))
  ]));
  self.skipWaiting();
});
// Si cancellano solo le copie di questa app (noi4-…): sullo stesso sito c'è anche l'app LEGO con la sua.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => /^noi4-/.test(n) && n !== VERSIONE && n !== CACHE_LIB).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
// Prima la rete (per avere sempre l'ultima versione); se la rete non risponde entro 3 secondi e c'è la copia,
// si usa la copia (con poco segnale l'app non resta bianca). Nella copia vanno solo le risposte buone (mai un errore).
// Dopo una rete lenta, per mezzo minuto la copia si usa subito, senza riaspettare 3 secondi per ogni file.
let lentaFino = 0;
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Librerie e caratteri esterni (hanno la versione nell'indirizzo): prima la copia, così l'app si apre subito anche senza rete.
  if (LIBRERIE.includes(u.hostname)) {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(n => { const c = n.clone(); caches.open(CACHE_LIB).then(x => x.put(e.request, c)); return n; })));
    return;
  }
  if (u.origin !== location.origin) return;
  const rete = fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(VERSIONE).then(x => x.put(e.request, c)); } return r; });
  rete.catch(() => {}); // se si usa la copia, un errore della rete arrivato dopo non deve finire in console
  e.respondWith(caches.match(e.request).then(copia => {
    if (!copia) return rete.catch(() => caches.match('index.html'));
    if (Date.now() < lentaFino) return copia; // la rete è appena stata lenta: subito la copia (la rete intanto la aggiorna)
    let arrivata = false;
    return Promise.race([
      rete.then(r => { arrivata = true; return r.ok ? r : copia; }).catch(() => { arrivata = true; return copia; }),
      new Promise(ok => setTimeout(() => { if (!arrivata) lentaFino = Date.now() + 30000; ok(copia); }, 3000))
    ]);
  }));
});
// Toccando la notifica si apre (o si porta davanti) l'app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.length ? l[0].focus() : clients.openWindow('./')));
});
