import type { Config } from "tailwindcss"
import tailwindcssAnimate from "tailwindcss-animate"

const config: Config = {
  darkMode: "class",
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
        // Club analogique : papier creme, encre espresso, terracotta, or.
        background: "#f4ecdb",
        foreground: "#2e2014",
        border: "rgba(46, 32, 20, 0.22)",
        ring: "rgba(198, 81, 51, 0.55)",
        primary: {
          DEFAULT: "#c65133", // terracotta
          foreground: "#f4ecdb",
        },
        secondary: {
          DEFAULT: "#e0a32e", // or
          foreground: "#2e2014",
        },
        accent: {
          DEFAULT: "#c65133",
          foreground: "#f4ecdb",
        },
        destructive: {
          DEFAULT: "#9c2f1d",
          foreground: "#f4ecdb",
        },
        muted: {
          DEFAULT: "#ece1c8",
          foreground: "#8a7558",
        },
        popover: {
          DEFAULT: "#f4ecdb",
          foreground: "#2e2014",
        },
        card: {
          DEFAULT: "#ece1c8",
          foreground: "#2e2014",
        },
        surface: {
          DEFAULT: "#ece1c8",
          strong: "#e6d9bd",
          well: "#efe5d0",
        },
        // Anciennes couleurs "neon" remappees sur la palette chaude
        // (les classes text-neon-pink etc. degradent proprement).
        neon: {
          pink: "#c65133",
          cyan: "#7d9471",
          purple: "#e0a32e",
          yellow: "#e0a32e",
          green: "#7d9471",
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.25rem",
      },
      boxShadow: {
        // Ombres dures decalees, esprit print/pochette de disque.
        glow: "4px 4px 0 rgba(46, 32, 20, 0.18)",
        "glow-sm": "3px 3px 0 rgba(46, 32, 20, 0.15)",
        "glow-cyan": "4px 4px 0 rgba(125, 148, 113, 0.4)",
        "glow-purple": "4px 4px 0 rgba(224, 163, 46, 0.4)",
        "glow-yellow": "4px 4px 0 rgba(224, 163, 46, 0.4)",
        "glow-pink": "4px 4px 0 rgba(198, 81, 51, 0.4)",
        "glow-orange": "4px 4px 0 rgba(198, 81, 51, 0.4)",
        "glow-violet": "4px 4px 0 rgba(224, 163, 46, 0.4)",
        "neon-inset": "inset 0 1px 3px rgba(46, 32, 20, 0.18)",
        glass: "4px 4px 0 rgba(46, 32, 20, 0.16)",
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
          "0%, 100%": { boxShadow: "4px 4px 0 rgba(46, 32, 20, 0.14)" },
          "50%": { boxShadow: "4px 4px 0 rgba(46, 32, 20, 0.26)" },
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
