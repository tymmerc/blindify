# CODING-RULES - les règles contre lesquelles ton code sera relu

> Ces règles sont celles que le relecteur applique. Un diff qui les respecte passe vite.
> Elles valent pour `frontend/` et `backend/` (TypeScript partout).

## TypeScript

- **Pas de `any`** en code applicatif. Pour une entrée externe non typée, utilise `unknown` puis narrow proprement.
- Types explicites sur les **API publiques** (fonctions exportées, méthodes publiques, props de composant). Laisse l'inférence faire le local.
- `interface` pour les shapes d'objet, `type` pour unions / intersections / tuples.
- **Unions de littéraux** plutôt qu'`enum` (`type Mode = "friends" | "event" | ...`).
- Props React : un `interface`/`type` nommé. Pas de `React.FC`. Callbacks typés explicitement.

## Immutabilité (critique)

Ne mute jamais un objet existant, crée une copie.

```ts
// NON
function update(user, name) { user.name = name; return user }
// OUI
function update(user: Readonly<User>, name: string): User { return { ...user, name } }
```

Vrai aussi pour le state React (toujours un nouvel objet/array, jamais `push`/mutation en place sur le state).

## Taille et organisation des fichiers

- Beaucoup de petits fichiers cohérents > peu de gros fichiers.
- Cible 200 à 400 lignes, 800 max. Au-delà, extrais.
- Cas connu : `frontend/src/components/game/MultiplayerGameClient.tsx` fait ~1430 lignes. C'est une **dette assumée**, ne l'aggrave pas ; si tu y touches lourdement, propose une extraction dans ton handoff plutôt que d'ajouter encore.
- Organise par feature/domaine, pas par type technique.

## Fonctions

- Petites (< 50 lignes idéalement), une responsabilité.
- Pas d'imbrication profonde (> 4 niveaux) : extrais ou inverse les conditions.

## Gestion d'erreurs

- Gère les erreurs explicitement à chaque niveau, jamais de `catch` qui avale en silence.
- Côté UI : message utilisateur clair et humain. Côté serveur : log détaillé (winston) avec contexte.
- `async/await` + `try/catch`, narrow l'erreur (`error instanceof Error`).

## Validation des entrées

- Valide à la frontière du système (entrée utilisateur, réponse d'API externe, contenu de fichier).
- Échoue tôt avec un message clair. Ne fais jamais confiance à une donnée externe.
- Voir aussi [`SECURITY.md`](./SECURITY.md).

## Pas de `console.log` en code livré

Utilise le logger (winston côté backend). Retire tes `console.log` de debug avant de pousser.

## Design / UI

Toute UI suit le design system "Club analogique". Le guide complet et les recettes sont dans [`../maquettes/ANALOG-STYLE-GUIDE.md`](../maquettes/ANALOG-STYLE-GUIDE.md). En résumé :

- Palette : papier `#f4ecdb`, surface `#ece1c8`, puits `#efe5d0`, encre `#2e2014`, secondaire `#6b573f`, muted `#8a7558`. Accents : terracotta `#c65133` (primaire), or `#e0a32e`, **sauge `#7d9471` (= confirmation/succès)**, bleu-gris `#a8b8c8`, erreur `#9c2f1d`.
- Couleurs de mode : friends → terracotta, event → or, streamer → sauge, solo → bleu-gris.
- Ombres **dures décalées** (`4px 4px 0 ...`), jamais de glow.
- Fonts : Fraunces (`font-display`, titres) + Karla (UI).
- **Interdits** : fond sombre, hex néon, glow, `bg-clip-text` gradient text, glassmorphism, `backdrop-blur` sur panneaux.
- Micro-interactions : confirmation = vire sauge + check qui pop ; pression = le bouton s'enfonce dans son ombre ; arrivée = glissement court (pas de fade-in mou). Référence interactive : `maquettes/qol-demo.html`.

## Formatage du contenu (règle utilisateur stricte)

- **JAMAIS de tiret cadratin (—)**. Nulle part : code, commentaires, commits, copie UI, docs. Remplace par virgule, point, parenthèses, ou trait d'union simple selon le cas.
- Copie UI en français, ton naturel et humain (voir [`PRODUCT.md`](./PRODUCT.md) pour le ton). Pas de copie "marketing IA".

## Ce qu'on ne fait pas sans décision explicite

- Ajouter une dépendance npm (justifie le besoin dans le handoff ; préfère une lib éprouvée à du code maison, mais ne l'ajoute pas en douce).
- Toucher la fondation : `globals.css`, `tailwind.config.ts`, `layout.tsx` pour du décoratif.
- Réintroduire un service worker / PWA (voir PITFALLS #3).
- Créer un système de comptes : Blindify a abandonné les comptes (nom + lien en localStorage). Ne réintroduis pas de login/signup.
