/**
 * Mode streamer (T5) : ce que la page viewer (/live) et l'overlay OBS
 * (/streamer/overlay) savent de la partie, reconstruit a partir des trames du
 * socket. Fonctions pures, testees a part.
 *
 * Le serveur caviarde deja tout (pas d'extrait pour les viewers, pas de titre
 * avant le reveal) : ces reducteurs assemblent, sans rien deduire.
 */
import type { StreamerLeaderEntry, StreamerState } from "./types"
import { absoluteUrl } from "./publicPath"

export type LiveErrorCode =
  | "live_desactive"
  | "live_limite"
  | "live_introuvable"
  | "live_complet"
  | "pseudo_invalide"
  | "pseudo_refuse"
  | "pseudo_pris"
  | "ip_pleine"
  | "exclu"
  | "overlay_desactive"
  | "overlay_refuse"
  | "overlay_expire"
  | "lien_incomplet"
  | "reseau"

const KNOWN: ReadonlySet<string> = new Set<LiveErrorCode>([
  "live_desactive",
  "live_limite",
  "live_introuvable",
  "live_complet",
  "pseudo_invalide",
  "pseudo_refuse",
  "pseudo_pris",
  "ip_pleine",
  "exclu",
  "overlay_desactive",
  "overlay_refuse",
  "overlay_expire",
])

/** Le message de connect_error du serveur, ramene a un code connu. */
export function liveErrorCode(message: unknown): LiveErrorCode {
  return typeof message === "string" && KNOWN.has(message) ? (message as LiveErrorCode) : "reseau"
}

export const LIVE_ERROR_TEXT: Record<LiveErrorCode, string> = {
  live_desactive: "Le mode streamer est fermé pour le moment.",
  live_limite: "Trop de tentatives depuis ta connexion. Attends quelques minutes.",
  live_introuvable: "Aucun live avec ce code. Vérifie le code affiché sur le stream.",
  live_complet: "Ce live est complet. Tu peux toujours regarder et jouer dans ta tête.",
  pseudo_invalide: "Ton pseudo doit faire entre 2 et 20 caractères (lettres, chiffres, espaces).",
  pseudo_refuse: "Ce pseudo n'est pas accepté ici. Choisis-en un autre.",
  pseudo_pris: "Ce pseudo est déjà pris dans ce live. Choisis-en un autre.",
  ip_pleine: "Trop de joueurs depuis ta connexion dans ce live.",
  exclu: "Le streamer t'a retiré de cette partie.",
  overlay_desactive: "Le lien d'overlay n'est pas configuré sur le serveur.",
  overlay_refuse: "Ce lien d'overlay n'est pas valable. Recopie-le depuis le lobby.",
  overlay_expire: "Ce lien d'overlay a expiré. Recopie-le depuis le lobby.",
  lien_incomplet: "Lien incomplet. Recopie-le depuis le lobby.",
  reseau: "Connexion perdue. On réessaie…",
}

/** Les erreurs ou le viewer doit corriger sa saisie (on lui rend le formulaire). */
export function isFormError(code: LiveErrorCode): boolean {
  return code === "pseudo_invalide" || code === "pseudo_refuse" || code === "pseudo_pris" || code === "live_introuvable"
}

/** Refus definitifs de l'overlay : le lien ne vaut rien. Le reste (limite, reseau) se retente. */
export function overlayErrorIsFinal(code: LiveErrorCode): boolean {
  return code === "overlay_refuse" || code === "overlay_expire" || code === "overlay_desactive" || code === "live_desactive" || code === "lien_incomplet"
}

export const LIVE_CODE_FORMAT = /^[A-Z0-9]{4,8}$/

/** Nom de chaine Twitch, meme regle que le serveur (twitchChat.ts). */
export const TWITCH_CHANNEL_FORMAT = /^[a-z0-9_]{3,25}$/

/** Nom tape ou lien colle -> nom de chaine, ou "" si vide. Null s'il n'est pas valable. */
export function cleanTwitchChannel(raw: string): string | null {
  if (raw.length > 100) return null
  let value = raw.trim().toLowerCase().replace(/^#/, "").replace(/^https?:\/\/(www\.)?twitch\.tv\//, "")
  // Boucle plutot que /\/+$/ : lente sur une saisie piegee de « / » (ReDoS).
  while (value.endsWith("/")) value = value.slice(0, -1)
  if (!value) return ""
  return TWITCH_CHANNEL_FORMAT.test(value) ? value : null
}

export type TwitchStatus = "connexion" | "connecte" | "reconnexion" | "ferme"

export const TWITCH_STATUS_TEXT: Record<TwitchStatus, string> = {
  connexion: "connexion…",
  connecte: "lu en direct",
  reconnexion: "coupé, on se reconnecte…",
  ferme: "fermé",
}

export function cleanLiveCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
}

