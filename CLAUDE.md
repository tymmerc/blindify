# Blindify - Architecture & Operations

> **Agent qui reprend le projet : lis `docs/README.md` EN PREMIER.** Il contient le manuel de bord
> (workflow de handoff local → relecture → prod, règles de code, pièges à ne pas casser, checklist de
> relecture, ton produit). Ce CLAUDE.md reste la référence technique détaillée (archi, ports, ops).

Music blind test multijoueur (Spotify/Deezer) avec modes solo, friends, event, streamer.

## Stack

- **Frontend** : Next.js 15 (static export `output: "export"`), React 19, Tailwind, socket.io-client, Fraunces (display serif) + Karla (UI)
- **Backend** : Node 20 + Express + TypeScript + socket.io 4.8 (Docker)
- **DB** : PostgreSQL 15 + Redis (Docker)
- **Reverse proxy** : nginx host (pas Docker) -> proxy vers conteneur backend

## Layout filesystem

```
/opt/blindify/
├── frontend/           # Next.js static export
│   ├── src/app/        # 28 routes
│   ├── src/components/
│   ├── src/lib/        # api.ts, socket.ts, types.ts (mirror of shared/), etc.
│   ├── e2e/            # Playwright tests
│   └── out/            # Build output (servi par nginx)
├── backend/            # Express + socket.io
│   └── src/
│       ├── socketHandlers.ts       # Tous les handlers socket
│       ├── controllers/            # roomsController, authController, etc.
│       ├── services/
│       │   ├── realtimeGame.ts     # State machine du jeu
│       │   ├── realtimeOrchestrator.ts  # Timers + emits
│       │   └── trackResolution.ts  # Hydratation Deezer
│       ├── types/game.ts           # Mirror of shared/src/game.ts
│       └── utils/session.ts
├── shared/             # CANONICAL types (game.ts, socket-events.ts)
│   └── src/            # Source of truth - duplicated into backend & frontend
├── tools/
│   └── check-shared-types.sh  # Validates the mirrors are in sync
├── maquettes/          # HTML mockups (servi sur dev.tymmerc.eu/blindify-maquettes)
└── docker-compose.yml
```

## Shared types (Phase 2 of refactor)

`shared/src/game.ts` is the canonical source. Two mirrors must stay in sync:
- `backend/src/types/game.ts`
- `frontend/src/lib/types.ts` (the section labeled "Canonical game types")

Run `bash tools/check-shared-types.sh` to verify all exported names exist in both mirrors. Add it to CI before merging.

To add a new shared type:
1. Add to `shared/src/game.ts`
2. Copy the declaration into both mirrors
3. Run the check script

## Deploy

**Frontend** : nginx sert directement `/opt/blindify/frontend/out/`. Pas de Docker pour le front.
```bash
cd /opt/blindify/frontend
unset __NEXT_PRIVATE_STANDALONE_CONFIG
PATH="./.node/bin:$PATH" npx next build
# Le `unset` est OBLIGATOIRE sinon basePath ignore
# Cache nginx : 5 min, hard refresh requis pour voir les changements
```

**Backend** : Docker. Code source montre en volume mais `dist/` est compile dans l'image.
```bash
cd /opt/blindify
docker compose build backend && docker compose up -d backend
# REBUILD obligatoire pour appliquer les changements de src/
# Logs : docker compose logs backend --tail=100
# Niveau de log : LOG_LEVEL=debug dans docker-compose.yml (deja set)
```

## Ports & URLs

- Frontend : `https://tymmerc.eu/blindify/`
- API : `https://tymmerc.eu/blindify/api/`
- Socket : `https://tymmerc.eu/blindify/socket.io/`
- Backend interne : `127.0.0.1:3000` (Docker port mapping)

nginx config : `/etc/nginx/sites-enabled/10-main.conf`. Upstream `blindify_backend = 127.0.0.1:3000`. Snippets `proxy-params.conf` (HTTP) et `proxy-params-ws.conf` (WebSocket upgrade).

## Auth flow (CRITIQUE - source de bugs)

1. Cookie : `blindify_session_token`, `httpOnly`, `secure`, `sameSite=None`, `domain=.tymmerc.eu`, `path=/`
2. Set par `POST /api/auth/guest` (controllers/authController.ts setSessionCookie)
3. Lu par socket dans le handshake (socketHandlers.ts extractSessionToken, ligne 62-72)
4. Lu par API HTTP via middleware express
5. **Le socket DOIT etre cree APRES que la session existe** (sinon handshake sans cookie -> "unauthorized")

## Socket flow (CRITIQUE)

`/opt/blindify/frontend/src/lib/socket.ts` : singleton lazy, `autoConnect: false`. Le `getSocket()` cree l'instance mais NE connecte PAS automatiquement.

`/opt/blindify/frontend/src/app/multiplayer/ModeLobbyView.tsx:339` : `useEffect` qui appelle `ensureSocket()` quand `userPayload?.user` existe. C'est CE point qui appelle `socket.connect()`. Cookie garanti present a ce moment.

**Ne JAMAIS** :
- Appeler `getSocket()` avec `autoConnect: true`
- Appeler `socket.connect()` avant que `userPayload` soit set
- Faire un retry workaround sur `connect_error` (cache le bug)

## Game state machine (backend)

