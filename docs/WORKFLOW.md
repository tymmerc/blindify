# WORKFLOW - la boucle local → push → relecture → prod

## Vue d'ensemble

```
[Toi, local]  code → test local → commit → push (branche feature)
                                                   │
                                                   ▼
[Repo GitHub]  tymmerc/blindify  ◄───────────── push
                                                   │
                                                   ▼
[Agent VPS]   pull → RELECTURE → si OK: merge dans la branche de déploiement → build → prod
                                       si KO: te laisse des notes dans le repo, tu corriges
```

Tu ne mets jamais en prod. Tu prépares un diff que le relecteur peut accepter d'un coup.

## Branches

- `main` : **GELÉE**. Tu ne la touches pas (ni commit, ni rebase, ni merge dedans). Origin/main date d'avril 2026 et sert de point de référence stable, pas de cible de travail.
- `wip-checkpoint-juin` : **branche d'intégration / déploiement actuelle**. C'est de là que la prod est construite. Considère-la comme ta base.
- Ton travail : crée une **branche feature** depuis `wip-checkpoint-juin` :
  ```bash
  git checkout wip-checkpoint-juin
  git pull origin wip-checkpoint-juin
  git checkout -b feat/<sujet-court>     # ou fix/<sujet-court>
  ```
  Une branche = une intention claire (une feature, un fix, un lot de polish cohérent). Pas de fourre-tout.

## Commits

Format conventional commits, en français court, **sans tiret cadratin** :

```
<type>: <description à l'impératif présent>

<corps optionnel : le POURQUOI, pas le quoi>
```

Types : `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `style`.
Exemples réels du repo : `fix(critical): host never joined io room with profileUrl`, `feat(likes): playable 'mes titres likés' source in solo`.

- Commits atomiques : un commit doit pouvoir être relu seul.
- Pas de commit "wip" / "fix2" / "asdf" sur une branche que tu pushes pour relecture.
- L'attribution git est désactivée globalement : n'ajoute pas de `Co-Authored-By`.

## Avant de pousser (obligatoire)

Déroule [`REVIEW-CHECKLIST.md`](./REVIEW-CHECKLIST.md) sur toi-même. Au strict minimum :

```bash
# 1. Le build front passe (NE PAS livrer le out/, juste vérifier que ça compile)
cd frontend
unset __NEXT_PRIVATE_STANDALONE_CONFIG; unset NODE_ENV
PATH="./.node/bin:$PATH" npx next build       # doit finir sans erreur TS

# 2. Tests unitaires verts
PATH="./.node/bin:$PATH" npx vitest run

# 3. Si tu as touché un type partagé
cd .. && bash tools/check-shared-types.sh

# 4. Si tu as touché la boucle de jeu (voir PITFALLS) : E2E 2 joueurs
cd frontend && PATH="./.node/bin:$PATH" npx playwright test multiplayer-2players.spec.ts --reporter=line
```

Note : le `out/` généré par `next build` ne doit pas être commité (il est dans `.gitignore`). Le build local sert juste à prouver que ça compile.

## Le message de handoff

Quand tu pushes pour relecture, écris dans le corps de ta réponse (et/ou dans un court fichier `HANDOFF.md` à la racine si demandé) :

- Ce que fait la branche, en 2 lignes.
- Les fichiers clés touchés et pourquoi.
- Ce que tu as testé et le résultat (build OK, vitest X/X, E2E OK/non lancé et pourquoi).
- Les risques connus / ce que le relecteur doit regarder en priorité.
- Toute décision que tu n'as pas pu trancher seul.

Sois factuel. Si un test n'a pas tourné, dis-le. Ne dis jamais "c'est prêt" sans preuve (le relecteur le vérifiera de toute façon).

## Ce qui est interdit côté local

- `next build` **pour livrer** en écrasant le `out/` de prod (tu n'es pas sur le VPS, mais la règle reste : le build de déploiement appartient au VPS).
- `docker compose build` / `up` / `restart` sur la prod.
- Toute commande qui touche `main`, ou un `git push --force` sur une branche partagée.
- Supprimer des fichiers "pour nettoyer" sans que ce soit l'objet de la branche.
- Modifier `globals.css`, `tailwind.config.ts`, `layout.tsx` pour du décoratif : la fondation DA est posée, on ne la rejoue pas (voir ANALOG-STYLE-GUIDE).

## Si tu es bloqué

Mieux vaut une branche qui pose une question claire dans son handoff qu'une branche qui devine. Le relecteur tranche les décisions produit / archi.
