# docs/ - Manuel de bord pour coder Blindify

> À lire EN PREMIER si tu es un agent (Claude Code) qui reprend le projet.
> Ce dossier dit comment coder ici dans les bonnes conditions : les règles, les limites, les pièges, le process de livraison.

## Le contexte de collaboration (important)

Il y a deux agents sur ce projet, qui ne se parlent pas en direct, seulement via le repo git :

- **Toi (Claude Code local)** : tu codes sur une machine locale. Tu écris, tu testes ce que tu peux en local, tu commits, tu pushes.
- **L'agent VPS (relecteur + déployeur)** : il vit sur le serveur de prod (`/opt/blindify`). Il récupère ton push, **juge ton code**, et c'est **lui seul qui met en prod**. Toi tu ne déploies jamais.

Donc : ton job est de livrer du code **propre, testé, conforme aux règles ci-dessous**, pour qu'il passe la relecture sans aller-retour. Plus ton diff respecte ce dossier, plus vite il part en prod.

## Ordre de lecture conseillé

1. [`WORKFLOW.md`](./WORKFLOW.md) - la boucle local → push → relecture → prod. Branches, commits, ce qui est interdit.
2. [`PITFALLS.md`](./PITFALLS.md) - **le plus important** : les zones fragiles à ne pas casser (socket, machine à états, cache/SW, build env).
3. [`CODING-RULES.md`](./CODING-RULES.md) - les règles de code contre lesquelles ton diff sera relu.
4. [`REVIEW-CHECKLIST.md`](./REVIEW-CHECKLIST.md) - la checklist exacte du relecteur. Auto-évalue-toi dessus avant de pousser.
5. [`TESTING.md`](./TESTING.md) - comment tester, et le réflexe E2E.
6. [`SECURITY.md`](./SECURITY.md) - secrets, `.env`, validation des entrées.
7. [`DEPLOY.md`](./DEPLOY.md) - comment la prod se déploie vraiment (et pourquoi tu ne build/déploies pas).
8. [`PRODUCT.md`](./PRODUCT.md) - Blindify à l'échelle produit : vision, modes, ton, web + futur natif, ce qu'on ne fait PAS.

## Les autres docs du repo (déjà existantes, fiables)

- [`../CLAUDE.md`](../CLAUDE.md) - archi & ops détaillées (stack, ports, auth flow, machine à états). Source technique de référence.
- [`../CONTEXT.md`](../CONTEXT.md) - snapshot daté de l'état du projet (avancement, blocages, prochaine étape).
- [`../maquettes/ANALOG-STYLE-GUIDE.md`](../maquettes/ANALOG-STYLE-GUIDE.md) - le design system "Club analogique" (tokens, recettes, interdits). **À suivre pour toute UI.**

## Les 7 règles d'or (version courte)

1. **Tu ne déploies jamais.** Pas de `next build` pour livrer, pas de `docker compose build/up`. Tu codes et tu pushes, le VPS déploie.
2. **Tu ne touches pas `main`.** Elle est gelée. Tu travailles en branche (voir WORKFLOW).
3. **Zéro régression sur la boucle de jeu.** La transition REVEAL→GUESSING et l'ordre de connexion socket sont fragiles (PITFALLS). Dans le doute, tu ne touches pas la logique, tu touches le style.
4. **Design = Club analogique.** Papier, encre, ombres dures, sauge pour les succès. Jamais de glow / fond sombre / gradient text / glassmorphism.
5. **Pas de tiret cadratin** (—) dans le code, les commentaires, les commits, l'UI. Jamais. Voir CODING-RULES.
6. **Pas de secret en dur.** Tout passe par `.env` (déjà gitignored). Voir SECURITY.
7. **Tu testes avant de dire que c'est fait.** Au minimum le build passe et les tests unitaires verts. E2E si tu touches au jeu.

Si un point de ce dossier contredit une demande, signale-le dans ton message de handoff plutôt que de trancher seul.
