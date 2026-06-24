# HANDOFF - passation pour le Claude Code qui reprend Blindify en SSH

> Écrit le 2026-06-24 par l'agent qui tournait sur le VPS. Tu prends le relais.
> Tu es connecté en SSH **sur le VPS de prod**, tu travailles dans `/opt/blindify`. Lis ça en entier avant de toucher quoi que ce soit.

## 0. GARDE-FOU N°1, avant tout le reste

Tu es **directement sur le serveur de prod** (`tymmerc.eu`, port SSH **2222**, pas 22), piloté par le user en Remote Control depuis son téléphone. Le code que tu modifies ici devient la prod dès qu'il est buildé.

- `next build` dans `frontend/` écrit dans `out/` que **nginx sert en direct** : c'est un **déploiement instantané**, sans filet.
- `docker compose build/up` du backend touche aussi la **prod live**.

Donc, règle absolue : **tu ne build jamais pour déployer, et tu ne rebuild jamais le backend, sans un GO explicite du user dans la conversation.** Pour juste vérifier que ça compile, fais-le sans écraser le `out/` servi (ex: `next build` dans un dossier de sortie jetable, ou un simple `tsc --noEmit`), ou demande. Dans le doute, tu demandes AVANT, jamais après. C'est la seule action ici qui casse des gens en vrai (une partie en cours qui saute).

Note sur les docs : le dossier `docs/` (WORKFLOW.md, README.md) décrit un modèle à **deux agents** (un local qui code, un VPS qui relit et déploie). Ici il n'y a **qu'un seul agent : toi, sur le VPS**. Ce HANDOFF prime sur cette partie des docs. Le reste des docs (PITFALLS, CODING-RULES, design, sécurité) reste 100% valable.

## 1. Ce qu'est Blindify (1 phrase)

Blind-test musical multijoueur où chacun importe sa propre musique (Spotify/Deezer) et tout le monde devine en même temps titre + artiste + **qui a ajouté le morceau**. Pour des potes, à distance ou autour d'une table, gratuit, sans compte. Détail produit complet : `docs/PRODUCT.md`.

## 2. La chose la plus importante : l'état git

- Branche de travail = **`wip-checkpoint-juin`**, poussée sur `origin` (GitHub `tymmerc/blindify`). C'est de là que la prod est construite.
- **`main` est GELÉE** (origin/main = `00b44b6`, avril 2026). Tu n'y touches pas (pas de merge, pas de rebase) sans décision explicite de l'utilisateur.
- Deux commits posés cette session : `6e5b4fd` (sauvegarde de 4 mois de travail non versionné) et `ba7ca5b` (le dossier `docs/`).
- Avant cette session, 23 commits + 67 fichiers vivaient uniquement dans le working tree, jamais poussés. **C'est réglé maintenant**, mais garde le réflexe : commite et pushe régulièrement, ne laisse pas s'accumuler du travail non sauvegardé. La prod a déjà tourné des semaines sur du code non commité, c'est le risque historique du projet.

## 3. Les docs à lire, dans l'ordre

Tout est dans `/opt/blindify/` :

1. **`docs/README.md`** - le manuel de bord, point d'entrée, les 7 règles d'or.
2. **`docs/PITFALLS.md`** - LE doc à connaître par cœur : les zones fragiles qui ont déjà cassé la prod (ordre de connexion socket, machine à états REVEAL→GUESSING, service workers fantômes, build env, types partagés, audio). Lis-le avant de toucher au jeu.
3. **`docs/CODING-RULES.md`** + **`docs/REVIEW-CHECKLIST.md`** - les règles de code et la checklist d'auto-relecture. Déroule la checklist sur ton propre diff avant de builder.
4. **`docs/DEPLOY.md`** - comment build/déployer front et back proprement.
5. **`docs/TESTING.md`**, **`docs/SECURITY.md`**, **`docs/PRODUCT.md`** - tests, secrets, vision produit.
6. **`CLAUDE.md`** - la référence technique détaillée (stack, ports, auth flow, machine à états, pièges). Très fiable.
7. **`CONTEXT.md`** - snapshot daté de l'avancement (terminé / en cours / pas commencé / blocages).
8. **`maquettes/ANALOG-STYLE-GUIDE.md`** - le design system "Club analogique", à suivre pour toute UI. Référence interactive validée : `maquettes/qol-demo.html`.

Si tu ne dois en lire que deux avant d'agir : `docs/PITFALLS.md` et `CLAUDE.md`.

## 4. Comment je bosse (reprends ces principes)

