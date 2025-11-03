# Blindify - Application de Blindtest Spotify

Application Next.js moderne pour créer et jouer à des blindtests musicaux avec Spotify.

## 🎵 Fonctionnalités

### Landing Page (Nouvelle)
- ✅ **Navigation sticky** - Header avec logo et CTA
- ✅ **Hero Section** - Introduction avec stats et gradients animés
- ✅ **Features** - 6 fonctionnalités principales avec icônes
- ✅ **How It Works** - 4 étapes explicatives
- ✅ **Pricing** - 3 plans tarifaires (Gratuit, Pro, Entreprise)
- ✅ **CTA Final** - Appel à l'action pour convertir
- ✅ **Footer** - Liens navigation, légal et réseaux sociaux

### Pages Application
- 🎮 `/app/menu` - Menu principal de l'application
- 🎯 `/app/game` - Interface de jeu principale
- 👤 `/app/profile` - Profil utilisateur avec stats et badges
- 📊 `/app/stats` - Statistiques détaillées
- 📜 `/app/history` - Historique des parties
- 🏆 `/app/leaderboard` - Classement global
- 🎲 `/app/lobby` - Salle d'attente multijoueur
- ⚙️ `/app/settings` - Paramètres utilisateur
- 🔐 `/app/auth/callback` - Callback OAuth Spotify

## 📁 Structure du projet

```
blindify-clean/
├── app/
│   ├── app/                    # Pages de l'application
│   │   ├── auth/
│   │   │   └── callback/
│   │   ├── game/
│   │   ├── history/
│   │   ├── leaderboard/
│   │   ├── lobby/
│   │   ├── menu/
│   │   ├── profile/
│   │   ├── settings/
│   │   └── stats/
│   ├── layout.tsx             # Layout racine
│   ├── page.tsx               # Page d'accueil (landing)
│   └── globals.css            # Styles globaux
├── components/
│   ├── landing/               # Composants landing page
│   │   ├── navigation.tsx
│   │   ├── hero.tsx
│   │   ├── features.tsx
│   │   ├── how-it-works.tsx
│   │   ├── pricing.tsx
│   │   ├── cta.tsx
│   │   └── footer.tsx
│   └── ui/                    # Composants UI réutilisables
│       ├── button.tsx
│       ├── card.tsx
│       ├── navbar.tsx
│       └── layout-gradient.tsx
├── lib/
│   ├── api.ts                 # Client API backend
│   └── utils.ts               # Utilitaires
├── public/                    # Assets statiques
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.mjs
```

## 🚀 Installation

### Prérequis
- Node.js 18+ 
- npm ou pnpm

### Étapes

```bash
# 1. Installer les dépendances
npm install
# ou
pnpm install

# 2. Créer le fichier .env.local
cp .env.example .env.local

# 3. Configurer les variables d'environnement
# NEXT_PUBLIC_API_URL=https://votre-api.com

# 4. Lancer le serveur de développement
npm run dev

# 5. Ouvrir http://localhost:3000
```

## 🎨 Personnalisation

### Couleurs
Modifier les couleurs dans `app/globals.css`:

```css
:root {
  --primary: oklch(0.65 0.25 300);    /* Violet principal */
  --accent: oklch(0.78 0.23 60);      /* Vert Spotify */
  /* ... */
}
```

### Images
Placer vos images dans `/public` et mettre à jour les chemins:
- Hero: `components/landing/hero.tsx` (ligne ~66)
- Logo: `components/landing/navigation.tsx` (ligne ~11)

### Pricing
Modifier les plans dans `components/landing/pricing.tsx`:
- Prix (lignes 8, 23, 40)
- Features (lignes 11-17, 26-34, 44-51)
- CTA (lignes 18, 35, 52)

### Links
Mettre à jour les liens dans:
- `components/landing/navigation.tsx` - Menu header
- `components/landing/footer.tsx` - Footer links

## 🏗️ Build & Déploiement

```bash
# Build production
npm run build

# Lancer en production
npm start

# Vérifier le build
npm run lint
```

### Déploiement Vercel
```bash
# Installer Vercel CLI
npm i -g vercel

# Deploy
vercel
```

## 🔧 Technologies

- **Framework:** Next.js 15 (App Router)
- **UI:** React 19, Tailwind CSS 4
- **Animations:** Framer Motion
- **Icons:** Lucide React
- **Components:** Radix UI
- **Styling:** OKLCH Color Space
- **TypeScript:** Full type safety

## 📦 Dépendances principales

```json
{
  "next": "^15.0.0",
  "react": "^19.0.0",
  "framer-motion": "^11.0.0",
  "lucide-react": "^0.454.0",
  "tailwindcss": "^4.0.0"
}
```

## 🎯 Fonctionnalités Backend (API)

L'application communique avec un backend pour:
- **Auth Spotify** - OAuth 2.0
- **Gestion de jeu** - Sessions, scoring, réponses
- **Profils** - Stats, badges, historique
- **Multijoueur** - Salles, matchmaking
- **Playlists** - Récupération Spotify

Voir `lib/api.ts` pour tous les endpoints.

## 🐛 Troubleshooting

### Composant non trouvé
```bash
# Installer les composants manquants
npx shadcn@latest add button
npx shadcn@latest add card
```

### Erreur d'import
Vérifier que les chemins utilisent `@/` et non des chemins relatifs.

### Images ne chargent pas
Vérifier que:
1. Les images sont dans `/public`
2. Les chemins commencent par `/`
3. `next.config.mjs` autorise le domaine

## 📝 Différences avec l'ancien projet

### ✅ Ajouté
- Landing page complète et professionnelle
- Architecture modulaire pour la landing
- Composants UI shadcn/ui (Button, Card)
- Navigation sticky
- Section pricing
- Footer structuré
- Meilleure organisation des fichiers

### ❌ Retiré
- Ancienne page d'accueil monolithique
- Composants landing inutilisés (Hero.tsx, Features.tsx anciens)
- Composants UI custom redondants (ActionButton, SectionCard)
- Fichiers de configuration inutiles

### 🔄 Conservé
- Toutes les pages `/app/*` (game, profile, etc.)
- Fichier `lib/api.ts` complet
- Logique métier et authentification
- Styles et thème OKLCH

## 🤝 Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add: AmazingFeature'`)
4. Push (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

## 📄 Licence

MIT License - voir le fichier LICENSE pour plus de détails.

## 🎉 Remerciements

- Design inspiré par les meilleures landing pages SaaS
- UI Components par shadcn/ui
- Icons par Lucide
- Animations par Framer Motion

---

Fait avec ♪ pour les amoureux de la musique
