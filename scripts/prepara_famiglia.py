"""Prepara la famiglia nel database (si lancia a mano una volta, o quando cambia qualcosa).

Legge il segreto FAMIGLIA di GitHub, per esempio:
  [{"id": "p1", "nome": "...", "colore": "blu", "email": "..."}, ...]
Colori possibili: blu, rosa, ambra, verde, viola, corallo.
Crea l'account di ognuno (senza password: la sceglie dall'app con "Prima volta?"),
la scheda in "persone" (nome, colore, preferenze) e il permesso in "membri".
Non stampa mai email o nomi.
"""
import json
import os

from firebase_admin import auth

from comune import database

PREF = {"promemoria": True, "nuovi": True, "riepilogo": True, "cena": True, "note": True}


def main():
    db = database()
    famiglia = json.loads(os.environ["FAMIGLIA"])
    for i, p in enumerate(famiglia):
        email = p["email"].strip().lower()
        try:
            auth.get_user_by_email(email)
        except auth.UserNotFoundError:
            auth.create_user(email=email)
        ref = db.collection("persone").document(p["id"])
        vecchio = ref.get().to_dict() or {}
        ref.set({"nome": p["nome"], "colore": p.get("colore", "viola"), "ordine": i,
                 "notifiche": vecchio.get("notifiche", PREF)})
        db.collection("membri").document(email).set({"persona": p["id"]})
        print(f"Persona {i + 1} pronta")
    # Chi non è più nell'elenco perde l'accesso.
    valide = {p["email"].strip().lower() for p in famiglia}
    for d in db.collection("membri").stream():
        if d.id not in valide:
            d.reference.delete()
            print("Tolto un accesso non più in elenco")


if __name__ == "__main__":
    main()