- **Je ne dis jamais "c'est fix / c'est prêt" sans preuve.** Build vert, test lancé, URL qui répond, parcours déroulé. Si je n'ai pas pu vérifier (ex: l'audio ne se teste pas en headless), je le dis explicitement et je précise ce qui reste à valider à la main.
- **Tests verts ≠ produit bon.** Je déroule le parcours humain complet quand c'est possible, pas juste la suite de tests.
- **Réflexe E2E** : si je touche la boucle de jeu / lobby / socket, je lance `multiplayer-2players.spec.ts` avant de considérer que c'est fini.
- **Dev avant prod pour le visuel** : une modif visuelle impactante, je la montre d'abord (maquette sur `dev.tymmerc.eu/blindify-maquettes/`, ou je demande validation) avant d'écraser la prod. L'utilisateur valide le rendu, ensuite je pousse.
- **Mode autonome = batch complet**, pas de checkpoints inutiles : quand on me lâche sur plusieurs tâches, je les enchaîne et je rends un lot cohérent.
- **Zéro tiret cadratin (—)** nulle part : code, commentaires, commits, UI, docs. Règle stricte de l'utilisateur.
- **Honnêteté sur les ratés** : si un test casse, je le dis avec la sortie. Si j'ai sauté une étape, je le dis. Pas d'enrobage.
- Je parle **français** avec l'utilisateur, ton direct, sans jargon.

**Comment le user bosse avec toi :** il te donne des tâches en langage normal depuis son téléphone, valide aux notifications, et **garde la main sur la mise en prod**. Préviens-le (notif) quand une tâche est finie ou quand tu as besoin d'une décision. Les décisions produit et archi, c'est lui qui tranche : dans le doute tu **proposes**, tu ne décides pas seul. Mais quand son intuition est floue ou fausse, il attend que tu le **dises et que tu tiennes ta position**, pas que tu valides pour lui faire plaisir. Un désaccord argumenté lui est plus utile qu'un oui complaisant.

## 5. Comment reprendre / déployer (la mécanique)

**Frontend (build = déploiement, nginx sert `frontend/out/`) :**
```bash
cd /opt/blindify/frontend
unset __NEXT_PRIVATE_STANDALONE_CONFIG   # OBLIGATOIRE sinon basePath /blindify ignoré → app cassée
unset NODE_ENV
PATH="./.node/bin:$PATH" npx next build
# cache nginx 5 min → hard refresh Cmd+Shift+R pour voir le changement
```

**Backend (Docker, rebuild obligatoire) :**
```bash
cd /opt/blindify
docker compose build backend && docker compose up -d backend
docker compose logs backend --tail=100
```

**Vérifs rapides post-déploiement :**
```bash
for p in /blindify/ /blindify/modes/ /blindify/multiplayer/; do
  echo -n "$p -> "; curl -s -o /dev/null -w "%{http_code}\n" "https://tymmerc.eu$p"
done
curl -s -o /dev/null -w "backend health %{http_code}\n" http://127.0.0.1:3000/health
```

**Top 5 des pièges (détail dans `docs/PITFALLS.md`) :**
1. Socket connecté seulement APRÈS la session cookie (sinon "unauthorized"). Point légitime : `ModeLobbyView.tsx` ~ligne 339.
2. Ne pas reset `disconnected=false` en début de round (bloque toute la partie). Zone `realtimeGame.ts`.
3. Pas de service worker / cache offline. Si "rien ne change malgré le déploiement" → suspecte cache/SW AVANT le code.
4. `unset __NEXT_PRIVATE_STANDALONE_CONFIG` avant chaque build front.
5. Type partagé modifié → éditer les 3 copies (`shared/`, `backend/src/types/game.ts`, `frontend/src/lib/types.ts`) + `bash tools/check-shared-types.sh`.

## 6. Ce qu'on a fait cette session

- **Refonte du flux d'entrée** (wizard Nom → Musique → Créer/Rejoindre → Code, abandon des comptes, slots compacts, >4 joueurs). Déjà en prod.
- **Lot de polish QoL** validé par l'utilisateur sur `maquettes/qol-demo.html` puis porté dans l'app et buildé :
  - `modes/page.tsx` : au clic sur un mode, le vinyle **rentre** dans la pochette avant de naviguer.
  - `multiplayer/FriendsLobbyView.tsx` : boutons "Copié !" qui morphent en sauge, arrivée des joueurs animée, bouton "Lancer" avec pression + "Lancement..." animé.
  - `multiplayer/EventLobbyView.tsx` : même traitement du bouton Lancer.
  - `components/game/MultiplayerGameClient.tsx` : validation des inputs (bordure sauge + check), picker d'avatars avec feedback clic, classement reveal ligne par ligne (stagger), scores en count-up (composant `CountUp`), badge de manche qui pulse au changement de round.
