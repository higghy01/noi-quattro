"""Pubblica firestore.rules (database) e storage.rules (spazio foto) su Firebase, senza passare dalla console.

Usa la stessa chiave dei programmi automatici (segreto FIREBASE_CHIAVE su GitHub):
crea un nuovo insieme di regole e lo rende quello attivo del database.
"""
import json
import os
import pathlib
import sys

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

API = "https://firebaserules.googleapis.com/v1"


def main():
    chiave = json.loads(os.environ["FIREBASE_CHIAVE"])
    progetto = chiave["project_id"]
    cred = service_account.Credentials.from_service_account_info(
        chiave, scopes=["https://www.googleapis.com/auth/cloud-platform"])
    s = AuthorizedSession(cred)
    cartella = pathlib.Path(__file__).resolve().parent.parent

    def pubblica(file, release):
        testo = (cartella / file).read_text(encoding="utf-8")
        r = s.post(f"{API}/projects/{progetto}/rulesets",
                   json={"source": {"files": [{"name": file, "content": testo}]}})
        if not r.ok:
            return f"{file} non accettate ({r.status_code}): {r.text[:600]}"
        ruleset = r.json()["name"]
        nome = f"projects/{progetto}/releases/{release}"
        r = s.patch(f"{API}/{nome}", json={"release": {"name": nome, "rulesetName": ruleset}})
        if r.status_code == 404:
            r = s.post(f"{API}/projects/{progetto}/releases", json={"name": nome, "rulesetName": ruleset})
        if not r.ok:
            return f"{file} non attivate ({r.status_code}): {r.text[:600]}"
        print(f"{file}: pubblicate.")
        return None

    errore = pubblica("firestore.rules", "cloud.firestore")
    if errore:
        print(errore)
        sys.exit(1)
    # Lo spazio foto esiste solo dopo che viene attivato dalla console: finché manca non è un errore.
    secchio = chiave.get("storage_bucket") or os.environ.get("SECCHIO") or f"{progetto}.firebasestorage.app"
    errore = pubblica("storage.rules", f"firebase.storage/{secchio}")
    if errore:
        print("Spazio foto non ancora pronto o regole non attivate:", errore)
        return
    # Permesso al sito di scaricare i file originali (tasto "Scarica" dell'app).
    url_app = os.environ.get("URL_APP") or "https://higghy01.github.io"
    origine = "/".join(url_app.split("/")[:3])
    r = s.patch(f"https://storage.googleapis.com/storage/v1/b/{secchio}?fields=cors",
                json={"cors": [{"origin": [origine], "method": ["GET", "HEAD"], "responseHeader": ["Content-Type", "Content-Length"], "maxAgeSeconds": 3600}]})
    print("Scaricamento dal sito: permesso." if r.ok else f"Scaricamento dal sito non impostato ({r.status_code}): {r.text[:300]}")



if __name__ == "__main__":
    main()
