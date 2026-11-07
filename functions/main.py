"""Funzioni di Firebase di NDSZ: tutto quello che gira da solo, senza GitHub (07/11/2026).

- notifiche5: ogni 5 minuti gli avvisi (scripts/notifiche.py; scelta di Sasha del 02/11/2026) e, se il sito ha una
  versione nuova (versione.json), l'avviso "NDSZ aggiornata" (scripts/aggiornamento.py).
- calendari, libri, mostre, film: i programmi che prima giravano su GitHub, agli stessi orari ma in ora italiana.
- comando: per i thread di Claude (orario di lavoro, orario scolastico, note di scuola, stato dei programmi), con una
  parola d'ordine segreta (COMANDO_TOKEN, nei segreti di Firebase). Prima erano i workflow "a mano" di GitHub.
I file di scripts/ li copia qui lo script di pubblicazione (strumenti/pubblica.sh): la fonte resta una sola.
Se qualcosa va storto, l'errore si scrive in sistema/<nome>-errore (con una chiamata web semplice, che funziona anche
se il collegamento al database del programma è rotto) e si vede con comando "stato".
"""
import contextlib
import datetime as dt
import hmac
import importlib
import io
import json
import os
import re
import time
import traceback

from firebase_functions import https_fn, options, scheduler_fn
from firebase_functions.params import SecretParam

REGIONE = "europe-west1"
COMANDO = SecretParam("COMANDO_TOKEN")


