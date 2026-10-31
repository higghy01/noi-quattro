"""Manda le notifiche di Noi quattro. Gira su GitHub ogni 15 minuti.

- promemoria: circa un'ora prima di un impegno, a chi partecipa;
- nuovi: quando qualcuno ti aggiunge a un impegno;
- riepilogo: la sera (alle 21, o all'ora scelta nelle Impostazioni), gli impegni di domani;
- cena: il pomeriggio (alle 17, o all'ora scelta), "A cena stasera?" a chi non ha ancora risposto;
- proposte: una proposta nuova (a tutti tranne chi l'ha fatta), "hanno votato tutti" (a chi l'ha fatta)
  e cosa si è deciso (a tutti tranne chi ha deciso);
- conflitti: a chi ha due impegni che si accavallano oggi, domani o dopodomani;
- note: quando una nota nuova è messa in evidenza (le note non si scrivono più, restano le vecchie).
Ognuno sceglie quali ricevere dall'app (persone/<id>.notifiche). Cosa è già stato mandato
si ricorda in sistema/notifiche, così niente arriva due volte.
"""
import datetime as dt
import os

from firebase_admin import messaging

from comune import ROMA, adesso, capita, database

URL_APP = os.environ.get("URL_APP") or "https://higghy01.github.io/noi-quattro/"


