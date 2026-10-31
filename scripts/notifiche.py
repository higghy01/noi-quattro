"""Manda le notifiche di Noi quattro. Gira su GitHub ogni 15 minuti.

- promemoria: circa un'ora prima di un impegno, a chi partecipa;
- nuovi: quando qualcuno ti aggiunge a un impegno;
- riepilogo: la sera (alle 21, o all'ora scelta nelle Impostazioni), gli impegni di domani;
- cena: il pomeriggio (alle 17, o all'ora scelta), "A cena stasera?" a chi non ha ancora risposto;
- note: quando una nota nuova è messa in evidenza.
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
    ultimo = stato.get("ultimo", int((ora - dt.timedelta(minutes=15)).timestamp() * 1000))
    inviati = {k: v for k, v in (stato.get("inviati") or {}).items() if v >= (ora.date() - dt.timedelta(days=2)).isoformat()}

    persone = {d.id: d.to_dict() for d in db.collection("persone").stream()}
    token = {}
    for d in db.collection("token").stream():
        token.setdefault(d.to_dict().get("persona"), []).append(d.id)
    impegni = [dict(d.to_dict(), id=d.id) for d in db.collection("impegni").stream()]

    vuole = lambda p, tipo: (persone.get(p, {}).get("notifiche") or {}).get(tipo, True)
    ora_di = lambda p, k, solita: int((persone.get(p, {}).get("notifiche") or {}).get(k) or solita)
    nome = lambda p: persone.get(p, {}).get("nome", "Qualcuno")
    da_mandare = []  # (persona, titolo, testo, chiave)

    def manda(p, tipo, titolo, testo, chiave):
        if chiave in inviati or not vuole(p, tipo):
            return
        da_mandare.append((p, titolo, testo))
        inviati[chiave] = oggi

    # Promemoria: impegni che iniziano tra 45 e 75 minuti.
    for e in impegni:
        if not e.get("h") or not capita(e, oggi):
            continue
        inizio = dt.datetime.fromisoformat(f"{oggi}T{e['h']}").replace(tzinfo=ROMA)
        if dt.timedelta(minutes=45) <= inizio - ora <= dt.timedelta(minutes=75):
            for p in e.get("who", []):
                manda(p, "promemoria", f"Tra poco: {e['t']}", f"Alle {e['h']}" + (f" · {e['n']}" if e.get("n") else ""), f"prom|{e['id']}|{oggi}|{p}")

    # Nuovi impegni con altre persone dentro.
    for e in impegni:
        if e.get("fonte") == "app" and e.get("creato", 0) > ultimo:
            quando = dt.date.fromisoformat(e["d"]).strftime("%d/%m") + (f" alle {e['h']}" if e.get("h") else "")
            for p in e.get("who", []):
                if p != e.get("creatoDa"):
                    manda(p, "nuovi", f"{nome(e.get('creatoDa'))} ti ha aggiunto", f"{e['t']} · {quando}", f"nuovo|{e['id']}|{p}")

    # Riepilogo serale: ognuno all'ora che ha scelto (di solito le 21).
    serale = [p for p in persone if ora.hour == ora_di(p, "oraRiepilogo", 21)]
    if serale:
        lista = sorted((e for e in impegni if capita(e, domani)), key=lambda e: e.get("h") or "")
        if lista:
            righe = [f"{e['h'] or 'tutto il giorno'} {e['t']}" for e in lista[:4]]
            testo = " · ".join(righe) + (f" e altri {len(lista) - 4}" if len(lista) > 4 else "")
            for p in serale:
                manda(p, "riepilogo", f"Domani: {len(lista)} impegni in famiglia", testo, f"riep|{oggi}|{p}")

    # Cena: ognuno all'ora che ha scelto (di solito le 17).
    pomeriggio = [p for p in persone if ora.hour == ora_di(p, "oraCena", 17)]
    if pomeriggio:
        cena = (db.collection("cena").document(oggi).get().to_dict() or {})
        for p in pomeriggio:
            if cena.get(p) not in ("si", "no"):
                manda(p, "cena", "A cena stasera?", "Rispondi con un tocco nella scheda Oggi.", f"cena|{oggi}|{p}")

    # Note nuove in evidenza.
    for d in db.collection("note").where("creato", ">", ultimo).stream():
        n = d.to_dict()
        if n.get("pin"):
            for p in persone:
                if p != n.get("by"):
                    manda(p, "note", f"Nota di {nome(n.get('by'))}", n.get("x", "")[:120], f"nota|{d.id}|{p}")

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
