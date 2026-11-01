"""Mette nella sezione Personale le note di scuola lette da Claude (es. screenshot di School Planner).

Si avvia a mano (workflow "Note di scuola") con l'ingresso "note", un JSON:
  {"persona": "p3", "note": [{"m": "Matematica", "tipo": "verifica", "d": "2026-11-05", "x": "equazioni"}],
   "voti": [{"m": "Inglese", "v": 7.5, "tipo": "orale", "d": "2026-10-20", "x": ""}]}
voti: v da 0.75 a 10, cioè da 1− a 10 come nell'app (7+ = 7.25, 7½ = 7.5, 8− = 7.75), tipo scritto, orale o pratico, p = peso in % (facoltativo, 100). Un voto uguale non si ripete.
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
TIPI_V = {"scritto", "orale", "pratico"}


def giorno(d):
    """Solo date AAAA-MM-GG (Python accetterebbe anche 20261021 o 2026-W45-1)."""
    try:
        ok = dt.date.fromisoformat(d).isoformat() == d
    except ValueError:
        ok = False
    if not ok:
        raise SystemExit("Data non valida: serve AAAA-MM-GG")
    return d


def main():
    with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as f:
        dati = json.loads((json.load(f).get("inputs") or {}).get("note") or "{}")
    persona = str(dati.get("persona", ""))
    if not PERSONA.match(persona):
        raise SystemExit("Manca la persona")
    note, voti = dati.get("note") or [], dati.get("voti") or []
    if not isinstance(note, list) or not isinstance(voti, list) or not (note or voti):
        raise SystemExit("Nessuna nota e nessun voto")
    db = database()
    if not db.collection("persone").document(persona).get().exists:
        raise SystemExit("Persona sconosciuta")
    # Le materie si scrivono come nell'orario (es. "inglese" diventa "Inglese").
    sc = db.collection("scuola").document(persona).get()
    materie = {x.get("m", "").lower(): x.get("m") for x in ((sc.to_dict() or {}).get("orario") or [])} if sc.exists else {}
    giusta = lambda m: materie.get(m.lower(), m)
    nuove = []
    for n in note:
        m, tipo, d = str(n.get("m", "")).strip()[:60], str(n.get("tipo", "")), str(n.get("d", ""))
        if not m or tipo not in TIPI:
            raise SystemExit("Nota non valida: servono materia e tipo")
        giorno(d)
        nuove.append({"m": giusta(m), "tipo": tipo, "d": d, "x": str(n.get("x", "")).strip()[:200]})
    col = db.collection("compiti")
    vecchie = {(v.get("m"), v.get("tipo"), v.get("d")): s.reference
               for s in col.where("per", "==", persona).stream() for v in [s.to_dict() or {}]}
    scritture, aggiunte, cambiate, adesso = [], 0, 0, int(time.time() * 1000)
    for n in nuove:
        ref = vecchie.get((n["m"], n["tipo"], n["d"]))
        if ref:
            if n["x"]:
                scritture.append(("update", ref, {"x": n["x"]}))
                cambiate += 1
        else:
            ref = col.document()
            scritture.append(("set", ref, dict(n, per=persona, di=persona, by=persona, creato=adesso, fatto=False)))
            vecchie[(n["m"], n["tipo"], n["d"])] = ref  # la stessa nota due volte nell'ingresso entra una volta
            aggiunte += 1
    nuovi_v = []
    for n in voti:
        m, tipo, d = str(n.get("m", "")).strip()[:60], str(n.get("tipo", "")), str(n.get("d", ""))
        v = n.get("v")
        if not m or tipo not in TIPI_V or isinstance(v, bool) or not isinstance(v, (int, float)) or not 0.75 <= v <= 10:
            raise SystemExit("Voto non valido: servono materia, voto da 0.75 a 10 e tipo")
        giorno(d)
        p = n.get("p")
        p = 100 if p is None else p
        if isinstance(p, bool) or not isinstance(p, (int, float)) or not 0 <= p <= 100:
            raise SystemExit("Peso non valido: da 0 a 100")
        nuovi_v.append({"m": giusta(m), "v": float(v), "tipo": tipo, "p": float(p), "d": d, "x": str(n.get("x", "")).strip()[:200]})
    colv = db.collection("voti")
    gia = {(x.get("m"), float(x.get("v", -1)), x.get("tipo"), x.get("d"))
           for x in (s.to_dict() or {} for s in colv.where("per", "==", persona).stream())}
    voti_messi = 0
    for n in nuovi_v:
        if (n["m"], n["v"], n["tipo"], n["d"]) in gia:
            continue
        gia.add((n["m"], n["v"], n["tipo"], n["d"]))
        scritture.append(("set", colv.document(), dict(n, per=persona, di=persona, by=persona, creato=adesso)))
        voti_messi += 1
    # Firestore accetta al massimo 500 scritture per batch: oltre si salva a blocchi. Se un blocco fallisce,
    # rilanciare va bene: le note e i voti già messi non si ripetono.
    for i in range(0, len(scritture), 400):
        b = db.batch()
        for tipo, ref, d in scritture[i:i + 400]:
            (b.update if tipo == "update" else b.set)(ref, d)
        b.commit()
    print(f"Note di scuola: {aggiunte} aggiunte, {cambiate} aggiornate; voti: {voti_messi} messi")


if __name__ == "__main__":
    main()
