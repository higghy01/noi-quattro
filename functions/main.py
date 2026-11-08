"""Funzioni di Firebase di NDSZ: tutto quello che gira da solo, senza GitHub (07/11/2026).

- notifiche5: ogni 5 minuti gli avvisi (scripts/notifiche.py; scelta di Sasha del 02/11/2026) e, se il sito ha una
  versione nuova (versione.json), l'avviso "NDSZ aggiornata" (scripts/aggiornamento.py).
- calendari, libri, mostre, film: i programmi che prima giravano su GitHub, agli stessi orari ma in ora italiana.
- comando: per i thread di Claude (orario di lavoro, orario scolastico, note di scuola, stato dei programmi), con una
  parola d'ordine segreta (COMANDO_TOKEN, nei segreti di Firebase). Prima erano i workflow "a mano" di GitHub.
- pubblica: il pubblicatore di tutte le app (dal 08/11/2026): Claude pubblica dal cloud NDSZ e le altre app (ognuna
  col suo sito su Firebase Hosting), di base su un canale di prova, sul sito vero solo con canale=live; aggiorna anche
  il codice di questi programmi, così Cloud Shell non serve più (scripts/pubblica_sito.py).
- programmi: ogni 5 minuti lancia i programmi delle altre app quando è la loro ora (tabella PROGRAMMI): per aggiungerne
  uno basta aggiornare il codice dal cloud, senza creare funzioni nuove.
I file di scripts/ li copia qui lo script di pubblicazione (strumenti/pubblica.sh): la fonte resta una sola.
Se qualcosa va storto, l'errore si scrive in sistema/<nome>-errore (con una chiamata web semplice, che funziona anche
se il collegamento al database del programma è rotto) e si vede con comando "stato".
"""
import contextlib
import datetime as dt
import hashlib
import hmac
import importlib
import io
import json
import os
import re
import time
import traceback

from firebase_functions import https_fn, options, scheduler_fn
from firebase_functions.params import SecretParam

REGIONE = "europe-west1"
COMANDO = SecretParam("COMANDO_TOKEN")