def _scrivi_errore(testo, doc="notifiche-errore"):
    try:
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        cred, progetto = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        progetto = progetto or os.environ.get("GCLOUD_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
        quando = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        AuthorizedSession(cred).patch(
            f"https://firestore.googleapis.com/v1/projects/{progetto}/databases/(default)/documents/sistema/{doc}",
            json={"fields": {"quando": {"stringValue": quando}, "errore": {"stringValue": testo[-1500:]}}}, timeout=20)
    except Exception:
        print("Non riesco nemmeno a scrivere l'errore:", traceback.format_exc())


def _segna(nome, esito):
    """Ultimo giro di ogni programma in sistema/programmi (si legge con comando "stato")."""
    try:
        from comune import database
        quando = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        database().collection("sistema").document("programmi").set({nome: {"quando": quando, "esito": esito}}, merge=True)
    except Exception:
        print("Non riesco a segnare il giro:", traceback.format_exc())


def _esegui(nome, modulo, **kw):
    """Lancia scripts/<modulo>.py come faceva GitHub. Un SystemExit senza errore (es. "niente da fare") va bene."""
    try:
        importlib.import_module(modulo).main(**kw)
    except SystemExit as e:
        if e.code not in (None, 0):
            testo = f"{nome}: uscito con {e.code}"
            print(testo)
            _scrivi_errore(testo, f"{nome}-errore")
            _segna(nome, "errore")
            raise RuntimeError(testo)
    except BaseException:
        testo = traceback.format_exc()
        print(testo)
        _scrivi_errore(testo, f"{nome}-errore")
        _segna(nome, "errore")
        raise
    _segna(nome, "ok")


def _annuncia_versione():
    """Se il sito ha una versione più nuova di quella già avvisata, manda "NDSZ aggiornata" (una volta sola).
    La versione e il titolo li scrive lo script di pubblicazione in versione.json (con [tutti] nel titolo: a tutti e 4)."""
    import requests
    url = (os.environ.get("URL_APP") or "").rstrip("/")
    if not url:
        return
    r = requests.get(url + "/versione.json", params={"t": int(time.time())}, timeout=10)
    if not r.ok:
        return
    v = r.json()
    m = re.fullmatch(r"noi4-v(\d+)", str(v.get("versione", "")))
    if not m:
        return
    from comune import database
    db = database()
    gia = str((db.collection("sistema").document("aggiornamento").get().to_dict() or {}).get("versione") or "")
    # Mai una versione uguale o più vecchia (es. se il sito torna indietro): solo quelle nuove.
    if re.fullmatch(r"v\d+", gia) and int(gia[1:]) >= int(m.group(1)):
        return
    import aggiornamento
    aggiornamento.annuncia(f"v{m.group(1)}", str(v.get("titolo") or ""), db=db)


PIANIFICATA = dict(timezone="Europe/Rome", region=REGIONE, memory=options.MemoryOption.MB_512, max_instances=1)


@scheduler_fn.on_schedule(schedule="every 5 minutes", timeout_sec=240, **PIANIFICATA)
def notifiche5(event: scheduler_fn.ScheduledEvent) -> None:
    try:
        import notifiche
        notifiche.main()
    except BaseException:
        testo = traceback.format_exc()
        print(testo)
        _scrivi_errore(testo)
        raise
    # L'avviso della versione nuova non deve mai fermare gli altri avvisi.
    try:
        _annuncia_versione()
    except BaseException:
        testo = traceback.format_exc()
        print(testo)
        _scrivi_errore(testo, "annuncio-errore")


# Gli stessi orari dei programmi di GitHub, in ora italiana (su GitHub erano in ora UTC: d'estate un'ora dopo).
@scheduler_fn.on_schedule(schedule="7,37 * * * *", timeout_sec=540, **PIANIFICATA)
def calendari(event: scheduler_fn.ScheduledEvent) -> None:
    _esegui("calendari", "sincronizza_calendari")


@scheduler_fn.on_schedule(schedule="25 6 * * *", timeout_sec=540, **PIANIFICATA)
def libri(event: scheduler_fn.ScheduledEvent) -> None:
    _esegui("libri", "libri")


@scheduler_fn.on_schedule(schedule="5 7 * * 1,4", timeout_sec=540, **PIANIFICATA)
def mostre(event: scheduler_fn.ScheduledEvent) -> None:
    _esegui("mostre", "mostre")


@scheduler_fn.on_schedule(schedule="30 7 * * 1", timeout_sec=540, **PIANIFICATA)
def film(event: scheduler_fn.ScheduledEvent) -> None:
    _esegui("film", "film")


# azione → (programma, nome del dato che prima arrivava dal modulo di GitHub)
AZIONI = {"orario": ("orario", "turni"), "scuola": ("scuola", "orario"), "compiti": ("compiti", "note")}


def _stato():
    from comune import database
    db = database()
    sis = {d.id: d.to_dict() or {} for d in db.collection("sistema").stream()}
    notif = sis.get("notifiche", {})
    return {
        "programmi": sis.get("programmi", {}),
        "errori": {k: v for k, v in sis.items() if k.endswith("-errore")},
        "notifiche_ultimo_giro": notif.get("ultimo"), "notifiche_da": notif.get("da"),
        "versione_avvisata": sis.get("aggiornamento", {}).get("versione"),
    }


@https_fn.on_request(region=REGIONE, secrets=[COMANDO], memory=options.MemoryOption.MB_512, timeout_sec=300, max_instances=1)
def comando(req: https_fn.Request) -> https_fn.Response:
    if req.method != "POST":
        return https_fn.Response("Solo POST.", status=405)
    atteso, dato = COMANDO.value or "", req.headers.get("X-Comando-Token", "")
    if len(atteso) < 32 or not hmac.compare_digest(dato.encode(), atteso.encode()):
        return https_fn.Response("Parola d'ordine sbagliata.", status=403)
    corpo = req.get_json(silent=True) or {}
    azione = corpo.get("azione")
    if azione == "stato":
        return https_fn.Response(json.dumps(_stato(), ensure_ascii=False, default=str), status=200, mimetype="application/json")
    if azione not in AZIONI:
        return https_fn.Response("Azione sconosciuta: orario, scuola, compiti o stato.", status=400)
    modulo, chiave = AZIONI[azione]
    dati = corpo.get("dati")
    testo = dati if isinstance(dati, str) else json.dumps(dati or {}, ensure_ascii=False)
    uscita = io.StringIO()
    try:
        with contextlib.redirect_stdout(uscita):
            importlib.import_module(modulo).main(evento={"inputs": {chiave: testo}})
    except SystemExit as e:
        if e.code not in (None, 0):
            return https_fn.Response(f"{uscita.getvalue()}\nFermato: {e.code}", status=422)
    except Exception:
        return https_fn.Response(uscita.getvalue() + "\n" + traceback.format_exc()[-1500:], status=500)
    return https_fn.Response(uscita.getvalue() or "Fatto.", status=200)
