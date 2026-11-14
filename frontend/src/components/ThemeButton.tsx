"use client"

import { useTheme } from "@/contexts/ThemeContext"

/**
 * Le rond clair / sombre (T30) : lune en clair, soleil en sombre. Un clic force
 * l'autre theme ; « Apparence » dans Mon compte permet de revenir en auto.
 * Les deux icones sont rendues et la bonne s'affiche par CSS (dark:) : le
 * theme est connu avant l'hydratation, pas le rendu statique.
 */
export function ThemeButton({ className = "" }: { readonly className?: string }) {
  const { theme, choisir } = useTheme()
  const sombre = theme === "dark"
  return (
    <button
      type="button"
      onClick={() => choisir(sombre ? "clair" : "sombre")}
      aria-label={sombre ? "Passer en mode clair" : "Passer en mode sombre"}
      title={sombre ? "Passer en mode clair" : "Passer en mode sombre"}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-paper-deep text-ink shadow-[2px_2px_0_rgb(var(--c-shadow))] transition hover:bg-ink-block hover:text-on-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra ${className}`}
    >
      <svg className="dark:hidden" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
      <svg className="hidden dark:block" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    </button>
  )
}
