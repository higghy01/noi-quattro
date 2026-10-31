"""Mette nell'app l'orario scolastico di una persona (sezione Personale, prova del 31/10/2026).

Si avvia a mano (workflow "Orario scolastico") con l'ingresso "orario", un JSON:
  {"persona": "p3", "copie": ["p1"], "classe": "3A", "dal": "2026-10-12", "al": "2027-06-10",
   "pause": [["2026-12-23", "2027-01-06"]], "ore": ["08:00-09:00", "09:00-10:00"],
   "lezioni": [{"g": 1, "o": 1, "m": "Matematica", "prof": "Rossi M."}]}
g = giorno della settimana (1 lunedì ... 6 sabato), o = numero dell'ora, ore = inizio-fine di ogni ora (facoltative).
"copie": chi vede una copia della sezione per provarla. {"persona": "p3", "togli": true} toglie tutto.
Sostituisce tutto il documento scuola/<persona>. L'ingresso si legge dal file dell'evento, così non finisce nel registro.
"""
import datetime as dt
import json
import os
import re

from comune import database

ORE = re.compile(r"^\d{2}:\d{2}-\d{2}:\d{2}$")
PERSONA = re.compile(r"^p\d$")


def data(x):
    x = str(x or "")
    if x:
        dt.date.fromisoformat(x)  # data non valida = errore
    return x


def main():
    with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as f:
        dati = json.loads((json.load(f).get("inputs") or {}).get("orario") or "{}")
    persona = str(dati.get("persona", ""))
    if not PERSONA.match(persona):
        raise SystemExit("Manca la persona")
    db = database()
    if not db.collection("persone").document(persona).get().exists:
        raise SystemExit("Persona sconosciuta")
    doc = db.collection("scuola").document(persona)
    if dati.get("togli"):
        doc.delete()
        print("Orario scolastico tolto")
        return
    lezioni = []
    for x in dati.get("lezioni") or []:
        g, o, m = int(x.get("g", 0)), int(x.get("o", 0)), str(x.get("m", "")).strip()[:60]
        if not (1 <= g <= 6 and 1 <= o <= 12 and m):
            raise SystemExit("Lezione non valida")
        lezioni.append({"g": g, "o": o, "m": m, "prof": str(x.get("prof", "")).strip()[:40]})
    ore = [str(h) for h in dati.get("ore") or []]
    if any(not ORE.match(h) for h in ore) or len(ore) > 12:
        raise SystemExit("Ore non valide")
    pause = [[data(a), data(b)] for a, b in dati.get("pause") or []]
    copie = [str(c) for c in dati.get("copie") or [] if PERSONA.match(str(c)) and str(c) != persona]
    if not lezioni:
        raise SystemExit("Nessuna lezione")
    doc.set({"orario": lezioni, "ore": ore, "classe": str(dati.get("classe", ""))[:20], "dal": data(dati.get("dal")),
             # Firestore non accetta liste dentro liste: ogni vacanza è "da|a".
             "al": data(dati.get("al")), "pause": [f"{a}|{b}" for a, b in pause], "copie": copie})
    giorni = len({x["g"] for x in lezioni})
    print(f"Orario scolastico: {len(lezioni)} ore in {giorni} giorni, {len(ore)} orari, {len(pause)} vacanze, {len(copie)} copie")


if __name__ == "__main__":
    main()
