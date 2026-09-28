# Explorateur de base, en lecture seule

`https://dev.tymmerc.eu/blindz-db/`, derrière le même mot de passe que le
tableau de bord. Liste des 24 tables, contenu paginé et triable, et une zone
de requête libre.

## Trois garde-fous empilés

Un seul ne suffit jamais, donc il y en a trois :

1. La connexion utilise le rôle PostgreSQL `blindz_ro`, créé avec `SELECT`
   uniquement. Une écriture échoue au niveau de la base, quoi qu'il arrive
   au-dessus.
2. Chaque requête tourne dans une transaction `READ ONLY`, avec un délai
   maximal de 8 secondes.
3. Le texte est refusé avant d'atteindre la base s'il ne commence pas par
   `SELECT` ou `WITH`, s'il contient plusieurs instructions, ou un mot-clé
   d'écriture.

Vérifié : `DELETE FROM users` est refusé, et l'était aussi directement en SQL
avec le rôle en lecture seule.

## Pièces

- `tools/db-browser.mjs` : le service, écoute sur `127.0.0.1:3101` seulement.
  Le port 3099 était déjà pris par un autre projet.
- `/etc/systemd/system/blindz-db-browser.service` : démarrage automatique.
- Mot de passe du rôle dans `/root/.blindz-ro-pass`.
- nginx : `location ^~ /blindz-db/` et `^~ /blindz-db/api/`. Le `^~` est
  OBLIGATOIRE, sinon le routeur de projets en expression régulière capte
  l'adresse et sert la page sans authentification.
