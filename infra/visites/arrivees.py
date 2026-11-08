#!/usr/bin/env python3
"""D'ou arrivent les joueurs de blindz.app : comptes par jour, sans adresse.

Lit les journaux nginx de blindz.app (format combined, .gz compris) et ecrit un
JSON pour l'onglet « Qui joue » de l'administration privee. Lance a chaque
passage de blindz-visites.sh, apres le garde-fou du mot de passe.

Ce qui sort, et rien d'autre :
  - par jour de jeu (heure de Paris, de 6 h a 6 h : une soiree qui finit a
    3 h compte pour la veille) : visites, source d'arrivee, page d'arrivee,
    appareil, imports de playlist reussis ou rates, parties solo, visites
    qui ont joue ou importe sans jouer ;
  - par code de salle et par jour : la source des visiteurs qui l'ont ouverte,
    pour relier une partie de la base a l'endroit d'ou venaient ses joueurs.

Ce qui ne sort jamais : adresse IP (meme tronquee), user agent, parametres
d'adresse (pseudos, liens Spotify), identifiant de visite. Les visites sont
regroupees en memoire par une empreinte de l'adresse et du navigateur, salee
d'une cle tiree au hasard a chaque passage et jamais ecrite.

Historique : les journaux ne gardent que 14 jours. Le fichier d'etat garde les
comptes des jours plus anciens (13 mois, comme le rapport GoAccess) ; un jour
encore couvert entierement par les journaux est recalcule a chaque passage.

Usage : arrivees.py --etat FICHIER --sortie FICHIER JOURNAL...
Les journaux sont donnes du plus ancien au plus recent. Variable pour les
tests : BLINDZ_VISITES_IPS_LOCALES (voir anonymiser.py).
"""

import argparse
import gzip
import hashlib
import hmac
import ipaddress
import json
import os
import re
import secrets
import sys
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from anonymiser import heure, ips_locales  # noqa: E402

VERSION = 1
PARIS = ZoneInfo("Europe/Paris")
DEBUT_JOUR_H = 6          # le jour de jeu commence a 6 h, heure de Paris
PAUSE_VISITE_S = 30 * 60  # au-dela, c'est une nouvelle visite
JOURS_GARDES = 395
MAX_PAGES = 15            # pages d'arrivee gardees par jour
MAX_SITES = 15            # sites d'origine gardes par jour

LIGNE = re.compile(
    r'^(\S+) \S+ \S+ \[[^\]]+\] "(\S+) (\S+)[^"]*" (\d{3}) \S+ "([^"]*)" "([^"]*)"')
ROBOT_UA = re.compile(
    r"bot|crawl|spider|slurp|preview|curl|wget|python|go-http|java/|headless|"
    r"lighthouse|monitor|uptime|externalhit|embedly|scan|httpclient|okhttp|"
    r"axios|node-fetch|libwww|feed|^-$|^$", re.I)
SONDE = re.compile(r"\.php|/wp-|\.env|\.git|cgi-bin|\.asp|/admin|\.sql|\.bak", re.I)
CODE = re.compile(r"^[A-Z0-9]{6}$")
SALLE = re.compile(r"^/api/rooms/([A-Z0-9]{6})(?:/|$)")
PAGE = re.compile(r"^/[a-z0-9/-]{0,60}$")
MOTEURS = ("duckduckgo.", "qwant.", "ecosia.", "yahoo.", "yandex.", "search.brave.",
           "startpage.", "lilo.", "baidu.", "naver.", "seznam.")


def domaine(adresse):
    """Nom d'hote d'un referer, sans www., en minuscules ('' si illisible)."""
    try:
        hote = urlsplit(adresse).hostname or ""
    except ValueError:
        return ""
    return hote[4:] if hote.startswith("www.") else hote


def sous_domaine_de(hote, nom):
    """Vrai si hote est nom ou l'un de ses sous-domaines (jamais une simple
    sous-chaine : « discordsays.com.exemple.fr » n'est pas Discord)."""
    return hote == nom or hote.endswith("." + nom)


