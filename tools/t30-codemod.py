#!/usr/bin/env python3
"""T30 : remplace les couleurs ecrites en dur des classes Tailwind par les jetons
du theme (variables --c-*), selon le role de la classe (texte, fond, bordure,
ombre). Le rendu clair ne change pas : chaque jeton vaut en clair la couleur
qu'il remplace (sauf les gris sourd et pale, remontes au niveau AA exprès).

    python3 tools/t30-codemod.py frontend/src            # ecrit les fichiers
    python3 tools/t30-codemod.py frontend/src --dry      # compte seulement

Les couleurs hors palette (rares) ne sont pas touchees et sont listees.
"""
import os
import re
import sys
from collections import Counter

# role -> couleur claire -> jeton
TEXTE = {
    "2e2014": "ink", "f4ecdb": "on-ink", "6b573f": "ink-2", "8a7558": "sourd", "b3a182": "pale",
    "c65133": "terra-txt", "cc4830": "vermillon-txt", "9c2f1d": "rouge-txt",
    "d88418": "ambre-txt", "e0a32e": "gold-txt", "a87714": "gold-deep-txt",
    "7d9471": "sage-txt", "5d7252": "sage-deep-txt", "486090": "acier-txt",
}
FOND = {
    "f4ecdb": "paper", "ece1c8": "paper-deep", "efe5d0": "well", "e0d4ba": "paper-strong", "fbf6ea": "paper-light",
    "2e2014": "ink-block", "1d140b": "ink-block-hover",
    "c65133": "terra", "cc4830": "vermillon", "9c2f1d": "rouge", "e0a32e": "gold", "d88418": "ambre",
    "7d9471": "sage", "486090": "acier",
}
BORD = {
    "2e2014": "line", "f4ecdb": "on-ink", "6b573f": "ink-2", "8a7558": "sourd",
    "c65133": "terra", "cc4830": "vermillon", "9c2f1d": "rouge-txt", "e0a32e": "gold", "d88418": "ambre",
    "7d9471": "sage",
}
OMBRE = {
    "2e2014": "shadow", "c65133": "terra", "cc4830": "vermillon", "e0a32e": "gold", "d88418": "ambre",
    "7d9471": "sage", "486090": "acier", "9c2f1d": "rouge",
}

def role(prefixe):
    p = prefixe
    if p.startswith("ring-offset") or p in ("bg", "from", "via", "to"):
        return FOND
    if p.startswith(("border", "outline", "ring", "divide")):
        return BORD
    if p in ("shadow", "drop-shadow"):
        return OMBRE
    if p in ("text", "decoration", "accent", "fill", "stroke", "caret", "placeholder"):
        return TEXTE
    return None

def hex6(h):
    h = h.lower()
    return "".join(c * 2 for c in h) if len(h) == 3 else h

# Classe simple : text-[#2e2014] ou text-[#2e2014]/40
SIMPLE = re.compile(r"(?<![\w\[-])([a-z]+(?:-[a-z]+)*)-\[#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\](/[\d.]+)?(?![\w-])")
# Valeur arbitraire qui contient une couleur : shadow-[4px_4px_0_#2e2014], border-[rgba(46,32,20,.2)]
ARBITRAIRE = re.compile(r"(?<![\w\[-])([a-z]+(?:-[a-z]+)*)-\[([^\]\s\"'`]*?(?:#[0-9a-fA-F]{3,6}|rgba?\()[^\]\s\"'`]*)\]")
COULEUR = re.compile(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])|rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+%?)\s*)?\)")

reste = Counter()
faits = Counter()

def rgbvar(jeton, alpha=None):
    return f"rgb(var(--c-{jeton})/{alpha})" if alpha is not None else f"rgb(var(--c-{jeton}))"

def remplace_simple(m):
    prefixe, h, opa = m.group(1), hex6(m.group(2)), m.group(3) or ""
    table = role(prefixe)
    jeton = table.get(h) if table else None
    if not jeton:
        reste[f"{prefixe}-[#{h}]"] += 1
        return m.group(0)
    # Une ligne fine en encre (h-px, h-[2px]) reste une ligne : traitee par le passage "filets".
    faits[jeton] += 1
    return f"{prefixe}-{jeton}{opa}"

def remplace_arbitraire(m):
    prefixe, val = m.group(1), m.group(2)
    table = role(prefixe)
    if not table:
        return m.group(0)
    manque = []

    def coul(c):
        if c.group(1):
            h, a = hex6(c.group(1)), None
        else:
            h = "".join(f"{int(x):02x}" for x in c.group(2, 3, 4))
            a = c.group(5)
        jeton = table.get(h)
        if not jeton:
            manque.append(h)
            return c.group(0)
        faits[jeton] += 1
        return rgbvar(jeton, a)

    neuf = COULEUR.sub(coul, val)
    for h in manque:
        reste[f"{prefixe}-[...#{h}...]"] += 1
    return f"{prefixe}-[{neuf}]"

def traite(texte):
    texte = ARBITRAIRE.sub(lambda m: m.group(0) if SIMPLE.fullmatch(m.group(0)) else remplace_arbitraire(m), texte)
    texte = SIMPLE.sub(remplace_simple, texte)
    return texte

def main():
    racine = sys.argv[1]
    dry = "--dry" in sys.argv
    changes = 0
    for dossier, _, fichiers in os.walk(racine):
        if "node_modules" in dossier:
            continue
        for f in fichiers:
            if not f.endswith((".tsx", ".ts")) or f.endswith(".d.ts"):
                continue
            chemin = os.path.join(dossier, f)
            avant = open(chemin, encoding="utf-8").read()
            apres = traite(avant)
            if apres != avant:
                changes += 1
                if not dry:
                    open(chemin, "w", encoding="utf-8").write(apres)
    print(f"{changes} fichiers, {sum(faits.values())} couleurs remplacees")
    for k, v in faits.most_common():
        print(f"  {v:5} {k}")
    print("non touchees :")
    for k, v in reste.most_common():
        print(f"  {v:5} {k}")

if __name__ == "__main__":
    main()
