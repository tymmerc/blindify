# Pile de test isolée et campagne de nuit

Tout ce qui est ici tourne **sans toucher la base de prod** et **sans sortir sur Internet**.

## Démarrer, jouer, arrêter

```bash
cd /opt/blindify/tools/test-stack
heavy ./stack.sh front          # front de test depuis HEAD (seulement si le code a changé)
./stack.sh up                   # base neuve + backend de test + serveur local
heavy node campaign.mjs         # la campagne complète (≈ 15 min)
./stack.sh down                 # tout s'arrête, la base est jetée
```

Options de `campaign.mjs` : `--seed N` (rejouer un tirage à l'identique), `--no-browser` (bots seuls, ≈ 1,5 min), `--alert` (e-mail si rouge).

La nuit : `nightly.sh` (cron 03:40) enchaîne tout via `heavy` et démonte la pile à la fin.
Rapports : https://dev.tymmerc.eu/blindz/tests/ (mot de passe du tableau de bord).

## Ce qui tourne

| Pièce | Où | Pourquoi |
|---|---|---|
| Base | conteneur `blindz-test-postgres`, 127.0.0.1:5436, en mémoire, plafond 384 Mo | structure copiée de la prod, aucune donnée |
| Backend | le code du dépôt, 127.0.0.1:3098 | précédé de `no-egress.cjs` : toute connexion hors boucle locale est refusée et comptée |
| Serveur local | 127.0.0.1:3180 (`proxy.mjs`) | front de test, API, websocket, extraits, faux Deezer |
| Adresse du front | http://blindz-test.localhost:3180/blindify/ | Chrome résout `*.localhost` en local ; il faut un nom à point pour le cookie |
| Front | copie de travail `.test-stack/front` | un build dans `frontend/` écraserait `out/`, servi tel quel par nginx |

Le backend lit `DEEZER_API_BASE` (sinon le vrai Deezer) : dans la pile, il pointe sur le faux Deezer de `proxy.mjs`, qui sert un catalogue de 48 sons purs (`catalog.mjs`). Chaque morceau a sa fréquence : la sonde audio sait dire **quelle** chanson joue.

## Ce que la campagne vérifie

- **Bots** (`bot.mjs`, `room.mjs`, `scenarios.mjs`) : 5 salles de 6 joueurs en parallèle. Comportements juste, proche, faux, muet, en retard, coupure réseau, départ, retardataire. Chaque intention est confrontée à la base de test (verdict, devinette « qui a mis quoi », points), et aucun message ne doit contenir la réponse avant la révélation.
- **Navigateur** (`browser.mjs`, `browser-solo.mjs`, `probe.mjs`), un écran à la fois : écran central + téléphone autour d'une table, joueur à distance, un seul tel avec trois doigts (vrais événements tactiles), solo classique puis défi relevé par un ami, chrono. La sonde mesure le démarrage du son, la bonne fréquence et l'arrêt à la révélation.
- **Scripts historiques portés sur la pile** : `pcfixes-e2e.mjs --pile` (le bouton d'import y est testé pour de vrai, contre le faux Deezer).

## Pièges déjà rencontrés

- Le port 5433 est pris par un autre Postgres de la machine : la pile utilise 5436.
- `pg_isready` répond pendant l'initialisation du conteneur, puis le serveur redémarre : attendre « init process complete » avant de charger le schéma (sinon base vide).
- `booleen::text` donne `true`/`false`, pas `t`/`f`.
- Chrome, émulation tactile : `touchEnd` relève exactement les points qu'il contient ; un `touchMove` sans un point ne le relève pas.
- Le lien « Passer cette question » du solo n'est jamais immobile pour Playwright (bloc animé) : clic forcé.
- Le générateur `sine` de ffmpeg sort à 1/8 de la pleine échelle : le niveau de référence d'un extrait est ≈ 0,031 efficace.
