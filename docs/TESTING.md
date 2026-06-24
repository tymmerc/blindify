# TESTING - comment tester, et le réflexe E2E

## Les trois niveaux

| Niveau | Outil | Où | Quand |
|---|---|---|---|
| Unitaire | Vitest | `frontend/src/lib/*.test.ts` | toute logique pure (matching, audio, guest, config...) |
| Unitaire / intégration backend | Jest + Vitest | `backend/tests/` | services, controllers, machine à états |
| E2E | Playwright | `frontend/e2e/` | parcours critiques, surtout multijoueur |

## Commandes

```bash
# Frontend unitaire
cd frontend
PATH="./.node/bin:$PATH" npx vitest run

# Backend
cd backend
npm test            # (jest) - vérifie le script exact dans backend/package.json

# E2E (chromium-headless-shell déjà installé)
cd frontend
PATH="./.node/bin:$PATH" npx playwright test --reporter=line
# un seul spec :
PATH="./.node/bin:$PATH" npx playwright test multiplayer-2players.spec.ts --reporter=line --retries=0
```

Base URL des E2E : `https://tymmerc.eu/blindify` (ils tapent la prod). Si tu travailles en local sans accès, lance au moins les unitaires et le build, et signale dans le handoff que les E2E n'ont pas pu tourner.

## Specs critiques (à faire passer si tu touches le jeu)

- `frontend/e2e/multiplayer-2players.spec.ts` : flow complet 2 joueurs, round 1 → reveal → round 2 → reveal → round 3. **Le test de référence.**
- `frontend/e2e/multiplayer-full-game.spec.ts`, `multiplayer-sync.spec.ts` : partie longue + synchro.
- `frontend/e2e/event-2players.spec.ts` : mode "Autour d'une table".
- `frontend/e2e/api-integration.spec.ts` : sessions, rooms, polling.
- `frontend/e2e/bugfixes.spec.ts` : non-régression sur des bugs déjà corrigés.

## Le réflexe (règle utilisateur)

**Lance les E2E AVANT de déclarer une fonctionnalité finie.** "Les tests passent" ne suffit pas : déroule le parcours humain complet quand c'est possible. Un build vert ne prouve pas que le produit marche.

Corollaire : ne dis jamais "c'est fix" / "c'est prêt" sans preuve. Si tu n'as pas pu vérifier (headless sans audio, pas d'accès prod, etc.), dis exactement ce que tu as pu vérifier et ce qui reste à valider côté relecteur.

## Ce qu'on ne peut pas tester en headless

- Le **son** ne se vérifie pas en headless (pas de codec / pas d'autoplay réel). Pour l'audio, on valide indirectement : les URLs de preview répondent `200 audio/mpeg` (curl), et la logique `audioManager` est couverte en unitaire. Le ressenti audio se valide à la main.
- Le **feel** des micro-interactions se valide visuellement (la maquette `maquettes/qol-demo.html` sert de référence validée).

## Couverture

Objectif théorique 80%, non mesuré automatiquement (pas de CI). N'en fais pas une obsession chiffrée : priorise la couverture des chemins critiques (scoring, machine à états, matching des réponses, auth) sur le pourcentage brut.
