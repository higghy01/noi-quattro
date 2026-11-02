"""Dice quando è girato l'ultima volta il programma delle notifiche e da dove (Firebase o GitHub). Non manda niente."""
import datetime as dt

from comune import ROMA, database

s = database().collection("sistema").document("notifiche").get().to_dict() or {}
quando = dt.datetime.fromtimestamp(s.get("ultimo", 0) / 1000, ROMA)
print(f"Ultimo giro: {quando:%d/%m/%Y %H:%M:%S} (ora italiana), da: {s.get('da', 'sconosciuto')}, avvisi ricordati: {len(s.get('inviati') or {})}")
