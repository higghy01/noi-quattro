"""Pubblica il sito di NDSZ su Firebase Hosting e le regole del database, dall'interno di Firebase (07/11/2026).

Lo usa la funzione "pubblica" (functions/main.py): così Claude può pubblicare dal cloud anche quando Sasha non è
al PC, senza GitHub e senza Cloud Shell. Riceve uno zip con SOLO i file del sito (quelli di pubblico/) e, se
servono, le regole in _regole/firestore.rules e _regole/storage.rules.
Canali: "live" = il sito vero (https://noi-quattro.web.app); qualsiasi altro nome (di base "prova") = una copia di
prova con un indirizzo suo, che scade da sola dopo 14 giorni. Le regole si pubblicano solo col canale "live".
"""
import gzip
import hashlib
import io
import re
import zipfile

API = "https://firebasehosting.googleapis.com/v1beta1"
REGOLE_API = "https://firebaserules.googleapis.com/v1"
# Solo i file del sito: niente programmi, regole o altro (stessa lista di strumenti/prepara_sito.sh).
CONSENTITI = re.compile(r"(?:[A-Za-z0-9_.-]+\.(?:html|js|css|png|json)|lego/catalog\.json)")
OBBLIGATORI = ("/index.html", "/sw.js", "/app.js", "/versione.json")
CANALE = re.compile(r"[a-z0-9-]{1,40}")
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


def _ok(r, cosa):
    if not r.ok:
        raise RuntimeError(f"{cosa}: {r.status_code} {r.text[:500]}")
    return r


def pubblica_sito(s, sito_id, file_sito, canale="prova", titolo=""):
    """s = sessione autorizzata (google.auth). Ritorna un riassunto con l'indirizzo."""
    if not CANALE.fullmatch(canale):
        raise Rifiutato("nome del canale non valido")
    gz = {p: gzip.compress(c, mtime=0) for p, c in file_sito.items()}
    hash_di = {p: hashlib.sha256(b).hexdigest() for p, b in gz.items()}
    per_hash = {hash_di[p]: gz[p] for p in gz}
    v = _ok(s.post(f"{API}/sites/{sito_id}/versions", json={"config": {"headers": INTESTAZIONI}}), "versione").json()
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