- **Sauvegarde git** + création du dossier `docs/` (passation durable).
- **CONTEXT.md** rédigé (état complet du projet).

Note : le badge de manche (point "raccord entre manches") a été fait en version LÉGÈRE exprès, pour ne pas toucher la transition de phase REVEAL→GUESSING qui est fragile. Si l'utilisateur veut le wipe plein écran de la démo, fais-le avec un test 2 joueurs derrière.

## 7. Definition of Done du web (l'objectif officiel, fixé par le user)

Le web est "fini" quand ces **4 points** sont vrais. C'est ça ta cible, pas une liste de polish.

1. **Les deux modes principaux fonctionnels à 8 joueurs minimum.** "Entre amis, à distance" et "Autour d'une table", complets et stables. Aujourd'hui c'est prouvé à 5. Le plafond backend est 16 (`roomsController.ts:147` : `min(max(n,2),16)`), donc 8 est permis : c'est à VÉRIFIER et pousser à 8, pas un changement de cap.
2. **Canal de signalement de bug in-app.** Le joueur peut remonter un bug depuis l'app. **N'existe pas aujourd'hui** (vérifié). À construire.
3. **Un logo.** NUANCE : un logo existe déjà (`frontend/public/logo_blindify.png`, branché via `frontend/src/components/Logo.tsx` dans navbar/landing/login/stats). MAIS son style est l'ancienne DA (`rounded-2xl`, `border-border`, `bg-background/80`), pas le Club analogique, et il traîne sur des surfaces mortes (login alors que les comptes sont abandonnés). Le vrai besoin est donc probablement "un logo qui colle à la DA actuelle", pas un from scratch. **À faire confirmer au user.**
4. **App complètement adaptée au téléphone** et agréable sur tout le parcours des deux modes (wizard, lobby, jeu, reveal, résultats). Critères testables : pas de scroll horizontal en viewport 375px, cibles tactiles >= 44px, boucle de jeu jouable au pouce, reveal et score lisibles sur petit écran.

**Hors release** (sauf si ça bloque un des 4 points) : mode streamer ("Avec ta communauté"), autres plateformes de streaming, polish des écrans secondaires (profil, stats, historique), conteneur `blindify-frontend` orphelin. L'app mobile native vient APRÈS, séparément, ce n'est pas ton chantier maintenant.

Anciens TODO encore pertinents car ils servent le point 1 : détection auto grand écran vs téléphone pour "Autour d'une table", et compteur live "X joueurs ont importé leur musique" dans le lobby (évite l'échec "on lance et ça marche pas faute de musique").

## 7bis. Ta première tâche (intelligente, sans coder)

Fais un **audit d'écart contre les 4 points, sans rien construire.** Deux raisons concrètes : les E2E n'ont pas tourné depuis le lot QoL qui a touché `MultiplayerGameClient.tsx`, et le seuil de 8 joueurs n'a jamais été vérifié. Mesure l'écart d'abord, puis remonte au user un **backlog ordonné** (par valeur et par risque). Tu construis seulement après son GO. Rappel garde-fou : lancer les E2E tape la prod (`https://tymmerc.eu/blindify`), donc préviens avant si tu les lances pendant des heures de jeu potentielles.

## 8. Gotchas spécifiques découverts cette session

- **SSH du VPS = port 2222**, auth par clé ed25519 uniquement (pas de mot de passe). Si tu as des soucis de connexion, c'est le port.
- **L'audio ne se teste pas en headless** (pas de codec/autoplay). On valide indirectement : URLs de preview en `200 audio/mpeg` (curl) + logique `audioManager` en unitaire. Le son se valide à la main.
- **Le `out/` du front et les `.env` ne se commitent pas** (déjà gitignored). Vérifie toujours qu'aucun `.env` réel n'est stagé avant un commit.
- L'utilisateur itère vite et donne du feedback serré : après un lot, montre le résultat et confirme la direction avant de balayer large. Ne pars pas 20 minutes en autonomie sur une directive ouverte sans point d'étape.

## 9. Si tu dois mettre à jour cette passation

Quand tu finis une session importante, réécris ce `HANDOFF.md` pour le suivant : état git, ce que tu as livré, ce qui reste, les pièges frais. C'est un fichier vivant.

Bon courage. L'objectif de l'utilisateur : **finir le web** proprement, avant de basculer sur l'app native. Reste dans cette direction.