def vient_de_discord(referer):
    return referer not in ("", "-") and sous_domaine_de(domaine(referer), "discordsays.com")


def source(referer, page, requete):
    """(source, site) d'une visite d'apres sa premiere page. Fonction pure.

    source : invitation, discord_activite, discord_lien, google, bing, moteur,
    site, interne, direct. site : le domaine d'origine pour « site », sinon ''.
    """
    if "join" in requete or ("code" in requete and "mode" in requete):
        return "invitation", ""
    hote = domaine(referer) if referer not in ("", "-") else ""
    if page.startswith("/discord") or sous_domaine_de(hote, "discordsays.com"):
        return "discord_activite", ""
    if referer.startswith("android-app://com.google"):
        return "google", ""
    if not hote:
        return "direct", ""
    if re.match(r"^(.+\.)?google\.[a-z.]+$", hote):
        return "google", ""
    if sous_domaine_de(hote, "bing.com"):
        return "bing", ""
    if any(m in hote for m in MOTEURS):
        return "moteur", hote
    if any(sous_domaine_de(hote, d) for d in ("discord.com", "discordapp.com", "discord.gg")):
        return "discord_lien", ""
    if sous_domaine_de(hote, "blindz.app"):
        return "interne", ""
    return "site", hote


def appareil(ua):
    if re.search(r"iPad|Tablet", ua):
        return "tablette"
    if re.search(r"Mobi|Android|iPhone", ua):
        return "telephone"
    return "ordinateur"


def jour_de_jeu(epoch):
    """Date (AAAA-MM-JJ) du jour de jeu, heure de Paris, de 6 h a 6 h."""
    local = datetime.fromtimestamp(epoch, PARIS) - timedelta(hours=DEBUT_JOUR_H)
    return local.date().isoformat()


def debut_jour(jour):
    """Epoch du debut (6 h, Paris) d'un jour de jeu."""
    an, mois, j = (int(x) for x in jour.split("-"))
    return int(datetime(an, mois, j, DEBUT_JOUR_H, tzinfo=PARIS).timestamp())


def lire(ligne):
    """Champs utiles d'une ligne, None si elle ne se lit pas."""
    m = LIGNE.match(ligne)
    quand = heure(ligne)
    if not m or quand is None:
        return None
    ip, methode, cible, statut, referer, ua = m.groups()
    try:
        ip = ipaddress.ip_address(ip)
    except ValueError:
        return None
    chemin, _, requete = cible.partition("?")
    return ip, quand, methode, chemin, requete, int(statut), referer, ua


def nouvelle_visite(quand, ua):
    return {"debut": quand, "fin": quand, "ua": ua, "page": None, "referer": "",
            "requete": {}, "navigateur": False, "sonde": False, "annexe": False,
            "invites": 0, "imports_ok": 0, "imports_ko": 0, "solo": 0,
            "discord": False, "salles": set()}


def noter(v, methode, chemin, requete, statut, referer):
    """Ajoute une requete a sa visite (en place : objet local a ce module)."""
    ok = 200 <= statut < 400
    args = parse_qs(requete) if requete else {}
    if vient_de_discord(referer):
        v["discord"] = True
    if SONDE.search(chemin):
        v["sonde"] = True
    if chemin.startswith(("/_next/", "/api/", "/socket.io/")):
        v["navigateur"] = True
    est_page = (methode == "GET" and ok and "_rsc" not in args
                and not chemin.startswith(("/api/", "/_next/", "/socket.io/"))
                and "." not in chemin.rsplit("/", 1)[-1])
    if est_page and v["page"] is None:
        v["page"] = chemin if PAGE.match(chemin) else "autre"
        v["referer"] = referer
        v["requete"] = {k: True for k in args}
    for cle in ("join", "code"):
        for valeur in args.get(cle, []):
            if CODE.match(valeur.upper()):
                v["salles"].add(valeur.upper())
    m = SALLE.match(chemin)
    if m and ok:
        v["salles"].add(m.group(1))
    if methode == "POST":
        if chemin == "/api/auth/guest" and ok:
            v["invites"] += 1
        elif chemin in ("/api/import/playlists", "/api/import/sync-all"):
            v["imports_ok" if ok else "imports_ko"] += 1
        elif chemin == "/api/quick-play" and ok:
            v["solo"] += 1
        elif chemin.startswith("/api/discord/"):
            v["discord"] = True


