#!/usr/bin/env python3
"""T30 : compare les captures claires avant (site de dev, main) et apres
(apercu de la branche) des pages statiques. Le clair ne doit changer que sur
les gris remontes au niveau AA : on mesure la part de pixels differents et on
ecrit une image des differences (en rouge) par page.

    python3 -I tools/t30-diff-clair.py <dossier avant> <dossier apres> <dossier sortie>
"""
import os
import sys
from PIL import Image, ImageChops

avant, apres, sortie = sys.argv[1:4]
os.makedirs(sortie, exist_ok=True)
STATIQUES = ("accueil", "faq", "avis", "conditions", "comment-faire", "blind-test-soiree", "profile", "jouer", "solo", "buzzer", "spectateur")
for nom in sorted(os.listdir(apres)):
    if not nom.startswith("clair-") or not nom.endswith(".png") or not any(s in nom for s in STATIQUES):
        continue
    pa, pb = os.path.join(avant, nom), os.path.join(apres, nom)
    if not os.path.exists(pa):
        continue
    a, b = Image.open(pa).convert("RGB"), Image.open(pb).convert("RGB")
    h = min(a.height, b.height)
    a, b = a.crop((0, 0, a.width, h)), b.crop((0, 0, b.width, h))
    diff = ImageChops.difference(a, b).convert("L").point(lambda v: 255 if v > 24 else 0)
    n = sum(1 for v in diff.getdata() if v)
    part = 100 * n / (a.width * h)
    rouge = Image.new("RGB", a.size, (220, 30, 30))
    vue = Image.composite(rouge, a.point(lambda v: 150 + v // 3), diff)
    vue.save(os.path.join(sortie, nom.replace(".png", "-diff.png")))
    hauteur = "" if Image.open(pa).height == Image.open(pb).height else f" (hauteur {Image.open(pa).height} -> {Image.open(pb).height})"
    print(f"{part:6.2f} % de pixels changes  {nom}{hauteur}")
