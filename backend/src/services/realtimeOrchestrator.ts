import type { Server as IOServer } from "socket.io";
import { logger } from "../utils/logger";
import {
  clearGameIfFinished,
  earlyRevealDecision,
  gameStateSnapshot,
  getGameState,
  getSessionId,
  liveRoomCodes,
  nextRevealStep,
  redactedGuessingTrack,
  replaceRoundPreview,
  revealRound,
  startNextRound,
  upcomingTracks,
  type GameState,
} from "./realtimeGame";
import { persistGameResults, persistRoundResponses } from "./gamePersistence";
import { PREVIEW_LOOKAHEAD_ROUNDS, freshPreview, previewNeedsRefresh } from "./roundPreviews";
import { ROUND_PACING } from "./roundPacing";

const revealTimers = new Map<string, NodeJS.Timeout>();
// Rythme entre les manches (T38) : un minuteur par salle pour l'ecran en cours
// du reveal (la reponse, puis le classement). La partie avance meme si personne
// ne touche a rien (tel verrouille, onglet en fond) : plus de « pret » a attendre.
const pacingTimers = new Map<string, NodeJS.Timeout>();
// Grace de reconnexion (DISCONNECT_GRACE_MS, realtimeGame) : un minuteur par
// salle, cale sur la fin de la derniere grace en cours de la manche.
const graceTimers = new Map<string, NodeJS.Timeout>();

export function clearPacingTimer(roomCode: string): void {
  const t = pacingTimers.get(roomCode);
  if (t) {
    clearTimeout(t);
    pacingTimers.delete(roomCode);
  }
}

/**
 * Pose le minuteur de l'ecran en cours du reveal, a son heure de fin. Sans
 * effet hors reveal, en pause (la reprise le repose) ou apres la fin.
 */
export function schedulePacingStep(io: IOServer, roomCode: string): void {
  clearPacingTimer(roomCode);
  if (isGameOver(roomCode)) return;
  const state = getGameState(roomCode);
  if (!state || state.phase !== "REVEAL" || state.paused) return;
  // Sans ecran connu (ne devrait pas arriver), la manche suivante part tout de suite.
  const step = state.pacing?.step ?? null;
  const endsAt = state.pacing?.endsAt ?? Date.now();
  const round = state.currentRound;
  const timer = setTimeout(() => {
    pacingTimers.delete(roomCode);
    if (isGameOver(roomCode)) return;
    const current = getGameState(roomCode);
    // Toujours le meme ecran de la meme manche : sinon l'hote est deja passe
    // a la suite (« Suivant ») et un autre minuteur a pris le relais.
    if (!current || current.phase !== "REVEAL" || current.currentRound !== round || (current.pacing?.step ?? null) !== step) return;
    if (current.paused) return;
    advanceRevealStep(io, roomCode);
  }, Math.max(0, endsAt - Date.now()));
  pacingTimers.set(roomCode, timer);
}

/**
 * Ecran suivant du reveal, a la fin de son minuteur ou au « Suivant » de
 * l'hote : le classement, puis la manche suivante avec son 3-2-1 (ou la fin de
 * partie apres la derniere). Rend true si quelque chose a change.
 */
export function advanceRevealStep(io: IOServer, roomCode: string): boolean {
  const next = nextRevealStep(roomCode);
  if (next === "scores") {
    emitState(io, roomCode);
    schedulePacingStep(io, roomCode);
    return true;
  }
  if (next === "next") {
    logger.debug(`pacing: next round for ${roomCode}`);
    startRoundAndBroadcast(io, roomCode);
    return true;
  }
  return false;
}

function emitState(io: IOServer, roomCode: string): GameState | undefined {
  const snapshot = gameStateSnapshot(roomCode);
  if (snapshot) {
    io.to(roomCode).emit("game:state", snapshot);
  }
  return snapshot;
}

function emitRoundStart(io: IOServer, state: GameState) {
  if (!state.currentTrack) return;
  const room = io.sockets.adapter.rooms.get(state.roomCode);
  const socketCount = room ? room.size : 0;
  const socketIds = room ? Array.from(room) : [];
  logger.debug(`emitting game:round:start to room ${state.roomCode}, sockets in room: ${socketCount}, ids: ${socketIds.join(", ")}`);
  io.to(state.roomCode).emit("game:round:start", {
    roomCode: state.roomCode,
    round: state.currentRound,
    // Caviarde : la reponse ne part sur le fil qu'au reveal.
    track: state.phase === "GUESSING" ? redactedGuessingTrack(state.currentTrack) : state.currentTrack,
    timing: state.timing,
  });
}

