// Strato dei dati: lo stesso modo di leggere e scrivere sia con Firebase (app vera)
// sia in "modalità prova" (tutto sul telefono, dati di esempio). app.js usa solo DATI.
(function () {
  const cfg = (window.CONFIG && window.CONFIG.firebase) || {};
  const vero = !!(cfg.apiKey && cfg.projectId && window.firebase);

  /* ---------- Modalità prova ---------- */
  function prova() {
    const KEY = 'noi4-prova-v2';
    const subs = [];
    let db;
    const iso = (n) => { const x = new Date(); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + n); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
    const uid = () => Math.random().toString(36).slice(2, 11);
    function esempio() {
      const now = Date.now();
      const ev = (t, d, h, who, n, extra) => Object.assign({ t, d: iso(d), h, who, n: n || '', fonte: 'app', creatoDa: who[0], creato: now }, extra || {});
      const tutti = ['p1', 'p2', 'p3', 'p4'];
      const o = { persone: {}, impegni: {}, note: {}, spesa: {}, cena: {} };
      [['p1', 'Marco', 'blu'], ['p2', 'Giulia', 'rosa'], ['p3', 'Elena', 'ambra'], ['p4', 'Paolo', 'verde']]
        .forEach(([id, nome, colore], i) => o.persone[id] = { nome, colore, ordine: i, notifiche: { promemoria: true, nuovi: true, riepilogo: true, cena: true, note: true } });
      [ev('Turno al lavoro', 0, '06:30', ['p1'], 'Fino alle 11:30', { fonte: 'calendario:p1' }),
       ev('Dentista', 0, '15:00', ['p3', 'p2'], 'Studio in centro'),
       ev('Cena tutti insieme', 0, '20:00', tutti, 'Pizza fatta in casa'),
       ev('Calcetto', 1, '19:00', ['p4'], '', { ripeti: 'settimanale' }),
       ev('Gran Premio in TV', 1, '21:00', ['p1', 'p4'], ''),
       ev('Spesa grande', 2, '10:00', ['p2'], 'Chi vuole qualcosa lo scrive in Spesa'),
       ev('Compleanno della nonna', 4, '', tutti, '', { ripeti: 'annuale' }),
       ev('Revisione auto', 5, '09:00', ['p4'], 'Portare il libretto')].forEach(e => o.impegni[uid()] = e);
      [['p2', 'Domenica pranzo dalla nonna, ci siamo tutti?', true], ['p4', 'Il wifi nuovo ha la stessa password di prima.', false],
       ['p3', 'Qualcuno ha visto le mie cuffie bianche?', false], ['p1', 'Ho pagato io la bolletta della luce.', false]]
        .forEach(([by, x, pin], i) => o.note[uid()] = { by, x, pin, creato: now - i * 1000 });
      [['Latte', 'p2', false], ['Pane', 'p4', false], ['Mozzarella per la pizza', 'p1', false], ['Mele', 'p3', true], ['Detersivo piatti', 'p2', false]]
        .forEach(([x, by, done], i) => o.spesa[uid()] = { x, by, done, creato: now - i * 1000 });
      o.cena[iso(0)] = { p1: 'si', p2: 'si', p4: 'no' };
      regaliEsempio(o);
      o.me = 'p1';
      return o;
    }
    function regaliEsempio(o) {
      const now = Date.now();
      o.regali = {}; o.sorprese = {};
      const r = {};
      [['p1', 'Cuffie senza fili', ''], ['p1', 'Libro sulla Formula 1', ''], ['p2', 'Pianta per il balcone', 'Una di quelle grandi'],
       ['p3', 'Felpa nera taglia S', 'https://www.example.com'], ['p3', 'Biglietti per un concerto', ''], ['p4', 'Guanti da moto', 'Taglia L']]
        .forEach(([per, x, n], i) => { const id = uid(); r[per + i] = id; o.regali[id] = { per, x, n, creato: now - i * 1000 }; });
      o.sorprese.p3 = { presi: { [r.p33]: 'p2' }, idee: { [uid()]: { x: 'Cornice con la foto delle vacanze', by: 'p4', creato: now } } };
      o.sorprese.p2 = { presi: {}, idee: { [uid()]: { x: 'Cena al ristorante per il compleanno', by: 'p1', creato: now } } };
    }
    // Foto finte per la prova: disegni a colori (nella vera app sono le vostre foto).
    function finta(c1, c2, em, w, h) {
      w = w || 1200; h = h || 900;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w * .78}" cy="${h * .25}" r="${h * .12}" fill="#fff" opacity=".35"/><text x="50%" y="58%" font-size="${h * .3}" text-anchor="middle" dominant-baseline="middle">${em}</text></svg>`;
      return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }
    function viaggiEsempio(o) {
      o.viaggi = {}; o.foto = {};
      const giorno = (s) => new Date(s + 'T12:00:00').getTime();
      [['Mare in Puglia', 'Polignano a Mare', '2026-08-08', '2026-08-16', ['p1', 'p2', 'p3', 'p4'], [['#2D9CDB', '#7FDBDA', '🌊'], ['#F2994A', '#F2C94C', '🌅'], ['#56CCF2', '#2F80ED', '🏖️'], ['#27AE60', '#6FCF97', '🫒'], ['#EB5757', '#F2994A', '🍉'], ['#9B51E0', '#56CCF2', '🌙']]],
       ['Neve a Livigno', 'Livigno', '2026-01-03', '2026-01-06', ['p1', 'p3', 'p4'], [['#A0C4FF', '#E0F0FF', '⛷️'], ['#6C8EBF', '#BDD5F2', '🏔️'], ['#D4A373', '#FAEDCD', '☕'], ['#5E60CE', '#A0C4FF', '❄️']]],
       ['Weekend a Parigi', 'Parigi', '2025-04-25', '2025-04-28', ['p2', 'p3'], [['#E5989B', '#FFCDB2', '🗼'], ['#B5838D', '#FFB4A2', '🥐'], ['#6D6875', '#E5989B', '🎨']]]]
        .forEach(([t, dove, da, a, who, foto], k) => {
          const v = uid(); o.viaggi[v] = { t, dove, da, a, who, creatoDa: who[0], creato: Date.now() - k * 1000 };
          foto.forEach(([c1, c2, em], i) => {
            const f = uid(), url = finta(c1, c2, em, i % 3 === 1 ? 900 : 1200, i % 3 === 1 ? 1200 : 900);
            o.foto[f] = { v, by: who[i % who.length], url, prev: url, quando: giorno(da) + i * 3600e3 * 7, creato: Date.now(), cuori: i === 0 ? { p2: true, p3: true } : {} };
            if (i === 0) o.viaggi[v].cop = f;
          });
        });
    }
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!db || !db.persone) db = esempio();
    if (!db.regali) regaliEsempio(db);
    if (!db.viaggi) viaggiEsempio(db);
    // Come il "merge" di Firebase: le mappe dentro si uniscono invece di sostituirsi.
    const unisci = (a, b) => { const o = Object.assign({}, a); for (const k in b) o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && o[k] && typeof o[k] === 'object' ? unisci(o[k], b[k]) : b[k]; return o; };
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} subs.forEach(s => s()); };
    const list = (col) => Object.entries(db[col] || {}).map(([id, v]) => Object.assign({ id }, v));
    return {
      modo: 'prova',
      avvia(cb) { this._cb = cb; setTimeout(() => cb(db.me), 0); },
      cambiaPersona(id) { db.me = id; save(); this._cb(id); },
      ricomincia() { db = esempio(); save(); this._cb(db.me); },
      login() {}, reset() {}, esci() {},
      ascolta(col, cb) { const s = () => cb(list(col)); subs.push(s); s(); },
      ascoltaDoc(col, id, cb) { const s = () => cb((db[col] || {})[id] || {}); subs.push(s); s(); return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); }; },
      async aggiungi(col, data) { const id = uid(); (db[col] = db[col] || {})[id] = data; save(); return id; },
      async aggiorna(col, id, data) { db[col][id] = Object.assign({}, db[col][id] || {}, data); save(); },
      async imposta(col, id, data) { (db[col] = db[col] || {})[id] = unisci(db[col][id] || {}, data); save(); },
      async elimina(col, id) { delete db[col][id]; save(); },
      async molti(col, arr) { arr.forEach(d => (db[col] = db[col] || {})[uid()] = d); save(); },
      async attivaNotifiche() { return 'Nella modalità prova le notifiche non partono: funzioneranno nell\'app vera.'; },
      // Prova: la foto resta sul telefono come immagine piccola (lo spazio qui è poco).
      async carica(path, blob) {
        return await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok({ url: r.result, path }); r.onerror = ko; r.readAsDataURL(blob); });
      },
      async eliminaFile() {},
      fotoPronte: () => true
    };
  }

  /* ---------- Firebase (app vera) ---------- */
  function firebaseVero() {
    firebase.initializeApp(cfg);
    const auth = firebase.auth();
    const fs = firebase.firestore();
    fs.enablePersistence({ synchronizeTabs: true }).catch(() => {}); // funziona anche senza internet
    let persona = null;
    return {
      modo: 'firebase',
      avvia(cb) {
        auth.onAuthStateChanged(async (u) => {
          if (!u) { persona = null; return cb(null); }
          try {
            const m = await fs.collection('membri').doc(u.email.toLowerCase()).get();
            if (!m.exists) { await auth.signOut(); return cb(null, 'Questa email non fa parte della famiglia.'); }
            persona = m.data().persona;
            // La "persona" dentro l'accesso (serve alle foto) arriva con un accesso fresco.
            u.getIdTokenResult().then(t => { if (t.claims.persona !== persona) u.getIdToken(true).catch(() => {}); }).catch(() => {});
            cb(persona);
          } catch (e) { cb(null, 'Non riesco a leggere i dati: controlla la connessione.'); }
        });
      },
      login: (email, pass) => auth.signInWithEmailAndPassword(email.trim(), pass),
      reset: (email) => auth.sendPasswordResetEmail(email.trim()),
      esci: () => auth.signOut(),
      ascolta(col, cb) { return fs.collection(col).onSnapshot(s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), e => console.error(col, e)); },
      ascoltaDoc(col, id, cb) { return fs.collection(col).doc(id).onSnapshot(d => cb(d.data() || {}), () => cb({})); },
      aggiungi: (col, data) => fs.collection(col).add(data).then(r => r.id),
      aggiorna: (col, id, data) => fs.collection(col).doc(id).update(data),
      imposta: (col, id, data) => fs.collection(col).doc(id).set(data, { merge: true }),
      elimina: (col, id) => fs.collection(col).doc(id).delete(),
      async molti(col, arr) {
        for (let i = 0; i < arr.length; i += 400) {
          const b = fs.batch();
          arr.slice(i, i + 400).forEach(d => b.set(fs.collection(col).doc(), d));
          await b.commit();
        }
      },
      // Spazio foto (Firebase Storage): ogni file porta con sé chi l'ha caricato.
      fotoPronte: () => !!firebase.storage,
      async carica(path, blob, by) {
        const ref = firebase.storage().ref(path);
        await ref.put(blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000', customMetadata: { by } });
        return { url: await ref.getDownloadURL(), path };
      },
      eliminaFile: (path) => path ? firebase.storage().ref(path).delete().catch(() => {}) : Promise.resolve(),
      async attivaNotifiche() {
        if (!('Notification' in window) || !('serviceWorker' in navigator)) {
          return /iPhone|iPad/.test(navigator.userAgent)
            ? 'Su iPhone prima aggiungi l\'app alla schermata Home (Condividi > Aggiungi alla schermata Home), poi aprila da lì.'
            : 'Questo browser non supporta le notifiche. Prova con Chrome.';
        }
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') return 'Notifiche non permesse. Si possono attivare dalle impostazioni del telefono.';
        const reg = await navigator.serviceWorker.ready;
        const token = await firebase.messaging().getToken({ vapidKey: window.CONFIG.vapidKey, serviceWorkerRegistration: reg });
        await fs.collection('token').doc(token).set({ persona, quando: Date.now(), telefono: navigator.userAgent.slice(0, 120) });
        return 'ok';
      }
    };
  }

  window.DATI = vero ? firebaseVero() : prova();
})();
