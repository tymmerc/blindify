# Blindify - Plan de refactoring

Plan progressif. Chaque phase est livrable independamment - tu peux t'arreter a la fin de n'importe laquelle et l'app reste stable.

## Statut d'execution (live)

- ✅ **Phase 1.1** : Tests integration disconnect/reconnect (14 tests, 52/52 pass)
- ✅ **Phase 1.2** : E2E retries 2→0, 9 waitForTimeout supprimes (16/17 pass)
- ✅ **Phase 2** : `/shared/src/` cree, mirrors backend/frontend, script `tools/check-shared-types.sh`
- ✅ **Phase 3** : Backend = source de verite. Fallbacks frontend supprimes
- ✅ **Phase 4a** : `useRoomChat` extraite (-48 lignes du composant, pattern valide)
- ✅ **Phase 5** : Routes mortes (`/menu`, `/playlists`, `/results`) + tests placeholder supprimes
- ⏸️ **Phase 4b-e** : Extractions `useGameSocket`, `useGameState`, `useLobbyState`, `useGuestBootstrap` reportees (touches au flow auth et socket central, risque eleve sans tests d'integration socket en plus)
- ⏸️ **Phase 6** : Tooling monorepo (optionnel)

## Pattern d'extraction de hook (Phase 4a, a reutiliser)

`useRoomChat(socket, roomCode)` dans `/opt/blindify/frontend/src/app/multiplayer/hooks/useRoomChat.ts` :
- Accepte `socket: Socket | null` et `roomCode: string | null` (null-safe)
- Attache/detache le listener `room:chat` quand les deps changent
- Reset le state quand `roomCode` change
- Expose `{ messages, sendChat }`

Pour extraire les hooks suivants, suivre le meme pattern :
1. Hook accepte les deps externes (socket, room, user) en parametres
2. Hook gere son propre useEffect cleanup
3. Hook expose un objet `{ state, actions }` au composant
4. Le composant remplace son state local et ses handlers par l'appel au hook


## Etat actuel (audit)

- **`ModeLobbyView.tsx`** : 1391 lignes, 15 useState, 22 useEffect, 19 useCallback. Fait : auth, bootstrap, socket setup, listeners, game state, lobby state, polling fallbacks, navigation, error handling.
- **Game state duplique en 3 endroits** : React `gameState`, backend `state` socket, DB. Le frontend reconstruit du state minimal dans `roundStartHandler` (lignes 536-547) avec des defaults hardcoded (20s, autoAdvance: false).
- **23 socket events** mais zero typage partage entre front/back. `GameMode` est un enum cote back et une string union cote front.
- **Tests** : 2810 lignes de tests jest backend (bonne base) mais `tests/integration/auth.spec.ts` ne contient que des placeholders (`expect(true).toBe(true)`). Zero test socket.io. E2E flakys avec 124 `waitForTimeout` et 2 retries qui masquent les bugs.
- **Code mort** : 3 routes redirect (`/menu`, `/playlists`, `/results`), 3 systemes CSS qui se chevauchent (`.surface`, `.glass-panel`, `.ma-card`), nginx `.stale`/`.broken` files.
- **Pas de monorepo tooling** : 3 `package.json` independents, lint/typecheck/test pas coordonnes.

---

## Phase 1 - Filet de securite (1 jour)

**Objectif** : pouvoir refactorer sans avoir peur de casser. Aucun changement de logique metier.

### 1.1 Tests d'integration backend (socket.io)

Creer `/opt/blindify/backend/tests/integration/multiplayer-socket.spec.ts` qui teste le flow complet **sans browser** :

```ts
// Pseudo-code
test("full game flow: 2 players, 3 rounds, all answer", async () => {
  const server = await startTestServer()
  const host = await connectClient(server, hostSession)
  const guest = await connectClient(server, guestSession)
  
  await host.emit("room:join", { roomCode })
  await guest.emit("room:join", { roomCode })
  await waitFor(() => host.lastState.players.length === 2)
  
  await api.startGame(roomCode)
  await waitFor(() => host.lastState.phase === "GUESSING")
  
  await host.emit("game:answer", { roomCode, guessTitle: "x" })
  await guest.emit("game:answer", { roomCode, guessTitle: "y" })
  await waitFor(() => host.lastState.phase === "REVEAL")
  
  await host.emit("game:ready", { roomCode })
  await guest.emit("game:ready", { roomCode })
  await waitFor(() => host.lastState.currentRound === 2)
  
  // ... 3 rounds total, then expect phase === "FINISHED"
})
```

**Couverture cible** :
- Round complet (guessing → reveal → next round)
- Disconnect mid-game (player marque disconnected, autre player peut continuer)
- Reconnect (player rejoint, recoit l'etat actuel)
- All-answered early reveal vs timer reveal
- Game finishes after N rounds

**Fichiers a creer** :
- `backend/tests/integration/multiplayer-socket.spec.ts` (~400 lignes)
- `backend/tests/integration/helpers/socket-test-client.ts` (~100 lignes)

**Pourquoi en premier** : si on touche `realtimeGame.ts` ou les handlers socket et qu'on casse quelque chose, ces tests le voient en 30 secondes, pas 5 minutes via Playwright.

### 1.2 Stabiliser les E2E

Remplacer dans tous les tests `e2e/*.spec.ts` :
- `await page.waitForTimeout(N)` → `await page.waitForSelector(selector, { timeout: N })` ou `expect(...).toBeVisible({ timeout: N })`
- Passer `retries: 2` → `retries: 0` dans `playwright.config.ts` (les flakys deviennent des fails, plus de masquage)

**Fichiers** :
- `frontend/e2e/full-flow.spec.ts` (9 waitForTimeout a remplacer)
- `frontend/e2e/multiplayer-2players.spec.ts` (~12 waitForTimeout)
- `frontend/playwright.config.ts:4`

**Critere de validation** : la suite E2E passe avec `retries: 0` sur 3 runs consecutifs.

---

## Phase 2 - Types partages (0.5 jour)

**Objectif** : un changement de payload socket ne peut plus diverger silencieusement.

### 2.1 Creer `/opt/blindify/shared/`

Nouveau package TypeScript avec les types canoniques. Pas besoin de monorepo formel - juste un dossier source path-aliase :

```
/opt/blindify/shared/src/
├── game.ts           # GameMode, GamePhase, PlayerState, GameState, RoundTrack
├── socket-events.ts  # ClientToServerEvents, ServerToClientEvents (types socket.io)
└── api.ts            # ApiResponse<T>, error codes
```

### 2.2 Wiring

**Backend** (`backend/tsconfig.json`) :
```json
"paths": { "@blindify/shared/*": ["../shared/src/*"] }
```

**Frontend** (`frontend/tsconfig.json`) :
```json
"paths": { "@blindify/shared/*": ["../shared/src/*"] }
```

### 2.3 Migration

Remplacer dans cet ordre :
1. `backend/src/types/game.ts` → re-export depuis `@blindify/shared/game`
2. `frontend/src/lib/types.ts` → re-export depuis `@blindify/shared/game` (supprimer les duplicates `MultiplayerGameState`, `MultiplayerPlayerState`)
3. Typer `socket.io` cote backend : `Server<ClientToServerEvents, ServerToClientEvents>` (socketHandlers.ts)
4. Typer cote frontend : `Socket<ServerToClientEvents, ClientToServerEvents>` (socket.ts)

**Critere** : `tsc` passe des deux cotes, et un changement de payload incoherent (ex: ajouter un champ obligatoire) breake immediatement le build.

---

## Phase 3 - Backend = source de verite unique (1 jour)

**Objectif** : supprimer la reconstruction de state cote frontend.

### 3.1 Supprimer le state minimal du `roundStartHandler`

`frontend/src/app/multiplayer/ModeLobbyView.tsx:524-560` reconstruit `MultiplayerGameState` avec des defaults hardcoded. Ca cause des bugs quand le `game:state` arrive avec les vrais champs.

**Action** : modifier le backend pour TOUJOURS emit `game:state` avant `game:round:start`. Puis supprimer le fallback frontend (lignes 530-545). Si `game:state` n'est pas arrive, le frontend skip le `roundStartHandler` (ne fait rien).

**Backend** : dans `realtimeOrchestrator.ts:84` (`startRoundAndBroadcast`), inverser l'ordre :
```ts
emitState(io, roomCode);     // 1. Emit complete state FIRST
emitRoundStart(io, state);   // 2. Then optimization event
```

**Frontend** : `roundStartHandler` devient un simple "trigger UI animation" sans toucher au state.

### 3.2 Supprimer les fallbacks `game:sync` et `stuck reveal retry`

`ModeLobbyView.tsx:255-294` polle l'horloge serveur et emet `game:sync` ou `game:ready` quand le state semble bloque. C'est un patchwork des bugs deja fixes.

**Action** : supprimer les deux useEffect. Le backend doit garantir l'avancement (timer reveal + auto-advance quand all ready). Si ca ne marche pas, les tests d'integration de la phase 1 le voient.

**Verification** : la phase 1 tests doivent toujours passer apres ces suppressions.

### 3.3 Supprimer le polling HTTP de room state

`ModeLobbyView.tsx:981-1001` poll `api.roomState()` toutes les 2.5s comme fallback. Avec le socket fiabilise, c'est inutile.

**Action** : supprimer cet useEffect. Garder juste le polling participants (le seul qui ait du sens si presence socket part en vrille).

**Critere** : tests integration backend + E2E passent sans fallback HTTP.

---

## Phase 4 - Extraction de hooks (1.5 jour)

**Objectif** : reduire `ModeLobbyView.tsx` de 1391 a ~400 lignes.

Order d'extraction (du plus isole au plus integre) :

### 4.1 `useGameSocket` (~150 lignes extraites)

```ts
// frontend/src/app/multiplayer/hooks/useGameSocket.ts
export function useGameSocket(roomCode: string | null, userId: number | null) {
  // socketRef, ensureSocket, attachSocketListeners
  // handlersRef cleanup
  // emit helpers: emitJoin, emitLeave, emitAnswer, emitReady, emitChat
  return { socket, connected, emit }
}
```

Sources : `ModeLobbyView.tsx:135-313, 454-668`.

### 4.2 `useGameState` (~200 lignes extraites)

```ts
// frontend/src/app/multiplayer/hooks/useGameState.ts
export function useGameState(socket: Socket | null, roomCode: string | null) {
  // gameState useState
  // listener: game:state, game:round:start, game:round:reveal, game:over
  // memos: scores, leaderboard
  return { gameState, scores, leaderboard }
}
```

Sources : `ModeLobbyView.tsx:501-621, 1012-1042`.

### 4.3 `useLobbyState` (~150 lignes extraites)

```ts
export function useLobbyState(socket: Socket | null, roomCode: string | null) {
  // participants, refreshParticipants, polling
  // chat messages
  // listener: room:presence, player-joined, room:chat
  return { participants, chatMessages, sendChat }
}
```

Sources : `ModeLobbyView.tsx:344-374, 470-499, 610-612`.

### 4.4 `useGuestBootstrap` (~80 lignes extraites)

```ts
export function useGuestBootstrap() {
  // checkAuth, ensureUserSession, redirects
  return { user, loading, error }
}
```

Sources : `ModeLobbyView.tsx:181-243, 928-979, 1110-1123`.

### 4.5 `useGameLifecycle` (~150 lignes extraites)

```ts
export function useGameLifecycle({ user, room, mode }) {
  // handleCreateRoom, joinRoomCode, handleStartGame, handleLeaveRoom
  return { createRoom, joinRoom, startGame, leaveRoom, starting, joining }
}
```

Sources : `ModeLobbyView.tsx:672-863, 1044-1062`.

**Apres extraction** : `ModeLobbyView` devient un composant qui orchestre les hooks, ~400 lignes pures de wiring + render.

**Verification** : tests E2E + integration passent sans modification.

---

## Phase 5 - Cleanup (0.5 jour)

**Objectif** : supprimer le code mort identifie dans l'audit.

### 5.1 Routes mortes

```bash
rm -rf /opt/blindify/frontend/src/app/menu
rm -rf /opt/blindify/frontend/src/app/playlists  
rm -rf /opt/blindify/frontend/src/app/results
```

Verifier qu'aucun lien interne ne pointe dessus avec `grep -r "/menu\|/playlists\|/results"`.

### 5.2 CSS legacy

`/opt/blindify/frontend/src/app/globals.css` :
- Lignes 105-122 : supprimer les classes `.surface`, `.surface-strong` (0 usages confirmes)
- Lignes 229-374 : auditer chaque `.ma-*` class avec `grep -r "ma-card\|ma-stat\|ma-btn"` ; supprimer celles non utilisees
- Garder uniquement le systeme `--app-*` + classes Tailwind

### 5.3 Configs nginx stale

```bash
rm /etc/nginx/sites-enabled/tymmerc.stale
rm /etc/nginx/sites-enabled/tymmerc.bak.stale
rm /etc/nginx/nginx.conf.broken
rm /etc/nginx/nginx.conf.20260122_092806.broken
```

### 5.4 Tests integration backend placeholders

`/opt/blindify/backend/tests/integration/auth.spec.ts` : remplacer les `expect(true).toBe(true)` par des vrais tests, ou supprimer le fichier (les vrais tests existent dans `controllers/authController.spec.ts`).

---

## Phase 6 - Tooling monorepo (optionnel, 0.5 jour)

**Si** le projet doit etre maintenu longtemps :

### 6.1 pnpm workspaces

`/opt/blindify/pnpm-workspace.yaml` :
```yaml
packages:
  - frontend
  - backend
  - shared
  - e2e-dashboard
```

`/opt/blindify/package.json` (root) :
```json
{
  "scripts": {
    "lint": "pnpm -r lint",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "build": "pnpm --filter shared build && pnpm -r --parallel build"
  }
}
```

### 6.2 Pre-commit hook

`.husky/pre-commit` : run lint + typecheck sur les fichiers staged.

---

## Verification end-to-end

A chaque phase :

```bash
# Backend
cd /opt/blindify/backend
npm test                     # jest unit + integration

# Frontend
cd /opt/blindify/frontend
unset __NEXT_PRIVATE_STANDALONE_CONFIG
PATH="./.node/bin:$PATH" npx next build
PATH="./.node/bin:$PATH" npx playwright test --reporter=line --retries=0

# Manual smoke test
# - Lobby creation host
# - Guest join via /friends?join=CODE
# - 3 rounds with answers
# - Disconnect/reconnect mid-game
```

## Critere d'arret possible

Tu peux t'arreter a la fin de :
- **Phase 1** : tu as un filet de securite. Le code reste comme aujourd'hui mais tu peux le toucher en confiance.
- **Phase 2** : types partages. Plus de divergence silencieuse front/back. Les bugs deviennent build errors.
- **Phase 3** : socket fiable. Tous les hacks de fallback supprimes. C'est la phase qui fixe les vrais bugs de gameplay.
- **Phase 4** : ModeLobbyView decoupe. Le code devient maintenable.
- **Phase 5/6** : polish.

## Fichiers critiques touches

| Phase | Fichier | Action |
|-------|---------|--------|
| 1 | `backend/tests/integration/multiplayer-socket.spec.ts` | Cree |
| 1 | `frontend/playwright.config.ts:4` | retries 2→0 |
| 2 | `shared/src/{game,socket-events,api}.ts` | Cree |
| 2 | `backend/src/types/game.ts` | Re-export |
| 2 | `frontend/src/lib/types.ts` | Re-export |
| 3 | `backend/src/services/realtimeOrchestrator.ts:84-102` | Inverser ordre emit |
| 3 | `frontend/src/app/multiplayer/ModeLobbyView.tsx:255-294, 524-547, 981-1001` | Supprimer fallbacks |
| 4 | `frontend/src/app/multiplayer/hooks/*.ts` | 5 nouveaux hooks |
| 4 | `frontend/src/app/multiplayer/ModeLobbyView.tsx` | 1391 → ~400 lignes |
| 5 | `frontend/src/app/{menu,playlists,results}/` | Supprimer |
| 5 | `frontend/src/app/globals.css` | Cleanup legacy |
| 5 | `/etc/nginx/*.stale|broken` | Supprimer |
| 6 | `pnpm-workspace.yaml`, `package.json` racine | Cree (optionnel) |
