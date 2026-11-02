"""Funzione pianificata di Firebase: ogni 5 minuti lancia il programma delle notifiche (scripts/notifiche.py).

Scelta di Sasha del 02/11/2026: prima girava su GitHub, che a volte parte in ritardo. I file di scripts/ che servono
li copia qui il workflow "Funzioni" prima di pubblicare: la fonte resta una sola.
"""
from firebase_functions import options, scheduler_fn

import notifiche


@scheduler_fn.on_schedule(schedule="every 5 minutes", timezone="Europe/Rome", region="europe-west1",
                          memory=options.MemoryOption.MB_512, timeout_sec=240, max_instances=1)
def notifiche5(event: scheduler_fn.ScheduledEvent) -> None:
    notifiche.main()