def jour_vide():
    return {"visites": 0, "ont_joue": 0, "importe_sans_jouer": 0, "invites": 0,
            "imports_ok": 0, "imports_ko": 0, "solo": 0, "robots": 0,
            "sources": {}, "pages": {}, "sites": {}, "appareils": {}}


def compter(dico, cle, n=1):
    dico[cle] = dico.get(cle, 0) + n


def fermer(v, jours, salles):
    """Range une visite terminee dans les comptes du jour."""
    jour = jour_de_jeu(v["debut"])
    j = jours.setdefault(jour, jour_vide())
    if v["annexe"]:
        # Requetes Discord sans fenetre connue : elles ne font pas une visite
        # de plus, mais leurs salles comptent pour l'activite Discord.
        for code in v["salles"]:
            salles.setdefault(f"{jour}|{code}", {}).setdefault("discord_activite", 1)
        return
    if v["sonde"] or not v["navigateur"] or ROBOT_UA.search(v["ua"]):
        j["robots"] += 1
        return
    src, site = source(v["referer"], v["page"] or "", v["requete"])
    if v["discord"] and src in ("direct", "interne"):
        src = "discord_activite"
    a_joue = bool(v["salles"]) or v["solo"] > 0
    j["visites"] += 1
    compter(j["sources"], src)
    # Sans page : onglet deja ouvert, ou navigation interne de l'appli.
    compter(j["pages"], v["page"] or ("/discord/" if v["discord"] else "inconnue"))
    compter(j["appareils"], appareil(v["ua"]))
    if site:
        compter(j["sites"], site)
    j["ont_joue"] += int(a_joue)
    j["importe_sans_jouer"] += int(not a_joue and v["imports_ok"] > 0)
    for cle in ("invites", "imports_ok", "imports_ko", "solo"):
        j[cle] += v[cle]
    for code in v["salles"]:
        compter(salles.setdefault(f"{jour}|{code}", {}), src)


def tailler(dico, n):
    """Les n plus gros, le reste regroupe sous « autres »."""
    rang = sorted(dico.items(), key=lambda kv: (-kv[1], kv[0]))
    garde = dict(rang[:n])
    reste = sum(v for _, v in rang[n:])
    if reste:
        garde["autres"] = garde.get("autres", 0) + reste
    return garde


def cle_de_visite(ip, ua, referer):
    """(cle, annexe) qui regroupe les requetes d'une meme visite, en memoire.

    Activite Discord : les requetes passent par le relais de Discord, une
    adresse Cloudflare differente a chaque fois. On regroupe alors par la
    fenetre Discord (frame_id du referer), une par joueur et par lancement.
    Sans frame_id, la requete est « annexe » : elle ne compte pas de visite.
    """
    if vient_de_discord(referer):
        fenetre = parse_qs(urlsplit(referer).query).get("frame_id", [""])[0]
        if fenetre:
            return f"discord|{fenetre}", False
        return f"discord-annexe|{ua}", True
    return f"{ip}|{ua}", False