function emitGameOver(io: IOServer, state: GameState) {
  io.to(state.roomCode).emit("game:over", {
    roomCode: state.roomCode,
    players: state.players,
  });
  // Keep a second event name for compatibility with the prompt wording
  io.to(state.roomCode).emit("game:game:over", {
    roomCode: state.roomCode,
    players: state.players,
  });
}

export function scheduleReveal(io: IOServer, roomCode: string, revealAt: number, round: number) {
  const existing = revealTimers.get(roomCode);
  if (existing) clearTimeout(existing);
  // Don't schedule if game is already finished or cleaned up
  if (isGameOver(roomCode)) return;
  const delay = Math.max(0, revealAt - Date.now());
  logger.debug(`scheduling reveal for ${roomCode} (round ${round}) in ${delay}ms`);
  const timer = setTimeout(() => {
    revealTimers.delete(roomCode);
    if (isGameOver(roomCode)) return;
    const current = getGameState(roomCode);
    // Manche deja revelee, ou une autre manche que la sienne : jamais deux
    // revelations. Jamais pendant une pause de l'hote non plus (la reprise
    // repose ce minuteur).
    if (!current || current.phase !== "GUESSING" || current.currentRound !== round || current.paused) return;
    logger.debug(`reveal timer fired for ${roomCode} (round ${round})`);
    // Meme suite que les revelations anticipees (grace annulee, reponses
    // ecrites, filet anti-AFK, fin de partie), puis l'etat pour tous.
    if (revealRoundNow(io, roomCode)) emitState(io, roomCode);
  }, delay);
  revealTimers.set(roomCode, timer);
}

export function startRoundAndBroadcast(
  io: IOServer,
  roomCode: string,
  opts?: { forceRound?: number; startAt?: number }
): GameState | undefined {
  // Une nouvelle manche demarre : le rythme du reveal et la grace de la
  // precedente sont obsoletes.
  clearPacingTimer(roomCode);
  clearGraceTimer(roomCode);
  // Le 3-2-1 (T38) : la manche part tout de suite cote serveur mais sa musique
  // et son chrono a startAt. Les clients affichent le decompte jusque-la.
  const state = startNextRound(roomCode, { ...opts, startAt: opts?.startAt ?? Date.now() + ROUND_PACING.countdownMs });
  logger.debug(`startRoundAndBroadcast ${roomCode}: round=${state?.currentRound}, phase=${state?.phase}, revealAt=${state?.timing?.revealAt}`);
  if (!state) return undefined;
  if (state.phase === "FINISHED") {
    // Fin de partie apres le classement de la derniere manche : les
    // resultats sont ecrits en base (oubli trouve le 05/10/2026).
    emitState(io, roomCode);
    broadcastGameOver(io, roomCode);
    return state;
  }
  // Emit complete state FIRST so clients have everything before processing
  // the round-start trigger event. This eliminates the need for the frontend
  // to reconstruct a minimal state from the round-start payload alone.
  emitState(io, roomCode);
  emitRoundStart(io, state);
  if (state.timing.revealAt) {
    scheduleReveal(io, roomCode, state.timing.revealAt, state.currentRound);
  }
  void refreshRoundPreviews(io, roomCode);
  return state;
}

/**
 * T35 : les liens Deezer meurent ~15 min apres leur creation, les manches sont
 * preparees au lancement. A chaque debut de manche (et a la reprise d'une
 * pause), on redemande le lien de la manche en cours et des 2 suivantes s'il
 * mourra avant d'avoir servi. Les suivantes ont donc leur lien neuf bien avant
 * leur tour ; la manche en cours (lien deja vieux, longue pause) recoit le
 * sien en cours de route, par un etat diffuse : les clients relancent le son.
 * Ne bloque jamais la partie : un echec garde l'ancien lien.
 */
