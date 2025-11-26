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
      colors: {
        background: "#050510",
        foreground: "#e2e8f0",
        border: "rgba(148, 163, 184, 0.15)",
        ring: "rgba(168, 85, 247, 0.6)",
        primary: {
          DEFAULT: "#a855f7",
          foreground: "#050510",
        },
        secondary: {
          DEFAULT: "#6366f1",
          foreground: "#f8fafc",
        },
        accent: {
          DEFAULT: "#22c55e",
          foreground: "#03130a",
        },
        destructive: {
          DEFAULT: "#f87171",
          foreground: "#0b0b14",
        },
        muted: {
          DEFAULT: "#1a1d35",
          foreground: "#94a3b8",
        },
        popover: {
          DEFAULT: "rgba(8, 10, 22, 0.92)",
          foreground: "#f8fafc",
        },
        card: {
          DEFAULT: "rgba(20, 24, 42, 0.75)",
          foreground: "#e2e8f0",
        },
      },
      borderRadius: {
        lg: "1.5rem",
        md: "1rem",
        sm: "0.75rem",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config

export default config
