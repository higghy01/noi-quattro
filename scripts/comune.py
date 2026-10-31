"""Pezzi in comune ai programmi automatici di Noi quattro (girano su GitHub)."""
import datetime as dt
import json
import os
from zoneinfo import ZoneInfo

import firebase_admin
from firebase_admin import credentials, firestore

ROMA = ZoneInfo("Europe/Rome")


def database():
    """Collega il database con la chiave dell'account di servizio (segreto FIREBASE_CHIAVE su GitHub)."""
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(os.environ["FIREBASE_CHIAVE"])))
    return firestore.client()


def adesso():
    return dt.datetime.now(ROMA)


def capita(e, giorno):
    """Vero se l'impegno e cade nel giorno 'AAAA-MM-GG' (stesse regole dell'app)."""
    rip = e.get("ripeti") or ""
    d = e.get("d", "")
    if not rip:
        return d == giorno
    if giorno < d:
        return False
    if rip == "settimanale":
        return dt.date.fromisoformat(giorno).weekday() == dt.date.fromisoformat(d).weekday()
    if rip == "mensile":
        return giorno[8:] == d[8:]
    if rip == "annuale":
        return giorno[5:] == d[5:]
    return False
