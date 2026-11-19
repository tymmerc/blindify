/**
 * Reprise des parties apres un redemarrage (docs/adr/ADR-001, etape 5).
 *
 * Au demarrage, avant que le serveur accepte des sockets : chaque copie de
 * Redis est relue, verifiee contre la base (la salle porte encore cette partie,
 * en cours), puis la partie est recreee en memoire avec le temps perdu rendu
 * (restoreGame) et ses minuteurs relances. Les joueurs reviennent seuls : le
 * client socket.io retente la connexion, puis envoie room:join et game:sync.
 */
import type { Server as IOServer } from "socket.io";
import { pool } from "../config/db";
import {
  RedisUnavailableError,
  deleteGameState,
  getGameState as readGameState,
  isRedisReady,
  scanGameStateCodes,
} from "../config/redis";
import { logger } from "../utils/logger";
import { deserializeGame, type RestoredGame } from "./gameBackup";
import {
  DISCONNECT_GRACE_MS,
  RESTART_GRACE_MS,
  getGameState,
  isPausedByIdle,
  restoreGame,
  resumeGame,
} from "./realtimeGame";
import { broadcastState, rescheduleAfterResume } from "./realtimeOrchestrator";

export type RestoreSummary = {
  restored: string[];
  skipped: Array<{ roomCode: string; reason: string }>;
};

/** La salle porte-t-elle encore cette partie, en cours ? (lecture seule) */
async function stillRunning(roomId: number, roomCode: string, sessionId: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `SELECT 1
     FROM multiplayer_rooms r
     JOIN game_sessions s ON s.id = r.session_id
     WHERE r.id = $1 AND r.room_code = $2 AND r.session_id = $3
       AND r.status = 'in_progress' AND s.state = 'in_progress'
     LIMIT 1`,
    [roomId, roomCode, sessionId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Une copie plus vieille que ca ne dit plus ou en est la partie : si Redis a
 * ete lent ou coupe longtemps, elle ramenerait la table plusieurs manches en
 * arriere. On ne la reprend pas.
 */
export const MAX_BACKUP_AGE_MS = 2 * 60_000;

/** Copie a ne pas reprendre : elle est supprimee, la raison va au bilan. */
type Verdict = { restore: true; saved: RestoredGame } | { restore: false; reason: string; drop: boolean };

async function judge(roomCode: string, now: number): Promise<Verdict> {
  const json = await readGameState(roomCode);
  if (!json) return { restore: false, reason: "copie_disparue", drop: false };
  const saved = deserializeGame(json);
  if (!saved) return { restore: false, reason: "illisible_ou_version_inconnue", drop: true };
  if (saved.roomCode !== roomCode) return { restore: false, reason: "code_incoherent", drop: true };
  if (now - saved.savedAt > MAX_BACKUP_AGE_MS) return { restore: false, reason: "copie_trop_ancienne", drop: true };
  const phase = saved.game.state.phase;
  if (phase !== "GUESSING" && phase !== "REVEAL") return { restore: false, reason: `phase_${phase.toLowerCase()}`, drop: true };
  if (saved.roomId == null || saved.sessionId == null) return { restore: false, reason: "sans_identite", drop: true };
  if (getGameState(roomCode)) return { restore: false, reason: "deja_en_memoire", drop: false };
  let running: boolean;
  try {
    running = await stillRunning(saved.roomId, roomCode, saved.sessionId);
  } catch {
    // Base injoignable : on ne decide rien, la copie expire seule dans l'heure.
    return { restore: false, reason: "base_injoignable", drop: false };
  }
  if (!running) return { restore: false, reason: "partie_plus_en_cours", drop: true };
  return { restore: true, saved };
}

/**
 * Reprend toutes les parties copiees dans Redis. Ne rejette jamais : sans
 * Redis, ou sur une erreur, le serveur demarre comme avant, sans reprise.
 * A appeler juste avant server.listen : les parties sont installees d'un seul
 * bloc, sans await, a la toute fin. Aucun minuteur (filet de veille compris)
 * ne passe donc entre leur installation et l'ouverture du serveur, et l'heure
 * de reprise est celle de l'ouverture.
 */
export async function restoreGames(io: IOServer, now = () => Date.now()): Promise<RestoreSummary> {
  const summary: RestoreSummary = { restored: [], skipped: [] };
  if (!isRedisReady()) {
    logger.info("reprise_parties : Redis absent, aucune partie reprise");
    return summary;
  }
  let codes: string[];
  try {
    codes = await scanGameStateCodes();
  } catch (err) {
    logger.warn("reprise_parties : lecture des copies impossible", { error: err instanceof Error ? err.message : String(err) });
    return summary;
  }
  const accepted: RestoredGame[] = [];
  for (const roomCode of codes) {
    try {
      const verdict = await judge(roomCode, now());
      if (!verdict.restore) {
        if (verdict.drop) await deleteGameState(roomCode);
        summary.skipped.push({ roomCode, reason: verdict.reason });
        continue;
      }
      accepted.push(verdict.saved);
    } catch (err) {
      const reason = err instanceof RedisUnavailableError ? "redis_coupe" : "erreur";
      if (reason === "erreur") logger.error("reprise_partie_echec", { roomCode, error: err });
      summary.skipped.push({ roomCode, reason });
    }
  }
  // Installation d'un seul bloc, sans await (voir plus haut).
  const at = now();
  for (const saved of accepted) {
    try {
      restoreGame(saved, at);
      rescheduleAfterResume(io, saved.roomCode);
      summary.restored.push(saved.roomCode);
    } catch (err) {
      logger.error("reprise_partie_echec", { roomCode: saved.roomCode, error: err });
      summary.skipped.push({ roomCode: saved.roomCode, reason: "erreur" });
    }
  }
  if (summary.restored.length > 0) scheduleAbsentHostCheck(io, summary.restored);
  logger.info(`reprise_parties : ${summary.restored.length} reprise(s), ${summary.skipped.length} ignoree(s)`, {
    reprises: summary.restored,
    ignorees: summary.skipped,
  });
  return summary;
}

/**
 * Une pause de l'hote se leve quand il se deconnecte (socketHandlers,
 * « disconnecting ») : sans lui, la table resterait gelee. Apres une reprise,
 * il n'a pas de socket a perdre : s'il n'est pas revenu au bout de la grace de
 * reprise et de reconnexion, on fait pareil. Une veille du serveur garde son arret.
 */
function scheduleAbsentHostCheck(io: IOServer, roomCodes: string[]): void {
  const timer = setTimeout(() => {
    for (const roomCode of roomCodes) {
      const state = getGameState(roomCode);
      if (!state?.paused || state.hostConnected || isPausedByIdle(roomCode)) continue;
      const resumed = resumeGame(roomCode);
      if (resumed && !resumed.paused) {
        rescheduleAfterResume(io, roomCode);
        broadcastState(io, roomCode);
        logger.info("reprise_pause_hote_levee", { roomCode });
      }
    }
  }, RESTART_GRACE_MS + DISCONNECT_GRACE_MS);
  timer.unref?.();
}