def _scrivi_errore(testo, doc="notifiche-errore"):
    try:
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        cred, progetto = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        progetto = progetto or os.environ.get("GCLOUD_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
        quando = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        AuthorizedSession(cred).patch(
            f"https://firestore.googleapis.com/v1/projects/{progetto}/databases/(default)/documents/sistema/{doc}",
            json={"fields": {"quando": {"stringValue": quando}, "errore": {"stringValue": testo[-1500:]}}}, timeout=20)
    except Exception:
        print("Non riesco nemmeno a scrivere l'errore:", traceback.format_exc())


def _segna(nome, esito):
    """Ultimo giro di ogni programma in sistema/programmi (si legge con comando "stato")."""
    try:
        from comune import database
        quando = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        database().collection("sistema").document("programmi").set({nome: {"quando": quando, "esito": esito}}, merge=True)
    except Exception:
        print("Non riesco a segnare il giro:", traceback.format_exc())


def _esegui(nome, modulo, **kw):
    """Lancia scripts/<modulo>.py come faceva GitHub. Un SystemExit senza errore (es. "niente da fare") va bene."""
    try:
        importlib.import_module(modulo).main(**kw)
    except SystemExit as e:
        if e.code not in (None, 0):
            testo = f"{nome}: uscito con {e.code}"
            print(testo)
            _scrivi_errore(testo, f"{nome}-errore")
            _segna(nome, "errore")
            raise RuntimeError(testo)
    except BaseException:
        testo = traceback.format_exc()
        print(testo)
        _scrivi_errore(testo, f"{nome}-errore")
        _segna(nome, "errore")
        raise
    _segna(nome, "ok")


def _annuncia_versione():
    """Se il sito ha una versione più nuova di quella già avvisata, manda "NDSZ aggiornata" (una volta sola).
    La versione e il titolo li scrive lo script di pubblicazione in versione.json (con [tutti] nel titolo: a tutti e 4)."""
    import requests
    url = (os.environ.get("URL_APP") or "").rstrip("/")
    if not url:
        return
    r = requests.get(url + "/versione.json", params={"t": int(time.time())}, timeout=10)
    if not r.ok:
        return
    v = r.json()
    m = re.fullmatch(r"noi4-v(\d+)", str(v.get("versione", "")))
    if not m:
        return
    from comune import database
    db = database()
    gia = str((db.collection("sistema").document("aggiornamento").get().to_dict() or {}).get("versione") or "")
    # Mai una versione uguale o più vecchia (es. se il sito torna indietro): solo quelle nuove.
    if re.fullmatch(r"v\d+", gia) and int(gia[1:]) >= int(m.group(1)):
        return
    import aggiornamento
    aggiornamento.annuncia(f"v{m.group(1)}", str(v.get("titolo") or ""), db=db)


PIANIFICATA = dict(timezone="Europe/Rome", region=REGIONE, memory=options.MemoryOption.MB_512, max_instances=1)


@scheduler_fn.on_schedule(schedule="every 5 minutes", timeout_sec=240, **PIANIFICATA)
def notifiche5(event: scheduler_fn.ScheduledEvent) -> None:
    try:
        import notifiche
        notifiche.main()
    except BaseException:
        testo = traceback.format_exc()
        print(testo)
        _scrivi_errore(testo)
        raise
    # L'avviso della versione nuova non deve mai fermare gli altri avvisi.
    try:
        _annuncia_versione()
    except BaseException:
        testo = traceback.format_exc()
        print(testo)
        _scrivi_errore(testo, "annuncio-errore")


# Gli stessi orari dei programmi di GitHub, in ora italiana (su GitHub erano in ora UTC: d'estate un'ora dopo).
@scheduler_fn.on_schedule(schedule="7,37 * * * *", timeout_sec=540, **PIANIFICATA)
def calendari(event: scheduler_fn.ScheduledEvent) -> None:
    _esegui("calendari", "sincronizza_calendari")


@scheduler_fn.on_schedule(schedule="25 6 * * *", timeout_sec=540, **PIANIFICATA)
def libri(event: scheduler_fn.ScheduledEvent) -> None:
    _esegui("libri", "libri")


@scheduler_fn.on_schedule(schedule="5 7 * * 1,4", timeout_sec=540, **PIANIFICATA)
def mostre(event: scheduler_fn.ScheduledEvent) -> None:
    _esegui("mostre", "mostre")


@scheduler_fn.on_schedule(schedule="30 7 * * 1", timeout_sec=540, **PIANIFICATA)
def film(event: scheduler_fn.ScheduledEvent) -> None:
    _esegui("film", "film")


# azione → (programma, nome del dato che prima arrivava dal modulo di GitHub)
AZIONI = {"orario": ("orario", "turni"), "scuola": ("scuola", "orario"), "compiti": ("compiti", "note")}


def _token_giusto(req):
    atteso, dato = COMANDO.value or "", req.headers.get("X-Comando-Token", "")
    return len(atteso) >= 32 and hmac.compare_digest(dato.encode(), atteso.encode())


def _stato():
    from comune import database
    db = database()
    sis = {d.id: d.to_dict() or {} for d in db.collection("sistema").stream()}
    notif = sis.get("notifiche", {})
    return {
        "programmi": sis.get("programmi", {}),
        "errori": {k: v for k, v in sis.items() if k.endswith("-errore")},
        "notifiche_ultimo_giro": notif.get("ultimo"), "notifiche_da": notif.get("da"),
        "versione_avvisata": sis.get("aggiornamento", {}).get("versione"),
        "app": {n: a.get("sito") for n, a in (sis.get("pubblicatore", {}).get("app") or {}).items()},
    }


@https_fn.on_request(region=REGIONE, secrets=[COMANDO], memory=options.MemoryOption.MB_512, timeout_sec=300, max_instances=1)
def comando(req: https_fn.Request) -> https_fn.Response:
    if req.method != "POST":
        return https_fn.Response("Solo POST.", status=405)
    if not _token_giusto(req):
        return https_fn.Response("Parola d'ordine sbagliata.", status=403)
    corpo = req.get_json(silent=True) or {}
    azione = corpo.get("azione")
    if azione == "stato":
        return https_fn.Response(json.dumps(_stato(), ensure_ascii=False, default=str), status=200, mimetype="application/json")
    if azione not in AZIONI:
        return https_fn.Response("Azione sconosciuta: orario, scuola, compiti o stato.", status=400)
    modulo, chiave = AZIONI[azione]
    dati = corpo.get("dati")
    testo = dati if isinstance(dati, str) else json.dumps(dati or {}, ensure_ascii=False)
    uscita = io.StringIO()
    try:
        with contextlib.redirect_stdout(uscita):
            importlib.import_module(modulo).main(evento={"inputs": {chiave: testo}})
    except SystemExit as e:
        if e.code not in (None, 0):
            return https_fn.Response(f"{uscita.getvalue()}\nFermato: {e.code}", status=422)
    except Exception:
        return https_fn.Response(uscita.getvalue() + "\n" + traceback.format_exc()[-1500:], status=500)
    return https_fn.Response(uscita.getvalue() or "Fatto.", status=200)


def _registro():
    """Le app del pubblicatore: {nome: {"sito": ..., "impronta": sha256 della chiave dell'app, ...}}."""
    from comune import database
    return (database().collection("sistema").document("pubblicatore").get().to_dict() or {}).get("app") or {}


def _salva_app(nome, dati):
    from comune import database
    database().collection("sistema").document("pubblicatore").set({"app": {nome: dati}}, merge=True)


def _chiave_app_giusta(req, app):
    """La chiave propria di un'app (intestazione X-Chiave-App): vale solo per pubblicare il sito di quell'app."""
    dato = req.headers.get("X-Chiave-App", "")
    if len(dato) < 32:
        return False
    try:
        impronta = str((_registro().get(app) or {}).get("impronta") or "")
    except Exception:
        print("Chiave dell'app non controllata:", traceback.format_exc())
        return False
    return len(impronta) == 64 and hmac.compare_digest(hashlib.sha256(dato.encode()).hexdigest(), impronta)


def _adesso_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


MAX_PACCHETTO = 25 * 1024 * 1024


def _pacchetto(req, ps):
    dati = req.get_data(cache=False)
    if not dati or len(dati) > MAX_PACCHETTO:
        raise ps.Rifiutato("pacchetto vuoto o troppo grande")
    return dati


def canale_di(req):
    return (req.args.get("canale") or "prova").strip().lower()


def _pubblica_sito(req, ps, s, progetto, app):
    dati = _pacchetto(req, ps)
    canale = canale_di(req)
    titolo = (req.args.get("titolo") or "").strip()
    if app == "ndsz":
        sito, regole = ps.leggi_pacchetto(dati)
        if regole and canale != "live":
            raise ps.Rifiutato("le regole si pubblicano solo col canale live")
        esito = {"regole": []}
        if regole:  # prima le regole: se non vanno, il sito resta com'era
            esito["regole"] = ps.pubblica_regole(s, progetto, os.environ.get("SECCHIO") or f"{progetto}.firebasestorage.app", regole)
        esito.update(ps.pubblica_sito(s, progetto, sito, canale, titolo))
        _segna(f"pubblica-{canale}", "ok")
        return esito
    dati_app = _registro().get(app)
    if not dati_app or not dati_app.get("sito"):
        raise ps.Rifiutato(f"l'app {app} non è registrata (azione=app)")
    if dati_app["sito"] == progetto:  # mai il sito di NDSZ con la chiave o il nome di un'altra app
        raise ps.Rifiutato("quel sito è di NDSZ")
    esito = ps.pubblica_sito(s, dati_app["sito"], ps.leggi_pacchetto_app(dati), canale, titolo, ps.INTESTAZIONI_APP)
    esito["app"] = app
    _segna(f"pubblica-{app}-{canale}", "ok")
    return esito


def _registra_app(req, ps, s, progetto):
    corpo = req.get_json(silent=True) or {}
    nome, sito_id = str(corpo.get("app") or "").strip().lower(), str(corpo.get("sito") or "").strip().lower()
    if not ps.NOME_APP.fullmatch(nome) or nome == "ndsz":
        raise ps.Rifiutato("nome dell'app non valido")
    if sito_id == progetto:
        raise ps.Rifiutato("quel sito è di NDSZ")
    reg = _registro()
    if nome in reg and reg[nome].get("sito") and reg[nome]["sito"] != sito_id:
        raise ps.Rifiutato(f"{nome} ha già il sito {reg[nome]['sito']}")
    altra = [n for n, a in reg.items() if n != nome and a.get("sito") == sito_id]
    if altra:
        raise ps.Rifiutato(f"il sito {sito_id} è già di {altra[0]}")
    esito = ps.crea_sito(s, progetto, sito_id)
    _salva_app(nome, {"sito": sito_id, "registrata": _adesso_iso()})  # subito: se il resto non va, si riprova
    esito["versioni"] = ps.limita_versioni(s, sito_id, corpo.get("versioni", 10))
    return dict(esito, app=nome)


def _chiave_app(req, ps):
    corpo = req.get_json(silent=True) or {}
    nome, impronta = str(corpo.get("app") or "").strip().lower(), str(corpo.get("impronta") or "").strip().lower()
    if nome not in _registro():
        raise ps.Rifiutato(f"l'app {nome} non è registrata")
    if not re.fullmatch(r"[0-9a-f]{64}", impronta):
        raise ps.Rifiutato("l'impronta deve essere lo sha256 della chiave (64 caratteri esadecimali)")
    _salva_app(nome, {"impronta": impronta, "chiave_dal": _adesso_iso()})
    return {"app": nome, "chiave": "salvata"}


@https_fn.on_request(region=REGIONE, secrets=[COMANDO], memory=options.MemoryOption.GB_1, timeout_sec=540, max_instances=1)
def pubblica(req: https_fn.Request) -> https_fn.Response:
    """Il pubblicatore di tutte le app. Sempre POST, con ?azione= (di base "sito"):
    - sito: zip dei file del sito; ?app=ndsz (di base) o un'app registrata, &canale=prova|live&titolo=...
      Con la parola d'ordine: tutte le app (per NDSZ anche le regole, solo live). Con la chiave di un'app
      (intestazione X-Chiave-App): solo il sito di quell'app, nient'altro.
    - app: JSON {"app": nome, "sito": nome del sito, "versioni": 10} registra un'app e crea il suo sito.
    - chiave: JSON {"app": nome, "impronta": sha256 della chiave} la chiave propria di un'app (per il thread che la aggiorna).
    - elenco: le app registrate.
    - funzioni: zip del codice dei programmi (?solo=a,b; "pubblica" solo con &anche_pubblica=1).
    - funzioni-stato: come stanno i programmi dopo l'aggiornamento.
    Tutto tranne "sito con la chiave dell'app" vuole la parola d'ordine (COMANDO_TOKEN)."""
    if req.method != "POST":
        return https_fn.Response("Solo POST.", status=405)
    azione = (req.args.get("azione") or "sito").strip().lower()
    app = (req.args.get("app") or "ndsz").strip().lower()
    import pubblica_sito as ps
    # Con la chiave di un'app si fa SOLO quello che quella chiave permette, anche se la richiesta porta pure la parola
    # d'ordine (per esempio aggiunta dalla rete della sessione): così la chiave isola davvero (revisione 08/11).
    con_chiave = "X-Chiave-App" in req.headers
    padrone = False
    try:
        if con_chiave:
            if azione != "sito" or app == "ndsz" or not ps.NOME_APP.fullmatch(app) or not _chiave_app_giusta(req, app):
                return https_fn.Response("Parola d'ordine sbagliata.", status=403)
        elif not _token_giusto(req):
            return https_fn.Response("Parola d'ordine sbagliata.", status=403)
        else:
            padrone = True
        import google.auth
        from google.auth.transport.requests import AuthorizedSession
        cred, progetto = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
        progetto = progetto or os.environ.get("GCLOUD_PROJECT") or os.environ.get("GOOGLE_CLOUD_PROJECT")
        s = AuthorizedSession(cred)
        if azione == "sito":
            esito = _pubblica_sito(req, ps, s, progetto, app)
        elif azione == "app":
            esito = _registra_app(req, ps, s, progetto)
        elif azione == "chiave":
            esito = _chiave_app(req, ps)
        elif azione == "elenco":
            esito = {n: {"sito": a.get("sito"), "url": f"https://{a.get('sito')}.web.app", "chiave": bool(a.get("impronta"))}
                     for n, a in _registro().items()}
        elif azione == "funzioni":
            solo = [x.strip() for x in (req.args.get("solo") or "").split(",") if x.strip()]
            anche = (req.args.get("anche_pubblica") or "").lower() in ("1", "si", "true")
            esito = ps.aggiorna_funzioni(s, progetto, REGIONE, _pacchetto(req, ps), solo or None, anche)
            _segna("aggiorna-funzioni", "inviato")
        elif azione == "funzioni-stato":
            esito = ps.stato_funzioni(s, progetto, REGIONE)
        else:
            raise ps.Rifiutato("azione sconosciuta: sito, app, chiave, elenco, funzioni o funzioni-stato")
        return https_fn.Response(json.dumps(esito, ensure_ascii=False), status=200, mimetype="application/json")
    except ps.Rifiutato as e:
        return https_fn.Response(f"Non pubblicato: {e}", status=400)
    except Exception:
        testo = traceback.format_exc()
        print(testo)
        _scrivi_errore(testo, "pubblica-errore")
        _segna(f"pubblica-{canale_di(req)}" if (app, azione) == ("ndsz", "sito") else f"pubblica-{app}-{azione}", "errore")
        # Il dettaglio solo a chi ha la parola d'ordine; agli altri basta sapere dov'è scritto.
        return https_fn.Response("Non pubblicato: " + (testo[-800:] if padrone else "errore interno (in sistema/pubblica-errore)"), status=500)


# Programmi delle altre app (08/11/2026). Si aggiungono qui e si aggiornano dal cloud (azione=funzioni), senza Cloud
# Shell: nome → (orario come in cron, in ORA ITALIANA: "minuto ora giorno mese giorno-della-settimana", modulo in scripts/).
# Esempio: "rigo-promemoria": ("0 * * * *", "rigo_promemoria"). Ogni programma gira al massimo una volta per orario;
# dopo un buco recupera solo l'ultima ora. Nella notte del cambio d'ora gli orari tra le 2 e le 3 possono saltare o
# (se non sono gli stessi minuti) ripetersi: meglio non metterci programmi.
PROGRAMMI = {}
LIMITI_CRON = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 7))


