"""Prepara la famiglia nel database (si lancia a mano una volta, o quando cambia qualcosa).

Legge il segreto FAMIGLIA di GitHub, per esempio:
  [{"id": "p1", "nome": "...", "colore": "blu", "email": "..."}, ...]
Colori possibili: rosso, blu, verde, grigio, rosa, ambra, viola, corallo.
Crea l'account di ognuno (senza password: la sceglie dall'app con "Prima volta?"),
la scheda in "persone" (nome, colore, preferenze), il permesso in "membri"
e la "persona" dentro l'accesso (per lo spazio foto).
Non stampa mai email o nomi.
"""
import json
import os

from firebase_admin import auth

from comune import database

# Colori scelti da Sasha il 31/10/2026: valgono sopra quelli del segreto.
COLORI_SCELTI = {"p1": "rosso", "p2": "grigio", "p3": "blu", "p4": "verde"}
VALIDI = {"rosso", "blu", "verde", "grigio", "rosa", "ambra", "viola", "corallo"}
PREF = {"promemoria": True, "nuovi": True, "riepilogo": True, "cena": True, "note": True}


def main():
    db = database()
    famiglia = json.loads(os.environ["FAMIGLIA"])
    for i, p in enumerate(famiglia):
        email = p["email"].strip().lower()
        try:
            utente = auth.get_user_by_email(email)
        except auth.UserNotFoundError:
            utente = auth.create_user(email=email)
        # "persona" dentro l'accesso: serve alle regole dello spazio foto (Storage).
        auth.set_custom_user_claims(utente.uid, {"persona": p["id"]})
        ref = db.collection("persone").document(p["id"])
        vecchio = ref.get().to_dict() or {}
        colore = COLORI_SCELTI.get(p["id"]) or str(p.get("colore", "")).strip().lower()
        if colore not in VALIDI:
            colore = "viola"
        # merge: le scelte fatte nell'app (notifiche, privacy) restano.
        ref.set({"nome": p["nome"], "colore": colore, "ordine": i,
                 "notifiche": vecchio.get("notifiche", PREF)}, merge=True)
        db.collection("membri").document(email).set({"persona": p["id"]})
        print(f"Persona {i + 1} pronta")
    # Chi non è più nell'elenco perde l'accesso.
    valide = {p["email"].strip().lower() for p in famiglia}
    for d in db.collection("membri").stream():
        if d.id not in valide:
            d.reference.delete()
            try:
                auth.set_custom_user_claims(auth.get_user_by_email(d.id).uid, None)
            except auth.UserNotFoundError:
                pass
            print("Tolto un accesso non più in elenco")


if __name__ == "__main__":
    main()
