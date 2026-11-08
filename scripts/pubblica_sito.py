"""Il pubblicatore delle app di Sasha, dall'interno di Firebase (NDSZ dal 07/11/2026, tutte le app dal 08/11/2026).

Lo usa la funzione "pubblica" (functions/main.py): così Claude pubblica dal cloud anche quando Sasha non è al PC,
senza GitHub e senza Cloud Shell.
- NDSZ: uno zip con SOLO i file del sito (quelli di pubblico/) e, se servono, le regole in _regole/.
- Le altre app (La mia app, LEGO, Rigo, Viatrix...): ognuna ha un suo sito di Firebase Hosting nello stesso progetto,
  con il suo indirizzo (https://<sito>.web.app); lo zip contiene i file del sito, anche in sottocartelle.
Canali: "live" = il sito vero; qualsiasi altro nome (di base "prova") = una copia di prova con un indirizzo suo, che
scade da sola dopo 14 giorni. Le regole si pubblicano solo col canale "live" e solo per NDSZ.
Anche i programmi (le funzioni) si aggiornano da qui (aggiorna_funzioni), così la shell non serve più.
"""
import gzip
import hashlib
import io
import re
import zipfile

import requests

API = "https://firebasehosting.googleapis.com/v1beta1"
REGOLE_API = "https://firebaserules.googleapis.com/v1"
# Solo i file del sito: niente programmi, regole o altro (stessa lista di strumenti/prepara_sito.sh).
CONSENTITI = re.compile(r"(?:[A-Za-z0-9_.-]+\.(?:html|js|css|png|json)|lego/catalog\.json)")
OBBLIGATORI = ("/index.html", "/sw.js", "/app.js", "/versione.json")
CANALE = re.compile(r"[a-z0-9-]{1,40}")
# Le altre app: file del sito con nomi semplici, anche in sottocartelle; MAI file nascosti (.chiave, .env...), "..",
# programmi o altro. Le intestazioni sono quelle di GitHub Pages (tutto max-age=600), così si comportano come prima.
FILE_APP = re.compile(r"(?:[A-Za-z0-9_-][A-Za-z0-9_.-]*/)*[A-Za-z0-9_-][A-Za-z0-9_.-]*"
                      r"\.(?:html|js|mjs|css|json|webmanifest|png|jpe?g|webp|gif|svg|ico|txt|woff2?|xml|mp3|m4a|wav)")
INTESTAZIONI_APP = [{"glob": "**", "headers": {"Cache-Control": "max-age=600"}}]
NOME_APP = re.compile(r"[a-z0-9][a-z0-9-]{1,28}[a-z0-9]")
SITO_ID = re.compile(r"[a-z0-9][a-z0-9-]{2,61}[a-z0-9]")
MAX_FILE_APP = 5000
FUNZIONI_API = "https://cloudfunctions.googleapis.com/v2"
# Le stesse intestazioni di firebase.json (hosting.headers): tenerle uguali.
INTESTAZIONI = [
    {"glob": "**", "headers": {"Cache-Control": "max-age=600"}},
    {"glob": "/@(sw.js|index.html|manifest.json|versione.json)", "headers": {"Cache-Control": "no-cache"}},
    {"glob": "/", "headers": {"Cache-Control": "no-cache"}},
]


class Rifiutato(ValueError):
    """Pacchetto o richiesta non accettabile (risposta 400, niente pubblicato)."""


def leggi_pacchetto(dati_zip):
    """Dallo zip: {percorso: contenuto} del sito e {nome: testo} delle regole."""
    try:
        z = zipfile.ZipFile(io.BytesIO(dati_zip))
    except zipfile.BadZipFile:
        raise Rifiutato("il pacchetto non è uno zip")
    sito, regole = {}, {}
    for n in z.namelist():
        if n.endswith("/"):
            continue
        if n in ("_regole/firestore.rules", "_regole/storage.rules"):
            regole[n.split("/", 1)[1]] = z.read(n).decode("utf-8")
            continue
        if not CONSENTITI.fullmatch(n):
            raise Rifiutato(f"file non permesso nel sito: {n}")
        sito["/" + n] = z.read(n)
    mancano = [p for p in OBBLIGATORI if p not in sito]
    if mancano:
        raise Rifiutato(f"mancano file del sito: {', '.join(mancano)}")
    return sito, regole


