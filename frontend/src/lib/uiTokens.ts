import type { GameMode } from "@/lib/gameModes"

export const surfaces = {
  background: "#f4ecdb",
  card: "#ece1c8",
  border: "rgba(46,32,20,0.22)",
  text: "#2e2014",
  muted: "#6b573f",
}

export const accents: Record<GameMode, string> = {
  friends: "#c65133",
  event: "#e0a32e",
  streamer: "#7d9471",
}

export const glow = {
  none: "0 0 0 0 transparent",
  subtle: "4px 4px 0 rgba(46,32,20,0.18)",
  focus: (accent: string) => `0 0 0 2px ${accent}`,
}

export const radii = {
  card: "10px",
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
