# Club Analogique — Guide de conversion UI

Référence canonique : `maquettes/explore-analog.html` (maquette validée par l'owner).
Pattern de référence dans la vraie app : `frontend/src/app/modes/page.tsx` (déjà converti).
La fondation (tokens, fonts, tailwind) est DÉJÀ en place. Ta mission : convertir les pages/composants listés, **restyler sans toucher à la logique**.

## Palette (hex exacts)

| Rôle | Valeur |
|---|---|
| Fond papier (body, déjà posé) | `#f4ecdb` |
| Surface carte | `#ece1c8` |
| Puits / input boxé | `#efe5d0` |
| Encre (texte, bordures fortes) | `#2e2014` |
| Texte secondaire | `#6b573f` |
| Muted / labels | `#8a7558` |
| Terracotta (action primaire, accent) | `#c65133` |
| Or (accent secondaire) | `#e0a32e` |
| Sauge (succès, 3e accent) | `#7d9471` |
| Bleu-gris (4e accent) | `#a8b8c8` |
| Erreur | `#9c2f1d` |

Mapping couleurs de mode : friends → terracotta `#c65133` · event → or `#e0a32e` · streamer → sauge `#7d9471` · solo → bleu-gris `#a8b8c8`.

## Typo

- **Titres** : `font-display` (Fraunces, déjà branchée) `font-semibold`. Accent possible : `<em>` italique terracotta (voir modes).
- **Labels/micro** : Karla bold caps → `text-[11px] font-bold uppercase tracking-[0.22em] text-[#8a7558]`. **Remplacer les `font-mono`** par ça (sauf vrais chiffres tabulaires : timer peut rester chiffres Fraunces).
- **Body** : Karla = `font-sans` par défaut, rien à faire.

## Recettes composants

- **Bouton primaire** : classe globale `btn-neon` (déjà restylée terracotta + ombre dure) OU inline `bg-[#c65133] text-[#f4ecdb] border-2 border-[#2e2014] shadow-[4px_4px_0_#2e2014] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0_#2e2014] font-bold rounded-md`.
- **Bouton secondaire** : pareil avec `bg-[#2e2014] text-[#f4ecdb]`.
- **Pill/ghost** : `rounded-full border-[1.5px] border-[#2e2014] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]` (fond accent + texte papier si actif).
- **Carte** : `bg-[#ece1c8] border-2 border-[#2e2014] shadow-[4px_4px_0_rgba(46,32,20,.18)] rounded-md` (variante douce : `border-[1.5px] border-[rgba(46,32,20,.22)]`).
- **Input** : souligné `bg-transparent border-0 border-b-2 border-[#2e2014] focus:border-[#c65133] font-display text-lg placeholder:italic placeholder:text-[#b3a182]` ; ou boxé `bg-[#efe5d0] border-[1.5px] border-[rgba(46,32,20,.35)]`.
- **Avatars** : ronds `border-2 border-[#2e2014] bg-[#f4ecdb]`, sélectionné = `bg-[#c65133] text-[#f4ecdb]` + ring.
- **Vinyle/platine** : `style={{background:"repeating-radial-gradient(circle at 50% 50%, #241a10 0 2.5px, #3a2a1a 2.5px 5px)"}}`, label centre terracotta/or bordé encre, trou papier, `animation: vinyl-spin Xs linear infinite` (keyframes déjà dans globals.css). Bras de lecture optionnel (voir maquette).
- **Classement** : tracklist à pointillés : nom + `flex-1 border-b-2 border-dotted border-[rgba(46,32,20,.45)]` + points. Titre de section "Face B · Classement" possible.
- **Timer** : gros chiffres Fraunces bold (`font-display font-bold`).

## Interdits (à supprimer au passage)

- Fonds sombres hardcodés : `#0a0014`, `#09090b`, `#0f051e`, `#111113`, `rgba(15,5,30,…)`, `rgba(22,30,55,…)`, `rgba(12,18,35,…)` etc. Le body fournit le papier : un conteneur de page ne met PAS de fond, ou `transparent`.
- Hex néon : `#ff2ec8`, `#00f7ff`, `#a855f7`, `#ec4899`, `#8b5cf6`, `#f97316`, `#ffea00` → remapper sur terracotta/or/sauge selon le rôle.
- `shadow-glow*`, `text-glow*`, `scanlines`, `neon-*`, `backdrop-blur` sur panneaux sombres, gradient text (`bg-clip-text text-transparent`), `--neon-*`.
- `text-white`, `text-white/70`, `border-white/10`… → équivalents encre : `text-[#2e2014]`, `text-[#6b573f]`, `border-[rgba(46,32,20,.22)]`.

## Règles d'or

1. **ZÉRO changement de logique** : hooks, handlers, state, socket, routing intouchables. Tu changes className/style/JSX décoratif uniquement. Si un élément décoratif néon n'a pas d'équivalent (blob, grille), supprime-le proprement.
2. Pas de nouveau package, pas d'édition de `globals.css` / `tailwind.config.ts` / `layout.tsx` (fondation déjà faite).
3. Conserve l'accessibilité (aria, labels, alt).
4. Copie française inchangée sauf si elle décrit du néon.
5. Reste DANS ta liste de fichiers. Ne touche à rien d'autre.
