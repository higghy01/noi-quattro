"""Dice quando è girato l'ultima volta il programma delle notifiche e da dove (Firebase o GitHub). Non manda niente."""
import datetime as dt

from comune import ROMA, database

s = database().collection("sistema").document("notifiche").get().to_dict() or {}
quando = dt.datetime.fromtimestamp(s.get("ultimo", 0) / 1000, ROMA)
print(f"Ultimo giro: {quando:%d/%m/%Y %H:%M:%S} (ora italiana), da: {s.get('da', 'sconosciuto')}, avvisi ricordati: {len(s.get('inviati') or {})}")
e = database().collection("sistema").document("notifiche-errore").get().to_dict()
if e:
    print(f"Ultimo errore della funzione ({e.get('quando')}):\n{e.get('errore')}")

# La sveglia di Google Cloud (Cloud Scheduler) che fa partire la funzione: stato e ultimo tentativo.
import json
import os

from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

chiave = json.loads(os.environ["FIREBASE_CHIAVE"])
s = AuthorizedSession(service_account.Credentials.from_service_account_info(chiave, scopes=["https://www.googleapis.com/auth/cloud-platform"]))
r = s.get(f"https://cloudscheduler.googleapis.com/v1/projects/{chiave['project_id']}/locations/europe-west1/jobs")
if not r.ok:
    print(f"Sveglia: non leggibile ({r.status_code})")
for j in (r.json().get("jobs") or []) if r.ok else []:
    print(f"Sveglia {j.get('name', '').split('/')[-1]}: {j.get('state')}, orario '{j.get('schedule')}' {j.get('timeZone')}, "
          f"ultimo tentativo {j.get('lastAttemptTime')}, prossimo {j.get('scheduleTime')}, esito {j.get('status') or 'ok'}")