def _insieme(espr, minimo, massimo):
    valori = set()
    for parte in espr.split(","):
        m = re.fullmatch(r"(\*|\d+(?:-\d+)?)(?:/(\d+))?", parte)
        if not m:
            raise ValueError(f"campo non valido: {espr!r}")
        base, passo = m.group(1), int(m.group(2) or 1)
        if base == "*":
            a, b = minimo, massimo
        elif "-" in base:
            a, b = (int(x) for x in base.split("-", 1))
        else:
            a = int(base)
            b = massimo if m.group(2) else a
        if passo < 1 or not minimo <= a <= b <= massimo:
            raise ValueError(f"campo fuori misura: {espr!r}")
        valori.update(range(a, b + 1, passo))
    return valori


def _cron(cron):
    """Controlla un orario cron (5 campi) e lo trasforma negli insiemi dei valori buoni. Errore se è scritto male."""
    parti = str(cron).split()
    if len(parti) != 5:
        raise ValueError(f"servono 5 campi: {cron!r}")
    ins = [_insieme(p, *lim) for p, lim in zip(parti, LIMITI_CRON)]
    if 7 in ins[4]:
        ins[4].add(0)  # 7 = domenica, come 0
    return ins, not parti[2].startswith("*"), not parti[4].startswith("*")


