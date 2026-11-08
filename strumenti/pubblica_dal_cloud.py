"""Pubblica le app di Sasha dal cloud, senza GitHub e senza Cloud Shell, con il pubblicatore su Firebase (funzione
"pubblica", dal 07/11/2026 per NDSZ e dal 08/11/2026 per tutte le app e per i programmi).

Uso (dalla cartella del codice di NDSZ):
  NDSZ
    python3 strumenti/pubblica_dal_cloud.py "Titolo"              → copia di PROVA (indirizzo suo, scade in 14 giorni)
    python3 strumenti/pubblica_dal_cloud.py --live "Titolo"       → sito vero (con [tutti] nel titolo l'avviso va a tutti e 4)
    python3 strumenti/pubblica_dal_cloud.py --live --regole "T"   → sito vero + regole del database e dello spazio foto
  Le altre app (ognuna col suo sito)
    python3 strumenti/pubblica_dal_cloud.py --registra la-mia-app NOME-DEL-SITO   → crea il sito (una volta)
    python3 strumenti/pubblica_dal_cloud.py --app la-mia-app --cartella CARTELLA "Titolo"          → prova
    python3 strumenti/pubblica_dal_cloud.py --app la-mia-app --cartella CARTELLA --live "Titolo"   → sito vero
    python3 strumenti/pubblica_dal_cloud.py --chiave la-mia-app IMPRONTA   → chiave propria dell'app (solo l'impronta sha256)
    python3 strumenti/pubblica_dal_cloud.py --elenco
  I programmi (funzioni di Firebase)
    python3 strumenti/pubblica_dal_cloud.py --programmi [--solo a,b] [--anche-pubblica]
    python3 strumenti/pubblica_dal_cloud.py --stato-programmi
La parola d'ordine NON sta qui: la mette la rete della sessione di Claude (segreto salvato nell'ambiente per
l'indirizzo della funzione, intestazione X-Comando-Token). Regola: prima la prova, poi UNA pubblicazione vera,
un solo controllo dopo (Conoscenze/Come pubblichiamo le app.md nel diario).
"""
import argparse
import io
import json
import pathlib
import py_compile
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

URL = "https://europe-west1-noi-quattro.cloudfunctions.net/pubblica"
SITO = "https://noi-quattro.web.app"
CARTELLA = pathlib.Path(__file__).resolve().parent.parent
# File del sito di un'app: come il pubblicatore (scripts/pubblica_sito.py, FILE_APP): niente file nascosti.
FILE_APP = re.compile(r"(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*"
                      r"\.(?:html|js|mjs|css|json|webmanifest|png|jpe?g|webp|gif|svg|ico|txt|woff2?|xml|mp3|m4a|wav)")


def pacchetto_ndsz(regole):
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


def pacchetto_app(cartella):
    """Zip dei file del sito di un'app. I file nascosti (.git, .chiave...) e quelli non da sito restano fuori."""
    base = pathlib.Path(cartella).resolve()
    if not (base / "index.html").is_file():
        sys.exit(f"In {base} manca index.html: non è la cartella del sito.")
    buf, saltati, n = io.BytesIO(), [], 0
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(base.rglob("*")):
            rel = p.relative_to(base).as_posix()
            if not p.is_file() or any(parte.startswith(".") for parte in rel.split("/")):
                continue
            if FILE_APP.fullmatch(rel):
                z.write(p, rel)
                n += 1
            else:
                saltati.append(rel)
    if saltati:
        print(f"(lasciati fuori {len(saltati)} file non da sito: {', '.join(saltati[:8])}{' …' if len(saltati) > 8 else ''})")
    print(f"Pacchetto: {n} file, {len(buf.getvalue()) // 1024} KB")
    return buf.getvalue()


def pacchetto_programmi():
    """Zip del codice delle funzioni: functions/main.py, requirements.txt e i file di scripts/ della lista."""
    nomi = [r.strip() for r in (CARTELLA / "strumenti" / "file_funzioni.txt").read_text(encoding="utf-8").splitlines()
            if r.strip() and not r.startswith("#")]
    file = {"main.py": CARTELLA / "functions" / "main.py", "requirements.txt": CARTELLA / "functions" / "requirements.txt"}
    file.update({n: CARTELLA / "scripts" / n for n in nomi})
    with tempfile.TemporaryDirectory() as tmp:  # prima di mandarlo: niente errori di scrittura nel codice
        for n, p in file.items():
            if n.endswith(".py"):
                py_compile.compile(str(p), cfile=f"{tmp}/{n}c", doraise=True)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for n, p in file.items():
            z.write(p, n)
    return buf.getvalue()


