"""Funzione pianificata di Firebase: ogni 5 minuti lancia il programma delle notifiche (scripts/notifiche.py).

Scelta di Sasha del 02/11/2026: prima girava su GitHub, che a volte parte in ritardo. I file di scripts/ che servono
li copia qui il workflow "Funzioni" prima di pubblicare: la fonte resta una sola.
Se qualcosa va storto, l'errore si scrive in sistema/notifiche-errore (lo legge il workflow "Controllo notifiche").
"""
import datetime as dt
import traceback

from firebase_functions import options, scheduler_fn

import notifiche
from comune import ROMA, database


@scheduler_fn.on_schedule(schedule="every 5 minutes", timezone="Europe/Rome", region="europe-west1",
                          memory=options.MemoryOption.MB_512, timeout_sec=240, max_instances=1)
def notifiche5(event: scheduler_fn.ScheduledEvent) -> None:
    try:
        notifiche.main()
    except Exception:
        try:
            database().collection("sistema").document("notifiche-errore").set(
                {"quando": dt.datetime.now(ROMA).isoformat(timespec="seconds"), "errore": traceback.format_exc()[-1500:]})
        finally:
            raise
