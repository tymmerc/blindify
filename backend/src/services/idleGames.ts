/**
 * Parties fantomes (T22). Vu en prod le 01/11 (partie 751) et le 14/11
 * (partie 829, salle 5UEJ72) : la table part ouvrir une autre salle, et
 * l'ancienne partie tourne seule, 12 manches de reponses vides en 7 minutes.
 *
 * Toutes les IDLE_CHECK_MS, et a chaque retour d'un joueur, on regarde chaque
 * partie en memoire (idleCheck, realtimeGame.ts) :
 * - plus aucun joueur connecte depuis EMPTY_PAUSE_MS : elle se met en veille
 *   (pause, plus aucune manche ne part) ;
 * - un joueur revient : elle reprend ou elle en etait ;
 * - la veille dure IDLE_STOP_MS : elle s'arrete par le meme chemin que
 *   « Arrêter la partie » de l'hote (T42), tout le monde revient dans la salle.
 * La veille « personne ne repond » se pose a la revelation (revealRound).
 *
 * Le mode streamer a son propre moteur (streamerGame.ts) : rien ici ne le touche.
 */
import type { Server as IOServer } from "socket.io";
import { logger } from "../utils/logger";
import type { SessionContext } from "../utils/session";
import { getGameState, idleCheck, liveRoomCodes, pruneRoomAbsences, type GameState, type IdleDecision } from "./realtimeGame";
import { broadcastState, rescheduleAfterResume, stopGameTimers } from "./realtimeOrchestrator";

const IDLE_CHECK_MS = 5_000;

/**
 * L'arret lui-meme (stopIdleGame, roomsController) : passe au demarrage par
 * index.ts, pour que ce module ne tire pas tout le controleur des salles
 * (et que les tests puissent le remplacer).
 */
type IdleStopper = (roomCode: string, state: GameState) => Promise<boolean>;
let stopper: IdleStopper | null = null;

export function setIdleStopper(fn: IdleStopper | null): void {
  stopper = fn;
}

/** Le joueur a-t-il au moins un socket dans la salle ? (spectateurs et viewers n'ont pas de compte) */
export function userSocketInRoom(io: IOServer, roomCode: string, userId: number): boolean {
  for (const id of io.sockets.adapter.rooms.get(roomCode) ?? []) {
    const auth = (io.sockets.sockets.get(id)?.data as { auth?: SessionContext } | undefined)?.auth;
    if (auth?.user?.id === userId) return true;
  }
  return false;
}

/** Un passage du filet pour une salle ; rend ce qui a ete fait (pour les tests). */
export function checkIdleGame(io: IOServer, roomCode: string, now = Date.now()): IdleDecision {
  const state = getGameState(roomCode);
  const decision = idleCheck(roomCode, userId => userSocketInRoom(io, roomCode, userId), now);
  if (decision === "pause") {
    // Plus rien ne tire : ni revelation, ni manche suivante, ni grace.
    stopGameTimers(roomCode);
    logger.info("game_idle_paused", { roomCode, round: state?.currentRound, reason: "empty" });
    broadcastState(io, roomCode);
  } else if (decision === "clear") {
    // L'ecran de pause ne doit plus annoncer d'arret.
    broadcastState(io, roomCode);
  } else if (decision === "resume") {
    rescheduleAfterResume(io, roomCode);
    logger.info("game_idle_resumed", { roomCode, round: state?.currentRound });
    broadcastState(io, roomCode);
  } else if (decision === "stop" && state && stopper) {
    // Verrou de la salle pris (lancement en cours) : le passage suivant reessaie.
    void stopper(roomCode, state).catch(err => logger.error("game_idle_stop_failed", { roomCode, error: err }));
  }
  return decision;
}

/** Un passage du filet sur toutes les parties en memoire. */
export function sweepIdleGames(io: IOServer, now = Date.now()): void {
  for (const roomCode of liveRoomCodes()) checkIdleGame(io, roomCode, now);
  pruneRoomAbsences(now);
}

let idleWatch: NodeJS.Timeout | null = null;

export function startIdleWatch(io: IOServer, stop: IdleStopper): void {
  stopper = stop;
  if (idleWatch) return;
  idleWatch = setInterval(() => {
    try {
      sweepIdleGames(io);
    } catch (err) {
      logger.error("idle_watch_failed", { error: err });
    }
  }, IDLE_CHECK_MS);
  idleWatch.unref?.();
}
