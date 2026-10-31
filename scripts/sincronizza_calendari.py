"""Copia nell'app i calendari collegati di ognuno. Gira su GitHub ogni 30 minuti.

Il link privato del calendario (.ics, webcal://...) lo incolla ognuno nelle Impostazioni dell'app:
finisce in privati/<persona>.calendario (anche più link, uno per riga), che legge solo lui e questo programma.
In alternativa (o per chi non usa l'app) il segreto di GitHub CALENDARI = {"p1": "https://...", "p2": ["webcal://...", "..."]}.
Il link messo nell'app vince su quello del segreto.
Chi sceglie nelle Impostazioni "solo Occupato" (persone/<id>.privacy) mostra agli altri solo "Occupato".
Facoltativo, variabile (non segreta) PRIVACY = {"p2": "occupato"}: stesso effetto, deciso da GitHub.
Prende gli impegni dei prossimi 60 giorni e li scrive con fonte "calendario:<persona>";
quelli spariti dal calendario vengono tolti, e anche tutti quando uno scollega il calendario.
Com'è andata lo scrive in persone/<id>.calStato (solo numeri e ora), così l'app lo mostra.
Nessun link né dato finisce nel codice o nei log.
"""
import datetime as dt
import hashlib
import json
import os
import sys
import time

import icalendar
import recurring_ical_events
import requests

from firebase_admin import firestore

from comune import ROMA, adesso, database

GIORNI = 60
MASSIMO = 20 * 1024 * 1024  # un calendario più grande di 20 MB non è un calendario


def leggi(url):
    if url.lower().startswith("webcal://"):
        url = "https://" + url[9:]
    if not url.lower().startswith("https://"):
        raise ValueError("link non valido")
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    if len(r.content) > MASSIMO:
        raise ValueError("troppo grande")
    return icalendar.Calendar.from_ical(r.content)


def collegamenti(db):
    """Per ogni persona l'elenco dei suoi link: prima quelli messi nell'app, poi il segreto CALENDARI."""
    cal = {}
    for k, v in json.loads(os.environ.get("CALENDARI") or "{}").items():
        cal[k] = [v] if isinstance(v, str) else [x for x in v if isinstance(x, str)]
    for d in db.collection("privati").stream():
        testo = (d.to_dict() or {}).get("calendario") or ""
        link = [x for x in testo.split() if x.lower().startswith(("https://", "webcal://"))][:5]
        if link:
            cal[d.id] = link
    return cal


def ora(x):
    return x.astimezone(ROMA) if isinstance(x, dt.datetime) and x.tzinfo else x


def impegni(cal, persona, solo_occupato):
    oggi = adesso().date()
    for ev in recurring_ical_events.of(cal).between(oggi, oggi + dt.timedelta(days=GIORNI)):
        inizio = ora(ev.get("DTSTART").dt)
        fine = ora(ev.get("DTEND").dt) if ev.get("DTEND") else None
        tutto = not isinstance(inizio, dt.datetime)
        chiave = f"{persona}|{ev.get('UID')}|{inizio}"
        yield "cal-" + hashlib.sha1(chiave.encode()).hexdigest()[:20], {
            "t": "Occupato" if solo_occupato else str(ev.get("SUMMARY", "Impegno"))[:80],
            "d": (inizio if tutto else inizio.date()).isoformat(),
            "h": "" if tutto else inizio.strftime("%H:%M"),
            "fine": "" if tutto or not isinstance(fine, dt.datetime) or fine == inizio else fine.strftime("%H:%M"),
            "who": [persona],
            "n": "" if solo_occupato else str(ev.get("LOCATION", ""))[:200],
            "ripeti": "",
            "fonte": f"calendario:{persona}",
            "creatoDa": persona,
            "creato": 0,  # 0 = non avvisare come "nuovo impegno"
        }


def main():
    db = database()
    privacy = json.loads(os.environ.get("PRIVACY") or "{}")
    persone = {d.id: d.to_dict() or {} for d in db.collection("persone").stream()}
    for pid, p in persone.items():
        if p.get("privacy") == "occupato":
            privacy[pid] = "occupato"
    calendari = collegamenti(db)
    col = db.collection("impegni")
    errori = 0
    for persona in sorted(set(persone) | set(calendari)):
        link = calendari.get(persona, [])
        vecchi = {d.id for d in col.where("fonte", "==", f"calendario:{persona}").stream()}
        if not link and not vecchi:
            if "calStato" in persone.get(persona, {}):
                db.collection("persone").document(persona).update({"calStato": firestore.DELETE_FIELD})
            continue
        nuovi, letti = {}, 0
        for url in link:
            try:
                nuovi.update(impegni(leggi(url), persona, privacy.get(persona) == "occupato"))
                letti += 1
            except Exception as e:  # un calendario che non risponde non deve bloccare gli altri
                print(f"{persona}: un calendario non letto ({type(e).__name__})")
        if link and not letti:
            errori += 1
        # Si tolgono impegni solo se tutti i link si sono letti (o se il calendario è stato scollegato):
        # un calendario che per un momento non risponde non deve far sparire niente.
        togli = vecchi - nuovi.keys() if letti == len(link) else set()
        ops = [("set", i, v) for i, v in nuovi.items()] + [("del", i, None) for i in togli]
        for k in range(0, len(ops), 450):
            b = db.batch()
            for op, i, v in ops[k:k + 450]:
                b.set(col.document(i), v) if op == "set" else b.delete(col.document(i))
            b.commit()
        if persona in persone:
            stato = {"calStato": {"letti": letti, "tot": len(link), "n": len(nuovi), "quando": int(time.time() * 1000)}} if link \
                else {"calStato": firestore.DELETE_FIELD}
            db.collection("persone").document(persona).update(stato)
        print(f"{persona}: {letti}/{len(link)} calendari, {len(nuovi)} impegni, {len(togli)} tolti")
    if errori and errori == sum(1 for v in calendari.values() if v):
        sys.exit(1)


if __name__ == "__main__":
    main()
