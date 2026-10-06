#!/usr/bin/env python3
"""Filtre des lignes du journal nginx de blindz.app avant GoAccess.

Lit des lignes au format combined sur l'entree standard et ecrit sur la
sortie standard :
  - sans les lignes du VPS lui-meme (ses propres adresses, lues dans /proc au
    lancement : sonde blindz-uptime, scripts E2E, curl de verification) ;
  - avec l'adresse du client tronquee : IPv4 en /24 (x.y.z.0), IPv6 en /48.
    GoAccess, et donc sa base sur disque, ne voit jamais une adresse entiere ;
  - triees par heure, sans les 2 dernieres secondes (voir plus bas).

Copie deployee : /usr/local/lib/blindz-visites/anonymiser.py, lancee par
/usr/local/sbin/blindz-visites. Teste par anonymiser.test.sh.

Pourquoi trier et garder une marge : GoAccess lit un tube sans inode. Pour ne
rien compter deux fois d'un passage a l'autre, il retient l'heure de la
derniere ligne lue et saute ensuite toute ligne qui n'est pas plus recente.
Triees, la derniere ligne est la plus recente. La marge laisse a nginx le temps
d'ecrire les lignes de la seconde en cours : elles passent au tour suivant au
lieu d'etre sautees.

Variable pour les tests : BLINDZ_VISITES_IPS_LOCALES (adresses separees par
des espaces) remplace la lecture de /proc, BLINDZ_VISITES_MAINTENANT (epoch)
remplace l'heure courante.
"""

import ipaddress
import os
import sys
import time
from datetime import datetime, timedelta, timezone

MARGE_S = 2
MOIS = {m: i + 1 for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])}


def ips_locales_proc():
    """Adresses de la machine : IPv4 LOCAL de fib_trie, toutes les IPv6."""
    ips = set()
    precedent = ""
    with open("/proc/net/fib_trie", encoding="ascii") as f:
        for ligne in f:
            if "/32 host LOCAL" in ligne:
                ips.add(ipaddress.ip_address(precedent))
            morceaux = ligne.split()
            if len(morceaux) >= 2 and morceaux[0] == "|--":
                precedent = morceaux[1]
    try:
        with open("/proc/net/if_inet6", encoding="ascii") as f:
            for ligne in f:
                ips.add(ipaddress.IPv6Address(int(ligne.split()[0], 16)))
    except FileNotFoundError:
        pass  # IPv6 coupe sur la machine : rien a exclure de ce cote
    return ips


def ips_locales():
    forcees = os.environ.get("BLINDZ_VISITES_IPS_LOCALES")
    if forcees is not None:
        return {ipaddress.ip_address(ip) for ip in forcees.split()}
    ips = ips_locales_proc()
    # Garde-fou : sans au moins la boucle locale, la lecture a rate et le VPS
    # serait compte comme visiteur. On s'arrete plutot.
    if ipaddress.ip_address("127.0.0.1") not in ips:
        raise SystemExit("adresses locales illisibles dans /proc/net, rien n'est publie")
    return ips


def tronquer(ip):
    """Adresse tronquee en texte : /24 en IPv4, /48 en IPv6."""
    if ip.version == 6 and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    prefixe = 24 if ip.version == 4 else 48
    return str(ipaddress.ip_network(f"{ip}/{prefixe}", strict=False).network_address)


def heure(ligne):
    """Epoch de [05/Oct/2026:15:42:01 +0000], None si illisible."""
    debut = ligne.find("[")
    fin = ligne.find("]", debut)
    if debut < 0 or fin < 0:
        return None
    try:
        date, decalage = ligne[debut + 1:fin].split(" ")
        jour, mois, an, h, m, s = date.replace("/", ":").split(":")
        signe = -1 if decalage[0] == "-" else 1
        tz = timezone(signe * timedelta(hours=int(decalage[1:3]), minutes=int(decalage[3:5])))
        moment = datetime(int(an), MOIS[mois], int(jour), int(h), int(m), int(s), tzinfo=tz)
    except (ValueError, KeyError, IndexError):
        return None
    return int(moment.timestamp())


def filtrer(lignes, locales, limite):
    """Renvoie (lignes gardees triees, compteurs). Fonction pure."""
    gardees = []
    compte = {"lues": 0, "vps": 0, "illisibles": 0, "reportees": 0}
    for ligne in lignes:
        compte["lues"] += 1
        adresse, espace, reste = ligne.partition(" ")
        quand = heure(reste)
        try:
            ip = ipaddress.ip_address(adresse)
            tronquee = tronquer(ip)
        except ValueError:  # pas une adresse
            ip = None
        if ip is None or not espace or quand is None:
            compte["illisibles"] += 1
        elif ip in locales or (ip.version == 6 and ip.ipv4_mapped in locales):
            compte["vps"] += 1
        elif quand > limite:
            compte["reportees"] += 1
        else:
            gardees.append((quand, tronquee + " " + reste))
    gardees.sort(key=lambda paire: paire[0])
    return [texte for _, texte in gardees], compte


def main():
    maintenant = int(os.environ.get("BLINDZ_VISITES_MAINTENANT") or time.time())
    # Octets bizarres d'un robot (user agent, adresse) : recopies tels quels.
    sys.stdin.reconfigure(errors="surrogateescape")
    sys.stdout.reconfigure(errors="surrogateescape")
    entree = (ligne.rstrip("\n") for ligne in sys.stdin)
    gardees, compte = filtrer(entree, ips_locales(), maintenant - MARGE_S)
    for ligne in gardees:
        sys.stdout.write(ligne + "\n")
    print(" ".join(f"{k}={v}" for k, v in compte.items()), file=sys.stderr)


if __name__ == "__main__":
    main()
