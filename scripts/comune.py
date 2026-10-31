"""Pezzi in comune ai programmi automatici di NDSZ (girano su GitHub)."""
import calendar
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


def _stesso_giorno(giorno, g):
    """Stesso numero di giorno; se il mese è più corto (31 → aprile, 29 febbraio → anni normali) vale l'ultimo giorno."""
    d = dt.date.fromisoformat(giorno)
    ultimo = calendar.monthrange(d.year, d.month)[1]
    return d.day == min(int(g), ultimo)


def capita(e, giorno):
    """Vero se l'impegno e cade nel giorno 'AAAA-MM-GG' (stesse regole dell'app, app.js capita)."""
    rip = e.get("ripeti") or ""
    d = e.get("d", "")
    if not rip:
        fino = e.get("fino") or ""
        return d <= giorno <= fino if fino > d else d == giorno
    if giorno < d:
        return False
    if rip == "settimanale":
        return dt.date.fromisoformat(giorno).weekday() == dt.date.fromisoformat(d).weekday()
    if rip == "mensile":
        return _stesso_giorno(giorno, d[8:])
    if rip == "annuale":
        return giorno[5:7] == d[5:7] and _stesso_giorno(giorno, d[8:])
    return False
