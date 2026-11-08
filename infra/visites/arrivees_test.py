#!/usr/bin/env python3
"""Tests de arrivees.py (onglet « Qui joue » de l'administration).

Usage : python3 -m unittest infra/visites/arrivees_test.py
Besoin de python3 seulement, sans base ni journal reel.
"""

import json
import os
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import arrivees as a  # noqa: E402

UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0"
UA_TEL = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148"
UA_ROBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
VPS = "198.51.100.7"
LOCALES = {a.ipaddress.ip_address(x) for x in ("127.0.0.1", VPS)}
CLE = b"cle-de-test"


def l(ip, quand, cible, referer="-", ua=UA_PC, methode="GET", statut=200):
    """Ligne combined. quand : 'JJ/Mon/AAAA:HH:MM:SS' en UTC."""
    return f'{ip} - - [{quand} +0000] "{methode} {cible} HTTP/1.1" {statut} 512 "{referer}" "{ua}"'


def visite(ip, quand_page, quand_api, cible="/", referer="-", ua=UA_PC):
    """Une page puis une requete d'appli : un vrai navigateur."""
    return [l(ip, quand_page, cible, referer, ua), l(ip, quand_api, "/api/auth/me", ua=ua)]


class Source(unittest.TestCase):
    def test_moteurs_et_sites(self):
        cas = {
            "https://www.google.com/": ("google", ""),
            "https://www.google.fr/search?q=blind+test": ("google", ""),
            "android-app://com.google.android.googlequicksearchbox/": ("google", ""),
            "https://www.bing.com/": ("bing", ""),
            "https://duckduckgo.com/": ("moteur", "duckduckgo.com"),
            "https://discord.com/channels/1/2": ("discord_lien", ""),
            "https://123.discordsays.com/?frame_id=x": ("discord_activite", ""),
            "https://blindz.app/faq/": ("interne", ""),
            # Sous-chaine trompeuse : un autre site, pas Discord ni Bing.
            "https://discordsays.com.exemple.fr/": ("site", "discordsays.com.exemple.fr"),
            "https://notbing.com/": ("site", "notbing.com"),
            "https://www.reddit.com/r/x": ("site", "reddit.com"),
            "-": ("direct", ""),
            "": ("direct", ""),
        }
        for referer, attendu in cas.items():
            self.assertEqual(a.source(referer, "/", {}), attendu, referer)

    def test_invitation_avant_le_referer(self):
        self.assertEqual(a.source("https://www.google.com/", "/", {"join": True}), ("invitation", ""))
        self.assertEqual(a.source("-", "/jouer/", {"mode": True, "code": True}), ("invitation", ""))

    def test_page_discord(self):
        self.assertEqual(a.source("-", "/discord/", {}), ("discord_activite", ""))


class JourDeJeu(unittest.TestCase):
    def test_une_soiree_qui_finit_a_3h_compte_pour_la_veille(self):
        # 08/11 02:00 UTC = 03:00 a Paris (heure d'hiver) : jour du 07/11.
        t = int(datetime(2026, 11, 8, 2, 0, tzinfo=timezone.utc).timestamp())
        self.assertEqual(a.jour_de_jeu(t), "2026-11-07")
        # 08/11 05:00 UTC = 06:00 a Paris : nouveau jour.
        t = int(datetime(2026, 11, 8, 5, 0, tzinfo=timezone.utc).timestamp())
        self.assertEqual(a.jour_de_jeu(t), "2026-11-08")

    def test_heure_d_ete(self):
        # 15/07 04:30 UTC = 06:30 a Paris (UTC+2) : deja le 15.
        t = int(datetime(2026, 7, 15, 4, 30, tzinfo=timezone.utc).timestamp())
        self.assertEqual(a.jour_de_jeu(t), "2026-07-15")
        self.assertEqual(a.debut_jour("2026-07-15"), int(datetime(2026, 7, 15, 4, 0, tzinfo=timezone.utc).timestamp()))


