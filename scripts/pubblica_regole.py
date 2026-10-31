"""Pubblica firestore.rules su Firebase, così nessuno deve incollarle a mano nella console.

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
    testo = (pathlib.Path(__file__).resolve().parent.parent / "firestore.rules").read_text(encoding="utf-8")

    r = s.post(f"{API}/projects/{progetto}/rulesets",
               json={"source": {"files": [{"name": "firestore.rules", "content": testo}]}})
    if not r.ok:
        print(f"Regole non accettate ({r.status_code}): {r.text[:600]}")
        sys.exit(1)
    ruleset = r.json()["name"]

    nome = f"projects/{progetto}/releases/cloud.firestore"
    r = s.patch(f"{API}/{nome}", json={"release": {"name": nome, "rulesetName": ruleset}})
    if r.status_code == 404:
        r = s.post(f"{API}/projects/{progetto}/releases", json={"name": nome, "rulesetName": ruleset})
    if not r.ok:
        print(f"Regole non attivate ({r.status_code}): {r.text[:600]}")
        sys.exit(1)
    print("Regole del database pubblicate.")


if __name__ == "__main__":
    main()