def analyser(lignes, locales, cle):
    """Lignes du journal -> (jours, salles, premiere heure lue, imports 24 h)."""
    ouvertes, jours, salles = {}, {}, {}
    premiere, derniere = None, 0
    for ligne in lignes:
        champs = lire(ligne)
        if champs is None:
            continue
        ip, quand, methode, chemin, requete, statut, referer, ua = champs
        if ip in locales or (ip.version == 6 and ip.ipv4_mapped in locales):
            continue
        premiere = quand if premiere is None else min(premiere, quand)
        derniere = max(derniere, quand)
        cle_visite, annexe = cle_de_visite(ip, ua, referer)
        empreinte = hmac.new(cle, cle_visite.encode("utf-8", "surrogateescape"),
                             hashlib.sha256).digest()
        v = ouvertes.get(empreinte)
        if v is not None and quand - v["fin"] > PAUSE_VISITE_S:
            fermer(v, jours, salles)
            v = None
        if v is None:
            v = ouvertes[empreinte] = nouvelle_visite(quand, ua)
            v["annexe"] = annexe
        v["fin"] = max(v["fin"], quand)
        noter(v, methode, chemin, requete, statut, referer)
    for v in ouvertes.values():
        fermer(v, jours, salles)
    for j in jours.values():
        j["pages"] = tailler(j["pages"], MAX_PAGES)
        j["sites"] = tailler(j["sites"], MAX_SITES)
    return jours, salles, premiere, derniere


def fusionner(etat, jours, salles, premiere, maintenant):
    """Etat precedent + jours recalcules. Un jour que les journaux ne couvrent
    plus en entier garde sa version de l'etat si elle existe."""
    anciens_jours = dict(etat.get("jours", {}))
    anciennes_salles = dict(etat.get("salles", {}))
    nouveaux = {}
    for jour, comptes in jours.items():
        partiel = premiere is not None and debut_jour(jour) < premiere
        if partiel and jour in anciens_jours:
            continue
        nouveaux[jour] = comptes
    tous_jours = {**anciens_jours, **nouveaux}
    toutes_salles = {k: v for k, v in anciennes_salles.items()
                     if k.split("|", 1)[0] not in nouveaux}
    toutes_salles.update({k: v for k, v in salles.items() if k.split("|", 1)[0] in nouveaux})
    limite = jour_de_jeu(maintenant - JOURS_GARDES * 86400)
    return (
        {j: c for j, c in sorted(tous_jours.items()) if j >= limite},
        {k: v for k, v in sorted(toutes_salles.items()) if k.split("|", 1)[0] >= limite},
    )


def lignes_des(fichiers):
    for chemin in fichiers:
        ouvrir = gzip.open if chemin.endswith(".gz") else open
        with ouvrir(chemin, "rt", encoding="utf-8", errors="surrogateescape") as f:
            for ligne in f:
                yield ligne.rstrip("\n")


def charger_etat(chemin):
    try:
        with open(chemin, encoding="utf-8") as f:
            etat = json.load(f)
    except FileNotFoundError:
        return {}
    if etat.get("version") != VERSION:
        print(f"etat {chemin} d'une autre version, ignore", file=sys.stderr)
        return {}
    return etat


def ecrire(chemin, donnees, mode):
    tmp = f"{chemin}.tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(donnees, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp, mode)
    os.replace(tmp, chemin)


def main():
    p = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    p.add_argument("--etat", required=True)
    p.add_argument("--sortie", required=True)
    p.add_argument("journaux", nargs="+")
    args = p.parse_args()
    maintenant = int(os.environ.get("BLINDZ_VISITES_MAINTENANT") or time.time())
    fichiers = [f for f in args.journaux if os.path.isfile(f)]
    if not fichiers:
        raise SystemExit("aucun journal lisible")
    jours, salles, premiere, derniere = analyser(
        lignes_des(fichiers), ips_locales(), secrets.token_bytes(32))
    etat = charger_etat(args.etat)
    tous_jours, toutes_salles = fusionner(etat, jours, salles, premiere, maintenant)
    iso = lambda t: datetime.fromtimestamp(t, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if t else None
    donnees = {
        "version": VERSION,
        "genere_le": iso(maintenant),
        "journaux_du": iso(premiere),
        "journaux_au": iso(derniere),
        "jours": tous_jours,
        "salles": toutes_salles,
    }
    ecrire(args.etat, donnees, 0o600)
    ecrire(args.sortie, donnees, 0o644)
    print(f"jours={len(tous_jours)} salles={len(toutes_salles)}", file=sys.stderr)


if __name__ == "__main__":
    main()
