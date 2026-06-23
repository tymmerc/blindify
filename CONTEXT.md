# CONTEXT — Blindify Web

> État du projet à destination de l'agent orchestrateur. Rédigé le 2026-06-23 par l'agent d'exécution.
> Lecture seule : aucun code modifié pour produire ce fichier.

---

## 1. Objectif

Blindify web est un **blind-test musical multijoueur en temps réel** : chacun importe sa propre musique (playlists Spotify/Deezer), crée ou rejoint une partie avec un code, et tout le monde devine en même temps le titre, l'artiste et qui a ajouté le morceau. Pour des groupes d'amis (à distance ou autour d'une table), gratuit, sans création de compte.

**État réel : MVP avancé / beta jouable en prod.** Le cœur (parties multi 2+ joueurs, sync temps réel, import musique, scoring) fonctionne et tourne en ligne sur `https://tymmerc.eu/blindify/`. Ce n'est pas un produit fini : refonte du flux d'entrée en cours, polish UI en cours, plusieurs modes inégalement terminés (voir §5).

---

## 2. Stack

### Frontend
- **Next.js 15.5.3** en **static export** (`output: "export"`, `basePath: "/blindify"`, `trailingSlash: true`) — voir `frontend/next.config.js`. Pas de SSR : tout est du HTML/JS statique servi par nginx.
- **React 19.2**, **TypeScript 5.9**.
- **Tailwind CSS 3.4** + `tailwindcss-animate` (utilitaires `animate-in fade-in zoom-in…`).
- **framer-motion 11** (animations de jeu : reveal, transitions de phase).
- **socket.io-client 4.8** (temps réel).
- **lucide-react** (icônes), **qrcode.react** (QR du mode "Autour d'une table").
- Fonts : **Fraunces** (display serif) + **Karla** (UI). NB : `package.json` liste aussi `@fontsource/space-grotesk` et `jetbrains-mono`, vestiges d'une ancienne DA, plus la DA officielle.

### Backend
- **Node 20 + Express 4 + TypeScript**, **socket.io 4.6+** (serveur). Conteneurisé (Docker).
- **PostgreSQL 15** (données : users, rooms, tracks/audio_sources, games, stats).
- **Redis 7** (présence, état temps réel volatile).
- Auth : sessions par cookie (`cookie-session`, `bcryptjs`), `helmet`, `express-rate-limit`, `express-slow-down`.
- Logs : `winston`.

### Services externes
- **Spotify Web API** (`spotify-web-api-node`, OAuth) : import de playlists, recherche de previews.
- **Deezer** (via `deezerPreviewService.ts`) : source principale des extraits audio jouables (URLs de preview `*.dzcdn.net`).
- **spotify-preview-finder** / `spotifyPreviewService.ts` : récupération d'extraits.
- **Resend** (clé `RESEND_API_KEY` mentionnée pour prod) : inconnu si réellement câblé côté blindify (présent surtout dans d'autres projets du VPS).
- **Sentry** : variable `SENTRY_DSN` prévue dans `docker-compose.yml`, activation inconnue (DSN probablement vide).

---

## 3. Architecture

Monorepo non-workspaces, racine `/opt/blindify/`. Pas de `package.json` racine.

```
/opt/blindify/
├── frontend/                  # Next.js static export
│   ├── next.config.js         # output:export, basePath /blindify  (POINT D'ENTRÉE config)
│   ├── src/app/               # 25 routes (App Router)
│   │   ├── page.tsx           # ENTRÉE wizard : Nom → Musique → Créer/Rejoindre → Code
│   │   ├── modes/page.tsx     # choix du mode (pochettes vinyles)
│   │   ├── multiplayer/       # lobby + routeur de mode (cœur du flux multi)
│   │   │   ├── MultiplayerRouter.tsx   # exige ?mode=, sinon redirige /modes
│   │   │   ├── ModeLobbyView.tsx       # connexion socket (ligne ~339)
│   │   │   ├── FriendsLobbyView.tsx    # lobby "Entre amis, à distance"
│   │   │   ├── EventLobbyView.tsx      # lobby "Autour d'une table" (QR + régie)
│   │   │   └── StreamerLobbyView.tsx   # lobby streamer (WIP)
│   │   ├── solo/ event/ streamer/ chrono/ challenge/  # autres modes / entrées
│   │   └── auth/ import/ profile/ stats/ history/ settings/ …
│   ├── src/components/game/   # CLIENTS DE JEU (logique d'affichage temps réel)
│   │   ├── MultiplayerGameClient.tsx   # 1430+ lignes, écran de jeu multi (cœur UI jeu)
│   │   ├── TheaterGameView.tsx         # variante écran de jeu (mobile / présentateur)
│   │   ├── SoloGameClient.tsx ChronoGameClient.tsx StreamerGameClient.tsx
│   │   └── GameShell.tsx VinylDisc.tsx StreakEffects.tsx
│   ├── src/lib/               # api.ts, socket.ts (singleton lazy), types.ts (mirror), audioManager.ts, matching.ts…
│   ├── e2e/                   # 15 specs Playwright
│   └── out/                   # BUILD = ce que nginx sert en prod
├── backend/                   # Express + socket.io (Docker)
│   └── src/
│       ├── index.ts           # POINT D'ENTRÉE serveur
│       ├── socketHandlers.ts  # tous les handlers socket (extractSessionToken, room:join, game:*)
│       ├── controllers/       # rooms, auth, import, games, audioSources, challenge, friends, invitations, quickPlay
│       ├── routes/            # mapping HTTP (rooms.ts, auth.ts, import.ts, likes.ts, stats.ts…)
│       ├── services/          # LOGIQUE MÉTIER PRINCIPALE
│       │   ├── realtimeGame.ts          # machine à états du jeu (LOBBY→GUESSING→REVEAL→…)
│       │   ├── realtimeOrchestrator.ts  # timers + emits socket
│       │   ├── trackResolution.ts       # hydratation Deezer (URLs preview fraîches)
│       │   ├── deezerPreviewService.ts / spotifyPreviewService.ts
│       │   ├── profileImportService.ts  # import playlists → audio_sources
│       │   ├── streamerGame.ts / streamerOrchestrator.ts (WIP)
│       │   └── gamePersistence.ts gameState.ts presence.ts social.ts
│       ├── types/game.ts      # mirror de shared/src/game.ts
│       └── init-db.mjs        # init schéma postgres (monté au 1er démarrage du conteneur)
├── shared/src/                # TYPES CANONIQUES : game.ts, socket-events.ts, index.ts
│   └── (dupliqués à la main dans backend/src/types/game.ts et frontend/src/lib/types.ts)
├── tools/check-shared-types.sh # vérifie que les 2 mirrors sont en phase
├── maquettes/                 # mockups HTML (servis sur dev.tymmerc.eu/blindify-maquettes)
│   └── qol-demo.html          # démo des micro-interactions validée par le user le 2026-06-23
├── docker-compose.yml         # postgres + redis + backend (+ frontend orphelin, voir §6)
├── CLAUDE.md                  # doc d'archi/ops détaillée (source fiable)
└── CONTEXT.md                 # ce fichier
```

**Flux logique principal d'une partie multi :**
1. `frontend/src/app/page.tsx` (wizard) : nom + import musique en localStorage, puis `/modes` (créer) ou résolution directe (rejoindre via `?join=CODE`).
2. `modes/page.tsx` → `/multiplayer?mode=X&intent=host`.
3. `multiplayer/ModeLobbyView.tsx` ouvre le socket **après** que la session cookie existe (règle critique, cf. CLAUDE.md §Socket flow).
4. Backend `socketHandlers.ts` + `services/realtimeGame.ts` orchestrent rounds, scoring, reveal.
5. `components/game/MultiplayerGameClient.tsx` affiche l'écran de jeu et envoie les réponses.

---

## 4. Localisation et déploiement

- **Code** : vit **sur le VPS**, dans `/opt/blindify/`. C'est l'environnement de travail réel (pas de copie Mac locale synchronisée pour le web ; le Mac est prévu pour la future app native, pas pour ce repo).
- **Git distant** : `origin = git@github.com:tymmerc/blindify.git` (GitHub).
- **Branche courante** : `wip-checkpoint-juin`. Elle est **23 commits devant `origin/main`**, 0 derrière. Dernier commit : `6ddf03f` du 2026-06-12. **Cette branche n'existe pas sur origin** (locale uniquement, jamais poussée). `origin/main` date du 2026-04-01.
- **Travail non commité** : **67 fichiers modifiés** non commités dans l'arbre de travail au moment de la rédaction (mes changements QoL récents + edits backend `importController.ts`/`roomsController.ts`/`trackResolution.ts` + screenshots e2e regénérés). Donc la prod tourne sur du code ni commité ni poussé.

### Process de déploiement (aujourd'hui, manuel, pas de CI)
Pas de `.github/workflows/` : **aucune CI**. Tout est manuel sur le VPS.

- **Frontend** : nginx sert directement les fichiers statiques. `nginx /etc/nginx/sites-enabled/10-main.conf` : `location /blindify/ { alias /opt/blindify/frontend/out/; }`. Donc **build = déploiement** :
  ```bash
  cd /opt/blindify/frontend
  unset __NEXT_PRIVATE_STANDALONE_CONFIG   # OBLIGATOIRE sinon basePath ignoré
  unset NODE_ENV
  PATH="./.node/bin:$PATH" npx next build   # écrit dans out/, servi immédiatement
  ```
  Cache nginx 5 min sur les fichiers → hard refresh requis pour voir les changements.
- **Backend** : Docker. Le code source est dans l'image (compilé en `dist/`), pas monté en volume pour le code. **Un rebuild est obligatoire** :
  ```bash
  cd /opt/blindify
  docker compose build backend && docker compose up -d backend
  ```
- **Reverse proxy** : nginx **sur l'hôte** (pas en conteneur), proxy vers `blindify_backend = 127.0.0.1:3000` pour `/blindify/api/`, `/blindify/socket.io/`, OAuth Spotify.
- **VPS** : le serveur qui héberge `tymmerc.eu` (Linux 6.8, domaines `tymmerc.eu` prod et `dev.tymmerc.eu` dev). Identité exacte de l'hébergeur : inconnu (non nécessaire ici).

### URLs / ports
- Prod : `https://tymmerc.eu/blindify/` · API `…/blindify/api/` · socket `…/blindify/socket.io/`.
- Conteneurs (tous `127.0.0.1` uniquement) : backend `:3000`, postgres `:5432`, redis `:6380→6379`, et un conteneur `blindify-frontend :3001→80` **orphelin** (voir §6).

---

## 5. État d'avancement (factuel)

### Terminé et fonctionnel en prod
- **Partie multijoueur "Entre amis"** : création/join par code, sync temps réel prouvée à 5 joueurs, persistance multi (cf. mémoire projet 2026-06-10). Round → reveal → round.
- **Import musique** : Spotify/Deezer, playlists → `audio_sources` rattachées à l'utilisateur, attribution du propriétaire ("qui a ajouté") corrigée et vérifiée.
- **Audio** : extraits Deezer ré-hydratés en début de partie pour éviter les URLs expirées (403). Fix `audioManager` (réutilisation de l'élément `<audio>` débloqué) en place.
- **Refonte du flux d'entrée** (récent) : wizard Nom → Musique → Créer/Rejoindre → Code, abandon des comptes (nom+lien en localStorage), >4 joueurs autorisés, slots compacts.
- **Mode "Autour d'une table" (event)** : lobby refait avec QR + code, DA analog. Jouable.
- **Polish QoL** (2026-06-23, validé via `maquettes/qol-demo.html`, porté dans l'app) : morph boutons "Copié ✓", arrivée joueurs animée, bouton "Lancer" avec état animé, validation inputs, picker avatars, reveal ligne par ligne, score count-up, badge round qui pulse, vinyle qui rentre dans la pochette au choix de mode.

### En cours / partiel
- **Polish UI** : directive ouverte "rends l'app agréable partout" ; premier lot fait, pas encore balayé tout l'app (résultats finaux, écrans secondaires).
- **Mode "Autour d'une table"** : détection auto grand écran vs téléphone (régie adaptative) **pas faite** (todo).
- **Notice musique live dans le lobby** (compteur de joueurs ayant importé) **pas faite** (todo).
- **DA "Club analogique"** : appliquée sur les écrans principaux, à vérifier sur les écrans périphériques.

### Pas commencé / différé
- **Mode "Avec ta communauté" (streamer)** : marqué `wip` / "Bientôt", non jouable. Code présent (`streamerGame.ts`, `StreamerLobbyView.tsx`) mais incomplet.
- **Logo** : différé.
- **Autres plateformes de streaming** (Apple Music, YouTube Music) : différé.
- **App mobile native** : décidée mais à faire **après** le web (from scratch sur Mac, pas un wrapper).

---

## 6. Points de blocage / fragilité (à NE PAS casser)

1. **Travail non versionné = risque n°1.** 23 commits locaux + 67 fichiers non commités, branche `wip-checkpoint-juin` jamais poussée sur origin. La prod tourne sur ce working tree. Une perte disque = perte du travail depuis le 2026-04-01. **Décision en suspens : committer + pousser une branche de sauvegarde.** (Je ne commit/push pas sans demande explicite.)
2. **Conteneur `blindify-frontend` orphelin** (port 3001, up 5 semaines). Il N'EST PAS ce que sert la prod : nginx pointe sur `out/` statique. Source de confusion ; le `docker-compose.yml` décrit encore un service frontend. Ne pas se fier à ce conteneur pour le front.
3. **Ordre de connexion socket** (cf. CLAUDE.md) : le socket DOIT être connecté **après** que la session cookie existe, sinon handshake "unauthorized". Ne jamais `autoConnect:true` ni `connect()` avant que `userPayload?.user` soit set, ni mettre un retry sur `connect_error` (ça masque le bug).
4. **Machine à états REVEAL→GUESSING** : zone historiquement source de déconnexions. Un joueur `disconnected` doit rester exclu de `answerable` sinon il bloque `everyoneReady`. Ne pas reset `disconnected` au début d'un round. C'est pour ça que le "raccord entre manches" (n°8) a été fait en version légère (badge qui pulse) plutôt qu'un wipe touchant la transition de phase.
5. **Service workers fantômes** : un ancien PWA service worker a déjà servi du cache périmé ("rien ne change malgré le déploiement"). Des SW auto-destructeurs sont en place (`frontend/public/sw.js`, `service-worker.js`, script inline dans `layout.tsx`). Si le user dit "je ne vois aucun changement", suspecter cache/SW AVANT le code.
6. **Build env** : toujours `unset __NEXT_PRIVATE_STANDALONE_CONFIG` et `unset NODE_ENV` avant `next build`, sinon basePath ignoré / build cassé.
7. **NODE_ENV=production** côté conteneur backend : tailwind/typescript doivent être en `dependencies` (pas `devDependencies`) sinon le build image échoue (piège connu).
8. **Types partagés dupliqués à la main** : `shared/src/game.ts` → copié dans `backend/src/types/game.ts` ET `frontend/src/lib/types.ts`. Lancer `bash tools/check-shared-types.sh` après toute modif de type. Pas de garde automatique (pas de CI).
9. **Dette : branches mortes** sur origin (`ux-refactor`, `experiments`, `fix/app-structure`, `feature/non-preview-mode`) datant de nov. 2025, divergées et probablement obsolètes. À nettoyer un jour.
10. **`build DTS` partagé cassé non bloquant** (noté en mémoire) : à confirmer, n'empêche pas le runtime.

---

## 7. Conventions

### Code
- TypeScript strict côté front et back. Types explicites sur les API publiques, `interface` pour les shapes, unions de littéraux plutôt qu'`enum`, éviter `any`.
- Immutabilité (spread, pas de mutation en place).
- Fichiers courts et ciblés (objectif 200-400 lignes ; `MultiplayerGameClient.tsx` à 1430 lignes est une exception à surveiller).
- **Pas de tiret cadratin** dans le contenu produit (règle user globale).
- DA "Club analogique" obligatoire pour toute nouvelle UI : fond papier `#f4ecdb`, encre `#2e2014`, terracotta `#c65133`, or `#e0a32e`, sauge `#7d9471` (= couleur de confirmation), ombres dures décalées, **pas de glow / fond sombre / gradient text / glassmorphism**. Guide : `maquettes/ANALOG-STYLE-GUIDE.md`.

### Branches
- Travail courant sur `wip-checkpoint-juin`. `main` (origin) est la cible de référence mais n'a pas été mis à jour depuis avril. Pas de convention de branches stricte actuellement appliquée. Commits en conventional commits (`fix(critical):`, `feat(likes):`…). Attribution git désactivée globalement.

### Tests
- **Backend** (Jest/Vitest) : `backend/tests/` — `services/realtimeGame.spec.ts`, `realtimeGame-disconnect.spec.ts`, `integration/multiplayer-socket.spec.ts`, `controllers/*`, `health.spec.ts`.
- **Frontend unit** (Vitest) : `frontend/src/lib/*.test.ts` — `matching`, `audioManager`, `socket`, `guest`, `progressiveDifficulty`, `config`, `apiClient`.
- **E2E** (Playwright, 15 specs) : `frontend/e2e/` — critiques : `multiplayer-2players.spec.ts`, `multiplayer-full-game.spec.ts`, `multiplayer-sync.spec.ts`, `event-2players.spec.ts`, `api-integration.spec.ts`, `bugfixes.spec.ts`. Base URL : `https://tymmerc.eu/blindify`. Réflexe attendu : lancer les E2E AVANT de déclarer une fonctionnalité finie.
- Couverture réelle : inconnu (objectif théorique 80%, non mesuré ici).

### Commandes locales (sur le VPS)
```bash
# Frontend : build = deploy
cd /opt/blindify/frontend
unset __NEXT_PRIVATE_STANDALONE_CONFIG; unset NODE_ENV
PATH="./.node/bin:$PATH" npx next build

# Frontend : tests unit + e2e
PATH="./.node/bin:$PATH" npx vitest run
PATH="./.node/bin:$PATH" npx playwright test --reporter=line   # chromium-headless-shell déjà installé

# Backend : rebuild + restart (OBLIGATOIRE pour appliquer src/)
cd /opt/blindify
docker compose build backend && docker compose up -d backend
docker compose logs backend --tail=100

# Vérifier les mirrors de types partagés
bash tools/check-shared-types.sh
```

---

## 8. Prochaine étape logique (avis de l'agent d'exécution)

**Sauvegarder le travail avant tout : committer les 67 fichiers en cours puis pousser `wip-checkpoint-juin` sur origin** (sous forme de branche de sauvegarde, pas de merge dans main pour l'instant). Raison : tout le travail depuis avril 2026 (refonte du flux, fixes critiques, polish QoL) vit uniquement dans le working tree d'un VPS, non versionné. C'est le risque le plus élevé et le moins cher à éliminer. Tant que ce n'est pas fait, chaque nouvelle tâche augmente la surface de perte.

**Ensuite, dans l'ordre de valeur :**
1. **Boucler les 2 todos du flux** restants : détection auto écran/téléphone pour "Autour d'une table", et la notice live "X joueurs ont importé leur musique" dans le lobby (réduit l'échec "on lance et ça ne marche pas faute de musique").
2. **Lancer les E2E 2 joueurs** pour confirmer que le lot QoL n'a rien cassé dans la boucle de jeu (modif récente de `MultiplayerGameClient.tsx`).
3. **Finir le balayage QoL** sur les écrans périphériques (résultats finaux, profil, stats), puis figer la DA.
4. Trancher le sort du **mode streamer** (finir ou masquer proprement) et du **conteneur frontend orphelin** (le retirer du compose pour lever la confusion).

Décisions qui requièrent l'orchestrateur / le user : faut-il rebaser/fast-forward `main` sur le travail de juin, ou garder `main` figé et travailler en branches ? Et : objectif de release (date / périmètre "fini" pour le web) avant de basculer sur l'app native ?
