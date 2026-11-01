// NDSZ - l'app. Legge e scrive solo attraverso DATI (dati.js).
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmt = (s, o) => new Date(s + 'T12:00:00').toLocaleDateString('it-IT', o);
  const COLORI = { blu: 'var(--p-blu)', rosa: 'var(--p-rosa)', ambra: 'var(--p-ambra)', verde: 'var(--p-verde)', viola: 'var(--p-viola)', corallo: 'var(--p-corallo)', rosso: 'var(--p-rosso)', grigio: 'var(--p-grigio)' };
  const RIPETI = { '': 'Mai', settimanale: 'Ogni settimana', mensile: 'Ogni mese', annuale: 'Ogni anno' };
  // [chiave, testo, orario scelto (facoltativo), ore possibili, ora solita]
  const NOTIF = [['promemoria', 'Promemoria un\'ora prima dei miei impegni'], ['nuovi', 'Quando qualcuno mi aggiunge a un impegno'],
    ['riepilogo', 'La sera: gli impegni di domani', 'oraRiepilogo', [19, 20, 21, 22], 21],
    ['cena', 'Il pomeriggio: "A cena stasera?" se non ho risposto', 'oraCena', [15, 16, 17, 18, 19], 17], ['proposte', 'Nuove proposte, quando hanno votato tutti e cosa si è deciso'], ['conflitti', 'Se ho due impegni alla stessa ora']];
  const SCHEDE = ['oggi', 'cal', 'note', 'viaggi', 'spesa'];
  const NOMI_SCHEDE = { oggi: 'Oggi', cal: 'Impegni', note: 'Bacheca', viaggi: 'Ricordi', spesa: 'Spesa' };
  const NOMI_COLORI = { blu: 'blu', rosa: 'rosa', ambra: 'ambra', verde: 'verde', viola: 'viola', corallo: 'corallo', rosso: 'rosso', grigio: 'grigio' };
  // Preferenze di questo telefono (aspetto, scheda di apertura): restano solo qui.
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  const rid = () => Math.random().toString(36).slice(2, 12);
  const pocoMoto = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  let TODAY = new Date(); TODAY.setHours(12, 0, 0, 0);
  let T = iso(TODAY);
  const S = { me: null, persone: {}, impegni: [], note: [], proposte: [], spesa: [], cena: {}, regali: [], sorprese: {}, viaggi: [], foto: [], priv: {}, mezzi: [], ricette: [], scuola: {}, compiti: [], voti: [] };
  let page = 'oggi', selDay = T, weekStart = inizioSettimana(TODAY), filt = 'tutti', seg = LS.get('noi4-bacheca', 'proposte') === 'regali' ? 'regali' : 'proposte';
  const seen = new Set(); let fresh = null; let avviato = false;

  function inizioSettimana(d) { const x = new Date(d); return addDays(x, -((x.getDay() + 6) % 7)); }
  const P = (id) => S.persone[id] || { nome: '?', colore: 'viola' };
  const col = (id) => COLORI[P(id).colore] || 'var(--acc)';
  const ini = (id) => (P(id).nome || '?')[0].toUpperCase();
  // Il "pallino" di una persona: la sua foto se l'ha messa, altrimenti l'iniziale.
  const avt = (id) => P(id).foto ? `<img class="fimg" src="${esc(P(id).foto)}" alt="" decoding="async">` : ini(id);
  const IDS = () => Object.keys(S.persone).sort((a, b) => (P(a).ordine || 0) - (P(b).ordine || 0));
  const vista = () => page === 'note' ? 'note-' + seg : page;
  const ri = (i) => seen.has(vista()) ? '' : ` rise" style="--i:${Math.min(i, 6)}`;
  const saluto = () => { const h = new Date().getHours(); return h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'; };
  const modificabile = (e) => e.fonte === 'app' || e.fonte === 'import:' + S.me || e.fonte === 'orario:' + S.me;

  /* Cosa vedono gli altri dei MIEI impegni del calendario: prima le scelte fatte a mano (per titolo),
     poi le parole automatiche (prima quelle da nascondere), poi la regola generale.
     Le stesse regole le applica il programma su GitHub (scripts/sincronizza_calendari.py): tenerle uguali. */
  const PAROLE0 = {
    nascondi: ['medico', 'dottor', 'dentista', 'visita', 'analisi', 'esami', 'prelievo', 'ospedale', 'terapia', 'psicolog', 'fisioterap', 'banca', 'avvocato', 'notaio', 'commercialista', 'colloquio', 'privato'],
    mostra: ['cena', 'pranzo', 'colazione', 'aperitivo', 'compleanno', 'famiglia', 'festa', 'natale', 'pasqua', 'vacanza', 'viaggio', 'ferie']
  };
  const chiave = (t) => String(t || '').toLowerCase().trim().replace(/\s+/g, ' ');
  const reParola = (w) => new RegExp('(^|[^\\p{L}\\p{N}])' + chiave(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u');
  const regole = (x) => Object.assign({ scelte: S.priv.scelte || {}, parole: S.priv.parole || PAROLE0, gen: P(S.me).privacy === 'occupato' ? 'occupato' : 'tutto' }, x || {});
  function regolaCal(t, rg) {
    const k = chiave(t);
    if (rg.scelte[k]) return { vis: rg.scelte[k] === 'mostra', perche: 'L\'hai scelto tu.' };
    const nas = (rg.parole.nascondi || []).find(w => w && reParola(w).test(k));
    if (nas) return { vis: false, perche: `Automatico: contiene «${nas}».` };
    const mos = (rg.parole.mostra || []).find(w => w && reParola(w).test(k));
    if (mos) return { vis: true, perche: `Automatico: contiene «${mos}».` };
    return { vis: rg.gen !== 'occupato', perche: 'Automatico: segue la regola generale.' };
  }
  // I miei impegni che arrivano da un calendario (collegato o importato da file): per questi decido cosa vedono gli altri.
  const mioCal = (e) => e.fonte === 'calendario:' + S.me || e.fonte === 'import:' + S.me;
  // Compleanni (scelta del 31/10/2026): dai calendari non entrano, anche scritti di fretta.
  // Le stesse parole le usa il programma dei calendari (scripts/sincronizza_calendari.py): tenerle uguali.
  const COMPL = /b[iy]r?t?h?d[ae]y|byrt|\bb-?day\b|compl?ean+o|cumplea|geburtstag|anniversaire|🎂/i;
  const FESTA_C = /festa|party|cena|pranzo|aperitivo/i;
  const RICORR = /festa|party|cena|pranzo|aperitivo|natale|vigilia|pasqua|pasquetta|capodanno|ferragosto|ognissanti|immacolata|santo stefano|epifania|befana|liberazione|repubblica|halloween|san valentino|anniversario|onomastico|ferie|vacanza|bollo|assicuraz|rinnov|scadenz|tass|revision|abbonament|pagament|bollett|canone|tagliando|patente|passaporto|carta d'identit|dichiaraz|730|imu/i; // anche promemoria annuali (bollo, assicurazione…): non sono compleanni
  const compleanno = (t, annuale) => !FESTA_C.test(t) && (COMPL.test(t) || (!!annuale && !RICORR.test(t)));
  const daCalendario = (e) => /^(calendario|import):/.test(e.fonte || '');
  // I miei impegni nascosti: io vedo il titolo vero (sta nella mia parte privata), gli altri "Occupato".
  // I compleanni arrivati dai calendari prima della regola non si vedono più.
  function mappaImpegni() {
    const det = S.priv.dettagli || {};
    S.impegni = (S.impRaw || []).map(e => e.nascosto && mioCal(e) ? Object.assign({}, e, det[e.id] ? { t: det[e.id].t, n: det[e.id].n || '' } : {}, { privato: true, svelabile: !!det[e.id] }) : e)
      .filter(e => !(daCalendario(e) && !e.imp && compleanno(e.t || '')))
      .concat(eventiScuola());
  }
  // Applica subito le regole ai miei impegni (senza aspettare il programma della mezz'ora).
  async function applicaRegole(rg) {
    rg = regole(rg); const det = {}, cambi = [];
    for (const x of S.impegni.filter(mioCal)) {
      const vis = regolaCal(x.t, rg).vis;
      if (!vis && !x.privato) { det[x.id] = { t: x.t, n: x.n || '' }; cambi.push([x.id, { t: 'Occupato', n: '', nascosto: true }]); }
      else if (vis && x.privato && x.svelabile) cambi.push([x.id, { t: x.t, n: x.n || '', nascosto: false }]);
    }
    if (Object.keys(det).length) await DATI.imposta('privati', S.me, { dettagli: det });
    await Promise.all(cambi.map(([id, v]) => DATI.aggiorna('impegni', id, v)));
    return cambi.length;
  }

  /* Come ci si va: i mezzi di famiglia (famiglia/mezzi nel database, si scrivono dalle Impostazioni:
     nel codice pubblico niente nomi) più quelli di tutti. */
  const TIPI_MEZZO = [['🚗', 'Macchina'], ['🛵', 'Motorino'], ['🏍️', 'Moto'], ['🚐', 'Furgone']];
  const MEZZI_BASE = [['🚶', 'A piedi'], ['🚌', 'Bus'], ['🚇', 'Metro'], ['🚆', 'Treno'], ['🚋', 'Tram'], ['🚲', 'Bici'], ['🚕', 'Taxi'], ['✈️', 'Aereo']];
  let mzTipo = '🚗';
  const mezziTutti = () => [...S.mezzi.map(m => m.e + ' ' + m.n), ...MEZZI_BASE.map(([e, n]) => e + ' ' + n)];
  const mezziHtml = (sel, attr) => `<div class="mezzi">${mezziTutti().map(m => `<button type="button" class="mz tap${m === sel ? ' on' : ''}" ${attr}="${esc(m)}">${esc(m)}</button>`).join('')}</div>`;

  const oraAdesso = () => new Date().toTimeString().slice(0, 5);
  /* Turni di lavoro e cena automatica (31/10/2026): dall'orario di lavoro si sa a che ora uno torna a casa,
     e chi è impegnato all'ora di cena risulta "fuori" da solo, senza scrivere niente. Il sì/no toccato a mano vince.
     Il tempo per tornare a casa lo sceglie ognuno nelle Impostazioni (di base 20 minuti). */
  const CENA = [20 * 60, 21 * 60]; // l'ora di cena: chi è impegnato in questa fascia non c'è
  const STRADE = [0, 10, 20, 30, 45];
  const strada = (id) => { const v = (P(id) || {}).strada; return STRADE.includes(v) ? v : 20; };
  const hm = (m) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const eTurno = (e) => /^orario:/.test(e.fonte || '');
  // L'ultimo turno di lavoro del giorno (con l'ora di fine) e l'ora in cui si arriva a casa.
  function rientro(id, d) {
    const t = delGiorno(d || T, e => eTurno(e) && e.fonte === 'orario:' + id && e.h && e.fine && e.fine > e.h).pop();
    if (!t) return null;
    const m = minuti(t.fine) + strada(id);
    return { turno: t, m, ora: hm(m) }; // dopo mezzanotte: 00:10, non 23:59
  }
  // Perché uno non è a cena stasera (o null): un turno che finisce tardi, o un impegno all'ora di cena.
  // Non contano gli impegni con tutta la famiglia (es. "Cena tutti insieme") né quelli di tutto il giorno.
  function fuoriCena(id, d) {
    d = d || T;
    const r = rientro(id, d);
    if (r && r.m > CENA[0] && minuti(r.turno.h) < CENA[1]) return { perche: `al lavoro, a casa verso le ${r.ora}` };
    const tutti = IDS().length;
    const e = delGiorno(d, x => !eTurno(x) && x.h && (x.who || []).includes(id) && !((x.who || []).length >= tutti && tutti > 1))
      .find(x => { const [a, b] = intervallo(x, d); return a < CENA[1] && b > CENA[0]; });
    return e ? { perche: `alle ${e.h} ${e.t}` } : null;
  }
  // Il sì/no per la cena: quello toccato a mano, altrimenti "no" da solo se è impegnato all'ora di cena.
  const cenaDi = (id) => S.cena[id] === 'si' || S.cena[id] === 'no' ? { v: S.cena[id] } : fuoriCena(id) ? { v: 'no', auto: fuoriCena(id) } : { v: '?' };
  function statoOra(id) {
    // Le note di scuola non sono un'attività; se c'è un impegno vero durante la scuola, vince quello.
    const ora = oraAdesso(), oggi = delGiorno(T, e => (e.who || []).includes(id) && !e.cmp);
    const orora = oggi.filter(e => e.h && e.h <= ora && e.fine && e.fine > ora), ades = orora.find(e => !e.virtuale) || orora[0];
    // t = frase intera (pagina della persona), c = versione corta (sotto il cerchio in Oggi)
    const r = rientro(id);
    if (ades && r && ades.id === r.turno.id) return { t: `Al lavoro fino alle ${ades.fine}, a casa verso le ${r.ora}`, c: `Lavoro, 🏠 ${r.ora}`, k: 'occ' };
    if (ades) return { t: `Ora: ${ades.t}, fino alle ${ades.fine}`, c: `Ora · ${ades.t}`, k: 'occ' };
    if (r && r.turno.fine <= ora && hm(r.m) > ora && r.m < 24 * 60) return { t: `Sta tornando dal lavoro, a casa verso le ${r.ora}`, c: `🏠 ${r.ora}`, k: 'dopo' };
    const pros = oggi.find(e => e.h && e.h > ora);
    if (pros && r && pros.id === r.turno.id) return { t: `Alle ${pros.h} al lavoro, a casa verso le ${r.ora}`, c: `${pros.h} · lavoro`, k: 'dopo' };
    if (pros) return { t: `Alle ${pros.h}: ${pros.t}`, c: `${pros.h} · ${pros.t}`, k: 'dopo' };
    const tutto = oggi.find(e => !e.h && !e.virtuale);
    if (tutto) return { t: `Oggi: ${tutto.t}`, c: tutto.t, k: 'dopo' };
    const cv = cenaDi(id).v, cena = cv === 'si' ? 'A cena 🍝' : cv === 'no' ? 'Fuori a cena' : null;
    return oggi.length ? { t: 'Impegni di oggi finiti', c: cena || 'Finito per oggi', k: 'lib' } : { t: 'Oggi niente in programma', c: cena || 'Giornata libera', k: 'lib' };
  }

  // Ultimo giorno del mese di 'AAAA-MM-GG' (28, 29, 30 o 31).
  const fineMese = (d) => new Date(+d.slice(0, 4), +d.slice(5, 7), 0).getDate();
  // Stesso numero di giorno; se quel mese è più corto (31 → aprile, 29 febbraio → anni normali), l'ultimo giorno del mese.
  const stessoGiorno = (d, g) => { const n = +g, m = fineMese(d); return +d.slice(8) === Math.min(n, m); };
  function capita(e, d) {
    // Impegni di più giorni (es. ferie dal 3 al 7): "fino" è l'ultimo giorno, compreso.
    if (!e.ripeti) return e.fino && e.fino > e.d ? d >= e.d && d <= e.fino : e.d === d;
    if (d < e.d) return false;
    if (e.al && d > e.al) return false; // la scuola finisce a giugno
    if (e.pause && e.pause.some(p => d >= p[0] && d <= p[1])) return false; // vacanze
    if (e.ripeti === 'settimanale') return new Date(d + 'T12:00:00').getDay() === new Date(e.d + 'T12:00:00').getDay();
    if (e.ripeti === 'mensile') return stessoGiorno(d, e.d.slice(8));
    if (e.ripeti === 'annuale') return d.slice(5, 7) === e.d.slice(5, 7) && stessoGiorno(d, e.d.slice(8));
    return false;
  }
  const piuGiorni = (e) => !e.ripeti && e.fino && e.fino > e.d;
  // Un impegno di più giorni, in un giorno che non è l'ultimo, dura fino a mezzanotte: la sera non è "finito".
  const inCorso = (e, d) => piuGiorni(e) && d < e.fino;
  // "dal 3 al 7 nov" per gli impegni di più giorni.
  const durataGiorni = (e) => `dal ${fmt(e.d, { day: 'numeric', month: e.d.slice(0, 7) === e.fino.slice(0, 7) ? undefined : 'short' })} al ${fmt(e.fino, { day: 'numeric', month: 'short' })}`;
  const delGiorno = (d, f) => S.impegni.filter(e => capita(e, d) && (!f || f(e))).sort((a, b) => (a.h || '').localeCompare(b.h || ''));
  // Due impegni della stessa persona che si accavallano nello stesso giorno (senza orario non contano).
  // Un impegno senza fine dura un'ora; uno che finisce "prima" di iniziare (turno 22-6) arriva a mezzanotte.
  const minuti = (h) => +h.slice(0, 2) * 60 + +h.slice(3, 5);
  // Impegno di più giorni con orario: il primo giorno dall'ora d'inizio, in mezzo tutto il giorno, l'ultimo fino all'ora di fine.
  const intervallo = (e, d) => {
    if (piuGiorni(e)) return [d === e.d ? minuti(e.h) : 0, d === e.fino && e.fine ? minuti(e.fine) : 24 * 60];
    const a = minuti(e.h), b = e.fine ? minuti(e.fine) : a + 60; return [a, b > a ? b : 24 * 60];
  };
  function accavallati(e, d, chi) {
    // La scuola e le note di scuola non danno avvisi loro; un impegno vero durante la scuola invece sì.
    if (!e.h || e.virtuale) return [];
    const [a1, b1] = intervallo(e, d);
    return delGiorno(d, x => x.id !== e.id && x.h && !x.cmp && (x.who || []).includes(chi) && x.t !== e.t).filter(x => { const [a2, b2] = intervallo(x, d); return a1 < b2 && a2 < b1; });
  }
  // Impegni importanti: con tutta la famiglia, segnati con la stella, o con parole da grande occasione.
  const PAROLE_IMP = ['matrimonio', 'laurea', 'battesimo', 'comunione', 'cresima', 'funerale', 'viaggio', 'partenza', 'volo', 'trasloco', 'esame', 'concerto', 'vacanza', 'ferie', 'natale', 'capodanno', 'pasqua'];
  const importante = (e) => !e.nascosto && (e.imp || !COMPL.test(e.t)) && (e.imp || ((e.who || []).length >= IDS().length && IDS().length > 1) || PAROLE_IMP.some(w => reParola(w).test(chiave(e.t))));
  // Il prossimo giorno (entro 45) in cui cade ogni impegno importante, uno per impegno, in ordine di data.
  function prossimiImportanti(n) {
    const out = [], visti = new Set();
    for (let i = 0; i < 45 && out.length < n; i++) {
      const d = iso(addDays(TODAY, i));
      for (const e of delGiorno(d, importante)) {
        if (visti.has(e.id) || (d === T && e.h && !inCorso(e, d) && (e.fine || e.h) < oraAdesso())) continue;
        visti.add(e.id); out.push([d, e]); if (out.length >= n) break;
      }
    }
    return out;
  }

  function chips(who) {
    const ids = IDS();
    if (who.length >= ids.length && ids.length > 1) return `<span class="chip" style="--pc:var(--acc)"><i></i>Tutti</span>`;
    return who.filter(w => S.persone[w]).map(w => `<span class="chip" style="--pc:${col(w)}"><i></i>${esc(P(w).nome)}</span>`).join('');
  }
  function evList(list, vuoto, giorno) {
    if (!list.length) return `<div class="empty">${vuoto || 'Nessun impegno. Tocca + per aggiungerne uno.'}</div>`;
    return list.map(e => `<button class="ev tap${e.id === fresh ? ' pop' : ''}" data-ev="${e.id}">
      <div class="h">${e.h ? esc(e.h) : '<small>tutto il<br>giorno</small>'}${e.h && e.fine ? `<small>${esc(e.fine)}</small>` : ''}</div>
      <div><div class="t">${e.imp ? '⭐ ' : ''}${esc(e.t)}${e.privato ? ' <span class="lk" title="Gli altri vedono Occupato">🔒</span>' : ''}</div>${piuGiorni(e) ? `<div class="n">🗓️ ${durataGiorni(e)}</div>` : ''}${e.n ? `<div class="n">${esc(e.n)}</div>` : ''}${eTurno(e) && e.h && e.fine && e.fine > e.h ? `<div class="n">🏠 A casa verso le ${hm(Math.min(minuti(e.fine) + strada((e.who || [])[0]), 24 * 60 - 1))}</div>` : ''}${e.mezzo ? `<div class="mzr">${esc(e.mezzo)}</div>` : ''}${giorno && (e.who || []).includes(S.me) ? accavallati(e, giorno, S.me).slice(0, 1).map(x => `<div class="acc">⚠️ Alla stessa ora hai «${esc(x.t)}»</div>`).join('') : ''}<div class="dots">${chips(e.who || [])}</div></div></button>`).join('');
  }

  /* ---------- Fluidità ----------
     Ogni dato nuovo ridisegna la pagina: invece di rifare tutto (immagini che lampeggiano, animazioni interrotte,
     tocchi persi) si cambiano solo le parti diverse, con morphdom. Le entrate ("rise") non si interrompono a metà
     e alla fine si tolgono, così non ripartono quando si torna sulla scheda. */
  function fluido(sel) {
    const el = document.querySelector(sel); if (!el || el._fluido) return; el._fluido = 1;
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
    Object.defineProperty(el, 'innerHTML', {
      get() { return desc.get.call(this); },
      set(html) {
        if (html === this._h) return;
        const primo = this._h == null; this._h = html;
        if (primo || !window.morphdom) return desc.set.call(this, html);
        window.morphdom(this, '<div>' + html + '</div>', {
          childrenOnly: true,
          onBeforeElUpdated(da, a) {
            if (da.isEqualNode(a)) return false;
            if ((da.tagName === 'INPUT' || da.tagName === 'TEXTAREA') && da === document.activeElement) return false;
            for (const c of ['rise', 'pop']) if (da.classList.contains(c) && !a.classList.contains(c)) a.classList.add(c);
            return true;
          }
        });
      }
    });
  }
  ['#p-oggi', '#p-cal', '#noteBody', '#p-viaggi', '#p-spesa', '#impIn', '#persIn', '#tripIn', '#mioIn'].forEach(fluido);
  // A fine entrata la classe si toglie: così non riparte quando si torna sulla scheda.
  document.addEventListener('animationend', (ev) => {
    const t = ev.target; if (!t.classList || !/^fm-(rise|pop)$/.test(ev.animationName)) return;
    t.classList.remove('rise', 'pop');
    // Le storie in alto entrano una alla volta: la classe del contenitore si toglie quando ha finito l'ultima.
    if (t.parentElement && t.parentElement.classList.contains('storie') && !t.nextElementSibling) t.parentElement.classList.remove('rise');
  });

  /* ---------- Pagine ---------- */
  function rOggi() {
    const tom = iso(addDays(TODAY, 1));
    const left = S.spesa.filter(x => !x.done).length;
    const ids = IDS();
    const yes = ids.filter(i => S.cena[i] === 'si').length;
    const cene = Object.fromEntries(ids.map(i => [i, cenaDi(i)]));
    const perche = ids.filter(i => cene[i].auto).map(i => `<span style="--pc:${col(i)}">🌙 <b>${i === S.me ? 'Tu' : esc(P(i).nome)}</b> · ${esc(cene[i].auto.perche)}</span>`);
    const adesso = minuti(oraAdesso());
    const rientri = ids.filter(i => !cene[i].auto && rientro(i) && rientro(i).m > adesso).map(i => `<span style="--pc:${col(i)}">🏠 <b>${i === S.me ? 'Tu' : esc(P(i).nome)}</b> · a casa verso le ${rientro(i).ora}</span>`);
    $('#p-oggi').innerHTML = `<div class="stack">
     <div class="storie${ri(0)}" role="list">${ids.map((i, k) => { const st = statoOra(i); return `<button class="st tap" role="listitem" data-persona="${i}" style="--pc:${col(i)};--k:${k}" aria-label="${esc(P(i).nome)}: ${esc(st.t)}"><span class="ring ${st.k}"><span>${avt(i)}</span></span><b>${i === S.me ? 'Tu' : esc(P(i).nome)}</b><small>${esc(st.c)}</small></button>`; }).join('')}</div>
     <div class="card${ri(1)}"><h2><span class="ttl"><i class="ic">🍽️</i>A cena stasera?</span> <small>${yes === ids.length && ids.length ? 'tutti a tavola 🍝' : `${yes} su ${ids.length}`}</small></h2>
       <div class="cena" style="--n:${ids.length}">${ids.map(i => { const v = cene[i].v; return `<button class="cv tap${cene[i].auto ? ' auto' : ''}" data-cena="${i}" data-v="${v}" style="--pc:${col(i)}" aria-label="${esc(P(i).nome)}: ${v}${cene[i].auto ? ', ' + esc(cene[i].auto.perche) : ''}"><span class="av" data-b="${v === 'si' ? '✓' : v === 'no' ? '✕' : '?'}">${avt(i)}</span><span class="nm">${i === S.me ? 'Tu' : esc(P(i).nome)}</span></button>`; }).join('')}</div>
       ${perche.length || rientri.length ? `<div class="perche">${perche.join('')}${rientri.join('')}</div>` : ''}
       <div class="empty">Tocca il tuo cerchio: sì, no, non so. Quello degli altri apre la loro pagina.${perche.length ? ' Chi è impegnato all\'ora di cena risulta fuori da solo.' : ''}</div></div>
     ${propOggi(ri(1))}
     <div class="card${ri(1)}"><h2><span class="ttl"><i class="ic">☀️</i>Oggi</span> <small>${fmt(T, { weekday: 'long', day: 'numeric', month: 'short' })}</small></h2>${evList(delGiorno(T), 'Giornata libera ☀️ Tocca + per aggiungere un impegno.', T)}</div>
     <div class="card${ri(2)}"><h2><span class="ttl"><i class="ic">🌙</i>Domani</span> <small>${fmt(tom, { weekday: 'long' })}</small></h2>${evList(delGiorno(tom), 'Domani niente in programma.', tom)}</div>
     ${ricordo(ri(3))}
     <button class="card tap${ri(4)}" data-go="spesa"><h2><span class="ttl"><i class="ic">🛒</i>Lista della spesa</span> <small>${left ? `${left} da prendere ›` : 'tutto preso ›'}</small></h2></button>
    </div>`;
  }

  function rCal() {
    const days = [...Array(7)].map((_, i) => iso(addDays(weekStart, i)));
    const k = days.indexOf(selDay);
    const show = e => filt === 'tutti' || (e.who || []).includes(filt);
    const ids = IDS();
    const top = prossimiImportanti(4), dom = iso(addDays(TODAY, 1));
    $('#p-cal').innerHTML = `<div class="stack">
     ${top.length ? `<div class="card imps${ri(0)}"><h2><span class="ttl"><i class="ic">⭐</i>Da non perdere</span></h2>
       ${top.map(([d, e]) => `<button class="imr tap" data-ev="${e.id}"><span class="imd"><b>${d === T ? 'Oggi' : d === dom ? 'Dom.' : +d.slice(8)}</b><small>${d === T || d === dom ? (e.h || '') : fmt(d, { month: 'short' })}</small></span><span class="imt"><b>${esc(e.t)}</b><small>${d === T || d === dom ? '' : fmt(d, { weekday: 'long' }) + (e.h ? ' · ' + esc(e.h) : '') + ' · '}${(e.who || []).length >= ids.length ? 'tutti' : (e.who || []).filter(w => S.persone[w]).map(w => esc(P(w).nome)).join(', ')}</small></span></button>`).join('')}</div>` : ''}
     <div class="card${ri(0)}">
       <div class="wnav"><button class="tap" data-wk="-1" aria-label="Settimana prima">‹</button><b>${fmt(days[0], { day: 'numeric', month: 'short' })} – ${fmt(days[6], { day: 'numeric', month: 'short' })}</b><button class="tap" data-wk="1" aria-label="Settimana dopo">›</button></div>
       <div class="week"><div class="wsel" style="transform:translateX(calc(${Math.max(k, 0)} * (100% + 4px)));opacity:${k < 0 ? 0 : 1}"></div>
       ${days.map(d => { const ppl = [...new Set(delGiorno(d, show).flatMap(e => e.who || []))].filter(p => S.persone[p]); return `<button class="day tap${d === selDay ? ' sel' : ''}${d === T ? ' oggi' : ''}" data-day="${d}"><span class="wd">${fmt(d, { weekday: 'short' })}</span><span class="dn">${+d.slice(8)}</span><span class="pd">${ppl.slice(0, 4).map(p => `<i style="--pc:${col(p)}"></i>`).join('')}</span></button>`; }).join('')}</div>
       <div class="filters">${['tutti', ...ids].map(f => `<button class="fb tap${filt === f ? ' on' : ''}" data-f="${f}" style="--pc:${f === 'tutti' ? 'var(--acc)' : col(f)}"><i></i><span>${f === 'tutti' ? 'Tutti' : esc(P(f).nome)}</span></button>`).join('')}</div>
     </div>
     <div class="card${ri(1)}"><h2><span class="ttl"><i class="ic">📅</i>${selDay === T ? 'Oggi' : fmt(selDay, { weekday: 'long', day: 'numeric', month: 'long' })}</span></h2>${evList(delGiorno(selDay, show), '', selDay)}</div>
    </div>`;
  }

  function rNote() {
    const el = $('#p-note');
    // Il selettore resta fermo (così la pillola scorre), cambia solo il contenuto sotto.
    if (!$('#segNote')) el.innerHTML = `<div class="seg" id="segNote" style="--n:2"><i class="spill"></i><button class="tap" data-seg="proposte">Proposte 🗳️</button><button class="tap" data-seg="regali">Regali 🎁</button></div><div id="noteBody"></div>`;
    segSet($('#segNote'), seg === 'regali' ? 1 : 0);
    $('#noteBody').innerHTML = seg === 'regali' ? rRegali() : rProposte();
  }
  function segSet(el, k) { el.style.setProperty('--k', k); el.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === k)); }
  /* ---------- Proposte: piccoli sondaggi aperti ----------
     Uno chiede ("Cosa si mangia stasera?"), tutti possono aggiungere idee e votarne quante vogliono.
     Chi ha proposto decide quando vuole; le notifiche le manda il programma su GitHub. */
  const PTIPI = [['cena', '🍽️', 'Cena', 'Cosa si mangia stasera?', ['Pizza', 'Pasta', 'Sushi']],
    ['pranzo', '🥪', 'Pranzo', 'Dove si pranza domani?', ['A casa', 'Dalla nonna', 'Fuori']],
    ['weekend', '🎉', 'Weekend', 'Cosa facciamo questo weekend?', ['Gita', 'Cinema', 'Relax a casa']],
    ['altro', '✍️', 'Altro', '', ['Prima idea', 'Seconda idea', 'Terza idea']]];
  const PTIPO = Object.fromEntries(PTIPI.map(([k, e, n, q, es]) => [k, { e, n, q, es }]));
  const opzioniDi = (p) => Object.entries(p.opzioni || {}).filter(([, o]) => o && o.x).map(([id, o]) => Object.assign({ id }, o)).sort((a, b) => (a.creato || 0) - (b.creato || 0));
  const votiDi = (p, oid) => IDS().filter(q => ((p.voti || {})[q] || []).includes(oid));
  const haVotato = (p, q) => ((p.voti || {})[q] || []).length > 0;
  // L'idea in testa: più voti; a parità, la prima scritta. Nessun voto: nessuna.
  function inTesta(p) {
    let best = null, n = 0;
    for (const o of opzioniDi(p)) { const v = votiDi(p, o.id).length; if (v > n) { best = o; n = v; } }
    return best;
  }
  function rProposte() {
    const nuova = !seen.has(vista());
    const aperte = S.proposte.filter(p => !p.chiusa).sort((a, b) => (b.creato || 0) - (a.creato || 0));
    const decise = S.proposte.filter(p => p.chiusa).sort((a, b) => (b.decisa || 0) - (a.decisa || 0)).slice(0, 6);
    let k = 0;
    const card = (p) => propCard(p, nuova ? ++k : 0);
    const vecchie = [...S.note].sort((a, b) => (b.creato || 0) - (a.creato || 0));
    return `<div class="stack"><h2 class="${ri(0)}"><span class="ttl"><i class="ic">🗳️</i>Proposte</span> <small>${aperte.length ? `${aperte.length} ${aperte.length === 1 ? 'aperta' : 'aperte'}` : ''}</small></h2>
    ${aperte.length ? aperte.map(card).join('') : `<div class="empty big${ri(1)}"><b>🗳️</b><span>Nessuna proposta aperta. Tocca + per chiedere cosa si mangia, dove si va, cosa si fa.</span></div>`}
    ${decise.length ? `<div class="sec">Già decise</div>${decise.map(card).join('')}` : ''}
    ${vecchie.length ? `<div class="sec">Vecchie note</div><div class="card">${vecchie.map(n => `<div class="pn vn" style="--pc:${col(n.by)}"><span class="chip"><i></i>${esc(P(n.by).nome)}</span><span class="vnx">${esc(n.x)}</span>${n.by === S.me ? `<button class="gx tap" data-delnote="${n.id}" aria-label="Togli la nota">✕</button>` : ''}</div>`).join('')}</div>` : ''}</div>`;
  }
  function propCard(p, k) {
    const ops = opzioniDi(p), ids = IDS(), mio = p.by === S.me, t = PTIPO[p.tipo] || PTIPO.altro;
    const miei = (p.voti || {})[S.me] || [], testa = inTesta(p), votanti = ids.filter(q => haVotato(p, q)).length;
    const anim = p.id === fresh ? ' pop' : k ? ' rise' : '';
    const riga = (o) => {
      const chi = votiDi(p, o.id), io = miei.includes(o.id), vince = p.chiusa && p.scelta === o.x;
      const dentro = `<i class="bar" style="transform:scaleX(${ids.length ? chi.length / ids.length : 0})"></i><span class="ck">${io ? '✓' : ''}</span><span class="ox">${esc(o.x)}</span><span class="ow">${chi.map(q => `<i style="--pc:${col(q)}">${avt(q)}</i>`).join('')}</span>`;
      return p.chiusa ? `<div class="op${vince ? ' win' : ''}${io ? ' on' : ''}">${dentro}</div>`
        : `<button class="op tap${io ? ' on' : ''}" data-vota="${p.id}" data-op="${o.id}" aria-pressed="${io}">${dentro}</button>`;
    };
    let az = '';
    if (mio && p.chiusa) az = `<button class="link tap" data-riapri="${p.id}">Riapri</button>`;
    else if (mio && testa) az = `<button class="deci tap" data-decidi="${p.id}">Decidi: ${esc(testa.x)}</button>`;
    if (mio) az += `<button class="gx tap" data-delprop="${p.id}" aria-label="Togli la proposta">✕</button>`;
    return `<div class="card prop${p.chiusa ? ' chiusa' : ''}${anim}" style="--pc:${col(p.by)};--i:${Math.min(k, 6)}">
      <div class="pt"><span class="pra">${avt(p.by)}</span><div class="pq"><b>${t.e} ${esc(p.q)}</b><small>${mio ? 'La tua proposta' : esc(P(p.by).nome)} · ${fa(p.creato || Date.now())}</small></div></div>
      ${p.chiusa ? `<div class="deciso">✅ Deciso: <b>${esc(p.scelta)}</b></div>` : ''}
      ${ops.length ? `<div class="ops">${ops.map(riga).join('')}</div>` : `<div class="empty">Ancora nessuna idea: scrivi la prima qui sotto.</div>`}
      ${p.chiusa ? '' : `<form class="addop" data-prop="${p.id}"><input maxlength="60" placeholder="+ Aggiungi un'idea" enterkeyhint="done" aria-label="Nuova idea"><button class="tap" aria-label="Aggiungi l'idea">＋</button></form>`}
      <div class="pf"><small>${votanti} su ${ids.length} ${votanti === 1 ? 'ha votato' : 'hanno votato'}${p.chiusa || !ops.length ? '' : ' · puoi sceglierne più di una'}</small><span class="pfa">${az}</span></div></div>`;
  }
  // Scheda Oggi: le proposte (delle ultime 2 settimane) che aspettano il mio voto e quelle decise nelle ultime ore.
  function propOggi(cls) {
    const ieri = Date.now() - 20 * 36e5;
    const da = S.proposte.filter(p => !p.chiusa && (p.creato || 0) > Date.now() - 14 * 864e5 && !haVotato(p, S.me) && (opzioniDi(p).length || p.by !== S.me)).sort((a, b) => (b.creato || 0) - (a.creato || 0));
    const dec = S.proposte.filter(p => p.chiusa && (p.decisa || 0) > ieri);
    if (!da.length && !dec.length) return '';
    return `<button class="card tap${cls}" data-vaiprop="1"><h2><span class="ttl"><i class="ic">🗳️</i>Proposte</span> <small>${da.length ? `${da.length} da votare ›` : 'vedi ›'}</small></h2>
      ${da.slice(0, 3).map(p => `<div class="po" style="--pc:${col(p.by)}"><span class="gav">${avt(p.by)}</span><span>${(PTIPO[p.tipo] || PTIPO.altro).e} ${esc(p.q)}</span></div>`).join('')}
      ${dec.slice(0, 2).map(p => `<div class="po" style="--pc:${col(p.by)}"><span class="gav">${avt(p.by)}</span><span>✅ ${esc(p.q)} <b>${esc(p.scelta)}</b></span></div>`).join('')}</button>`;
  }

  /* Regali: ognuno scrive la sua lista; gli altri segnano cosa prendono e possono lasciare idee segrete.
     Chi riceve non vede né chi ha preso cosa né le idee segrete (stanno in "sorprese", chiuse per lui). */
  function rRegali() {
    const ord = (a, b) => (b.creato || 0) - (a.creato || 0);
    const card = (p, i) => {
      const mio = p === S.me;
      const lista = S.regali.filter(r => r.per === p).sort(ord);
      const sp = S.sorprese[p] || {}, presi = sp.presi || {};
      const idee = mio ? [] : Object.entries(sp.idee || {}).filter(([, v]) => v && v.x).map(([id, v]) => Object.assign({ id, idea: 1 }, v)).sort(ord);
      const tutti = [...lista, ...idee];
      const presiN = mio ? 0 : tutti.filter(r => presi[r.id]).length;
      const riga = (r) => {
        const chi = mio ? '' : presi[r.id];
        const link = /^https?:\/\//i.test(r.n || '');
        const nota = r.n ? (link ? `<a class="glink" href="${esc(r.n)}" target="_blank" rel="noopener">Apri il link ›</a>` : `<div class="n">${esc(r.n)}</div>`) : '';
        const tag = r.idea ? `<div class="n">🤫 Idea di ${r.by === S.me ? 'te' : esc(P(r.by).nome)}: siete d'accordo?</div>` : '';
        let az = '';
        if (r.idea) {
          const voti = r.voti || {}, si = Object.keys(voti).filter(k => voti[k] === 'si' && S.persone[k] && k !== r.by), no = Object.keys(voti).filter(k => voti[k] === 'no' && S.persone[k] && k !== r.by);
          const mioV = r.by === S.me ? 'si' : voti[S.me];
          const chiV = (l) => l.map(k => `<i style="--pc:${col(k)}">${avt(k)}</i>`).join('');
          az = r.by === S.me ? `<span class="voti"><span class="vt si on">👍 ${si.length + 1}</span><span class="vt">👎 ${no.length}</span></span>`
            : `<span class="voti"><button class="vt tap${mioV === 'si' ? ' on si' : ''}" data-voto="si" data-idea="${r.id}" data-per="${p}" aria-label="D'accordo">👍 ${si.length + 1}</button><button class="vt tap${mioV === 'no' ? ' on no' : ''}" data-voto="no" data-idea="${r.id}" data-per="${p}" aria-label="Non d'accordo">👎 ${no.length}</button></span>`;
        } else if (mio) az = `<button class="gx tap" data-delreg="${r.id}" aria-label="Togli dalla lista">✕</button>`;
        else if (chi && chi !== S.me) az = `<span class="preso">🎁 Lo prende ${esc(P(chi).nome)}</span>`;
        else az = `<button class="prendo tap${chi === S.me ? ' on' : ''}" data-prendo="${r.id}" data-per="${p}">${chi === S.me ? '✓ Lo prendo io' : 'Lo prendo io'}</button>`;
        const via = r.idea && r.by === S.me ? `<button class="gx tap" data-delidea="${r.id}" data-per="${p}" aria-label="Togli l'idea">✕</button>` : '';
        const lg = r.lego && r.lego.num ? r.lego : null;
        const lgImg = lg ? (lg.img && /^https:\/\/cdn\.rebrickable\.com\//.test(lg.img) ? `<img class="lgimg" src="${esc(lg.img)}" alt="" loading="lazy">` : '<span class="lgimg lgph">🧱</span>') : '';
        const lgRiga = lg ? `<div class="n">${legoInfo(lg)} · <a class="glink" href="${LEGO_URL}#/set/${encodeURIComponent(lg.num)}" target="_blank" rel="noopener">Scheda ›</a></div>` : '';
        return `<div class="gi${r.idea ? ' idea' : ''}${lg ? ' lg' : ''}${r.id === fresh ? ' pop' : ''}${chi ? ' taken' : ''}">${lgImg}<div class="gt"><div class="t">${esc(r.x)}</div>${lgRiga}${nota}${tag}</div><div class="ga">${az}${via}</div></div>`;
      };
      return `<div class="card gift${seen.has(vista()) ? '' : ' rise'}" style="--pc:${col(p)};--i:${Math.min(i, 6)}">
        <h2><span class="gh"><span class="gav">${avt(p)}</span>${mio ? 'La mia lista' : 'Per ' + esc(P(p).nome)}</span><small>${mio ? tutti.length : `${presiN} su ${tutti.length} presi`}</small></h2>
        ${tutti.length ? `<div>${tutti.map(riga).join('')}</div>` : `<div class="empty">${mio ? 'Scrivi cosa ti piacerebbe ricevere: un libro, una felpa, un\'esperienza.' : 'Non ha ancora scritto niente. Puoi lasciare un\'idea segreta.'}</div>`}
        ${mio ? `<div class="hint">🤫 Gli altri segnano cosa ti regalano, ma tu non lo vedi: resta una sorpresa.</div>` : ''}
        <button class="link tap" data-addreg="${p}">${mio ? '+ Aggiungi un desiderio' : `+ Idea segreta per ${esc(P(p).nome)}`}</button></div>`;
    };
    return `<div class="stack">${[S.me, ...IDS().filter(i => i !== S.me)].map(card).join('')}</div>`;
  }

  /* ---------- Ricordi: viaggi, pranzi, cinema, feste… con foto e video originali ----------
     (nel database restano le raccolte "viaggi" e "foto": ogni ricordo ha un "tipo") */
  // [chiave, emoji, nome (uno), nome corto per i gruppi]
  const TIPI = [['viaggio', '✈️', 'Viaggio', 'Viaggi'], ['pranzo', '🍝', 'Pranzo o cena', 'Pranzi'], ['cinema', '🎬', 'Cinema o spettacolo', 'Cinema'], ['feste', '🎄', 'Natale o festa', 'Feste'],
    ['compleanno', '🎂', 'Compleanno', 'Compleanni'], ['uscita', '🚶', 'Uscita o gita', 'Uscite'], ['altro', '✨', 'Altro', 'Altro']];
  const TIPO = Object.fromEntries(TIPI.map(([k, e, n, c]) => [k, { e, n, c }]));
  const tipoDi = (v) => TIPO[v.tipo] ? v.tipo : 'viaggio';
  let filtroR = 'tutti';
  const mb = (n) => n > 1048576 * 1024 ? (n / 1073741824).toFixed(1).replace('.', ',') + ' GB' : Math.max(0.1, n / 1048576).toFixed(1).replace('.', ',') + ' MB';
  const durata = (s) => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '';
  const fotoDi = (v) => S.foto.filter(f => f.v === v).sort((a, b) => (a.quando || 0) - (b.quando || 0));
  const cuoriN = (f) => Object.values(f.cuori || {}).filter(Boolean).length;
  function periodo(v) {
    const o = { day: 'numeric', month: 'long', year: 'numeric' };
    if (!v.a || v.a === v.da) return fmt(v.da, o);
    if (v.da.slice(0, 7) === v.a.slice(0, 7)) return `${+v.da.slice(8)}–${fmt(v.a, o)}`;
    return `${fmt(v.da, { day: 'numeric', month: 'short' })} – ${fmt(v.a, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }
  const copertina = (v) => S.foto.find(f => f.id === v.cop && f.v === v.id && f.prev) || fotoDi(v.id).find(f => f.prev);
  const avs = (who) => `<span class="avs">${(who || []).filter(p => S.persone[p]).map(p => `<i style="--pc:${col(p)}">${avt(p)}</i>`).join('')}</span>`;
  function rViaggi() {
    const tutti = [...S.viaggi].sort((a, b) => (b.da || '').localeCompare(a.da || ''));
    const conta = (k) => tutti.filter(v => tipoDi(v) === k).length;
    if (filtroR !== 'tutti' && !conta(filtroR)) filtroR = 'tutti';
    const list = filtroR === 'tutti' ? tutti : tutti.filter(v => tipoDi(v) === filtroR);
    const gruppi = TIPI.filter(([k]) => conta(k));
    let anno = null, html = '';
    list.forEach((v, i) => {
      const y = (v.da || '').slice(0, 4);
      if (y !== anno) { anno = y; html += `<div class="anno${ri(i + 2)}">${esc(y)}</div>`; }
      const cop = copertina(v), fs = fotoDi(v.id), nv = fs.filter(f => f.video).length, t = TIPO[tipoDi(v)];
      html += `<button class="trip tap${v.id === fresh ? ' pop' : ri(i + 2)}" data-viaggio="${v.id}">
        <span class="cov">${cop ? `<img src="${esc(cop.prev || cop.url)}" alt="" loading="lazy" decoding="async">` : `<span class="noimg">${t.e}</span>`}<span class="tb">${t.e} ${esc(t.n)}</span><span class="nf">${fs.length - nv} foto${nv ? ` · ${nv} video` : ''}</span></span>
        <span class="tinfo"><b>${esc(v.t)}</b><span class="muted">${v.dove ? '📍 ' + esc(v.dove) + ' · ' : ''}${periodo(v)}</span>${avs(v.who)}</span></button>`;
    });
    $('#p-viaggi').innerHTML = `<div class="stack"><h2 class="${ri(0)}"><span class="ttl"><i class="ic">📸</i>I nostri ricordi</span> <small>${tutti.length}</small></h2>
      <label class="auto-album tap${ri(1)}"><input type="file" id="autoIn" accept="image/*,video/*" multiple hidden><span class="aa-ic">🪄</span><span><b>Aggiungi foto e video</b><small>Vanno da soli nel ricordo del giorno giusto</small></span></label>
      ${gruppi.length > 1 ? `<div data-n="${gruppi.length + 1}" class="gruppi${ri(1)}"><button class="gr tap${filtroR === 'tutti' ? ' on' : ''}" data-filtror="tutti"><b>🗂️</b><span>Tutti</span><small>${tutti.length}</small></button>${gruppi.map(([k, e, n, c]) => `<button class="gr tap${filtroR === k ? ' on' : ''}" data-filtror="${k}" aria-label="${esc(n)}"><b>${e}</b><span>${esc(c)}</span><small>${conta(k)}</small></button>`).join('')}</div>` : ''}
      ${html || '<div class="empty big"><b>📸</b><span>Ancora nessun ricordo. Tocca + per aggiungerne uno: un viaggio, un pranzo, una sera al cinema, il Natale… Poi caricate foto e video tutti insieme.</span></div>'}</div>`;
  }
  // "Un anno fa…": una foto di un viaggio passato nello stesso periodo, altrimenti una a caso (la stessa per tutto il giorno).
  function ricordo(cls) {
    const conFoto = S.foto.filter(f => f.prev && f.quando > 0);
    if (!conFoto.length) return '';
    // Anniversario più vicino (anche a cavallo di Capodanno: una foto del 30 dicembre vale il 2 gennaio).
    const oggi = new Date(); oggi.setHours(12, 0, 0, 0);
    const anniv = (f) => { const d = new Date(f.quando || 0);
      return [-1, 0, 1].map(k => { const y = oggi.getFullYear() + k, a = new Date(y, d.getMonth(), d.getDate(), 12); return { anni: y - d.getFullYear(), giorni: Math.abs(Math.round((a - oggi) / 864e5)) }; })
        .filter(x => x.anni >= 1).sort((a, b) => a.giorni - b.giorni)[0]; };
    const vicini = conFoto.filter(f => { const x = anniv(f); return x && x.giorni <= 3; });
    const pool = vicini.length ? vicini : conFoto;
    const seme = [...T].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const f = [...pool].sort((a, b) => (a.id < b.id ? -1 : 1))[seme % pool.length];
    const v = S.viaggi.find(x => x.id === f.v); if (!v) return '';
    const anni = vicini.length ? anniv(f).anni : 0;
    const titolo = vicini.length ? (anni === 1 ? 'Un anno fa' : `${anni} anni fa`) : 'Un ricordo';
    return `<button class="card memo tap${cls}" data-viaggio="${v.id}" data-apri-foto="${f.id}"><img src="${esc(f.prev)}" alt="" loading="lazy" decoding="async"><span class="mtx"><small>${titolo}</small><b>${esc(v.t)}</b></span></button>`;
  }

  /* ---------- La pagina di una persona: si calcola da sola con i dati che ci sono già ---------- */
  let persId = null;
  const persAperto = () => $('#persona').classList.contains('on');
  function openPersona(id) {
    if (!S.persone[id]) return;
    persId = id;
    if (!persAperto()) history.pushState({ schermo: 'persona' }, '');
    rPersona(true); $('#persona').scrollTop = 0; $('#persona').classList.add('on'); $('#fab').classList.add('via');
  }
  function closePersona(daIndietro) {
    if (!persAperto()) return;
    $('#persona').classList.remove('on'); if (!impAperto() && !tripAperto() && !mioAperto()) $('#fab').classList.remove('via');
    if (daIndietro !== true && history.state && history.state.schermo) { ignoraPop++; history.back(); }
  }
  function rPersona(nuova) {
    const id = persId, p = S.persone[id];
    if (!p) { closePersona(); return; }
    const mio = id === S.me, ora = oraAdesso(), suoi = (e) => (e.who || []).includes(id);
    const sr = (i) => nuova ? ` rise" style="--i:${Math.min(i, 8)}` : '';
    const giorni = [...Array(14)].map((_, i) => iso(addDays(TODAY, i))), dom = giorni[1];
    const per = giorni.map(d => [d, delGiorno(d, suoi).filter(e => d !== T || !e.h || inCorso(e, d) || (e.fine || e.h) >= ora)]).filter(([, l]) => l.length);
    const sett = giorni.slice(0, 7).reduce((n, d) => n + delGiorno(d, e => suoi(e) && !e.virtuale).length, 0); // la scuola e le note di scuola non contano
    const c = S.cena[id];
    const pezzi = [statoOra(id).t,
      sett === 0 ? 'Settimana tranquilla' : sett >= 6 ? `Settimana piena: ${sett} impegni` : `${sett} ${sett === 1 ? 'impegno' : 'impegni'} in 7 giorni`,
      c === 'si' ? 'Stasera a cena 🍝' : c === 'no' ? 'Stasera non a cena' : fuoriCena(id) ? `Stasera non a cena · ${fuoriCena(id).perche}`
        : rientro(id) ? `A casa verso le ${rientro(id).ora}, in tempo per cena` : 'Per la cena non ha ancora risposto'];
    const prop = S.proposte.filter(p => p.by === id).sort((a, b) => (b.creato || 0) - (a.creato || 0)).slice(0, 3);
    const desideri = S.regali.filter(r => r.per === id).sort((a, b) => (b.creato || 0) - (a.creato || 0));
    const ricordi = S.viaggi.filter(v => suoi(v)).sort((a, b) => (b.da || '').localeCompare(a.da || ''));
    const fileN = S.foto.filter(f => f.by === id).length;
    $('#persIn').style.setProperty('--pc', col(id)); // il colore della persona (non nello stile degli elementi animati: ne hanno già uno)
    $('#persIn').innerHTML = `
     <div class="imp-top"><button class="back tap" id="persBack"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Indietro</button></div>
     <div class="phero${sr(0)}"><span class="pav">${avt(id)}</span><div><h1>${esc(p.nome)}${mio ? ' <small>(tu)</small>' : ''}</h1>
       <div class="riass">${pezzi.map(x => `<span>${esc(x)}</span>`).join('')}</div></div></div>
     <div class="sec${sr(1)}">Prossimi impegni</div>
     <div class="card${sr(1)}">${per.length ? per.slice(0, 5).map(([d, l]) => `<div class="pg"><small>${d === T ? 'Oggi' : d === dom ? 'Domani' : fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')}</small>${evList(l, '', d)}</div>`).join('') : '<div class="empty">Niente nei prossimi 14 giorni.</div>'}</div>
     <div class="sec${sr(2)}">${mio ? 'Le tue proposte' : 'Le sue proposte'}</div>
     <div class="card${sr(2)}">${prop.length ? prop.map(p => { const v = inTesta(p); return `<p class="pn">${(PTIPO[p.tipo] || PTIPO.altro).e} ${esc(p.q)}<small>${p.chiusa ? `✅ Deciso: ${esc(p.scelta)}` : v ? `In testa: ${esc(v.x)}` : 'Ancora senza voti'}</small></p>`; }).join('') : `<div class="empty">${mio ? 'Non hai' : 'Non ha'} ancora fatto proposte.</div>`}</div>
     <div class="sec${sr(3)}">Lista dei desideri</div>
     <div class="card${sr(3)}">${desideri.length ? `<div class="pdes">${desideri.slice(0, 5).map(r => `<span>🎁 ${esc(r.x)}</span>`).join('')}</div>` : `<div class="empty">${mio ? 'La tua lista è ancora vuota.' : 'La sua lista è ancora vuota.'}</div>`}
       <button class="link tap" data-listareg="${id}">${mio ? 'Apri la tua lista' : 'Apri la lista' + (desideri.length ? ' e scegli cosa prendere' : '')} ›</button></div>
     <div class="sec${sr(4)}">Ricordi insieme</div>
     ${ricordi.length ? `<div class="pric${sr(4)}">${ricordi.slice(0, 4).map(v => { const cop = copertina(v), t = TIPO[tipoDi(v)]; return `<button class="tap" data-viaggio="${v.id}">${cop ? `<img src="${esc(cop.prev || cop.url)}" alt="" loading="lazy" decoding="async">` : `<span class="noimg">${t.e}</span>`}<b>${esc(v.t)}</b></button>`; }).join('')}</div>` : `<div class="card${sr(4)}"><div class="empty">Ancora nessun ricordo insieme.</div></div>`}
     <div class="empty pfoot${sr(5)}">📷 ${fileN} ${fileN === 1 ? 'foto o video caricato' : 'foto e video caricati'} · ${ricordi.length} ${ricordi.length === 1 ? 'ricordo' : 'ricordi'}</div>`;
  }

  /* Schermata di un viaggio (entra da destra come le Impostazioni) */
  let tripId = null, carico = null, tripHtml = '';
  let selFoto = null; // null = non sto scegliendo; altrimenti l'insieme delle foto scelte da salvare
  const tripAperto = () => $('#trip').classList.contains('on');
  function openTrip(id, alPostoDelFoglio) {
    tripId = id; tripHtml = ''; selFoto = null; gruppi = null; statoSalva = null;
    // Aperto subito dopo un foglio: il passo del foglio diventa quello del ricordo (il tasto indietro resta giusto).
    if (alPostoDelFoglio) history.replaceState({ schermo: 'viaggio' }, '');
    else if (!tripAperto()) history.pushState({ schermo: 'viaggio' }, '');
    rTrip(); $('#trip').scrollTop = 0; $('#trip').classList.add('on'); $('#fab').classList.add('via');
    setTimeout(() => riparaAnteprime(fotoDi(id)), 900);
  }
  function closeTrip(daIndietro) {
    if (!tripAperto()) return;
    selFoto = null; gruppi = null; statoSalva = null; $('#trip').classList.remove('on'); if (!impAperto() && !persAperto() && !mioAperto()) $('#fab').classList.remove('via');
    if (daIndietro !== true && history.state && history.state.schermo) { ignoraPop++; history.back(); }
  }
  function rTrip() {
    const v = S.viaggi.find(x => x.id === tripId);
    if (!v) { if (tripAperto()) closeTrip(); return; }
    const fs = fotoDi(v.id), cop = copertina(v), t = TIPO[tipoDi(v)], nv = fs.filter(f => f.video).length;
    const html = `
     <div class="imp-top"><button class="back tap" id="tripBack"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Ricordi</button><button class="link tap" data-modviaggio="${v.id}">Modifica</button></div>
     <div class="hero">${cop ? `<img src="${esc(cop.disp || (cop.video ? cop.prev : cop.url))}" alt="">` : `<span class="noimg">${t.e}</span>`}<span class="tb">${t.e} ${esc(t.n)}</span><div class="hinfo"><h1>${esc(v.t)}</h1><span>${v.dove ? '📍 ' + esc(v.dove) + ' · ' : ''}${periodo(v)}</span>${avs(v.who)}</div></div>
     ${carico ? `<div class="prog" style="--p:${carico.pct}"><span>Carico… ${carico.fatte} di ${carico.tot} · ${Math.round(carico.pct * 100)}%</span><i></i></div>`
       : `<label class="btn tap filebtn add-foto">📷 Aggiungi foto e video<input type="file" id="fotoIn" accept="image/*,video/*" multiple hidden></label>`}
     ${fs.length ? `<div class="sech"><div class="sec">${fs.length - nv} foto${nv ? ` · ${nv} video` : ''} · originali</div><button class="link tap" id="selOn">${selFoto ? 'Fine' : '⬇️ Salva in galleria'}</button></div><div class="grid${selFoto ? ' scegli' : ''}">${fs.map(f => { const n = cuoriN(f); return `<button id="ph-${f.id}" class="ph tap${f.id === fresh ? ' pop' : ''}${selFoto && selFoto.has(f.id) ? ' sel' : ''}" data-foto="${f.id}" style="--pc:${col(f.by)}">${f.prev ? `<img src="${esc(f.prev)}" alt="" loading="lazy" decoding="async">` : '<span class="noimg">🎞️</span>'}<i></i>${f.video ? `<em>▶ ${durata(f.durata)}</em>` : ''}${n ? `<b>❤️ ${n}</b>` : ''}<s class="ck" aria-hidden="true">✓</s></button>`; }).join('')}${upTiles()}</div>${selFoto ? barraSel(fs) : ''}`
       : carico ? `<div class="grid">${upTiles()}</div>` : '<div class="empty big"><b>📷</b><span>Ancora niente. Tocca "Aggiungi foto e video" e scegline quanti vuoi dalla galleria: entrano originali, a qualità piena.</span></div>'}`;
    if (html !== tripHtml) { tripHtml = html; $('#tripIn').innerHTML = html; }
  }
  // Scegliere foto e video da salvare in galleria: tocco per scegliere, "Tutte", poi Salva.
  function barraSel(fs) {
    const scelte = fs.filter(f => selFoto.has(f.id)), peso = scelte.reduce((n, f) => n + (f.size || 0), 0);
    return `<div class="selbar" id="selBar"><button class="tap" id="selTutte">${scelte.length === fs.length ? 'Nessuna' : 'Tutte'}</button>
      ${statoSalva ? `<button class="btn tap" id="selSalva"${statoSalva.attesa ? ' disabled' : ''}>${statoSalva.testo}</button>`
        : `<button class="btn tap" id="selSalva"${scelte.length ? '' : ' disabled'}>${scelte.length ? `Salva ${scelte.length}${peso ? ' · ' + mb(peso) : ''}` : 'Tocca le foto'}</button>`}</div>`;
  }
  function aggiornaSel() {
    const fs = fotoDi(tripId);
    document.querySelectorAll('#tripIn .ph').forEach(b => b.classList.toggle('sel', selFoto.has(b.dataset.foto)));
    const bar = $('#selBar'); if (bar) bar.outerHTML = barraSel(fs);
    tripHtml = $('#tripIn').innerHTML; // così il prossimo disegno non rifà la griglia per niente
  }
  /* Salvare tante foto: su iPhone si apre "Condividi" con tutti i file insieme ("Salva N elementi" li mette in Foto).
     L'iPhone apre Condividi solo subito dopo un tocco: i file si preparano a gruppi (max 20 o 300 MB) e per ogni gruppo
     basta toccare "Apri Salva". Sugli altri telefoni (Samsung) si scaricano uno per uno: finiscono nella Galleria, album Download. */
  let gruppi = null; // { lista: [[f...]], i, pronti: File[] | null }
  const iPhone = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  async function preparaGruppo() {
    const g = gruppi.lista[gruppi.i], files = [];
    for (let k = 0; k < g.length; k++) {
      const f = g[k];
      setSalva(`Preparo ${gruppi.i * 20 + k + 1} di ${gruppi.tot}…`, true);
      const blob = await (await fetch(f.url)).blob();
      files.push(new File([blob], f.nome || (f.video ? `ricordo-${k + 1}.mp4` : `ricordo-${k + 1}.jpg`), { type: blob.type || f.tipoFile || 'application/octet-stream' }));
    }
    gruppi.pronti = files;
    setSalva(gruppi.lista.length > 1 ? `📲 Apri Salva (gruppo ${gruppi.i + 1} di ${gruppi.lista.length})` : '📲 Apri Salva', false);
  }
  // Lo stato del tasto resta anche se la pagina si ridisegna (un cuore, una foto nuova): così non si può toccare due volte.
  let statoSalva = null;
  function setSalva(testo, attesa) { statoSalva = testo == null ? null : { testo, attesa }; const b = $('#selSalva'); if (b && statoSalva) { b.textContent = testo; b.disabled = attesa; } }
  async function salvaScelte() {
    const fs = fotoDi(tripId).filter(f => selFoto.has(f.id)); if (!fs.length) return;
    if (gruppi && gruppi.pronti) {
      try { await navigator.share({ files: gruppi.pronti }); }
      catch (e) { if (e && e.name === 'AbortError') return; if (e && e.name === 'NotAllowedError') return toast('Tocca di nuovo per salvare'); toast('Non sono riuscito ad aprire Salva'); return; }
      gruppi.i++; gruppi.pronti = null;
      if (gruppi.i >= gruppi.lista.length) { gruppi = null; setSalva(null); selFoto = null; tripHtml = ''; rTrip(); return toast('Salvate in galleria 🎉'); }
      return preparaGruppo().catch(() => { gruppi = null; setSalva(null); toast('Una foto non si è scaricata. Riprova.'); aggiornaSel(); });
    }
    const prova = new File([new Blob(['x'], { type: 'image/jpeg' })], 'x.jpg', { type: 'image/jpeg' });
    if (iPhone && navigator.canShare && navigator.canShare({ files: [prova] })) {
      const lista = []; let cur = [], peso = 0;
      for (const f of fs) { if (cur.length && (cur.length >= 20 || peso + (f.size || 0) > 300 * 1048576)) { lista.push(cur); cur = []; peso = 0; } cur.push(f); peso += f.size || 0; }
      lista.push(cur);
      gruppi = { lista, i: 0, pronti: null, tot: fs.length };
      return preparaGruppo().catch(() => { gruppi = null; setSalva(null); toast('Una foto non si è scaricata. Riprova.'); aggiornaSel(); });
    }
    // Samsung e computer: un file alla volta nei Download.
    let falliti = 0;
    for (let k = 0; k < fs.length; k++) {
      const f = fs[k]; setSalva(`Scarico ${k + 1} di ${fs.length}…`, true);
      try {
        const blob = await (await fetch(f.url)).blob();
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.nome || (f.video ? `ricordo-${k + 1}.mp4` : `ricordo-${k + 1}.jpg`);
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 20000);
        await new Promise(r => setTimeout(r, 400));
      } catch (e) { falliti++; }
    }
    setSalva(null); selFoto = null; tripHtml = ''; rTrip();
    const ok = fs.length - falliti;
    toast(!falliti ? `Fatto: ${ok} file nella Galleria, album Download` : ok ? `${ok} file nella Galleria, ${falliti} non scaricati: riprova con quelli` : 'Non sono riuscito a scaricarli. Riprova.');
  }
  // I file che si stanno caricando: la copia sul telefono con una barretta che si riempie.
  const upTiles = () => carico && carico.items ? carico.items.map(it => `<span id="up-${it.k}" class="ph up" data-up="${it.k}" style="--p:${it.pct}">${it.url ? `<img src="${it.url}" alt="">` : `<span class="noimg">${it.video ? '🎞️' : '🖼️'}</span>`}<u class="upb"></u></span>`).join('') : '';
  function sheetViaggio(v) {
    v = v || { t: '', dove: '', da: T, a: '', who: IDS(), tipo: filtroR !== 'tutti' ? filtroR : 'viaggio' };
    const fs = v.id ? fotoDi(v.id) : [], altrui = fs.some(f => f.by !== S.me), tp = tipoDi(v);
    openSheet(`<h3>${v.id ? 'Modifica il ricordo' : 'Nuovo ricordo'}</h3><form class="stack" id="fVi" data-id="${v.id || ''}">
     <label>Che cos'è</label><div class="tipi">${TIPI.map(([k, e, n]) => `<button type="button" class="tp tap${k === tp ? ' on' : ''}" data-tipo="${k}"><b>${e}</b>${esc(n)}</button>`).join('')}</div>
     <label>Nome<input id="viT" required maxlength="60" value="${esc(v.t)}" placeholder="Es. Natale dai nonni, Pizza del sabato"></label>
     <label>Dove (facoltativo)<input id="viD" maxlength="60" value="${esc(v.dove)}" placeholder="Città, ristorante, cinema…"></label>
     <div class="row2"><label>Quando<input id="viDa" type="date" required value="${esc(v.da)}"></label><label>Fino al (facoltativo)<input id="viA" type="date" value="${esc(v.a || '')}"></label></div>
     <label>Chi c'era</label>${pickHtml(v.who || [])}
     <button class="btn tap">${v.id ? 'Salva' : 'Crea il ricordo'}</button>
     ${v.id && v.creatoDa === S.me ? (altrui ? '<div class="empty">Si può eliminare solo quando dentro ci sono soltanto le tue foto e i tuoi video.</div>' : `<button type="button" class="btn bad tap" data-delviaggio="${v.id}">Elimina il ricordo${fs.length ? ` e i ${fs.length} file` : ''}</button>`) : ''}
    </form>`, () => { if (!v.id) setTimeout(() => $('#viT').focus(), 380); });
  }

  // Foto profilo: ritaglio quadrato 512 px (piccola, si carica subito), nello spazio foto in profili/<persona>/.
  async function caricaAvatar(file) {
    if (!DATI.fotoPronte()) return toast('Lo spazio delle foto non è ancora pronto.');
    let im;
    try { im = await apriImmagine(file); } catch (e) { return toast('Questa foto non si apre: provane un\'altra (JPEG o PNG).'); }
    toast('Carico la foto…');
    try {
      const w = im.im.naturalWidth, h = im.im.naturalHeight, lato = Math.min(w, h), c = document.createElement('canvas');
      c.width = c.height = Math.min(512, lato);
      const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
      x.drawImage(im.im, (w - lato) / 2, (h - lato) / 2, lato, lato, 0, 0, c.width, c.height);
      URL.revokeObjectURL(im.u);
      const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', .86));
      const old = P(S.me).fotoPath, path = `profili/${S.me}/${rid()}.jpg`;
      const r = await DATI.carica(path, blob, S.me);
      await DATI.imposta('persone', S.me, { foto: r.url, fotoPath: path });
      if (old && old !== path) DATI.eliminaFile(old);
      toast('Foto messa: la vedono tutti');
    } catch (e) { console.error(e); toast('Non sono riuscito a caricarla. Riprova tra poco.'); }
  }

  /* Caricare foto e video: il file ORIGINALE va nello spazio foto così com'è (qualità piena);
     in più si fa sul telefono una piccola anteprima per la griglia (e per le foto HEIC una copia JPEG grande da guardare). */
  function apriImmagine(file) {
    return new Promise((ok, ko) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => ok({ im, u }); im.onerror = () => { URL.revokeObjectURL(u); ko(new Error('immagine')); }; im.src = u; });
  }
  async function rimpicciolisci(im, max, q, w0, h0) {
    w0 = w0 || im.naturalWidth || im.videoWidth; h0 = h0 || im.naturalHeight || im.videoHeight;
    const k = Math.min(1, max / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(im, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    return { blob, w: c.width, h: c.height };
  }
  // Fotogramma del video per l'anteprima (se il telefono non ci riesce, il video entra lo stesso).
  // Vero se l'immagine è quasi tutta nera (succede su iPhone quando il fotogramma non è ancora pronto).
  async function nero(src) {
    try {
      const im = src instanceof Blob ? await createImageBitmap(src) : src;
      const c = document.createElement('canvas'); c.width = c.height = 16;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0, 16, 16);
      const d = x.getImageData(0, 0, 16, 16).data; let l = 0;
      for (let k = 0; k < d.length; k += 4) l += d[k] * .3 + d[k + 1] * .59 + d[k + 2] * .11;
      return l / 256 < 10;
    } catch (e) { return false; }
  }
  /* Fotogramma del video per l'anteprima. Su iPhone il fotogramma va prima "svegliato": il video sta nella pagina
     (invisibile), parte e si ferma, poi si salta al punto voluto e si aspetta che sia disegnato.
     Se esce nero si riprova più avanti nel video. Se il telefono non ci riesce, il video entra lo stesso. */
  function fotogramma(file) {
    return new Promise((ok) => {
      const u = URL.createObjectURL(file), vd = document.createElement('video'); let fatto = false, prove = 0;
      vd.style.cssText = 'position:fixed;left:0;top:0;width:4px;height:4px;opacity:.01;pointer-events:none;z-index:-1';
      const dati = () => ({ durata: vd.duration, W: vd.videoWidth, H: vd.videoHeight });
      const fine = (r) => { if (fatto) return; fatto = true; try { vd.pause(); } catch (e) {} vd.remove(); URL.revokeObjectURL(u); ok(r); };
      const disegnato = () => new Promise(res => { if (vd.requestVideoFrameCallback) vd.requestVideoFrameCallback(() => res()); setTimeout(res, 450); });
      const salta = () => { const dur = vd.duration || 3; vd.currentTime = Math.min(dur * 0.9, [0.6, 1.5, 3][prove] || 0.6); };
      vd.muted = true; vd.defaultMuted = true; vd.playsInline = true; vd.setAttribute('playsinline', ''); vd.setAttribute('muted', ''); vd.preload = 'auto';
      vd.onloadeddata = async () => {
        if (vd._via) return; vd._via = 1;
        try { await vd.play(); vd.pause(); } catch (e) {}
        salta();
      };
      vd.onseeked = async () => {
        await disegnato();
        try {
          const r = await rimpicciolisci(vd, 520, 0.8);
          if (await nero(r.blob) && ++prove < 3) return salta();
          r.buona = !(await nero(r.blob));
          fine(Object.assign(r, dati()));
        } catch (e) { fine(dati()); }
      };
      vd.onerror = () => fine({}); setTimeout(() => fine(dati()), 12000);
      document.body.appendChild(vd); vd.src = u; vd.load();
    });
  }
  /* Le anteprime nere dei video già caricati (prima della correzione): chi ha caricato il video, aprendo il ricordo,
     le rifà da solo dall'originale. Una volta controllata, l'anteprima è segnata "prevOk" e non si guarda più. */
  const controllate = new Set();
  async function riparaAnteprime(fs) {
    for (const f of fs) {
      if (!f.video || f.by !== S.me || f.prevOk || controllate.has(f.id) || !f.url) continue;
      controllate.add(f.id);
      try {
        let buio = true;
        if (f.prev) { const im = new Image(); im.crossOrigin = 'anonymous'; im.src = f.prev; await im.decode(); buio = await nero(im); }
        if (!buio) { await DATI.aggiorna('foto', f.id, { prevOk: true }); continue; }
        if ((f.size || 0) > 400 * 1024 * 1024) continue; // troppo grande da riscaricare sul telefono
        const blob = await (await fetch(f.url)).blob();
        const r = await fotogramma(new File([blob], f.nome || 'video', { type: f.tipoFile || blob.type }));
        if (!r.blob || !r.buona) continue;
        const base = (f.path || `foto/${f.v}/${f.id}`).replace(/\.[^./]+$/, '');
        const b = await DATI.carica(`${base}_p${rid().slice(0, 5)}.jpg`, r.blob, S.me);
        const vecchia = f.pathP;
        await DATI.aggiorna('foto', f.id, { prev: b.url, pathP: b.path, prevOk: true });
        if (vecchia) DATI.eliminaFile(vecchia);
      } catch (e) { console.warn('anteprima', e); }
    }
  }
  async function dataScatto(file) {
    try {
      const t = new TextDecoder('latin1').decode(await file.slice(0, 131072).arrayBuffer());
      const m = t.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (m) { const d = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(); if (m[1] > 1990 && d < Date.now() + 864e5) return d; }
      // Video dell'iPhone: la data di ripresa è scritta come "2026-10-03T18:42:10+0200", spesso in fondo al file.
      if (/^video\//.test(file.type) || /\.(mov|mp4)$/i.test(file.name)) {
        const coda = file.size > 262144 ? new TextDecoder('latin1').decode(await file.slice(file.size - 262144).arrayBuffer()) : '';
        const v = (t + coda).match(/(20\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)([+-]\d\d:?\d\d|Z)?/);
        if (v) { const d = new Date(v[7] ? `${v[1]}-${v[2]}-${v[3]}T${v[4]}:${v[5]}:${v[6]}${v[7].length === 5 ? v[7].slice(0, 3) + ':' + v[7].slice(3) : v[7]}` : new Date(+v[1], v[2] - 1, +v[3], +v[4], +v[5], +v[6])).getTime(); if (d > 0 && d < Date.now() + 864e5) return d; }
      }
    } catch (e) {}
    return file.lastModified || Date.now();
  }
  /* Album automatici (31/10/2026): si scelgono tante foto e video insieme e ognuno va da solo nel ricordo
     del giorno in cui è stato scattato. Per un giorno senza ricordo se ne crea uno nuovo, col nome dell'impegno
     di famiglia di quel giorno se c'era (es. "Cena di compleanno"), altrimenti con la data. Prima di caricare si vede il piano. */
  const TIPO_DA = [[/cinema|film|teatro|concerto|spettacolo/i, 'cinema'], [/compleann|birthday/i, 'compleanno'], [/natale|capodanno|pasqua|festa/i, 'feste'],
    [/cena|pranzo|aperitivo|ristorante|pizza|grigliata/i, 'pranzo'], [/viaggio|vacanza|ferie|volo/i, 'viaggio'], [/gita|uscita|passeggiata|mare|montagna|lago|parco/i, 'uscita']];
  const NON_RICORDO = /medic|dottor|dentist|visita|analisi|esam|prelievo|ospedal|terapi|psicolog|fisioterap|banca|avvocat|notai|commercialist|colloqui|riunione|condominio|scuola|lezione|lavoro|turno|revisione|tagliando|spesa grande|occupato/i;
  let piano = null; // [{ giorno, v (id esistente) | nuovo {t, tipo, who}, files }]
  async function preparaAlbum(files) {
    if (!DATI.fotoPronte()) return toast('Lo spazio delle foto non è ancora attivo.');
    const list = [...files].filter(f => /^(image|video)\//.test(f.type) || /\.(heic|heif|jpe?g|png|mov|mp4)$/i.test(f.name)).slice(0, 120);
    if (!list.length) return;
    if (files.length > 120) toast('Ne metto a posto 120 alla volta: poi scegli gli altri');
    toast('Guardo le date delle foto…');
    const perGiorno = {};
    for (const f of list) { const g = iso(new Date(await dataScatto(f))); (perGiorno[g] = perGiorno[g] || []).push(f); }
    piano = Object.keys(perGiorno).sort().map(g => {
      const dentro = S.viaggi.filter(v => v.da && g >= v.da && g <= (v.a && v.a >= v.da ? v.a : v.da))
        .sort((a, b) => ((a.a || a.da) > a.da ? 1 : 0) - ((b.a || b.da) > b.da ? 1 : 0)); // prima quelli di un giorno solo
      if (dentro.length) return { giorno: g, v: dentro[0].id, files: perGiorno[g] };
      // L'impegno con più persone di quel giorno, ma non visite, lavoro, scuola e simili (non sono ricordi).
      const adatto = (e) => !e.nascosto && !/^orario:/.test(e.fonte || '') && !NON_RICORDO.test(e.t || '');
      const ev = delGiorno(g, e => adatto(e) && ((e.who || []).length >= 2 || (e.who || []).includes(S.me)))
        .sort((a, b) => (b.who || []).length - (a.who || []).length)[0];
      const t = ev ? ev.t.slice(0, 60) : 'Ricordo del ' + fmt(g, { day: 'numeric', month: 'long' });
      const tipo = ev ? ((TIPO_DA.find(([re]) => re.test(ev.t)) || [])[1] || 'uscita') : 'altro';
      return { giorno: g, nuovo: { t, tipo, who: ev && ev.who && ev.who.length ? ev.who.filter(i => S.persone[i]) : [S.me] }, files: perGiorno[g] };
    });
    // Più giorni di fila senza ricordo e senza impegni (es. un weekend) diventano un ricordo solo.
    const uniti = [];
    piano.forEach(x => {
      const u = uniti[uniti.length - 1];
      if (u && u.nuovo && x.nuovo && u.nuovo.tipo === 'altro' && x.nuovo.tipo === 'altro' && iso(addDays(new Date((u.fino || u.giorno) + 'T12:00:00'), 1)) === x.giorno) {
        u.fino = x.giorno; u.files.push(...x.files); u.nuovo.t = u.giorno.slice(0, 7) === x.giorno.slice(0, 7) ? `Ricordo del ${+u.giorno.slice(8)}–${fmt(x.giorno, { day: 'numeric', month: 'long' })}`
          : `Ricordo dal ${fmt(u.giorno, { day: 'numeric', month: 'long' })} al ${fmt(x.giorno, { day: 'numeric', month: 'long' })}`;
      } else uniti.push(x);
    });
    piano = uniti;
    sheetAlbum();
  }
  function sheetAlbum() {
    if (!piano) return;
    const conta = (fs) => { const nv = fs.filter(f => /^video\//.test(f.type) || /\.(mov|mp4)$/i.test(f.name)).length; return `${fs.length - nv} foto${nv ? ` · ${nv} video` : ''}`; };
    openSheet(`<h3>Metto a posto ${piano.reduce((a, x) => a + x.files.length, 0)} file</h3>
      <div class="empty">Ognuno va nel ricordo del giorno in cui è stato scattato.</div>
      <div class="piano">${piano.map((x, i) => { const v = x.v && S.viaggi.find(y => y.id === x.v), t = TIPO[v ? tipoDi(v) : x.nuovo.tipo];
        return `<div class="abr"><span class="abe">${t.e}</span><span class="abt"><b>${esc(v ? v.t : x.nuovo.t)}</b><small>${v ? 'Ricordo che c\'è già' : '✨ Ricordo nuovo'} · ${fmt(x.giorno, { day: 'numeric', month: 'short' })}${x.fino ? ' – ' + fmt(x.fino, { day: 'numeric', month: 'short' }) : ''}</small></span><span class="abn">${conta(x.files)}</span></div>`; }).join('')}</div>
      <button class="btn tap" id="albumVai">Metti tutto a posto</button>
      <div class="empty">I ricordi nuovi si possono rinominare dopo, dal loro tasto Modifica.</div>`);
  }
  async function caricaAlbum() {
    const p = piano; piano = null; if (!p) return;
    const foglio = aperto() && history.state && history.state.foglio;
    closeSheet(true); let primo = true;
    for (const x of p) {
      let v = x.v;
      if (!v) {
        try { v = await DATI.aggiungi('viaggi', { t: x.nuovo.t, dove: '', da: x.giorno, a: x.fino || '', who: x.nuovo.who.length ? x.nuovo.who : [S.me], tipo: x.nuovo.tipo, creatoDa: S.me, creato: Date.now() }); }
        catch (er) { sbaglio(er); continue; }
      }
      openTrip(v, primo && foglio && !tripAperto()); primo = false;
      // Tutti i file del giorno, 60 alla volta (prima se ne perdevano oltre i 60).
      let ok = 0;
      for (let i = 0; i < x.files.length; i += 60) ok += (await caricaFoto(x.files.slice(i, i + 60), v)) || 0;
      // Un ricordo nuovo rimasto vuoto (nessun file entrato, es. tutti doppioni) si toglie.
      if (!x.v && !ok && !fotoDi(v).length) await DATI.elimina('viaggi', v).catch(() => {});
    }
  }
  const MOSTRABILI = /^image\/(jpeg|png|webp|gif)$/;
  /* Caricamento: 3 file alla volta. Per ogni file l'originale parte subito, l'anteprima si prepara intanto.
     Ogni file compare subito nella griglia (copia sul telefono con la sua barretta) e la pagina non si ridisegna:
     cambiano solo i pezzi diversi. */
  async function caricaFoto(files, perV) {
    if (!DATI.fotoPronte()) return toast('Lo spazio delle foto non è ancora attivo.');
    // Doppioni: un file con lo stesso nome e la stessa grandezza c'è già nei ricordi, non si carica di nuovo.
    const gia = new Set(S.foto.map(f => (f.nome || '') + '|' + (f.size || 0)));
    const tutti = [...files].filter(f => /^(image|video)\//.test(f.type) || /\.(heic|heif|jpe?g|png|mov|mp4)$/i.test(f.name));
    const doppi = tutti.filter(f => gia.has((f.name || '').slice(0, 80) + '|' + f.size)).length;
    if (doppi) toast(doppi === 1 ? 'Un file c\'era già: non lo carico di nuovo' : `${doppi} file c'erano già: non li carico di nuovo`);
    const v = perV || tripId, list = tutti.filter(f => !gia.has((f.name || '').slice(0, 80) + '|' + f.size)).slice(0, 60); let ok = 0, rotto = false;
    if (!list.length) return 0;
    if (files.length > 60) toast('Ne carico 60 alla volta: poi aggiungi gli altri');
    const totB = list.reduce((a, f) => a + f.size, 0) || 1, fatti = {};
    const items = list.map((file, k) => {
      const video = /^video\//.test(file.type) || /\.(mov|mp4)$/i.test(file.name);
      // La copia sul telefono solo per le prime 9: con 60 foto a piena risoluzione l'iPhone finirebbe la memoria.
      return { k, file, video, url: k < 9 && !video && MOSTRABILI.test(file.type) ? URL.createObjectURL(file) : '', pct: 0 };
    });
    carico = { fatte: 0, tot: list.length, pct: 0, items }; rTrip();
    const avanti = () => {
      carico.pct = Math.min(1, Object.values(fatti).reduce((a, b) => a + b, 0) / totB);
      const el = $('#tripIn .prog'); if (el) { el.style.setProperty('--p', carico.pct); el.querySelector('span').textContent = `Carico… ${carico.fatte} di ${carico.tot} · ${Math.round(carico.pct * 100)}%`; }
    };
    const uno = async (it) => {
      const { file, video } = it;
      const quando = await dataScatto(file), id = rid() + rid();
      const ext = ((file.name.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || (video ? 'mp4' : 'jpg')).toLowerCase();
      const segna = (b) => { fatti[it.k] = b; it.pct = b / (file.size || 1); const t = document.querySelector(`#tripIn [data-up="${it.k}"]`); if (t) t.style.setProperty('--p', it.pct); avanti(); };
      // L'originale parte subito (è la parte lunga); intanto si prepara l'anteprima.
      const orig = DATI.modo === 'prova' ? Promise.resolve({ url: '', path: '' }) : DATI.carica(`foto/${v}/${id}.${ext}`, file, S.me, segna);
      // Se qualcosa va storto dopo la partenza, si tolgono i file già caricati (niente file "orfani" che occupano spazio).
      const caricati = [];
      try {
      let anteprima = {}, vista = null;
      if (video) anteprima = await fotogramma(file);
      else {
        // Se il telefono non sa aprire la foto (es. HEIC su Android) l'originale entra lo stesso, senza anteprima.
        try {
          const { im, u } = await apriImmagine(file);
          anteprima = await rimpicciolisci(im, 520, 0.8); anteprima.W = im.naturalWidth; anteprima.H = im.naturalHeight;
          if (!MOSTRABILI.test(file.type) && DATI.modo !== 'prova') vista = await rimpicciolisci(im, 3000, 0.92); // HEIC: copia da guardare anche su Android
          URL.revokeObjectURL(u);
        } catch (e) { if (DATI.modo === 'prova') throw e; anteprima = {}; }
      }
      const doc = { v, by: S.me, video, nome: (file.name || `ricordo.${ext}`).slice(0, 80), tipoFile: file.type || '', size: file.size, w: anteprima.W || 0, h: anteprima.H || 0, quando, creato: Date.now(), cuori: {} };
      if (video && anteprima.durata) doc.durata = Math.round(anteprima.durata);
      const [p, d] = await Promise.all([
        anteprima.blob ? DATI.carica(`foto/${v}/${id}_p.jpg`, anteprima.blob, S.me).then(r => (caricati.push(r.path), r)) : null,
        vista ? DATI.carica(`foto/${v}/${id}_v.jpg`, vista.blob, S.me).then(r => (caricati.push(r.path), r)) : null]);
      if (p) { doc.prev = p.url; doc.pathP = p.path; if (!video || anteprima.buona) doc.prevOk = true; }
      if (d) { doc.disp = d.url; doc.pathD = d.path; }
      const a = await orig;
      if (DATI.modo === 'prova') { doc.url = video ? URL.createObjectURL(file) : doc.prev; doc.path = ''; }
      else { doc.url = a.url; doc.path = a.path; }
      segna(file.size);
      // La copia sul telefono lascia il posto a quella vera senza ridisegnare la pagina.
      carico.items = carico.items.filter(x => x !== it);
      fresh = await DATI.aggiungi('foto', doc);
      if (it.url) setTimeout(() => URL.revokeObjectURL(it.url), 4000);
      ok++;
      } catch (e) {
        orig.then(a => DATI.eliminaFile(a.path)).catch(() => {}); caricati.forEach(x => DATI.eliminaFile(x));
        throw e;
      }
    };
    const coda = [...items];
    const lavora = async () => {
      while (coda.length && !rotto) {
        const it = coda.shift();
        try { await uno(it); }
        catch (e) {
          console.error(e); fatti[it.k] = it.file.size; carico.items = carico.items.filter(x => x !== it); rTrip();
          if (!ok && e && /^storage\//.test(e.code || '')) rotto = true;
        }
        carico.fatte++; avanti();
      }
    };
    await Promise.all([lavora(), lavora(), lavora()]);
    carico = null; rTrip();
    if (rotto && !ok) { toast('Lo spazio delle foto non risponde. Chiudi e riapri l\'app, poi riprova.'); return 0; }
    if (ok) { toast(ok === 1 ? 'Aggiunto 📷' : `${ok} tra foto e video aggiunti 📷`); festa($('#tripIn .hero')); }
    if (ok < list.length) setTimeout(() => toast(`${list.length - ok} file non sono entrati. Riprova.`), 2300);
    return ok;
  }

  /* Visore: foto a tutto schermo, si scorre di lato, doppio tocco per ingrandire, giù per chiudere */
  let vis = null; // { lista: [id], i }
  const visAperto = () => $('#viewer').classList.contains('on');
  function openViewer(id) {
    const f = S.foto.find(x => x.id === id); if (!f) return;
    const lista = fotoDi(f.v).map(x => x.id);
    vis = { lista, i: Math.max(0, lista.indexOf(id)) };
    history.pushState({ schermo: 'foto' }, '');
    rViewer(); $('#viewer').classList.add('on');
  }
  function closeViewer(daIndietro) {
    if (!visAperto()) return;
    $('#vtrack').querySelectorAll('video').forEach(x => x.pause());
    $('#viewer').classList.remove('on'); vis = null; $('#vtrack').innerHTML = '';
    if (daIndietro !== true && history.state && history.state.schermo) { ignoraPop++; history.back(); }
  }
  function rViewer() {
    if (!vis) return;
    vis.lista = vis.lista.filter(id => S.foto.some(f => f.id === id));
    if (!vis.lista.length) return closeViewer();
    vis.i = Math.min(vis.i, vis.lista.length - 1);
    const slide = (k, pos) => {
      const f = S.foto.find(x => x.id === vis.lista[k]); if (!f) return '';
      const dentro = f.video ? `<video class="vv" src="${esc(f.url)}"${f.prev ? ` poster="${esc(f.prev)}"` : ''} controls playsinline preload="metadata"></video>`
        : `${f.prev ? `<img class="vp" src="${esc(f.prev)}" alt="">` : ''}<img class="vb" src="${esc(f.disp || f.url)}" alt="">`;
      return `<div class="vs" style="transform:translateX(${pos * 100}%)">${dentro}</div>`;
    };
    // Si ridisegna solo se cambia la foto (così un video non riparte quando arriva un cuore).
    const chiave = vis.lista.slice(Math.max(0, vis.i - 1), vis.i + 2).join() + '|' + vis.i;
    if (chiave !== vis.chiave) {
      vis.chiave = chiave;
      $('#vtrack').querySelectorAll('video').forEach(x => x.pause());
      $('#vtrack').style.transition = 'none'; $('#vtrack').style.transform = '';
      $('#vtrack').innerHTML = slide(vis.i - 1, -1) + slide(vis.i, 0) + slide(vis.i + 1, 1);
    }
    const f = S.foto.find(x => x.id === vis.lista[vis.i]), mio = f.by === S.me, cuore = (f.cuori || {})[S.me], v = S.viaggi.find(x => x.id === f.v) || {};
    $('#vcount').textContent = `${vis.i + 1} di ${vis.lista.length}`;
    $('#vbar').innerHTML = `<div class="vwho"><span class="chip" style="--pc:${col(f.by)}"><i></i>${esc(P(f.by).nome)}</span><small>${new Date(f.quando || f.creato).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}${f.size ? ` · originale ${mb(f.size)}` : ''}</small></div>
      <div class="vacts"><button class="vb-btn tap${cuore ? ' on' : ''}" data-cuore="${f.id}" aria-label="Mi piace">${cuore ? '❤️' : '🤍'}<span>${cuoriN(f) || ''}</span></button>
      <button class="vb-btn tap" data-salva="${f.id}" aria-label="Scarica l'originale">⬇️</button>
      ${v.cop !== f.id && f.prev ? `<button class="vb-btn tap" data-cop="${f.id}" aria-label="Usa come copertina">🖼️</button>` : ''}
      ${mio ? `<button class="vb-btn tap" data-delfoto="${f.id}" aria-label="Togli la foto">🗑️</button>` : ''}</div>`;
  }
  (() => {
    const vw = $('#viewer'), tr = $('#vtrack'); let x0 = null, y0 = 0, dx = 0, dy = 0, asse = null, t0 = 0, ultimoTap = 0;
    vw.addEventListener('touchstart', e => {
      if (e.touches.length > 1 || e.target.closest('.vbar,.vtop')) { x0 = null; return; }
      const sotto = e.target.closest('video'); if (sotto && e.touches[0].clientY > innerHeight - 140) { x0 = null; return; } // barra dei comandi del video
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = dy = 0; asse = null; t0 = Date.now();
    }, { passive: true });
    vw.addEventListener('touchmove', e => {
      if (x0 == null) return;
      dx = e.touches[0].clientX - x0; dy = e.touches[0].clientY - y0;
      if (!asse && Math.hypot(dx, dy) > 8) asse = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (!asse || vw.querySelector('.vs .vb.zoom')) return;
      e.preventDefault(); tr.style.transition = 'none';
      if (asse === 'x') { const bordo = (dx > 0 && vis.i === 0) || (dx < 0 && vis.i === vis.lista.length - 1); tr.style.transform = `translateX(${bordo ? dx / 3 : dx}px)`; }
      else if (dy > 0) { tr.style.transform = `translateY(${dy}px) scale(${1 - Math.min(dy, 300) / 1200})`; vw.style.setProperty('--bg-o', String(1 - Math.min(dy, 300) / 400)); }
    }, { passive: false });
    vw.addEventListener('touchend', e => {
      if (x0 == null) return; x0 = null;
      const dt = Date.now() - t0;
      if (!asse && dt < 250) { // tocco: doppio tocco = ingrandisci
        if (Date.now() - ultimoTap < 300) {
          const im = [...vw.querySelectorAll('.vs')].find(x => x.style.transform === 'translateX(0%)');
          const vb = im && im.querySelector('.vb'); if (!vb) return;
          const tt = e.changedTouches[0], r = vb.getBoundingClientRect();
          vb.style.transformOrigin = `${tt.clientX - r.left}px ${tt.clientY - r.top}px`; vb.classList.toggle('zoom'); ultimoTap = 0;
        } else ultimoTap = Date.now();
        return;
      }
      tr.style.transition = ''; vw.style.removeProperty('--bg-o');
      if (asse === 'x') {
        const dir = dx < 0 ? 1 : -1, veloce = Math.abs(dx) / Math.max(1, dt) > 0.4;
        const k = vis.i + dir;
        if ((Math.abs(dx) > 80 || (veloce && Math.abs(dx) > 30)) && k >= 0 && k < vis.lista.length) {
          tr.style.transform = `translateX(${-dir * 100}%)`;
          tr.querySelectorAll('video').forEach(x => x.pause());
          setTimeout(() => { vis.i = k; rViewer(); }, 260);
        } else tr.style.transform = '';
      } else if (asse === 'y') {
        if (dy > 120) closeViewer(); else tr.style.transform = '';
      }
    });
  })();
  // Scarica l'ORIGINALE: su iPhone e Android si apre "Condividi" per salvarlo in Foto/Galleria.
  // L'iPhone apre "Condividi" solo subito dopo un tocco: se scaricare il file ha richiesto tempo, il file resta pronto e basta un secondo tocco.
  let pronto = null; // { id, file }
  async function salvaFoto(f) {
    const nome = f.nome || (f.video ? 'ricordo.mp4' : 'ricordo.jpg');
    try {
      let file = pronto && pronto.id === f.id ? pronto.file : null;
      if (!file) {
        toast(f.size > 30 * 1048576 ? `Preparo il file (${mb(f.size)})…` : 'Preparo il file…');
        const blob = await (await fetch(f.url)).blob();
        file = new File([blob], nome, { type: blob.type || f.tipoFile || 'application/octet-stream' });
        pronto = { id: f.id, file };
      }
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file] }); pronto = null; return; }
        catch (e) { if (e && e.name === 'NotAllowedError') return toast('Pronto: tocca di nuovo ⬇️ per salvarlo'); throw e; }
      }
      const blob = file;
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    } catch (e) { if (e && e.name === 'AbortError') return; window.open(f.url, '_blank'); }
  }

  // "adesso", "5 min fa", "2 ore fa", "ieri", "lun 3 nov"
  function fa(ms) {
    const m = Math.round((Date.now() - ms) / 60000);
    if (m < 1) return 'adesso';
    if (m < 60) return `${m} min fa`;
    if (m < 60 * 12 || new Date(ms).toDateString() === new Date().toDateString()) return `${Math.round(m / 60)} ${Math.round(m / 60) === 1 ? 'ora' : 'ore'} fa`;
    const ieri = new Date(); ieri.setDate(ieri.getDate() - 1);
    if (new Date(ms).toDateString() === ieri.toDateString()) return 'ieri';
    return new Date(ms).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  /* Ricette di famiglia (31/10/2026): una pagina aperta a tutti, con foto, ingredienti e preparazione;
     un tocco e gli ingredienti scelti vanno nella lista della spesa (quelli già in lista non si doppiano). */
  let segSpesa = LS.get('noi4-spesa', 'lista') === 'ricette' ? 'ricette' : 'lista', ricAperta = null, ricHo = {};
  const ingredienti = (r) => (r.ingr || []).filter(x => typeof x === 'string' && x.trim()).slice(0, 60);
  const ricEmoji = (t) => /pizza/i.test(t) ? '🍕' : /torta|dolce|biscott|tiramis|crostata/i.test(t) ? '🍰' : /pasta|spaghett|lasagn|gnocch|risott/i.test(t) ? '🍝' : /zuppa|minestr|brodo/i.test(t) ? '🍲' : /insalat|verdur/i.test(t) ? '🥗' : /carne|pollo|arrost|polpett/i.test(t) ? '🍗' : /pesce|salmone|tonno/i.test(t) ? '🐟' : '🍳';
  function rRicette() {
    const l = [...S.ricette].sort((a, b) => (a.t || '').localeCompare(b.t || '', 'it'));
    return `<div class="ricette${ri(1)}">${l.map((r, i) => `<button class="ric tap${r.id === fresh ? ' pop' : ''}" data-ric="${r.id}" style="--i:${Math.min(i, 8)}">
        <span class="rcov">${r.foto ? `<img src="${esc(r.foto)}" alt="" loading="lazy" decoding="async">` : `<span class="noimg">${ricEmoji(r.t || '')}</span>`}</span>
        <span class="rinfo"><b>${esc(r.t)}</b><small>${ingredienti(r).length} ingredienti${r.by ? ` · di ${r.by === S.me ? 'te' : esc(P(r.by).nome)}` : ''}</small></span></button>`).join('')}</div>
      ${l.length ? '' : '<div class="empty big"><b>🍳</b><span>Ancora nessuna ricetta. Tocca + per scrivere i piatti di casa: foto, ingredienti e come si fa. Poi con un tocco gli ingredienti vanno nella spesa.</span></div>'}`;
  }
  function sheetRicetta(id, aggiorna) {
    const r = S.ricette.find(x => x.id === id); if (!r) { if (aggiorna) { ricAperta = null; } return; }
    if (aggiorna && !document.querySelector(`#sheetIn [data-ricv="${id}"]`)) return;
    ricAperta = id;
    const ing = ingredienti(r), ho = ricHo[id] || {};
    const inLista = new Set(S.spesa.filter(x => !x.done).map(x => chiave(x.x)));
    const scelti = ing.filter((x, i) => !ho[i] && !inLista.has(chiave(x))).length;
    const html = `<div data-ricv="${id}">${r.foto ? `<img class="rfoto" src="${esc(r.foto)}" alt="">` : ''}<div class="rtesta"><h3>${ricEmoji(r.t || '')} ${esc(r.t)}</h3>
      ${r.porz ? `<div class="empty">Per ${esc(r.porz)}</div>` : ''}</div>
      <div class="sec">Ingredienti</div>
      <div class="hint">Togli quelli che avete già in casa: gli altri vanno nella spesa.</div>
      <div class="ingr">${ing.map((x, i) => { const gia = inLista.has(chiave(x)); return `<button type="button" class="ig tap${ho[i] || gia ? '' : ' on'}${gia ? ' gia' : ''}" data-ing="${i}" data-ric-id="${id}"${gia ? ' disabled' : ''}><span class="box"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span>${esc(x)}${gia ? ' <small>già in lista</small>' : ''}</span></button>`; }).join('') || '<div class="empty">Nessun ingrediente scritto.</div>'}</div>
      <button class="btn tap" id="ricSpesa" data-ric-id="${id}"${scelti ? '' : ' disabled'}>🛒 ${scelti ? `Metti ${scelti === 1 ? '1 ingrediente' : scelti + ' ingredienti'} nella spesa` : 'Tutto già in lista'}</button>
      ${r.come ? `<div class="sec">Come si fa</div><div class="come">${esc(r.come)}</div>` : ''}
      <div class="ricaz"><button type="button" class="btn ghost tap" data-ricmod="${id}">Modifica</button><button type="button" class="link tap" data-ricdel="${id}">Elimina la ricetta</button></div></div>`;
    if (aggiorna) { $('#sheetIn').innerHTML = `<div class="grab"></div>` + html; return; }
    openSheet(html);
  }
  function sheetNuovaRicetta(id) {
    const r = (id && S.ricette.find(x => x.id === id)) || {};
    ricAperta = null; riFile = null;
    openSheet(`<h3>${r.id ? 'Modifica la ricetta' : 'Una ricetta di casa'}</h3><form class="stack" id="fRi"${r.id ? ` data-id="${r.id}"` : ''}>
      <label class="rfotoin tap">${r.foto ? `<img src="${esc(r.foto)}" alt="" id="riPrev">` : '<span id="riPrev" class="noimg">📷</span>'}<span>${r.foto ? 'Cambia la foto' : 'Aggiungi una foto del piatto'}</span><input type="file" id="riFoto" accept="image/*" hidden></label>
      <label>Nome del piatto<input id="riT" required maxlength="60" value="${esc(r.t || '')}" placeholder="Es. Lasagne della nonna"></label>
      <label>Per quante persone (facoltativo)<input id="riP" maxlength="20" value="${esc(r.porz || '')}" placeholder="Es. 4 persone"></label>
      <label>Ingredienti, uno per riga<textarea id="riI" rows="7" maxlength="3000" placeholder="500 g di farina&#10;3 uova&#10;Latte">${esc(ingredienti(r).join('\n'))}</textarea></label>
      <label>Come si fa (facoltativo)<textarea id="riC" rows="5" maxlength="4000" placeholder="I passaggi, i trucchi di casa…">${esc(r.come || '')}</textarea></label>
      <button class="btn tap">${r.id ? 'Salva' : 'Salva la ricetta'}</button></form>`, () => { if (!r.id) setTimeout(() => $('#riT').focus(), 380); });
  }
  let riFile = null;
  function rSpesa() {
    if (segSpesa === 'ricette') {
      $('#p-spesa').innerHTML = `<div class="stack"><div class="seg" style="--n:2;--k:1"><i class="spill"></i><button class="tap" data-segspesa="lista">Lista 🛒</button><button class="tap on" data-segspesa="ricette">Ricette 🍳</button></div>${rRicette()}</div>`;
      return;
    }
    const ord = (a, b) => (b.creato || 0) - (a.creato || 0);
    const todo = S.spesa.filter(x => !x.done).sort(ord), done = S.spesa.filter(x => x.done).sort(ord);
    const chi = (id) => id === S.me ? 'te' : esc(P(id).nome);
    const sotto = x => x.done && x.presoDa ? `preso da ${chi(x.presoDa)}${x.preso ? ' · ' + fa(x.preso) : ''}` : `aggiunto da ${chi(x.by)}${x.creato ? ' · ' + fa(x.creato) : ''}`;
    const row = x => `<button class="item tap${x.done ? ' done' : ''}${x.id === fresh ? ' pop' : ''}" data-item="${x.id}" style="--pc:${col(x.done && x.presoDa ? x.presoDa : x.by)}"><span class="box"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="tx"><span class="nm">${esc(x.x)}</span><small>${sotto(x)}</small></span><span class="who">${S.persone[x.done && x.presoDa ? x.presoDa : x.by] ? avt(x.done && x.presoDa ? x.presoDa : x.by) : ''}</span></button>`;
    const keep = $('#itemTx') ? $('#itemTx').value : '';
    $('#p-spesa').innerHTML = `<div class="stack"><div class="seg" style="--n:2;--k:0"><i class="spill"></i><button class="tap on" data-segspesa="lista">Lista 🛒</button><button class="tap" data-segspesa="ricette">Ricette 🍳</button></div>
     <form class="add${ri(0)}" id="addItem"><input id="itemTx" placeholder="Cosa serve?" autocomplete="off" aria-label="Cosa serve" enterkeyhint="done"><button class="btn tap">Aggiungi</button></form>
     <div class="card${ri(1)}"><h2><span class="ttl"><i class="ic">🛒</i>Da prendere</span> <small>${todo.length}</small></h2><div>${todo.map(row).join('') || '<div class="empty">Niente da prendere.</div>'}</div></div>
     ${done.length ? `<div class="card${ri(2)}"><h2><span class="ttl"><i class="ic">✅</i>Già nel carrello</span> <button class="link tap" id="clear">Togli</button></h2><div>${done.map(row).join('')}</div></div>` : ''}
    </div>`;
    $('#itemTx').value = keep;
  }

  const R = { oggi: rOggi, cal: rCal, note: rNote, viaggi: rViaggi, spesa: rSpesa };
  const GEAR = '<span class="gear" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>';
  function render() {
    if (!S.me || !S.persone[S.me]) return;
    const nuovoGiorno = iso(new Date()) !== T;
    if (nuovoGiorno) { const ieri = T; TODAY = new Date(); TODAY.setHours(12, 0, 0, 0); T = iso(TODAY); ascoltaCena(); if (selDay === ieri) { selDay = T; weekStart = inizioSettimana(TODAY); } }
    document.documentElement.style.setProperty('--me', col(S.me));
    $('#hello').innerHTML = `${saluto()}, <span>${esc(P(S.me).nome)}</span>`;
    $('#meBtn').innerHTML = avt(S.me) + GEAR;
    $('#today').textContent = TODAY.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    banner();
    const a = document.activeElement && document.activeElement.id;
    R[page](); seen.add(vista());
    if (impAperto()) rImp();
    if (persAperto()) rPersona();
    if (mioAperto()) rMio();
    pallinoMio();
    if (tripAperto()) rTrip();
    if (visAperto()) rViewer();
    fresh = null;
    if (a === 'itemTx' && $('#itemTx')) $('#itemTx').focus();
    $('#fab').hidden = page === 'spesa' && segSpesa !== 'ricette';
    $('#fab').setAttribute('aria-label', page === 'spesa' && segSpesa === 'ricette' ? 'Nuova ricetta' : page === 'note' ? (seg === 'regali' ? 'Aggiungi un desiderio' : 'Nuova proposta') : page === 'viaggi' ? 'Nuovo ricordo' : 'Nuovo impegno');
  }
  function banner() {
    const b = $('#banner');
    if (DATI.modo === 'prova') { b.hidden = false; b.innerHTML = `<span>Modalità prova: dati di esempio, solo su questo telefono.</span>`; return; }
    const off = !('Notification' in window) || Notification.permission !== 'granted';
    let nascosto = false; try { nascosto = localStorage.getItem('noi4-banner-notifiche') === 'no'; } catch (e) {}
    b.hidden = !off || nascosto;
    if (!b.hidden) b.innerHTML = `<span>Vuoi sapere quando c'è qualcosa di nuovo?</span><button class="tap" id="bnOn">Attiva notifiche</button>`;
  }
  function go(p, daIndietro) {
    // Toccando la scheda già aperta si torna in cima, come nelle app.
    if (p === page) return scrollTo({ top: 0, behavior: 'smooth' });
    // Tasto/gesto "indietro" (Samsung): dalle altre schede torna a Oggi invece di chiudere l'app.
    if (!daIndietro) {
      if (page === 'oggi') history.pushState({ scheda: 1 }, '');
      else if (p === 'oggi' && history.state && history.state.scheda) { ignoraPop++; history.back(); }
    }
    const dir = Math.sign(SCHEDE.indexOf(p) - SCHEDE.indexOf(page));
    page = p; document.documentElement.dataset.page = p;
    document.querySelectorAll('.page').forEach(el => { el.classList.toggle('on', el.id === 'p-' + p); if (el.id === 'p-' + p) el.style.setProperty('--dx', dir * 22 + 'px'); });
    document.querySelectorAll('.tab').forEach((t, i) => { t.classList.toggle('on', t.dataset.p === p); if (t.dataset.p === p) $('#tpill').style.transform = `translateX(${i * 100}%)`; });
    scrollTo({ top: 0 }); render();
  }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.k); toast.k = setTimeout(() => el.classList.remove('on'), 2200); }
  const sbaglio = (e) => { console.error(e); toast('Non sono riuscito a salvare. Riprova tra poco.'); };

  /* ---------- Fogli dal basso ---------- */
  let ignoraPop = 0; // i "torna indietro" fatti dall'app stessa
  const aperto = () => $('#sheet').classList.contains('on');
  function openSheet(html, after) {
    if (!aperto()) history.pushState({ foglio: 1 }, '');
    $('#sheetIn').innerHTML = `<div class="grab"></div>` + html; $('#veil').classList.add('on'); $('#sheet').classList.add('on'); $('#sheet').scrollTop = 0; after && after();
  }
  function closeSheet(daIndietro) {
    if (!aperto()) return;
    $('#veil').classList.remove('on'); $('#sheet').classList.remove('on');
    if (daIndietro !== true && history.state && history.state.foglio) { ignoraPop++; history.back(); }
  }
  $('#veil').onclick = () => closeSheet();
  // Il velo non fa scorrere la pagina sotto.
  $('#veil').addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  addEventListener('popstate', () => { if (ignoraPop) { ignoraPop--; return; } if (visAperto()) closeViewer(true); else if (aperto()) closeSheet(true); else if (tripAperto()) closeTrip(true); else if (mioAperto()) closeMio(true); else if (persAperto()) closePersona(true); else if (impAperto()) closeImp(true); else if (page !== 'oggi') go('oggi', true); });

  // Foglio: si chiude trascinandolo verso il basso, come su iPhone e Android.
  (() => {
    const sh = $('#sheet'), veil = $('#veil'); let y0 = null, dy = 0, t0 = 0;
    sh.addEventListener('touchstart', e => {
      y0 = sh.scrollTop <= 0 && !e.target.closest('input,textarea,select') ? e.touches[0].clientY : null; dy = 0; t0 = Date.now();
    }, { passive: true });
    sh.addEventListener('touchmove', e => {
      if (y0 == null) return;
      dy = e.touches[0].clientY - y0;
      if (dy <= 0) { if (sh.classList.contains('drag')) { sh.classList.remove('drag'); sh.style.transform = ''; veil.style.opacity = ''; } return; }
      e.preventDefault(); sh.classList.add('drag');
      sh.style.transform = `translateY(${dy}px)`; veil.style.opacity = Math.max(0, 1 - dy / 400);
    }, { passive: false });
    sh.addEventListener('touchend', () => {
      if (y0 == null || !sh.classList.contains('drag')) { y0 = null; return; }
      const veloce = dy / Math.max(1, Date.now() - t0) > 0.5;
      sh.classList.remove('drag'); sh.style.transform = ''; veil.style.opacity = '';
      if (dy > 110 || (veloce && dy > 40)) closeSheet();
      y0 = null;
    });
  })();
  const pickHtml = (sel) => `<div class="pick">${IDS().map(i => `<button type="button" class="pk tap${sel.includes(i) ? ' on' : ''}" data-pk="${i}" style="--pc:${col(i)}"><i>${avt(i)}</i>${esc(P(i).nome)}</button>`).join('')}</div>`;

  function sheetEvento(e) {
    e = e || { t: '', d: page === 'cal' ? selDay : T, h: '18:00', fine: '', who: [S.me], n: '', ripeti: '' };
    openSheet(`<h3>${e.id ? 'Modifica impegno' : 'Nuovo impegno'}</h3><form class="stack" id="fEv" data-id="${e.id || ''}">
     <label>Cosa<input id="evT" required maxlength="80" value="${esc(e.t)}" placeholder="Es. visita, partita, compleanno"></label>
     <div class="row2"><label>Giorno<input id="evD" type="date" value="${esc(e.d)}" required></label><label>Si ripete<select id="evR">${Object.entries(RIPETI).map(([k, v]) => `<option value="${k}"${(e.ripeti || '') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>
     <label>Fino al giorno (facoltativo, per più giorni)<input id="evFino" type="date" value="${esc(e.fino || '')}"></label>
     <label class="sw">Tutto il giorno<input type="checkbox" id="evAll"${e.h ? '' : ' checked'}></label>
     <div class="row2" id="evOre"${e.h ? '' : ' hidden'}><label>Dalle<input id="evH" type="time" value="${esc(e.h || '18:00')}"></label><label>Alle (facoltativo)<input id="evF" type="time" value="${esc(e.fine || '')}"></label></div>
     <label>Chi c'è</label>${pickHtml(e.who || [S.me])}
     <label>Come ci andate (facoltativo)</label>${mezziHtml(e.mezzo || '', 'data-mzf')}
     <label>Nota<input id="evN" maxlength="200" value="${esc(e.n)}" placeholder="Facoltativa"></label>
     <label class="sw">⭐ Importante (va in cima a Impegni)<input type="checkbox" id="evImp"${e.imp ? ' checked' : ''}></label>
     <button class="btn tap">${e.id ? 'Salva le modifiche' : 'Salva impegno'}</button></form>`, () => { if (!e.id) setTimeout(() => $('#evT').focus(), 380); });
  }
  function sheetDettaglio(e) {
    const fonte = e.fonte && e.fonte.startsWith('calendario:') ? `Dal calendario di ${esc(P(e.fonte.slice(11)).nome)}` : e.fonte && e.fonte.startsWith('import:') ? `Importato da ${esc(P(e.fonte.slice(7)).nome)}` : e.fonte && e.fonte.startsWith('orario:') ? `Dall'orario di lavoro di ${esc(P(e.fonte.slice(7)).nome)}` : e.scuola ? `Dall'orario scolastico di ${esc(P(e.who[0]).nome)}` : `Aggiunto da ${esc(P(e.creatoDa).nome)}`;
    openSheet(`<h3>${esc(e.t)}</h3>
      <div>${e.scuola ? `Ogni ${fmt(e.d, { weekday: 'long' })}${e.al ? `, fino al ${fmt(e.al, { day: 'numeric', month: 'long' })}` : ''}${e.h ? ` · ${esc(e.h)}–${esc(e.fine)}` : ''}` : `${piuGiorni(e) ? `Dal ${fmt(e.d, { weekday: 'long', day: 'numeric', month: 'long' })} al ${fmt(e.fino, { weekday: 'long', day: 'numeric', month: 'long' })}` : fmt(e.d, { weekday: 'long', day: 'numeric', month: 'long' })}${e.h ? ` · ${esc(e.h)}${e.fine ? '–' + esc(e.fine) : ''}` : ' · tutto il giorno'}${e.ripeti ? ` · ${RIPETI[e.ripeti].toLowerCase()}` : ''}`}</div>
      ${e.n ? `<div class="muted">${esc(e.n)}</div>` : ''}<div class="dots">${chips(e.who || [])}</div><div class="src">${fonte}</div>
      ${e.scuola && S.scuola[e.who[0]] ? `<div class="lez mini">${lezioni(S.scuola[e.who[0]], e.scuola).map(x => `<div class="lz" style="--mc:${coloriMat(S.scuola[e.who[0]])[x.m]}"><span class="lo"><b>${x.da}ª${x.a > x.da ? `–${x.a}ª` : ''}</b>${x.h ? `<small>${esc(x.h)}</small>` : ''}</span><span class="lm"><b>${esc(x.m)}</b></span></div>`).join('')}</div>` : ''}
      ${e.virtuale ? (moduli(S.me).some(m => m.di === e.who[0]) ? `<button class="btn ghost tap" data-apri-mio="1">Apri la sezione Personale</button>` : '') : e.nascosto ? '' : `<button class="star tap${e.imp ? ' on' : ''}" data-impst="${e.id}">${e.imp ? '⭐ Importante: lo vedono tutti in Impegni' : '☆ Segna come importante'}</button>`}
      ${!e.virtuale && (e.fonte === 'import:' + S.me || !(e.fonte || '').startsWith('import:')) ? `<div class="vis" data-mze="${e.id}"><label>Come ci andate</label>${mezziHtml(e.mezzo || '', 'data-mzd')}</div>` : ''}
      ${mioCal(e) ? `<div class="vis" data-vise="${e.id}"><label>Gli altri vedono</label>${segHtml('vis', [['mostra', '👁️ Tutto'], ['nascondi', '🔒 Solo occupato']], e.privato ? 'nascondi' : 'mostra')}
        <div class="empty" id="visPerche">${regolaCal(e.t, regole()).perche} La scelta vale anche per gli altri impegni «${esc(e.t)}».</div></div>` : ''}
      ${modificabile(e) ? `<div class="row2"><button class="btn ghost tap" data-modifica="${e.id}">Modifica</button><button class="btn bad tap" data-elimina="${e.id}">Elimina</button></div>` : `<div class="empty">${e.scuola ? 'Arriva dall\'orario della scuola: cambia quando arriva l\'orario nuovo.' : 'Si cambia dal calendario di chi l\'ha scritto.'}</div>`}`);
  }
  function sheetProposta(tp) {
    const t = PTIPO[tp];
    openSheet(`<h3>Nuova proposta</h3><form class="stack" id="fPr">
     <div class="tipi">${PTIPI.map(([k, e, n]) => `<button type="button" class="tp tap${k === tp ? ' on' : ''}" data-ptipo="${k}"><b>${e}</b>${n}</button>`).join('')}</div>
     <label>La domanda<input id="prQ" required maxlength="80" value="${esc(t.q)}" placeholder="Es. Cinema venerdì sera?"></label>
     <label>Le prime idee <small class="opz">facoltative: poi tutti possono aggiungerne</small></label>
     <div class="prOps" id="prOps">${t.es.map(x => `<input class="prO" maxlength="60" placeholder="Es. ${esc(x)}">`).join('')}</div>
     <button type="button" class="link tap" id="prPiu">+ Un'altra idea</button>
     <button class="btn tap">Proponi a tutti</button></form>`);
  }
  /* LEGO (31/10/2026, per la collezione della sorella): i set si cercano nel catalogo di "I miei LEGO",
     l'app della collezione, che è pubblico. Si scarica solo la prima volta che serve (circa 2 MB). */
  const LEGO_URL = 'https://higghy01.github.io/app-lego/';
  let legoCat = null;
  async function catalogoLego() {
    if (legoCat) return legoCat;
    const r = await fetch(LEGO_URL + 'data/catalog.json'); if (!r.ok) throw new Error('catalogo');
    const d = await r.json(), base = d.imgBase || '';
    legoCat = (d.sets || []).map(x => ({ num: String(x[0]), nome: String(x[1] || ''), anno: x[2] || 0, pezzi: x[4] || 0, img: x[5] ? (/^https:/.test(x[5]) ? x[5] : base + x[5]) : '' }));
    legoCat = legoCat.filter(x => !/^\d{9,}(-\d+)?$/.test(x.num)); // via i libri (codice ISBN al posto del numero del set)
    legoCat.forEach(x => { x.k = (x.num + ' ' + x.nome).toLowerCase(); });
    return legoCat;
  }
  function cercaLego(q) {
    q = q.toLowerCase().trim(); if (!legoCat || q.length < 2) return [];
    const parole = q.split(/\s+/), esatto = (x) => x.num === q || x.num === q + '-1';
    return legoCat.filter(x => parole.every(w => x.k.includes(w)))
      .sort((a, b) => esatto(b) - esatto(a) || (b.anno || 0) - (a.anno || 0)).slice(0, 12);
  }
  const numLego = (n) => String(n || '').replace(/-1$/, '');
  const legoInfo = (l) => `🧱 ${esc(numLego(l.num))}${+l.pezzi ? ` · ${+l.pezzi} pezzi` : ''}${+l.anno ? ` · ${+l.anno}` : ''}`; // solo numeri: niente testo strano dal database
  function risLego() {
    const box = $('#legoRis'); if (!box) return;
    const q = $('#legoQ').value, ris = cercaLego(q);
    box.innerHTML = !legoCat ? '<div class="empty">Carico il catalogo LEGO…</div>' : q.trim().length < 2 ? '<div class="empty">Scrivi almeno due lettere o il numero sulla scatola.</div>'
      : ris.length ? ris.map(x => `<button type="button" class="lr tap" data-legoset="${esc(x.num)}">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : '<span class="lgph">🧱</span>'}<span><b>${esc(x.nome)}</b><small>${legoInfo(x)}</small></span></button>`).join('')
      : '<div class="empty">Nessun set trovato. Prova con un\'altra parola o il numero.</div>';
  }
  function sheetRegalo(per) {
    const mio = per === S.me;
    openSheet(`<h3>${mio ? 'Un desiderio per la mia lista' : 'Idea segreta per ' + esc(P(per).nome)}</h3><form class="stack" id="fRe" data-per="${per}">
     ${mio ? '' : `<div class="hint">🤫 ${esc(P(per).nome)} non la vede: la vedete solo voi altri.</div>`}
     <label>${mio ? 'Cosa ti piacerebbe ricevere' : 'Cosa potremmo regalare'}<input id="reX" required maxlength="80" placeholder="Es. un libro, una felpa, un concerto"></label>
     <label>Dettagli o link (facoltativo)<input id="reN" maxlength="300" placeholder="Taglia, colore, negozio o indirizzo web"></label>
     <div id="legoSel"></div>
     <button type="button" class="btn ghost tap" id="legoOn">🧱 Cerca un set LEGO</button>
     <div id="legoBox" class="legobox" hidden><input id="legoQ" type="search" maxlength="60" autocomplete="off" placeholder="Nome o numero, es. Hogwarts o 76419"><div id="legoRis" class="legoris"></div></div>
     <button class="btn tap">${mio ? 'Aggiungi alla mia lista' : 'Salva l\'idea'}</button></form>`, () => setTimeout(() => $('#reX').focus(), 380));
  }


  /* ---------- Sezione Personale (prova del 31/10/2026) ----------
     Un pulsante uguale per tutti; dentro, cose diverse per ognuno, aggiunte un po' alla volta.
     Per ora c'è "Scuola": l'orario scolastico (scuola/<persona>, lo scrive il programma "Orario scolastico")
     e le note di chi lo usa (compiti: interrogazioni, verifiche, compiti…). Chi è in "copie" vede una copia
     per provarla: l'orario è lo stesso, le note che aggiunge restano sue e le vede solo lui. */
  const TIPI_C = [['interrogazione', '🙋', 'Interrogazione'], ['verifica', '📝', 'Verifica'], ['compito', '📚', 'Compiti'], ['portare', '🎒', 'Da portare'], ['altro', '📌', 'Altro']];
  const TIPO_C = Object.fromEntries(TIPI_C.map(([k, e, n]) => [k, { e, n }]));
  const GG = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const titoloC = (c) => { const t = TIPO_C[c.tipo] || TIPO_C.altro; return c.tipo === 'altro' ? `${t.e} ${c.m}` : c.tipo === 'portare' ? `${t.e} Da portare: ${c.m}` : `${t.e} ${t.n} di ${c.m}`; };
  const gSett = (d) => new Date(d + 'T12:00:00').getDay();
  // Le ore della scuola: "08:00-09:00", una per ora di lezione (1ª, 2ª…). Se mancano, si mostra solo il numero dell'ora.
  // Un giorno può avere orari suoi (oreG: {"1": [...]} per il lunedì, con ricreazioni diverse).
  const oraDi = (s, o, g) => { const l = s.oreG && s.oreG[g] && s.oreG[g].length ? s.oreG[g] : s.ore || []; const m = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(l[o - 1] || (s.ore || [])[o - 1] || ''); return m ? [m[1], m[2]] : null; };
  // Le lezioni di un giorno della settimana (1 = lunedì), con le ore uguali di fila unite: "Lettere, 2ª-3ª".
  function lezioni(s, g) {
    const out = [];
    for (const x of (s.orario || []).filter(x => +x.g === g).sort((a, b) => a.o - b.o)) {
      const p = out[out.length - 1], t = oraDi(s, +x.o, g);
      if (p && p.m === x.m && p.a + 1 === +x.o) { p.a = +x.o; if (t) p.fine = t[1]; }
      else out.push({ m: String(x.m || ''), prof: String(x.prof || ''), da: +x.o, a: +x.o, h: t ? t[0] : '', fine: t ? t[1] : '' });
    }
    return out;
  }
  // Le vacanze: "da|a" (Firestore non tiene liste dentro liste).
  const pause = (s) => (s.pause || []).map(p => String(p).split('|')).filter(p => p.length === 2);
  const inPausa = (s, d) => pause(s).some(p => d >= p[0] && d <= p[1]);
  const aScuola = (s, d) => d >= (s.dal || '') && (!s.al || d <= s.al) && !inPausa(s, d) && lezioni(s, gSett(d)).length > 0;
  // Ogni materia il suo colore, sempre lo stesso (in ordine di come appare nell'orario).
  function coloriMat(s) {
    const m = [...new Set([...(s.orario || [])].sort((a, b) => a.g - b.g || a.o - b.o).map(x => x.m))];
    // Mai il rosso (è il colore di Sasha): le tinte girano tra l'arancio (28) e il magenta (335), partendo dal blu.
    return Object.fromEntries(m.map((x, i) => [x, `hsl(${28 + Math.round(182 + i * 307 / Math.max(1, m.length)) % 307} 62% 56%)`]));
  }
  // Cosa vede una persona nella sua sezione: la sua scuola, o la copia di quella di qualcun altro.
  function moduli(id) {
    const out = [], ok = (s) => s && (s.orario || []).length;
    if (ok(S.scuola[id])) out.push({ k: 'scuola', di: id, copia: false });
    for (const [pid, s] of Object.entries(S.scuola)) if (pid !== id && ok(s) && (s.copie || []).includes(id) && S.persone[pid]) out.push({ k: 'scuola', di: pid, copia: true });
    return out;
  }
  const mieiC = (di) => S.compiti.filter(c => c.per === S.me && (!di || c.di === di) && !c.via);
  // Nel calendario: la scuola di ognuno la vedono tutti (un impegno per giorno della settimana, dalla prima all'ultima ora);
  // le note (interrogazioni, verifiche…) solo chi le ha scritte.
  function eventiScuola() {
    const out = [];
    for (const [pid, s] of Object.entries(S.scuola)) {
      if (!S.persone[pid]) continue;
      for (let g = 1; g <= 6; g++) {
        const l = lezioni(s, g); if (!l.length) continue;
        let d = s.dal ? new Date(s.dal + 'T12:00:00') : addDays(TODAY, -6); while (d.getDay() !== g) d = addDays(d, 1);
        const ore = l.reduce((n, x) => n + x.a - x.da + 1, 0), tutte = l.every(x => x.h);
        out.push({ id: `scuola-${pid}-${g}`, t: '🎒 Scuola', d: iso(d), h: tutte ? l[0].h : '', fine: tutte ? l[l.length - 1].fine : '', who: [pid],
          n: `${ore} ore`, ripeti: 'settimanale', al: s.al || '', pause: pause(s), fonte: `scuola:${pid}`, scuola: g, virtuale: true });
      }
    }
    for (const c of mieiC()) {
      if (c.fatto) continue;
      const s = S.scuola[c.di], lz = s && lezioni(s, gSett(c.d)).find(x => x.m === c.m);
      out.push({ id: `cmp-${c.id}`, t: titoloC(c), d: c.d, h: lz ? lz.h : '', fine: lz ? lz.fine : '', who: [S.me], n: c.x || '', ripeti: '', fonte: 'compito:' + S.me, cmp: c.id, virtuale: true });
    }
    return out;
  }
  const quando = (d) => { const n = Math.round((new Date(d + 'T12:00:00') - TODAY) / 864e5);
    return n === 0 ? 'Oggi' : n === 1 ? 'Domani' : `${fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')} · fra ${n} giorni`; };
  // Il giorno da mostrare: oggi se la scuola non è ancora finita, altrimenti il prossimo giorno di scuola.
  function giornoScuola(s) {
    const ora = oraAdesso();
    for (let i = 0; i < 30; i++) {
      const d = iso(addDays(TODAY, i)); if (!aScuola(s, d)) continue;
      const l = lezioni(s, gSett(d)), fine = l[l.length - 1].fine || '14:00';
      if (i > 0 || ora < fine) return d;
    }
    return T;
  }
  // Le prossime lezioni di una materia, a partire dal giorno "da" (compreso).
  function prossimeLezioni(s, m, da, n) {
    const out = [];
    for (let i = 0; i < 70 && out.length < n; i++) { const d = iso(addDays(new Date(da + 'T12:00:00'), i)); if (aScuola(s, d) && lezioni(s, gSett(d)).some(x => x.m === m)) out.push(d); }
    return out;
  }

  let mioDay = null, mioNuova = false;
  const mioAperto = () => $('#mio').classList.contains('on');
  // alPostoDelFoglio: aperta da un foglio, prende il suo posto nella cronologia (così "indietro" resta giusto).
  function openMio(alPostoDelFoglio) {
    if (alPostoDelFoglio === true && history.state && history.state.foglio) history.replaceState({ schermo: 'mio' }, '');
    else if (!mioAperto()) history.pushState({ schermo: 'mio' }, '');
    mioDay = null; mioNuova = true; rMio(); mioNuova = false;
    $('#mio').scrollTop = 0; $('#mio').classList.add('on'); $('#fab').classList.add('via');
  }
  function closeMio(daIndietro) {
    if (!mioAperto()) return;
    $('#mio').classList.remove('on'); if (!impAperto() && !persAperto() && !tripAperto()) $('#fab').classList.remove('via');
    if (daIndietro !== true && history.state && history.state.schermo) { ignoraPop++; history.back(); }
  }
  // Il pallino sul pulsante: c'è qualcosa per oggi o domani.
  function pallinoMio() {
    const dom = iso(addDays(TODAY, 1)), n = mieiC().filter(c => !c.fatto && (c.d === T || c.d === dom)).length;
    const b = $('#mioBtn'); if (b) { b.classList.toggle('dot', n > 0); b.setAttribute('aria-label', n ? `Personale: ${n} ${n === 1 ? 'cosa' : 'cose'} per oggi o domani` : 'Personale'); }
  }
  function rMio() {
    const sr = (i) => mioNuova ? ` rise" style="--i:${Math.min(i, 8)}` : '';
    const mods = moduli(S.me);
    const corpo = mods.length ? mods.map((m, i) => rScuola(m, sr, i)).join('')
      : `<div class="card mvuoto${sr(1)}"><span class="mbig" aria-hidden="true">✨</span><b>La tua sezione</b><div class="empty">Qui arriveranno cose pensate per te, un po' alla volta.</div></div>`;
    $('#mioIn').innerHTML = `
     <div class="imp-top"><button class="back tap" id="mioBack"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Indietro</button></div>
     <h1 class="hello${sr(0)}">Personale</h1>${corpo}`;
  }
  // La scheda Scuola ha quattro parti, come un diario di scuola: Orario, Agenda, Voti, Materie (scelta di Sasha del 01/11/2026:
  // "praticamente uguale" all'app che usa la sorella).
  const TABS_S = [['orario', 'Orario'], ['agenda', 'Agenda'], ['voti', 'Voti'], ['materie', 'Materie']];
  let scTab = LS.get('noi4-scuola-tab', 'orario'); if (!TABS_S.some(t => t[0] === scTab)) scTab = 'orario';
  function rScuola(m, sr, k) {
    const s = S.scuola[m.di], colM = coloriMat(s), nome = esc(P(m.di).nome);
    const corpo = { orario: scOrario, agenda: scAgenda, voti: scVoti, materie: scMaterie }[scTab](m, s, colM);
    return `${m.copia ? `<div class="hint mprova${sr(k * 3 + 1)}">🧪 Prova: è una copia della sezione di ${nome}. Le note e i voti che aggiungi qui li vedi solo tu.</div>` : ''}
     <div class="sec${sr(k * 3 + 1)}">🎒 Scuola${s.classe ? ` · ${esc(s.classe)}` : ''}</div>
     <div class="sctabs${sr(k * 3 + 2)}">${segHtml('sctab', TABS_S, scTab)}</div>
     <div class="scbody" data-tab="${scTab}">${corpo}</div>`;
  }
  function scOrario(m, s, colM) {
    if (!mioDay || !aScuola(s, mioDay) && mioDay < T) mioDay = giornoScuola(s);
    // La settimana del giorno scelto, dal lunedì all'ultimo giorno con lezioni.
    const ultimo = Math.max(...(s.orario || []).map(x => +x.g)), lun = inizioSettimana(new Date(mioDay + 'T12:00:00'));
    const giorni = [...Array(ultimo)].map((_, i) => iso(addDays(lun, i)));
    const kSel = Math.max(0, giorni.indexOf(mioDay));
    const lz = aScuola(s, mioDay) ? lezioni(s, gSett(mioDay)) : [];
    const note = mieiC(m.di), delGiornoC = note.filter(c => c.d === mioDay);
    return `<div class="card scuola">
       <div class="seg sgiorni" style="--n:${giorni.length};--k:${kSel}"><i class="spill"></i>${giorni.map(d => `<button type="button" class="tap${d === mioDay ? ' on' : ''}${d === T ? ' oggi' : ''}${aScuola(s, d) ? '' : ' no'}" data-mioday="${d}"><small>${GG[gSett(d)]}</small><b>${+d.slice(8)}</b>${note.some(c => c.d === d && !c.fatto) ? '<i class="sdot"></i>' : ''}</button>`).join('')}</div>
       <div class="lgiorno"><b>${mioDay === T ? 'Oggi' : mioDay === iso(addDays(TODAY, 1)) ? 'Domani' : fmt(mioDay, { weekday: 'long', day: 'numeric', month: 'long' })}</b>${lz.length && lz[0].h ? `<small>${esc(lz[0].h)}–${esc(lz[lz.length - 1].fine)}</small>` : ''}</div>
       ${lz.length ? `<div class="lez">${lz.map(x => { const nn = delGiornoC.filter(c => c.m === x.m);
         return `<button type="button" class="lz tap" data-lez="${esc(x.m)}" data-di="${m.di}" style="--mc:${colM[x.m]}"><span class="lo"><b>${x.da}ª${x.a > x.da ? `–${x.a}ª` : ''}</b>${x.h ? `<small>${esc(x.h)}</small>` : ''}</span><span class="lm"><b>${esc(x.m)}</b>${x.prof ? `<small>${esc(x.prof)}</small>` : ''}${nn.length ? `<span class="lzn">${nn.map(c => `<span class="${c.fatto ? 'ok' : ''}">${(TIPO_C[c.tipo] || TIPO_C.altro).e} ${esc((TIPO_C[c.tipo] || TIPO_C.altro).n)}</span>`).join('')}</span>` : ''}</span><span class="lzp" aria-hidden="true">+</span></button>`; }).join('')}</div>
       <div class="empty">Tocca una materia per segnare un'interrogazione, una verifica o i compiti.</div>`
       : `<div class="empty">${inPausa(s, mioDay) ? 'Vacanza: niente scuola 🎉' : 'Niente scuola questo giorno.'}</div>`}
     </div>`;
  }
  const rigaC = (c, colM) => `<div class="cmp${c.fatto ? ' fatto' : ''}" style="--mc:${colM[c.m] || 'var(--acc)'}"><button type="button" class="ck tap" data-cmpfatto="${c.id}" aria-label="${c.fatto ? 'Da rifare' : 'Fatto'}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button><button type="button" class="cmx tap" data-cmp="${c.id}"><b>${esc(titoloC(c))}</b><small>${quando(c.d)}${c.x ? ' · ' + esc(c.x) : ''}</small></button></div>`;
  function scAgenda(m, s, colM) {
    const note = mieiC(m.di), ord = (a, b) => a.d.localeCompare(b.d) || (a.creato || 0) - (b.creato || 0);
    const arrivo = note.filter(c => c.d >= T).sort(ord);
    const prove = arrivo.filter(c => !c.fatto && ['verifica', 'interrogazione'].includes(c.tipo)).length;
    const passate = note.filter(c => c.d < T).sort((a, b) => ord(b, a)).slice(0, 8);
    return `<div class="card">
       <div class="agtop"><b>In arrivo</b><small>${arrivo.filter(c => !c.fatto).length ? `${arrivo.filter(c => !c.fatto).length} da fare${prove ? ` · ${prove} ${prove === 1 ? 'prova' : 'prove'}` : ''}` : 'Tutto fatto ✨'}</small></div>
       ${arrivo.length ? `<div class="cmpl">${arrivo.map(c => rigaC(c, colM)).join('')}</div>`
       : `<div class="empty">Niente in arrivo. Quando c'è un'interrogazione o una verifica, segnala qui: la vedi anche nel calendario.</div>`}
       <button type="button" class="btn tap" data-cmpnuovo="${m.di}">+ Segna compiti o una verifica</button></div>
     ${passate.length ? `<div class="sec">Già passate</div><div class="card"><div class="cmpl passate">${passate.map(c => rigaC(c, colM)).join('')}</div></div>` : ''}`;
  }
  function scMaterie(m, s, colM) {
    const ore = {}; (s.orario || []).forEach(x => { ore[x.m] = (ore[x.m] || 0) + 1; });
    const prof = {}; (s.orario || []).forEach(x => { if (x.prof) prof[x.m] = x.prof; });
    const vm = votiPerMateria(m.di);
    return `<div class="card"><div class="mat">${Object.keys(colM).map(x => `<button type="button" class="tap" data-votimat="${esc(x)}" data-di="${m.di}" style="--mc:${colM[x]}"><i></i><b>${esc(x)}</b><small>${ore[x]} ${ore[x] === 1 ? 'ora' : 'ore'} a settimana${prof[x] ? ' · ' + esc(prof[x]) : ''}${vm[x] ? ` · media ${fmtMedia(vm[x].media)}` : ''}</small></button>`).join('')}</div></div>`;
  }
  /* Voti: il voto all'italiana (7+, 7½, 8−), la media di ogni materia e la media generale (media delle materie). */
  const TIPI_V = [['scritto', 'Scritto'], ['orale', 'Orale'], ['pratico', 'Pratico']];
  const fmtVoto = (v) => { const n = Math.round(v * 4) / 4, i = Math.floor(n), r = n - i; return r === 0 ? `${i}` : r === 0.25 ? `${i}+` : r === 0.5 ? `${i}½` : `${i + 1}−`; };
  const fmtMedia = (v) => v.toFixed(2).replace('.', ',').replace(/,?0+$/, '');
  const coloreVoto = (v) => v >= 6 ? 'var(--p-verde)' : v >= 5 ? 'var(--p-ambra)' : 'var(--p-corallo)';
  const mieiV = (di) => S.voti.filter(v => v.per === S.me && v.di === di && typeof v.v === 'number');
  function votiPerMateria(di) {
    const out = {};
    for (const v of mieiV(di)) (out[v.m] = out[v.m] || { l: [] }).l.push(v);
    for (const k in out) { const l = out[k].l.sort((a, b) => b.d.localeCompare(a.d) || (b.creato || 0) - (a.creato || 0)); out[k].media = l.reduce((n, x) => n + x.v, 0) / l.length; }
    return out;
  }
  function scVoti(m, s, colM) {
    const vm = votiPerMateria(m.di), mat = Object.keys(colM).concat(Object.keys(vm).filter(x => !colM[x]));
    const conVoti = mat.filter(x => vm[x]), tot = conVoti.reduce((n, x) => n + vm[x].l.length, 0);
    const gen = conVoti.length ? conVoti.reduce((n, x) => n + vm[x].media, 0) / conVoti.length : null;
    return `<div class="card vgen">${gen == null ? `<div class="empty">Ancora nessun voto. Quando ne prendi uno, segnalo qui: la media si calcola da sola.</div>`
       : `<div class="vmed"><span class="vbig" style="--vc:${coloreVoto(gen)}">${fmtMedia(gen)}</span><div><b>Media generale</b><small>${tot} ${tot === 1 ? 'voto' : 'voti'} in ${conVoti.length} ${conVoti.length === 1 ? 'materia' : 'materie'}</small></div></div>`}
       <button type="button" class="btn tap" data-votonuovo="${m.di}">+ Aggiungi un voto</button></div>
     <div class="card"><div class="vmat">${mat.map(x => { const r = vm[x]; return `<button type="button" class="vm tap${r ? '' : ' vuota'}" data-votimat="${esc(x)}" data-di="${m.di}" style="--mc:${colM[x] || 'var(--muted)'}"><i></i><span><b>${esc(x)}</b><small>${r ? `${r.l.length} ${r.l.length === 1 ? 'voto' : 'voti'} · ultimo ${fmtVoto(r.l[0].v)}` : 'Nessun voto'}</small></span>${r ? `<span class="vch" style="--vc:${coloreVoto(r.media)}">${fmtMedia(r.media)}</span>` : '<span class="vch nv">—</span>'}</button>`; }).join('')}</div></div>`;
  }
  function sheetVotiMat(di, mat) {
    const s = S.scuola[di]; if (!s) return; const r = votiPerMateria(di)[mat], c = coloriMat(s)[mat] || 'var(--acc)';
    const prof = ((s.orario || []).find(x => x.m === mat && x.prof) || {}).prof;
    openSheet(`<h3 class="cmh" style="--mc:${c}"><i></i>${esc(mat)}</h3>${prof ? `<div class="muted">${esc(prof)}</div>` : ''}
      ${r ? `<div class="vmed"><span class="vbig" style="--vc:${coloreVoto(r.media)}">${fmtMedia(r.media)}</span><div><b>Media</b><small>${r.l.length} ${r.l.length === 1 ? 'voto' : 'voti'}</small></div></div>
      <div class="vlist">${r.l.map(v => `<button type="button" class="vr tap" data-votoid="${v.id}"><span class="vch" style="--vc:${coloreVoto(v.v)}">${fmtVoto(v.v)}</span><span><b>${(TIPI_V.find(t => t[0] === v.tipo) || TIPI_V[0])[1]}</b><small>${fmt(v.d, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')}${v.x ? ' · ' + esc(v.x) : ''}</small></span></button>`).join('')}</div>`
      : `<div class="empty">Ancora nessun voto in ${esc(mat)}.</div>`}
      <button type="button" class="btn tap" data-votonuovo="${di}" data-mat="${esc(mat)}">+ Voto di ${esc(mat)}</button>`);
  }
  function sheetVoto(di, mat) {
    const s = S.scuola[di]; if (!s) return; const colM = coloriMat(s);
    openSheet(`<h3>Nuovo voto</h3><form class="stack" id="fVo" data-di="${di}">
      ${mat ? `<div class="cmh" style="--mc:${colM[mat] || 'var(--acc)'}"><i></i><b>${esc(mat)}</b></div><input type="hidden" id="voM" value="${esc(mat)}">`
      : `<label>Materia</label><div class="tipi">${Object.keys(colM).map(x => `<button type="button" class="tp tap mt" data-vomat="${esc(x)}" style="--mc:${colM[x]}"><i></i>${esc(x)}</button>`).join('')}</div><input type="hidden" id="voM" value="">`}
      <div class="vprev"><span class="vbig" id="voPrev" style="--vc:var(--muted)">–</span></div>
      <div class="vnum">${[3, 4, 5, 6, 7, 8, 9, 10].map(n => `<button type="button" class="tap" data-vonum="${n}">${n}</button>`).join('')}</div>
      ${segHtml('vomod', [['0', 'Pieno'], ['0.25', '+'], ['0.5', '½'], ['-0.25', '−']], '0')}
      ${segHtml('votipo', TIPI_V, 'scritto')}
      <label>Quando<input type="date" id="voD" value="${T}" max="${T}"></label>
      <input id="voX" maxlength="120" autocomplete="off" placeholder="Argomento, se vuoi">
      <button class="btn tap">Salva il voto</button></form>`);
  }
  // Il voto scelto nel foglio: numero + segno (pieno, +, ½, −), mai sopra il 10.
  function votoScelto() {
    const n = document.querySelector('[data-vonum].on'), md = document.querySelector('[data-vomod].on');
    if (!n) return null; return Math.max(1, Math.min(10, +n.dataset.vonum + (md ? +md.dataset.vomod : 0)));
  }
  function aggiornaPrev() { const v = votoScelto(), el = $('#voPrev'); if (!el) return; el.textContent = v == null ? '–' : fmtVoto(v); el.style.setProperty('--vc', v == null ? 'var(--muted)' : coloreVoto(v)); }
  function sheetVotoDett(id) {
    const v = S.voti.find(x => x.id === id); if (!v) return;
    openSheet(`<h3>${esc(v.m)}: ${fmtVoto(v.v)}</h3><div>${(TIPI_V.find(t => t[0] === v.tipo) || TIPI_V[0])[1]} · ${fmt(v.d, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      ${v.x ? `<div class="muted">${esc(v.x)}</div>` : ''}<div class="src">${v.di === S.me ? 'Lo vedi solo tu' : 'Lo vedi solo tu: è nella tua copia di prova'}</div>
      <button type="button" class="btn bad tap" data-votovia="${v.id}">Elimina il voto</button>`);
  }
  // Foglio per segnare una cosa: il giorno è già scelto (la prossima lezione di quella materia), il testo è facoltativo,
  // e toccare il tipo salva subito.
  function sheetNuovoC(di, mat) {
    const s = S.scuola[di]; if (!s) return;
    const da = mioDay && mioDay > T ? mioDay : iso(addDays(TODAY, 1));
    const date = prossimeLezioni(s, mat, da, 3); if (!date.length) date.push(da);
    openSheet(`<h3 class="cmh" style="--mc:${coloriMat(s)[mat] || 'var(--acc)'}"><i></i>${esc(mat)}</h3><form class="stack" id="fCm" data-di="${di}" data-m="${esc(mat)}">
      <label>Per quando</label>
      <div class="seg" style="--n:${date.length};--k:0"><i class="spill"></i>${date.map((d, i) => `<button type="button" class="tap${i ? '' : ' on'}" data-cmd="${d}">${d === iso(addDays(TODAY, 1)) ? 'Domani' : fmt(d, { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '')}</button>`).join('')}</div>
      <input id="cmX" maxlength="120" autocomplete="off" placeholder="Dettagli, se vuoi (es. capitoli 3 e 4)">
      <label>Cosa c'è? Tocca per segnarlo</label>
      <div class="tipi">${TIPI_C.map(([k, e, n]) => `<button type="button" class="tp tap" data-cmtipo="${k}"><b>${e}</b>${n}</button>`).join('')}</div></form>`);
  }
  function sheetMaterie(di) {
    const s = S.scuola[di]; if (!s) return; const colM = coloriMat(s);
    openSheet(`<h3>Per quale materia?</h3><div class="tipi">${Object.keys(colM).map(x => `<button type="button" class="tp tap mt" data-lez="${esc(x)}" data-di="${di}" style="--mc:${colM[x]}"><i></i>${esc(x)}</button>`).join('')}</div>`);
  }
  function sheetC(id) {
    const c = S.compiti.find(x => x.id === id); if (!c) return;
    const s = S.scuola[c.di], lz = s && lezioni(s, gSett(c.d)).find(x => x.m === c.m);
    openSheet(`<h3>${esc(titoloC(c))}</h3><div>${fmt(c.d, { weekday: 'long', day: 'numeric', month: 'long' })}${lz ? ` · ${lz.da}ª ora${lz.h ? ` (${esc(lz.h)})` : ''}` : ''}</div>
      ${c.x ? `<div class="muted">${esc(c.x)}</div>` : ''}<div class="src">${c.di === S.me ? 'Lo vedi solo tu' : 'Lo vedi solo tu: è nella tua copia di prova'}</div>
      <div class="row2"><button type="button" class="btn ${c.fatto ? 'ghost' : ''} tap" data-cmpfatto="${c.id}" data-chiudi="1">${c.fatto ? 'Non ancora fatto' : '✓ Fatto'}</button><button type="button" class="btn bad tap" data-cmpvia="${c.id}">Elimina</button></div>`);
  }

  /* ---------- Impostazioni (schermata intera che entra da destra) ---------- */
  const impAperto = () => $('#imp').classList.contains('on');
  let impNuova = false;
  function openImp() {
    if (!impAperto()) history.pushState({ schermo: 1 }, '');
    impNuova = true; rImp(); impNuova = false;
    $('#imp').scrollTop = 0; $('#imp').classList.add('on'); $('#fab').classList.add('via');
  }
  function closeImp(daIndietro) {
    if (!impAperto()) return;
    $('#imp').classList.remove('on'); $('#fab').classList.remove('via');
    if (daIndietro !== true && history.state && history.state.schermo) { ignoraPop++; history.back(); }
  }
  const segHtml = (nome, voci, k) => `<div class="seg" style="--n:${voci.length};--k:${Math.max(0, voci.findIndex(v => v[0] === k))}"><i class="spill"></i>${voci.map(([v, t]) => `<button type="button" class="tap${v === k ? ' on' : ''}" data-${nome}="${v}">${t}</button>`).join('')}</div>`;
  /* ---------- Collegare il proprio calendario ----------
     Ognuno incolla il link del suo calendario; resta nella sua parte privata (privati/<persona>), che legge solo lui
     e il programma automatico su GitHub, che ogni mezz'ora copia gli impegni e scrive com'è andata in persone/<id>.calStato. */
  const linkCal = (x) => String(x || '').split(/\s+/).filter(u => /^(https|webcal):\/\/\S+$/i.test(u)).slice(0, 5);
  const PASSI = {
    iphone: [`Apri l'app <b>Calendario</b> e tocca <b>Calendari</b> in basso.`,
      `Tocca la <b>ⓘ</b> accanto al tuo calendario, quello sotto <b>iCloud</b>.`,
      `Accendi <b>Calendario pubblico</b>, poi tocca <b>Condividi link…</b> e <b>Copia</b>.`,
      `Torna qui, tocca <b>Incolla</b> e poi <b>Collega</b>.`],
    google: [`Apri <b>Chrome</b> (non l'app Calendar) e vai su <b>calendar.google.com</b>. Dal computer è più comodo: puoi entrare nell'app anche da lì.`,
      `Sul telefono, dal menu <b>⋮</b> di Chrome scegli <b>Sito desktop</b>.`,
      `Tocca l'ingranaggio <b>⚙️</b> e <b>Impostazioni</b>, poi a sinistra scegli il tuo calendario.`,
      `Scendi fino a <b>Indirizzo segreto in formato iCal</b> e copialo.`,
      `Torna qui, tocca <b>Incolla</b> e poi <b>Collega</b>.`]
  };
  const NOTA_PASSI = {
    iphone: `Hai più calendari? Ripeti per ognuno e metti un link per riga. Se non vedi "Calendario pubblico", quel calendario non è di iCloud: chiedi aiuto in famiglia.`,
    google: `Quell'indirizzo è segreto: non darlo a nessuno. Qui lo vedi solo tu.`
  };
  const passiHtml = (g) => PASSI[g].map(x => `<li>${x}</li>`).join('');
  function sheetCal() {
    const g = LS.get('noi4-calguida', /android/i.test(navigator.userAgent) ? 'google' : 'iphone');
    openSheet(`<h3>Collega il mio calendario</h3>
     <div class="empty">Così i tuoi impegni entrano da soli nell'app e si aggiornano ogni mezz'ora. Il link lo vedi solo tu.</div>
     ${segHtml('calg', [['iphone', 'Calendario iPhone'], ['google', 'Google Calendar']], g)}
     <ol class="passi" id="calPassi">${passiHtml(g)}</ol><div class="empty" id="calNota">${NOTA_PASSI[g]}</div>
     <form class="stack" id="fCal">
       <label>Il link del calendario<textarea id="calU" rows="3" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="webcal://… oppure https://…">${esc(S.priv.calendario || '')}</textarea></label>
       ${navigator.clipboard && navigator.clipboard.readText ? '<button type="button" class="btn ghost tap" id="calIncolla">Incolla</button>' : ''}
       <button class="btn tap">Collega</button>
     </form>`);
  }
  function sheetParole() {
    const pr = S.priv.parole || PAROLE0, sc = Object.entries(S.priv.scelte || {}).sort();
    const lista = (k) => `<div class="parole">${(pr[k] || []).map(w => `<button type="button" class="pw tap" data-togliw="${k}" data-w="${esc(w)}">${esc(w)} <b>✕</b></button>`).join('') || '<span class="empty">Nessuna parola</span>'}</div>
      <form class="addp" data-lista="${k}"><input maxlength="30" placeholder="Aggiungi una parola" autocapitalize="off"><button class="btn tap" aria-label="Aggiungi">+</button></form>`;
    openSheet(`<h3>Parole automatiche</h3>
      <div class="empty">Se il titolo di un tuo impegno contiene una di queste parole, l'app decide da sola cosa vedono gli altri. Basta l'inizio della parola: «dottor» vale per dottore e dottoressa.</div>
      <label>🔒 Solo "Occupato"</label>${lista('nascondi')}
      <label>👁️ Sempre per intero</label>${lista('mostra')}
      ${sc.length ? `<label>Scelte fatte a mano</label><div class="parole">${sc.map(([k, v]) => `<button type="button" class="pw tap" data-dimentica="${esc(k)}">${v === 'mostra' ? '👁️' : '🔒'} ${esc(k)} <b>✕</b></button>`).join('')}</div><div class="empty">Tocca una scelta per dimenticarla: torna a decidere l'app.</div>` : ''}
      <button type="button" class="link tap" id="paroleReset">Rimetti le parole di partenza</button>`);
  }
  async function cambiaRegole(x, msg) {
    S.priv = Object.assign({}, S.priv, x);
    try {
      if (x.scelte) await DATI.aggiorna('privati', S.me, { scelte: x.scelte }); // sostituisce l'elenco intero
      else await DATI.imposta('privati', S.me, x);
      await applicaRegole(x);
    } catch (e) { return sbaglio(e); }
    if (msg) toast(msg);
  }
  function statoCal(me, collegato) {
    const links = linkCal(S.priv.calendario), st = me.calStato || {};
    if (!links.length) return collegato ? `<span class="ok">✓</span>Collegato: si aggiorna da solo ogni mezz'ora` : `<span class="no">!</span>Non ancora collegato`;
    if (!st.quando || st.quando < (S.priv.aggiornato || 0)) return `<span class="att">⏳</span>Link salvato: i tuoi impegni arrivano entro mezz'ora`;
    if (!st.letti) return `<span class="no">!</span>Non riesco a leggere il calendario: ricontrolla il link`;
    const ora = new Date(st.quando).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (st.letti < st.tot) return `<span class="no">!</span>Uno dei link non si legge: ricontrollali (ultimo controllo alle ${ora})`;
    return `<span class="ok">✓</span>Collegato: ${st.n} ${st.n === 1 ? 'impegno' : 'impegni'} nei prossimi 60 giorni, aggiornato alle ${ora}`;
  }
  function rImp() {
    const me = P(S.me), pref = me.notifiche || {};
    const sr = (i) => impNuova ? ` rise" style="--i:${Math.min(i, 8)}` : '';
    const attive = 'Notification' in window && Notification.permission === 'granted';
    const tema = LS.get('noi4-tema', 'auto'), apri = LS.get('noi4-apertura', 'oggi');
    const collegato = S.impegni.some(e => e.fonte === 'calendario:' + S.me);
    const importati = (S.impRaw || []).filter(e => e.fonte === 'import:' + S.me).length;
    $('#impIn').innerHTML = `
     <div class="imp-top"><button class="back tap" id="impBack" aria-label="Indietro"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Indietro</button></div>
     <h1 class="hello${sr(0)}">Impostazioni</h1>
     <div class="card prof${impNuova ? ' rise' : ''}" style="--pc:${col(S.me)};--i:1"><label class="pav pfoto tap" aria-label="Cambia la foto">${avt(S.me)}<span class="cam">📷</span><input type="file" id="avIn" accept="image/*" hidden></label><div><b>${esc(me.nome)}</b><div class="muted">Il tuo colore in famiglia: ${NOMI_COLORI[me.colore] || 'viola'}</div>
       <div class="muted">${me.foto ? 'Tocca la foto per cambiarla · <button class="link tap" id="avVia">Togli</button>' : 'Tocca il cerchio per mettere una tua foto'}</div></div>
       <div class="fam">${IDS().map(i => `<button class="tap" data-persona="${i}" aria-label="${esc(P(i).nome)}"><i style="--pc:${col(i)}">${avt(i)}</i></button>`).join('')}</div></div>

     <div class="sec${sr(2)}">Notifiche</div>
     <div class="card${sr(2)}">
       ${attive ? `<div class="stato"><span class="ok">✓</span>Attive su questo telefono</div>` : `<button class="btn tap" id="notOn">Attiva le notifiche su questo telefono</button>`}
       <div>${NOTIF.map(([k, t, oraK, ore, solita]) => `<label class="sw">${t}<input type="checkbox" data-pref="${k}"${pref[k] !== false ? ' checked' : ''}></label>
         ${oraK && pref[k] !== false ? `<div class="ore" style="--n:${ore.length}">${ore.map(h => `<button class="ora tap${(+pref[oraK] || solita) === h ? ' on' : ''}" data-ora="${oraK}" data-h="${h}">${h}:00</button>`).join('')}</div>` : ''}`).join('')}</div>
     </div>

     <div class="sec${sr(3)}">Aspetto</div>
     <div class="card${sr(3)}">${segHtml('tema', [['auto', 'Automatico'], ['chiaro', 'Chiaro ☀️'], ['scuro', 'Scuro 🌙']], tema)}
       <div class="empty">Automatico segue il telefono. Vale solo su questo telefono.</div></div>

     <div class="sec${sr(4)}">I nostri mezzi</div>
     <div class="card${sr(4)}"><div class="parole">${S.mezzi.map((m, i) => `<button type="button" class="pw tap" data-togmz="${i}">${esc(m.e)} ${esc(m.n)} <b>✕</b></button>`).join('') || '<span class="empty">Ancora nessuno: aggiungete le vostre macchine e i motorini.</span>'}</div>
       <form class="addm" id="fMz">${segHtml('mzt', TIPI_MEZZO.map(([e, n]) => [e, `<span class="mze" title="${n}">${e}</span>`]), mzTipo)}<div class="addp"><input id="mzN" maxlength="30" placeholder="Es. Macchina di…"><button class="btn tap" aria-label="Aggiungi">+</button></div></form>
       <div class="empty">Negli impegni si sceglie come ci si va: questi mezzi, più a piedi, bus, metro, treno…</div></div>

     <div class="sec${sr(4)}">All'apertura</div>
     <div class="card${sr(4)}">${segHtml('apri', SCHEDE.map(x => [x, NOMI_SCHEDE[x]]), apri)}
       <div class="empty">La scheda che vedi per prima quando apri l'app.</div></div>

     <div class="sec${sr(5)}">Il mio calendario</div>
     <div class="card${sr(5)}">
       <div class="stato">${statoCal(me, collegato)}</div>
       <button class="btn tap" id="calLink">${linkCal(S.priv.calendario).length ? 'Cambia il link' : 'Collega il mio calendario'}</button>
       ${linkCal(S.priv.calendario).length ? '<button class="link tap" id="calVia">Scollega il calendario</button>' : ''}
       <label>Degli impegni del calendario gli altri vedono</label>
       ${segHtml('privg', [['tutto', '👁️ Tutto'], ['occupato', '🔒 Solo occupato']], me.privacy === 'occupato' ? 'occupato' : 'tutto')}
       <div class="empty">Con "Solo occupato" vedono l'orario, senza titolo né luogo. Le parole automatiche e le tue scelte vincono su questa regola: tocca un tuo impegno per sceglierlo a mano.</div>
       <button class="btn ghost tap" id="paroleBtn">Parole automatiche e scelte</button>
       <div class="empty">Oppure, una volta sola:</div>
       <label class="btn ghost tap filebtn">Importa un file del calendario (.ics)<input type="file" id="icsFile" accept=".ics,text/calendar" hidden></label>
      <label>Dal lavoro a casa ci metto</label>
       ${segHtml('strada', STRADE.map(m => [String(m), m ? m + ' min' : 'Subito']), String(strada(S.me)))}
       <div class="empty">Serve per dire alla famiglia a che ora torni e se ci sei a cena.</div>
      <label class="btn ghost tap filebtn">💼 Importa l'orario di lavoro (.ics)<input type="file" id="orarioFile" accept=".ics,text/calendar" hidden></label>
      <div class="empty">L'orario cambia solo i turni dei giorni che contiene: il resto dei tuoi impegni non si tocca.</div>
       <div class="empty">Entrano i tuoi impegni dei prossimi 12 mesi. Se lo rifai, quelli importati prima vengono sostituiti.</div>
       ${importati ? `<button class="link tap" id="togliImp">Togli i ${importati} impegni importati</button>` : ''}
     </div>

     ${DATI.modo === 'prova' ? `<div class="sec${sr(6)}">Prova</div><div class="card${sr(6)}"><div class="empty">Guarda l'app come un'altra persona:</div>${pickHtml([S.me]).replace(/data-pk=/g, 'data-me=')}<button class="link tap" id="reset">Rimetti i dati di esempio</button></div>`
       : `<div class="card${sr(6)}"><button class="btn bad tap" id="esci">Esci da questo telefono</button></div>`}
     <div class="ver">NDSZ · fatta in casa con cura 💜</div>`;
  }
  // Si chiude anche trascinando da sinistra verso destra, come su iPhone.
  (() => {
    document.querySelectorAll('.screen').forEach(sc => { let x0 = null, dx = 0, t0 = 0;
    sc.addEventListener('touchstart', e => { const x = e.touches[0].clientX; x0 = x < 32 ? x : null; dx = 0; t0 = Date.now(); }, { passive: true });
    sc.addEventListener('touchmove', e => {
      if (x0 == null) return; dx = Math.max(0, e.touches[0].clientX - x0);
      if (dx > 4) { e.preventDefault(); sc.classList.add('drag'); sc.style.transform = `translateX(${dx}px)`; }
    }, { passive: false });
    sc.addEventListener('touchend', () => {
      if (x0 == null) return; x0 = null;
      const veloce = dx / Math.max(1, Date.now() - t0) > 0.5;
      sc.classList.remove('drag'); sc.style.transform = '';
      if (dx > 110 || (veloce && dx > 40)) ({ trip: closeTrip, persona: closePersona, mio: closeMio }[sc.id] || closeImp)();
    });
    });
  })();

  /* ---------- Festa: coriandoli dei colori della famiglia ---------- */
  function festa(el) {
    if (pocoMoto()) return;
    const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
    const x = r.left + r.width / 2, y = r.top + r.height / 2, cols = IDS().map(col);
    for (let i = 0; i < 22; i++) {
      const c = document.createElement('i'), a = Math.random() * Math.PI * 2, d = 50 + Math.random() * 90;
      c.className = 'cf';
      c.style.cssText = `left:${x}px;top:${y}px;--pc:${cols[i % cols.length] || 'var(--acc)'};--tx:${Math.cos(a) * d}px;--ty:${Math.sin(a) * d - 50}px;--r:${Math.random() * 600 - 300}deg;animation-delay:${Math.random() * 80}ms`;
      document.body.appendChild(c); setTimeout(() => c.remove(), 1200);
    }
  }

  /* ---------- Import del calendario (.ics) ---------- */
  // Ultimo giorno (compreso) di un impegno che dura più giorni, altrimenti ''. La fine dei calendari è "esclusa":
  // un impegno di tutto il giorno dal 3 al 7 finisce il giorno 8, uno che finisce a mezzanotte appartiene al giorno prima.
  function ultimoGiorno(s, end, tuttoIlGiorno) {
    if (!end) return '';
    // Con un orario conta come "più giorni" solo se dura almeno 24 ore: un turno di notte (22-6) resta del suo giorno.
    if (!tuttoIlGiorno && end - s < 864e5) return '';
    const e = new Date(end.getTime() - (tuttoIlGiorno || (end.getHours() === 0 && end.getMinutes() === 0) ? 1 : 0));
    const f = iso(e), d = iso(s);
    return f > d ? f : '';
  }
  const senzaDettagli = (via) => { const d = Object.assign({}, S.priv.dettagli || {}); via.forEach(e => delete d[e.id]); return d; };
  async function importaIcs(file) {
    if (!window.ICAL) return toast('Serve internet per leggere il file. Riprova.');
    if (!navigator.onLine) return toast('Serve internet per importare: riprova appena c\'è rete.');
    toast('Leggo il calendario…');
    try {
      const comp = new ICAL.Component(ICAL.parse(await file.text()));
      const da = new Date(); da.setHours(0, 0, 0, 0);
      const a = addDays(da, 366);
      const out = [], det = [];
      const hhmm = (d) => d.toTimeString().slice(0, 5);
      // Stesse regole del calendario collegato: scelte a mano, parole automatiche, regola generale.
      const rg = regole();
      const push = (ev, start, end) => {
        const s = start.toJSDate(), e = end ? end.toJSDate() : null;
        if ((e && e > s ? e <= da : s < da) || s > a || out.length >= 800) return; // entrano anche quelli iniziati prima e ancora in corso
        const all = start.isDate, titolo = (ev.summary || 'Impegno').slice(0, 80), luogo = (ev.location || '').slice(0, 200);
        const rr = ev.component && ev.component.getFirstPropertyValue('rrule');
        if (compleanno(titolo, all && rr && String(rr.freq).toUpperCase() === 'YEARLY')) return; // i compleanni non entrano
        const vis = regolaCal(titolo, rg).vis;
        out.push({ t: vis ? titolo : 'Occupato', d: iso(s), fino: ultimoGiorno(s, e, all), h: all ? '' : hhmm(s), fine: !all && e ? hhmm(e) : '',
          who: [S.me], n: vis ? luogo : '', ripeti: '', fonte: 'import:' + S.me, creatoDa: S.me, creato: Date.now(), nascosto: !vis });
        det.push(vis ? null : { t: titolo, n: luogo }); // il titolo vero resta nella mia parte privata
      };
      // Le ripetizioni spostate (es. una lezione spostata una volta) si legano al loro impegno, così cadono nel giorno giusto.
      const eventi = comp.getAllSubcomponents('vevent').map(v => new ICAL.Event(v));
      const principali = {};
      eventi.forEach(ev => { if (!ev.isRecurrenceException()) principali[ev.uid] = ev; });
      eventi.forEach(ev => { if (ev.isRecurrenceException()) { const m = principali[ev.uid]; if (m) m.relateException(ev); else push(ev, ev.startDate, ev.endDate); } });
      for (const ev of Object.values(principali)) {
        if (!ev.isRecurring()) { push(ev, ev.startDate, ev.endDate); continue; }
        // Si contano tutte le ripetizioni, anche quelle passate: un impegno settimanale di 10 anni ne ha più di 500.
        const it = ev.iterator(); let next, n = 0;
        while ((next = it.next()) && n++ < 50000 && out.length < 800) {
          if (next.toJSDate() > a) break;
          const o = ev.getOccurrenceDetails(next); push(o.item, o.startDate, o.endDate);
        }
      }
      const vecchi = (S.impRaw || []).filter(e => e.fonte === 'import:' + S.me); // anche i compleanni nascosti, così spariscono davvero
      toast(`Importo ${out.length} impegni…`);
      await DATI.eliminaMolti('impegni', vecchi.map(e => e.id)); // tutti insieme, non uno alla volta
      const ids = await DATI.molti('impegni', out);
      // I titoli privati: via quelli dei vecchi impegni importati, dentro quelli nuovi (si riscrive l'elenco intero).
      const dettagli = senzaDettagli(vecchi);
      (ids || []).forEach((id, i) => { if (det[i]) dettagli[id] = det[i]; });
      await DATI.aggiorna('privati', S.me, { dettagli }).catch(() => DATI.imposta('privati', S.me, { dettagli }));
      closeSheet(); render(); toast(out.length ? `Importati ${out.length} impegni` : 'Nel file non ci sono impegni nei prossimi 12 mesi');
    } catch (e) { console.error(e); toast('Il file non sembra un calendario .ics valido.'); }
  }

  /* L'orario di lavoro della settimana (file .ics preparato da Claude dalla foto dell'orario scritto a mano):
     sostituisce solo i turni ("orario:<me>") dei giorni compresi nel file, gli altri impegni restano. */
  async function importaOrario(file) {
    if (!window.ICAL) return toast('Serve internet per leggere il file. Riprova.');
    try {
      const comp = new ICAL.Component(ICAL.parse(await file.text()));
      const hhmm = (d) => d.toTimeString().slice(0, 5), out = [];
      for (const v of comp.getAllSubcomponents('vevent')) {
        const ev = new ICAL.Event(v), s = ev.startDate.toJSDate(), e = ev.endDate ? ev.endDate.toJSDate() : null, all = ev.startDate.isDate;
        out.push({ t: (ev.summary || 'Al lavoro').slice(0, 80), d: iso(s), fino: ultimoGiorno(s, e, all), h: all ? '' : hhmm(s), fine: !all && e ? hhmm(e) : '',
          who: [S.me], n: (ev.location || '').slice(0, 200), ripeti: '', fonte: 'orario:' + S.me, creatoDa: S.me, creato: Date.now() });
      }
      if (!out.length) return toast('Nel file non ci sono turni');
      const giorni = out.map(x => x.d).sort(), da = giorni[0], a = giorni[giorni.length - 1];
      // Un orario è al massimo qualche settimana di turni: un file più grande è quasi certamente il calendario personale,
      // che qui entrerebbe con i titoli veri per tutti. Si ferma e si indica il tasto giusto.
      const vecchio = iso(addDays(TODAY, -7));
      if (out.length > 62 || (new Date(a + 'T12:00:00') - new Date(da + 'T12:00:00')) / 864e5 > 62 || a < vecchio || comp.getAllSubcomponents('vevent').some(v => v.hasProperty('rrule')))
        return toast('Questo non sembra un orario di lavoro: per un calendario usa "Importa un file del calendario".');
      const vecchi = S.impegni.filter(x => x.fonte === 'orario:' + S.me && x.d >= da && x.d <= a);
      for (const x of vecchi) await DATI.elimina('impegni', x.id);
      await DATI.molti('impegni', out);
      closeSheet(); closeImp(); render();
      toast(`Orario caricato: ${out.length} ${out.length === 1 ? 'turno' : 'turni'} dal ${fmt(da, { day: 'numeric', month: 'short' })} al ${fmt(a, { day: 'numeric', month: 'short' })}`);
    } catch (e) { console.error(e); toast('Il file non sembra un orario .ics valido.'); }
  }

  /* ---------- Tocchi ---------- */
  // Ricerca dei set LEGO mentre si scrive (Invio non manda il modulo).
  let legoT = 0;
  document.addEventListener('input', (ev) => { if (ev.target.id === 'legoQ') { clearTimeout(legoT); legoT = setTimeout(risLego, 150); } });
  document.addEventListener('keydown', (ev) => { if (ev.target.id === 'legoQ' && ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); } });
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (t.classList.contains('tab')) return go(d.p);
    if (t.id === 'albumVai') return caricaAlbum();
    if (d.segspesa) { if (segSpesa === d.segspesa) return; segSpesa = d.segspesa; LS.set('noi4-spesa', segSpesa); return render(); }
    if (d.ric) { ricHo[d.ric] = {}; return sheetRicetta(d.ric); }
    if (d.ing != null && d.ricId) { const h = ricHo[d.ricId] = ricHo[d.ricId] || {}; h[d.ing] = !h[d.ing]; return sheetRicetta(d.ricId, true); }
    if (t.id === 'ricSpesa') {
      const r = S.ricette.find(x => x.id === d.ricId); if (!r) return;
      const ho = ricHo[r.id] || {}, inLista = new Set(S.spesa.filter(x => !x.done).map(x => chiave(x.x)));
      const da = [...new Set(ingredienti(r).filter((x, i) => !ho[i] && !inLista.has(chiave(x))).map(x => x.trim().slice(0, 80)))];
      if (!da.length) return;
      try { await DATI.molti('spesa', da.map((x, i) => ({ x, by: S.me, done: false, creato: Date.now() + i, ricetta: r.t.slice(0, 60) }))); }
      catch (er) { return sbaglio(er); }
      closeSheet(); ricAperta = null; segSpesa = 'lista'; LS.set('noi4-spesa', segSpesa); render(); setTimeout(() => festa(document.querySelector('#p-spesa .card')), 60);
      return toast(`${da.length === 1 ? '1 ingrediente' : da.length + ' ingredienti'} nella spesa 🛒`);
    }
    if (d.ricmod) return sheetNuovaRicetta(d.ricmod);
    if (d.ricdel) {
      if (!t.dataset.sicuro) { t.dataset.sicuro = '1'; t.style.color = 'var(--bad)'; t.textContent = 'Tocca ancora per eliminarla'; return; }
      const r = S.ricette.find(x => x.id === d.ricdel); closeSheet(); ricAperta = null;
      try { await DATI.elimina('ricette', d.ricdel); if (r && r.fotoPath) DATI.eliminaFile(r.fotoPath); } catch (er) { return sbaglio(er); }
      return toast('Ricetta eliminata');
    }
    if (t.id === 'legoOn') {
      t.hidden = true; $('#legoBox').hidden = false; $('#legoQ').focus(); risLego();
      try { await catalogoLego(); risLego(); } catch (er) { $('#legoRis').innerHTML = '<div class="empty">Il catalogo LEGO non si apre: serve internet. Riprova tra poco.</div>'; }
      return;
    }
    if (d.legoset) {
      const x = legoCat && legoCat.find(y => y.num === d.legoset), f = $('#fRe'); if (!x || !f) return;
      f.dataset.lego = JSON.stringify({ num: x.num, nome: x.nome.slice(0, 80), img: x.img, pezzi: x.pezzi, anno: x.anno });
      $('#reX').value = ('LEGO ' + x.nome).slice(0, 80);
      $('#legoSel').innerHTML = `<div class="lr scelto">${x.img ? `<img src="${esc(x.img)}" alt="">` : '<span class="lgph">🧱</span>'}<span><b>${esc(x.nome)}</b><small>${legoInfo(x)}</small></span><button type="button" class="gx tap" id="legoVia" aria-label="Togli il set">✕</button></div>`;
      $('#legoBox').hidden = true; $('#legoOn').hidden = false; $('#legoOn').textContent = '🧱 Scegli un altro set';
      return;
    }
    if (t.id === 'legoVia') { const f = $('#fRe'); delete f.dataset.lego; $('#legoSel').innerHTML = ''; $('#legoOn').textContent = '🧱 Cerca un set LEGO'; return; }
    if (d.go) return go(d.go);
    if (t.id === 'fab' && page === 'spesa' && segSpesa === 'ricette') return sheetNuovaRicetta();
    if (t.id === 'fab') return page === 'note' ? (seg === 'regali' ? sheetRegalo(S.me) : sheetProposta('cena')) : page === 'viaggi' ? sheetViaggio() : sheetEvento();
    if (d.filtror) { filtroR = d.filtror; return rViaggi(); }
    if (d.tipo) { t.parentElement.querySelectorAll('.tp').forEach(b => b.classList.toggle('on', b === t)); return; }
    if (d.viaggio) { openTrip(d.viaggio); if (d.apriFoto) setTimeout(() => openViewer(d.apriFoto), 300); return; }
    if (t.id === 'tripBack') return closeTrip();
    if (d.modviaggio) return sheetViaggio(S.viaggi.find(x => x.id === d.modviaggio));
    if (t.id === 'selOn') { selFoto = selFoto ? null : new Set(); gruppi = null; statoSalva = null; tripHtml = ''; return rTrip(); }
    if (t.id === 'selTutte') { const fs = fotoDi(tripId); selFoto = selFoto.size === fs.length ? new Set() : new Set(fs.map(f => f.id)); gruppi = null; return aggiornaSel(); }
    if (t.id === 'selSalva') return salvaScelte();
    if (d.foto && selFoto) { selFoto.has(d.foto) ? selFoto.delete(d.foto) : selFoto.add(d.foto); gruppi = null; if (navigator.vibrate) navigator.vibrate(6); return aggiornaSel(); }
    if (d.foto) return openViewer(d.foto);
    if (d.vchiudi !== undefined) return closeViewer();
    if (d.cuore) {
      const f = S.foto.find(x => x.id === d.cuore); if (!f) return;
      const on = !(f.cuori || {})[S.me];
      if (on) { t.classList.add('on'); festa(t); }
      return DATI.aggiorna('foto', f.id, { ['cuori.' + S.me]: on }).catch(sbaglio); // solo il mio cuore: due cuori insieme non si cancellano
    }
    if (d.salva) { const f = S.foto.find(x => x.id === d.salva); return f && salvaFoto(f); }
    if (d.cop) { const f = S.foto.find(x => x.id === d.cop); if (!f) return; await DATI.aggiorna('viaggi', f.v, { cop: f.id }).catch(sbaglio); return toast('Copertina cambiata 🖼️'); }
    if (d.delfoto) {
      if (!d.sicuro) { d.sicuro = '1'; t.classList.add('warn'); return toast('Tocca ancora 🗑️ per togliere la foto'); }
      const f = S.foto.find(x => x.id === d.delfoto); if (!f) return;
      await DATI.elimina('foto', f.id).catch(sbaglio); DATI.eliminaFile(f.path); DATI.eliminaFile(f.pathP); DATI.eliminaFile(f.pathD); return toast(f.video ? 'Video tolto' : 'Foto tolta');
    }
    if (d.delviaggio) {
      if (!d.sicuro) { d.sicuro = '1'; t.textContent = 'Tocca ancora per eliminare tutto'; return; }
      const fs = fotoDi(d.delviaggio);
      // Foglio e schermata si chiudono insieme: si tolgono tutti e due i passi del tasto indietro in un colpo solo.
      const passi = (aperto() && history.state && history.state.foglio ? 1 : 0) + (tripAperto() ? 1 : 0);
      closeSheet(true); closeTrip(true); if (passi) { ignoraPop++; history.go(-passi); }
      for (const f of fs) { await DATI.elimina('foto', f.id).catch(() => {}); DATI.eliminaFile(f.path); DATI.eliminaFile(f.pathP); DATI.eliminaFile(f.pathD); }
      await DATI.elimina('viaggi', d.delviaggio).catch(sbaglio); return toast('Ricordo eliminato');
    }
    if (t.id === 'meBtn') return openImp();
    if (t.id === 'calLink') return sheetCal();
    if (d.voto) {
      const idea = ((S.sorprese[d.per] || {}).idee || {})[d.idea] || {}, prima = (idea.voti || {})[S.me];
      const v = prima === d.voto ? '' : d.voto;
      if (v === 'si') festa(t);
      return DATI.imposta('sorprese', d.per, { idee: { [d.idea]: { voti: { [S.me]: v } } } }).catch(sbaglio);
    }
    if (d.mzf != null) { const on = !t.classList.contains('on'); t.parentElement.querySelectorAll('.mz').forEach(b => b.classList.remove('on')); t.classList.toggle('on', on); return; }
    if (d.mzd != null) {
      const id = t.closest('[data-mze]').dataset.mze, on = !t.classList.contains('on');
      t.parentElement.querySelectorAll('.mz').forEach(b => b.classList.remove('on')); t.classList.toggle('on', on);
      return DATI.aggiorna('impegni', id, { mezzo: on ? d.mzd : '' }).then(() => toast(on ? 'Mezzo segnato' : 'Mezzo tolto')).catch(sbaglio);
    }
    if (d.impst) {
      const e = S.impegni.find(x => x.id === d.impst); if (!e) return;
      const on = !e.imp; t.classList.toggle('on', on); t.textContent = on ? '⭐ Importante: lo vedono tutti in Impegni' : '☆ Segna come importante';
      if (on) festa(t);
      return DATI.aggiorna('impegni', e.id, { imp: on }).catch(sbaglio);
    }
    if (d.mzt) { mzTipo = d.mzt; segSet(t.parentElement, TIPI_MEZZO.findIndex(([e]) => e === d.mzt)); return; }
    if (d.togmz != null) {
      if (!t.dataset.sicuro) { t.dataset.sicuro = 1; t.innerHTML = 'Tocca ancora per togliere'; return; }
      const l = S.mezzi.filter((_, i) => i !== +d.togmz);
      return DATI.imposta('famiglia', 'mezzi', { lista: l }).catch(sbaglio);
    }
    if (t.id === 'avVia') {
      const old = P(S.me).fotoPath;
      await DATI.imposta('persone', S.me, { foto: '', fotoPath: '' }).catch(sbaglio);
      if (old) DATI.eliminaFile(old);
      return toast('Foto tolta');
    }
    if (d.persona) return openPersona(d.persona);
    if (t.id === 'persBack') return closePersona();
    if (d.listareg) {
      const dalle = (impAperto() ? 1 : 0) + 1; closePersona(); if (impAperto()) closeImp();
      seg = 'regali'; LS.set('noi4-bacheca', seg);
      return setTimeout(() => { if (page === 'note') render(); else go('note'); }, 380 * dalle);
    }
    if (t.id === 'paroleBtn') return sheetParole();
    if (d.vis) {
      const e = S.impegni.find(x => x.id === t.closest('[data-vise]').dataset.vise); if (!e) return;
      segSet(t.parentElement, d.vis === 'mostra' ? 0 : 1);
      const sc = Object.assign({}, S.priv.scelte || {}, { [chiave(e.t)]: d.vis });
      S.priv = Object.assign({}, S.priv, { scelte: sc });
      try { await DATI.imposta('privati', S.me, { scelte: { [chiave(e.t)]: d.vis } }); await applicaRegole({ scelte: sc }); } catch (er) { return sbaglio(er); }
      $('#visPerche') && ($('#visPerche').textContent = `L'hai scelto tu. Vale anche per gli altri impegni «${e.t}».`);
      return toast(d.vis === 'mostra' ? 'Gli altri lo vedranno per intero' : 'Gli altri vedranno solo "Occupato"');
    }
    if (d.strada != null && t.closest('.seg')) {
      const m = +d.strada; segSet(t.parentElement, STRADE.indexOf(m));
      S.persone[S.me] = Object.assign({}, P(S.me), { strada: m }); render();
      try { await DATI.imposta('persone', S.me, { strada: m }); } catch (er) { return sbaglio(er); }
      return toast(m ? `Ok: ${m} minuti dal lavoro a casa` : 'Ok: a casa appena finisci');
    }
    if (d.privg) {
      segSet(t.parentElement, d.privg === 'occupato' ? 1 : 0);
      S.persone[S.me] = Object.assign({}, P(S.me), { privacy: d.privg });
      try { await DATI.imposta('persone', S.me, { privacy: d.privg }); await applicaRegole({ gen: d.privg }); } catch (er) { return sbaglio(er); }
      return toast(d.privg === 'occupato' ? 'Gli altri vedranno solo "Occupato", salvo le eccezioni' : 'Gli altri vedranno i tuoi impegni per intero, salvo le eccezioni');
    }
    if (d.togliw) {
      const pr = S.priv.parole || PAROLE0, nuovo = Object.assign({}, pr, { [d.togliw]: (pr[d.togliw] || []).filter(w => w !== d.w) });
      await cambiaRegole({ parole: nuovo }); return sheetParole();
    }
    if (d.dimentica != null) {
      const sc = Object.assign({}, S.priv.scelte || {}); delete sc[d.dimentica];
      await cambiaRegole({ scelte: sc }, 'Ora decide l\'app'); return sheetParole();
    }
    if (t.id === 'paroleReset') { await cambiaRegole({ parole: PAROLE0 }, 'Parole di partenza rimesse'); return sheetParole(); }
    if (d.calg) { LS.set('noi4-calguida', d.calg); segSet(t.parentElement, d.calg === 'google' ? 1 : 0); $('#calPassi').innerHTML = passiHtml(d.calg); $('#calNota').textContent = NOTA_PASSI[d.calg]; return; }
    if (t.id === 'calIncolla') {
      try { const x = await navigator.clipboard.readText(); if (x) { $('#calU').value = x.trim(); toast(linkCal(x).length ? 'Link incollato' : 'Quello copiato non sembra un link di calendario'); } }
      catch (e) { toast('Tieni premuto nel riquadro e scegli Incolla'); }
      return;
    }
    if (t.id === 'calVia') {
      if (!t.dataset.sicuro) { t.dataset.sicuro = 1; t.textContent = 'Tocca di nuovo per scollegare'; return; }
      await DATI.imposta('privati', S.me, { calendario: '', aggiornato: Date.now() }).catch(sbaglio);
      return toast('Scollegato: i suoi impegni spariscono entro mezz\'ora');
    }
    if (t.id === 'impBack') return closeImp();
    if (d.me) { DATI.cambiaPersona(d.me); return toast('Ora guardi l\'app come ' + P(d.me).nome); }
    if (t.id === 'reset') { DATI.ricomincia(); seen.clear(); closeImp(); return toast('Dati di esempio rimessi'); }
    if (t.id === 'esci') { closeImp(); return DATI.esci(); }
    if (d.seg) {
      if (seg === d.seg) return; seg = d.seg; LS.set('noi4-bacheca', seg);
      return render();
    }
    if (d.tema) { LS.set('noi4-tema', d.tema); segSet(t.parentElement, [...t.parentElement.querySelectorAll('button')].indexOf(t)); return applicaTema(); }
    if (d.apri) { LS.set('noi4-apertura', d.apri); segSet(t.parentElement, SCHEDE.indexOf(d.apri)); return toast('All\'apertura vedrai: ' + NOMI_SCHEDE[d.apri]); }
    if (d.ora) { t.parentElement.querySelectorAll('.ora').forEach(b => b.classList.toggle('on', b === t)); return DATI.imposta('persone', S.me, { notifiche: Object.assign({}, P(S.me).notifiche, { [d.ora]: +d.h }) }).catch(sbaglio); }
    if (t.id === 'togliImp') {
      if (!d.sicuro) { d.sicuro = '1'; t.textContent = 'Tocca ancora per toglierli'; t.style.color = 'var(--bad)'; return; }
      const g = (S.impRaw || []).filter(e => e.fonte === 'import:' + S.me);
      for (const e of g) await DATI.elimina('impegni', e.id).catch(sbaglio);
      if (g.some(e => (S.priv.dettagli || {})[e.id])) await DATI.aggiorna('privati', S.me, { dettagli: senzaDettagli(g) }).catch(sbaglio);
      return toast('Impegni importati tolti');
    }
    if (d.addreg) return sheetRegalo(d.addreg);
    if (d.prendo) {
      const presi = (S.sorprese[d.per] || {}).presi || {}, chi = presi[d.prendo];
      if (chi && chi !== S.me) return toast('L\'ha già preso ' + P(chi).nome);
      const prendo = chi !== S.me;
      if (prendo) { t.classList.add('on'); t.textContent = '✓ Lo prendo io'; festa(t); toast('Segnato: lo regali tu 🎁'); }
      return DATI.imposta('sorprese', d.per, { presi: { [d.prendo]: prendo ? S.me : '' } }).catch(sbaglio);
    }
    if (d.delreg) {
      if (!d.sicuro) { d.sicuro = '1'; t.style.color = 'var(--bad)'; return toast('Tocca ancora ✕ per toglierlo dalla lista'); }
      return DATI.elimina('regali', d.delreg).catch(sbaglio);
    }
    if (d.delidea) {
      if (!d.sicuro) { d.sicuro = '1'; t.style.color = 'var(--bad)'; return toast('Tocca ancora ✕ per togliere l\'idea'); }
      return DATI.imposta('sorprese', d.per, { idee: { [d.delidea]: null } }).catch(sbaglio);
    }
    if (t.id === 'notOn' || t.id === 'bnOn') {
      try { const r = await DATI.attivaNotifiche(); if (r === 'ok') { toast('Notifiche attive su questo telefono'); banner(); } else toast(r); }
      catch (e) { console.error(e); toast('Non sono riuscito ad attivarle. Riprova.'); }
      try { if (t.id === 'bnOn' && Notification.permission === 'denied') localStorage.setItem('noi4-banner-notifiche', 'no'); } catch (e) {}
      return;
    }
    if (d.pk) return t.classList.toggle('on');
    if (d.cena) {
      if (d.cena !== S.me) return openPersona(d.cena);
      const o = ['si', 'no', '?']; const v = o[(o.indexOf(S.cena[S.me] || '?') + 1) % 3]; // dal "fuori" automatico si passa a sì, poi no, poi di nuovo automatico
      S.cena[S.me] = v; rOggi(); const n = document.querySelector(`[data-cena="${S.me}"]`); n && n.classList.add('bump');
      if (v === 'si' && IDS().every(i => S.cena[i] === 'si')) { festa(n); toast('Stasera tutti a tavola! 🍝'); }
      return DATI.imposta('cena', T, { [S.me]: v }).catch(sbaglio);
    }
    if (d.ev) { const e = S.impegni.find(x => x.id === d.ev); return e && (e.cmp ? sheetC(e.cmp) : sheetDettaglio(e)); }
    // Sezione Personale
    if (t.id === 'mioBtn') return openMio();
    if (t.id === 'mioBack') return closeMio();
    if (d.apriMio) { closeSheet(true); return openMio(true); }
    if (d.mioday) { mioDay = d.mioday; return rMio(); }
    if (d.sctab) { if (scTab === d.sctab) return; scTab = d.sctab; LS.set('noi4-scuola-tab', scTab); segSet(t.parentElement, TABS_S.findIndex(x => x[0] === scTab)); return rMio(); }
    if (d.votimat) return sheetVotiMat(d.di, d.votimat);
    if (d.votonuovo) return sheetVoto(d.votonuovo, d.mat || '');
    if (d.votoid) return sheetVotoDett(d.votoid);
    if (d.vomat) { t.parentElement.querySelectorAll('.tp').forEach(b => b.classList.toggle('on', b === t)); $('#voM').value = d.vomat; return; }
    if (d.vonum) { t.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === t)); return aggiornaPrev(); }
    if (d.vomod != null || d.votipo) { const b = [...t.parentElement.querySelectorAll('button')]; segSet(t.parentElement, b.indexOf(t)); return aggiornaPrev(); }
    if (d.votovia) {
      if (!t.dataset.sicuro) { t.dataset.sicuro = '1'; t.textContent = 'Tocca ancora per eliminare'; return; }
      closeSheet(); return DATI.elimina('voti', d.votovia).then(() => toast('Voto eliminato')).catch(sbaglio);
    }
    if (d.lez && d.di) return sheetNuovoC(d.di, d.lez);
    if (d.cmpnuovo) return sheetMaterie(d.cmpnuovo);
    if (d.cmp) return sheetC(d.cmp);
    if (d.cmd) { const b = [...t.parentElement.querySelectorAll('button')]; return segSet(t.parentElement, b.indexOf(t)); }
    if (d.cmtipo) {
      const f = t.closest('form'), dd = f.querySelector('[data-cmd].on');
      const c = { per: S.me, di: f.dataset.di, m: f.dataset.m, tipo: d.cmtipo, d: dd ? dd.dataset.cmd : iso(addDays(TODAY, 1)), x: $('#cmX').value.trim().slice(0, 120), by: S.me, creato: Date.now(), fatto: false };
      closeSheet(); toast(`${TIPO_C[c.tipo].e} Segnato per ${quando(c.d).split(' · ')[0].toLowerCase()}`);
      return DATI.aggiungi('compiti', c).catch(sbaglio);
    }
    if (d.cmpfatto) {
      const c = S.compiti.find(x => x.id === d.cmpfatto); if (!c) return;
      if (d.chiudi) closeSheet(); else if (!c.fatto) t.closest('.cmp') && t.closest('.cmp').classList.add('fatto');
      if (!c.fatto) toast('Fatto ✓');
      return DATI.aggiorna('compiti', c.id, { fatto: !c.fatto }).catch(sbaglio);
    }
    if (d.cmpvia) {
      if (!t.dataset.sicuro) { t.dataset.sicuro = '1'; t.textContent = 'Tocca ancora per eliminare'; return; }
      closeSheet(); return DATI.elimina('compiti', d.cmpvia).then(() => toast('Eliminato')).catch(sbaglio);
    }
    if (d.modifica) return sheetEvento(S.impegni.find(x => x.id === d.modifica));
    if (d.elimina) {
      if (!t.dataset.sicuro) { t.dataset.sicuro = '1'; t.textContent = 'Tocca ancora per eliminare'; return; }
      closeSheet(); await DATI.elimina('impegni', d.elimina).catch(sbaglio);
      if ((S.priv.dettagli || {})[d.elimina]) DATI.aggiorna('privati', S.me, { dettagli: senzaDettagli([{ id: d.elimina }]) }).catch(() => {}); // via anche il titolo privato
      return toast('Impegno eliminato');
    }
    if (d.day) { selDay = d.day; return rCal(); }
    if (d.wk) {
      weekStart = addDays(weekStart, 7 * d.wk);
      const g = [...Array(7)].map((_, i) => iso(addDays(weekStart, i)));
      selDay = g.includes(T) ? T : g[0]; return rCal();
    }
    if (d.f) { filt = d.f; return rCal(); }
    if (d.vaiprop) { seg = 'proposte'; LS.set('noi4-bacheca', seg); return go('note'); }
    if (d.ptipo) {
      t.parentElement.querySelectorAll('.tp').forEach(b => b.classList.toggle('on', b === t));
      const q = $('#prQ'), tp = PTIPO[d.ptipo];
      if (!q.value.trim() || PTIPI.some(x => x[3] === q.value.trim())) q.value = tp.q;
      document.querySelectorAll('.prO').forEach((el, i) => { el.placeholder = 'Es. ' + (tp.es[i] || 'un\'altra idea'); });
      if (d.ptipo === 'altro') q.focus();
      return;
    }
    if (t.id === 'prPiu') {
      const box = $('#prOps'); if (box.children.length >= 8) return toast('Bastano 8 idee per cominciare');
      const i = document.createElement('input'); i.className = 'prO'; i.maxLength = 60; i.placeholder = 'Es. un\'altra idea'; box.appendChild(i); i.focus(); return;
    }
    if (d.vota) {
      const p = S.proposte.find(x => x.id === d.vota); if (!p || p.chiusa) return;
      const miei = (p.voti || {})[S.me] || [], nuovo = miei.includes(d.op) ? miei.filter(x => x !== d.op) : [...miei, d.op];
      t.classList.toggle('on'); if (navigator.vibrate) navigator.vibrate(8);
      return DATI.aggiorna('proposte', p.id, { ['voti.' + S.me]: nuovo }).catch(sbaglio);
    }
    if (d.decidi) {
      const p = S.proposte.find(x => x.id === d.decidi), v = p && inTesta(p); if (!v) return;
      festa(t); await DATI.aggiorna('proposte', p.id, { chiusa: true, scelta: v.x, decisa: Date.now() }).catch(sbaglio);
      return toast(`Deciso: ${v.x}. Lo diciamo a tutti 🔔`);
    }
    if (d.riapri) return DATI.aggiorna('proposte', d.riapri, { chiusa: false, scelta: '', decisa: 0 }).catch(sbaglio);
    if (d.delprop) {
      if (!t.dataset.sicuro) { t.dataset.sicuro = '1'; t.style.opacity = 1; t.style.color = 'var(--bad)'; return toast('Tocca ancora ✕ per togliere la proposta'); }
      return DATI.elimina('proposte', d.delprop).catch(sbaglio);
    }
    if (d.delnote) {
      if (!t.dataset.sicuro) { t.dataset.sicuro = '1'; t.style.opacity = 1; t.style.color = 'var(--bad)'; return toast('Tocca ancora ✕ per togliere la nota'); }
      return DATI.elimina('note', d.delnote).catch(sbaglio);
    }
    if (d.item) {
      const x = S.spesa.find(y => y.id === d.item); if (!x) return;
      t.classList.toggle('done');
      if (!x.done && S.spesa.filter(y => !y.done).length === 1) { festa(t.querySelector('.box')); setTimeout(() => toast('Tutto preso! 🎉'), 200); }
      setTimeout(() => DATI.aggiorna('spesa', x.id, x.done ? { done: false, presoDa: '', preso: 0 } : { done: true, presoDa: S.me, preso: Date.now() }).catch(sbaglio), 380); return;
    }
    if (t.id === 'clear') {
      if (!t.dataset.sicuro) { t.dataset.sicuro = '1'; t.textContent = 'Tocca ancora'; t.style.color = 'var(--bad)'; return; }
      const g = S.spesa.filter(x => x.done); for (const x of g) DATI.elimina('spesa', x.id).catch(sbaglio); return toast('Lista pulita'); }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'evAll') $('#evOre').hidden = t.checked;
    // Si salva dopo che l'interruttore ha finito di scorrere (il salvataggio ridisegna la pagina).
    if (t.dataset && t.dataset.pref) { const k = t.dataset.pref, v = t.checked; setTimeout(() => DATI.imposta('persone', S.me, { notifiche: Object.assign({}, P(S.me).notifiche, { [k]: v }) }).catch(sbaglio), 320); }
    if (t.id === 'icsFile' && t.files[0]) importaIcs(t.files[0]);
    if (t.id === 'orarioFile' && t.files[0]) importaOrario(t.files[0]);
    if (t.id === 'fotoIn' && t.files.length) caricaFoto(t.files);
    if (t.id === 'riFoto' && t.files[0]) {
      riFile = t.files[0]; const pv = $('#riPrev'); const u = URL.createObjectURL(riFile);
      if (pv) pv.outerHTML = `<img src="${u}" alt="" id="riPrev">`;
    }
    if (t.id === 'autoIn' && t.files.length) { const fs = [...t.files]; t.value = ''; preparaAlbum(fs); }
    if (t.id === 'avIn' && t.files[0]) caricaAvatar(t.files[0]);
  });
  document.addEventListener('submit', async (ev) => {
    ev.preventDefault(); const f = ev.target;
    if (f.id === 'fLogin') {
      $('#lgErr').textContent = '';
      try { await DATI.login($('#lgEmail').value, $('#lgPass').value); }
      catch (e) {
        // Il messaggio giusto per ogni caso: niente rete, troppi tentativi, oppure email o password sbagliate.
        const c = (e && e.code) || '';
        $('#lgErr').textContent = DATI.modo === 'senza-rete' ? e.message
          : !navigator.onLine || c === 'auth/network-request-failed' ? 'Manca internet: riprova appena c\'è rete.'
          : c === 'auth/too-many-requests' ? 'Troppi tentativi: aspetta qualche minuto, oppure scegli una nuova password con il tasto qui sotto.'
          : 'Email o password non corrette.';
      }
    } else if (f.id === 'fMz') {
      const n = $('#mzN').value.trim(); if (!n) return toast('Scrivi il nome del mezzo');
      const m = { e: mzTipo, n: n.charAt(0).toUpperCase() + n.slice(1) };
      if (S.mezzi.some(x => x.e === m.e && x.n.toLowerCase() === m.n.toLowerCase())) return toast('C\'è già');
      try { await DATI.imposta('famiglia', 'mezzi', { lista: [...S.mezzi, m] }); $('#mzN') && ($('#mzN').value = ''); toast(`${m.e} ${m.n} aggiunto`); } catch (er) { sbaglio(er); }
    } else if (f.classList.contains('addp')) {
      const w = chiave(f.querySelector('input').value), k = f.dataset.lista; if (!w) return;
      const pr = S.priv.parole || PAROLE0, altra = k === 'nascondi' ? 'mostra' : 'nascondi';
      const nuovo = { [k]: [...new Set([...(pr[k] || []), w])], [altra]: (pr[altra] || []).filter(x => x !== w) };
      await cambiaRegole({ parole: nuovo }, `«${w}» aggiunta`); sheetParole();
    } else if (f.id === 'fCal') {
      const testo = $('#calU').value.trim(), links = linkCal(testo);
      if (testo && !links.length) return toast('Non sembra un link di calendario: deve cominciare con webcal:// o https://');
      try { await DATI.imposta('privati', S.me, { calendario: links.join('\n'), aggiornato: Date.now() }); }
      catch (e) { return sbaglio(e); }
      closeSheet(); toast(links.length ? 'Fatto! I tuoi impegni arrivano entro mezz\'ora' : 'Calendario scollegato');
    } else if (f.id === 'fEv') {
      const who = [...f.querySelectorAll('.pk.on')].map(b => b.dataset.pk); if (!who.length) return toast('Scegli almeno una persona');
      const all = $('#evAll').checked;
      const mzOn = f.querySelector('.mz.on');
      const e = { t: $('#evT').value.trim(), d: $('#evD').value, h: all ? '' : $('#evH').value, fine: all ? '' : $('#evF').value, who, n: $('#evN').value.trim(), ripeti: $('#evR').value, mezzo: mzOn ? mzOn.dataset.mzf : '', imp: $('#evImp').checked };
      const fino = $('#evFino').value; e.fino = fino && fino > e.d && !e.ripeti ? fino : '';
      closeSheet();
      if (page === 'cal') { selDay = e.d; weekStart = inizioSettimana(new Date(e.d + 'T12:00:00')); }
      try {
        if (f.dataset.id) {
          // Un mio impegno importato: le regole su cosa vedono gli altri valgono anche dopo una modifica.
          const prima = S.impegni.find(x => x.id === f.dataset.id);
          if (prima && mioCal(prima) && !regolaCal(e.t, regole()).vis) {
            await DATI.imposta('privati', S.me, { dettagli: { [f.dataset.id]: { t: e.t, n: e.n } } });
            Object.assign(e, { t: 'Occupato', n: '', nascosto: true });
          } else if (prima && mioCal(prima)) e.nascosto = false;
          // Chi è stato aggiunto adesso riceve l'avviso "ti ha aggiunto" (lo manda il programma delle notifiche).
          if (prima && prima.fonte === 'app') Object.assign(e, { aggiunti: [...new Set([...(Date.now() - (prima.modificato || 0) < 864e5 ? prima.aggiunti || [] : []), ...who.filter(p => !(prima.who || []).includes(p))])].filter(p => who.includes(p)), modificato: Date.now(), modificatoDa: S.me });
          await DATI.aggiorna('impegni', f.dataset.id, e); toast('Impegno aggiornato');
        }
        else { fresh = await DATI.aggiungi('impegni', Object.assign(e, { fonte: 'app', creatoDa: S.me, creato: Date.now() })); render(); toast('Impegno salvato: lo vedono tutti'); }
      } catch (er) { sbaglio(er); }
    } else if (f.id === 'fPr') {
      const q = $('#prQ').value.trim().slice(0, 80); if (!q) return toast('Scrivi la domanda');
      const tp = (f.querySelector('.tp.on') || { dataset: {} }).dataset.ptipo || 'altro', opzioni = {}, visti = new Set(), ora = Date.now();
      [...f.querySelectorAll('.prO')].map(i => i.value.trim()).filter(Boolean).forEach((x, i) => {
        if (visti.has(x.toLowerCase())) return; visti.add(x.toLowerCase());
        opzioni[rid()] = { x: (x.charAt(0).toUpperCase() + x.slice(1)).slice(0, 60), by: S.me, creato: ora + i };
      });
      closeSheet(); seg = 'proposte'; LS.set('noi4-bacheca', seg);
      try { fresh = await DATI.aggiungi('proposte', { q, tipo: tp, by: S.me, creato: ora, opzioni, voti: {}, chiusa: false, scelta: '', decisa: 0 }); render(); toast('Proposta inviata: arriva una notifica a tutti 🔔'); } catch (er) { sbaglio(er); }
    } else if (f.classList.contains('addop')) {
      const inp = f.querySelector('input'), x = inp.value.trim().slice(0, 60); if (!x) return;
      const p = S.proposte.find(y => y.id === f.dataset.prop); if (!p || p.chiusa) return;
      const miei = (p.voti || {})[S.me] || [], c = opzioniDi(p).find(o => o.x.toLowerCase() === x.toLowerCase());
      inp.value = ''; inp.blur();
      // Un'idea che c'è già diventa un voto; una nuova si aggiunge e prende subito il mio voto.
      if (c) { if (!miei.includes(c.id)) await DATI.aggiorna('proposte', p.id, { ['voti.' + S.me]: [...miei, c.id] }).catch(sbaglio); return toast('C\'era già: ho messo il tuo voto'); }
      const oid = rid();
      try { await DATI.aggiorna('proposte', p.id, { ['opzioni.' + oid]: { x: x.charAt(0).toUpperCase() + x.slice(1), by: S.me, creato: Date.now() }, ['voti.' + S.me]: [...miei, oid] }); toast('Idea aggiunta, con il tuo voto'); } catch (er) { sbaglio(er); }
    } else if (f.id === 'fVi') {
      const who = [...f.querySelectorAll('.pk.on')].map(b => b.dataset.pk);
      const da = $('#viDa').value, a = $('#viA').value;
      const tipo = (f.querySelector('.tp.on') || {}).dataset ? f.querySelector('.tp.on').dataset.tipo : 'viaggio';
      const v = { t: $('#viT').value.trim().slice(0, 60), dove: $('#viD').value.trim().slice(0, 60), da, a: a && a >= da ? a : '', who, tipo };
      closeSheet();
      try {
        if (f.dataset.id) { await DATI.aggiorna('viaggi', f.dataset.id, v); toast('Ricordo aggiornato'); }
        else { const id = await DATI.aggiungi('viaggi', Object.assign(v, { creatoDa: S.me, creato: Date.now() })); fresh = id; render(); setTimeout(() => openTrip(id), 250); toast('Ricordo creato: ora aggiungete foto e video 📷'); }
      } catch (er) { sbaglio(er); }
    } else if (f.id === 'fRe') {
      const per = f.dataset.per, x = $('#reX').value.trim().slice(0, 80), n = $('#reN').value.trim().slice(0, 300); if (!x) return;
      let lego = null; try { lego = f.dataset.lego ? JSON.parse(f.dataset.lego) : null; } catch (er) {}
      const extra = lego ? { lego } : {};
      closeSheet();
      try {
        if (per === S.me) fresh = await DATI.aggiungi('regali', Object.assign({ per, x, n, creato: Date.now() }, extra));
        else { fresh = rid(); await DATI.imposta('sorprese', per, { idee: { [fresh]: Object.assign({ x, n, by: S.me, creato: Date.now() }, extra) } }); }
        render(); toast(per === S.me ? 'Aggiunto alla tua lista 🎁' : 'Idea salvata: resta un segreto 🤫');
      } catch (er) { sbaglio(er); }
    } else if (f.id === 'fVo') {
      const v = votoScelto(), mat = $('#voM').value, tp = f.querySelector('[data-votipo].on'), dd = $('#voD').value;
      if (!mat) return toast('Scegli la materia');
      if (v == null) return toast('Scegli il voto');
      const voto = { per: S.me, di: f.dataset.di, m: mat, v, tipo: tp ? tp.dataset.votipo : 'scritto', d: /^\d{4}-\d{2}-\d{2}$/.test(dd) ? dd : T, x: $('#voX').value.trim().slice(0, 120), by: S.me, creato: Date.now() };
      closeSheet(); toast(v >= 6 ? `${fmtVoto(v)} in ${mat} 🎉` : `${fmtVoto(v)} in ${mat}: la prossima andrà meglio 💪`);
      if (v >= 8) festa(document.querySelector('#mio .vbig'));
      try { await DATI.aggiungi('voti', voto); } catch (er) { sbaglio(er); }
    } else if (f.id === 'fRi') {
      const t = $('#riT').value.trim().slice(0, 60); if (!t) return;
      const v = { t, porz: $('#riP').value.trim().slice(0, 20), ingr: $('#riI').value.split('\n').map(x => x.replace(/^[\s•\-*·]+/, '').trim()).filter(Boolean).map(x => x.slice(0, 80)).slice(0, 60), come: $('#riC').value.trim().slice(0, 4000) };
      const file = riFile; riFile = null; const id0 = f.dataset.id;
      closeSheet();
      try {
        const id = id0 || await DATI.aggiungi('ricette', Object.assign(v, { by: S.me, creato: Date.now() }));
        if (id0) await DATI.aggiorna('ricette', id0, v);
        if (file) {
          toast('Carico la foto…');
          const { im, u } = await apriImmagine(file); const p = await rimpicciolisci(im, 1400, 0.85); URL.revokeObjectURL(u);
          const vecchio = (S.ricette.find(x => x.id === id) || {}).fotoPath;
          const up = await DATI.carica(`ricette/${id}/${rid()}.jpg`, p.blob, S.me);
          await DATI.aggiorna('ricette', id, { foto: up.url, fotoPath: up.path });
          if (vecchio) DATI.eliminaFile(vecchio);
        }
        fresh = id; render(); toast(id0 ? 'Ricetta aggiornata' : 'Ricetta salvata 🍳');
      } catch (er) { sbaglio(er); }
    } else if (f.id === 'addItem') {
      const v = $('#itemTx').value.trim(); if (!v) return; $('#itemTx').value = '';
      try { fresh = await DATI.aggiungi('spesa', { x: v.slice(0, 80), by: S.me, done: false, creato: Date.now() }); render(); } catch (er) { sbaglio(er); }
    }
  });
  $('#lgReset').onclick = async () => {
    const em = $('#lgEmail').value.trim(); if (!em) { $('#lgErr').textContent = 'Scrivi prima la tua email qui sopra.'; return; }
    try { await DATI.reset(em); $('#lgErr').textContent = ''; toast('Ti ho mandato un\'email: segui il link per scegliere la password.'); }
    catch (e) { $('#lgErr').textContent = !navigator.onLine ? 'Serve internet per mandare l\'email. Riprova appena c\'è rete.' : 'Non riesco a mandare l\'email. Controlla che sia scritta giusta.'; }
  };
  document.addEventListener('gesturestart', e => e.preventDefault());
  // Due dita fuori dal visore delle foto: niente zoom né spostamento di lato della pagina.
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 && !e.target.closest('.viewer')) e.preventDefault(); }, { passive: false });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  /* ---------- Avvio ---------- */
  let stopCena = null; const stopSorp = {};
  // Le sorprese si ascoltano per tutti tranne me (le mie sono chiuse, anche per le regole del database).
  function ascoltaSorprese() {
    const vuoi = Object.keys(S.persone).filter(i => i !== S.me);
    for (const k in stopSorp) if (!vuoi.includes(k)) { stopSorp[k](); delete stopSorp[k]; delete S.sorprese[k]; }
    for (const k of vuoi) if (!stopSorp[k]) stopSorp[k] = DATI.ascoltaDoc('sorprese', k, d => { S.sorprese[k] = d; render(); }) || (() => {});
  }
  function applicaTema() {
    const t = LS.get('noi4-tema', 'auto'), r = document.documentElement;
    if (t === 'auto') delete r.dataset.theme; else r.dataset.theme = t === 'scuro' ? 'dark' : 'light';
    // Colore della barra in alto (orario, Dynamic Island): se il tema è scelto a mano, un colore solo, senza seguire il telefono.
    document.querySelectorAll('meta[name=theme-color]').forEach((m, i) => {
      if (!m.dataset.media) m.dataset.media = m.getAttribute('media') || '';
      if (t === 'auto') { m.setAttribute('media', m.dataset.media); m.content = /dark/.test(m.dataset.media) ? '#111016' : '#F5F4F8'; }
      else { m.removeAttribute('media'); m.content = t === 'scuro' ? '#111016' : '#F5F4F8'; }
    });
  }
  applicaTema();
  let stopPriv = null, privDi = null;
  function ascoltaPriv() {
    if (privDi === S.me) return;
    if (stopPriv) stopPriv(); privDi = S.me; S.priv = {}; mappaImpegni();
    stopPriv = DATI.ascoltaDoc('privati', S.me, d => { S.priv = d; mappaImpegni(); render(); }) || null;
  }
  function ascoltaCena() { if (stopCena) stopCena(); stopCena = DATI.ascoltaDoc('cena', T, c => { S.cena = c; render(); }); }
  // All'uscita si staccano tutti i collegamenti ai dati (con l'accesso chiuso si fermerebbero da soli e non ripartirebbero):
  // al prossimo accesso, anche di un'altra persona sullo stesso telefono, ripartono da capo.
  const stopDati = [];
  function fermaTutto() {
    if (!avviato) return;
    avviato = false;
    stopDati.splice(0).forEach(f => { try { f(); } catch (e) {} });
    if (stopCena) { stopCena(); stopCena = null; }
    if (stopPriv) { stopPriv(); stopPriv = null; } privDi = null;
    for (const k in stopSorp) { stopSorp[k](); delete stopSorp[k]; }
    Object.assign(S, { me: null, persone: {}, impegni: [], impRaw: [], note: [], proposte: [], spesa: [], cena: {}, regali: [], sorprese: {}, viaggi: [], foto: [], priv: {}, mezzi: [], ricette: [], scuola: {}, compiti: [], voti: [] });
    seen.clear();
  }
  DATI.avvia((persona, errore) => {
    if (!persona) { fermaTutto(); $('#app').hidden = true; $('#login').hidden = false; $('#lgErr').textContent = errore || ''; return; }
    S.me = persona; $('#login').hidden = true; $('#app').hidden = false; ascoltaPriv();
    if (!avviato) {
      avviato = true;
      const a = (x) => { if (typeof x === 'function') stopDati.push(x); };
      if (DATI.iscriviDiNuovo) DATI.iscriviDiNuovo();
      a(DATI.ascolta('persone', l => { S.persone = Object.fromEntries(l.map(p => [p.id, p])); ascoltaSorprese(); mappaImpegni(); render(); }));
      a(DATI.ascolta('regali', l => { S.regali = l; render(); }));
      a(DATI.ascolta('scuola', l => { S.scuola = Object.fromEntries(l.map(x => [x.id, x])); mappaImpegni(); render(); }));
      a(DATI.ascolta('compiti', l => { S.compiti = l; mappaImpegni(); render(); }, ['per', '==', persona]));
      a(DATI.ascolta('voti', l => { S.voti = l; render(); }, ['per', '==', persona])); // come i compiti: li legge solo chi li ha scritti
      a(DATI.ascolta('ricette', l => { S.ricette = l; render(); if (ricAperta) sheetRicetta(ricAperta, true); }));
      a(DATI.ascoltaDoc('famiglia', 'mezzi', d => { S.mezzi = Array.isArray(d.lista) ? d.lista.filter(m => m && m.n) : []; render(); }));
      a(DATI.ascolta('viaggi', l => { S.viaggi = l; render(); }));
      a(DATI.ascolta('foto', l => { S.foto = l; render(); }));
      a(DATI.ascolta('impegni', l => { S.impRaw = l; mappaImpegni(); render(); }));
      a(DATI.ascolta('note', l => { S.note = l; render(); }));
      a(DATI.ascolta('proposte', l => { S.proposte = l; render(); }));
      a(DATI.ascolta('spesa', l => { S.spesa = l; render(); }));
      ascoltaCena();
      const ap = LS.get('noi4-apertura', 'oggi'); if (ap !== 'oggi' && R[ap]) go(ap);
    } else { ascoltaSorprese(); render(); }
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
