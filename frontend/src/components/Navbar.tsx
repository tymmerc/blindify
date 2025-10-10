"use client"
import Link from "next/link"
import { useTheme } from "@/lib/theme-provider"

export default function Navbar() {
  const { theme, toggleTheme } = useTheme()

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 py-6 px-8
                 flex justify-between items-center text-foreground font-semibold text-lg tracking-wide
                 bg-background/80 backdrop-blur-md border-b border-border shadow-sm transition-colors duration-300"
    >
      <div className="flex justify-center gap-12 flex-1">
        <Link href="/profile" className="hover:text-primary transition-colors duration-200">
          Profil
        </Link>
        <Link href="/stats" className="hover:text-primary transition-colors duration-200">
          Statistiques
        </Link>
        <Link href="/history" className="hover:text-primary transition-colors duration-200">
          Historique
        </Link>
        <Link href="/settings" className="hover:text-primary transition-colors duration-200">
          Paramètres
        </Link>
      </div>

      <button
        onClick={toggleTheme}
        className="px-4 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-all duration-200 text-2xl"
        aria-label="Toggle theme"
      >
        {theme === "light" ? "🌙" : "☀️"}
      </button>
    </nav>
  )
}
