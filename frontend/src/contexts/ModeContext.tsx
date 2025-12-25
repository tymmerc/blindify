"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

export type Mode = "friends" | "event" | "chat"

type ModeContextValue = {
  mode: Mode | null
  setMode: (mode: Mode) => void
  resetMode: () => void
  accentColor: string
  label: string
  isGuest: boolean
  setGuest: (value: boolean) => void
}

const ModeContext = createContext<ModeContextValue | undefined>(undefined)

const STORAGE_KEY = "blindify:mode"
const GUEST_KEY = "blindify:guest"
const MODE_ACCENTS: Record<Mode, string> = {
  friends: "#ec4899", // rose
  event: "#8b5cf6", // violet froid
  chat: "#22d3ee", // cyan/bleu glacier
}

const MODE_LABELS: Record<Mode, string> = {
  friends: "Mode Amis",
  event: "Mode Événement",
  chat: "Mode Chat",
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode | null>(null)
  const [isGuest, setIsGuest] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(STORAGE_KEY) as Mode | null
    if (stored === "friends" || stored === "event" || stored === "chat") {
      setModeState(stored)
    }
    const storedGuest = window.localStorage.getItem(GUEST_KEY)
    if (storedGuest === "1") {
      setIsGuest(true)
    }
  }, [])

  const applyTheme = useCallback((next: Mode | null) => {
    if (typeof document === "undefined") return
    const accent = next ? MODE_ACCENTS[next] : "#a855f7"
    document.documentElement.style.setProperty("--app-primary", accent)
    document.documentElement.style.setProperty("--app-accent", accent)
  }, [])

  useEffect(() => {
    applyTheme(mode)
  }, [mode, applyTheme])

  const setMode = useCallback((next: Mode) => {
    setModeState(next)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next)
    }
  }, [])

  const resetMode = useCallback(() => {
    setModeState(null)
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(STORAGE_KEY)
    }
    applyTheme(null)
  }, [applyTheme])

  const setGuest = useCallback((value: boolean) => {
    setIsGuest(value)
    if (typeof window !== "undefined") {
      if (value) {
        window.localStorage.setItem(GUEST_KEY, "1")
      } else {
        window.localStorage.removeItem(GUEST_KEY)
      }
    }
  }, [])

  const value = useMemo<ModeContextValue>(() => {
    const accent = mode ? MODE_ACCENTS[mode] : "#a855f7"
    const label = mode ? MODE_LABELS[mode] : "Mode non défini"
    return { mode, setMode, resetMode, accentColor: accent, label, isGuest, setGuest }
  }, [mode, setMode, resetMode, isGuest, setGuest])

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export function useMode(): ModeContextValue {
  const ctx = useContext(ModeContext)
  if (!ctx) {
    throw new Error("useMode must be used within a ModeProvider")
  }
  return ctx
}
