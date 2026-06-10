# Guide de conversion UI — DA Hybride (sobre / néon)

But : finaliser la DA **Hybride** sur toute l'app Blindify. Direction validée par l'owner.
Référence visuelle : `maquettes/direction-C-hybride.html` + `maquettes/directions-index.html`.

## La règle (une seule)

- **Écrans utilitaires / navigation** = SOBRE editorial dark. (modes, solo, stats, settings, profile, history, friends lobby, login…)
- **Écrans de jeu** = NÉON (le fun s'allume). On NE touche pas, ils sont déjà gérés par `.neon-stage`.

## Le patron de référence : `src/app/modes/page.tsx`

La page `modes` est DÉJÀ convertie et validée. **Copie son pattern exactement.** Ne réinvente pas une direction.

Pattern sobre :
- Conteneur racine : `className="tech-grid ..."` (fond noir + grille technique fine, fournie par globals.css).
- Fond : `#09090b` (var `--app-bg`). Surfaces cartes : `var(--app-surface)` (#111113), bordure `rgba(255,255,255,0.07)`.
- Titre H1 : blanc `#fafafa`, `font-semibold`, `tracking-[-0.02em]`, **sentence case**, AUCUN glow/gradient.
- Micro-labels : `font-mono text-[11px] uppercase tracking-[0.22em] text-[#71717a]` (ex: "SELECT · MODE").
- Texte secondaire / muted : `#71717a`.
- Accent unique : violet `#8b5cf6` (var `--app-primary`). La couleur "de marque" d'un item (ex: rose friends, orange streamer) se garde UNIQUEMENT en touche discrète : petite icône teintée, ou bordure de pill fine. Jamais en glow/gradient/fond saturé.
- Bouton primaire : blanc sur noir (`background:#fafafa; color:#09090b`), ou state désactivé `rgba(255,255,255,0.06)`.
- Pills : `font-mono text-[10px] uppercase`, bordure fine.

## Do / Don't

DON'T (sur les pages utilitaires) :
- ❌ `text-glow`, `text-glow-pink`, `text-glow-cyan` (ces classes existent mais dégradent en sobre hors `.neon-stage` — évite-les quand même).
- ❌ gradients de texte, titres en `text-transparent bg-clip-text`.
- ❌ corner brackets arcade, scanlines, box-shadow néon.
- ❌ blobs de couleur, fonds `#0a0014` ou bleu-nuit, glows magenta/cyan.
- ❌ `MangaSpeakers` (composant néon décoratif, retiré de modes — ne le remets pas sur les pages sobres).

DO :
- ✅ `tech-grid` sur le conteneur racine pour le fond.
- ✅ tokens `--app-*` (déjà sobres) + classes Tailwind sobres.
- ✅ profondeur par les surfaces (3 niveaux), pas par la couleur.
- ✅ couleur d'accent = violet, parcimonie.

## Système déjà en place (`src/app/globals.css`)

- `:root --app-*` = tokens sobres (déjà fait).
- `.tech-grid::before` = grille technique fine masquée sur les bords.
- `.neon-stage` = scope néon pour les écrans de jeu (NE PAS toucher).
- `src/app/layout.tsx` = fond global sobre `#09090b` (le blob magenta global a été retiré).

## Pages à convertir (ordre suggéré, du plus simple au plus dense)

1. `src/app/settings/page.tsx` + `settings/providers/page.tsx`
2. `src/app/profile/page.tsx`
3. `src/app/solo/page.tsx` (dense : formulaire de setup)
4. `src/app/stats/page.tsx` (dense : dashboard)
5. `src/app/history/page.tsx`
6. `src/app/friends/page.tsx` + le lobby `src/app/multiplayer/` (la partie LOBBY/attente, pas l'écran de jeu)
7. `src/app/event/page.tsx`, `src/app/streamer/page.tsx` (setup, sobre ; l'écran de jeu reste néon)
8. `src/app/landing/*` — décider avec l'owner (le hero peut rester plus expressif)

Déjà sobres (ne pas toucher) : `chrono`, `challenge`, `auth/login`.

## Boucle de travail (par page)

1. Convertir la page en suivant le patron `modes`.
2. `cd frontend && unset __NEXT_PRIVATE_STANDALONE_CONFIG && PATH="./.node/bin:$PATH" npx tsc --noEmit` (doit passer).
3. Build local + screenshot pour validation visuelle AVANT prod (la prod tourne sur le build stable, voir [[feedback_dev_avant_prod]]).
4. Faire valider par l'owner (lien screenshot sur dev.tymmerc.eu/blindify-maquettes/).
5. Quand toutes les pages sont faites + validées : build complet + déploiement prod d'un coup (cohérent).

## Déploiement (rappel)

- Frontend servi par nginx host depuis `/opt/blindify/frontend/out/`. **Build = deploy.**
- Build : `cd frontend && unset __NEXT_PRIVATE_STANDALONE_CONFIG && PATH="./.node/bin:$PATH" npx next build`.
- Tant que la conversion n'est pas finie/validée : garder la prod sur le build stable, montrer des aperçus locaux. Voir `blindify_project_state` en mémoire.
