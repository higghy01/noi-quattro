// Noi quattro - l'app. Legge e scrive solo attraverso DATI (dati.js).
(function () {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const iso = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fmt = (s, o) => new Date(s + 'T12:00:00').toLocaleDateString('it-IT', o);
  const COLORI = { blu: 'var(--p-blu)', rosa: 'var(--p-rosa)', ambra: 'var(--p-ambra)', verde: 'var(--p-verde)', viola: 'var(--p-viola)', corallo: 'var(--p-corallo)', rosso: 'var(--p-rosso)', grigio: 'var(--p-grigio)' };
  const RIPETI = { '': 'Mai', settimanale: 'Ogni settimana', mensile: 'Ogni mese', annuale: 'Ogni anno' };
  const NOTIF = [['promemoria', 'Promemoria un\'ora prima dei miei impegni'], ['nuovi', 'Quando qualcuno mi aggiunge a un impegno'],
    ['riepilogo', 'Alle 21: gli impegni di domani'], ['cena', 'Alle 17: "A cena stasera?" se non ho risposto'], ['note', 'Note messe in evidenza']];

  let TODAY = new Date(); TODAY.setHours(12, 0, 0, 0);
  let T = iso(TODAY);
  const S = { me: null, persone: {}, impegni: [], note: [], spesa: [], cena: {} };
  let page = 'oggi', selDay = T, weekStart = inizioSettimana(TODAY), filt = 'tutti';
  const seen = new Set(); let fresh = null; let avviato = false;

  function inizioSettimana(d) { const x = new Date(d); return addDays(x, -((x.getDay() + 6) % 7)); }
  const P = (id) => S.persone[id] || { nome: '?', colore: 'viola' };
  const col = (id) => COLORI[P(id).colore] || 'var(--acc)';
  const ini = (id) => (P(id).nome || '?')[0].toUpperCase();
  const IDS = () => Object.keys(S.persone).sort((a, b) => (P(a).ordine || 0) - (P(b).ordine || 0));
  const ri = (i) => seen.has(page) ? '' : ` rise" style="--i:${Math.min(i, 6)}`;
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
     <div class="card${ri(0)}"><h2>A cena stasera? <small>${yes} su ${ids.length}</small></h2>
       <div class="cena" style="--n:${ids.length}">${ids.map(i => { const v = S.cena[i] || '?'; return `<button class="cv tap" data-cena="${i}" data-v="${v}" style="--pc:${col(i)}" aria-label="${esc(P(i).nome)}: ${v}"><span class="av" data-b="${v === 'si' ? '✓' : v === 'no' ? '✕' : '?'}">${ini(i)}</span><span class="nm">${esc(P(i).nome)}</span></button>`; }).join('')}</div>
       <div class="empty">Tocca il tuo cerchio: sì, no, non so.</div></div>
     <div class="card${ri(1)}"><h2>Oggi <small>${fmt(T, { weekday: 'long', day: 'numeric', month: 'short' })}</small></h2>${evList(delGiorno(T))}</div>
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
    const list = [...S.note].sort((a, b) => (b.pin - a.pin) || ((b.creato || 0) - (a.creato || 0)));
    $('#p-note').innerHTML = `<div class="stack"><h2 class="${ri(0)}">Bacheca di casa <small>${S.note.length} note</small></h2>
    ${list.length ? `<div class="notes">${list.map((n, i) => `<div class="note${n.id === fresh ? ' pop' : ri(i + 1)}" style="--pc:${col(n.by)}"><p>${esc(n.x)}</p><div class="by"><span class="chip"><i></i>${esc(P(n.by).nome)}</span><span class="acts">${n.by === S.me ? `<button class="del tap" data-delnote="${n.id}" aria-label="Togli la nota">✕</button>` : ''}<button class="pin tap${n.pin ? ' on' : ''}" data-pin="${n.id}" aria-label="Metti in evidenza">📌</button></span></div></div>`).join('')}</div>` : '<div class="empty">Ancora nessuna nota. Tocca + per scriverne una.</div>'}</div>`;
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
  function render() {
    if (!S.me || !S.persone[S.me]) return;
    const nuovoGiorno = iso(new Date()) !== T;
    if (nuovoGiorno) { TODAY = new Date(); TODAY.setHours(12, 0, 0, 0); T = iso(TODAY); ascoltaCena(); }
    document.documentElement.style.setProperty('--me', col(S.me));
    $('#hello').innerHTML = `Ciao <span>${esc(P(S.me).nome)}</span>`;
    $('#meBtn').textContent = ini(S.me);
    $('#today').textContent = TODAY.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    banner();
    const a = document.activeElement && document.activeElement.id;
    R[page](); seen.add(page); fresh = null;
    if (a === 'itemTx' && $('#itemTx')) $('#itemTx').focus();
    $('#fab').hidden = page === 'spesa';
  }
  function banner() {
    const b = $('#banner');
    if (DATI.modo === 'prova') { b.hidden = false; b.innerHTML = `<span>Modalità prova: dati di esempio, solo su questo telefono.</span>`; return; }
    const off = !('Notification' in window) || Notification.permission !== 'granted';
    let nascosto = false; try { nascosto = localStorage.getItem('noi4-banner-notifiche') === 'no'; } catch (e) {}
    b.hidden = !off || nascosto;
    if (!b.hidden) b.innerHTML = `<span>Vuoi sapere quando c'è qualcosa di nuovo?</span><button class="tap" id="bnOn">Attiva notifiche</button>`;
  }
  function go(p) {
    if (p === page) return; page = p;
    document.querySelectorAll('.page').forEach(el => el.classList.toggle('on', el.id === 'p-' + p));
    document.querySelectorAll('.tab').forEach((t, i) => { t.classList.toggle('on', t.dataset.p === p); if (t.dataset.p === p) $('#tpill').style.transform = `translateX(${i * 100}%)`; });
    scrollTo({ top: 0 }); render();
  }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.k); toast.k = setTimeout(() => el.classList.remove('on'), 2200); }
  const sbaglio = (e) => { console.error(e); toast('Non sono riuscito a salvare. Riprova tra poco.'); };

  /* ---------- Fogli dal basso ---------- */
  function openSheet(html, after) { $('#sheetIn').innerHTML = `<div class="grab"></div>` + html; $('#veil').classList.add('on'); $('#sheet').classList.add('on'); $('#sheet').scrollTop = 0; after && after(); }
  function closeSheet() { $('#veil').classList.remove('on'); $('#sheet').classList.remove('on'); }
  $('#veil').onclick = closeSheet;
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
  function sheetProfilo() {
    const me = P(S.me), pref = me.notifiche || {};
    openSheet(`<h3>${esc(me.nome)}</h3>
      <div class="sec">Notifiche</div>
      <button class="btn tap" id="notOn">Attiva le notifiche su questo telefono</button>
      ${NOTIF.map(([k, t]) => `<label class="sw">${t}<input type="checkbox" data-pref="${k}"${pref[k] !== false ? ' checked' : ''}></label>`).join('')}
      <div class="sec">Il mio calendario</div>
      <div class="empty">Puoi caricare un file del tuo calendario (.ics): i tuoi impegni dei prossimi 12 mesi entrano nell'app. Se lo rifai, quelli importati prima vengono sostituiti. Per averli sempre aggiornati da soli, chiedi a Sasha di collegare il tuo calendario.</div>
      <label class="btn ghost tap" style="display:grid;place-items:center;color:var(--fg)">Importa un file del calendario<input type="file" id="icsFile" accept=".ics,text/calendar" hidden></label>
      ${DATI.modo === 'prova' ? `<div class="sec">Prova</div><div class="empty">Guarda l'app come un'altra persona:</div>${pickHtml([S.me]).replace(/data-pk=/g, 'data-me=')}<button class="link tap" id="reset">Rimetti i dati di esempio</button>`
        : `<button class="link tap" id="esci">Esci da questo telefono</button>`}`);
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
        out.push({ t: (ev.summary || 'Impegno').slice(0, 80), d: iso(s), h: all ? '' : hhmm(s), fine: !all && end ? hhmm(end.toJSDate()) : '',
          who: [S.me], n: (ev.location || '').slice(0, 200), ripeti: '', fonte: 'import:' + S.me, creatoDa: S.me, creato: Date.now() });
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
      closeSheet(); toast(out.length ? `Importati ${out.length} impegni` : 'Nel file non ci sono impegni nei prossimi 12 mesi');
    } catch (e) { console.error(e); toast('Il file non sembra un calendario .ics valido.'); }
  }

  /* ---------- Tocchi ---------- */
  document.addEventListener('click', async (ev) => {
    const t = ev.target.closest('button'); if (!t) return;
    const d = t.dataset;
    if (t.classList.contains('tab')) return go(d.p);
    if (d.go) return go(d.go);
    if (t.id === 'fab') return page === 'note' ? sheetNota() : sheetEvento();
    if (t.id === 'meBtn') return sheetProfilo();
    if (d.me) { DATI.cambiaPersona(d.me); closeSheet(); return; }
    if (t.id === 'reset') { DATI.ricomincia(); seen.clear(); closeSheet(); return toast('Dati di esempio rimessi'); }
    if (t.id === 'esci') { closeSheet(); return DATI.esci(); }
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
      setTimeout(() => DATI.aggiorna('spesa', x.id, { done: !x.done }).catch(sbaglio), 380); return;
    }
    if (t.id === 'clear') { const g = S.spesa.filter(x => x.done); for (const x of g) DATI.elimina('spesa', x.id).catch(sbaglio); return toast('Lista pulita'); }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.id === 'evAll') $('#evOre').hidden = t.checked;
    if (t.dataset && t.dataset.pref) DATI.imposta('persone', S.me, { notifiche: Object.assign({}, P(S.me).notifiche, { [t.dataset.pref]: t.checked }) }).catch(sbaglio);
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
  let stopCena = null;
  function ascoltaCena() { if (stopCena) stopCena(); stopCena = DATI.ascoltaDoc('cena', T, c => { S.cena = c; render(); }); }
  DATI.avvia((persona, errore) => {
    if (!persona) { $('#app').hidden = true; $('#login').hidden = false; $('#lgErr').textContent = errore || ''; return; }
    S.me = persona; $('#login').hidden = true; $('#app').hidden = false;
    if (!avviato) {
      avviato = true;
      DATI.ascolta('persone', l => { S.persone = Object.fromEntries(l.map(p => [p.id, p])); render(); });
      DATI.ascolta('impegni', l => { S.impegni = l; render(); });
      DATI.ascolta('note', l => { S.note = l; render(); });
      DATI.ascolta('spesa', l => { S.spesa = l; render(); });
      ascoltaCena();
    } else render();
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
