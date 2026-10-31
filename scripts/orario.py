"""Mette nell'app l'orario di lavoro della settimana (turni scritti a mano, letti da Claude).

Si avvia a mano (workflow "Orario di lavoro") con l'ingresso "turni", un JSON:
  {"persona": "p1", "da": "2026-11-02", "a": "2026-11-08",
   "turni": [{"d": "2026-11-02", "h": "06:30", "fine": "11:30", "t": "Al lavoro", "n": ""}]}
Sostituisce solo i turni (fonte "orario:<persona>") dei giorni da "da" ad "a": gli altri impegni restano.
L'ingresso si legge dal file dell'evento (non dalle variabili), così non finisce nel registro pubblico.
"""
import datetime as dt
import json
import os
import re
import time

from comune import database

ORA = re.compile(r"^\d{2}:\d{2}$")


def main():
    with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as f:
        dati = json.loads((json.load(f).get("inputs") or {}).get("turni") or "{}")
    persona = str(dati.get("persona", ""))
    turni = dati.get("turni") or []
    giorni = sorted(str(t.get("d", "")) for t in turni)
    da, a = str(dati.get("da") or (giorni[0] if giorni else "")), str(dati.get("a") or (giorni[-1] if giorni else ""))
    if not re.fullmatch(r"p\d", persona) or not da or not a:
        raise SystemExit("Mancano persona o giorni")
    for d in (da, a, *giorni):
        dt.date.fromisoformat(d)  # data non valida = errore
    db = database()
    if not db.collection("persone").document(persona).get().exists:
        raise SystemExit("Persona sconosciuta")
    col = db.collection("impegni")
    vecchi = [d for d in col.where("fonte", "==", f"orario:{persona}").stream() if da <= (d.to_dict() or {}).get("d", "") <= a]
    b = db.batch()
    for d in vecchi:
        b.delete(d.reference)
    adesso = int(time.time() * 1000)
    for t in turni:
        h, fine = str(t.get("h", "")), str(t.get("fine", ""))
        if h and not ORA.match(h) or fine and not ORA.match(fine):
            raise SystemExit("Ora non valida")
        b.set(col.document(f"orario-{persona}-{t['d']}-{h.replace(':', '') or 'gg'}"), {
            "t": str(t.get("t") or "Al lavoro")[:80], "d": t["d"], "fino": "", "h": h, "fine": fine,
            "who": [persona], "n": str(t.get("n") or "")[:200], "ripeti": "",
            "fonte": f"orario:{persona}", "creatoDa": persona, "creato": adesso,
        })
    b.commit()
    print(f"Orario: {len(turni)} turni messi, {len(vecchi)} vecchi tolti")


if __name__ == "__main__":
    main()
