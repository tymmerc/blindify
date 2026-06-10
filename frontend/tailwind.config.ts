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
        sans: ["var(--font-sans)", "Space Grotesk", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "monospace"],
        display: ["var(--font-display)", "Audiowide", "Space Grotesk", "sans-serif"],
      },
      colors: {
        // Synthwave neon palette. Dark base, electric accents.
        background: "#0a0014",
        foreground: "#f8f0ff",
        border: "rgba(255, 90, 240, 0.18)",
        ring: "rgba(0, 247, 255, 0.7)",
        primary: {
          DEFAULT: "#ff2ec8", // hot magenta
          foreground: "#0a0014",
        },
        secondary: {
          DEFAULT: "#00f7ff", // cyan neon
          foreground: "#0a0014",
        },
        accent: {
          DEFAULT: "#a855f7", // electric purple
          foreground: "#0a0014",
        },
        destructive: {
          DEFAULT: "#ff3868",
          foreground: "#fff",
        },
        muted: {
          DEFAULT: "#170028",
          foreground: "#9b7fb8",
        },
        popover: {
          DEFAULT: "rgba(15, 5, 30, 0.95)",
          foreground: "#f8f0ff",
        },
        card: {
          DEFAULT: "rgba(35, 8, 65, 0.7)",
          foreground: "#f8f0ff",
        },
        surface: {
          DEFAULT: "#0f051e",
          strong: "rgba(35, 8, 65, 0.75)",
          well: "rgba(15, 5, 30, 0.92)",
        },
        // Direct neon colors for explicit usage
        neon: {
          pink: "#ff2ec8",
          cyan: "#00f7ff",
          purple: "#a855f7",
          yellow: "#ffea00",
          green: "#00ff9d",
        },
      },
      borderRadius: {
        lg: "1.25rem",
        md: "0.75rem",
        sm: "0.5rem",
      },
      boxShadow: {
        // Neon glows much stronger than before for arcade feel.
        glow: "0 0 30px rgba(255, 46, 200, 0.45), 0 0 8px rgba(255, 46, 200, 0.6)",
        "glow-sm": "0 0 14px rgba(255, 46, 200, 0.4)",
        "glow-cyan": "0 0 30px rgba(0, 247, 255, 0.5), 0 0 8px rgba(0, 247, 255, 0.7)",
        "glow-purple": "0 0 30px rgba(168, 85, 247, 0.5), 0 0 8px rgba(168, 85, 247, 0.7)",
        "glow-yellow": "0 0 30px rgba(255, 234, 0, 0.5)",
        "glow-pink": "0 0 30px rgba(255, 46, 200, 0.5)",
        "glow-orange": "0 0 30px rgba(249, 115, 22, 0.5)",
        "glow-violet": "0 0 30px rgba(139, 92, 246, 0.5)",
        // Inset glow for sunken "screen" feel
        "neon-inset": "inset 0 0 30px rgba(255, 46, 200, 0.15), inset 0 0 4px rgba(0, 247, 255, 0.3)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 46, 200, 0.15)",
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
          "0%, 100%": { boxShadow: "0 0 20px rgba(255, 46, 200, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(255, 46, 200, 0.6), 0 0 10px rgba(0, 247, 255, 0.4)" },
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
          "0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%": {
            textShadow:
              "0 0 4px currentColor, 0 0 11px currentColor, 0 0 19px currentColor, 0 0 40px var(--neon-color, #ff2ec8)",
            opacity: "1",
          },
          "20%, 24%, 55%": { textShadow: "none", opacity: "0.85" },
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
