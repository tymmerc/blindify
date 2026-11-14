#!/usr/bin/env python3
"""T30, troisieme passage : CSS ecrit dans des chaines (theaterStyles de
TheaterGameView, <style jsx> de SoloGameClient). Meme logique par propriete :
texte, fond, trait, ombre. Les jetons sont ecrits en rgb(var(--c-*)) pour ne
pas dependre des variables locales du bloc (theaterStyles redefinit --line).

    python3 tools/t30-codemod-css.py <fichier> <debut> <fin>   (lignes, incluses)
"""
import re
import sys

# Les ${X} contiennent une accolade : remplaces par @@X@@ le temps du traitement.
INK, PAPER, TERRA, GOLD = "@@INK@@", "@@PAPER@@", "@@TERRA@@", "@@GOLD@@"

def tok(nom, a=None):
    return f"rgb(var(--c-{nom}) / {a})" if a else f"rgb(var(--c-{nom}))"

TEXTE = {INK: tok("ink"), PAPER: tok("on-ink"), TERRA: tok("terra-txt"), "#2e2014": tok("ink"),
         "#6b573f": tok("ink-2"), "#8a7558": tok("sourd"), "#b3a182": tok("pale"), "#f4ecdb": tok("on-ink")}
FOND = {INK: tok("ink-block"), PAPER: tok("paper"), "#f4ecdb": tok("paper"), "#ece1c8": tok("paper-deep"),
        "#efe5d0": tok("well"), "#2e2014": tok("ink-block")}
BORD = {INK: tok("line"), "#2e2014": tok("line"), PAPER: tok("on-ink")}
OMBRE = {INK: tok("shadow"), "#2e2014": tok("shadow")}
RGBA = {  # role -> triplet clair -> jeton
    "fond": {"46,32,20": "line", "236,225,200": "paper-deep", "244,236,219": "paper"},
    "bord": {"46,32,20": "line"},
    "ombre": {"46,32,20": "shadow"},
    "texte": {"46,32,20": "ink"},
}
VARS = {"--ink": tok("ink"), "--paper": tok("paper"), "--paper-deep": tok("paper-deep"), "--well": tok("well"),
        "--muted": tok("sourd"), "--soft": tok("ink-2")}

DECL = re.compile(r"(?<![\w-])(--[\w-]+|color|background(?:-color)?|border(?:-(?:top|bottom|left|right))?(?:-color)?|outline|box-shadow)\s*:\s*([^;}]+)")

def role(prop):
    if prop in ("color",):
        return "texte"
    if prop.startswith("background"):
        return "fond"
    if prop.startswith(("border", "outline")):
        return "bord"
    if prop == "box-shadow":
        return "ombre"
    return None

def remplace_valeur(val, r):
    table = {"texte": TEXTE, "fond": FOND, "bord": BORD, "ombre": OMBRE}[r]
    def rgba(m):
        trip = ",".join(x.strip() for x in m.group(1).split(","))
        j = RGBA[r].get(trip)
        return tok(j, m.group(2)) if j else m.group(0)
    val = re.sub(r"rgba\(\s*(\d+\s*,\s*\d+\s*,\s*\d+)\s*,\s*([\d.]+)\s*\)", rgba, val)
    # Couleurs entieres : ${INK} ou #hex isoles (pas dans un degrade d'objet dessine)
    if "gradient" in val:
        return val
    for k, v in table.items():
        val = re.sub(re.escape(k) + r"(?![0-9a-fA-F])", v, val)
    return val

def traite_bloc(css):
    out = []
    # Par regle { ... } pour connaitre le fond du bloc (texte sur or = encre fixe).
    for regle in re.split(r"(?<=\})", css):
        sur_or = re.search(r"background\s*:\s*@@GOLD@@", regle) is not None
        def decl(m):
            prop, val = m.group(1), m.group(2)
            if prop in VARS and (INK in val or PAPER in val or "#" in val):
                return f"{prop}:{VARS[prop]}"
            if prop == "--line":
                return f"{prop}:{tok('line', '.22')}"
            r = role(prop)
            if not r:
                return m.group(0)
            if r == "texte" and sur_or and val.strip() in (INK, "#2e2014"):
                return f"{prop}:{tok('on-accent')}"
            return f"{prop}:{remplace_valeur(val, r)}"
        regle = DECL.sub(decl, regle)
        out.append(regle)
    return "".join(out)

def main():
    chemin, debut, fin = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
    lignes = open(chemin, encoding="utf-8").read().split("\n")
    bloc = "\n".join(lignes[debut - 1:fin])
    masque = re.sub(r"\$\{(\w+)\}", r"@@\1@@", bloc)
    neuf = re.sub(r"@@(\w+)@@", r"${\1}", traite_bloc(masque))
    lignes[debut - 1:fin] = neuf.split("\n")
    open(chemin, "w", encoding="utf-8").write("\n".join(lignes))
    print(f"{chemin} : {sum(1 for a, b in zip(bloc.split(chr(10)), neuf.split(chr(10))) if a != b)} lignes changees")

if __name__ == "__main__":
    main()
