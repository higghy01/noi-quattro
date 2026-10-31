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
  const S = { me: null, persone: {}, impegni: [], note: [], spesa: [], cena: {}, regali: [], sorprese: {}, viaggi: [], foto: [] };
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
     <div class="card${ri(0)}"><h2><span class="ttl"><i class="ic">🍽️</i>A cena stasera?</span> <small>${yes === ids.length && ids.length ? 'tutti a tavola 🍝' : `${yes} su ${ids.length}`}</small></h2>
       <div class="cena" style="--n:${ids.length}">${ids.map(i => { const v = S.cena[i] || '?'; return `<button class="cv tap" data-cena="${i}" data-v="${v}" style="--pc:${col(i)}" aria-label="${esc(P(i).nome)}: ${v}"><span class="av" data-b="${v === 'si' ? '✓' : v === 'no' ? '✕' : '?'}">${ini(i)}</span><span class="nm">${esc(P(i).nome)}</span></button>`; }).join('')}</div>
       <div class="empty">Tocca il tuo cerchio: sì, no, non so.</div></div>
     <div class="card${ri(1)}"><h2><span class="ttl"><i class="ic">☀️</i>Oggi</span> <small>${fmt(T, { weekday: 'long', day: 'numeric', month: 'short' })}</small></h2>${evList(delGiorno(T), 'Giornata libera ☀️ Tocca + per aggiungere un impegno.')}</div>
     <div class="card${ri(2)}"><h2><span class="ttl"><i class="ic">🌙</i>Domani</span> <small>${fmt(tom, { weekday: 'long' })}</small></h2>${evList(delGiorno(tom), 'Domani niente in programma.')}</div>
     ${ricordo(ri(3))}
     ${pinned.length ? `<div class="card${ri(3)}"><h2><span class="ttl"><i class="ic">📌</i>In evidenza</span></h2>${pinned.map(n => `<div style="--pc:${col(n.by)}"><span class="chip"><i></i>${esc(P(n.by).nome)}</span><p style="margin:6px 0 0;white-space:pre-wrap">${esc(n.x)}</p></div>`).join('')}</div>` : ''}
     <button class="card tap${ri(4)}" data-go="spesa"><h2><span class="ttl"><i class="ic">🛒</i>Lista della spesa</span> <small>${left ? `${left} da prendere ›` : 'tutto preso ›'}</small></h2></button>
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
     <div class="card${ri(1)}"><h2><span class="ttl"><i class="ic">📅</i>${selDay === T ? 'Oggi' : fmt(selDay, { weekday: 'long', day: 'numeric', month: 'long' })}</span></h2>${evList(delGiorno(selDay, show))}</div>
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
    return `<div class="stack"><h2 class="${ri(0)}"><span class="ttl"><i class="ic">📝</i>Bacheca di casa</span> <small>${S.note.length} note</small></h2>
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
  const avs = (who) => `<span class="avs">${(who || []).filter(p => S.persone[p]).map(p => `<i style="--pc:${col(p)}">${ini(p)}</i>`).join('')}</span>`;
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
      ${gruppi.length > 1 ? `<div class="gruppi${ri(1)}"><button class="gr tap${filtroR === 'tutti' ? ' on' : ''}" data-filtror="tutti"><b>🗂️</b><span>Tutti</span><small>${tutti.length}</small></button>${gruppi.map(([k, e, n, c]) => `<button class="gr tap${filtroR === k ? ' on' : ''}" data-filtror="${k}" aria-label="${esc(n)}"><b>${e}</b><span>${esc(c)}</span><small>${conta(k)}</small></button>`).join('')}</div>` : ''}
      ${html || '<div class="empty big"><b>📸</b><span>Ancora nessun ricordo. Tocca + per aggiungerne uno: un viaggio, un pranzo, una sera al cinema, il Natale… Poi caricate foto e video tutti insieme.</span></div>'}</div>`;
  }
  // "Un anno fa…": una foto di un viaggio passato nello stesso periodo, altrimenti una a caso (la stessa per tutto il giorno).
  function ricordo(cls) {
    const conFoto = S.foto.filter(f => f.prev);
    if (!conFoto.length) return '';
    const oggi = new Date(), md = (d) => (d.getMonth() * 31) + d.getDate();
    const vicini = conFoto.filter(f => { const d = new Date(f.quando || 0); return d.getFullYear() < oggi.getFullYear() && Math.abs(md(d) - md(oggi)) <= 3; });
    const pool = vicini.length ? vicini : conFoto;
    const seme = [...T].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
    const f = [...pool].sort((a, b) => (a.id < b.id ? -1 : 1))[seme % pool.length];
    const v = S.viaggi.find(x => x.id === f.v); if (!v) return '';
    const anni = oggi.getFullYear() - new Date(f.quando || 0).getFullYear();
    const titolo = vicini.length ? (anni === 1 ? 'Un anno fa' : `${anni} anni fa`) : 'Un ricordo';
    return `<button class="card memo tap${cls}" data-viaggio="${v.id}" data-apri-foto="${f.id}"><img src="${esc(f.prev)}" alt="" loading="lazy" decoding="async"><span class="mtx"><small>${titolo}</small><b>${esc(v.t)}</b></span></button>`;
  }

  /* Schermata di un viaggio (entra da destra come le Impostazioni) */
  let tripId = null, carico = null, tripHtml = '';
  const tripAperto = () => $('#trip').classList.contains('on');
  function openTrip(id) {
    tripId = id; tripHtml = '';
    if (!tripAperto()) history.pushState({ schermo: 'viaggio' }, '');
    rTrip(); $('#trip').scrollTop = 0; $('#trip').classList.add('on'); $('#fab').classList.add('via');
  }
  function closeTrip(daIndietro) {
    if (!tripAperto()) return;
    $('#trip').classList.remove('on'); if (!impAperto()) $('#fab').classList.remove('via');
    if (daIndietro !== true && history.state && history.state.schermo) { ignoraPop++; history.back(); }
  }
  function rTrip() {
    const v = S.viaggi.find(x => x.id === tripId);
    if (!v) { if (tripAperto()) closeTrip(); return; }
    const fs = fotoDi(v.id), cop = copertina(v), t = TIPO[tipoDi(v)], nv = fs.filter(f => f.video).length;
    const html = `
     <div class="imp-top"><button class="back tap" id="tripBack"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Ricordi</button><button class="link tap" data-modviaggio="${v.id}">Modifica</button></div>
     <div class="hero">${cop ? `<img src="${esc(cop.disp || (cop.video ? cop.prev : cop.url))}" alt="">` : `<span class="noimg">${t.e}</span>`}<span class="tb">${t.e} ${esc(t.n)}</span><div class="hinfo"><h1>${esc(v.t)}</h1><span>${v.dove ? '📍 ' + esc(v.dove) + ' · ' : ''}${periodo(v)}</span>${avs(v.who)}</div></div>
     ${carico ? `<div class="prog" style="--p:${carico.pct}"><span>Carico… ${carico.fatte + 1 > carico.tot ? carico.tot : carico.fatte + 1} di ${carico.tot} · ${Math.round(carico.pct * 100)}%</span><i></i></div>`
       : `<label class="btn tap filebtn add-foto">📷 Aggiungi foto e video<input type="file" id="fotoIn" accept="image/*,video/*" multiple hidden></label>`}
     ${fs.length ? `<div class="sec">${fs.length - nv} foto${nv ? ` · ${nv} video` : ''} · originali</div><div class="grid">${fs.map(f => { const n = cuoriN(f); return `<button class="ph tap${f.id === fresh ? ' pop' : ''}" data-foto="${f.id}" style="--pc:${col(f.by)}">${f.prev ? `<img src="${esc(f.prev)}" alt="" loading="lazy" decoding="async">` : '<span class="noimg">🎞️</span>'}<i></i>${f.video ? `<em>▶ ${durata(f.durata)}</em>` : ''}${n ? `<b>❤️ ${n}</b>` : ''}</button>`; }).join('')}</div>`
       : '<div class="empty big"><b>📷</b><span>Ancora niente. Tocca "Aggiungi foto e video" e scegline quanti vuoi dalla galleria: entrano originali, a qualità piena.</span></div>'}`;
    if (html !== tripHtml) { tripHtml = html; $('#tripIn').innerHTML = html; }
  }
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
  function fotogramma(file) {
    return new Promise((ok) => {
      const u = URL.createObjectURL(file), vd = document.createElement('video'); let fatto = false;
      const fine = (r) => { if (fatto) return; fatto = true; URL.revokeObjectURL(u); ok(r); };
      vd.muted = true; vd.playsInline = true; vd.preload = 'auto';
      vd.onloadedmetadata = () => { vd.currentTime = Math.min(0.6, (vd.duration || 1) / 3); };
      vd.onseeked = async () => { try { const r = await rimpicciolisci(vd, 520, 0.8); fine(Object.assign(r, { durata: vd.duration, W: vd.videoWidth, H: vd.videoHeight })); } catch (e) { fine({ durata: vd.duration }); } };
      vd.onerror = () => fine({}); setTimeout(() => fine({ durata: vd.duration }), 8000);
      vd.src = u; vd.load();
    });
  }
  async function dataScatto(file) {
    try {
      const t = new TextDecoder('latin1').decode(await file.slice(0, 131072).arrayBuffer());
      const m = t.match(/(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
      if (m) { const d = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime(); if (m[1] > 1990 && d < Date.now() + 864e5) return d; }
    } catch (e) {}
    return file.lastModified || Date.now();
  }
  const MOSTRABILI = /^image\/(jpeg|png|webp|gif)$/;
  async function caricaFoto(files) {
    if (!DATI.fotoPronte()) return toast('Lo spazio delle foto non è ancora attivo.');
    const v = tripId, list = [...files].filter(f => /^(image|video)\//.test(f.type) || /\.(heic|heif|jpe?g|png|mov|mp4)$/i.test(f.name)).slice(0, 60); let ok = 0;
    if (files.length > 60) toast('Ne carico 60 alla volta: poi aggiungi gli altri');
    const totB = list.reduce((a, f) => a + f.size, 0) || 1; let fattiB = 0;
    carico = { fatte: 0, tot: list.length, pct: 0 }; rTrip();
    const avanti = (b) => { carico.pct = Math.min(1, (fattiB + b) / totB); const el = $('#tripIn .prog'); if (el) { el.style.setProperty('--p', carico.pct); el.querySelector('span').textContent = `Carico… ${Math.min(carico.fatte + 1, carico.tot)} di ${carico.tot} · ${Math.round(carico.pct * 100)}%`; } };
    for (const file of list) {
      try {
        const video = /^video\//.test(file.type) || /\.(mov|mp4)$/i.test(file.name);
        const quando = await dataScatto(file), id = rid() + rid();
        const ext = ((file.name.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || (video ? 'mp4' : 'jpg')).toLowerCase();
        let anteprima = {}, vista = null;
        if (video) anteprima = await fotogramma(file);
        else {
          const { im, u } = await apriImmagine(file);
          anteprima = await rimpicciolisci(im, 520, 0.8); anteprima.W = im.naturalWidth; anteprima.H = im.naturalHeight;
          if (!MOSTRABILI.test(file.type) && DATI.modo !== 'prova') vista = await rimpicciolisci(im, 3000, 0.92); // HEIC: copia da guardare anche su Android
          URL.revokeObjectURL(u);
        }
        const doc = { v, by: S.me, video, nome: (file.name || `ricordo.${ext}`).slice(0, 80), tipoFile: file.type || '', size: file.size, w: anteprima.W || 0, h: anteprima.H || 0, quando, creato: Date.now(), cuori: {} };
        if (video && anteprima.durata) doc.durata = Math.round(anteprima.durata);
        if (anteprima.blob) { const b = await DATI.carica(`foto/${v}/${id}_p.jpg`, anteprima.blob, S.me); doc.prev = b.url; doc.pathP = b.path; }
        if (vista) { const d = await DATI.carica(`foto/${v}/${id}_v.jpg`, vista.blob, S.me); doc.disp = d.url; doc.pathD = d.path; }
        if (DATI.modo === 'prova') { doc.url = video ? URL.createObjectURL(file) : doc.prev; doc.path = ''; }
        else { const a = await DATI.carica(`foto/${v}/${id}.${ext}`, file, S.me, avanti); doc.url = a.url; doc.path = a.path; }
        fresh = await DATI.aggiungi('foto', doc);
        ok++;
      } catch (e) {
        console.error(e);
        if (!ok && e && /^storage\//.test(e.code || '')) { carico = null; rTrip(); return toast('Lo spazio delle foto non risponde. Chiudi e riapri l\'app, poi riprova.'); }
      }
      fattiB += file.size; carico.fatte++; avanti(0);
    }
    carico = null; rTrip();
    if (ok) { toast(ok === 1 ? 'Aggiunto 📷' : `${ok} tra foto e video aggiunti 📷`); festa($('#tripIn .hero')); }
    if (ok < list.length) setTimeout(() => toast(`${list.length - ok} file non sono entrati. Riprova.`), 2300);
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
  async function salvaFoto(f) {
    const nome = f.nome || (f.video ? 'ricordo.mp4' : 'ricordo.jpg');
    try {
      toast(f.size > 30 * 1048576 ? `Preparo il file (${mb(f.size)})…` : 'Preparo il file…');
      const blob = await (await fetch(f.url)).blob();
      const file = new File([blob], nome, { type: blob.type || f.tipoFile || 'application/octet-stream' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) return await navigator.share({ files: [file] });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
    } catch (e) { if (e && e.name === 'AbortError') return; window.open(f.url, '_blank'); }
  }

  function rSpesa() {
    const ord = (a, b) => (b.creato || 0) - (a.creato || 0);
    const todo = S.spesa.filter(x => !x.done).sort(ord), done = S.spesa.filter(x => x.done).sort(ord);
    const row = x => `<button class="item tap${x.done ? ' done' : ''}${x.id === fresh ? ' pop' : ''}" data-item="${x.id}" style="--pc:${col(x.by)}"><span class="box"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span><span class="tx">${esc(x.x)}</span><span class="who" title="${esc(P(x.by).nome)}"></span></button>`;
    const keep = $('#itemTx') ? $('#itemTx').value : '';
    $('#p-spesa').innerHTML = `<div class="stack">
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
    if (nuovoGiorno) { TODAY = new Date(); TODAY.setHours(12, 0, 0, 0); T = iso(TODAY); ascoltaCena(); }
    document.documentElement.style.setProperty('--me', col(S.me));
    $('#hello').innerHTML = `${saluto()}, <span>${esc(P(S.me).nome)}</span>`;
    $('#meBtn').innerHTML = ini(S.me) + GEAR;
    $('#today').textContent = TODAY.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
    banner();
    const a = document.activeElement && document.activeElement.id;
    R[page](); seen.add(vista());
    if (impAperto()) rImp();
    if (tripAperto()) rTrip();
    if (visAperto()) rViewer();
    fresh = null;
    if (a === 'itemTx' && $('#itemTx')) $('#itemTx').focus();
    $('#fab').hidden = page === 'spesa';
    $('#fab').setAttribute('aria-label', page === 'note' ? (seg === 'regali' ? 'Aggiungi un desiderio' : 'Nuova nota') : page === 'viaggi' ? 'Nuovo ricordo' : 'Nuovo impegno');
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
  addEventListener('popstate', () => { if (ignoraPop) { ignoraPop--; return; } if (visAperto()) closeViewer(true); else if (aperto()) closeSheet(true); else if (tripAperto()) closeTrip(true); else if (impAperto()) closeImp(true); else if (page !== 'oggi') go('oggi', true); });

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
      if (dx > 110 || (veloce && dx > 40)) (sc.id === 'trip' ? closeTrip : closeImp)();
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
    if (t.id === 'fab') return page === 'note' ? (seg === 'regali' ? sheetRegalo(S.me) : sheetNota()) : page === 'viaggi' ? sheetViaggio() : sheetEvento();
    if (d.filtror) { filtroR = d.filtror; return rViaggi(); }
    if (d.tipo) { t.parentElement.querySelectorAll('.tp').forEach(b => b.classList.toggle('on', b === t)); return; }
    if (d.viaggio) { openTrip(d.viaggio); if (d.apriFoto) setTimeout(() => openViewer(d.apriFoto), 300); return; }
    if (t.id === 'tripBack') return closeTrip();
    if (d.modviaggio) return sheetViaggio(S.viaggi.find(x => x.id === d.modviaggio));
    if (d.foto) return openViewer(d.foto);
    if (d.vchiudi !== undefined) return closeViewer();
    if (d.cuore) {
      const f = S.foto.find(x => x.id === d.cuore); if (!f) return;
      const on = !(f.cuori || {})[S.me];
      if (on) { t.classList.add('on'); festa(t); }
      return DATI.aggiorna('foto', f.id, { cuori: Object.assign({}, f.cuori, { [S.me]: on }) }).catch(sbaglio);
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
      const fs = fotoDi(d.delviaggio); closeSheet(); closeTrip();
      for (const f of fs) { await DATI.elimina('foto', f.id).catch(() => {}); DATI.eliminaFile(f.path); DATI.eliminaFile(f.pathP); DATI.eliminaFile(f.pathD); }
      await DATI.elimina('viaggi', d.delviaggio).catch(sbaglio); return toast('Ricordo eliminato');
    }
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
    if (t.id === 'fotoIn' && t.files.length) caricaFoto(t.files);
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
    // Colore della barra in alto (orario, Dynamic Island): se il tema è scelto a mano, un colore solo, senza seguire il telefono.
    document.querySelectorAll('meta[name=theme-color]').forEach((m, i) => {
      if (!m.dataset.media) m.dataset.media = m.getAttribute('media') || '';
      if (t === 'auto') { m.setAttribute('media', m.dataset.media); m.content = /dark/.test(m.dataset.media) ? '#111016' : '#F5F4F8'; }
      else { m.removeAttribute('media'); m.content = t === 'scuro' ? '#111016' : '#F5F4F8'; }
    });
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
      DATI.ascolta('viaggi', l => { S.viaggi = l; render(); });
      DATI.ascolta('foto', l => { S.foto = l; render(); });
      DATI.ascolta('impegni', l => { S.impegni = l; render(); });
      DATI.ascolta('note', l => { S.note = l; render(); });
      DATI.ascolta('spesa', l => { S.spesa = l; render(); });
      ascoltaCena();
      const ap = LS.get('noi4-apertura', 'oggi'); if (ap !== 'oggi' && R[ap]) go(ap);
    } else { ascoltaSorprese(); render(); }
  });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