/** L'adresse a afficher sur le stream et dans le QR code. */
export function liveJoinUrl(code?: string | null): string {
  const base = absoluteUrl("/live/")
  return code ? `${base}?code=${encodeURIComponent(code)}` : base
}

export function liveLabel(): string {
  return absoluteUrl("/live").replace(/^https?:\/\//, "").replace(/\/+$/, "")
}

/** Secondes restantes d'une phase, avec le decalage d'horloge du serveur. */
export function secondsLeft(timing: StreamerState["timing"] | undefined, now: number, clockOffset = 0): number {
  if (!timing?.endAt) return 0
  return Math.max(0, Math.ceil((timing.endAt - (now + clockOffset)) / 1000))
}

/** Part de la phase deja ecoulee (0 au debut, 1 a la fin). */
export function elapsedRatio(timing: StreamerState["timing"] | undefined, now: number, clockOffset = 0): number {
  if (!timing?.startAt || !timing.endAt || timing.endAt <= timing.startAt) return 0
  const t = now + clockOffset
  return Math.min(1, Math.max(0, (t - timing.startAt) / (timing.endAt - timing.startAt)))
}

export const REVEALED_PHASES: ReadonlySet<StreamerState["phase"]> = new Set(["REVEAL_FINAL", "ROUND_ENDED", "GAME_OVER"])

// ---------------------------------------------------------------------------
// Page viewer
// ---------------------------------------------------------------------------

export type LiveMe = { id: string; key: string; pseudo: string; score: number; rank: number | null }
export type LiveResult = { round: number; verdict: "correct" | "close" | "wrong" | "none"; points: number; score: number; rank: number | null; total: number }
export type LiveAckOutcome = "ok" | "ferme" | "deja" | "inconnu" | "vide" | "limite"

export type LiveView = {
  status: "form" | "connecting" | "live" | "error"
  error: LiveErrorCode | null
  roomCode: string | null
  me: LiveMe | null
  game: StreamerState | null
  /** Manche ou sa reponse est partie (0 = aucune). */
  answeredRound: number
  /** Manche en cours d'envoi, en attente de l'accuse du serveur. */
  sendingRound: number
  lastAck: LiveAckOutcome | null
  lastResult: LiveResult | null
  clockOffset: number
}

export type LiveEvent =
  | { type: "connect"; roomCode: string }
  | { type: "init"; payload: { roomCode: string; me: LiveMe; answeredRound: number; state: StreamerState | null; serverTimestamp?: number }; now: number }
  | { type: "state"; payload: StreamerState }
  | { type: "sending"; round: number }
  | { type: "ack"; payload: { round?: number; outcome: LiveAckOutcome } }
  | { type: "result"; payload: LiveResult & { roomCode?: string } }
  | { type: "error"; code: LiveErrorCode }
  | { type: "reset" }

export const initialLiveView: LiveView = {
  status: "form",
  error: null,
  roomCode: null,
  me: null,
  game: null,
  answeredRound: 0,
  sendingRound: 0,
  lastAck: null,
  lastResult: null,
  clockOffset: 0,
}

function offsetOf(serverTimestamp: number | undefined, now: number): number {
  return typeof serverTimestamp === "number" ? serverTimestamp - now : 0
}

export function liveReducer(view: LiveView, event: LiveEvent): LiveView {
  switch (event.type) {
    case "connect":
      return { ...initialLiveView, status: "connecting", roomCode: event.roomCode }
    case "init": {
      const { payload } = event
      return {
        ...view,
        status: "live",
        error: null,
        roomCode: payload.roomCode,
        me: payload.me,
        game: payload.state,
        answeredRound: payload.answeredRound,
        clockOffset: offsetOf(payload.serverTimestamp, event.now),
      }
    }
    case "state": {
      if (view.roomCode && event.payload.roomCode !== view.roomCode) return view
      const newRound = event.payload.currentRound !== view.game?.currentRound
      return {
        ...view,
        game: event.payload,
        lastAck: newRound ? null : view.lastAck,
        lastResult: newRound ? null : view.lastResult,
        sendingRound: newRound ? 0 : view.sendingRound,
      }
    }
    case "sending":
      return { ...view, sendingRound: event.round, lastAck: null }
    case "ack": {
      const accepted = event.payload.outcome === "ok" || event.payload.outcome === "deja"
      const round = event.payload.round ?? view.sendingRound
      return {
        ...view,
        lastAck: event.payload.outcome,
        sendingRound: 0,
        answeredRound: accepted ? Math.max(view.answeredRound, round) : view.answeredRound,
      }
    }
    case "result": {
      const me = view.me ? { ...view.me, score: event.payload.score, rank: event.payload.rank } : view.me
      return { ...view, me, lastResult: event.payload }
    }
    case "error":
      // Reseau : socket.io reessaie seul, on garde l'ecran. Saisie a corriger : retour au formulaire.
      if (event.code === "reseau") return { ...view, error: event.code }
      return { ...view, status: isFormError(event.code) ? "form" : "error", error: event.code }
    case "reset":
      return initialLiveView
  }
}

/** Le viewer peut-il repondre maintenant ? */
export function canAnswer(view: LiveView): boolean {
  const game = view.game
  if (!game || game.phase !== "GUESSING_CHAT") return false
  return view.answeredRound < game.currentRound && view.sendingRound !== game.currentRound
}

export const VERDICT_TEXT: Record<LiveResult["verdict"], string> = {
  correct: "Bien joué, titre et artiste !",
  close: "Presque : tu avais une partie.",
  wrong: "Raté pour cette fois.",
  none: "Pas de réponse.",
}

// ---------------------------------------------------------------------------
// Overlay OBS
// ---------------------------------------------------------------------------

export type OverlayView = {
  status: "connecting" | "live" | "error"
  error: LiveErrorCode | null
  roomCode: string | null
  game: StreamerState | null
  viewerCount: number
  answers: { round: number; count: number; names: string[] } | null
  expiresAt: number | null
  clockOffset: number
}

export type OverlayEvent =
  | { type: "init"; payload: { roomCode: string; expiresAt: number; viewerCount: number; state: StreamerState | null; serverTimestamp?: number }; now: number }
  | { type: "state"; payload: StreamerState }
  | { type: "viewers"; payload: { roomCode: string; count: number } }
  | { type: "answers"; payload: { roomCode: string; round: number; count: number; names: string[] } }
  | { type: "error"; code: LiveErrorCode }

export const initialOverlayView: OverlayView = {
  status: "connecting",
  error: null,
  roomCode: null,
  game: null,
  viewerCount: 0,
  answers: null,
  expiresAt: null,
  clockOffset: 0,
}

export function overlayReducer(view: OverlayView, event: OverlayEvent): OverlayView {
  switch (event.type) {
    case "init":
      return {
        ...view,
        status: "live",
        error: null,
        roomCode: event.payload.roomCode,
        game: event.payload.state,
        viewerCount: event.payload.viewerCount,
        expiresAt: event.payload.expiresAt,
        clockOffset: offsetOf(event.payload.serverTimestamp, event.now),
      }
    case "state": {
      if (view.roomCode && event.payload.roomCode !== view.roomCode) return view
      const newRound = event.payload.currentRound !== view.game?.currentRound
      return {
        ...view,
        game: event.payload,
        viewerCount: event.payload.viewerCount ?? view.viewerCount,
        answers: newRound ? null : view.answers,
      }
    }
    case "viewers":
      return view.roomCode && event.payload.roomCode !== view.roomCode ? view : { ...view, viewerCount: event.payload.count }
    case "answers": {
      if (view.roomCode && event.payload.roomCode !== view.roomCode) return view
      if (view.game && event.payload.round !== view.game.currentRound) return view
      return { ...view, answers: { round: event.payload.round, count: event.payload.count, names: event.payload.names } }
    }
    case "error":
      return { ...view, status: overlayErrorIsFinal(event.code) ? "error" : view.status, error: event.code }
  }
}

/** Nombre de reponses de la manche, le plus frais des deux (etat ou compteur). */
export function answersOf(view: Pick<OverlayView, "game" | "answers">): number {
  const fromState = view.game?.answersCount ?? 0
  const fromCounter = view.answers && view.answers.round === view.game?.currentRound ? view.answers.count : 0
  return Math.max(fromState, fromCounter)
}

export function podium(board: StreamerLeaderEntry[] | undefined): StreamerLeaderEntry[] {
  return (board ?? []).slice(0, 3)
}
