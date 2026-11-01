"""Mette nella sezione Personale le note di scuola lette da Claude (es. screenshot di School Planner).

Si avvia a mano (workflow "Note di scuola") con l'ingresso "note", un JSON:
  {"persona": "p3", "note": [{"m": "Matematica", "tipo": "verifica", "d": "2026-11-05", "x": "equazioni"}]}
tipo: interrogazione, verifica, compito, portare, altro (come nell'app). Una nota uguale
(stessa materia, tipo e giorno) già presente non si ripete: si aggiorna solo il testo.
L'ingresso si legge dal file dell'evento, così non finisce nel registro.
"""
import datetime as dt
import json
import os
import re
import time

from comune import database

PERSONA = re.compile(r"^p\d$")
TIPI = {"interrogazione", "verifica", "compito", "portare", "altro"}


def main():
    with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as f:
        dati = json.loads((json.load(f).get("inputs") or {}).get("note") or "{}")
    persona = str(dati.get("persona", ""))
    if not PERSONA.match(persona):
        raise SystemExit("Manca la persona")
    note = dati.get("note")
    if not isinstance(note, list) or not note:
        raise SystemExit("Nessuna nota")
    db = database()
    if not db.collection("persone").document(persona).get().exists:
        raise SystemExit("Persona sconosciuta")
    nuove = []
    for n in note:
        m, tipo, d = str(n.get("m", "")).strip()[:60], str(n.get("tipo", "")), str(n.get("d", ""))
        if not m or tipo not in TIPI:
            raise SystemExit("Nota non valida: servono materia e tipo")
        dt.date.fromisoformat(d)  # data non valida = errore
        nuove.append({"m": m, "tipo": tipo, "d": d, "x": str(n.get("x", "")).strip()[:200]})
    col = db.collection("compiti")
    vecchie = {(v.get("m"), v.get("tipo"), v.get("d")): s.reference
               for s in col.where("per", "==", persona).stream() for v in [s.to_dict() or {}]}
    b, aggiunte, cambiate, adesso = db.batch(), 0, 0, int(time.time() * 1000)
    for n in nuove:
        ref = vecchie.get((n["m"], n["tipo"], n["d"]))
        if ref:
            if n["x"]:
                b.update(ref, {"x": n["x"]})
                cambiate += 1
        else:
            b.set(col.document(), dict(n, per=persona, di=persona, by=persona, creato=adesso, fatto=False))
            aggiunte += 1
    b.commit()
    print(f"Note di scuola: {aggiunte} aggiunte, {cambiate} aggiornate")


if __name__ == "__main__":
    main()
