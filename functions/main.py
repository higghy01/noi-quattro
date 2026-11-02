"""Funzione pianificata di Firebase: ogni 5 minuti lancia il programma delle notifiche (scripts/notifiche.py).

Scelta di Sasha del 02/11/2026: prima girava su GitHub, che a volte parte in ritardo. I file di scripts/ che servono
li copia qui il workflow "Funzioni" prima di pubblicare: la fonte resta una sola.
Se qualcosa va storto, l'errore si scrive in sistema/notifiche-errore (con una chiamata web semplice, che funziona anche
se il collegamento al database del programma è rotto); lo legge il workflow "Controllo notifiche".
"""
import datetime as dt
import os
import traceback

from firebase_functions import options, scheduler_fn


def _scrivi_errore(testo):
    try:
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        cred, progetto = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        progetto = progetto or os.environ.get("GCLOUD_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
        quando = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        AuthorizedSession(cred).patch(
            f"https://firestore.googleapis.com/v1/projects/{progetto}/databases/(default)/documents/sistema/notifiche-errore",
            json={"fields": {"quando": {"stringValue": quando}, "errore": {"stringValue": testo[-1500:]}}}, timeout=20)
    except Exception:
        print("Non riesco nemmeno a scrivere l'errore:", traceback.format_exc())


@scheduler_fn.on_schedule(schedule="every 5 minutes", timezone="Europe/Rome", region="europe-west1",
                          memory=options.MemoryOption.MB_512, timeout_sec=240, max_instances=1)
def notifiche5(event: scheduler_fn.ScheduledEvent) -> None:
    try:
        import notifiche
        notifiche.main()
    except BaseException:
        testo = traceback.format_exc()
        print(testo)
        _scrivi_errore(testo)
        raise
