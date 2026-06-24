# REVIEW-CHECKLIST - la grille du relecteur

> C'est exactement ce que l'agent VPS vérifie avant d'accepter ton code et de le déployer.
> Auto-évalue-toi dessus AVANT de pousser. Chaque case décochée = un aller-retour en moins.

## Build & types

- [ ] `next build` du frontend passe sans erreur TS (avec `unset __NEXT_PRIVATE_STANDALONE_CONFIG` et `unset NODE_ENV`).
- [ ] Pas de `any` introduit, pas de `@ts-ignore` ajouté sans commentaire justifiant.
- [ ] Si un type partagé a changé : les 3 copies sont à jour et `tools/check-shared-types.sh` passe.

## Tests

- [ ] `vitest run` vert côté frontend (et backend si tu y as touché).
- [ ] Si la boucle de jeu / lobby / socket est touchée : E2E `multiplayer-2players.spec.ts` lancé et vert (ou raison explicite si non lançable en local).
- [ ] Aucun test désactivé/skippé pour faire passer la suite.

## Régressions (PITFALLS)

- [ ] L'ordre de connexion socket n'est pas modifié (pas d'`autoConnect`, pas de `connect()` prématuré, pas de retry sur `connect_error`).
- [ ] La logique REVEAL→GUESSING / `disconnected` / `answerable` n'est pas touchée (ou alors testée à 2 joueurs).
- [ ] Aucun service worker / cache offline réintroduit.
- [ ] Cookie (`domain`, `sameSite`) inchangé, ou les 2 points de lecture vérifiés.
- [ ] `audioManager` : l'élément `<audio>` est toujours réutilisé, pas recréé à chaque `play()`.

## Code

- [ ] Pas de mutation en place (state React et objets : copies immutables).
- [ ] Erreurs gérées explicitement, pas de `catch` muet. Messages UI clairs.
- [ ] Entrées externes validées à la frontière.
- [ ] Pas de `console.log` de debug oublié.
- [ ] Fonctions courtes, pas d'imbrication > 4 niveaux. Pas de fichier qui explose au-delà de 800 lignes (sauf dette déjà connue, non aggravée).

## Design (Club analogique)

- [ ] Aucun fond sombre, hex néon, glow, gradient text, glassmorphism, `backdrop-blur` introduit.
- [ ] Tokens de la palette respectés ; sauge `#7d9471` utilisé pour les confirmations/succès.
- [ ] Ombres dures (`Xpx Xpx 0`), fonts Fraunces/Karla, accent de mode correct.
- [ ] Accessibilité conservée (aria-label, alt, focus visible).
- [ ] `globals.css` / `tailwind.config.ts` / `layout.tsx` non modifiés pour du décoratif.

## Contenu

- [ ] **Zéro tiret cadratin (—)** dans le diff entier (code, commentaires, commits, copie UI).
- [ ] Copie UI française, ton naturel, pas de jargon IA.
- [ ] Pas de réintroduction de comptes / login.

## Sécurité

- [ ] Aucun secret en dur (clé, token, mot de passe). Tout via `.env`.
- [ ] Aucun `.env` réel dans le diff (seul `.env.example` est suivi).
- [ ] Endpoints sensibles : validation + rate limiting respectés.

## Git

- [ ] Branche feature partie de `wip-checkpoint-juin`, `main` non touchée.
- [ ] Commits atomiques, messages conventional commits sans em-dash, pas de `Co-Authored-By`.
- [ ] Pas de `out/`, `node_modules/`, `dist/`, ni `.env` commités.
- [ ] Handoff écrit : ce que ça fait, ce qui est testé, les risques, les décisions ouvertes.

Si une case ne peut pas être cochée, ne la masque pas : dis-le dans le handoff. Un point signalé est traité, un point caché devient un bug en prod.
