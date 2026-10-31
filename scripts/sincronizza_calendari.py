"""Copia nell'app i calendari collegati di ognuno. Gira su GitHub ogni 30 minuti.

Per ogni persona legge il suo link privato del calendario (.ics) dai segreti di GitHub:
  CALENDARI = {"p1": "https://...", "p2": "webcal://..."}   (un solo segreto, in formato JSON)
Facoltativo, variabile (non segreta) PRIVACY = {"p2": "occupato"}: di quella persona si vede solo "Occupato".
Prende gli impegni dei prossimi 60 giorni e li scrive con fonte "calendario:<persona>";
quelli spariti dal calendario vengono tolti. Nessun dato finisce nel codice o nei log.
"""
import datetime as dt
import hashlib
import json
import os
import sys

import icalendar
import recurring_ical_events
import requests

from comune import ROMA, adesso, database

GIORNI = 60


def leggi(url):
    url = url.replace("webcal://", "https://", 1)
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    return icalendar.Calendar.from_ical(r.content)


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
    calendari = json.loads(os.environ.get("CALENDARI") or "{}")
    privacy = json.loads(os.environ.get("PRIVACY") or "{}")
    if not calendari:
        print("Nessun calendario collegato.")
        return
    db = database()
    errori = 0
    for persona, url in calendari.items():
        try:
            nuovi = dict(impegni(leggi(url), persona, privacy.get(persona) == "occupato"))
        except Exception as e:  # un calendario che non risponde non deve bloccare gli altri
            print(f"{persona}: calendario non letto ({type(e).__name__})")
            errori += 1
            continue
        col = db.collection("impegni")
        vecchi = {d.id for d in col.where("fonte", "==", f"calendario:{persona}").stream()}
        ops = [("set", i, v) for i, v in nuovi.items()] + [("del", i, None) for i in vecchi - nuovi.keys()]
        for k in range(0, len(ops), 450):
            b = db.batch()
            for op, i, v in ops[k:k + 450]:
                b.set(col.document(i), v) if op == "set" else b.delete(col.document(i))
            b.commit()
        print(f"{persona}: {len(nuovi)} impegni, {len(vecchi - nuovi.keys())} tolti")
    if errori == len(calendari):
        sys.exit(1)


if __name__ == "__main__":
    main()
