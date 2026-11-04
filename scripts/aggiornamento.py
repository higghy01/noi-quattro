"""Avvisa con una notifica breve che NDSZ è stata aggiornata (richiesta del 02/11/2026).

Parte da solo (workflow "Avviso aggiornamento") quando cambia la versione in sw.js su main.
Va solo alle persone in AVVISA (variabile del workflow, es. "p1"); una versione si avvisa una volta sola.
"""
import os
import re

from firebase_admin import messaging

from comune import database

URL_APP = os.environ.get("URL_APP") or "https://higghy01.github.io/noi-quattro/"


def main():
    testo = open("sw.js", encoding="utf-8").read()
    m = re.search(r"VERSIONE\s*=\s*'noi4-v(\d+)'", testo)
    if not m:
        raise SystemExit("Versione non trovata in sw.js")
    versione = f"v{m.group(1)}"
    # Solo la prima riga del messaggio è il titolo: un [tutti] più sotto (es. nell'elenco dei cambi uniti) non conta.
    prima_riga = ((os.environ.get("TITOLO") or "").strip().splitlines() or [""])[0]
    tutti = "[tutti]" in prima_riga
    lista = (os.environ.get("AVVISA_TUTTI") if tutti else None) or os.environ.get("AVVISA") or ""
    chi = [p.strip() for p in lista.split(",") if re.fullmatch(r"p\d{1,2}", p.strip())]
    if not chi:
        raise SystemExit("Nessuno da avvisare (AVVISA)")
    db = database()
    stato = db.collection("sistema").document("aggiornamento")
    if (stato.get().to_dict() or {}).get("versione") == versione:
        print(f"{versione} già avvisata")
        return
    # Il titolo del cambio, senza [tutti] e senza numeri di versione e di PR (in qualunque ordine):
    # "Pranzo e cena (noi4-v81) [tutti] (#92)" → "Pranzo e cena".
    titolo = re.sub(r"\s+", " ", prima_riga.replace("[tutti]", " ")).strip()
    titolo = re.sub(r"(\s*\((noi4-v\d+|v\d+|#\d+)\))+\s*$", "", titolo).strip()
    titolo = titolo if len(titolo) <= 90 else titolo[:89].rstrip() + "…"
    corpo = titolo or "Riapri l'app per vedere le novità."
    mandate = 0
    for d in db.collection("token").where("persona", "in", chi).stream():
        msg = messaging.Message(token=d.id, webpush=messaging.WebpushConfig(
            notification=messaging.WebpushNotification(title=f"NDSZ aggiornata · {versione}", body=corpo,
                                                       icon=URL_APP.rstrip("/") + "/icona-180.png"),
            fcm_options=messaging.WebpushFCMOptions(link=URL_APP)))
        try:
            messaging.send(msg)
            mandate += 1
        except (messaging.UnregisteredError, messaging.SenderIdMismatchError):
            d.reference.delete()
        except Exception as e:
            print(f"Invio non riuscito ({type(e).__name__})")
    stato.set({"versione": versione})
    print(f"Avviso {versione}: {mandate} telefoni")


if __name__ == "__main__":
    main()