`services/realtimeGame.ts` :
- `LOBBY` → `startNextRound` → `GUESSING` → `revealRound` → `REVEAL` → `markReady` (tous prets) → `startNextRound` → ...

Phase REVEAL → next GUESSING : declenche par `markReady` quand TOUS les joueurs `answerable` sont `isReady`. Si un joueur est `disconnected`, il est exclu de `answerable` (sinon il bloque tout le monde).

**Bug history** :
- `startNextRound` reinitialisait `disconnected = false` pour tous les joueurs au debut du round suivant. Resultat : un joueur deconnecte etait re-marque "actif" et bloquait `everyoneReady`. Fix : ne plus reset `disconnected`, ajouter `markReconnected` appele dans `room:join`, `game:answer`, `game:ready`, `game:sync`.

## Game flow (frontend)

`MultiplayerGameClient.tsx` :
- `useEffect` audio avec deps `[isAudioPhase, currentTrack?.previewUrl, muted, currentRound]` - le `currentRound` force le re-trigger meme si previewUrl ne change pas
- `audioManager.warmup()` appele au clic "Lancer" (host) et au premier clic dans le game (non-host) pour debloquer l'autoplay browser policy
- 3 inputs : Titre, Artiste, picker "Qui a ajoute ?" (avatars cliquables)

## Modes de jeu

- `solo` : joueur seul, tracks chargees client-side
- `friends` (terracotta `#c65133`) : multijoueur avec code, host cree la room
- `event` (or `#e0a32e`) : 1 ecran principal (presentateur), participants rejoignent
- `streamer` (sauge `#7d9471`) : 3 sub-modes (chat/streamer/both), encore en dev

Les accents de mode sont centralises dans `lib/uiTokens.ts` + `contexts/ModeContext.tsx`.

## DA (Design) — "Club analogique" (choisie 2026-06-10)

Reference canonique : `maquettes/explore-analog.html` · Guide complet : `maquettes/ANALOG-STYLE-GUIDE.md`

- Fond : papier creme `#f4ecdb` (theme CLAIR), grain papier global (body::after dans globals.css)
- Surfaces : cartes `#ece1c8` border encre `#2e2014`, puits/inputs `#efe5d0`
- Texte : encre `#2e2014` primary, `#6b573f` secondary, `#8a7558` muted
- Accents : terracotta `#c65133` (primaire), or `#e0a32e`, sauge `#7d9471`, erreur `#9c2f1d`
- Ombres : dures decalees (`4px 4px 0 rgba(46,32,20,.18)`), pas de glow
- Fonts : Fraunces (display serif, italiques pour accents) + Karla (UI)
- Motifs signature : modes = pochettes de vinyles (disque qui sort), platine `AnalogVinyl` en jeu, classement = tracklist a pointilles ("Face B · Classement")
- INTERDITS : fonds sombres, hex neon, glows, gradient text, glassmorphism (voir le guide)

## E2E tests

`/opt/blindify/frontend/e2e/` (Playwright). Base URL : `https://tymmerc.eu/blindify`.

Tests critiques :
- `multiplayer-2players.spec.ts` : flow complet 2 joueurs avec round 1 → reveal → round 2 → reveal → round 3
- `api-integration.spec.ts` : sessions, rooms, challenges, polling
- `all-flows.spec.ts` : navigation principale
- `bugfixes.spec.ts` : regressions

```bash
cd /opt/blindify/frontend
PATH="./.node/bin:$PATH" npx playwright test --reporter=line
# Browser deja installe : chromium-headless-shell-1217
```

**REFLEXE** : lancer les E2E AVANT de dire que c'est fait. Voir `feedback_e2e_reflex.md`.

## Pieges connus

1. **Backend rebuild Docker** : `docker compose restart` ne suffit pas, il faut `build` + `up -d`
2. **Frontend build env** : `unset __NEXT_PRIVATE_STANDALONE_CONFIG` AVANT `next build`
3. **Cache nginx** : 5 min sur les fichiers, hard refresh `Ctrl+Shift+R` pour voir les changements
4. **Cookie cross-domain** : ne pas changer `cookie domain` ou `sameSite` sans verifier les 2 endpoints (api + socket)
5. **Socket singleton** : `getSocket()` lazy avec `autoConnect: false`, connect explicite seulement quand `userPayload?.user` existe
6. **DA Club analogique** : toute nouvelle UI suit `maquettes/ANALOG-STYLE-GUIDE.md`. `MangaSpeakers` est mort (plus utilise).
7. **NODE_ENV=production** : tailwind/typescript doivent etre en `dependencies` pas `devDependencies` sinon le build container echoue

## Commandes utiles

```bash
# Logs backend en temps reel
docker compose logs -f backend

# Filtrer game logs
docker compose logs backend --tail=200 | grep -E "game:|round|reveal|answer|ready"

# Rebuild + restart backend
cd /opt/blindify && docker compose build backend && docker compose up -d backend

# Build + deploy frontend
cd /opt/blindify/frontend && unset __NEXT_PRIVATE_STANDALONE_CONFIG && PATH="./.node/bin:$PATH" npx next build

# Lancer un test E2E specifique
PATH="./.node/bin:$PATH" npx playwright test multiplayer-2players.spec.ts --reporter=line --retries=0

# Verifier que le code source est compile dans le container
docker compose exec backend cat /app/dist/services/realtimeGame.js | grep "disconnected"
```