def main():
    if not os.environ.get("FIREBASE_CHIAVE"):
        print("Chiave di Firebase non ancora inserita: niente da fare.")
        return
    db = database()
    ora = adesso()
    oggi = ora.date().isoformat()
    domani = (ora.date() + dt.timedelta(days=1)).isoformat()
    stato_ref = db.collection("sistema").document("notifiche")
    stato = (stato_ref.get().to_dict() or {})
    inviati = {k: v for k, v in (stato.get("inviati") or {}).items() if v >= (ora.date() - dt.timedelta(days=2)).isoformat()}

    persone = {d.id: d.to_dict() for d in db.collection("persone").stream()}
    token = {}
    for d in db.collection("token").stream():
        token.setdefault(d.to_dict().get("persona"), []).append(d.id)
    impegni = [dict(d.to_dict(), id=d.id) for d in db.collection("impegni").stream()]
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
    ora_di = lambda p, k, solita: int((persone.get(p, {}).get("notifiche") or {}).get(k) or solita)
    nome = lambda p: persone.get(p, {}).get("nome", "Qualcuno")
    da_mandare = []  # (persona, titolo, testo, chiave)

    def manda(p, tipo, titolo, testo, chiave):
        if chiave in inviati or not vuole(p, tipo):
            return
        da_mandare.append((p, titolo, testo))
        inviati[chiave] = oggi

    # Promemoria: impegni che iniziano tra 30 e 80 minuti (anche subito dopo mezzanotte, guardando domani).
    for giorno in (oggi, domani):
        for e in impegni:
            if not e.get("h") or not capita(e, giorno):
                continue
            if (e.get("fino") or "") > e.get("d", "") and giorno != e.get("d"):
                continue  # impegno di più giorni: il promemoria solo il primo giorno
            inizio = dt.datetime.fromisoformat(f"{giorno}T{e['h']}").replace(tzinfo=ROMA)
            if dt.timedelta(minutes=30) <= inizio - ora <= dt.timedelta(minutes=80):  # largo: GitHub a volte salta un giro
                for p in e.get("who", []):
                    t, luogo = titolo_per(e, p)
                    manda(p, "promemoria", f"Tra poco: {t}", f"Alle {e['h']}" + (f" · {luogo}" if luogo else ""), f"prom|{e['id']}|{giorno}|{p}")

    # Nuovi impegni con altre persone dentro, e persone aggiunte dopo a un impegno che c'era già.
    for e in impegni:
        if e.get("fonte") != "app":
            continue
        quando = dt.date.fromisoformat(e["d"]).strftime("%d/%m") + (f" alle {e['h']}" if e.get("h") else "")
        nuovo = e.get("creato", 0) > recente
        aggiunti = (e.get("aggiunti") or []) if e.get("modificato", 0) > recente else []
        chi = e.get("modificatoDa") or e.get("creatoDa")
        for p in e.get("who", []):
            if nuovo and p != e.get("creatoDa"):
                manda(p, "nuovi", f"{nome(e.get('creatoDa'))} ti ha aggiunto", f"{e['t']} · {quando}", f"nuovo|{e['id']}|{p}")
            elif p in aggiunti and p != chi:
                manda(p, "nuovi", f"{nome(chi)} ti ha aggiunto", f"{e['t']} · {quando}", f"nuovo|{e['id']}|{p}")

    # Riepilogo serale: ognuno all'ora che ha scelto (di solito le 21).
    serale = [p for p in persone if ora.hour == ora_di(p, "oraRiepilogo", 21)]
    if serale:
        lista = sorted((e for e in impegni if capita(e, domani)), key=lambda e: e.get("h") or "")
        if lista:
            for p in serale:
                righe = [f"{e['h'] or 'tutto il giorno'} {titolo_per(e, p)[0]}" for e in lista[:4]]
                testo = " · ".join(righe) + (f" e altri {len(lista) - 4}" if len(lista) > 4 else "")
                manda(p, "riepilogo", f"Domani: {len(lista)} impegni in famiglia", testo, f"riep|{oggi}|{p}")

    # Cena: ognuno all'ora che ha scelto (di solito le 17).
    pomeriggio = [p for p in persone if ora.hour == ora_di(p, "oraCena", 17)]
    if pomeriggio:
        cena = (db.collection("cena").document(oggi).get().to_dict() or {})
        for p in pomeriggio:
            if cena.get(p) not in ("si", "no"):
                manda(p, "cena", "A cena stasera?", "Rispondi con un tocco nella scheda Oggi.", f"cena|{oggi}|{p}")

    # Note nuove in evidenza.
    for d in db.collection("note").where("creato", ">", recente).stream():
        n = d.to_dict()
        if n.get("pin"):
            for p in persone:
                if p != n.get("by"):
                    manda(p, "note", f"Nota di {nome(n.get('by'))}", n.get("x", "")[:120], f"nota|{d.id}|{p}")

    # Due impegni della stessa persona alla stessa ora (oggi, domani, dopodomani: "inviati" ricorda per 2 giorni).
    def minuti(h):
        return int(h[:2]) * 60 + int(h[3:5])

    def intervallo(e, giorno):
        # Più giorni con orario (stessa regola dell'app): primo giorno dall'inizio, in mezzo tutto il giorno, ultimo fino alla fine.
        if not e.get("ripeti") and (e.get("fino") or "") > e.get("d", ""):
            a = minuti(e["h"]) if giorno == e["d"] else 0
            b = minuti(e["fine"]) if giorno == e["fino"] and e.get("fine") else 24 * 60
            return a, b
        a = minuti(e["h"])
        b = minuti(e["fine"]) if e.get("fine") else a + 60
        return a, (b if b > a else 24 * 60)
    for k in range(3):
        giorno = (ora.date() + dt.timedelta(days=k)).isoformat()
        del_giorno = [e for e in impegni if e.get("h") and capita(e, giorno)]
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

    # Proposte: nuove, "hanno votato tutti", decise.
    for d in db.collection("proposte").stream():
        pr = d.to_dict() or {}
        chi, q = pr.get("by"), pr.get("q", "")
        opz = {k: v for k, v in (pr.get("opzioni") or {}).items() if isinstance(v, dict) and v.get("x")}
        if pr.get("chiusa"):
            decisa = int(pr.get("decisa") or 0)
            if decisa > recente:
                for p in persone:
                    if p != chi:
                        manda(p, "proposte", f"Deciso: {pr.get('scelta', '')}", f"{q} · ha deciso {nome(chi)}", f"deciso|{d.id}|{decisa}|{p}")
            continue
        if int(pr.get("creato") or 0) > recente:
            idee = " · ".join(v["x"] for v in sorted(opz.values(), key=lambda v: v.get("creato", 0))[:4])
            for p in persone:
                if p != chi:
                    manda(p, "proposte", f"{nome(chi)} propone: {q}", (idee + " · " if idee else "") + "Vota nella Bacheca", f"proposta|{d.id}|{p}")
        voti = pr.get("voti") or {}
        # Solo per le proposte degli ultimi due giorni: così l'avviso non torna quando "inviati" dimentica.
        due_giorni = int((ora - dt.timedelta(days=2)).timestamp() * 1000)
        if chi in persone and opz and int(pr.get("creato") or 0) > due_giorni and all(voti.get(p) for p in persone):
            conta = {k: sum(1 for p in persone if k in (voti.get(p) or [])) for k in opz}
            testa = max(sorted(opz, key=lambda k: opz[k].get("creato", 0)), key=lambda k: conta[k])
            manda(chi, "proposte", f"Hanno votato tutti: {q}", f"In testa: {opz[testa]['x']} ({conta[testa]} voti). Decidi nella Bacheca.", f"tutti|{d.id}|{chi}")

    # Invio a tutti i telefoni iscritti di ogni persona; i telefoni non più validi si tolgono.
    mandate = 0
    for p, titolo, testo in da_mandare:
        for t in token.get(p, []):
            msg = messaging.Message(token=t, webpush=messaging.WebpushConfig(
                notification=messaging.WebpushNotification(title=titolo, body=testo, icon=URL_APP.rstrip("/") + "/icona-180.png"),
                fcm_options=messaging.WebpushFCMOptions(link=URL_APP)))
            try:
                messaging.send(msg)
                mandate += 1
            except (messaging.UnregisteredError, messaging.SenderIdMismatchError):
                db.collection("token").document(t).delete()
            except Exception as e:
                print(f"Invio non riuscito ({type(e).__name__})")

    stato_ref.set({"ultimo": int(ora.timestamp() * 1000), "inviati": inviati})
    print(f"Notifiche mandate: {mandate}")


if __name__ == "__main__":
    main()
