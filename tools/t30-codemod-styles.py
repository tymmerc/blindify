#!/usr/bin/env python3
"""T30, second passage : couleurs ecrites dans des objets de style React
(style={{ color: "#2e2014" }}, variables CSS locales "--ink": "#2e2014",
ombres en chaine). Le role vient de la propriete. Seules les couleurs qui
changent en nuit chaude sont remplacees ; les accents en fond (terre cuite,
or, sauge...) gardent leur valeur dans les deux themes et restent ecrits tels
quels. Les cas ambigus (constantes nommees, SVG) sont laisses pour la main.

    python3 tools/t30-codemod-styles.py frontend/src [--dry]
"""
import os
import re
import sys
from collections import Counter

TEXTE = {"2e2014": "ink", "6b573f": "ink-2", "8a7558": "sourd", "b3a182": "pale",
         "c65133": "terra-txt", "cc4830": "vermillon-txt", "9c2f1d": "rouge-txt", "d88418": "ambre-txt",
         "e0a32e": "gold-txt", "a87714": "gold-deep-txt", "7d9471": "sage-txt", "5d7252": "sage-deep-txt",
         "486090": "acier-txt"}
FOND = {"f4ecdb": "paper", "ece1c8": "paper-deep", "efe5d0": "well", "e0d4ba": "paper-strong",
        "fbf6ea": "paper-light", "2e2014": "ink-block"}
BORD = {"2e2014": "line", "6b573f": "ink-2", "8a7558": "sourd", "9c2f1d": "rouge-txt"}
OMBRE = {"2e2014": "shadow"}

PROPS = [
    (re.compile(r"^(color|fgColor|caretColor|textDecorationColor)$"), TEXTE),
    (re.compile(r"^(background|backgroundColor|bg|bgColor)$"), FOND),
    (re.compile(r"^(border|borderColor|border(Top|Bottom|Left|Right)(Color)?|outline|outlineColor)$"), BORD),
    (re.compile(r"^(boxShadow|textShadow)$"), OMBRE),
    (re.compile(r"^--(ink|text|fg|muted|text-[a-z-]+)$"), TEXTE),
    (re.compile(r"^--(bg|surface|surface-[a-z-]+|paper|paper-[a-z-]+|card|well)$"), FOND),
    (re.compile(r"^--(border|border-[a-z-]+|line)$"), BORD),
    (re.compile(r"^--(shadow|shadow-[a-z-]+)$"), OMBRE),
]
# propriete: "valeur..." ou propriete: `valeur...` sur une seule ligne
PAIRE = re.compile(r"""(["']?)(--[\w-]+|[a-zA-Z]+)\1\s*:\s*(["'`])([^"'`]*?)\3""")
COULEUR = re.compile(r"#([0-9a-fA-F]{6})(?![0-9a-fA-F])|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)")

faits, reste = Counter(), Counter()

def table_pour(prop):
    for rx, t in PROPS:
        if rx.match(prop):
            return t
    return None

def couleur(table, prop):
    def rep(c):
        if c.group(1):
            h, a = c.group(1).lower(), None
        else:
            h = "".join(f"{int(x):02x}" for x in c.group(2, 3, 4))
            a = c.group(5)
        jeton = table.get(h)
        # Voile d'encre translucide en fond : un trait creme en sombre, sauf un
        # voile presque opaque (ecran par-dessus le jeu) qui reste sombre.
        if table is FOND and h == "2e2014" and a is not None:
            jeton = "ink-block" if float(a) >= 0.6 else "line"
        if table is FOND and h == "f4ecdb" and a is not None:
            jeton = "paper"
        if table is FOND and h == "ece1c8" and a is not None:
            jeton = "paper-deep"
        if not jeton:
            return c.group(0)
        faits[jeton] += 1
        return f"rgb(var(--c-{jeton}) / {a})" if a is not None else f"rgb(var(--c-{jeton}))"
    return rep

def traite_ligne(ligne):
    if "className" in ligne and "style" not in ligne and "--" not in ligne:
        return ligne

    def paire(m):
        q, prop, q2, val = m.group(1), m.group(2), m.group(3), m.group(4)
        table = table_pour(prop)
        if not table or not COULEUR.search(val):
            return m.group(0)
        neuf = COULEUR.sub(couleur(table, prop), val)
        return f"{q}{prop}{q}: {q2}{neuf}{q2}"

    return PAIRE.sub(paire, ligne)

def main():
    racine, dry = sys.argv[1], "--dry" in sys.argv
    n = 0
    for dossier, _, fichiers in os.walk(racine):
        if "node_modules" in dossier:
            continue
        for f in fichiers:
            if not f.endswith((".tsx", ".ts")) or f.endswith(".d.ts"):
                continue
            p = os.path.join(dossier, f)
            avant = open(p, encoding="utf-8").read()
            apres = "\n".join(traite_ligne(l) for l in avant.split("\n"))
            if apres != avant:
                n += 1
                if not dry:
                    open(p, "w", encoding="utf-8").write(apres)
    print(f"{n} fichiers, {sum(faits.values())} couleurs")
    for k, v in faits.most_common():
        print(f"  {v:4} {k}")

if __name__ == "__main__":
    main()
