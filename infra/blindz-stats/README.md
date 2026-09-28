# Tableau de bord privé

Statistiques de production en lecture seule, servies sur
`https://dev.tymmerc.eu/blindz-stats/`, protégées par mot de passe.

## Pourquoi sur le serveur et pas ailleurs

Les données contiennent des pseudonymes et l'historique de vrais joueurs. Elles
ne sortent pas de la machine : la page est servie par le nginx du VPS, derrière
une authentification, et rien n'est envoyé à un service tiers.

## Pièces

- `tools/stats.sql` : une seule requête qui produit tout le JSON.
- `tools/gen-stats.sh` : lance la requête et écrit `/opt/dev/blindz-stats/data.json`.
  Ne remplace le fichier servi que si le JSON est valide, pour qu'un échec
  passager n'affiche pas un tableau vide.
- `infra/blindz-stats/index.html` : la page, copie de ce qui est déployé dans
  `/opt/dev/blindz-stats/`. Elle lit `data.json` à côté d'elle, sans dépendance
  externe hors les polices.
- nginx : `location ^~ /blindz-stats/` dans `sites-enabled/12-dev-https.conf`.
  Le `^~` est OBLIGATOIRE : sans lui, la règle générique en expression
  régulière du routeur de projets capte l'adresse et sert la page SANS
  authentification. Vérifié, c'est arrivé.
- cron : régénération toutes les heures à la minute 7.

## Parties de test écartées

Les scripts E2E répondent toujours faux et faussaient le taux de bonnes
réponses (9 % au lieu de 19 %). Les pseudonymes Lea, Max, Megane, Zoe,
StreamerHost, Intrus, Tymeo et tout compte `e2e_` sont donc exclus des
statistiques de qualité et du classement. Le nombre de réponses écartées est
affiché sur la page, pour que le filtre reste visible et discutable.
