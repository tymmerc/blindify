# PRODUCT - Blindify à l'échelle produit

> Ce doc cadre Blindify au-delà du repo web : ce que c'est, pour qui, le ton, les modes, et où ça va (web puis app native).
> Quand tu codes une feature, vérifie qu'elle sert cette vision. Si elle s'en écarte, dis-le.

## La vision en une phrase

Blindify est un blind-test musical où on joue avec **sa propre musique**, pas une playlist générique : tu importes tes playlists, et le jeu fait deviner les morceaux que toi et tes potes écoutez vraiment.

## Pour qui

Des groupes d'amis qui veulent jouer ensemble, en soirée. Deux contextes physiques :
- **à distance** (chacun chez soi, sur son téléphone ou son ordi),
- **autour d'une table** (un écran central / une TV, les autres rejoignent depuis leur téléphone).

Gratuit, immédiat, **sans création de compte**. On veut zéro friction entre "j'ouvre le lien" et "on joue".

## Le principe de jeu

1. Chacun importe sa musique (playlists Spotify/Deezer) à l'entrée.
2. Quelqu'un crée une partie, les autres rejoignent avec un code.
3. Un extrait court joue, tout le monde devine **en même temps** : titre, artiste, et **qui a ajouté ce morceau** (le twist social : c'est la musique du groupe).
4. Réponse rapide = plus de points. Reveal, classement, manche suivante.

Le "qui a ajouté ce titre" est une mécanique signature : on ne devine pas juste une chanson, on devine ses amis à travers leurs goûts.

## Les modes (état réel)

| Mode | Nom UI | État | Note |
|---|---|---|---|
| friends | "Entre amis, à distance" | **jouable, prouvé** | le mode principal, chacun sur son écran |
| event | "Autour d'une table" | **jouable** | régie : écran central + QR pour rejoindre. Reste à faire : détection auto grand écran vs téléphone |
| solo | "Solo" | jouable | s'entraîner seul avec sa biblio |
| streamer | "Avec ta communauté" | **différé, "Bientôt"** | pour Twitch/YouTube, non terminé. Reste masqué/`wip` tant que pas fini |

Décisions produit déjà prises :
- **Abandon des comptes** : nom + lien de playlist en `localStorage`, pré-remplis au retour. Pas de login/signup. Ne réintroduis pas de comptes.
- **Flux d'entrée** : Nom → Musique (avec validation d'import) → Créer/Rejoindre → (si créer) choix du mode. Si on rejoint, on ne voit jamais la page des modes.
- **Lobby** : démarrage possible à partir de 2 joueurs ayant importé de la musique. Plus de 4 joueurs autorisés, slots compacts (pas de photo de profil, on ne l'importe pas).

## Le ton (copie UI)

Direction "disquaire / analogique", mais **neutre et naturel**, pas too much. On a explicitement baissé le côté "vinyle lyrique" ("pose le diamant c'est nul"). Garde l'univers analogique en surface (Face A/Face B, platine, pochette) sans en faire des tonnes.

Règles de copie :
- Français, ton humain, comme un pote qui explique le jeu. Contractions, phrases courtes.
- **Pas de tiret cadratin (—).** Jamais.
- Pas de copie marketing générique ni de formules IA ("plongez dans l'univers...", "il est important de noter..."). On écrit comme on parle.
- Pas d'emoji posé en icône de déco. Les icônes viennent de lucide-react.

## L'identité visuelle : "Club analogique"

C'est l'ADN visuel de Blindify, web ET futur natif. Fond papier crème, encre, ombres dures décalées, terracotta/or/sauge. Zéro glow, zéro fond sombre, zéro gradient text, zéro glassmorphism. Le détail vit dans [`../maquettes/ANALOG-STYLE-GUIDE.md`](../maquettes/ANALOG-STYLE-GUIDE.md). Toute nouvelle surface, sur n'importe quelle plateforme, doit pouvoir tenir dans cet univers.

Les micro-interactions font partie de l'identité : confirmation = sauge + check qui pop, pression = bouton qui s'enfonce, arrivée = glissement court. Référence validée : `maquettes/qol-demo.html`.

## La roadmap à l'échelle Blindify

1. **Maintenant : finir le web.** C'est la priorité. Boucler le flux (détection écran pour "autour d'une table", notice live de musique dans le lobby), finir le polish, figer la DA, trancher le sort du mode streamer.
2. **Ensuite : app mobile native.** Décidée, à construire **from scratch** (pas un wrapper / pas une PWA), sur Mac avec Xcode. Elle reprendra l'univers Club analogique et la même mécanique de jeu, en s'inspirant des party-games mobiles. Le backend (Express + socket.io + Postgres) est pensé pour être réutilisé par le natif.
3. Différés : logo, autres plateformes de streaming (Apple Music, YouTube Music).

## Ce que Blindify n'est PAS (non-goals)

- Pas un service de streaming musical : on joue avec des **extraits** (previews Deezer/Spotify), pas de lecture intégrale.
- Pas une plateforme à comptes / réseau social. Pas de profils publics, pas de feed.
- Pas un quiz à playlists génériques imposées : la musique vient des joueurs.
- Pas une app "corporate" : le ton et le design sont assumés, artisanaux, pas Bootstrap/Material par défaut.

## Boussole pour décider

Quand tu hésites sur une feature ou un détail d'UX, demande-toi : est-ce que ça réduit la friction pour "ouvrir et jouer entre amis", est-ce que ça renforce le twist "notre musique à nous", et est-ce que ça tient dans l'univers Club analogique ? Si les trois sont oui, c'est dans la bonne direction.
