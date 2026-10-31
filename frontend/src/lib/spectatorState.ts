/**
 * Vue spectateur (T18) : ce que la page /spectateur/ sait de la partie,
 * reconstruit a partir des trames du socket. Le spectateur recoit les memes
 * trames que les joueurs (caviardees pendant la manche) : ce reducteur ne
 * fait que les assembler, sans rien deduire de plus.
 */
import type { MultiplayerGameState, MultiplayerPlayerState } from "./types"

export type SpectatorMember = { userId: number; username: string | null; status: "active" | "away" | "disconnected" }

export type SpectatorErrorCode = "spectateur_expire" | "spectateur_refuse" | "spectateur_limite" | "spectateur_desactive" | "lien_incomplet" | "reseau"

export type SpectatorView = {
  status: "connecting" | "live" | "error"
  error: SpectatorErrorCode | null
  roomCode: string | null
  mode: string | null
  discord: boolean
  expiresAt: number | null
  /** Decalage horloge serveur - horloge locale (ms), pour le compte a rebours. */
  clockOffset: number
  members: SpectatorMember[]
  game: MultiplayerGameState | null
}

export type SpectatorEvent =
  | { type: "init"; payload: { roomCode: string; mode: string; discord?: boolean; expiresAt: number; members: SpectatorMember[]; serverTimestamp?: number }; now: number }
  | { type: "game:state"; payload: MultiplayerGameState }
  | { type: "game:round:start"; payload: { roomCode: string; round: number; track: MultiplayerGameState["currentTrack"]; timing: MultiplayerGameState["timing"] } }
  | { type: "game:round:reveal"; payload: { roomCode: string; round: number; track?: MultiplayerGameState["currentTrack"]; timing: MultiplayerGameState["timing"]; players: MultiplayerGameState["players"] } }
  | { type: "game:over"; payload: { roomCode: string; players: MultiplayerGameState["players"] } }
  | { type: "room:presence"; payload: { roomCode?: string; type?: string; members?: SpectatorMember[] } }
  | { type: "error"; code: SpectatorErrorCode }

export const initialSpectatorView: SpectatorView = {
  status: "connecting",
  error: null,
  roomCode: null,
  mode: null,
  discord: false,
  expiresAt: null,
  clockOffset: 0,
  members: [],
  game: null,
}

const KNOWN_ERRORS = new Set<SpectatorErrorCode>(["spectateur_expire", "spectateur_refuse", "spectateur_limite", "spectateur_desactive"])

/** Le message de connect_error du serveur, ramene a un code connu. */
export function spectatorErrorCode(message: unknown): SpectatorErrorCode {
  return typeof message === "string" && KNOWN_ERRORS.has(message as SpectatorErrorCode) ? (message as SpectatorErrorCode) : "reseau"
}

function sameRoom(view: SpectatorView, roomCode: string | undefined): boolean {
  return !view.roomCode || roomCode === view.roomCode
}

export function spectatorReducer(view: SpectatorView, event: SpectatorEvent): SpectatorView {
  switch (event.type) {
    case "init": {
      const p = event.payload
      return {
        ...view,
        status: "live",
        error: null,
        roomCode: p.roomCode,
        mode: p.mode,
        discord: p.discord === true,
        expiresAt: p.expiresAt,
        clockOffset: typeof p.serverTimestamp === "number" ? p.serverTimestamp - event.now : view.clockOffset,
        members: Array.isArray(p.members) ? p.members : [],
      }
    }
    case "game:state":
      if (!sameRoom(view, event.payload?.roomCode)) return view
      return { ...view, game: event.payload }
    case "game:round:start": {
      const p = event.payload
      if (!view.game || !sameRoom(view, p.roomCode) || view.game.currentRound === p.round) return view
      return { ...view, game: { ...view.game, phase: "GUESSING", currentRound: p.round, currentTrack: p.track, timing: p.timing } }
    }
    case "game:round:reveal": {
      const p = event.payload
      if (!view.game || !sameRoom(view, p.roomCode)) return view
      return {
        ...view,
        game: { ...view.game, phase: "REVEAL", currentRound: p.round, currentTrack: p.track ?? view.game.currentTrack, timing: p.timing, players: p.players },
      }
    }
    case "game:over": {
      const p = event.payload
      if (!view.game || !sameRoom(view, p.roomCode)) return view
      return { ...view, game: { ...view.game, phase: "FINISHED", players: p.players } }
    }
    case "room:presence": {
      const p = event.payload
      if (p?.type !== "members" || !Array.isArray(p.members) || !sameRoom(view, p.roomCode)) return view
      return { ...view, members: p.members }
    }
    case "error":
      return { ...view, status: "error", error: event.code }
    default:
      return view
  }
}

/** Classement : score decroissant, puis temps de reponse cumule (comme le jeu). */
export function rankedPlayers(game: MultiplayerGameState | null): MultiplayerPlayerState[] {
  if (!game) return []
  return Object.values(game.players ?? {}).sort(
    (a, b) => (b.score ?? 0) - (a.score ?? 0) || (a.totalReactionMs ?? 0) - (b.totalReactionMs ?? 0),
  )
}

/** Secondes restantes de la manche, horloge du serveur. */
export function secondsLeft(game: MultiplayerGameState | null, now: number, clockOffset: number): number | null {
  const revealAt = game?.timing?.revealAt
  if (!game || game.phase !== "GUESSING" || typeof revealAt !== "number") return null
  return Math.max(0, Math.ceil((revealAt - (now + clockOffset)) / 1000))
}

export const SPECTATOR_ERROR_TEXT: Record<SpectatorErrorCode, { title: string; body: string }> = {
  spectateur_expire: { title: "Ce lien a expiré", body: "Un lien spectateur vaut 3 heures. Le prochain mail en apportera un nouveau." },
  spectateur_refuse: { title: "Lien invalide", body: "Ce lien ne correspond à aucune salle, ou il a été modifié." },
  spectateur_limite: { title: "Trop d'essais", body: "Trop de connexions spectateur depuis cette adresse. Réessaie dans quelques minutes." },
  spectateur_desactive: { title: "Mode spectateur désactivé", body: "Le serveur n'a pas de secret spectateur (SPECTATEUR_SECRET)." },
  lien_incomplet: { title: "Lien incomplet", body: "Il manque la salle ou le jeton. Ouvre le lien du mail tel quel." },
  reseau: { title: "Connexion impossible", body: "Le serveur ne répond pas. La page réessaie toute seule." },
}
