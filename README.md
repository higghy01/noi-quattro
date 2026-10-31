# Noi quattro

App di famiglia: impegni di tutti, "a cena stasera?", bacheca, liste dei regali, ricordi (viaggi, pranzi, cinema, feste…) con foto e video originali di tutti, lista della spesa, impostazioni, calendari collegati e notifiche.
Sito statico (GitHub Pages) + Firebase gratuito. Senza `config.js` compilato parte in modalità prova con dati di esempio.

- `index.html`, `stile.css`, `app.js`, `dati.js`, `config.js`, `sw.js`, `manifest.json`: l'app.
- `firestore.rules` e `storage.rules`: chi può leggere e scrivere (dati e foto). Si pubblicano da sole su Firebase (workflow "Regole del database") quando cambiano. Le foto stanno nello spazio Firebase (Storage, piano Blaze).
- `scripts/` e `.github/workflows/`: famiglia, calendari (ogni 30 min) e notifiche (ogni 15 min).
- Calendari: ognuno incolla il link del suo calendario (iCloud "Calendario pubblico" o Google "Indirizzo segreto in formato iCal") in Impostazioni > Il mio calendario. Il link resta in `privati/<persona>`, che legge solo lui; il programma lo copia ogni 30 min e scrive com'è andata in `persone/<id>.calStato`.
