# PITFALLS - les zones fragiles à NE PAS casser

> Le doc le plus important du dossier. Chaque point ici a déjà causé un bug réel en prod.
> Si tu dois toucher une de ces zones, lis le détail dans [`../CLAUDE.md`](../CLAUDE.md) d'abord, et préviens dans ton handoff.

## 1. Ordre de connexion du socket (cause n°1 de "unauthorized")

Le socket DOIT être connecté **après** que la session cookie existe.

- Le cookie `blindify_session_token` est posé par `POST /api/auth/guest`.
- Le socket le lit dans le handshake. Pas de cookie au handshake = connexion refusée.
- Point de connexion légitime : `frontend/src/app/multiplayer/ModeLobbyView.tsx` (~ligne 339), un `useEffect` qui appelle `ensureSocket()` seulement quand `userPayload?.user` existe.

**Ne JAMAIS :**
- créer le socket avec `autoConnect: true`,
- appeler `socket.connect()` avant que `userPayload` soit set,
- ajouter un retry/workaround sur `connect_error` (ça masque le vrai bug d'ordre).

Le singleton socket vit dans `frontend/src/lib/socket.ts` (lazy, `autoConnect: false`).

## 2. Machine à états REVEAL → GUESSING (cause des déconnexions en partie)

Fichier : `backend/src/services/realtimeGame.ts`. Flow : `LOBBY → GUESSING → REVEAL → (tous prêts) → GUESSING → ...`

Le passage REVEAL → round suivant se déclenche quand TOUS les joueurs `answerable` sont `isReady`.

- Un joueur `disconnected` doit rester **exclu** de `answerable`, sinon il bloque `everyoneReady` et toute la partie gèle.
- **Ne pas remettre `disconnected = false`** au début d'un round. Un bug historique faisait exactement ça : un joueur parti était re-marqué actif et bloquait tout le monde.
- La reconnexion est gérée par `markReconnected`, appelé dans `room:join`, `game:answer`, `game:ready`, `game:sync`.

C'est pour cette raison que le "raccord entre manches" visuel a été fait en version légère (un badge de round qui pulse) plutôt qu'une transition qui toucherait cette logique. **Ne refais pas une transition de phase visuelle qui modifie le timing serveur sans test 2 joueurs derrière.**

## 3. Service workers fantômes (cause de "rien ne change malgré le déploiement")

Un ancien service worker PWA a déjà servi du cache périmé : l'utilisateur voyait l'ancienne app malgré un déploiement réussi.

- Des SW auto-destructeurs sont en place : `frontend/public/sw.js`, `frontend/public/service-worker.js`, et un script inline dans `frontend/src/app/layout.tsx` qui désenregistre les SW et vide les caches.
- **Ne réintroduis pas de service worker / PWA / cache offline** sans décision explicite.
- Si on te dit "je ne vois aucun changement" : suspecte le **cache (nginx 5 min) ou un SW** AVANT de soupçonner ton code. Hard refresh `Cmd+Shift+R`.

## 4. Build env du frontend (cause de basePath ignoré)

Avant tout `next build` :

```bash
unset __NEXT_PRIVATE_STANDALONE_CONFIG    # sinon le basePath /blindify est ignoré → app cassée
unset NODE_ENV
```

Le frontend est un **static export** (`output: "export"`, `basePath: "/blindify"`). Pas de SSR, pas de route API Next, pas de `next/image` optimisé (déjà `unoptimized: true`).

## 5. Types partagés dupliqués à la main

`shared/src/game.ts` est la source canonique, **copiée à la main** dans :
- `backend/src/types/game.ts`
- `frontend/src/lib/types.ts` (section "Canonical game types")

Si tu modifies un type partagé : édite les 3, puis lance `bash tools/check-shared-types.sh`. Il n'y a pas de CI qui te rattrapera.

## 6. NODE_ENV=production côté backend (cause de build image cassé)

Le conteneur backend tourne en `NODE_ENV=production`. Conséquence : tout ce qui sert au build (tailwind, typescript) doit être en `dependencies`, pas `devDependencies`, sinon le build Docker échoue. Vrai pour le front aussi si on conteneurise.

## 7. Backend = rebuild obligatoire

Le code backend est compilé en `dist/` **dans l'image** Docker. Un `docker compose restart` ne suffit pas pour appliquer un changement de `src/`. Il faut `build` + `up -d`. (Mais rappel : ce n'est PAS toi qui déploies, voir DEPLOY.md.)

## 8. Le conteneur `blindify-frontend` est orphelin

Il existe un conteneur Docker `blindify-frontend` (port 3001) qui tourne mais **ne sert PAS la prod**. La prod est servie par nginx depuis `/opt/blindify/frontend/out/` (statique). Ne te fie pas à ce conteneur, ne le prends pas comme source de vérité.

## 9. Cookie cross-domain

Cookie `blindify_session_token` : `httpOnly`, `secure`, `sameSite=None`, `domain=.tymmerc.eu`, `path=/`. Ne change ni `domain` ni `sameSite` sans vérifier les DEUX points de lecture (API HTTP middleware + handshake socket). Une erreur ici casse l'auth partout.

## 10. Audio (autoplay browser policy)

`frontend/src/lib/audioManager.ts` : l'élément `<audio>` débloqué par le premier geste utilisateur DOIT être réutilisé (`play()` réutilise `this.audio`, `stop()` ne le met pas à `null`). Si tu recrées un `new Audio()` à chaque lecture, tu reperds le déblocage autoplay et le son ne part plus. `warmup()` est appelé au clic "Lancer" (host) et au premier clic en jeu (non-host).
