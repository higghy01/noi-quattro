#!/bin/bash
# Prepara la cartella pubblico/ con SOLO i file del sito (07/11/2026): niente programmi, regole o strumenti online.
# Uso: bash strumenti/prepara_sito.sh   (dalla cartella del codice; lo lancia anche pubblica.sh)
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf pubblico && mkdir -p pubblico
cp index.html stile.css morphdom.js app.js dati.js config.js manifest.json sw.js icona-180.png icona-512.png pubblico/
[ -f versione.json ] && cp versione.json pubblico/
[ -f lego/catalog.json ] && mkdir -p pubblico/lego && cp lego/catalog.json pubblico/lego/
echo "Sito pronto in pubblico/: $(ls pubblico | tr '\n' ' ')"
