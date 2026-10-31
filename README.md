# Noi quattro

App di famiglia: impegni di tutti, "a cena stasera?", bacheca, lista della spesa, calendari collegati e notifiche.
Sito statico (GitHub Pages) + Firebase gratuito. Senza `config.js` compilato parte in modalità prova con dati di esempio.

- `index.html`, `stile.css`, `app.js`, `dati.js`, `config.js`, `sw.js`, `manifest.json`: l'app.
- `firestore.rules`: chi può leggere e scrivere.
- `scripts/` e `.github/workflows/`: famiglia, calendari (ogni 30 min) e notifiche (ogni 15 min).