class Analyser(unittest.TestCase):
    def analyse(self, lignes):
        return a.analyser(iter(lignes), LOCALES, CLE)

    def test_comptes_d_une_soiree(self):
        lignes = [
            # Arrive par Google sur la page Spotify, importe, joue en salle.
            *visite("203.0.113.5", "07/Nov/2026:20:00:00", "07/Nov/2026:20:00:01",
                    "/blind-test-spotify/", "https://www.google.com/", UA_TEL),
            l("203.0.113.5", "07/Nov/2026:20:00:05", "/api/auth/guest", ua=UA_TEL, methode="POST", statut=201),
            l("203.0.113.5", "07/Nov/2026:20:01:00", "/api/import/playlists", ua=UA_TEL, methode="POST"),
            l("203.0.113.5", "07/Nov/2026:20:02:00", "/api/rooms/ABC123/state", ua=UA_TEL),
            # Invitation par lien, pseudo et lien Spotify dans l'adresse.
            *visite("192.0.2.9", "07/Nov/2026:20:03:00", "07/Nov/2026:20:03:01",
                    "/jouer/?mode=friends&code=abc123&nickname=Grossier&profileUrl=https%3A%2F%2Fopen.spotify.com%2Fuser%2Fx"),
            # Importe et repart sans jouer, import rate une fois.
            *visite("192.0.2.50", "07/Nov/2026:21:00:00", "07/Nov/2026:21:00:01", "/", "https://www.bing.com/"),
            l("192.0.2.50", "07/Nov/2026:21:00:30", "/api/import/playlists", methode="POST", statut=502),
            l("192.0.2.50", "07/Nov/2026:21:00:40", "/api/import/playlists", methode="POST"),
            # Robot, sonde, et le VPS lui-meme : jamais comptes en visite.
            *visite("66.249.66.1", "07/Nov/2026:21:10:00", "07/Nov/2026:21:10:01", "/", ua=UA_ROBOT),
            l("192.0.2.77", "07/Nov/2026:21:11:00", "/wp-admin/install.php"),
            l("192.0.2.77", "07/Nov/2026:21:11:01", "/_next/static/x.js"),
            *visite(VPS, "07/Nov/2026:21:12:00", "07/Nov/2026:21:12:01", "/", "https://www.google.com/"),
            # Une page sans aucune requete d'appli : pas un navigateur.
            l("192.0.2.88", "07/Nov/2026:21:13:00", "/faq/"),
        ]
        jours, salles, premiere, _ = self.analyse(lignes)
        j = jours["2026-11-07"]
        self.assertEqual(j["visites"], 3)
        self.assertEqual(j["sources"], {"google": 1, "invitation": 1, "bing": 1})
        self.assertEqual(j["ont_joue"], 2)
        self.assertEqual(j["importe_sans_jouer"], 1)
        self.assertEqual((j["imports_ok"], j["imports_ko"], j["invites"]), (2, 1, 1))
        self.assertEqual(j["robots"], 3)
        self.assertEqual(j["appareils"], {"telephone": 1, "ordinateur": 2})
        self.assertEqual(j["pages"]["/blind-test-spotify/"], 1)
        # Le code de l'invitation (en minuscules dans l'adresse) rejoint la salle.
        self.assertEqual(salles, {"2026-11-07|ABC123": {"google": 1, "invitation": 1}})
        self.assertIsNotNone(premiere)

    def test_rien_de_personnel_dans_la_sortie(self):
        lignes = visite("203.0.113.5", "07/Nov/2026:20:00:00", "07/Nov/2026:20:00:01",
                        "/jouer/?mode=friends&code=ABC123&nickname=Grossier",
                        "https://www.reddit.com/u/quelquun")
        jours, salles, _, _ = self.analyse(lignes)
        texte = json.dumps([jours, salles])
        for interdit in ("203.0.113", "Grossier", "Mozilla", "nickname", "/u/quelquun"):
            self.assertNotIn(interdit, texte)

    def test_une_pause_de_plus_de_30_min_fait_une_nouvelle_visite(self):
        lignes = [
            *visite("203.0.113.5", "07/Nov/2026:20:00:00", "07/Nov/2026:20:00:01"),
            *visite("203.0.113.5", "07/Nov/2026:20:20:00", "07/Nov/2026:20:20:01"),
            *visite("203.0.113.5", "07/Nov/2026:21:00:00", "07/Nov/2026:21:00:01"),
        ]
        jours, _, _, _ = self.analyse(lignes)
        self.assertEqual(jours["2026-11-07"]["visites"], 2)

    def test_discord_regroupe_par_fenetre(self):
        ref = "https://1.discordsays.com/?instance_id=i-1&frame_id={}&guild_id=42"
        lignes = []
        # Deux joueurs, chacun vu par plusieurs adresses du relais.
        for n, fenetre in enumerate(("f1", "f2")):
            for k in range(3):
                ip = f"104.22.{100 + n * 10 + k}.1"
                lignes.append(l(ip, f"07/Nov/2026:22:0{k}:00", "/discord/", ref.format(fenetre)))
                lignes.append(l(ip, f"07/Nov/2026:22:0{k}:01", "/api/rooms/ZTPW4R/state", ref.format(fenetre)))
        # Requete du relais sans fenetre : pas une visite de plus.
        lignes.append(l("104.22.200.1", "07/Nov/2026:22:05:00", "/api/rooms/ZTPW4R/state",
                        "https://1.discordsays.com/"))
        jours, salles, _, _ = self.analyse(lignes)
        j = jours["2026-11-07"]
        self.assertEqual(j["visites"], 2)
        self.assertEqual(j["sources"], {"discord_activite": 2})
        self.assertEqual(salles, {"2026-11-07|ZTPW4R": {"discord_activite": 2}})
        self.assertNotIn("42", json.dumps(salles))


