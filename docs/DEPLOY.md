# DEPLOY - comment la prod se déploie (et pourquoi ce n'est pas toi)

> Tu lis ça pour COMPRENDRE la chaîne, pas pour l'exécuter. Le déploiement appartient à l'agent VPS.
> Toi (local), tu codes et tu pushes. Tu ne build/déploies jamais la prod.

## Où vit la prod

- Tout est sur le **VPS** dans `/opt/blindify/`. C'est là que tournent nginx (hôte), et les conteneurs Docker (backend, postgres, redis).
- URL prod : `https://tymmerc.eu/blindify/`. API : `…/blindify/api/`. Socket : `…/blindify/socket.io/`.

## Frontend : build = déploiement

Le frontend est un **static export** servi directement par nginx :
`/etc/nginx/sites-enabled/10-main.conf` → `location /blindify/ { alias /opt/blindify/frontend/out/; }`.

Donc construire `out/` sur le VPS **met immédiatement à jour la prod**. C'est pour ça que c'est une action sensible réservée au VPS :

```bash
# (exécuté par l'agent VPS, pas par toi)
cd /opt/blindify/frontend
unset __NEXT_PRIVATE_STANDALONE_CONFIG
unset NODE_ENV
PATH="./.node/bin:$PATH" npx next build
```

Cache nginx : 5 min sur les fichiers. Un changement n'est visible qu'après expiration ou hard refresh.

## Backend : rebuild Docker obligatoire

Le code backend est compilé en `dist/` dans l'image. Pour appliquer un changement de `src/` :

```bash
# (exécuté par l'agent VPS, pas par toi)
cd /opt/blindify
docker compose build backend && docker compose up -d backend
docker compose logs backend --tail=100
```

Un simple `restart` ne recompile pas : il faut `build` + `up -d`.

## La chaîne complète

1. Tu pushes ta branche feature sur GitHub.
2. L'agent VPS `git pull` la branche, la relit (voir REVIEW-CHECKLIST).
3. S'il valide : il merge dans `wip-checkpoint-juin`, puis build front et/ou rebuild backend selon ce qui a changé.
4. Il vérifie en prod (URLs `200`, parcours, logs) et confirme.
5. S'il refuse : il te laisse les raisons, tu corriges sur la même branche et re-pushes.

## Convention de déploiement (générale au VPS)

Tout service exposé en cours de dev/test va d'abord sur `dev.tymmerc.eu`, pas sur le domaine principal. Pour Blindify, la prod web est déjà live sur `tymmerc.eu/blindify/`, mais les maquettes et prototypes vont sur `dev.tymmerc.eu/blindify-maquettes/`. Une modif visuelle impactante se valide idéalement en maquette/dev avant d'écraser la prod.

## Ce que tu ne fais jamais (rappel)

- Pas de `next build` pour livrer, pas de `docker compose build/up/restart` sur la prod.
- Pas de modification de la config nginx (`/etc/nginx/...`) : si ton changement nécessite une nouvelle source CSP, un upstream, une route, **décris-le dans le handoff**, le VPS s'en charge.
- Pas de migration DB appliquée à la prod toi-même : écris la migration, documente-la, le VPS l'applique.