def leggi_pacchetto_app(dati_zip):
    """Le altre app: {percorso: contenuto} dallo zip. Solo file del sito, mai file nascosti; serve index.html."""
    try:
        z = zipfile.ZipFile(io.BytesIO(dati_zip))
    except zipfile.BadZipFile:
        raise Rifiutato("il pacchetto non è uno zip")
    sito = {}
    for n in z.namelist():
        if n.endswith("/"):
            continue
        if not FILE_APP.fullmatch(n):
            raise Rifiutato(f"file non permesso nel sito: {n}")
        sito["/" + n] = z.read(n)
    if "/index.html" not in sito:
        raise Rifiutato("manca index.html")
    if len(sito) > MAX_FILE_APP:
        raise Rifiutato(f"troppi file ({len(sito)})")
    return sito


def _ok(r, cosa):
    if not r.ok:
        raise RuntimeError(f"{cosa}: {r.status_code} {r.text[:500]}")
    return r


def pubblica_sito(s, sito_id, file_sito, canale="prova", titolo="", intestazioni=None):
    """s = sessione autorizzata (google.auth). Ritorna un riassunto con l'indirizzo."""
    if not CANALE.fullmatch(canale):
        raise Rifiutato("nome del canale non valido")
    gz = {p: gzip.compress(c, mtime=0) for p, c in file_sito.items()}
    hash_di = {p: hashlib.sha256(b).hexdigest() for p, b in gz.items()}
    per_hash = {hash_di[p]: gz[p] for p in gz}
    config = {"headers": intestazioni or INTESTAZIONI}
    v = _ok(s.post(f"{API}/sites/{sito_id}/versions", json={"config": config}), "versione").json()
    nome = v["name"]
    req = _ok(s.post(f"{API}/{nome}:populateFiles", json={"files": hash_di}), "elenco file").json()
    servono = list(dict.fromkeys(req.get("uploadRequiredHashes") or []))  # ogni file una volta sola
    for h in servono:
        _ok(s.post(f"{req['uploadUrl']}/{h}", data=per_hash[h], headers={"Content-Type": "application/octet-stream"}), "caricamento")
    _ok(s.patch(f"{API}/{nome}", params={"update_mask": "status"}, json={"status": "FINALIZED"}), "chiusura versione")
    messaggio = (titolo or "")[:200]
    if canale == "live":
        _ok(s.post(f"{API}/sites/{sito_id}/releases", params={"versionName": nome}, json={"message": messaggio}), "pubblicazione")
        url = f"https://{sito_id}.web.app"
    else:
        r = s.post(f"{API}/sites/{sito_id}/channels", params={"channelId": canale}, json={"ttl": "1209600s"})
        if not r.ok and r.status_code != 409:  # 409 = c'è già
            _ok(r, "canale di prova")
        _ok(s.post(f"{API}/sites/{sito_id}/channels/{canale}/releases", params={"versionName": nome}, json={"message": messaggio}), "pubblicazione di prova")
        url = _ok(s.get(f"{API}/sites/{sito_id}/channels/{canale}"), "indirizzo di prova").json().get("url", "")
    return {"canale": canale, "url": url, "versione": nome.rsplit("/", 1)[-1], "file": len(gz), "caricati": len(servono)}


def pubblica_regole(s, progetto, secchio, regole):
    """regole = {"firestore.rules": testo, "storage.rules": testo} (anche uno solo). Come scripts/pubblica_regole.py."""
    fatto = []
    for file, release in (("firestore.rules", "cloud.firestore"), ("storage.rules", f"firebase.storage/{secchio}")):
        if file not in regole:
            continue
        r = _ok(s.post(f"{REGOLE_API}/projects/{progetto}/rulesets",
                       json={"source": {"files": [{"name": file, "content": regole[file]}]}}), f"{file} non accettate")
        nome = f"projects/{progetto}/releases/{release}"
        r2 = s.patch(f"{REGOLE_API}/{nome}", json={"release": {"name": nome, "rulesetName": r.json()["name"]}})
        if r2.status_code == 404:
            r2 = s.post(f"{REGOLE_API}/projects/{progetto}/releases", json={"name": nome, "rulesetName": r.json()["name"]})
        _ok(r2, f"{file} non attivate")
        fatto.append(file)
    return fatto


