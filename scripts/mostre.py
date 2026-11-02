"""Le mostre di Firenze per la sezione "Per me" (Sasha, 02/11/2026): Palazzo Strozzi (in corso e in arrivo)
e Cattedrale dell'Immagine. Gira il lunedì e il giovedì mattina (workflow "Mostre").

Scrive info/mostre: l'elenco (l), quando (agg), tutte le mostre già viste (viste) e quelle comparse da poco (nuove),
che il programma delle notifiche annuncia a chi le segue. Se un sito non risponde o cambia forma, per quel
luogo resta l'elenco di prima: meglio vecchio che vuoto.
"""
import datetime as dt
import html
import os
import re
import time

import requests

from comune import adesso, database

MESI = {m: i + 1 for i, m in enumerate(["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
                                        "agosto", "settembre", "ottobre", "novembre", "dicembre"])}
UA = {"User-Agent": "Mozilla/5.0 (app di famiglia NDSZ; un controllo due volte a settimana)"}
STROZZI, CATTEDRALE = "Palazzo Strozzi", "Cattedrale dell'Immagine"


def pulisci(x):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", x or "")).split())


def date_it(testo):
    """Le date italiane di un testo ("25 settembre 2026 - 24 gennaio 2027", "venerdì 15 maggio a domenica 15 novembre 2026"):
    (dal, al) come AAAA-MM-GG. Se la prima non ha l'anno, è quello della seconda (o l'anno prima, se il mese è dopo)."""
    trovate = [(int(g), MESI[m], int(a) if a else None) for g, m, a in re.findall(r"(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?", testo.lower()) if m in MESI]
    if not trovate:
        return "", ""
    g2, m2, a2 = trovate[-1]
    if a2 is None:
        return "", ""
    al = dt.date(a2, m2, g2)
    if len(trovate) == 1:
        return "", al.isoformat()
    g1, m1, a1 = trovate[0]
    a1 = a1 or (a2 if m1 <= m2 else a2 - 1)
    return dt.date(a1, m1, g1).isoformat(), al.isoformat()


def scarica(url):
    for prova in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=30)
            r.raise_for_status()
            return r.text
        except requests.RequestException as e:
            if prova == 2:
                raise
            print(f"{url}: riprovo ({type(e).__name__})")
            time.sleep(5 * (prova + 1))


def strozzi():
    """Le schede "Mostra" del calendario (in corso) e delle mostre future."""
    out = {}
    for url in ("https://www.palazzostrozzi.org/calendario/", "https://www.palazzostrozzi.org/mostre-future/"):
        s = scarica(url)
        for m in re.finditer(r'<div class="card [^"]*">(.*?)stretched-link', s, re.S):
            c = m.group(1)
            tag = [pulisci(t) for t in re.findall(r'<span class="tag[^"]*">(.*?)</span>', c, re.S)]
            h4 = re.search(r"<h4[^>]*>(.*?)</h4>", c, re.S)
            link = re.findall(r'href="(https://www\.palazzostrozzi\.org/mostra/[^"]+)"', c)
            if "Mostra" not in tag or not h4 or not link:
                continue
            dal, al = date_it(" - ".join(pulisci(t) for t in re.findall(r"<time[^>]*>(.*?)</time>", c, re.S)))
            titolo = pulisci(re.split(r"<br\s*/?>", h4.group(1))[0])
            sub = re.search(r"<i>(.*?)</i>", h4.group(1), re.S)
            img = re.search(r'<img src="([^"]+)"', c)
            mid = "ps-" + link[-1].rstrip("/").rsplit("/", 1)[-1]
            out[mid] = {"id": mid, "luogo": STROZZI, "t": titolo[:80], "sub": pulisci(sub.group(1))[:80] if sub else "",
                        "dal": dal, "al": al, "img": img.group(1) if img else "", "link": link[-1]}
    return list(out.values())


def cattedrale():
    """La mostra della pagina principale: "Da … a … la Cattedrale dell'Immagine di Firenze ospita TITOLO, …"."""
    s = scarica("https://www.cattedraledellimmagine.it/")
    testo = pulisci(re.sub(r"<script.*?</script>|<style.*?</style>", " ", s, flags=re.S))
    m = re.search(r"\bDa\s+(.{4,40}?)\s+a\s+(.{4,40}?\d{4})\s+la\s+Cattedrale dell.Immagine.{0,30}?ospita\s+(.{3,120}?)[,.]\s", testo)
    if not m:
        print("Cattedrale: la pagina non ha la frase con le date, tengo quello di prima")
        return None
    dal, al = date_it(m.group(1) + " - " + m.group(2))
    parti = [p.strip() for p in re.split(r"\s[–-]\s", m.group(3), maxsplit=1)]
    titolo = parti[0].capitalize() if parti[0].isupper() else parti[0]
    parola = re.sub(r"[^a-z]", "", parti[0].split()[0].lower())
    link = next((l for l in re.findall(r'href="(https://www\.cattedraledellimmagine\.it/[^"#?]+)"', s) if parola and parola in l), "https://www.cattedraledellimmagine.it/")
    # La foto: la prima della pagina della mostra che non sia un logo (l'immagine di anteprima del sito è il logo).
    img = ""
    if link.rstrip("/") != "https://www.cattedraledellimmagine.it":
        try:
            img = next((u for u in re.findall(r'src="(https://www\.cattedraledellimmagine\.it/wp-content/uploads/[^"]+\.jpe?g)"', scarica(link))
                        if "logo" not in u.lower()), "")
        except requests.RequestException:
            pass
    return [{"id": "ci-" + (parola or "mostra") + "-" + (dal or al)[:7], "luogo": CATTEDRALE, "t": titolo[:80],
             "sub": parti[1][:80] if len(parti) > 1 else "", "dal": dal, "al": al, "img": img, "link": link}]


def main():
    if not os.environ.get("FIREBASE_CHIAVE"):
        print("Chiave di Firebase non ancora inserita: niente da fare.")
        return
    db = database()
    ref = db.collection("info").document("mostre")
    prima = ref.get().to_dict() or {}
    vecchie = prima.get("l") or []
    ora = adesso()
    oggi = ora.date().isoformat()
    elenco = []
    for luogo, prendi in ((STROZZI, strozzi), (CATTEDRALE, cattedrale)):
        try:
            nuovo = prendi()
        except Exception as e:  # un sito giù non deve fermare l'altro
            print(f"{luogo}: non riuscito ({type(e).__name__}: {e})")
            nuovo = None
        if not nuovo:
            nuovo = [x for x in vecchie if x.get("luogo") == luogo]
        elenco += [x for x in nuovo if not x.get("al") or x["al"] >= oggi]
    viste = set(prima.get("viste") or [])
    adesso_ms = int(ora.timestamp() * 1000)
    # Le nuove si ricordano 30 giorni. La prima volta non si annuncia niente (sarebbero tutte "nuove").
    nuove = {k: v for k, v in (prima.get("nuove") or {}).items() if v > adesso_ms - 30 * 864e5}
    if prima:
        for x in elenco:
            if x["id"] not in viste:
                nuove[x["id"]] = adesso_ms
    viste |= {x["id"] for x in elenco}
    ref.set({"agg": adesso_ms, "l": elenco, "viste": sorted(viste)[-300:], "nuove": nuove})
    for x in elenco:
        print(f"{x['luogo']}: {x['t']} ({x['dal']} → {x['al']})" + (" NUOVA" if x["id"] in nuove else ""))


if __name__ == "__main__":
    main()
