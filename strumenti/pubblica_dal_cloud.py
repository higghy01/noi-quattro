"""Pubblica NDSZ dal cloud, senza GitHub e senza Cloud Shell (07/11/2026), con la funzione "pubblica" di Firebase.

Uso (dalla cartella del codice):
  python3 strumenti/pubblica_dal_cloud.py "Titolo"            → copia di PROVA (indirizzo suo, scade in 14 giorni)
  python3 strumenti/pubblica_dal_cloud.py --live "Titolo"     → sito vero (con [tutti] nel titolo l'avviso va a tutti e 4)
  python3 strumenti/pubblica_dal_cloud.py --live --regole "T" → sito vero + regole del database e dello spazio foto
La parola d'ordine NON sta qui: la mette la rete della sessione di Claude (segreto salvato nell'ambiente per
l'indirizzo della funzione, intestazione X-Comando-Token). Regola: prima la prova, poi UNA pubblicazione vera,
un solo controllo dopo (Conoscenze/Come pubblichiamo le app.md nel diario).
"""
import io
import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.parse
import urllib.request
import zipfile

URL = "https://europe-west1-noi-quattro.cloudfunctions.net/pubblica"
SITO = "https://noi-quattro.web.app"
CARTELLA = pathlib.Path(__file__).resolve().parent.parent


def pacchetto(regole):
    """Prepara pubblico/ (solo i file del sito) e ne fa uno zip; con regole=True aggiunge _regole/."""
    lego = CARTELLA / "lego" / "catalog.json"
    if not lego.exists():  # il catalogo LEGO lo fa Cloud Shell: si riprende quello già online
        try:
            dati = urllib.request.urlopen(SITO + "/lego/catalog.json", timeout=60).read()
            if len(json.loads(dati).get("sets", [])) > 1000:
                lego.parent.mkdir(exist_ok=True)
                lego.write_bytes(dati)
        except Exception as e:
            print(f"(catalogo LEGO non ripreso: {type(e).__name__}; la ricerca dei set userà l'app LEGO)")
    subprocess.run(["bash", str(CARTELLA / "strumenti" / "prepara_sito.sh")], check=True)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        base = CARTELLA / "pubblico"
        for p in sorted(base.rglob("*")):
            if p.is_file():
                z.write(p, p.relative_to(base).as_posix())
        if regole:
            for f in ("firestore.rules", "storage.rules"):
                z.write(CARTELLA / f, "_regole/" + f)
    return buf.getvalue()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    live, regole = "--live" in sys.argv, "--regole" in sys.argv
    if regole and not live:
        sys.exit("Le regole si pubblicano solo con --live.")
    titolo = args[0] if args else ""
    versione = re.search(r"noi4-v\d+", (CARTELLA / "sw.js").read_text(encoding="utf-8")).group(0)
    (CARTELLA / "versione.json").write_text(json.dumps({"versione": versione, "titolo": titolo}, ensure_ascii=False), encoding="utf-8")
    dati = pacchetto(regole)
    canale = "live" if live else "prova"
    q = urllib.parse.urlencode({"canale": canale, "titolo": titolo})
    req = urllib.request.Request(f"{URL}?{q}", data=dati, method="POST",
                                 headers={"Content-Type": "application/zip", "X-Comando-Token": "messa-dalla-rete-della-sessione"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            esito = json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"Non pubblicato ({e.code}): {e.read().decode('utf-8', 'replace')[:800]}")
    print(f"Pubblicato {versione} sul canale {esito['canale']}: {esito['url']} "
          f"({esito['file']} file, {esito['caricati']} nuovi){' · regole: ' + ', '.join(esito['regole']) if esito.get('regole') else ''}")


if __name__ == "__main__":
    main()
