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

# La funzione su Cloud Run: stato dell'ultima versione e, con PROVA=1, una chiamata diretta per vedere la risposta.
r = s.get(f"https://run.googleapis.com/v2/projects/{chiave['project_id']}/locations/europe-west1/services/notifiche5")
if r.ok:
    sv = r.json()
    print("Funzione:", sv.get("uri"), "| pronta:", [(c.get("type"), c.get("state"), c.get("message", "")[:300]) for c in sv.get("conditions", [])][:4])
    if os.environ.get("PROVA") == "1" and sv.get("uri"):
        from google.oauth2 import service_account as sa
        from google.auth.transport.requests import Request
        tok = sa.IDTokenCredentials.from_service_account_info(chiave, target_audience=sv["uri"])
        tok.refresh(Request())
        import requests
        rr = requests.post(sv["uri"], headers={"Authorization": f"Bearer {tok.token}", "Content-Type": "application/json"}, json={}, timeout=200)
        print("Chiamata diretta:", rr.status_code, rr.text[:1500])
else:
    print(f"Funzione: non leggibile ({r.status_code}) {r.text[:300]}")

# Note della Bacheca (revisione 02/11/2026): solo id, autore (pX), ora e lunghezza, mai il testo.
db = database()
st = db.collection("sistema").document("notifiche").get().to_dict() or {}
inv = st.get("inviati") or {}
tok = {}
for d in db.collection("token").stream():
    tok.setdefault(d.to_dict().get("persona"), 0)
    tok[d.to_dict().get("persona")] += 1
print("Token per persona:", tok)
print("Interruttore note:", {d.id: ((d.to_dict() or {}).get("notifiche") or {}).get("note", "predefinito") for d in db.collection("persone").stream()})
for d in db.collection("note").stream():
    n = d.to_dict() or {}
    c = n.get("creato")
    print(f"Nota {d.id}: by={n.get('by')} creato={c!r} ({type(c).__name__}) "
          f"{dt.datetime.fromtimestamp(c / 1000, ROMA):%d/%m %H:%M}" if isinstance(c, (int, float)) else f"Nota {d.id}: by={n.get('by')} creato={c!r}",
          f"len={len(n.get('x') or '')} pin={n.get('pin')!r} chiavi={sorted(n)} avvisi={[k.split('|')[2] for k in inv if k.startswith('nota|' + d.id + '|')]}")
