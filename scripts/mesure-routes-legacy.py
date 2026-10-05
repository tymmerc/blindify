#!/usr/bin/env python3
# Mesure de ce qui passe encore par les anciennes routes de Blindz sur
# tymmerc.eu (audit "menage technique" du 05/10/2026). Lecture seule : lit les
# journaux nginx (access.log et ses rotations .gz), n'ecrit rien.
#
#   sudo python3 scripts/mesure-routes-legacy.py            # resume par famille
#   sudo python3 scripts/mesure-routes-legacy.py --details  # + chaque requete "a verifier"
#
# Le journal par defaut ne contient pas le nom de domaine : tymmerc.eu et
# blindz.app ecrivent dans le meme fichier. On s'appuie donc sur ce que chaque
# serveur repond : sur tymmerc.eu les anciennes routes repondent 301 (ou sont
# relayees au backend), alors que blindz.app sert sa page d'accueil en 200.
# Les adresses affichees sont tronquees (a.b.x.x) : rien de personnel ne sort.
import collections
import datetime
import glob
import gzip
import re
import sys

JOURNAUX = "/var/log/nginx/access.log*"
VPS = {"46.224.109.59", "127.0.0.1", "::1"}

LIGNE = re.compile(r'^(\S+) \S+ \S+ \[([^\]:]+)[^\]]*\] "(\S+) (\S+) [^"]*" (\d{3}) (\d+) "([^"]*)" "([^"]*)"')
RACINE = re.compile(r"^/(auth|friends|modes|playlists|profile|settings|leaderboard|game|solo|multiplayer|history|stats"
                    r"|results|menu|landing|upload|streamer|chat|event|demo|analyse-visage|produits)(/.*)?$")
ROBOT = re.compile(r"bot|crawl|spider|slurp|curl|wget|python|go-http|java/|libredtail|httpclient|axios|okhttp|headless"
                   r"|scrapy|zgrab|masscan|nmap|nuclei|google-extended|chatgpt-user|perplexity|externalhit|mapper|^-?$", re.I)
SONDE = re.compile(r"/\.|\.(env|php|py|aspx?|jsp|cgi|bak|sql|ya?ml|ini|log|key|pem|crt|conf)\b|wp-|/admin|/console"
                   r"|eval-stdin|secrets|config\.json|%2e|%252e|/v1/health", re.I)


def famille(chemin, statut):
    """Range une requete dans une famille d'anciennes routes, ou None."""
    if chemin == "/blindify" or chemin.startswith("/blindify/"):
        if chemin.startswith("/blindify/api/"):
            return "/blindify/api/ (relais vers le backend)"
        if chemin.startswith("/blindify/socket.io"):
            return "/blindify/socket.io/ (relais websocket)"
        if chemin == "/blindify/auth/spotify/login":
            return "/blindify/auth/spotify/login (relais)"
        if chemin.startswith("/blindify/_next/static/"):
            return "/blindify/_next/static/ (fichiers, journal coupe)"
        # Sur blindz.app, /blindify/... tombe sur la page d'accueil (200) :
        # ce n'est pas l'ancienne route, on le compte a part.
        return "/blindify/* (301 vers blindz.app)" if statut == "301" else "blindz.app/blindify/* (repli 200, hors sujet)"
    if chemin.startswith("/demo/blindify-game"):
        return "/demo/blindify-game (page de demo)"
    if RACINE.match(chemin) and statut == "301":
        if "/." in chemin:
            # En HTTPS le bloc "location ~ /\." repond 404 avant le catch-all :
            # un 301 ici vient forcement de la redirection HTTP -> HTTPS.
            return "racine /auth, /settings... (301 du port 80, pas le catch-all)"
        return "racine /auth, /settings... (catch-all ou port 80)"
    return None


def lire():
    for chemin in sorted(glob.glob(JOURNAUX)):
        ouvrir = gzip.open if chemin.endswith(".gz") else open
        with ouvrir(chemin, "rt", errors="replace") as f:
            yield from f


def masque(ip):
    morceaux = ip.split(".")
    return ".".join(morceaux[:2] + ["x", "x"]) if len(morceaux) == 4 else ip.split(":")[0] + ":x"


def main():
    details = "--details" in sys.argv
    requetes = []
    ips_robots = set()
    jours = set()
    for ligne in lire():
        m = LIGNE.match(ligne)
        if not m:
            continue
        ip, jour, _methode, uri, statut, _taille, _ref, ua = m.groups()
        jours.add(jour)
        chemin = uri.split("?")[0]
        if ROBOT.search(ua) or SONDE.search(chemin):
            ips_robots.add(ip)
        fam = famille(chemin, statut)
        if fam:
            requetes.append((fam, ip, jour, uri, statut, ua))

    dates = sorted(datetime.datetime.strptime(j, "%d/%b/%Y").date() for j in jours)
    if not dates:
        print("Aucune ligne lisible dans " + JOURNAUX)
        return
    print(f"Journaux lus : {len(dates)} jours, du {dates[0]:%d/%m/%Y} au {dates[-1]:%d/%m/%Y}\n")
    par_famille = collections.defaultdict(list)
    for r in requetes:
        par_famille[r[0]].append(r)

    a_verifier = []
    for fam in sorted(par_famille):
        lignes = par_famille[fam]
        classes = collections.Counter()
        for fam_, ip, jour, uri, statut, ua in lignes:
            chemin = uri.split("?")[0]
            if ip in VPS:
                classes["le VPS lui-meme"] += 1
            elif ROBOT.search(ua):
                classes["robot declare"] += 1
            elif SONDE.search(chemin):
                classes["sonde (scanner)"] += 1
            elif ip in ips_robots:
                classes["adresse vue en robot ailleurs"] += 1
            else:
                classes["navigateur a verifier"] += 1
                a_verifier.append((fam_, masque(ip), jour, uri[:70], statut, ua[:60]))
        ips = len({r[1] for r in lignes})
        detail = ", ".join(f"{n} {c}" for c, n in classes.most_common())
        print(f"{fam}\n    {len(lignes)} requetes, {ips} adresses : {detail}")

    print(f"\nRequetes de navigateur a verifier a la main : {len(a_verifier)}")
    if details:
        for r in a_verifier:
            print("    " + " | ".join(r))


if __name__ == "__main__":
    main()
