# SECURITY - secrets, entrées, surface d'attaque

## Secrets : la règle absolue

- **JAMAIS de secret en dur** dans le code (clé API, mot de passe, token, DSN).
- Tout passe par variables d'environnement. Côté backend elles arrivent par `docker-compose.yml` (lui-même alimenté par `.env`).
- Valide la présence des secrets requis au démarrage, échoue clairement s'il en manque :
  ```ts
  const id = process.env.SPOTIFY_CLIENT_ID
  if (!id) throw new Error("SPOTIFY_CLIENT_ID not configured")
  ```

## Fichiers `.env`

- `.env` et `backend/.env` existent sur le serveur et sont **gitignored** (`.gitignore` lignes `.env`, `.env.*`, avec exception `!.env.example`).
- Seul `.env.example` est suivi par git : tiens-le à jour (noms de variables, sans valeurs) quand tu ajoutes une config.
- **Avant tout commit**, vérifie qu'aucun `.env` réel n'est stagé :
  ```bash
  git diff --cached --name-only | grep -iE '(^|/)\.env($|\.)' | grep -v '\.env\.example'
  # ne doit rien afficher
  ```
- Si une clé a fui (commit, log, capture) : signale-le immédiatement dans le handoff, il faudra la roter.

## Variables connues (noms, pas valeurs)

`SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `SESSION_SECRET`, `COOKIE_DOMAIN`, `COOKIE_SECURE`, `FRONTEND_URL`, `PUBLIC_BACKEND_URL`, `SENTRY_DSN` (optionnel), `E2E_BYPASS_KEY`.

## Validation des entrées (frontière du système)

- Tout ce qui vient du client (body HTTP, payload socket, query) est **non fiable** : valide type, présence, bornes avant usage.
- Requêtes SQL **paramétrées** uniquement (`pg` avec `$1, $2`), jamais de concaténation de chaîne dans une requête.
- Sanitize tout HTML rendu à partir d'entrée utilisateur (anti-XSS).
- Code de room, pseudo, lien de playlist : valide le format avant de t'en servir.

## Protections déjà en place (ne pas affaiblir)

- `helmet` (headers de sécurité), `express-rate-limit` + `express-slow-down` (anti-abus), CORS configuré.
- nginx ajoute CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` sur `/blindify/` (voir `10-main.conf`). Si tu ajoutes une source externe (CDN, domaine media), il faudra l'autoriser dans la CSP côté nginx : signale-le, tu ne touches pas nginx toi-même.
- Auth par cookie httpOnly/secure/sameSite (voir PITFALLS #9).

## Réflexe en cas de doute sécurité

Si tu touches à l'auth, aux endpoints, à la gestion de session ou à une entrée utilisateur, signale-le explicitement dans le handoff pour que le relecteur passe une revue sécurité dédiée. Corrige les problèmes critiques avant de pousser, ne les laisse pas "pour plus tard".