def chiama(parametri, dati=b"", tipo="application/zip"):
    q = urllib.parse.urlencode({k: v for k, v in parametri.items() if v not in (None, "")})
    req = urllib.request.Request(f"{URL}?{q}", data=dati, method="POST",
                                 headers={"Content-Type": tipo, "X-Comando-Token": "messa-dalla-rete-della-sessione"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"Non riuscito ({e.code}): {e.read().decode('utf-8', 'replace')[:800]}")


def main():
    a = argparse.ArgumentParser(description="Pubblica le app di Sasha dal cloud (vedi in cima al file).")
    a.add_argument("titolo", nargs="?", default="")
    a.add_argument("--live", action="store_true")
    a.add_argument("--regole", action="store_true")
    a.add_argument("--app")
    a.add_argument("--cartella")
    a.add_argument("--registra", nargs=2, metavar=("APP", "SITO"))
    a.add_argument("--chiave", nargs=2, metavar=("APP", "IMPRONTA"))
    a.add_argument("--elenco", action="store_true")
    a.add_argument("--programmi", action="store_true")
    a.add_argument("--solo")
    a.add_argument("--anche-pubblica", action="store_true")
    a.add_argument("--stato-programmi", action="store_true")
    o = a.parse_args()
    canale = "live" if o.live else "prova"
    js = lambda d: json.dumps(d).encode()

    if o.registra:
        e = chiama({"azione": "app"}, js({"app": o.registra[0], "sito": o.registra[1]}), "application/json")
        print(f"App {e['app']}: sito {e['sito']} {'creato' if e['nuovo'] else 'già pronto'} → {e['url']}")
    elif o.chiave:
        print(chiama({"azione": "chiave"}, js({"app": o.chiave[0], "impronta": o.chiave[1]}), "application/json"))
    elif o.elenco:
        print(json.dumps(chiama({"azione": "elenco"}, b"{}", "application/json"), indent=1, ensure_ascii=False))
    elif o.programmi:
        e = chiama({"azione": "funzioni", "solo": o.solo, "anche_pubblica": "1" if o.anche_pubblica else ""}, pacchetto_programmi())
        print(f"Codice nuovo mandato a: {', '.join(e['funzioni'])}. Google lo prepara in 2-4 minuti: "
              f"poi UN controllo con --stato-programmi (se non parte, resta in servizio il codice di prima).")
    elif o.stato_programmi:
        print(json.dumps(chiama({"azione": "funzioni-stato"}, b"{}", "application/json"), indent=1, ensure_ascii=False))
    elif o.app:
        if o.regole:
            sys.exit("Le regole sono solo di NDSZ.")
        if not o.cartella:
            sys.exit("Serve --cartella con i file del sito dell'app.")
        e = chiama({"app": o.app, "canale": canale, "titolo": o.titolo}, pacchetto_app(o.cartella))
        print(f"Pubblicata {e['app']} sul canale {e['canale']}: {e['url']} ({e['file']} file, {e['caricati']} nuovi)")
    else:
        if o.regole and not o.live:
            sys.exit("Le regole si pubblicano solo con --live.")
        versione = re.search(r"noi4-v\d+", (CARTELLA / "sw.js").read_text(encoding="utf-8")).group(0)
        (CARTELLA / "versione.json").write_text(json.dumps({"versione": versione, "titolo": o.titolo}, ensure_ascii=False), encoding="utf-8")
        e = chiama({"canale": canale, "titolo": o.titolo}, pacchetto_ndsz(o.regole))
        print(f"Pubblicato {versione} sul canale {e['canale']}: {e['url']} "
              f"({e['file']} file, {e['caricati']} nuovi){' · regole: ' + ', '.join(e['regole']) if e.get('regole') else ''}")


if __name__ == "__main__":
    main()
