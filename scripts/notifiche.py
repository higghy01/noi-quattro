"""Manda le notifiche di NDSZ. Gira dentro Firebase ogni 5 minuti (functions/main.py, scelta di Sasha del 02/11/2026);
si può ancora lanciare a mano da GitHub (workflow Notifiche).

- promemoria: un'ora prima di un impegno (o appena possibile fino a mezz'ora prima), a chi partecipa;
- nuovi: quando qualcuno ti aggiunge a un impegno;
- riepilogo: la sera (alle 21, o all'ora scelta nelle Impostazioni), gli impegni di domani;
- cena: il pomeriggio (alle 17, o all'ora scelta), "A cena stasera?" a chi non ha ancora risposto;
- pranzo (v91, 08/11/2026): la sera (alle 20, o all'ora scelta), "A pranzo domani?" a chi non ha ancora risposto;
- proposte: una proposta nuova (a tutti tranne chi l'ha fatta), "hanno votato tutti" (a chi l'ha fatta)
  e cosa si è deciso (a tutti tranne chi ha deciso);
- conflitti: a chi ha due impegni che si accavallano oggi, domani o dopodomani;
- babbo (07/11/2026): quando qualcuno segna che va da babbo, cambia le date o torna prima, a chi resta a casa;
- note: quando qualcuno scrive una nota nella Bacheca, a tutti gli altri, senza il testo (e le note più vecchie di 24 ore si cancellano);
  quando qualcuno risponde a una nota, a chi l'ha scritta (v91; le risposte spariscono con la nota);
- mie (sezione "Per me", 02/11/2026): i promemoria all'ora giusta (e di nuovo dopo mezz'ora se non è stato toccato
  "Fatto"), le scadenze il mese prima e una settimana prima della fine del mese,
  le mostre segnate una settimana prima che chiudano e le mostre nuove a chi le segue.
Ognuno sceglie quali ricevere dall'app (persone/<id>.notifiche). Cosa è già stato mandato
si ricorda in sistema/notifiche, così niente arriva due volte.
"""
import calendar
import datetime as dt
import os
import re

from firebase_admin import messaging

from sincronizza_calendari import compleanno
from comune import ROMA, adesso, capita, database

MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
URL_APP = os.environ.get("URL_APP") or "https://higghy01.github.io/noi-quattro/"


