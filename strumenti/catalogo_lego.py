"""Prepara lego/catalog.json per la ricerca dei set nei Regali (07/11/2026), senza l'app LEGO su GitHub.
Fonte: l'elenco pubblico dei set di Rebrickable (sets.csv.gz). Stesso formato del catalogo dell'app LEGO:
{"imgBase": "", "sets": [[numero, nome, anno, tema, pezzi, immagine], ...]}.
Uso: python3 strumenti/catalogo_lego.py lego/catalog.json [file sets.csv.gz già scaricato]"""
import csv
import gzip
import io
import json
import os
import sys
import urllib.request

URL = "https://cdn.rebrickable.com/media/downloads/sets.csv.gz"


def converti(dati_gz):
    righe = csv.DictReader(io.StringIO(gzip.decompress(dati_gz).decode("utf-8")))
    sets = []
    for r in righe:
        nome = (r.get("name") or "").strip()
        if not r.get("set_num") or not nome:
            continue
        anno = int(r["year"]) if (r.get("year") or "").isdigit() else 0
        pezzi = int(r["num_parts"]) if (r.get("num_parts") or "").isdigit() else 0
        img = (r.get("img_url") or "").strip()
        sets.append([r["set_num"], nome, anno, r.get("theme_id") or "", pezzi, img if img.startswith("https://") else ""])
    return {"imgBase": "", "sets": sets}


def main():
    uscita = sys.argv[1]
    if len(sys.argv) > 2:
        dati = open(sys.argv[2], "rb").read()
    else:
        req = urllib.request.Request(URL, headers={"User-Agent": "NDSZ catalogo"})
        try:
            dati = urllib.request.urlopen(req, timeout=60).read()
        except Exception as e:
            raise SystemExit(f"Catalogo LEGO non scaricato ({type(e).__name__})")
    cat = converti(dati)
    if len(cat["sets"]) < 1000:
        raise SystemExit(f"Catalogo troppo corto ({len(cat['sets'])} set): non lo scrivo")
    os.makedirs(os.path.dirname(uscita) or ".", exist_ok=True)
    with open(uscita, "w", encoding="utf-8") as f:
        json.dump(cat, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Catalogo LEGO: {len(cat['sets'])} set")


if __name__ == "__main__":
    main()
