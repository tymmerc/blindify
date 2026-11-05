// Les salles que ce navigateur a creees, pour en refaire une pareille quand
// le serveur l'a effacee (T7). Le 01/11, un invite est revenu le soir avec le
// code de sa salle de l'apres-midi et a eu une 404 seche : une salle sans
// partie s'efface au bout de 30 minutes (index.ts, stale rooms).
//
// Rien de personnel ici : le mode et les reglages. La musique, elle, reste
// dans la bibliotheque du joueur cote serveur.

export type HostedRoomMode = "friends" | "event" | "streamer"

export type HostedRoom = {
  code: string
  mode: HostedRoomMode
  hostPlays: boolean
  questionCount: number
  roundSeconds: number
  savedAt: number
}

export const HOSTED_ROOMS_KEY = "blindz_hosted_rooms"
const MAX_ROOMS = 8
const MODES: readonly string[] = ["friends", "event", "streamer"]

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "")
}

function isHostedRoom(value: unknown): value is HostedRoom {
  if (!value || typeof value !== "object") return false
  const v = value as Record<string, unknown>
  return (
    typeof v.code === "string" && v.code.length >= 4 &&
    typeof v.mode === "string" && MODES.includes(v.mode) &&
    typeof v.hostPlays === "boolean" &&
    Number.isInteger(v.questionCount) &&
    Number.isInteger(v.roundSeconds) &&
    typeof v.savedAt === "number"
  )
}

function readAll(): HostedRoom[] {
  try {
    const raw = window.localStorage.getItem(HOSTED_ROOMS_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isHostedRoom) : []
  } catch {
    return []
  }
}

function writeAll(rooms: readonly HostedRoom[]): void {
  try {
    window.localStorage.setItem(HOSTED_ROOMS_KEY, JSON.stringify(rooms.slice(0, MAX_ROOMS)))
  } catch { /* stockage plein ou bloque : on s'en passe */ }
}

/** Note (ou met a jour) une salle creee ici. La plus recente passe devant. */
export function rememberHostedRoom(entry: Omit<HostedRoom, "savedAt" | "code"> & { code: string }, now = Date.now()): void {
  const code = normalizeCode(entry.code)
  if (code.length < 4) return
  const others = readAll().filter(r => r.code !== code)
  writeAll([{ ...entry, code, savedAt: now }, ...others])
}

/** Change un reglage d'une salle deja notee (manches, temps de reponse). */
export function updateHostedRoom(code: string, patch: Partial<Pick<HostedRoom, "questionCount" | "roundSeconds">>): void {
  const c = normalizeCode(code)
  const all = readAll()
  const found = all.find(r => r.code === c)
  if (!found) return
  writeAll(all.map(r => (r.code === c ? { ...r, ...patch } : r)))
}

export function findHostedRoom(code: string): HostedRoom | null {
  const c = normalizeCode(code)
  return readAll().find(r => r.code === c) ?? null
}

export function forgetHostedRoom(code: string): void {
  const c = normalizeCode(code)
  writeAll(readAll().filter(r => r.code !== c))
}
