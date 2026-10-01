# Blindz

[![CI](https://github.com/tymmerc/blindify/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/tymmerc/blindify/actions/workflows/ci.yml)
[![Licence : CC BY-NC-SA 4.0](https://img.shields.io/badge/Licence-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

Un blind test musical joué sur la musique des joueurs eux-mêmes. Chacun importe ses playlists Deezer ou Spotify avec un simple lien, et la partie mélange les titres de tout le monde. En ligne sur **[blindz.app](https://blindz.app)**.

On marque un point pour le titre, un pour l'artiste, et un de plus si on devine qui a ajouté le morceau. Répondre vite ne rapporte rien, ça sert seulement à départager les ex aequo.

## Les modes

| Mode | Comment on joue |
|---|---|
| **À distance** | Une salle, un code à partager, chacun joue sur son téléphone. Jusqu'à 12 joueurs. |
| **Autour d'une table** | Un écran affiche la partie et les joueurs répondent sur leur téléphone, jusqu'à 12. Il existe aussi une variante buzzer sur un seul téléphone, jusqu'à 5. |
| **Solo** | Classique, chrono, ou défi : on envoie sa partie à un ami qui essaie de battre le score. |
| **Avec ta communauté** | Pour les lives : le chat, le streamer ou les deux devinent. Encore en développement. |

Pas besoin de compte pour jouer. Une session invité garde l'historique un an sur le navigateur, et un compte (pseudo et mot de passe) reste possible.

## Stack

| Partie | Techno |
|---|---|
| Front | Next.js 15 en export statique, React 19, Tailwind CSS, Framer Motion |
| Temps réel | Socket.IO 4.8 |
| Back | Node.js 22, Express, TypeScript |
| Données | PostgreSQL 15 |
| Hébergement | un VPS : nginx sert le front statique et relaie l'API, le back tourne dans Docker |

Les extraits audio sont les extraits publics de 30 secondes fournis par Deezer.

## Le dépôt

```
backend/    API Express et serveur Socket.IO (TypeScript), tests Jest
frontend/   application Next.js, tests Vitest et Playwright
shared/     types du jeu, source commune recopiée dans le back et le front
tools/      parcours de bout en bout et pile de test isolée de la campagne de nuit
scripts/    scripts de mise en production
maquettes/  maquettes HTML de la direction artistique
```

## Lancer en local

Il faut Node.js 22 (`.nvmrc`) et Docker.

```bash
git clone https://github.com/tymmerc/blindify.git
cd blindify
cp .env.example .env              # base, secrets de session, URL du front
docker compose up -d postgres     # PostgreSQL 15 sur 127.0.0.1:5432

cd backend && npm ci && npm run dev
cd frontend && npm ci && npm run dev
```

Le front lit l'adresse de l'API dans `NEXT_PUBLIC_API_URL` et `NEXT_PUBLIC_SOCKET_URL`, et son chemin de base dans `NEXT_PUBLIC_BASE_PATH` (vide pour servir à la racine).

## Tests

Front (Vitest) :

```bash
cd frontend && npm test
```

Back (Jest). Les tests unitaires tournent sans rien ; les tests d'intégration jouent de vraies parties sur un serveur Socket.IO et ont besoin d'une base Postgres jetable :

```bash
cd backend
npm run test:unit       # sans base
npm run test:db         # Postgres 15 jetable sur 127.0.0.1:5437, avec le schéma de la prod
TEST_DATABASE_URL=postgres://blindz:blindz@127.0.0.1:5437/blindz_test npm test
npm run test:db:down    # jette la base
```

Les tests refusent toute base dont le nom ne finit pas par `_test`, ainsi que le port 5432, celui du Postgres de la prod. Le schéma de test, `backend/db/schema.sql`, est une photo de la structure de la prod, sans aucune donnée, que régénère `tools/schema-snapshot.sh`.

Lint et typage : `npm run lint` et `npm run typecheck`, dans `frontend/` comme dans `backend/`.

## Intégration continue

Chaque pull request et chaque push sur `main` lancent [`.github/workflows/ci.yml`](.github/workflows/ci.yml) :

- lint et typage des deux projets ;
- contrôle des types partagés entre le front et le back ;
- tests du front et du back sous Node 22 et 24, avec un Postgres de service pour le back ;
- build du front avec les adresses de la prod.

Les actions sont épinglées par SHA de commit, le workflow n'a aucun droit par défaut et n'utilise aucun secret.

Avant chaque commit, un hook (husky) refuse tout fichier `.env` dans l'index et passe ESLint sur les seuls fichiers modifiés, avec la configuration de leur projet (lint-staged). Il s'installe avec un `npm install` à la racine du dépôt.

Dependabot propose chaque semaine les mises à jour des dépendances npm et des actions GitHub ; ses pull requests passent par la même CI.

## Licence

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) : tu peux lire le code et t'en inspirer, mais pas en faire un usage commercial.