def crea_sito(s, progetto, sito_id, max_versioni=10):
    """Crea (se non c'è) il sito di Firebase Hosting di un'app nel progetto. Tiene solo le ultime versioni."""
    if not SITO_ID.fullmatch(sito_id):
        raise Rifiutato("nome del sito non valido (lettere minuscole, numeri e trattini)")
    r = s.get(f"{API}/sites/{sito_id}")
    if r.status_code == 200:
        nuovo = False
    else:
        r = s.post(f"{API}/projects/{progetto}/sites", params={"siteId": sito_id}, json={})
        if r.status_code == 409 or (r.status_code == 400 and "already" in r.text.lower()):
            raise Rifiutato(f"il nome {sito_id} è già preso da qualcun altro: scegline un altro")
        _ok(r, "sito nuovo")
        nuovo = True
    if max_versioni:
        _ok(s.patch(f"{API}/sites/{sito_id}/config", params={"updateMask": "maxVersions"},
                    json={"maxVersions": int(max_versioni)}), "versioni da tenere")
    return {"sito": sito_id, "url": f"https://{sito_id}.web.app", "nuovo": nuovo}


def _funzioni(s, progetto, regione):
    r = _ok(s.get(f"{FUNZIONI_API}/projects/{progetto}/locations/{regione}/functions"), "elenco delle funzioni").json()
    return {f["name"].rsplit("/", 1)[-1]: f for f in r.get("functions", [])}


def aggiorna_funzioni(s, progetto, regione, dati_zip, solo=None, anche_pubblica=False, carica=None):
    """Aggiorna il codice dei programmi (funzioni già esistenti) senza Cloud Shell: carica lo zip e lo dà a ognuna.
    Se il codice nuovo non parte, Google tiene in servizio quello di prima. "pubblica" (questo pubblicatore) si
    aggiorna solo se chiesto apposta, così un errore non può mai togliere il modo di correggerlo."""
    try:
        nomi_zip = set(zipfile.ZipFile(io.BytesIO(dati_zip)).namelist())
    except zipfile.BadZipFile:
        raise Rifiutato("il pacchetto non è uno zip")
    for f in ("main.py", "requirements.txt"):
        if f not in nomi_zip:
            raise Rifiutato(f"manca {f} nel pacchetto dei programmi")
    if any(n.startswith(("venv/", ".")) or "/." in n for n in nomi_zip):
        raise Rifiutato("niente venv o file nascosti nel pacchetto dei programmi")
    esistenti = _funzioni(s, progetto, regione)
    if solo:
        sconosciute = [n for n in solo if n not in esistenti]
        if sconosciute:
            raise Rifiutato(f"funzioni che non esistono: {', '.join(sconosciute)} (le nuove si creano solo con Cloud Shell)")
        scelte = list(solo)
    else:
        scelte = sorted(esistenti)
    if not anche_pubblica:
        scelte = [n for n in scelte if n != "pubblica"]
    if not scelte:
        raise Rifiutato("nessuna funzione da aggiornare")
    base = f"{FUNZIONI_API}/projects/{progetto}/locations/{regione}/functions"
    up = _ok(s.post(f"{base}:generateUploadUrl", json={}), "indirizzo per il caricamento").json()
    # L'indirizzo è già firmato: si carica SENZA l'autorizzazione della sessione (Google rifiuta le due insieme).
    r = (carica or requests.put)(up["uploadUrl"], data=dati_zip, headers={"Content-Type": "application/zip"}, timeout=300)
    _ok(r, "caricamento del codice")
    operazioni = {}
    for nome in scelte:
        etichette = {k: v for k, v in (esistenti[nome].get("labels") or {}).items() if k != "firebase-functions-hash"}
        r = _ok(s.patch(f"{base}/{nome}", params={"updateMask": "buildConfig.source,labels"},
                        json={"buildConfig": {"source": {"storageSource": up["storageSource"]}}, "labels": etichette}),
                f"aggiornamento di {nome}")
        operazioni[nome] = r.json().get("name", "")
    return {"funzioni": scelte, "operazioni": operazioni}


def stato_funzioni(s, progetto, regione):
    """Per ogni funzione: stato, ultimo aggiornamento ed eventuali messaggi di errore."""
    return {n: {"stato": f.get("state"), "aggiornata": f.get("updateTime"),
                "messaggi": [m.get("message", "")[:300] for m in f.get("stateMessages", []) if m.get("severity") in ("ERROR", "WARNING")]}
            for n, f in _funzioni(s, progetto, regione).items()}
