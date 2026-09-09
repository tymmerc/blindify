# Blindz - Design Brief

Mis a jour le 31/08/2026. L'ancien brief (mood "futuriste", violet, glassmorphism,
Space Grotesk) decrivait une direction abandonnee au printemps : il ne correspondait
plus a l'app. Source de verite de la DA : `frontend/src/app/globals.css` (tokens) et
`frontend/tailwind.config.ts`.

## Projet
- **Type** : Web app (blind test avec les playlists des joueurs) + landing statique
- **Mood** : Editorial-analogique ("Club analogique") : papier, encre, pochette de disque

## Palette : celle du logo (`public/logo-mark.png`, la cle de sol)
- Papier (fond) : `#f4ecdb` ; papier profond (surfaces) : `#ece1c8` ; puits : `#efe5d0`
- Encre espresso (texte, traits, ombres, blocs sombres) : `#2e2014`
- Les 4 couleurs de la cle de sol, en BLOCS et en accents, jamais en texte petit sur papier :
  vermillon `#cc4830` (CTA, italiques cles), ambre `#d88418` (bloc, accents sur encre),
  sauge `#789084` (decoratif : plateau du disque, pastilles ; contraste insuffisant pour du texte),
  bleu acier `#486090` (bloc avec texte creme).
- Regle de lisibilite (feedback Tym 05/09 : "trop terne, uniforme, monotone" -> blocs colores,
  mais "plus de contraste" -> le texte courant est TOUJOURS encre pleine sur papier/ambre, ou
  creme sur encre/bleu ; les etiquettes 11px sont en encre + pastille de couleur).
- L'ancien terracotta `#c65133` / or `#e0a32e` de l'app restent dans les ecrans de jeu ;
  la landing utilise les valeurs exactes du logo.
- Grain papier global (body::after, mix-blend multiply), ombres dures decalees `4px 4px 0 #2e2014`

## Typo
- Display : **Fraunces** (serif), gros et serre. H1 landing : 2.9rem mobile / 4rem sm / 6rem desktop, leading 1.02.
  Italiques terracotta sur le mot cle (`<em>` : "vos", "Ici, non.").
- UI / texte : **Karla**
- Etiquettes : **JetBrains Mono**, 11px, uppercase, tracking 0.26em, en encre + pastille de couleur.
  Elles DISENT ce qu'il y a dans la section ("Ce qui change", "Les modes de jeu", "En trois etapes").
  Pas de metaphore vinyle "Face A / Face B" : Tym ne l'a pas comprise, personne ne la comprendra.
- Chargement via next/font/google dans `layout.tsx`

## Motion
- Presente, PILOTEE par le scroll, jamais de fade-in au scroll.
- Landing : le disque du hero tourne avec `scrollY`, le bras se pose en entrant dans
  "comment ca marche" (framer-motion `useScroll`/`useTransform`, respecte
  `prefers-reduced-motion`). Les 3 modes en split-screen epingle (`position: sticky`,
  scene SVG qui change via IntersectionObserver ; bandeau compact colle sur mobile).
- App : platine et bras animes dans les ecrans de jeu (AnalogVinyl, TheaterGameView).

## Layout
- Asymetrique, grandes marges, sections separees par un trait d'encre `border-t-2`
  alternant papier / papier profond. Pas de grille de 3 cartes identiques, pas de navbar
  collante, un seul CTA fort par ecran.
- Boutons : rectangle `rounded-md`, bordure encre 2px, ombre dure, qui "s'enfonce" au hover
  (`translate 2px` + ombre reduite). Classes globales `.btn-primary` / `.btn-neon`.

## Pages
- `/` : landing serveur (texte pre-rendu pour les moteurs et les IA), `frontend/src/app/page.tsx`
- `/jouer/` : le wizard de jeu (pseudo, lien, creer/rejoindre). Les QR `/?join=CODE` y sont rediriges.
- `/faq/` : modele de page de contenu (JSON-LD FAQPage)
- `/modes`, lobbies, jeu : composants dans `frontend/src/app/multiplayer/` et `components/game/`
