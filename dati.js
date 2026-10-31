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
      o.me = 'p1';
      return o;
    }
    try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (!db || !db.persone) db = esempio();
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} subs.forEach(s => s()); };
    const list = (col) => Object.entries(db[col] || {}).map(([id, v]) => Object.assign({ id }, v));
    return {
      modo: 'prova',
      avvia(cb) { this._cb = cb; setTimeout(() => cb(db.me), 0); },
      cambiaPersona(id) { db.me = id; save(); this._cb(id); },
      ricomincia() { db = esempio(); save(); this._cb(db.me); },
      login() {}, reset() {}, esci() {},
      ascolta(col, cb) { const s = () => cb(list(col)); subs.push(s); s(); },
      ascoltaDoc(col, id, cb) { const s = () => cb((db[col] || {})[id] || {}); subs.push(s); s(); },
      async aggiungi(col, data) { const id = uid(); (db[col] = db[col] || {})[id] = data; save(); return id; },
      async aggiorna(col, id, data) { db[col][id] = Object.assign({}, db[col][id] || {}, data); save(); },
      async imposta(col, id, data) { (db[col] = db[col] || {})[id] = Object.assign({}, db[col][id] || {}, data); save(); },
      async elimina(col, id) { delete db[col][id]; save(); },
      async molti(col, arr) { arr.forEach(d => (db[col] = db[col] || {})[uid()] = d); save(); },
      async attivaNotifiche() { return 'Nella modalità prova le notifiche non partono: funzioneranno nell\'app vera.'; }
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
            persona = m.data().persona; cb(persona);
          } catch (e) { cb(null, 'Non riesco a leggere i dati: controlla la connessione.'); }
        });
      },
      login: (email, pass) => auth.signInWithEmailAndPassword(email.trim(), pass),
      reset: (email) => auth.sendPasswordResetEmail(email.trim()),
      esci: () => auth.signOut(),
      ascolta(col, cb) { return fs.collection(col).onSnapshot(s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data())))); },
      ascoltaDoc(col, id, cb) { return fs.collection(col).doc(id).onSnapshot(d => cb(d.data() || {})); },
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