def main():
    if not os.environ.get("FIREBASE_CHIAVE") and not os.environ.get("K_SERVICE"):
        print("Chiave di Firebase non ancora inserita: niente da fare.")
        return
    db = database()
    ora = adesso()
    oggi = ora.date().isoformat()
    domani = (ora.date() + dt.timedelta(days=1)).isoformat()
    ieri = (ora.date() - dt.timedelta(days=1)).isoformat()
    stato_ref = db.collection("sistema").document("notifiche")
    stato = (stato_ref.get().to_dict() or {})
    # Lanciato a mano da GitHub mentre Firebase funziona: si ferma, per non mandare gli stessi avvisi due volte.
    if not os.environ.get("K_SERVICE") and stato.get("da") == "firebase" and ora.timestamp() * 1000 - int(stato.get("ultimo") or 0) < 10 * 60 * 1000:
        print("Firebase ha fatto un giro negli ultimi 10 minuti: niente da fare qui.")
        return
    # "ti ha aggiunto" si ricorda 14 giorni: un impegno modificato spesso tiene la lista "aggiunti" e l'avviso tornava dopo 2 giorni.
    inviati = {k: v for k, v in (stato.get("inviati") or {}).items()
               if v >= (ora.date() - dt.timedelta(days=14 if k.startswith("nuovo|") else 2)).isoformat()}
    gia = set(inviati)  # mandati nei giri prima di questo

    persone = {d.id: d.to_dict() for d in db.collection("persone").stream()}
    token = {}
    for d in db.collection("token").stream():
        token.setdefault(d.to_dict().get("persona"), []).append(d.id)
    # Solo gli impegni che servono (dal 02/11/2026 il giro è ogni 5 minuti e le letture costano): quelli che si ripetono,
    # quelli da 60 giorni fa a dopodomani (anche i lunghi, tipo le ferie) e quelli nuovi o cambiati nell'ultimo giorno.
    recente0 = int((ora - dt.timedelta(days=1)).timestamp() * 1000)
    col = db.collection("impegni")
    tutti = {}
    for q in (col.where("ripeti", "in", ["settimanale", "mensile", "annuale"]),
              col.where("d", ">=", (ora.date() - dt.timedelta(days=60)).isoformat()).where("d", "<=", (ora.date() + dt.timedelta(days=3)).isoformat()),
              col.where("creato", ">", recente0), col.where("modificato", ">", recente0)):
        for d in q.stream():
            tutti[d.id] = dict(d.to_dict(), id=d.id)
    impegni = list(tutti.values())
    # "Da babbo" annullati (07/11/2026): restano nel database solo per avvisare chi l'aveva saputo; per il resto non esistono.
    annullati = [e for e in impegni if e.get("babbo") and e.get("annullato")]
    impegni = [e for e in impegni if not (e.get("babbo") and e.get("annullato"))]
    # Titoli veri degli impegni nascosti ("Occupato"): solo per il loro proprietario.
    dettagli = {d.id: (d.to_dict() or {}).get("dettagli") or {} for d in db.collection("privati").stream()}

    def titolo_per(e, p):
        """Il titolo che vede la persona p: il proprietario di un impegno nascosto vede quello vero."""
        if e.get("nascosto") and e.get("creatoDa") == p:
            vero = dettagli.get(p, {}).get(e["id"]) or {}
            return vero.get("t") or e.get("t", ""), vero.get("n") or ""
        return e.get("t", ""), e.get("n") or ""
    # "Nuovo" = arrivato nell'ultimo giorno; cosa è già stato avvisato lo ricorda "inviati".
    # Così arriva anche l'avviso di un impegno salvato senza rete e caricato più tardi.
    recente = int((ora - dt.timedelta(days=1)).timestamp() * 1000)

    vuole = lambda p, tipo: (persone.get(p, {}).get("notifiche") or {}).get(tipo, True)
    def ora_di(p, k, solita):
        try:
            return int((persone.get(p, {}).get("notifiche") or {}).get(k) or solita)
        except (TypeError, ValueError):
            return solita  # un valore strano nelle preferenze non deve fermare gli avvisi di tutti
    nome = lambda p: persone.get(p, {}).get("nome", "Qualcuno")
    da_mandare = []  # (persona, titolo, testo, chiave)

    def manda(p, tipo, titolo, testo, chiave):
        if chiave in inviati or not vuole(p, tipo):
            return
        da_mandare.append((p, titolo, testo))
        inviati[chiave] = oggi

    # Promemoria: impegni che iniziano tra 30 e 62 minuti (anche subito dopo mezzanotte, guardando domani).
    for giorno in (oggi, domani):
        for e in impegni:
            if not e.get("h") or e.get("babbo") or not capita(e, giorno):
                continue  # il "da babbo" non ha il promemoria: ha il suo avviso, a chi resta a casa
            if (e.get("fino") or "") > e.get("d", "") and giorno != e.get("d"):
                continue  # impegno di più giorni: il promemoria solo il primo giorno
            inizio = dt.datetime.fromisoformat(f"{giorno}T{e['h']}").replace(tzinfo=ROMA)
            # In secondi veri: con le date dello stesso fuso Python ignora il cambio d'ora (le due notti dell'anno l'avviso saltava o arrivava 2 ore prima).
            if 30 * 60 <= inizio.timestamp() - ora.timestamp() <= 62 * 60:  # giri ogni 5 minuti: parte tra 62 e 57 minuti prima; se salta qualche giro, fino a 30
                for p in e.get("who", []):
                    t, luogo = titolo_per(e, p)
                    manda(p, "promemoria", f"Tra poco: {t}", f"Alle {e['h']}" + (f" · {luogo}" if luogo else ""), f"prom|{e['id']}|{giorno}|{p}")

    # Nuovi impegni con altre persone dentro, e persone aggiunte dopo a un impegno che c'era già.
    for e in impegni:
        if e.get("fonte") != "app" or (e.get("babbo") and e.get("tornato")):
            continue  # un "da babbo" già tornato (anche quello di chi torna prima dell'altro) non è una novità
        quando = dt.date.fromisoformat(e["d"]).strftime("%d/%m") + (f" alle {e['h']}" if e.get("h") else "")
        nuovo = e.get("creato", 0) > recente
        aggiunti = (e.get("aggiunti") or []) if e.get("modificato", 0) > recente else []
        chi = e.get("modificatoDa") or e.get("creatoDa")
        for p in e.get("who", []):
            # Prima chi è stato aggiunto dopo (col nome di chi l'ha aggiunto davvero), poi i nuovi impegni.
            if p in aggiunti and p != chi:
                manda(p, "nuovi", f"{nome(chi)} ti ha aggiunto", f"{e['t']} · {quando}", f"nuovo|{e['id']}|{p}")
            elif nuovo and p != e.get("creatoDa"):
                manda(p, "nuovi", f"{nome(e.get('creatoDa'))} ti ha aggiunto", f"{e['t']} · {quando}", f"nuovo|{e['id']}|{p}")

    # Da babbo (07/11/2026): a chi resta a casa (non a chi va, non a chi l'ha scritto), quando qualcuno lo segna, quando
    # cambiano le date o le persone, quando torna prima e quando lo toglie. Quando finisce all'ora prevista, niente avviso.
    # A chi va: se un altro gli cambia le date. "cambiato" lo scrive l'app solo se cambiano date o persone.
    GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"]

    def quando_bb(d, h):
        g = dt.date.fromisoformat(d)
        n = (g - ora.date()).days
        giorno = "oggi" if n == 0 else "domani" if n == 1 else "ieri" if n == -1 else GIORNI[g.weekday()] if 1 < n < 7 else f"{GIORNI[g.weekday()]} {g.day}/{g.month}"
        return f"{giorno} a mezzanotte" if h == "23:59" else f"{giorno} alle {h}" if h else giorno

    nomi_bb = lambda e: " e ".join(nome(p) for p in e.get("who") or [] if p in persone)
    for e in impegni + annullati:
        if not e.get("babbo") or e.get("fonte") != "app" or not e.get("h"):
            continue
        chi = [p for p in e.get("who") or [] if p in persone]
        if not chi:
            continue
        nomi, uno = nomi_bb(e), len(chi) == 1
        fine_d = e.get("fino") or e.get("d")
        try:
            fine = dt.datetime.fromisoformat(f"{fine_d}T{e.get('fine') or '23:59'}").replace(tzinfo=ROMA)
            creato, cambiato, tornato, annullato = (int(e.get(k) or 0) for k in ("creato", "cambiato", "tornato", "annullato"))
        except (TypeError, ValueError):
            continue  # un impegno scritto male non deve fermare gli avvisi di tutti
        altri = [p for p in persone if p not in chi]
        # Avvisato prima (o l'ha scritto lui): solo a lui interessa sapere che è cambiato o annullato.
        sapeva = lambda p: f"bb|{e['id']}|{p}" in gia or creato <= recente or p == e.get("creatoDa")
        if annullato:
            if annullato > recente and fine.timestamp() * 1000 > annullato:
                for p in altri:
                    if p != e.get("annullatoDa") and sapeva(p):
                        manda(p, "babbo", f"🏡 {nomi} non {'va' if uno else 'vanno'} più da babbo", f"Tolto da {nome(e.get('annullatoDa'))}: lo vedi in Oggi.",
                              f"bbvia|{e['id']}|{p}")
            elif annullato <= recente:
                db.collection("impegni").document(e["id"]).delete()  # avvisato ieri: ora si può cancellare
            continue
        if tornato > recente:
            for p in altri:
                if p != e.get("tornatoDa"):
                    manda(p, "babbo", f"🏠 {nomi} {'è' if uno else 'sono'} a casa", "Il da babbo è finito prima: lo vedi in Oggi.",
                          f"bbcasa|{e['id']}|{tornato}|{p}")
            continue
        if tornato or fine.timestamp() <= ora.timestamp():
            continue  # già finito
        testo = f"Parte {quando_bb(e['d'], e['h'])} · torna {quando_bb(fine_d, e.get('fine'))}"
        for p in altri:
            if creato > recente and p != e.get("creatoDa"):
                manda(p, "babbo", f"🏡 {nomi} da babbo", testo, f"bb|{e['id']}|{p}")
            # Cambiato dopo il primo avviso (se l'avviso non era ancora partito, arriva già con le date nuove).
            if cambiato > recente and p != e.get("modificatoDa") and sapeva(p):
                manda(p, "babbo", f"🏡 {nomi} da babbo: cambiato", testo, f"bbmod|{e['id']}|{cambiato}|{p}")
        for p in chi:
            if cambiato > recente and p != e.get("modificatoDa") and (f"nuovo|{e['id']}|{p}" in gia or creato <= recente or p == e.get("creatoDa")):
                manda(p, "babbo", "🏡 Il tuo da babbo è cambiato", testo, f"bbmod|{e['id']}|{cambiato}|{p}")

    # Riepilogo serale: ognuno all'ora che ha scelto (di solito le 21).
    serale = [p for p in persone if ora.hour == ora_di(p, "oraRiepilogo", 21)]
    if serale:
        # Come l'app: i compleanni arrivati dai calendari prima della regola non si contano.
        # Il "da babbo" solo il giorno in cui parte (nei giorni dopo non è una novità).
        lista = sorted((e for e in impegni if capita(e, domani) and not (e.get("babbo") and e.get("d") != domani)
                        and not (str(e.get("fonte", "")).startswith(("calendario:", "import:"))
                                 and compleanno(e.get("t", ""), e.get("ripeti") == "annuale" and not e.get("h")))),
                       key=lambda e: e.get("h") or "")
        if lista:
            for p in serale:
                righe = [f"{e['h'] or 'tutto il giorno'} " + (f"{nomi_bb(e)} da babbo" if e.get("babbo") else titolo_per(e, p)[0]) for e in lista[:4]]
                testo = " · ".join(righe) + (f" e altri {len(lista) - 4}" if len(lista) > 4 else "")
                manda(p, "riepilogo", f"Domani: {len(lista)} impegni in famiglia", testo, f"riep|{oggi}|{p}")

    def minuti(h):
        return int(h[:2]) * 60 + int(h[3:5])

    def intervallo(e, giorno):
        # Più giorni con orario (stessa regola dell'app): primo giorno dall'inizio, in mezzo tutto il giorno, ultimo fino alla fine.
        if not e.get("ripeti") and (e.get("fino") or "") > e.get("d", ""):
            a = minuti(e["h"]) if giorno == e["d"] else 0
            b = minuti(e["fine"]) if giorno == e["fino"] and e.get("fine") else 24 * 60
            return a, b or 24 * 60  # "fine" 00:00 nell'ultimo giorno = fino a mezzanotte (prima quel giorno risultava libero)
        a = minuti(e["h"])
        b = minuti(e["fine"]) if e.get("fine") else a + 60
        return a, (b if b > a else 24 * 60)
    # Pasti automatici (stessa regola dell'app, app.js fuoriCena): chi è impegnato nell'ora del pasto non c'è
    # (cena 20-21, pranzo 13-14). Un turno di lavoro dura fino all'arrivo a casa (fine + il tempo di strada scelto,
    # di base 20 minuti). Non contano gli impegni con tutta la famiglia né quelli di tutto il giorno.
    def fuori_pasto(p, giorno, cena0, cena1):
        strada = persone.get(p, {}).get("strada")
        strada = strada if strada in (0, 10, 20, 30, 45) else 20
        for e in impegni:
            who = e.get("who") or []
            if p not in who or not e.get("h") or not capita(e, giorno):
                continue
            if e.get("fonte") == f"orario:{p}":
                if e.get("fine"):
                    b = minuti(e["fine"]) if e["fine"] > e["h"] else 24 * 60  # turno che passa la mezzanotte (es. 19-1)
                    if b + strada > cena0 and minuti(e["h"]) < cena1:
                        return True
                continue
            if str(e.get("fonte", "")).startswith("orario:") or (len(who) >= len(persone) > 1):
                continue
            a, b = intervallo(e, giorno)
            if a < cena1 and b > cena0:
                return True
        return False

    def fuori_cena(p):
        return fuori_pasto(p, oggi, 20 * 60, 21 * 60)

    # Automatismo (v92, come app.js aCasaBabbo): nel giorno in cui torna da babbo prima del pasto, o ci va dopo,
    # risulta a tavola da solo: non serve chiederglielo.
    def a_casa_babbo(p, giorno, a, b):
        for e in impegni:
            if not e.get("babbo") or p not in (e.get("who") or []) or not e.get("h"):
                continue
            fine_g, fine = e.get("fino") or e.get("d"), e.get("fine") or ""
            if fine_g == giorno and re.fullmatch(r"\d\d:\d\d", fine) and 0 < minuti(fine) <= a and not (e.get("d") == giorno and minuti(e["h"]) >= b):
                return True
            if e.get("d") == giorno and minuti(e["h"]) >= b:
                return True
        return False

    # Cena: ognuno all'ora che ha scelto (di solito le 17). Chi risulta già fuori (turno o impegno a cena) non serve chiederlo.
    pomeriggio = [p for p in persone if ora.hour == ora_di(p, "oraCena", 17)]
    if pomeriggio:
        cena = (db.collection("cena").document(oggi).get().to_dict() or {})
        for p in pomeriggio:
            if cena.get(p) not in ("si", "no") and not fuori_cena(p) and not a_casa_babbo(p, oggi, 20 * 60, 21 * 60):
                manda(p, "cena", "A cena stasera?", "Rispondi con un tocco nella scheda Oggi.", f"cena|{oggi}|{p}")

    # Pranzo di domani (v91, 08/11/2026): la sera, all'ora scelta (di solito le 20), a chi non ha ancora
    # risposto. Chi domani è al lavoro o impegnato tra le 13 e le 14 (anche da babbo) non serve chiederlo.
    sera = [p for p in persone if ora.hour == ora_di(p, "oraPranzo", 20)]
    if sera:
        pranzo = (db.collection("pranzo").document(domani).get().to_dict() or {})
        for p in sera:
            if pranzo.get(p) not in ("si", "no") and not fuori_pasto(p, domani, 13 * 60, 14 * 60) and not a_casa_babbo(p, domani, 13 * 60, 14 * 60):
                manda(p, "pranzo", "A pranzo domani?", "Rispondi con un tocco nella scheda Oggi.", f"pranzo|{domani}|{p}")

    def num(v):
        # Un numero strano nel database (es. testo al posto della data) non deve fermare gli avvisi di tutti.
        try:
            return int(v or 0)
        except (TypeError, ValueError):
            return 0

    # Le note durano 24 ore (Sasha, 03/11/2026): dopo si cancellano. Sono poche, quindi si leggono tutte.
    scadute = int((ora - dt.timedelta(hours=24)).timestamp() * 1000)
    for d in db.collection("note").stream():
        if num((d.to_dict() or {}).get("creato")) <= scadute:
            d.reference.delete()

    # Note nuove della Bacheca (02/11/2026, Sasha): a tutti tranne chi l'ha scritta, senza il testo.
    for d in db.collection("note").where("creato", ">", recente).stream():
        n = d.to_dict() or {}
        for p in persone:
            if p != n.get("by"):
                manda(p, "note", f"{nome(n.get('by'))} ha scritto una nota", "Leggila nella Bacheca, tra le Note.", f"nota|{d.id}|{p}")

    # Risposte alle note (v91): spariscono con la nota (o dopo 24 ore). L'avviso, senza il testo, va a chi ha scritto
    # la nota e (v92) a chi aveva già risposto, così la conversazione continua; una sola notifica per nota a ogni giro.
    vive = {d.id: (d.to_dict() or {}) for d in db.collection("note").stream()}
    risposte = []
    for d in db.collection("risposte").stream():
        r = d.to_dict() or {}
        creata = num(r.get("creato"))
        if r.get("nota") not in vive or creata <= scadute:
            d.reference.delete()
            continue
        risposte.append((d.id, r, creata))
    da_dire = {}  # (persona, nota) -> [(id della risposta, chi ha risposto)]
    for rid, r, creata in sorted(risposte, key=lambda x: x[2]):
        chi_r, nota = r.get("by"), r["nota"]
        if creata <= recente or chi_r not in persone:
            continue
        prima = {x[1].get("by") for x in risposte if x[1].get("nota") == nota and x[2] < creata}
        for p in ({vive[nota].get("by")} | prima) - {chi_r}:
            if p in persone and f"risp|{rid}|{p}" not in inviati:
                da_dire.setdefault((p, nota), []).append((rid, chi_r))
    for (p, nota), lista in da_dire.items():
        chi_ids = list(dict.fromkeys(c for _, c in lista))
        chi = [nome(c) for c in chi_ids]
        autore = vive[nota].get("by")
        di = "alla tua nota" if autore == p else "alla sua nota" if chi_ids == [autore] else f"alla nota di {nome(autore)}"
        nomi_r = chi[0] if len(chi) == 1 else ", ".join(chi[:-1]) + " e " + chi[-1]
        titolo = f"{nomi_r} {'ha' if len(chi) == 1 else 'hanno'} risposto {di}"
        manda(p, "note", titolo, "Leggi nella Bacheca, tra le Note.", f"risp|{lista[0][0]}|{p}")
        for rid, _ in lista[1:]:
            inviati[f"risp|{rid}|{p}"] = oggi  # le altre della stessa notifica

    # Spesa (v92, automatismo): quello già nel carrello da più di 12 ore si toglie da solo.
    dodici = int((ora - dt.timedelta(hours=12)).timestamp() * 1000)
    for d in db.collection("spesa").where("done", "==", True).stream():
        x = d.to_dict() or {}
        if num(x.get("preso") or x.get("creato")) <= dodici:
            d.reference.delete()

    # Due impegni della stessa persona alla stessa ora (oggi, domani, dopodomani: "inviati" ricorda per 2 giorni).
    for k in range(3):
        giorno = (ora.date() + dt.timedelta(days=k)).isoformat()
        del_giorno = [e for e in impegni if e.get("h") and not e.get("babbo") and capita(e, giorno)]  # il da babbo non si accavalla
        for p in persone:
            suoi = sorted((e for e in del_giorno if p in (e.get("who") or [])), key=lambda e: e["h"])
            for i, x in enumerate(suoi):
                for y in suoi[i + 1:]:
                    (a1, b1), (a2, b2) = intervallo(x, giorno), intervallo(y, giorno)
                    tx, ty = titolo_per(x, p)[0], titolo_per(y, p)[0]
                    if a1 < b2 and a2 < b1 and tx != ty:
                        quando = "oggi" if k == 0 else "domani" if k == 1 else dt.date.fromisoformat(giorno).strftime("%d/%m")
                        manda(p, "conflitti", f"Due impegni alla stessa ora {quando}", f"{x['h']} {tx} · {y['h']} {ty}",
                              f"conf|{min(x['id'], y['id'])}|{max(x['id'], y['id'])}|{giorno}|{p}")

    # Automatismo (v92): "Cosa si mangia stasera?" (proposte di tipo cena fatte oggi) alle 19:30 si decide da sola,
    # se c'è una più votata chiara (almeno 2 voti, nessun pareggio). Chi l'ha proposta la può riaprire dall'app.
    if (ora.hour, ora.minute) >= (19, 30):
        mezzanotte = int(ora.replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
        for d in db.collection("proposte").stream():
            pr = d.to_dict() or {}
            if pr.get("chiusa") or pr.get("tipo") != "cena" or num(pr.get("creato")) < mezzanotte:
                continue
            opz = {k: v for k, v in (pr.get("opzioni") or {}).items() if isinstance(v, dict) and v.get("x")}
            voti = pr.get("voti") or {}
            conta = sorted(((sum(1 for p in persone if k in (voti.get(p) or [])), k) for k in opz), reverse=True)
            if conta and conta[0][0] >= 2 and (len(conta) == 1 or conta[0][0] > conta[1][0]):
                quando = int(ora.timestamp() * 1000)
                d.reference.update({"chiusa": True, "scelta": opz[conta[0][1]]["x"], "decisa": quando, "auto": True})

    # Proposte: nuove, "hanno votato tutti", decise.
    for d in db.collection("proposte").stream():
        pr = d.to_dict() or {}
        chi, q = pr.get("by"), pr.get("q", "")
        opz = {k: v for k, v in (pr.get("opzioni") or {}).items() if isinstance(v, dict) and v.get("x")}
        if pr.get("chiusa"):
            decisa = int(pr.get("decisa") or 0)
            if decisa > recente:
                for p in persone:
                    if p != chi or pr.get("auto"):  # decisa da sola: lo sa anche chi l'ha proposta
                        perche = "la più votata, deciso da solo alle 19:30" if pr.get("auto") else f"ha deciso {nome(chi)}"
                        manda(p, "proposte", f"Deciso: {pr.get('scelta', '')}", f"{q} · {perche}", f"deciso|{d.id}|{decisa}|{p}")
            continue
        if int(pr.get("creato") or 0) > recente:
            idee = " · ".join(v["x"] for v in sorted(opz.values(), key=lambda v: v.get("creato", 0))[:4])
            for p in persone:
                if p != chi:
                    manda(p, "proposte", f"{nome(chi)} propone: {q}", (idee + " · " if idee else "") + "Vota nella Bacheca", f"proposta|{d.id}|{p}")
        voti = pr.get("voti") or {}
        # Solo per le proposte degli ultimi due giorni: così l'avviso non torna quando "inviati" dimentica.
        due_giorni = int((ora - dt.timedelta(days=2)).timestamp() * 1000)
        # "Tutti" = tutti gli altri: chi propone può anche non votare.
        if chi in persone and opz and int(pr.get("creato") or 0) > due_giorni and all(voti.get(p) for p in persone if p != chi):
            conta = {k: sum(1 for p in persone if k in (voti.get(p) or [])) for k in opz}
            testa = max(sorted(opz, key=lambda k: opz[k].get("creato", 0)), key=lambda k: conta[k])
            manda(chi, "proposte", f"Hanno votato tutti: {q}", f"In testa: {opz[testa]['x']} ({conta[testa]} voti). Decidi nella Bacheca.", f"tutti|{d.id}|{chi}")

    # Sezione "Per me" (raccolta "mie": ognuno vede solo le sue, qui le legge il programma con la chiave di servizio).
    mie = [dict(d.to_dict() or {}, id=d.id) for d in db.collection("mie").stream()]
    for x in mie:
        p, k, t, e = x.get("per"), x.get("k"), str(x.get("t") or ""), str(x.get("e") or "")
        if p not in persone:
            continue
        if k == "prom" and re.fullmatch(r"\d\d:\d\d", str(x.get("h") or "")):
            ogni, ult = max(1, int(x.get("ogni") or 1)), str(x.get("ult") or "")
            dovuto = oggi if ogni == 1 or not ult else (dt.date.fromisoformat(ult) + dt.timedelta(days=ogni)).isoformat()
            if ult == oggi or dovuto > oggi:
                continue
            dopo = dt.timedelta(seconds=ora.timestamp() - dt.datetime.fromisoformat(f"{oggi}T{x['h']}").replace(tzinfo=ROMA).timestamp())
            if dt.timedelta(0) <= dopo <= dt.timedelta(minutes=90) and f"mie1|{x['id']}|{oggi}" not in gia:
                manda(p, "mie", f"{e} {t}".strip(), "Quando hai fatto, tocca Fatto nell'app.", f"mie1|{x['id']}|{oggi}")
            # Il secondo avviso solo se il primo è partito in un giro prima (mai due di fila).
            elif dt.timedelta(minutes=30) <= dopo <= dt.timedelta(hours=3) and f"mie1|{x['id']}|{oggi}" in gia:
                manda(p, "mie", f"Ancora da fare: {t}", "Tocca Fatto nell'app quando hai fatto.", f"mie2|{x['id']}|{oggi}")
            # Un promemoria di fine giornata (es. 23:50) che nessun giro ha preso prima di mezzanotte arriva subito dopo,
            # una volta sola; il secondo avviso no (dopo mezzanotte nell'app conta già il giorno nuovo).
            elif ult != ieri and (ogni == 1 or not ult or dovuto <= ieri) and f"mie1|{x['id']}|{ieri}" not in gia \
                    and 0 <= ora.timestamp() - dt.datetime.fromisoformat(f"{ieri}T{x['h']}").replace(tzinfo=ROMA).timestamp() <= 90 * 60:
                manda(p, "mie", f"{e} {t}".strip(), "Quando hai fatto, tocca Fatto nell'app.", f"mie1|{x['id']}|{ieri}")
        # L'appuntamento fisso (k "appu") qui non manda niente: dalla v65 è anche un impegno del calendario comune
        # ("Occupato" per gli altri) e ha già il promemoria prima dell'ora e il riepilogo della sera, col titolo vero solo per lei.
        elif k == "scad" and ora.hour == 10:
            mese, anno, ogni = int(x.get("mese") or 0), int(x.get("anno") or 0), max(1, int(x.get("ogni") or 1))
            if not 1 <= mese <= 12:
                continue
            capita_nel = lambda y: y >= anno and (y - anno) % ogni == 0
            d = ora.date()
            prossimo = (d.year + (d.month == 12), d.month % 12 + 1)  # il mese che viene
            if d.day == 1 and prossimo[1] == mese and capita_nel(prossimo[0]):
                manda(p, "mie", f"Il mese prossimo: {t}", f"{e} Scade a fine {MESI[mese - 1]}.".strip(), f"scad1|{x['id']}|{prossimo[0]}")
            ultimo = calendar.monthrange(d.year, d.month)[1]
            if d.month == mese and d.day == ultimo - 7 and capita_nel(d.year):
                manda(p, "mie", f"Tra una settimana: {t}", f"{e} Scade a fine {MESI[mese - 1]}.".strip(), f"scad2|{x['id']}|{d.year}")
        elif k == "mostra" and ora.hour == 10 and x.get("al") == (ora.date() + dt.timedelta(days=7)).isoformat():
            manda(p, "mie", f"Ultima settimana: {t}", "La mostra che hai segnato chiude tra 7 giorni.", f"mos|{x['id']}")
    # Mostre nuove (le scrive il programma "Mostre"): a chi ha la sezione con gli avvisi delle mostre.
    seguono = {x.get("per") for x in mie if x.get("k") == "avvisi" and x.get("mostre")}
    if seguono and 9 <= ora.hour <= 21:
        info = db.collection("info").document("mostre").get().to_dict() or {}
        for m in info.get("l") or []:
            if int((info.get("nuove") or {}).get(m.get("id"), 0)) > recente:
                quando = f"dal {dt.date.fromisoformat(m['dal']).strftime('%d/%m')}" if m.get("dal", "") > oggi else "già aperta"
                for p in seguono & set(persone):
                    manda(p, "mie", f"Nuova mostra: {m.get('t', '')}", f"{m.get('luogo', '')} · {quando}", f"mnew|{m.get('id')}|{p}")

    # Invio a tutti i telefoni iscritti di ogni persona; i telefoni non più validi si tolgono.
    mandate = 0
    for p, titolo, testo in da_mandare:
        for t in token.get(p, []):
            # Urgenza alta: col risparmio energetico (Samsung) un avviso normale può arrivare tardi. Dopo 6 ore non serve più.
            msg = messaging.Message(token=t, webpush=messaging.WebpushConfig(headers={"Urgency": "high", "TTL": "21600"},
                notification=messaging.WebpushNotification(title=titolo, body=testo, icon=URL_APP.rstrip("/") + "/icona-180.png"),
                fcm_options=messaging.WebpushFCMOptions(link=URL_APP)))
            try:
                messaging.send(msg)
                mandate += 1
            except (messaging.UnregisteredError, messaging.SenderIdMismatchError):
                db.collection("token").document(t).delete()
            except Exception as e:
                print(f"Invio non riuscito ({type(e).__name__})")

    stato_ref.set({"ultimo": int(ora.timestamp() * 1000), "da": "firebase" if os.environ.get("K_SERVICE") else "github", "inviati": inviati})
    print(f"Notifiche mandate: {mandate}")


if __name__ == "__main__":
    main()
