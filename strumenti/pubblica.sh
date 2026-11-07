#!/bin/bash
# Pubblica NDSZ su Firebase, senza GitHub (07/11/2026): sito, funzioni (avvisi e programmi), regole del database.
# Si lancia da Google Cloud Shell (console.cloud.google.com, progetto noi-quattro), dalla cartella del codice:
#   bash strumenti/pubblica.sh "Titolo della novità"        (con [tutti] nel titolo l'avviso va a tutti e 4)
# Non contiene chiavi: in Cloud Shell si è già dentro l'account Google di Sasha.
set -uo pipefail
PROGETTO=noi-quattro
SECCHIO=gs://noi-quattro.firebasestorage.app
cd "$(dirname "$0")/.."
passo() { echo; echo "=== $1"; }
ferma() { echo; echo "!!! FERMO: $1"; exit 1; }

passo "1/8 Programma di Firebase"
# Stessa versione usata finora su GitHub per le funzioni.
firebase() { npx -y firebase-tools@14.27.0 "$@"; }
firebase --version || ferma "programma di Firebase non funziona"

passo "2/8 Accesso"
if ! firebase projects:list --non-interactive >/dev/null 2>&1; then
  echo "Apri il link che compare, scegli il tuo account Google, copia il codice e incollalo qui."
  firebase login --no-localhost || ferma "accesso non riuscito"
fi
firebase use "$PROGETTO" >/dev/null || ferma "progetto $PROGETTO non trovato"

# I servizi di Google che servono (se sono già accesi non cambia niente). Se compare "Autorizza Cloud Shell", premere Autorizza.
gcloud services enable firebasehosting.googleapis.com cloudfunctions.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com cloudscheduler.googleapis.com pubsub.googleapis.com eventarc.googleapis.com \
  secretmanager.googleapis.com firebaserules.googleapis.com --project "$PROGETTO" >/dev/null 2>&1 || echo "(servizi: ci pensa il passo 8)"

passo "3/8 Versione e titolo"
VERSIONE=$(grep -o "noi4-v[0-9]*" sw.js | head -1)
[ -n "$VERSIONE" ] || ferma "versione non trovata in sw.js"
python3 -c 'import json,sys; json.dump({"versione": sys.argv[1], "titolo": sys.argv[2]}, open("versione.json","w"), ensure_ascii=False)' "$VERSIONE" "${1:-}"
echo "Versione: $VERSIONE"

passo "4/8 Programmi automatici (funzioni)"
cp scripts/notifiche.py scripts/comune.py scripts/sincronizza_calendari.py scripts/libri.py scripts/mostre.py \
   scripts/film.py scripts/orario.py scripts/scuola.py scripts/compiti.py scripts/aggiornamento.py scripts/pubblica_sito.py functions/ || ferma "copia dei programmi"
# Le funzioni girano con Python 3.12: serve lo stesso qui (se manca, lo scarica uv).
rm -rf functions/venv
if command -v python3.12 >/dev/null 2>&1; then python3.12 -m venv functions/venv
else pip install -q --user uv && ~/.local/bin/uv venv --seed --python 3.12 functions/venv; fi || ferma "Python 3.12 non disponibile"
functions/venv/bin/pip install -q -r functions/requirements.txt || ferma "librerie delle funzioni"

passo "5/8 Parola d'ordine per i thread di Claude (solo la prima volta)"
if firebase functions:secrets:access COMANDO_TOKEN >/dev/null 2>&1; then
  echo "C'è già."
else
  TOKEN=$(openssl rand -hex 32)
  printf "%s" "$TOKEN" | firebase functions:secrets:set COMANDO_TOKEN --data-file=- >/dev/null || ferma "parola d'ordine non salvata"
  echo "Salvata nei segreti di Firebase. Quando un thread di Claude te la chiede (con il modulo sicuro, mai in chat),"
  echo "la ritrovi così:  firebase functions:secrets:access COMANDO_TOKEN"
fi

passo "6/8 Catalogo LEGO per i Regali"
python3 strumenti/catalogo_lego.py lego/catalog.json || echo "(catalogo LEGO non preparato: la ricerca dei set resta come prima)"

passo "7/8 Spazio foto: il tasto Scarica funziona anche dal sito nuovo"
gsutil cors set strumenti/cors.json "$SECCHIO" || echo "(non riuscito: il tasto Scarica potrebbe non andare)"

passo "8/8 Pubblicazione"
bash strumenti/prepara_sito.sh || ferma "sito non preparato"
# La prima volta il sito su Firebase non c'è ancora: si crea (indirizzo https://noi-quattro.web.app).
firebase hosting:sites:get "$PROGETTO" >/dev/null 2>&1 || firebase hosting:sites:create "$PROGETTO" --non-interactive || true
firebase deploy --only hosting,functions,firestore:rules,storage --non-interactive --force || ferma "pubblicazione non riuscita (vedi sopra)"
sleep 5
ONLINE=$(curl -s "https://$PROGETTO.web.app/versione.json?t=$(date +%s)" | grep -o "noi4-v[0-9]*")
[ "$ONLINE" = "$VERSIONE" ] || ferma "il sito non risponde ancora con $VERSIONE (risponde: ${ONLINE:-niente})"
echo
echo "##############################################################"
echo "  FATTO: https://$PROGETTO.web.app  (versione $VERSIONE)"
echo "##############################################################"
# Da qui in poi Claude pubblica da solo dal cloud (funzione "pubblica"): gli serve la parola d'ordine, una volta sola.
echo
echo "Parola d'ordine per Claude (incollala SOLO nel modulo sicuro che Claude ti apre, mai in chat):"
firebase functions:secrets:access COMANDO_TOKEN 2>/dev/null || echo "(non trovata: dillo a Claude)"
echo
echo "Quando l'hai incollata nel modulo, puoi chiudere Cloud Shell."
