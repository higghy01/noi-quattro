"""I libri nuovi degli autori preferiti, per la sezione "Per me" (Sasha, 04/11/2026: "i nuovi libri usciti di alcuni
autori", con il link di Amazon). Gira ogni mattina (workflow "Libri"), ma ogni autore si guarda una volta a settimana;
un autore appena aggiunto si guarda la mattina dopo.

Gli autori li scrive chi ha la sezione, nell'app (raccolta "mie", k = "autore", t = nome). Il programma legge la pagina
dell'autore su IBS (/libri/autori/<nome>, permessa dal robots.txt del sito; niente ricerca né ordinamenti, che il sito
non vuole dai programmi) e scrive nello stesso documento: libri (i più recenti), agg (quando), chi (il nome cercato),
visti (codici già visti) e nuovi (quelli comparsi da poco, per il bollino "Nuovo"). Se il sito non risponde o cambia
forma, resta l'elenco di prima: meglio vecchio che vuoto.
"""
import html
import os
import re
import time
import unicodedata

import requests

from comune import adesso, database

UA = {"User-Agent": "Mozilla/5.0 (app di famiglia NDSZ; un controllo a settimana per autore)"}
OGNI = 6 * 864e5  # ogni autore al massimo una volta ogni 6 giorni
SITO = "https://www.ibs.it"


def pulisci(x):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", x or "")).split())


def slug(nome):
    """"Donato Carrisi" → "donato-carrisi", come gli indirizzi degli autori su IBS (accenti e apostrofi tolti)."""
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def chiave_titolo(t):
    t = re.sub(r"\.\s*(ediz|ed)\..*$", "", t, flags=re.I)  # "La figlia oscura. Ediz. tie-in" = "La figlia oscura"
    return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower())


def libri_di(nome):
    """I libri della pagina dell'autore (i 25 più venduti, quindi anche i nuovi). Ogni titolo una volta sola,
    con l'anno della prima uscita: le ristampe tascabili non sono "nuove". None se la pagina non c'è."""
    url = f"{SITO}/libri/autori/{slug(nome)}"
    for prova in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=30)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            break
        except requests.RequestException as e:
            if prova == 2:
                raise
            print(f"{nome}: riprovo ({type(e).__name__})")
            time.sleep(5 * (prova + 1))
    titoli = {}
    for b in r.text.split('class="cc-product-list-item')[1:]:
        ean = re.search(r'data-tracking-ean="(\d{13})"', b)
        t = re.search(r'class="cc-title">(.*?)</a>', b, re.S)
        href = re.search(r'href="(/[^"]+/e/\d{13})"', b)
        pub = re.search(r'class="cc-publisher-name">(.*?)</a>\s*(\d{4})?', b, re.S)
        if not ean or not t or not ean.group(1).startswith(("97888", "97912")):  # solo edizioni italiane (niente copie autografate, codici del negozio o edizioni straniere)
            continue
        anno = int(pub.group(2)) if pub and pub.group(2) else 0
        x = {"t": pulisci(t.group(1))[:100], "ean": ean.group(1), "anno": anno,
             "ed": pulisci(pub.group(1)).rstrip(",")[:40] if pub else "",
             "link": SITO + href.group(1) if href else ""}
        # Solo libri di carta in italiano: niente audiolibri, né traduzioni stampate in Italia (es. "Those who leave…").
        if re.search(r"audiolibro|cd audio|ediz\. inglese|\b(the|and|of|who|with|your)\b|\bal-", x["t"], re.I):
            continue
        k = chiave_titolo(x["t"])
        if not k:
            continue
        g = titoli.setdefault(k, {"primo": anno or 9999, "ed": []})
        g["primo"] = min(g["primo"], anno or 9999)
        g["ed"].append(x)
    out = []
    for g in titoli.values():
        x = max(g["ed"], key=lambda y: y["anno"])  # l'edizione più nuova, ma l'anno è quello della prima uscita
        out.append({**x, "anno": g["primo"] if g["primo"] != 9999 else 0})
    return sorted(out, key=lambda y: -y["anno"])


def main():
    if not os.environ.get("FIREBASE_CHIAVE"):
        print("Chiave di Firebase non ancora inserita: niente da fare.")
        return
    db = database()
    ora = adesso()
    ms = int(ora.timestamp() * 1000)
    anno = ora.year
    autori = list(db.collection("mie").where("k", "==", "autore").stream())
    print(f"{len(autori)} autori.")
    cercati = vuoti = 0
    scritture = []  # si scrive alla fine: se il sito ha cambiato forma (nessun autore dà libri) non si tocca niente
    for d in autori:
        a = d.to_dict() or {}
        nome = (a.get("t") or "").strip()
        if not nome:
            continue
        if a.get("chi") == nome and ms - (a.get("agg") or 0) < OGNI:
            continue  # già guardato in settimana
        try:
            tutti = libri_di(nome)
        except Exception as e:  # un autore che non va non ferma gli altri
            print(f"Un autore: non riuscito ({type(e).__name__}), tengo l'elenco di prima")
            continue
        cercati += 1
        if not tutti:
            vuoti += 1
            if a.get("chi") == nome and a.get("libri"):
                scritture.append((d, {"agg": ms}))  # aveva già i suoi libri: meglio vecchio che vuoto
                print("Un autore: nessun libro letto, tengo l'elenco di prima")
            else:
                scritture.append((d, {"agg": ms, "chi": nome, "libri": [], "trovato": False}))
                print("Un autore: non trovato su IBS")
            continue
        # Nuovi = usciti quest'anno o l'anno scorso. Se non ce ne sono, si mostrano gli ultimi 3 (con "nessuna novità").
        recenti = [x for x in tutti if x["anno"] >= anno - 1][:8] or tutti[:3]
        stesso = a.get("chi") == nome
        visti = set(a.get("visti") or []) if stesso else set()
        nuovi = {k: v for k, v in (a.get("nuovi") or {}).items() if v > ms - 30 * 864e5} if stesso else {}
        if stesso and visti:  # la prima volta niente "Nuovo": sarebbero tutti nuovi
            for x in recenti:
                if x["ean"] not in visti:
                    nuovi[x["ean"]] = ms
        visti |= {x["ean"] for x in tutti}
        scritture.append((d, {"agg": ms, "chi": nome, "libri": recenti, "trovato": True,
                              "visti": sorted(visti)[-200:], "nuovi": nuovi}))
        print(f"Un autore: {len(tutti)} libri letti, {len(recenti)} mostrati, {sum(1 for x in recenti if x['ean'] in nuovi)} nuovi")
        time.sleep(2)  # gentile col sito
    if cercati >= 2 and vuoti == cercati:
        raise SystemExit("IBS non ha dato libri per nessun autore: forse la pagina è cambiata. Non scrivo niente.")
    for d, dati in scritture:
        try:
            d.reference.update(dati)
        except Exception as e:  # es. l'autore è stato tolto mentre il programma girava
            print(f"Un autore: non salvato ({type(e).__name__})")


if __name__ == "__main__":
    main()
