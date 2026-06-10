# Brief design — exploration de nouvelles directions (Blindify)

> Lu par le modèle qui reprend après un `/model` (il a tout le contexte du chat précédent).

## Mission

L'owner **en a marre de la DA actuelle**. Les deux directions déjà essayées le lassent :
- **Néon arcade** (synthwave pink/cyan, glows) — trop chargé.
- **Sobre editorial dark** (#09090b + violet + grille) — la page `modes` a été convertie ainsi mais ça ne l'emballe plus.

**Ta mission : DÉCIDER toi-même plusieurs directions visuelles franchement différentes** (pas juste des variantes du sobre/néon), les produire en maquettes comparables, et les présenter à l'owner pour qu'il choisisse. C'est TOI qui proposes les moods, ne lui demande pas en abstrait — montre-lui du concret.

Vise ~4 directions **maximalement distinctes** entre elles ET des deux déjà vues. Engage chaque mood à fond, pas de demi-mesure.

## Règles non négociables (mémoire design de l'owner)

- ❌ Aucun look "AI-generic SaaS". Le résultat doit passer pour designé par un humain.
- ❌ Pas de texte en gradient, pas de glassmorphism, pas de gradient purple→blue/cyan, pas de hero centré générique titre+sous-titre+2 CTA.
- ❌ Pas de fade-in basique au scroll (2018). Si motion, du vrai scroll-scrub / pinned.
- ✅ Décisions de couleur/typo intentionnelles (palette max 3 couleurs + 1 accent ; 1-2 fonts).
- ✅ Le produit (l'écran de jeu) doit être au cœur, pas un blob déco.

Détails dans la mémoire : `feedback_no_ai_design`, `blindify_design_decisions`, et les règles `~/.claude/rules/common/frontend-design.md`.

## Contenu à reproduire dans CHAQUE maquette (pour comparer le mood, pas le contenu)

Une maquette HTML autonome par direction (inline CSS, fonts via `<link>` Google Fonts, desktop 1440 + responsive). Un petit tag fixe en haut à gauche nommant la direction.

**Écran 1 — Sélecteur de mode :**
- Micro-label "SELECT · MODE", titre "Comment tu veux jouer ?", sous-titre "Choisis ton terrain. Le reste suit."
- 4 modes : "Jouer avec des amis" (Social/Multi), "Jouer en événement" (Live/Présentateur), "Mode Streamer" (Twitch/Bientôt), "Solo" (Rapide).
- CTA primaire "Lancer une partie".

**Écran 2 — Écran de jeu (scroll) :**
- Vinyle/cover qui tourne, timer "0:14", 3 inputs (Titre, Artiste, "Qui l'a ajouté ?" avec avatars), scoreboard 5 joueurs : Tym 240, Lucie 210, Marc 180, Jo 150, Sarah 120.

Copie en français.

## Pistes de mood (à toi de choisir/affiner — exemples, pas une commande)

Brutalist poster (type condensé géant + 1 couleur acide) · Y2K music-player (chrome/gloss nostalgie iPod-Winamp) · Analog/vinyl chaud (papier crème, encre, terracotta, serif + grain) · Maximalist sticker/Wrapped (blocs saturés, collage) · Bauhaus géométrique · Riso/print · etc. Choisis ce qui te semble fort pour un blind-test musical social.

## Livrables + workflow

1. Écris les maquettes dans `/opt/blindify/maquettes/explore-*.html` + une page index `explore-index.html`.
2. Screenshot chaque maquette (Playwright dispo dans `frontend/`, voir comment c'est fait dans l'historique : serveur statique local + chromium) OU sert-les via dev nginx (`dev.tymmerc.eu/blindify-maquettes/` → alias `/opt/blindify/maquettes/`).
3. Donne à l'owner des **liens cliquables** (il ne voit PAS les images que tu lis toi-même — il faut une URL).
4. Itère avec lui jusqu'à ce qu'il choisisse une direction.

## État technique (ne PAS casser)

- Backend : 140/140 tests, persistance multi + validation socket LIVE en prod. Sync 5 joueurs prouvée. Ne touche pas au backend.
- Frontend prod : servi par nginx depuis `frontend/out/`. **Build = deploy.** Tant que la nouvelle DA n'est pas choisie + validée, **garder la prod sur le build stable**, montrer des aperçus locaux/dev. `dev_avant_prod` est une règle CRITIQUE.
- Branche de travail : `wip-checkpoint-juin`. Commits récents : système hybride + page modes sobre (e5b073f) — l'owner repart sur autre chose, donc cette conversion sobre est **en suspens**, pas la cible.
- Build frontend : `cd frontend && unset __NEXT_PRIVATE_STANDALONE_CONFIG && PATH="./.node/bin:$PATH" npx next build`.

Voir la mémoire `blindify_project_state` pour le contexte complet.
