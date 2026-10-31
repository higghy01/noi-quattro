// Noi quattro - l'app. Legge e scrive solo attraverso DATI (dati.js).
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
    ['cena', 'Il pomeriggio: "A cena stasera?" se non ho risposto', 'oraCena', [15, 16, 17, 18, 19], 17], ['note', 'Note messe in evidenza']];
  const SCHEDE = ['oggi', 'cal', 'note', 'spesa'];
  const NOMI_SCHEDE = { oggi: 'Oggi', cal: 'Impegni', note: 'Bacheca', spesa: 'Spesa' };
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
  const S = { me: null, persone: {}, impegni: [], note: [], spesa: [], cena: {}, regali: [], sorprese: {} };
  let page = 'oggi', selDay = T, weekStart = inizioSettimana(TODAY), filt = 'tutti', seg = LS.get('noi4-bacheca', 'note');
  const seen = new Set(); let fresh = null; let avviato = false;

  function inizioSettimana(d) { const x = new Date(d); return addDays(x, -((x.getDay() + 6) % 7)); }
  const P = (id) => S.persone[id] || { nome: '?', colore: 'viola' };
  const col = (id) => COLORI[P(id).colore] || 'var(--acc)';
  const ini = (id) => (P(id).nome || '?')[0].toUpperCase();
  const IDS = () => Object.keys(S.persone).sort((a, b) => (P(a).ordine || 0) - (P(b).ordine || 0));
  const vista = () => page === 'note' ? 'note-' + seg : page;
  const ri = (i) => seen.has(vista()) ? '' : ` rise" style="--i:${Math.min(i, 6)}`;
  const saluto = () => { const h = new Date().getHours(); return h < 5 ? 'Buonanotte' : h < 13 ? 'Buongiorno' : h < 18 ? 'Buon pomeriggio' : 'Buonasera'; };
  const modificabile = (e) => e.fonte === 'app' || e.fonte === 'import:' + S.me;

  function capita(e, d) {
    if (!e.ripeti) return e.d === d;
    if (d < e.d) return false;
    if (e.ripeti === 'settimanale') return new Date(d + 'T12:00:00').getDay() === new Date(e.d + 'T12:00:00').getDay();
    if (e.ripeti === 'mensile') return d.slice(8) === e.d.slice(8);
    if (e.ripeti === 'annuale') return d.slice(5) === e.d.slice(5);
    return false;
  }
  const delGiorno = (d, f) => S.impegni.filter(e => capita(e, d) && (!f || f(e))).sort((a, b) => (a.h || '').localeCompare(b.h || ''));

  function chips(who) {
    const ids = IDS();
    if (who.length >= ids.length && ids.length > 1) return `<span class="chip" style="--pc:var(--acc)"><i></i>Tutti</span>`;
    return who.filter(w => S.persone[w]).map(w => `<span class="chip" style="--pc:${col(w)}"><i></i>${esc(P(w).nome)}</span>`).join('');
  }
  function evList(list, vuoto) {
    if (!list.length) return `<div class="empty">${vuoto || 'Nessun impegno. Tocca + per aggiungerne uno.'}</div>`;
    return list.map(e => `<button class="ev tap${e.id === fresh ? ' pop' : ''}" data-ev="${e.id}">
      <div class="h">${e.h ? esc(e.h) : '<small>tutto il giorno</small>'}${e.h && e.fine ? `<small>${esc(e.fine)}</small>` : ''}</div>
      <div><div class="t">${esc(e.t)}</div>${e.n ? `<div class="n">${esc(e.n)}</div>` : ''}<div class="dots">${chips(e.who || [])}</div></div></button>`).join('');
  }

  /* ---------- Pagine ---------- */
  function rOggi() {
    const tom = iso(addDays(TODAY, 1));
    const pinned = S.note.filter(n => n.pin);
    const left = S.spesa.filter(x => !x.done).length;
    const ids = IDS();
    const yes = ids.filter(i => S.cena[i] === 'si').length;
    $('#p-oggi').innerHTML = `<div class="stack">
     <div class="card${ri(0)}"><h2>A cena stasera? <small>${yes === ids.length && ids.length ? 'tutti a tavola 🍝' : `${yes} su ${ids.length}`}</small></h2>
       <div class="cena" style="--n:${ids.length}">${ids.map(i => { const v = S.cena[i] || '?'; return `<button class="cv tap" data-cena="${i}" data-v="${v}" style="--pc:${col(i)}" aria-label="${esc(P(i).nome)}: ${v}"><span class="av" data-b="${v === 'si' ? '✓' : v === 'no' ? '✕' : '?'}">${ini(i)}</span><span class="nm">${esc(P(i).nome)}</span></button>`; }).join('')}</div>
       <div class="empty">Tocca il tuo cerchio: sì, no, non so.</div></div>
     <div class="card${ri(1)}"><h2>Oggi <small>${fmt(T, { weekday: 'long', day: 'numeric', month: 'short' })}</small></h2>${evList(delGiorno(T), 'Giornata libera ☀️ Tocca + per aggiungere un impegno.')}</div>
     <div class="card${ri(2)}"><h2>Domani <small>${fmt(tom, { weekday: 'long' })}</small></h2>${evList(delGiorno(tom), 'Domani niente in programma.')}</div>
     ${pinned.length ? `<div class="card${ri(3)}"><h2>In evidenza</h2>${pinned.map(n => `<div style="--pc:${col(n.by)}"><span class="chip"><i></i>${esc(P(n.by).nome)}</span><p style="margin:6px 0 0;white-space:pre-wrap">${esc(n.x)}</p></div>`).join('')}</div>` : ''}
     <button class="card tap${ri(4)}" data-go="spesa"><h2>Lista della spesa <small>${left ? `${left} da prendere ›` : 'tutto preso ›'}</small></h2></button>
    </div>`;
  }

  function rCal() {
    const days = [...Array(7)].map((_, i) => iso(addDays(weekStart, i)));
    const k = days.indexOf(selDay);
    const show = e => filt === 'tutti' || (e.who || []).includes(filt);
    const ids = IDS();
    $('#p-cal').innerHTML = `<div class="stack">
     <div class="card${ri(0)}">
       <div class="wnav"><button class="tap" data-wk="-1" aria-label="Settimana prima">‹</button><b>${fmt(days[0], { day: 'numeric', month: 'short' })} – ${fmt(days[6], { day: 'numeric', month: 'short' })}</b><button class="tap" data-wk="1" aria-label="Settimana dopo">›</button></div>
       <div class="week"><div class="wsel" style="transform:translateX(calc(${Math.max(k, 0)} * (100% + 4px)));opacity:${k < 0 ? 0 : 1}"></div>
       ${days.map(d => { const ppl = [...new Set(delGiorno(d, show).flatMap(e => e.who || []))].filter(p => S.persone[p]); return `<button class="day tap${d === selDay ? ' sel' : ''}${d === T ? ' oggi' : ''}" data-day="${d}"><span class="wd">${fmt(d, { weekday: 'short' })}</span><span class="dn">${+d.slice(8)}</span><span class="pd">${ppl.slice(0, 4).map(p => `<i style="--pc:${col(p)}"></i>`).join('')}</span></button>`; }).join('')}</div>
       <div class="filters">${['tutti', ...ids].map(f => `<button class="fb tap${filt === f ? ' on' : ''}" data-f="${f}" style="--pc:${f === 'tutti' ? 'var(--acc)' : col(f)}"><i></i>${f === 'tutti' ? 'Tutti' : esc(P(f).nome)}</button>`).join('')}</div>
     </div>
     <div class="card${ri(1)}"><h2>${selDay === T ? 'Oggi' : fmt(selDay, { weekday: 'long', day: 'numeric', month: 'long' })}</h2>${evList(delGiorno(selDay, show))}</div>
    </div>`;
  }

  function rNote() {
    const el = $('#p-note');
    // Il selettore resta fermo (così la pillola scorre), cambia solo il contenuto sotto.
    if (!$('#segNote')) el.innerHTML = `<div class="seg" id="segNote" style="--n:2"><i class="spill"></i><button class="tap" data-seg="note">Note</button><button class="tap" data-seg="regali">Regali 🎁</button></div><div id="noteBody"></div>`;
    segSet($('#segNote'), seg === 'regali' ? 1 : 0);
    $('#noteBody').innerHTML = seg === 'regali' ? rRegali() : rBacheca();
  }
  function segSet(el, k) { el.style.setProperty('--k', k); el.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === k)); }
  function rBacheca() {
    const list = [...S.note].sort((a, b) => (b.pin - a.pin) || ((b.creato || 0) - (a.creato || 0)));
    const nuova = !seen.has(vista());
    return `<div class="stack"><h2 class="${ri(0)}">Bacheca di casa <small>${S.note.length} note</small></h2>
    ${list.length ? `<div class="notes">${list.map((n, i) => `<div class="note${n.id === fresh ? ' pop' : nuova ? ' rise' : ''}" style="--pc:${col(n.by)};--i:${Math.min(i + 1, 6)}"><p>${esc(n.x)}</p><div class="by"><span class="chip"><i></i>${esc(P(n.by).nome)}</span><span class="acts">${n.by === S.me ? `<button class="del tap" data-delnote="${n.id}" aria-label="Togli la nota">✕</button>` : ''}<button class="pin tap${n.pin ? ' on' : ''}" data-pin="${n.id}" aria-label="Metti in evidenza">📌</button></span></div></div>`).join('')}</div>` : '<div class="empty big"><b>📝</b><span>Ancora nessuna nota. Tocca + per scriverne una.</span></div>'}</div>`;
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
        const tag = r.idea ? `<div class="n">🤫 Idea segreta di ${r.by === S.me ? 'te' : esc(P(r.by).nome)}</div>` : '';
        let az = '';
        if (mio) az = `<button class="gx tap" data-delreg="${r.id}" aria-label="Togli dalla lista">✕</button>`;
        else if (chi && chi !== S.me) az = `<span class="preso">🎁 Lo prende ${esc(P(chi).nome)}</span>`;
        else az = `<button class="prendo tap${chi === S.me ? ' on' : ''}" data-prendo="${r.id}" data-per="${p}">${chi === S.me ? '✓ Lo prendo io' : 'Lo prendo io'}</button>`;
        const via = r.idea && r.by === S.me ? `<button class="gx tap" data-delidea="${r.id}" data-per="${p}" aria-label="Togli l'idea">✕</button>` : '';
        return `<div class="gi${r.id === fresh ? ' pop' : ''}${chi ? ' taken' : ''}"><div class="gt"><div class="t">${esc(r.x)}</div>${nota}${tag}</div><div class="ga">${az}${via}</div></div>`;
      };
      return `<div class="card gift${seen.has(vista()) ? '' : ' rise'}" style="--pc:${col(p)};--i:${Math.min(i, 6)}">
        <h2><span class="gh"><span class="gav">${ini(p)}</span>${mio ? 'La mia lista' : 'Per ' + esc(P(p).nome)}</span><small>${mio ? tutti.length : `${presiN} su ${tutti.length} presi`}</small></h2>
        ${tutti.length ? `<div>${tutti.map(riga).join('')}</div>` : `<div class="empty">${mio ? 'Scrivi cosa ti piacerebbe ricevere: un libro, una felpa, un\'esperienza.' : 'Non ha ancora scritto niente. Puoi lasciare un\'idea segreta.'}</div>`}
        ${mio ? `<div class="hint">🤫 Gli altri segnano cosa ti regalano, ma tu non lo vedi: resta una sorpresa.</div>` : ''}
        <button class="link tap" data-addreg="${p}">${mio ? '+ Aggiungi un desiderio' : `+ Idea segreta per ${esc(P(p).nome)}`}</button></div>`;
    };
    return `<div class="stack">${[S.me, ...IDS().filter(i => i !== S.me)].map(card).join('')}</div>`;
  }

  function rSpesa() {
    const ord = (a, b) => (b.creato || 0) - (a.creato || 0);
    const todo = S.spesa.filter(x => !x.done).sort(ord), done = S.spesa.filter(x => x.done).sort(ord);
    const row = x => `<button class="item tap${x.done ? ' done' : ''}${x.id === fresh ? ' pop' : ''}" data-item="${x.id}" style="--pc:${col(x.by)}"><span class="box"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="tx">${esc(x.x)}</span><span class="who" title="${esc(P(x.by).nome)}"></span></button>`;
    const keep = $('#itemTx') ? $('#itemTx').value : '';
    $('#p-spesa').innerHTML = `<div class="stack">
     <form class="add${ri(0)}" id="addItem"><input id="itemTx" placeholder="Cosa serve?" autocomplete="off" aria-label="Cosa serve" enterkeyhint="done"><button class="btn tap">Aggiungi</button></form>
     <div class="card${ri(1)}"><h2>Da prendere <small>${todo.length}</small></h2><div>${todo.map(row).join('') || '<div class="empty">Niente da prendere.</div>'}</div></div>
     ${done.length ? `<div class="card${ri(2)}"><h2>Già nel carrello <button class="link tap" id="clear">Togli</button></h2><div>${done.map(row).join('')}</div></div>` : ''}
    </div>`;
    $('#itemTx').value = keep;
  }

  const R = { oggi: rOggi, cal: rCal, note: rNote, spesa: rSpesa };
  const GEAR = '<span class="gear" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>';
  function render() {
    if (!S.me || !S.persone[S.me]) return;
    const nuovoGiorno = iso(new Date()) !== T;
    if (nuovoGiorno) { TODAY = new Date(); TODAY.setHours(12, 0, 0, 0); T = iso(TODAY); ascoltaCena(); }
    document.documentElement.style.setProperty('--me', col(S.me));
    $('#hello').innerHTML = `${saluto()}, <span>${esc(P(S.me).nome)}</span>`;
    $('#meBtn').innerHTML = ini(S.me) + GEAR;
    $('#today').textContent = TODAY.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    banner();
    const a = document.activeElement && document.activeElement.id;
    R[page](); seen.add(vista()); fresh = null;
    if (impAperto()) rImp();
    if (a === 'itemTx' && $('#itemTx')) $('#itemTx').focus();
    $('#fab').hidden = page === 'spesa';
    $('#fab').setAttribute('aria-label', page === 'note' ? (seg === 'regali' ? 'Aggiungi un desiderio' : 'Nuova nota') : 'Nuovo impegno');
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
    page = p;
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
  addEventListener('popstate', () => { if (ignoraPop) { ignoraPop--; return; } if (aperto()) closeSheet(true); else if (impAperto()) closeImp(true); else if (page !== 'oggi') go('oggi', true); });

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
  const pickHtml = (sel) => `<div class="pick">${IDS().map(i => `<button type="button" class="pk tap${sel.includes(i) ? ' on' : ''}" data-pk="${i}" style="--pc:${col(i)}"><i>${ini(i)}</i>${esc(P(i).nome)}</button>`).join('')}</div>`;

  function sheetEvento(e) {
    e = e || { t: '', d: page === 'cal' ? selDay : T, h: '18:00', fine: '', who: [S.me], n: '', ripeti: '' };
    openSheet(`<h3>${e.id ? 'Modifica impegno' : 'Nuovo impegno'}</h3><form class="stack" id="fEv" data-id="${e.id || ''}">
     <label>Cosa<input id="evT" required maxlength="80" value="${esc(e.t)}" placeholder="Es. visita, partita, compleanno"></label>
     <div class="row2"><label>Giorno<input id="evD" type="date" value="${esc(e.d)}" required></label><label>Si ripete<select id="evR">${Object.entries(RIPETI).map(([k, v]) => `<option value="${k}"${(e.ripeti || '') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>
     <label class="sw">Tutto il giorno<input type="checkbox" id="evAll"${e.h ? '' : ' checked'}></label>
     <div class="row2" id="evOre"${e.h ? '' : ' hidden'}><label>Dalle<input id="evH" type="time" value="${esc(e.h || '18:00')}"></label><label>Alle (facoltativo)<input id="evF" type="time" value="${esc(e.fine || '')}"></label></div>
     <label>Chi c'è</label>${pickHtml(e.who || [S.me])}
     <label>Nota<input id="evN" maxlength="200" value="${esc(e.n)}" placeholder="Facoltativa"></label>
     <button class="btn tap">${e.id ? 'Salva le modifiche' : 'Salva impegno'}</button></form>`, () => { if (!e.id) setTimeout(() => $('#evT').focus(), 380); });
  }
  function sheetDettaglio(e) {
    const fonte = e.fonte && e.fonte.startsWith('calendario:') ? `Dal calendario di ${esc(P(e.fonte.slice(11)).nome)}` : e.fonte && e.fonte.startsWith('import:') ? `Importato da ${esc(P(e.fonte.slice(7)).nome)}` : `Aggiunto da ${esc(P(e.creatoDa).nome)}`;
    openSheet(`<h3>${esc(e.t)}</h3>
      <div>${fmt(e.d, { weekday: 'long', day: 'numeric', month: 'long' })}${e.h ? ` · ${esc(e.h)}${e.fine ? '–' + esc(e.fine) : ''}` : ' · tutto il giorno'}${e.ripeti ? ` · ${RIPETI[e.ripeti].toLowerCase()}` : ''}</div>
      ${e.n ? `<div class="muted">${esc(e.n)}</div>` : ''}<div class="dots">${chips(e.who || [])}</div><div class="src">${fonte}</div>
      ${modificabile(e) ? `<div class="row2"><button class="btn ghost tap" data-modifica="${e.id}">Modifica</button><button class="btn bad tap" data-elimina="${e.id}">Elimina</button></div>` : `<div class="empty">Si cambia dal calendario di chi l'ha scritto.</div>`}`);
  }
  function sheetNota() {
    openSheet(`<h3>Nuova nota</h3><form class="stack" id="fNo"><label>Messaggio per tutti<textarea id="noX" required maxlength="400" placeholder="Scrivi qui"></textarea></label><label class="sw">Metti in evidenza<input type="checkbox" id="noPin"></label><button class="btn tap">Attacca in bacheca</button></form>`, () => setTimeout(() => $('#noX').focus(), 380));
  }
  function sheetRegalo(per) {
    const mio = per === S.me;
    openSheet(`<h3>${mio ? 'Un desiderio per la mia lista' : 'Idea segreta per ' + esc(P(per).nome)}</h3><form class="stack" id="fRe" data-per="${per}">
     ${mio ? '' : `<div class="hint">🤫 ${esc(P(per).nome)} non la vede: la vedete solo voi altri.</div>`}
     <label>${mio ? 'Cosa ti piacerebbe ricevere' : 'Cosa potremmo regalare'}<input id="reX" required maxlength="80" placeholder="Es. un libro, una felpa, un concerto"></label>
     <label>Dettagli o link (facoltativo)<input id="reN" maxlength="300" placeholder="Taglia, colore, negozio o indirizzo web"></label>
     <button class="btn tap">${mio ? 'Aggiungi alla mia lista' : 'Salva l\'idea'}</button></form>`, () => setTimeout(() => $('#reX').focus(), 380));
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
  function rImp() {
    const me = P(S.me), pref = me.notifiche || {};
    const sr = (i) => impNuova ? ` rise" style="--i:${Math.min(i, 8)}` : '';
    const attive = 'Notification' in window && Notification.permission === 'granted';
    const tema = LS.get('noi4-tema', 'auto'), apri = LS.get('noi4-apertura', 'oggi');
    const collegato = S.impegni.some(e => e.fonte === 'calendario:' + S.me);
    const importati = S.impegni.filter(e => e.fonte === 'import:' + S.me).length;
    const segHtml = (nome, voci, k) => `<div class="seg" style="--n:${voci.length};--k:${Math.max(0, voci.findIndex(v => v[0] === k))}"><i class="spill"></i>${voci.map(([v, t]) => `<button class="tap${v === k ? ' on' : ''}" data-${nome}="${v}">${t}</button>`).join('')}</div>`;
    $('#impIn').innerHTML = `
     <div class="imp-top"><button class="back tap" id="impBack" aria-label="Indietro"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Indietro</button></div>
     <h1 class="hello${sr(0)}">Impostazioni</h1>
     <div class="card prof${impNuova ? ' rise' : ''}" style="--pc:${col(S.me)};--i:1"><span class="pav">${ini(S.me)}</span><div><b>${esc(me.nome)}</b><div class="muted">Il tuo colore in famiglia: ${NOMI_COLORI[me.colore] || 'viola'}</div></div>
       <div class="fam">${IDS().map(i => `<i style="--pc:${col(i)}" title="${esc(P(i).nome)}">${ini(i)}</i>`).join('')}</div></div>

     <div class="sec${sr(2)}">Notifiche</div>
     <div class="card${sr(2)}">
       ${attive ? `<div class="stato"><span class="ok">✓</span>Attive su questo telefono</div>` : `<button class="btn tap" id="notOn">Attiva le notifiche su questo telefono</button>`}
       <div>${NOTIF.map(([k, t, oraK, ore, solita]) => `<label class="sw">${t}<input type="checkbox" data-pref="${k}"${pref[k] !== false ? ' checked' : ''}></label>
         ${oraK && pref[k] !== false ? `<div class="ore" style="--n:${ore.length}">${ore.map(h => `<button class="ora tap${(+pref[oraK] || solita) === h ? ' on' : ''}" data-ora="${oraK}" data-h="${h}">${h}:00</button>`).join('')}</div>` : ''}`).join('')}</div>
     </div>

     <div class="sec${sr(3)}">Aspetto</div>
     <div class="card${sr(3)}">${segHtml('tema', [['auto', 'Automatico'], ['chiaro', 'Chiaro ☀️'], ['scuro', 'Scuro 🌙']], tema)}
       <div class="empty">Automatico segue il telefono. Vale solo su questo telefono.</div></div>

     <div class="sec${sr(4)}">All'apertura</div>
     <div class="card${sr(4)}">${segHtml('apri', SCHEDE.map(x => [x, NOMI_SCHEDE[x]]), apri)}
       <div class="empty">La scheda che vedi per prima quando apri l'app.</div></div>

     <div class="sec${sr(5)}">Il mio calendario</div>
     <div class="card${sr(5)}">
       <div class="stato">${collegato ? `<span class="ok">✓</span>Collegato: si aggiorna da solo ogni mezz'ora` : `<span class="no">!</span>Non ancora collegato: chiedi a Sasha`}</div>
       <label class="sw">Gli altri vedono solo "Occupato"<input type="checkbox" id="privOcc"${me.privacy === 'occupato' ? ' checked' : ''}></label>
       <div class="empty">Se è acceso, dei tuoi impegni dal calendario gli altri vedono solo l'orario, senza titolo né luogo.</div>
       <label class="btn ghost tap filebtn">Importa un file del calendario (.ics)<input type="file" id="icsFile" accept=".ics,text/calendar" hidden></label>
       <div class="empty">Entrano i tuoi impegni dei prossimi 12 mesi. Se lo rifai, quelli importati prima vengono sostituiti.</div>
       ${importati ? `<button class="link tap" id="togliImp">Togli i ${importati} impegni importati</button>` : ''}
     </div>

     ${DATI.modo === 'prova' ? `<div class="sec${sr(6)}">Prova</div><div class="card${sr(6)}"><div class="empty">Guarda l'app come un'altra persona:</div>${pickHtml([S.me]).replace(/data-pk=/g, 'data-me=')}<button class="link tap" id="reset">Rimetti i dati di esempio</button></div>`
       : `<div class="card${sr(6)}"><button class="btn bad tap" id="esci">Esci da questo telefono</button></div>`}
     <div class="ver">Noi quattro · fatta in casa con cura 💜</div>`;
  }
  // Si chiude anche trascinando da sinistra verso destra, come su iPhone.
  (() => {
    const sc = $('#imp'); let x0 = null, dx = 0, t0 = 0;
    sc.addEventListener('touchstart', e => { const x = e.touches[0].clientX; x0 = x < 32 ? x : null; dx = 0; t0 = Date.now(); }, { passive: true });
    sc.addEventListener('touchmove', e => {
      if (x0 == null) return; dx = Math.max(0, e.touches[0].clientX - x0);
      if (dx > 4) { e.preventDefault(); sc.classList.add('drag'); sc.style.transform = `translateX(${dx}px)`; }
    }, { passive: false });
    sc.addEventListener('touchend', () => {
      if (x0 == null) return; x0 = null;
      const veloce = dx / Math.max(1, Date.now() - t0) > 0.5;
      sc.classList.remove('drag'); sc.style.transform = '';
      if (dx > 110 || (veloce && dx > 40)) closeImp();
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
  async function importaIcs(file) {
    if (!window.ICAL) return toast('Serve internet per leggere il file. Riprova.');
    toast('Leggo il calendario…');
    try {
      const comp = new ICAL.Component(ICAL.parse(await file.text()));
      const da = new Date(); da.setHours(0, 0, 0, 0);
      const a = addDays(da, 366);
      const out = [];
      const hhmm = (d) => d.toTimeString().slice(0, 5);
      const push = (ev, start, end) => {
        const s = start.toJSDate(); if (s < da || s > a || out.length >= 800) return;
        const all = start.isDate;
        const occ = P(S.me).privacy === 'occupato';
        out.push({ t: occ ? 'Occupato' : (ev.summary || 'Impegno').slice(0, 80), d: iso(s), h: all ? '' : hhmm(s), fine: !all && end ? hhmm(end.toJSDate()) : '',
          who: [S.me], n: occ ? '' : (ev.location || '').slice(0, 200), ripeti: '', fonte: 'import:' + S.me, creatoDa: S.me, creato: Date.now() });
      };
      for (const v of comp.getAllSubcomponents('vevent')) {
        const ev = new ICAL.Event(v);
        if (ev.isRecurrenceException()) continue;
        if (!ev.isRecurring()) { push(ev, ev.startDate, ev.endDate); continue; }
        const it = ev.iterator(); let next, n = 0;
        while ((next = it.next()) && n++ < 400) {
          if (next.toJSDate() > a) break;
          const o = ev.getOccurrenceDetails(next); push(o.item, o.startDate, o.endDate);
        }
      }
      const vecchi = S.impegni.filter(e => e.fonte === 'import:' + S.me);
      for (const e of vecchi) await DATI.elimina('impegni', e.id);
      await DATI.molti('impegni', out);
      closeSheet(); render(); toast(out.length ? `Importati ${out.length} impegni` : 'Nel file non ci sono impegni nei prossimi 12 mesi');
    } catch (e) { console.error(e); toast('Il file non sembra un calendario .ics valido.'); }
  }

  /* ---------- Tocchi ---------- */
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (t.classList.contains('tab')) return go(d.p);
    if (d.go) return go(d.go);
    if (t.id === 'fab') return page === 'note' ? (seg === 'regali' ? sheetRegalo(S.me) : sheetNota()) : sheetEvento();
    if (t.id === 'meBtn') return openImp();
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
      const g = S.impegni.filter(e => e.fonte === 'import:' + S.me);
      for (const e of g) await DATI.elimina('impegni', e.id).catch(sbaglio);
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
      if (d.cena !== S.me) return toast('Puoi rispondere solo per te');
      const o = ['si', 'no', '?']; const v = o[(o.indexOf(S.cena[S.me] || '?') + 1) % 3];
      S.cena[S.me] = v; rOggi(); const n = document.querySelector(`[data-cena="${S.me}"]`); n && n.classList.add('bump');
      if (v === 'si' && IDS().every(i => S.cena[i] === 'si')) { festa(n); toast('Stasera tutti a tavola! 🍝'); }
      return DATI.imposta('cena', T, { [S.me]: v }).catch(sbaglio);
    }
    if (d.ev) { const e = S.impegni.find(x => x.id === d.ev); return e && sheetDettaglio(e); }
    if (d.modifica) return sheetEvento(S.impegni.find(x => x.id === d.modifica));
    if (d.elimina) {
      if (!t.dataset.sicuro) { t.dataset.sicuro = '1'; t.textContent = 'Tocca ancora per eliminare'; return; }
      closeSheet(); await DATI.elimina('impegni', d.elimina).catch(sbaglio); return toast('Impegno eliminato');
    }
    if (d.day) { selDay = d.day; return rCal(); }
    if (d.wk) {
      weekStart = addDays(weekStart, 7 * d.wk);
      const g = [...Array(7)].map((_, i) => iso(addDays(weekStart, i)));
      selDay = g.includes(T) ? T : g[0]; return rCal();
    }
    if (d.f) { filt = d.f; return rCal(); }
    if (d.pin) { const n = S.note.find(x => x.id === d.pin); return n && DATI.aggiorna('note', n.id, { pin: !n.pin }).catch(sbaglio); }
    if (d.delnote) {
      if (!t.dataset.sicuro) { t.dataset.sicuro = '1'; t.style.opacity = 1; t.style.color = 'var(--bad)'; return toast('Tocca ancora ✕ per togliere la nota'); }
      return DATI.elimina('note', d.delnote).catch(sbaglio);
    }
    if (d.item) {
      const x = S.spesa.find(y => y.id === d.item); if (!x) return;
      t.classList.toggle('done');
      if (!x.done && S.spesa.filter(y => !y.done).length === 1) { festa(t.querySelector('.box')); setTimeout(() => toast('Tutto preso! 🎉'), 200); }
      setTimeout(() => DATI.aggiorna('spesa', x.id, { done: !x.done }).catch(sbaglio), 380); return;
    }
    if (t.id === 'clear') { const g = S.spesa.filter(x => x.done); for (const x of g) DATI.elimina('spesa', x.id).catch(sbaglio); return toast('Lista pulita'); }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'evAll') $('#evOre').hidden = t.checked;
    // Si salva dopo che l'interruttore ha finito di scorrere (il salvataggio ridisegna la pagina).
    if (t.dataset && t.dataset.pref) { const k = t.dataset.pref, v = t.checked; setTimeout(() => DATI.imposta('persone', S.me, { notifiche: Object.assign({}, P(S.me).notifiche, { [k]: v }) }).catch(sbaglio), 320); }
    if (t.id === 'privOcc') { const v = t.checked ? 'occupato' : 'tutto'; setTimeout(() => DATI.imposta('persone', S.me, { privacy: v }).catch(sbaglio), 320); toast(t.checked ? 'Gli altri vedranno solo "Occupato"' : 'Gli altri vedranno i tuoi impegni per intero'); }
    if (t.id === 'icsFile' && t.files[0]) importaIcs(t.files[0]);
  });
  document.addEventListener('submit', async (ev) => {
    ev.preventDefault(); const f = ev.target;
    if (f.id === 'fLogin') {
      $('#lgErr').textContent = '';
      try { await DATI.login($('#lgEmail').value, $('#lgPass').value); }
      catch (e) { $('#lgErr').textContent = 'Email o password non corrette.'; }
    } else if (f.id === 'fEv') {
      const who = [...f.querySelectorAll('.pk.on')].map(b => b.dataset.pk); if (!who.length) return toast('Scegli almeno una persona');
      const all = $('#evAll').checked;
      const e = { t: $('#evT').value.trim(), d: $('#evD').value, h: all ? '' : $('#evH').value, fine: all ? '' : $('#evF').value, who, n: $('#evN').value.trim(), ripeti: $('#evR').value };
      closeSheet();
      if (page === 'cal') { selDay = e.d; weekStart = inizioSettimana(new Date(e.d + 'T12:00:00')); }
      try {
        if (f.dataset.id) { await DATI.aggiorna('impegni', f.dataset.id, e); toast('Impegno aggiornato'); }
        else { fresh = await DATI.aggiungi('impegni', Object.assign(e, { fonte: 'app', creatoDa: S.me, creato: Date.now() })); render(); toast('Impegno salvato: lo vedono tutti'); }
      } catch (er) { sbaglio(er); }
    } else if (f.id === 'fNo') {
      const n = { by: S.me, x: $('#noX').value.trim(), pin: $('#noPin').checked, creato: Date.now() }; closeSheet();
      try { fresh = await DATI.aggiungi('note', n); render(); toast('Nota attaccata'); } catch (er) { sbaglio(er); }
    } else if (f.id === 'fRe') {
      const per = f.dataset.per, x = $('#reX').value.trim().slice(0, 80), n = $('#reN').value.trim().slice(0, 300); if (!x) return;
      closeSheet();
      try {
        if (per === S.me) fresh = await DATI.aggiungi('regali', { per, x, n, creato: Date.now() });
        else { fresh = rid(); await DATI.imposta('sorprese', per, { idee: { [fresh]: { x, n, by: S.me, creato: Date.now() } } }); }
        render(); toast(per === S.me ? 'Aggiunto alla tua lista 🎁' : 'Idea salvata: resta un segreto 🤫');
      } catch (er) { sbaglio(er); }
    } else if (f.id === 'addItem') {
      const v = $('#itemTx').value.trim(); if (!v) return; $('#itemTx').value = '';
      try { fresh = await DATI.aggiungi('spesa', { x: v.slice(0, 80), by: S.me, done: false, creato: Date.now() }); render(); } catch (er) { sbaglio(er); }
    }
  });
  $('#lgReset').onclick = async () => {
    const em = $('#lgEmail').value.trim(); if (!em) { $('#lgErr').textContent = 'Scrivi prima la tua email qui sopra.'; return; }
    try { await DATI.reset(em); $('#lgErr').textContent = ''; toast('Ti ho mandato un\'email: segui il link per scegliere la password.'); }
    catch (e) { $('#lgErr').textContent = 'Non riesco a mandare l\'email. Controlla che sia scritta giusta.'; }
  };
  document.addEventListener('gesturestart', e => e.preventDefault());
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
    document.querySelectorAll('meta[name=theme-color]').forEach(m => { const scuro = t === 'auto' ? /dark/.test(m.media) : t === 'scuro'; m.content = scuro ? '#111016' : '#F5F4F8'; });
  }
  applicaTema();
  function ascoltaCena() { if (stopCena) stopCena(); stopCena = DATI.ascoltaDoc('cena', T, c => { S.cena = c; render(); }); }
  DATI.avvia((persona, errore) => {
    if (!persona) { $('#app').hidden = true; $('#login').hidden = false; $('#lgErr').textContent = errore || ''; return; }
    S.me = persona; $('#login').hidden = true; $('#app').hidden = false;
    if (!avviato) {
      avviato = true;
      DATI.ascolta('persone', l => { S.persone = Object.fromEntries(l.map(p => [p.id, p])); ascoltaSorprese(); render(); });
      DATI.ascolta('regali', l => { S.regali = l; render(); });
      DATI.ascolta('impegni', l => { S.impegni = l; render(); });
      DATI.ascolta('note', l => { S.note = l; render(); });
      DATI.ascolta('spesa', l => { S.spesa = l; render(); });
      ascoltaCena();
      const ap = LS.get('noi4-apertura', 'oggi'); if (ap !== 'oggi' && R[ap]) go(ap);
    } else { ascoltaSorprese(); render(); }
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
