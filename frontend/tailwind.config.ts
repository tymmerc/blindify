import type { Config } from "tailwindcss"
import tailwindcssAnimate from "tailwindcss-animate"

/** Couleur du theme a partir de son jeton --c-* (triplet RGB), opacite comprise. */
const tok = (nom: string) => `rgb(var(--c-${nom}) / <alpha-value>)`

const config: Config = {
  // Mode sombre pose par data-theme="dark" sur <html> (pas une classe).
  darkMode: ["variant", "&:is([data-theme=\"dark\"] *)"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Karla", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        display: ["var(--font-display)", "Fraunces", "Georgia", "serif"],
      },
      colors: {
        // Jetons du theme (globals.css, --c-*) : clair ou nuit chaude selon
        // data-theme sur <html>. Le suffixe -txt = la variante lisible en texte.
        "paper": tok("paper"),
        "paper-deep": tok("paper-deep"),
        "well": tok("well"),
        "paper-strong": tok("paper-strong"),
        "paper-light": tok("paper-light"),
        "ink": tok("ink"),
        "line": tok("line"),
        "ink-block": tok("ink-block"),
        "ink-block-hover": tok("ink-block-hover"),
        "on-ink": tok("on-ink"),
        "on-accent": tok("on-accent"),
        "ink-2": tok("ink-2"),
        "sourd": tok("sourd"),
        "pale": tok("pale"),
        "terra": tok("terra"),
        "terra-txt": tok("terra-txt"),
        "vermillon": tok("vermillon"),
        "vermillon-txt": tok("vermillon-txt"),
        "rouge": tok("rouge"),
        "rouge-txt": tok("rouge-txt"),
        "gold": tok("gold"),
        "gold-txt": tok("gold-txt"),
        "gold-deep-txt": tok("gold-deep-txt"),
        "ambre": tok("ambre"),
        "ambre-txt": tok("ambre-txt"),
        "sage": tok("sage"),
        "sage-txt": tok("sage-txt"),
        "sage-deep-txt": tok("sage-deep-txt"),
        "acier": tok("acier"),
        "acier-txt": tok("acier-txt"),
        // Couleurs nommees historiques, branchees sur les memes jetons.
        background: tok("paper"),
        foreground: tok("ink"),
        border: "rgb(var(--c-line) / 0.22)",
        ring: "rgb(var(--c-terra) / 0.55)",
        primary: { DEFAULT: tok("terra"), foreground: tok("on-ink") },
        secondary: { DEFAULT: tok("gold"), foreground: "#2e2014" },
        accent: { DEFAULT: tok("terra"), foreground: tok("on-ink") },
        destructive: { DEFAULT: tok("rouge"), foreground: tok("on-ink") },
        muted: { DEFAULT: tok("paper-deep"), foreground: tok("sourd") },
        popover: { DEFAULT: tok("paper"), foreground: tok("ink") },
        card: { DEFAULT: tok("paper-deep"), foreground: tok("ink") },
        surface: { DEFAULT: tok("paper-deep"), strong: tok("paper-strong"), well: tok("well") },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
      },
      boxShadow: {
        // Ombres dures decalees, esprit print/pochette de disque.
        glow: "4px 4px 0 rgb(var(--c-shadow) / 0.18)",
        "glow-sm": "3px 3px 0 rgb(var(--c-shadow) / 0.15)",
        "glow-cyan": "4px 4px 0 rgb(var(--c-sage) / 0.4)",
        "glow-purple": "4px 4px 0 rgb(var(--c-gold) / 0.4)",
        "glow-yellow": "4px 4px 0 rgb(var(--c-gold) / 0.4)",
        "glow-pink": "4px 4px 0 rgb(var(--c-terra) / 0.4)",
        "glow-orange": "4px 4px 0 rgb(var(--c-terra) / 0.4)",
        "glow-violet": "4px 4px 0 rgb(var(--c-gold) / 0.4)",
        "neon-inset": "inset 0 1px 3px rgb(var(--c-shadow) / 0.18)",
        glass: "4px 4px 0 rgb(var(--c-shadow) / 0.16)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "4px 4px 0 rgb(var(--c-shadow) / 0.14)" },
          "50%": { boxShadow: "4px 4px 0 rgb(var(--c-shadow) / 0.26)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        // Synthwave-specific
        "scan-line": {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100vh)" },
        },
        "neon-flicker": {
          "0%, 100%": { textShadow: "none", opacity: "1" },
        },
        "grid-move": {
          "0%": { transform: "translateY(0)" },
          "100%": { transform: "translateY(40px)" },
        },
        glitch: {
          "0%, 100%": { transform: "translate(0)" },
          "20%": { transform: "translate(-2px, 2px)" },
          "40%": { transform: "translate(-2px, -2px)" },
          "60%": { transform: "translate(2px, 2px)" },
          "80%": { transform: "translate(2px, -2px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2.4s ease-in-out infinite",
        shimmer: "shimmer 3s ease-in-out infinite",
        "scan-line": "scan-line 7s linear infinite",
        "neon-flicker": "neon-flicker 4s linear infinite",
        "grid-move": "grid-move 8s linear infinite",
        glitch: "glitch 0.4s linear",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config

export default config
