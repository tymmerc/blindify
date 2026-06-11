"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"

export type Mode = "friends" | "event" | "streamer"

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
  friends: "#c65133", // terracotta
  event: "#e0a32e", // or
  streamer: "#7d9471", // sauge
}

const MODE_LABELS: Record<Mode, string> = {
  friends: "Mode Amis",
  event: "Mode Événement",
  streamer: "Mode Streamer",
}

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<Mode | null>(null)
  const [isGuest, setIsGuest] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem(STORAGE_KEY)
    // Migrate old "chat" mode to "streamer"
    if (stored === "chat") {
      setModeState("streamer")
      window.localStorage.setItem(STORAGE_KEY, "streamer")
    } else if (stored === "friends" || stored === "event" || stored === "streamer") {
      setModeState(stored as Mode)
    }
    // Clean up old guest mode from localStorage (no longer used)
    try {
      window.localStorage.removeItem(GUEST_KEY)
    } catch {
      // ignore
    }
  }, [])

  const applyTheme = useCallback((next: Mode | null) => {
    if (typeof document === "undefined") return
    const accent = next ? MODE_ACCENTS[next] : "#c65133"
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
    // NEVER persist guest mode to localStorage
    // It should be temporary for each session only
  }, [])

  const value = useMemo<ModeContextValue>(() => {
    const accent = mode ? MODE_ACCENTS[mode] : "#c65133"
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
