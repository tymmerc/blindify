# Blindify - Design Brief

## Projet
- **Type** : SaaS / Web App (music blind test game)
- **Mood** : Futuriste
- **Reference** : https://github.com/aki91253/blindtest-bash

## Palette
- Background : `#0a0e17` (dark blue-tinted)
- Surface : `rgba(14, 18, 32, 0.45)` (glass panels)
- Surface strong : `rgba(14, 18, 32, 0.65)`
- Border : `rgba(148, 163, 184, 0.08)` / hover `rgba(148, 163, 184, 0.18)`
- Text primary : `#E0E8F0`
- Text muted : `#8896b0`
- Primary accent : `#a855f7` (purple)
- Mode accents : Friends `#ec4899` (pink), Event `#8b5cf6` (violet), Streamer `#f97316` (orange)
- Gradient : `from-[#a855f7] to-[#ec4899]`

## Fonts
- Display / Body : **Space Grotesk** (via next/font/google)
- Labels / Mono : **JetBrains Mono** (via next/font/google)
- Labels styling : `font-mono text-[11px] uppercase tracking-[0.1em]`

## Layout
- Glassmorphism panels (backdrop-blur + semi-transparent bg + subtle borders)
- Glow effects on interactive elements (accent-colored box-shadows on hover)
- Dark blue-tinted backgrounds (NOT pure black)
- Rounded-xl buttons (not rounded-full)
- Grid-based info cards

## Composants cles
- Glass panels (SurfaceCard) : blur + transparent bg + border
- Glow buttons : accent-colored bg/border with hover shadow
- Mono labels : JetBrains Mono uppercase for badges, stats, categories
- Bottom nav : glass backdrop with 4 items

## Pages preservees
- `/modes` : page de selection de mode (NON modifiee)

## Direction artistique
Inspiree du repo blindtest-bash : glassmorphisme, typo Space Grotesk + JetBrains Mono, neon glows, dark-first.
Adaptee aux couleurs existantes de Blindify (purple primary, pink/violet/orange mode accents).