class Fusionner(unittest.TestCase):
    def test_garde_les_jours_anciens_et_remplace_les_jours_couverts(self):
        etat = {"jours": {"2026-10-01": {"visites": 9}, "2026-11-01": {"visites": 1},
                          "2026-11-02": {"visites": 1}},
                "salles": {"2026-10-01|AAAAAA": {"direct": 1}, "2026-11-02|BBBBBB": {"direct": 1}}}
        # Journaux a partir du 01/11 a 12 h UTC : le 01/11 n'est pas entier.
        premiere = int(datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc).timestamp())
        maintenant = int(datetime(2026, 11, 8, tzinfo=timezone.utc).timestamp())
        jours, salles = a.fusionner(etat, {"2026-11-01": {"visites": 5}, "2026-11-02": {"visites": 7}},
                                    {"2026-11-02|CCCCCC": {"google": 1}}, premiere, maintenant)
        self.assertEqual(jours, {"2026-10-01": {"visites": 9}, "2026-11-01": {"visites": 1},
                                 "2026-11-02": {"visites": 7}})
        self.assertEqual(salles, {"2026-10-01|AAAAAA": {"direct": 1}, "2026-11-02|CCCCCC": {"google": 1}})

    def test_oublie_au_dela_de_13_mois(self):
        maintenant = int(datetime(2026, 11, 8, tzinfo=timezone.utc).timestamp())
        jours, _ = a.fusionner({"jours": {"2025-01-01": {}, "2026-01-01": {}}}, {}, {}, None, maintenant)
        self.assertEqual(list(jours), ["2026-01-01"])


class Script(unittest.TestCase):
    def test_de_bout_en_bout_avec_gz_et_droits(self):
        import gzip
        with tempfile.TemporaryDirectory() as d:
            ancien = os.path.join(d, "acces.log.2.gz")
            with gzip.open(ancien, "wt") as f:
                f.write("\n".join(visite("203.0.113.5", "06/Nov/2026:20:00:00", "06/Nov/2026:20:00:01")) + "\n")
            courant = os.path.join(d, "acces.log")
            with open(courant, "w") as f:
                f.write("\n".join(visite("203.0.113.6", "07/Nov/2026:20:00:00", "07/Nov/2026:20:00:01")) + "\n")
            etat, sortie = os.path.join(d, "etat.json"), os.path.join(d, "sortie.json")
            env = {**os.environ, "BLINDZ_VISITES_IPS_LOCALES": f"127.0.0.1 {VPS}",
                   "BLINDZ_VISITES_MAINTENANT": "1794268800"}
            script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "arrivees.py")
            subprocess.run([sys.executable, script, "--etat", etat, "--sortie", sortie, ancien, courant],
                           check=True, env=env, capture_output=True)
            with open(sortie) as f:
                donnees = json.load(f)
            self.assertEqual(sorted(donnees["jours"]), ["2026-11-06", "2026-11-07"])
            self.assertEqual(os.stat(etat).st_mode & 0o777, 0o600)
            self.assertEqual(os.stat(sortie).st_mode & 0o777, 0o644)


if __name__ == "__main__":
    unittest.main()