def _orario_giusto(cron, t):
    (mi, ho, gi, me, gs), gi_scelto, gs_scelto = _cron(cron)
    if t.minute not in mi or t.hour not in ho or t.month not in me:
        return False
    g_ok, s_ok = t.day in gi, (t.isoweekday() % 7) in gs
    return (g_ok or s_ok) if (gi_scelto and gs_scelto) else (g_ok and s_ok)  # come cron: giorno O giorno della settimana


def _da_lanciare(programmi, ultimo, adesso, fatti=None):
    """{nome: orario italiano "AAAA-MM-GGTHH:MM"} dei programmi che hanno avuto la loro ora dopo l'ultimo giro (al
    massimo nell'ultima ora), ognuno una volta, mai due volte per lo stesso orario. ultimo/adesso con fuso orario:
    si conta in UTC e si guarda l'ora italiana solo per gli orari (giusto anche nelle notti del cambio d'ora)."""
    from zoneinfo import ZoneInfo
    roma, utc = ZoneInfo("Europe/Rome"), dt.timezone.utc
    fatti = fatti or {}
    adesso, ultimo = adesso.astimezone(utc), ultimo.astimezone(utc)
    t = max(ultimo, adesso - dt.timedelta(hours=1)).replace(second=0, microsecond=0) + dt.timedelta(minutes=1)
    fine = adesso.replace(second=0, microsecond=0)
    scelti = {}
    while t <= fine:
        loc = t.astimezone(roma)
        chiave = loc.strftime("%Y-%m-%dT%H:%M")
        for nome, (cron, _) in programmi.items():
            if fatti.get(nome) != chiave and _orario_giusto(cron, loc):
                scelti[nome] = chiave
        t += dt.timedelta(minutes=1)
    return scelti


