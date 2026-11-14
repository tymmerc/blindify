"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"
import { THEME_EVENT, THEME_STORAGE_KEY, appliquerTheme, changerChoix, choixActuel, themeActuel, type ResolvedTheme, type ThemeChoice } from "@/lib/theme"

interface ThemeContextValue {
  /** Ce que la personne a choisi (auto par defaut). */
  readonly choix: ThemeChoice
  /** Ce qui est affiche. */
  readonly theme: ResolvedTheme
  readonly choisir: (choix: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/** Le theme est deja pose par le script du <head> : ce contexte le suit et le change. */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const [choix, setChoix] = useState<ThemeChoice>("auto")
  const [theme, setTheme] = useState<ResolvedTheme>("light")

  useEffect(() => {
    setChoix(choixActuel())
    setTheme(themeActuel())
    const suivre = (e: Event) => setTheme((e as CustomEvent<ResolvedTheme>).detail)
    window.addEventListener(THEME_EVENT, suivre)
    // En auto, le telephone qui passe en sombre le soir change Blindz en direct.
    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null
    const appareil = () => {
      if (choixActuel() === "auto") appliquerTheme()
    }
    mq?.addEventListener?.("change", appareil)
    // Un autre onglet a change le choix.
    const onglet = (e: StorageEvent) => {
      if (e.key === null || e.key === THEME_STORAGE_KEY) {
        setChoix(choixActuel())
        appliquerTheme()
      }
    }
    window.addEventListener("storage", onglet)
    return () => {
      window.removeEventListener(THEME_EVENT, suivre)
      mq?.removeEventListener?.("change", appareil)
      window.removeEventListener("storage", onglet)
    }
  }, [])

  const choisir = useCallback((c: ThemeChoice) => {
    setChoix(c)
    setTheme(changerChoix(c))
  }, [])

  return <ThemeContext.Provider value={{ choix, theme, choisir }}>{children}</ThemeContext.Provider>
}

/** Hors du fournisseur (tests, ilot isole), on lit et on ecrit directement. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (ctx) return ctx
  return { choix: choixActuel(), theme: themeActuel(), choisir: c => void changerChoix(c) }
}
