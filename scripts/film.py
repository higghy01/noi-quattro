"""Film per la Bacheca > Film (Sasha, 04/11/2026): una parte Cinema e una parte Streaming (HBO Max, Netflix, Prime Video).
Gira una volta a settimana, il lunedì mattina (workflow "Film"; Sasha: "solo una volta alla settimana").

Cinema: il calendario delle uscite di ComingSoon.it (settimane passate e prossime) → info/film, campo l.
Streaming: TMDB (servizio gratuito con chiave, segreto TMDB_CHIAVE su GitHub): film e serie recenti e popolari
che in Italia sono inclusi nell'abbonamento di quei servizi → campo s; quelli che non c'erano la settimana prima
sono le novità (campo "dal"). Senza chiave la parte Streaming resta com'è (si aggiungono i titoli a mano dall'app).
I titoli restano 120 giorni (così "Da vedere" non sparisce). Se una fonte non risponde o cambia forma, resta
l'elenco di prima: meglio vecchio che vuoto. I voti di ognuno sono nella raccolta "film", li scrive l'app.
"""
import datetime as dt
import html
import os
import re
import sys
import time

import requests

UA = {"User-Agent": "Mozilla/5.0 (app di famiglia NDSZ; un controllo al giorno)"}
BASE = "https://www.comingsoon.it"
SETTIMANE = range(-28, 50, 7)  # da 4 settimane fa a 7 settimane avanti
TIENI = 120  # giorni dopo l'uscita


def pulisci(x):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", x or "")).split())


def scarica(url):
    for prova in range(3):
        try:
            r = requests.get(url, headers=UA, timeout=30)
            r.raise_for_status()
            return r.text
        except requests.RequestException as e:
            if prova == 2:
                raise
            print(f"{url}: riprovo ({type(e).__name__})")
            time.sleep(5 * (prova + 1))


def leggi(pagina):
    """Le schede dei film di una pagina del calendario."""
    out = []
    for m in re.finditer(r'<a href="(/film/[^"]+/(\d+)/scheda/)" title="([^"]*)" class="cards[^"]*"(.*?)</a>', pagina, re.S):
        link, fid, titolo, c = m.groups()
        campo = lambda n: pulisci((re.search(rf"<b>{n}:</b>\s*<span>(.*?)</span>", c, re.S) or [None, ""])[1])
        uscita = campo("Uscita")
        try:
            d = dt.datetime.strptime(uscita, "%d/%m/%Y").date().isoformat()
        except ValueError:
            continue
        img = re.search(r'data-src="([^"]+)"', c)
        out.append({"id": "cs-" + fid, "t": pulisci(titolo)[:90], "gen": campo("Genere")[:60], "reg": campo("Regia")[:60],
                    "d": d, "img": img.group(1) if img and img.group(1).startswith("https://") else "", "link": BASE + link})
    return out


def prendi():
    """I film di tutte le settimane e se le pagine si sono lette tutte (serve per togliere i film rinviati)."""
    film, tutte = {}, True
    for r in SETTIMANE:
        try:
            for x in leggi(scarica(f"{BASE}/cinema/calendariouscite/?r={r}")):
                film[x["id"]] = x
        except requests.RequestException as e:
            tutte = False
            print(f"settimana {r}: non riuscita ({type(e).__name__})")
        time.sleep(1)
    return list(film.values()), tutte


TMDB = "https://api.themoviedb.org/3"
SERVIZI = {"netflix": "Netflix", "amazon prime video": "Prime Video", "hbo max": "HBO Max", "max": "HBO Max"}


def tmdb(percorso, **p):
    for prova in range(3):
        try:
            r = requests.get(TMDB + percorso, params=dict(p, api_key=os.environ["TMDB_CHIAVE"], language="it-IT"), timeout=30)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as e:
            if prova == 2:
                raise
            print(f"TMDB {percorso}: riprovo ({type(e).__name__})")
            time.sleep(5 * (prova + 1))


def streaming(oggi):
    """Per ogni servizio: i 40 film e le 40 serie più popolari usciti nell'ultimo anno e inclusi nell'abbonamento in Italia."""
    out = {}
    for tipo in ("movie", "tv"):
        servizi = {}
        for x in tmdb(f"/watch/providers/{tipo}", watch_region="IT").get("results", []):
            nome = SERVIZI.get((x.get("provider_name") or "").lower())
            if nome and nome not in servizi.values():
                servizi[x["provider_id"]] = nome
        generi = {g["id"]: g["name"] for g in tmdb(f"/genre/{tipo}/list").get("genres", [])}
        # Per le serie conta quando è andato in onda un episodio (così entrano anche le stagioni nuove di serie vecchie).
        data = "primary_release_date" if tipo == "movie" else "air_date"
        for pid, nome in servizi.items():
            for pagina in (1, 2):
                r = tmdb(f"/discover/{tipo}", watch_region="IT", with_watch_providers=pid, with_watch_monetization_types="flatrate",
                         sort_by="popularity.desc", page=pagina, **{f"{data}.gte": (oggi - dt.timedelta(days=365)).isoformat()})
                for x in r.get("results", []):
                    xid = f"tm-{tipo[0]}{x['id']}"
                    if xid in out:
                        continue
                    out[xid] = {"id": xid, "t": (x.get("title") or x.get("name") or "")[:90], "tipo": "film" if tipo == "movie" else "serie",
                                "dove": nome, "gen": ", ".join(generi.get(g, "") for g in x.get("genre_ids", [])[:3] if generi.get(g))[:60],
                                "anno": (x.get("release_date") or x.get("first_air_date") or "")[:4],
                                "img": f"https://image.tmdb.org/t/p/w185{x['poster_path']}" if x.get("poster_path") else "",
                                "link": f"https://www.themoviedb.org/{tipo}/{x['id']}/watch?locale=IT"}
                time.sleep(0.3)
    return list(out.values())