def _programmi_validi():
    """Le voci di PROGRAMMI scritte bene; quelle sbagliate restano fuori senza fermare le altre."""
    buoni, sbagliati = {}, {}
    for nome, voce in PROGRAMMI.items():
        try:
            cron, modulo = voce
            _cron(cron)
            if not re.fullmatch(r"[a-z_][a-z0-9_]*", modulo):
                raise ValueError(f"modulo non valido: {modulo!r}")
            buoni[nome] = (cron, modulo)
        except Exception as e:
            sbagliati[nome] = str(e)
    return buoni, sbagliati


@scheduler_fn.on_schedule(schedule="every 5 minutes", timeout_sec=540, concurrency=1, **PIANIFICATA)
def programmi(event: scheduler_fn.ScheduledEvent) -> None:
    if not PROGRAMMI:
        return
    from comune import database
    buoni, sbagliati = _programmi_validi()
    adesso = dt.datetime.now(dt.timezone.utc)
    doc = database().collection("sistema").document("programmi-altri")
    stato = doc.get().to_dict() or {}
    ultimo = dt.datetime.fromisoformat(stato["ultimo"]) if stato.get("ultimo") else adesso - dt.timedelta(minutes=5)
    scelti = _da_lanciare(buoni, ultimo, adesso, stato.get("fatti") or {})
    # Prima si segna (mai due volte lo stesso orario), poi si lancia.
    doc.set({"ultimo": adesso.isoformat(timespec="seconds"), "fatti": scelti}, merge=True)
    errori = [f"{n}: scritto male ({e})" for n, e in sbagliati.items()]
    if sbagliati:
        _scrivi_errore("; ".join(errori), "programmi-errore")
    for nome in scelti:
        try:
            _esegui(nome, buoni[nome][1])
        except BaseException as e:  # un programma rotto non ferma gli altri (l'errore è già scritto da _esegui)
            errori.append(f"{nome}: {type(e).__name__}")
    if errori:
        raise RuntimeError("; ".join(errori))
