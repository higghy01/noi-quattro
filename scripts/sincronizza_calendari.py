"""Copia nell'app i calendari collegati di ognuno. Gira su GitHub ogni 30 minuti.

Il link privato del calendario (.ics, webcal://...) lo incolla ognuno nelle Impostazioni dell'app:
finisce in privati/<persona>.calendario (anche più link, uno per riga), che legge solo lui e questo programma.
In alternativa (o per chi non usa l'app) il segreto di GitHub CALENDARI = {"p1": "https://...", "p2": ["webcal://...", "..."]}.
Il link messo nell'app vince su quello del segreto.
Cosa vedono gli altri di ogni impegno (titolo e luogo, oppure solo "Occupato"), in quest'ordine:
  1. le scelte fatte a mano nell'app, per titolo (privati/<persona>.scelte = {"palestra": "mostra"|"nascondi"});
  2. le parole automatiche (privati/<persona>.parole, se mancano quelle di partenza PAROLE0), prima quelle da nascondere;
  3. la regola generale: persone/<id>.privacy == "occupato" (o la variabile PRIVACY = {"p2": "occupato"}).
Le stesse regole le applica l'app (app.js, regolaCal): tenerle uguali.
Il titolo vero degli impegni nascosti va solo in privati/<persona>.dettagli, che legge solo lui.
Prende gli impegni dei prossimi 60 giorni e li scrive con fonte "calendario:<persona>";
quelli spariti dal calendario vengono tolti, e anche tutti quando uno scollega il calendario.
Com'è andata lo scrive in persone/<id>.calStato (solo numeri e ora), così l'app lo mostra.
Nessun link né dato finisce nel codice o nei log.
"""
import datetime as dt
import hashlib
import re
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
# Compleanni dai calendari (scelta del 31/10/2026): non entrano nell'app.
# Una festa vera ("Festa di compleanno", "cena per il compleanno") resta.
# Anche scritti di fretta ("birtday", "compleano", "b-day") o con la torta 🎂.
COMPLEANNO = re.compile(r"b[iy]r?t?h?d[ae]y|byrt|\bb-?day\b|compl?ean+o|cumplea|geburtstag|anniversaire|🎂", re.I)
FESTA = re.compile(r"festa|party|cena|pranzo|aperitivo", re.I)
# Un impegno di tutto il giorno che torna ogni anno (es. solo "Marco") è quasi sempre un compleanno:
# esce anche lui, tranne le feste e le ricorrenze con un nome chiaro.
RICORRENZA = re.compile(r"festa|party|cena|pranzo|aperitivo|natale|vigilia|pasqua|capodanno|ferragosto|anniversario|onomastico|ferie|vacanza", re.I)


def compleanno(titolo, annuale=False):
    if FESTA.search(titolo):
        return False
    return bool(COMPLEANNO.search(titolo)) or (annuale and not RICORRENZA.search(titolo))


def annuali(cal):
    """Gli UID degli impegni di tutto il giorno che si ripetono ogni anno."""
    out = set()
    for c in cal.walk("VEVENT"):
        r = c.get("RRULE")
        inizio = c.get("DTSTART")
        if r and inizio is not None and not isinstance(inizio.dt, dt.datetime) and "YEARLY" in [str(x).upper() for x in r.get("FREQ", [])]:
            out.add(str(c.get("UID")))
    return out
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


def collegamenti(privati):
    """Per ogni persona l'elenco dei suoi link: prima quelli messi nell'app, poi il segreto CALENDARI."""
    cal = {}
    for k, v in json.loads(os.environ.get("CALENDARI") or "{}").items():
        cal[k] = [v] if isinstance(v, str) else [x for x in v if isinstance(x, str)]
    for pid, priv in privati.items():
        testo = priv.get("calendario") or ""
        link = [x for x in testo.split() if x.lower().startswith(("https://", "webcal://"))][:5]
        if link:
            cal[pid] = link
    return cal


def ora(x):
    return x.astimezone(ROMA) if isinstance(x, dt.datetime) and x.tzinfo else x


PAROLE0 = {
    "nascondi": ["medico", "dottor", "dentista", "visita", "analisi", "esami", "prelievo", "ospedale", "terapia", "psicolog",
                 "fisioterap", "banca", "avvocato", "notaio", "commercialista", "colloquio", "privato"],
    "mostra": ["cena", "pranzo", "colazione", "aperitivo", "compleanno", "famiglia", "festa", "natale", "pasqua", "vacanza",
               "viaggio", "ferie"],
}


def chiave(t):
    return " ".join(str(t or "").lower().split())


def contiene(k, parola):
    w = chiave(parola)
    return bool(w) and re.search(r"(^|[^\w])" + re.escape(w), k) is not None


def regola(priv, generale):
    """Restituisce una funzione titolo -> True se gli altri possono vederlo per intero."""
    scelte = priv.get("scelte") or {}
    parole = priv.get("parole") or PAROLE0

    def visibile(titolo):
        k = chiave(titolo)
        if scelte.get(k) in ("mostra", "nascondi"):
            return scelte[k] == "mostra"
        if any(contiene(k, w) for w in parole.get("nascondi") or []):
            return False
        if any(contiene(k, w) for w in parole.get("mostra") or []):
            return True
        return generale != "occupato"
    return visibile