export async function refreshRoundPreviews(io: IOServer, roomCode: string): Promise<void> {
  try {
    const due = upcomingTracks(roomCode, PREVIEW_LOOKAHEAD_ROUNDS).filter(t => previewNeedsRefresh(t.previewUrl));
    await Promise.all(due.map(async track => {
      const url = await freshPreview(track.audioSourceId);
      if (!url) {
        logger.warn("preview_not_refreshed", { roomCode, round: track.round });
        return;
      }
      if (url === track.previewUrl) return;
      if (replaceRoundPreview(roomCode, track, url)) emitState(io, roomCode);
    }));
  } catch (err) {
    // Appele en arriere-plan (void) : jamais de rejet non gere.
    logger.error("preview_refresh_round_failed", { roomCode, error: err });
  }
}

export function broadcastState(io: IOServer, roomCode: string): GameState | undefined {
  return emitState(io, roomCode);
}

// Parties deja passees par le game over. Le garde vise la PARTIE (son etat en
// memoire), pas la salle : avant le 07/11, c'etait un Set de codes de salle
// vide 10 s apres la fin, et une revanche lancee dans ces 10 s n'avait ni
// minuteur de reveal ni filet anti-AFK. Sa manche 1 ne se revelait jamais
// (salle 9SXZ6U, partie 777, le 06/11). Une revanche a un etat neuf, donc
// elle n'est pas concernee ; WeakSet : rien a nettoyer.
const finishedGames = new WeakSet<GameState>();

/** La partie EN COURS dans cette salle est-elle deja finie (game over passe) ? */
function isGameOver(roomCode: string): boolean {
  const state = getGameState(roomCode);
  return state !== undefined && finishedGames.has(state);
}

export function broadcastGameOver(io: IOServer, roomCode: string) {
  // Guard against double emission
  if (isGameOver(roomCode)) return;
  const live = getGameState(roomCode);
  const snapshot = gameStateSnapshot(roomCode);
  if (!live || !snapshot) return;
  finishedGames.add(live);
  emitGameOver(io, snapshot);
  // Persist final scores/stats before the in-memory state is dropped.
  void persistGameResults(snapshot, getSessionId(roomCode));
  clearRevealTimer(roomCode);
  clearPacingTimer(roomCode);
  clearGraceTimer(roomCode);
  // L'etat FINISHED reste en memoire une minute : les clients recuperent
  // l'ecran de resultats via /state (playlist complete) pendant cette fenetre.
  // clearGameIfFinished ne touche que CETTE partie : ni une revanche en cours,
  // ni l'ecran de resultats d'une revanche deja finie.
  setTimeout(() => clearGameIfFinished(roomCode, live), 60_000).unref?.();
}

export function clearRevealTimer(roomCode: string) {
  const existing = revealTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    revealTimers.delete(roomCode);
  }
}

export function clearGraceTimer(roomCode: string): void {
  const existing = graceTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    graceTimers.delete(roomCode);
  }
}

function scheduleGraceCheck(io: IOServer, roomCode: string, round: number, until: number): void {
  clearGraceTimer(roomCode);
  if (isGameOver(roomCode)) return;
  const timer = setTimeout(() => {
    graceTimers.delete(roomCode);
    // Grace d'une manche deja passee (revelee par son minuteur) : rien a faire.
    if (getGameState(roomCode)?.currentRound !== round) return;
    logger.debug(`reconnect grace over for ${roomCode} (round ${round})`);
    if (tryEarlyReveal(io, roomCode)) emitState(io, roomCode);
  }, Math.max(0, until - Date.now()));
  // Ce minuteur ne garde jamais le processus en vie a lui seul.
  timer.unref?.();
  graceTimers.set(roomCode, timer);
}

/**
 * Point d'entree unique des revelations anticipees, rappele a chaque evenement
 * qui peut changer la donne : une reponse, une coupure, un depart, la reprise
 * apres une pause, la fin d'une grace. Revele tout de suite si tous les
 * joueurs connectes ont repondu et que personne n'est a attendre ; attend la
 * fin d'une grace de reconnexion en cours (minuteur) ; sinon ne fait rien.
 * Rend true si la manche vient d'etre revelee ; l'appelant diffuse l'etat.
 */
