// Strato dei dati: lo stesso modo di leggere e scrivere sia con Firebase (app vera)
// sia in "modalità prova" (tutto sul telefono, dati di esempio). app.js usa solo DATI.
(function () {
  const cfg = (window.CONFIG && window.CONFIG.firebase) || {};
  const configurato = !!(cfg.apiKey && cfg.projectId);
  const vero = configurato && !!window.firebase;

  /* ---------- App vera ma Firebase non si è caricato (niente rete e nessuna copia) ----------
     Mai la modalità prova al posto dell'app vera: si spiega cosa succede e si riprova da soli quando torna internet. */
  function senzaRete() {
    const msg = 'Per aprire l\'app serve internet ancora per una volta: riprova appena c\'è rete.';
    return {
      modo: 'senza-rete',
      avvia(cb) { cb(null, msg); addEventListener('online', () => location.reload(), { once: true }); },
      login() { return Promise.reject(new Error(msg)); }, reset() { return Promise.reject(new Error(msg)); }, esci() {},
      ascolta() {}, ascoltaDoc() { return () => {}; }, fotoPronte: () => false
    };
  }

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
        .forEach(([id, nome, colore], i) => o.persone[id] = { nome, colore, ordine: i, notifiche: { promemoria: true, nuovi: true, riepilogo: true, cena: true, proposte: true, conflitti: true } });
      [ev('Turno al lavoro', 0, '06:30', ['p1'], 'Fino alle 11:30', { fonte: 'calendario:p1' }),
       ev('Dentista', 0, '15:00', ['p3', 'p2'], 'Studio in centro'),
       ev('Cena tutti insieme', 0, '20:00', tutti, 'Pizza fatta in casa'),
       ev('Calcetto', 1, '19:00', ['p4'], '', { ripeti: 'settimanale' }),
       ev('Gran Premio in TV', 1, '21:00', ['p1', 'p4'], ''),
       ev('Spesa grande', 2, '10:00', ['p2'], 'Chi vuole qualcosa lo scrive in Spesa'),
       ev('Compleanno della nonna', 4, '', tutti, '', { ripeti: 'annuale' }),
       ev('Revisione auto', 5, '09:00', ['p4'], 'Portare il libretto'),
       ev('Riunione di condominio', 1, '19:00', ['p1'], ''), ev('Matrimonio di Chiara', 12, '11:00', ['p1', 'p2'], 'In comune')].forEach(e => o.impegni[uid()] = e);
      // Proposte: una aperta con voti, una appena fatta senza idee, una già decisa.
      const op = (x, by, k) => ({ x, by, creato: now - 5e6 + k });
      o.proposte = {
        a1: { q: 'Cosa si mangia stasera?', tipo: 'cena', by: 'p2', creato: now - 5e6, chiusa: false, scelta: '', decisa: 0,
          opzioni: { o1: op('Pizza', 'p2', 1), o2: op('Pasta al pesto', 'p2', 2), o3: op('Sushi', 'p3', 3) }, voti: { p2: ['o1'], p3: ['o3', 'o1'], p4: ['o2'] } },
        a2: { q: 'Cosa facciamo questo weekend?', tipo: 'weekend', by: 'p4', creato: now - 6e5, chiusa: false, scelta: '', decisa: 0, opzioni: {}, voti: {} },
        a3: { q: 'Dove si pranza domani?', tipo: 'pranzo', by: 'p1', creato: now - 3e7, chiusa: true, scelta: 'Dalla nonna', decisa: now - 2e6,
          opzioni: { o4: op('Dalla nonna', 'p1', 4), o5: op('Fuori', 'p3', 5) }, voti: { p1: ['o4'], p2: ['o4'], p3: ['o5', 'o4'], p4: ['o4'] } }
      };
      [['Latte', 'p2', false], ['Pane', 'p4', false], ['Mozzarella per la pizza', 'p1', false], ['Mele', 'p3', true], ['Detersivo piatti', 'p2', false]]
        .forEach(([x, by, done], i) => o.spesa[uid()] = { x, by, done, creato: now - i * 1000 });
      o.cena[iso(0)] = { p1: 'si', p2: 'si', p4: 'no' };
      regaliEsempio(o); calEsempio(o);
      o.me = 'p1';
      return o;
    }
    // Impegni dal calendario di p1: uno visibile e uno nascosto (gli altri vedono "Occupato", il titolo vero sta in privati/p1).
    function calEsempio(o) {
      const id1 = uid(), id2 = uid();
      o.impegni = o.impegni || {};
      o.impegni[id1] = { t: 'Palestra', d: iso(1), h: '18:30', fine: '19:30', who: ['p1'], n: '', fonte: 'calendario:p1', creatoDa: 'p1', creato: 0 };
      o.impegni[id2] = { t: 'Occupato', d: iso(2), h: '09:00', fine: '10:00', who: ['p1'], n: '', fonte: 'calendario:p1', creatoDa: 'p1', creato: 0, nascosto: true };
      o.privati = { p1: { dettagli: { [id2]: { t: 'Visita dal dottore', n: 'Portare le analisi' } } } };
      o.famiglia = { mezzi: { lista: [{ e: '🚗', n: 'Macchina di Paolo' }, { e: '🛵', n: 'Motorino di Marco' }] } };
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
      [['Natale tutti insieme', 'A casa', '2025-12-25', '', ['p1', 'p2', 'p3', 'p4'], [['#C0392B', '#E74C3C', '🎄'], ['#27AE60', '#F1C40F', '🎁'], ['#8E44AD', '#E74C3C', '🍾']], 'feste'],
       ['Pizza del sabato', 'Da Gino', '2026-10-24', '', ['p1', 'p3', 'p4'], [['#E67E22', '#F1C40F', '🍕'], ['#D35400', '#F39C12', '🥂']], 'pranzo'],
       ['Al cinema', 'Multisala', '2026-09-12', '', ['p2', 'p3'], [['#2C3E50', '#8E44AD', '🎬'], ['#34495E', '#E74C3C', '🍿']], 'cinema'],
       ['Mare in Puglia', 'Polignano a Mare', '2026-08-08', '2026-08-16', ['p1', 'p2', 'p3', 'p4'], [['#2D9CDB', '#7FDBDA', '🌊'], ['#F2994A', '#F2C94C', '🌅'], ['#56CCF2', '#2F80ED', '🏖️'], ['#27AE60', '#6FCF97', '🫒'], ['#EB5757', '#F2994A', '🍉'], ['#9B51E0', '#56CCF2', '🌙']]],
       ['Neve a Livigno', 'Livigno', '2026-01-03', '2026-01-06', ['p1', 'p3', 'p4'], [['#A0C4FF', '#E0F0FF', '⛷️'], ['#6C8EBF', '#BDD5F2', '🏔️'], ['#D4A373', '#FAEDCD', '☕'], ['#5E60CE', '#A0C4FF', '❄️']]],
       ['Weekend a Parigi', 'Parigi', '2025-04-25', '2025-04-28', ['p2', 'p3'], [['#E5989B', '#FFCDB2', '🗼'], ['#B5838D', '#FFB4A2', '🥐'], ['#6D6875', '#E5989B', '🎨']]]]
        .forEach(([t, dove, da, a, who, foto, tipo], k) => {
          const v = uid(); o.viaggi[v] = { t, dove, da, a, who, tipo: tipo || 'viaggio', creatoDa: who[0], creato: Date.now() - k * 1000 };
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
    if (!db.privati) calEsempio(db);
    if (!db.viaggi || !Object.values(db.viaggi).some(v => v.tipo)) viaggiEsempio(db);
    if (!db.ricette) db.ricette = { [uid()]: { t: 'Lasagne della nonna', porz: '6 persone', by: 'p2', creato: Date.now(), ingr: ['Sfoglia per lasagne', '500 g di ragù', '1 l di besciamella', 'Parmigiano', 'Mozzarella'], come: 'Un velo di besciamella, poi sfoglia, ragù, besciamella e parmigiano. Ripetere per 4 strati.\nForno a 180° per 40 minuti.' },
      [uid()]: { t: 'Tiramisù', porz: '8 persone', by: 'p3', creato: Date.now(), ingr: ['Savoiardi', '500 g di mascarpone', '4 uova', 'Zucchero', 'Caffè', 'Cacao amaro'], come: '' } };
    // Sezione Personale: la scuola di p3 (Elena) e la sua copia di prova per p1.
    if (!db.scuola) {
      const ore = ['08:00-09:00', '09:00-10:00', '10:00-10:55', '11:05-12:00', '12:00-13:00', '13:00-14:00'];
      const g = [['Matematica', 'Italiano', 'Italiano', 'Storia', 'Inglese', 'Arte'], ['Inglese', 'Matematica', 'Scienze', 'Scienze', 'Italiano', ''],
        ['Educazione fisica', 'Educazione fisica', 'Inglese', 'Italiano', 'Storia', 'Geografia'], ['Matematica', 'Arte', 'Scienze', 'Inglese', 'Italiano', ''], ['Geografia', 'Storia', 'Matematica', 'Matematica', 'Italiano', 'Italiano']];
      const orario = []; g.forEach((l, i) => l.forEach((m, o) => m && orario.push({ g: i + 1, o: o + 1, m })));
      db.scuola = { p3: { classe: '3A', orario, ore, dal: iso(-30), al: iso(220), pause: [], copie: ['p1'] } };
      db.compiti = { [uid()]: { per: 'p1', di: 'p3', m: 'Matematica', tipo: 'verifica', d: iso(3), x: 'Equazioni', by: 'p1', creato: Date.now(), fatto: false },
        [uid()]: { per: 'p3', di: 'p3', m: 'Inglese', tipo: 'interrogazione', d: iso(2), x: '', by: 'p3', creato: Date.now(), fatto: false } };
    }
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
      // Come Firebase: "cuori.p1" cambia solo quel pezzo dentro "cuori".
      async aggiorna(col, id, data) {
        const o = Object.assign({}, db[col][id] || {});
        for (const k in data) { const [a, b] = k.split('.'); if (b) o[a] = Object.assign({}, o[a], { [b]: data[k] }); else o[k] = data[k]; }
        db[col][id] = o; save();
      },
      async imposta(col, id, data) { (db[col] = db[col] || {})[id] = unisci(db[col][id] || {}, data); save(); },
      async elimina(col, id) { delete db[col][id]; save(); },
      async eliminaMolti(col, ids) { ids.forEach(id => delete (db[col] || {})[id]); save(); },
      async molti(col, arr) { const ids = arr.map(d => { const id = uid(); (db[col] = db[col] || {})[id] = d; return id; }); save(); return ids; },
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
    const subito = (p, val) => { if (navigator.onLine) return p.then(() => val); p.catch(e => console.error(e)); return Promise.resolve(val); };
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
      // Uscendo, questo telefono smette di ricevere le notifiche di chi esce (altrimenti arriverebbero a chi entra dopo).
      async esci() {
        try {
          if ('Notification' in window && Notification.permission === 'granted' && 'serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            const token = await firebase.messaging().getToken({ vapidKey: window.CONFIG.vapidKey, serviceWorkerRegistration: reg });
            await fs.collection('token').doc(token).delete();
          }
        } catch (e) { console.error(e); }
        return auth.signOut();
      },
      ascolta(col, cb) { return fs.collection(col).onSnapshot(s => cb(s.docs.map(d => Object.assign({ id: d.id }, d.data()))), e => console.error(col, e)); },
      ascoltaDoc(col, id, cb) { return fs.collection(col).doc(id).onSnapshot(d => cb(d.data() || {}), () => cb({})); },
      // Senza rete Firebase tiene la modifica sul telefono e la manda appena torna internet, ma la sua "conferma"
      // arriva solo allora: offline si risponde subito, così l'app dice "salvato" e non resta in attesa.
      aggiungi(col, data) { const r = fs.collection(col).doc(); return subito(r.set(data), r.id); },
      aggiorna: (col, id, data) => subito(fs.collection(col).doc(id).update(data)),
      imposta: (col, id, data) => subito(fs.collection(col).doc(id).set(data, { merge: true })),
      elimina: (col, id) => subito(fs.collection(col).doc(id).delete()),
      async eliminaMolti(col, ids) {
        for (let i = 0; i < ids.length; i += 400) {
          const b = fs.batch(); ids.slice(i, i + 400).forEach(id => b.delete(fs.collection(col).doc(id))); await b.commit();
        }
      },
      async molti(col, arr) {
        const ids = [];
        for (let i = 0; i < arr.length; i += 400) {
          const b = fs.batch();
          arr.slice(i, i + 400).forEach(d => { const r = fs.collection(col).doc(); ids.push(r.id); b.set(r, d); });
          await b.commit();
        }
        return ids;
      },
      // Spazio foto (Firebase Storage): ogni file porta con sé chi l'ha caricato.
      fotoPronte: () => !!firebase.storage,
      // Carica il file così com'è (foto e video originali); "avanti" riceve quanto è stato caricato (0-1).
      async carica(path, blob, by, avanti) {
        const ref = firebase.storage().ref(path);
        const tipo = blob.type || (/\.(mov|mp4)$/i.test(path) ? 'video/mp4' : 'image/jpeg');
        const task = ref.put(blob, { contentType: tipo, cacheControl: 'public,max-age=31536000', customMetadata: { by } });
        if (avanti) task.on('state_changed', s => avanti(s.bytesTransferred));
        await task;
        return { url: await ref.getDownloadURL(), path };
      },
      eliminaFile: (path) => path ? firebase.storage().ref(path).delete().catch(() => {}) : Promise.resolve(),
      // Con il permesso già dato, il telefono si iscrive da solo per chi è entrato (es. dopo un cambio di persona).
      async iscriviDiNuovo() {
        if (!('Notification' in window) || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) return;
        try { await this.attivaNotifiche(); } catch (e) { console.error(e); }
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

  window.DATI = vero ? firebaseVero() : configurato ? senzaRete() : prova();
})();