def main():
    if "--prova" in sys.argv:  # solo stampa, senza database
        for x in sorted(prendi()[0], key=lambda x: x["d"]):
            print(x["d"], x["t"], "·", x["gen"], "·", x["reg"], "·", "foto" if x["img"] else "senza foto")
        return
    if not os.environ.get("FIREBASE_CHIAVE"):
        print("Chiave di Firebase non ancora inserita: niente da fare.")
        return
    from comune import adesso, database
    db = database()
    ref = db.collection("info").document("film")
    vecchio = ref.get().to_dict() or {}
    prima = {x["id"]: x for x in vecchio.get("l") or []}
    ora = adesso()
    limite = (ora.date() - dt.timedelta(days=TIENI)).isoformat()
    nuovi, tutte = prendi()
    if len(nuovi) < 5:
        print(f"Trovati solo {len(nuovi)} film: il sito forse è cambiato, tengo anche quelli di prima.")
    elif tutte:
        # Un film di prima con la data dentro le settimane appena lette, ma che non c'è più, è stato rinviato o tolto:
        # se restasse con la data vecchia comparirebbe come "Appena uscito" senza esserlo. Se torna, torna con i suoi voti.
        letti = {x["id"] for x in nuovi}
        dal, al = min(x["d"] for x in nuovi), max(x["d"] for x in nuovi)
        via = [i for i, x in prima.items() if i not in letti and dal <= x.get("d", "") <= al]
        for i in via:
            del prima[i]
        if via:
            print(f"Cinema: {len(via)} film rinviati o tolti dal calendario.")
    prima.update({x["id"]: x for x in nuovi})
    elenco = sorted((x for x in prima.values() if x.get("d", "") >= limite), key=lambda x: x["d"])
    print(f"Cinema: {len(nuovi)} film letti, {len(elenco)} nell'elenco.")
    # Streaming: chi c'era già tiene la data in cui è comparso ("dal"); i nuovi prendono quella di oggi.
    st_prima = {x["id"]: x for x in vecchio.get("s") or []}
    st = list(st_prima.values())
    if os.environ.get("TMDB_CHIAVE"):
        try:
            letti = streaming(ora.date())
            primo_giro = not st_prima
            oggi = ora.date().isoformat()
            for x in letti:
                vecchio_x = st_prima.get(x["id"], {})
                # "Novità" solo per chi compare dopo il primo giro; chi c'era già tiene la sua data, anche vuota (primo giro).
                x["dal"] = vecchio_x.get("dal", "") if x["id"] in st_prima else ("" if primo_giro else oggi)
                x["primo"] = vecchio_x.get("primo") or oggi  # quando l'abbiamo visto la prima volta: tiene il titolo 120 giorni
            visti = {x["id"] for x in letti}
            # Chi esce dai più popolari resta 120 giorni dalla prima volta (così chi l'ha segnato 👀 lo ritrova).
            tenuti = [x for x in st_prima.values() if x["id"] not in visti]
            for x in tenuti:  # anche chi non ha ancora "primo" (titoli di prima della v83) prende una data, così prima o poi esce
                x["primo"] = x.get("primo") or x.get("dal") or oggi
            st = letti + [x for x in tenuti if x["primo"] >= limite]
            print(f"Streaming: {len(letti)} titoli, {sum(1 for x in letti if x['dal'] == ora.date().isoformat())} nuovi.")
        except Exception as e:  # lo streaming non deve fermare il cinema
            stato = getattr(getattr(e, "response", None), "status_code", "")  # niente testo dell'errore: l'indirizzo contiene la chiave
            print(f"Streaming: non riuscito ({type(e).__name__} {stato}), tengo quello di prima")
    else:
        print("Streaming: chiave TMDB non ancora inserita, salto.")
    ref.set({"agg": int(ora.timestamp() * 1000), "l": elenco, "s": st})
    if not nuovi:
        # Il sito non ha dato nessun film: l'elenco di prima resta, ma il programma risulta fallito così GitHub avvisa.
        raise SystemExit("Cinema: nessun film letto da ComingSoon (sito cambiato o non raggiungibile).")


if __name__ == "__main__":
    main()