def impegni(cal, persona, visibile, saltati):
    oggi = adesso().date()
    ogni_anno = annuali(cal)
    for ev in recurring_ical_events.of(cal).between(oggi, oggi + dt.timedelta(days=GIORNI)):
        inizio = ora(ev.get("DTSTART").dt)
        fine = ora(ev.get("DTEND").dt) if ev.get("DTEND") else None
        tutto = not isinstance(inizio, dt.datetime)
        # Impegni di più giorni: "fino" è l'ultimo giorno compreso (la fine nei calendari è esclusa:
        # tutto il giorno dal 3 al 7 finisce l'8; un orario che finisce a mezzanotte appartiene al giorno prima).
        g0 = inizio if tutto else inizio.date()
        if fine is None:
            g1 = g0
        elif isinstance(fine, dt.datetime) and fine - inizio < dt.timedelta(hours=24):
            g1 = g0  # con un orario conta come "più giorni" solo se dura almeno 24 ore (un turno 22-6 resta del suo giorno)
        elif isinstance(fine, dt.datetime):
            g1 = (fine - dt.timedelta(microseconds=1)).date() if fine.time() == dt.time(0) else fine.date()
        else:
            g1 = fine - dt.timedelta(days=1)
        uid = f"{persona}|{ev.get('UID')}|{inizio}"
        titolo = str(ev.get("SUMMARY", "Impegno"))[:80]
        if compleanno(titolo, tutto and str(ev.get("UID")) in ogni_anno):
            saltati[0] += 1
            continue
        luogo = str(ev.get("LOCATION", ""))[:200]
        vis = visibile(titolo)
        yield "cal-" + hashlib.sha1(uid.encode()).hexdigest()[:20], {
            "t": titolo if vis else "Occupato",
            "d": g0.isoformat(),
            "fino": g1.isoformat() if g1 > g0 else "",
            "h": "" if tutto else inizio.strftime("%H:%M"),
            "fine": "" if tutto or not isinstance(fine, dt.datetime) or fine == inizio else fine.strftime("%H:%M"),
            "who": [persona],
            "n": luogo if vis else "",
            "ripeti": "",
            "fonte": f"calendario:{persona}",
            "creatoDa": persona,
            "creato": 0,  # 0 = non avvisare come "nuovo impegno"
            "nascosto": not vis,
        }, None if vis else {"t": titolo, "n": luogo}


def main():
    db = database()
    privacy = json.loads(os.environ.get("PRIVACY") or "{}")
    persone = {d.id: d.to_dict() or {} for d in db.collection("persone").stream()}
    for pid, p in persone.items():
        if p.get("privacy") == "occupato":
            privacy[pid] = "occupato"
    privati = {d.id: d.to_dict() or {} for d in db.collection("privati").stream()}
    calendari = collegamenti(privati)
    col = db.collection("impegni")
    errori = 0
    for persona in sorted(set(persone) | set(calendari)):
        link = calendari.get(persona, [])
        vecchi = {d.id for d in col.where("fonte", "==", f"calendario:{persona}").stream()}
        if not link and not vecchi:
            if "calStato" in persone.get(persona, {}):
                db.collection("persone").document(persona).update({"calStato": firestore.DELETE_FIELD})
            continue
        nuovi, dettagli, letti, saltati = {}, {}, 0, [0]
        visibile = regola(privati.get(persona, {}), privacy.get(persona))
        for url in link:
            try:
                for i, doc, det in impegni(leggi(url), persona, visibile, saltati):
                    nuovi[i] = doc
                    if det:
                        dettagli[i] = det
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
                # merge: resta quello che la famiglia aggiunge nell'app (es. "mezzo")
                b.set(col.document(i), v, merge=True) if op == "set" else b.delete(col.document(i))
            b.commit()
        # I titoli veri degli impegni nascosti: solo nella parte privata (si sostituisce l'elenco intero).
        # Quelli degli impegni importati da file (non iniziano con "cal-") li gestisce l'app: restano.
        da_file = {k: v for k, v in (privati.get(persona, {}).get("dettagli") or {}).items() if not k.startswith("cal-")}
        if letti == len(link) and (dettagli or privati.get(persona, {}).get("dettagli")):
            db.collection("privati").document(persona).set({"dettagli": {**da_file, **dettagli}}, merge=["dettagli"])
        elif dettagli:
            vecchi_det = privati.get(persona, {}).get("dettagli") or {}
            db.collection("privati").document(persona).set({"dettagli": {**vecchi_det, **dettagli}}, merge=["dettagli"])
        if persona in persone:
            stato = {"calStato": {"letti": letti, "tot": len(link), "n": len(nuovi), "quando": int(time.time() * 1000)}} if link \
                else {"calStato": firestore.DELETE_FIELD}
            db.collection("persone").document(persona).update(stato)
        print(f"{persona}: {letti}/{len(link)} calendari, {len(nuovi)} impegni ({len(dettagli)} nascosti come Occupato), {len(togli)} tolti, {saltati[0]} compleanni lasciati fuori")
    if errori and errori == sum(1 for v in calendari.values() if v):
        sys.exit(1)


if __name__ == "__main__":
    main()
