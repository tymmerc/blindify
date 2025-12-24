import type { GameMode } from "@/lib/gameModes"

export const surfaces = {
  background: "#050505",
  card: "#0b0b0b",
  border: "rgba(255,255,255,0.08)",
  text: "#ffffff",
  muted: "rgba(255,255,255,0.65)",
}

export const accents: Record<GameMode, string> = {
  friends: "#ec4899",
  event: "#8b5cf6",
  chat: "#22d3ee",
}

export const glow = {
  none: "0 0 0 0 transparent",
  subtle: "0 10px 35px rgba(0,0,0,0.35)",
  focus: (accent: string) => `0 0 0 2px ${accent}`,
}

export const radii = {
  card: "24px",
  pill: "9999px",
}

export const spacing = {
  section: "32px",
  cardPadding: "20px",
  gap: "16px",
}

export function modeAccent(mode: GameMode | null | undefined): string {
  if (!mode) return accents.event
  return accents[mode]
}

export function modeDataAttrs(mode: GameMode | null | undefined): Record<string, string> {
  return mode ? { "data-mode": mode } : {}
}

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ")
}