export function tryEarlyReveal(io: IOServer, roomCode: string): boolean {
  const decision = earlyRevealDecision(roomCode);
  logger.debug(`early reveal check for ${roomCode}: ${decision.kind}`);
  if (decision.kind === "wait") {
    scheduleGraceCheck(io, roomCode, getGameState(roomCode)?.currentRound ?? 0, decision.until);
    return false;
  }
  // Plus personne a attendre (revenu, pause, manche qui continue) : le minuteur
  // de grace n'a plus d'objet. Le prochain evenement rappellera cette fonction.
  clearGraceTimer(roomCode);
  return decision.kind === "reveal" ? revealRoundNow(io, roomCode) : false;
}

/**
 * Revele la manche maintenant : minuteur de manche, revelation anticipee, ou
 * resynchro d'un client apres l'heure (game:sync). Annule les minuteurs de la
 * manche puis fait la suite commune. Une seule fois : rien si la manche n'est
 * plus en jeu. Rend true si la manche vient d'etre revelee.
 */
export function revealRoundNow(io: IOServer, roomCode: string): boolean {
  if (getGameState(roomCode)?.phase !== "GUESSING") return false;
  clearRevealTimer(roomCode);
  clearGraceTimer(roomCode);
  const revealed = revealRound(roomCode);
  if (!revealed) return false;
  finishReveal(io, roomCode, revealed);
  return true;
}

/**
 * Suite commune de toutes les revelations. Avant elle, le chemin de la
 * deconnexion n'ecrivait pas les reponses de la manche et ne posait pas le
 * filet anti-AFK (trouve le 02/10/2026) ; celui de game:sync non plus, et le
 * minuteur de manche avait sa propre copie (alignes le 05/10/2026).
 */
function finishReveal(io: IOServer, roomCode: string, revealed: GameState): void {
  io.to(roomCode).emit("game:round:reveal", {
    roomCode,
    round: revealed.currentRound,
    timing: revealed.timing,
    players: revealed.players,
    // La reponse complete n'arrive qu'avec le reveal (piste caviardee pendant
    // la manche).
    track: revealed.currentTrack,
    pacing: revealed.pacing ?? null,
  });
  void persistRoundResponses(revealed, getSessionId(roomCode));
  if (revealed.phase === "FINISHED") {
    broadcastGameOver(io, roomCode);
  } else if (revealed.phase === "REVEAL" && !revealed.paused) {
    // La suite (classement, manche suivante) part seule a l'heure. Pas pendant
    // une pause : game:resume la repose a la reprise.
    schedulePacingStep(io, roomCode);
  }
}

// Filet anti-blocage (T27). Une manche avance par deux minuteurs : le reveal
// (fin du chrono) puis celui des ecrans du reveal (T38, manche suivante). Si l'un manque,
// la partie reste « en cours » sans bouger, comme la 777 du 06/11. Toutes les
// STALL_CHECK_MS, on repose ce qui manque, sans jamais doubler un minuteur
// present ni toucher une partie en pause ou finie.
const STALL_CHECK_MS = 5_000;
// Marge apres l'heure du reveal : le minuteur normal passe toujours avant.
const STALL_MARGIN_MS = 5_000;

/** Un passage du filet ; rend les salles debloquees (pour les tests). */
export function unstickGames(io: IOServer, now = Date.now()): string[] {
  const nudged: string[] = [];
  for (const roomCode of liveRoomCodes()) {
    const state = getGameState(roomCode);
    if (!state || state.paused || isGameOver(roomCode)) continue;
    if (state.phase === "GUESSING" && !revealTimers.has(roomCode)) {
      const revealAt = state.timing.revealAt;
      if (!revealAt || now < revealAt + STALL_MARGIN_MS) continue;
      logger.warn("partie_debloquee", { roomCode, round: state.currentRound, phase: "GUESSING" });
      if (revealRoundNow(io, roomCode)) emitState(io, roomCode);
      nudged.push(roomCode);
    } else if (state.phase === "REVEAL" && !pacingTimers.has(roomCode)) {
      logger.warn("partie_debloquee", { roomCode, round: state.currentRound, phase: "REVEAL" });
      schedulePacingStep(io, roomCode);
      nudged.push(roomCode);
    }
  }
  return nudged;
}

let stallWatchdog: NodeJS.Timeout | null = null;

export function startStallWatchdog(io: IOServer): void {
  if (stallWatchdog) return;
  stallWatchdog = setInterval(() => {
    try {
      unstickGames(io);
    } catch (err) {
      logger.error("stall_watchdog_failed", { error: err });
    }
  }, STALL_CHECK_MS);
  stallWatchdog.unref?.();
}
