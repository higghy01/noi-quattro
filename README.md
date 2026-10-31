# Noi quattro

App di famiglia: impegni di tutti, "a cena stasera?", bacheca, liste dei regali, lista della spesa, impostazioni, calendari collegati e notifiche.
Sito statico (GitHub Pages) + Firebase gratuito. Senza `config.js` compilato parte in modalità prova con dati di esempio.

- `index.html`, `stile.css`, `app.js`, `dati.js`, `config.js`, `sw.js`, `manifest.json`: l'app.
- `firestore.rules`: chi può leggere e scrivere. Si pubblicano da sole su Firebase (workflow "Regole del database") quando cambiano.
- `scripts/` e `.github/workflows/`: famiglia, calendari (ogni 30 min) e notifiche (ogni 15 min).
