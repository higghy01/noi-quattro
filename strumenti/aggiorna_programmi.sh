#!/bin/bash
# Installa il pubblicatore di tutte le app (08/11/2026): aggiorna SOLO i programmi (funzioni di Firebase).
# Sito di NDSZ, regole e dati non si toccano. Si lancia UNA volta da Google Cloud Shell (progetto noi-quattro),
# dalla cartella del codice:   bash strumenti/aggiorna_programmi.sh
# Dopo, Claude aggiorna programmi e siti dal cloud da solo (strumenti/pubblica_dal_cloud.py): Cloud Shell non serve più.
# Non contiene chiavi: in Cloud Shell si è già dentro l'account Google di Sasha; la parola d'ordine c'è già.
set -uo pipefail
PROGETTO=noi-quattro
cd "$(dirname "$0")/.."
passo() { echo; echo "=== $1"; }
ferma() { echo; echo "!!! FERMO: $1"; exit 1; }

passo "1/4 Programma di Firebase"
firebase() { npx -y firebase-tools@14.27.0 "$@"; }
firebase --version || ferma "programma di Firebase non funziona"

passo "2/4 Accesso"
if ! firebase projects:list --non-interactive >/dev/null 2>&1; then
  echo "Apri il link che compare, scegli il tuo account Google, copia il codice e incollalo qui."
  firebase login --no-localhost || ferma "accesso non riuscito"
fi
firebase use "$PROGETTO" >/dev/null || ferma "progetto $PROGETTO non trovato"
firebase functions:secrets:access COMANDO_TOKEN >/dev/null 2>&1 || ferma "manca la parola d'ordine (COMANDO_TOKEN): dillo a Claude"

passo "3/4 Programmi"
for f in $(grep -v '^#' strumenti/file_funzioni.txt); do cp "scripts/$f" functions/ || ferma "copia di $f"; done
rm -rf functions/venv
if command -v python3.12 >/dev/null 2>&1; then python3.12 -m venv functions/venv
else pip install -q --user uv && ~/.local/bin/uv venv --seed --python 3.12 functions/venv; fi || ferma "Python 3.12 non disponibile"
functions/venv/bin/pip install -q -r functions/requirements.txt || ferma "librerie delle funzioni"

passo "4/4 Pubblicazione dei programmi"
firebase deploy --only functions --non-interactive --force || ferma "pubblicazione non riuscita (vedi sopra)"
echo
echo "##############################################################"
echo "  FATTO: pubblicatore installato. Puoi chiudere Cloud Shell."
echo "##############################################################"
