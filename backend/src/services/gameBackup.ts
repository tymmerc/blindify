/**
 * Copie de secours des parties dans Redis (docs/adr/ADR-001, etape 4).
 *
 * La memoire reste la copie de travail. A chaque changement d'une partie, la
 * salle est marquee ; au tour de boucle suivant, une seule ecriture part avec
 * l'etat le plus recent. Le jeu n'attend jamais Redis.
 *
 * Anti-triche : la copie contient les reponses avant la revelation (pistes
 * completes, textes tapes). Elle ne part que vers Redis, jamais vers un client.
 */
import {
  RedisUnavailableError,
  deleteGameState,
  getGameState as readGameState,
  isRedisReady,
  setGameState,
} from "../config/redis";
import { logger } from "../utils/logger";
import type { LiveGame } from "./realtimeGame";

export const GAME_BACKUP_VERSION = 1;

/** Absent d'une salle (T22), tel que realtimeGame.ts le garde. */
export type AbsentEntry = { username: string | null; avatar: string | null; since: number };

type StoredGame = Omit<LiveGame, "launchPlayerIds"> & { launchPlayerIds: number[] };

export type GameBackupDoc = {
  v: typeof GAME_BACKUP_VERSION;
  roomCode: string;
  /** Id de la salle et de la partie en base : un code de salle peut resservir. */
  roomId: number | null;
  sessionId: number | null;
  savedAt: number;
  game: StoredGame;
  roomAbsent: Array<[number, AbsentEntry]>;
};

export type RestoredGame = {
  roomCode: string;
  roomId: number | null;
  sessionId: number | null;
  savedAt: number;
  game: LiveGame;
  roomAbsent: Map<number, AbsentEntry>;
};

// Un Map ou un Set deviendrait {} en JSON, une fonction disparaitrait : la
// copie serait fausse sans bruit. On prefere qu'elle echoue (journalise).
function strictJson(_key: string, value: unknown): unknown {
  if (value instanceof Map || value instanceof Set || typeof value === "function") {
    throw new TypeError("game_backup_not_json");
  }
  return value;
}

export function serializeGame(
  game: LiveGame,
  roomAbsent: ReadonlyMap<number, AbsentEntry> | undefined,
  now = Date.now(),
): string {
  const doc: GameBackupDoc = {
    v: GAME_BACKUP_VERSION,
    roomCode: game.state.roomCode,
    roomId: game.roomId ?? null,
    sessionId: game.sessionId ?? null,
    savedAt: now,
    game: { ...game, launchPlayerIds: Array.from(game.launchPlayerIds) },
    roomAbsent: Array.from(roomAbsent ?? []),
  };
  return JSON.stringify(doc, strictJson);
}

/** Relit une copie. null si elle est illisible ou d'une autre version. */
export function deserializeGame(json: string): RestoredGame | null {
  let doc: GameBackupDoc;
  try {
    doc = JSON.parse(json) as GameBackupDoc;
  } catch {
    return null;
  }
  if (!doc || doc.v !== GAME_BACKUP_VERSION || typeof doc.roomCode !== "string" || !doc.game?.state) return null;
  const game: LiveGame = { ...doc.game, launchPlayerIds: new Set(doc.game.launchPlayerIds) };
  // En memoire, la piste en cours EST l'element de `tracks` (replaceRoundPreview
  // compare les objets) : on refait ce lien.
  const current = game.state.currentTrack;
  if (current) game.state.currentTrack = game.tracks.find(t => t.round === current.round) ?? current;
  return {
    roomCode: doc.roomCode,
    roomId: doc.roomId,
    sessionId: doc.sessionId,
    savedAt: doc.savedAt,
    game,
    roomAbsent: new Map(doc.roomAbsent),
  };
}

/** Relit la copie d'une salle dans Redis (etape 5). Leve RedisUnavailableError. */
export async function readGameBackup(roomCode: string): Promise<RestoredGame | null> {
  const json = await readGameState(roomCode);
  return json ? deserializeGame(json) : null;
}

export type BackupStore = {
  ready(): boolean;
  write(roomCode: string, json: string): Promise<void>;
  del(roomCode: string): Promise<void>;
};

const redisStore: BackupStore = {
  ready: isRedisReady,
  write: setGameState,
  del: deleteGameState,
};

// Pas de dedoublonnage : chaque copie porte son heure (savedAt), et la reprise
// rend le temps ecoule depuis. Une copie gardee parce qu'identique vieillirait,
// et une manche sans changement pendant 60 s rendrait 60 s de trop. Le filet
// de veille remet toutes les parties dans la file toutes les 5 s
// (refreshGameBackups) : le temps rendu depasse donc de 5 s au plus.
type Slot = {
  scheduled: boolean;
  inFlight: boolean;
  dirty: boolean;
  /** DEL confirme par Redis : inutile de le refaire. */
  deleted: boolean;
  loggedError: boolean;
};

export type BackupWriter = {
  /** La partie de cette salle a change (ou a disparu) : copie au prochain tour de boucle. */
  markDirty(roomCode: string): void;
  /** Attend que toutes les copies en cours soient parties (tests, arret). */
  settled(): Promise<void>;
};

/**
 * `snapshot` rend la copie a ecrire, ou null si la salle n'a plus de partie en
 * cours (effacee ou finie) : la cle est alors supprimee.
 */
export function createBackupWriter(snapshot: (roomCode: string) => string | null, store: BackupStore = redisStore): BackupWriter {
  const slots = new Map<string, Slot>();
  const active = new Set<Promise<void>>();

  function slotOf(roomCode: string): Slot {
    let slot = slots.get(roomCode);
    if (!slot) {
      slot = { scheduled: false, inFlight: false, dirty: false, deleted: false, loggedError: false };
      slots.set(roomCode, slot);
    }
    return slot;
  }

  function schedule(roomCode: string, slot: Slot): void {
    if (slot.scheduled || slot.inFlight) return;
    slot.scheduled = true;
    const run = new Promise<void>(resolve => setImmediate(resolve)).then(() => flush(roomCode, slot));
    active.add(run);
    void run.finally(() => active.delete(run));
  }

  async function flush(roomCode: string, slot: Slot): Promise<void> {
    slot.scheduled = false;
    slot.dirty = false;
    // Redis coupe : rien a serialiser. La coupure est deja journalisee une fois.
    if (!store.ready()) {
      slots.delete(roomCode);
      return;
    }
    let json: string | null;
    try {
      json = snapshot(roomCode);
    } catch (err) {
      if (!slot.loggedError) logger.error("game_backup_serialize_failed", { roomCode, error: err });
      slot.loggedError = true;
      return;
    }
    slot.inFlight = true;
    try {
      if (json === null) {
        if (!slot.deleted) await store.del(roomCode);
        slot.deleted = true;
      } else {
        await store.write(roomCode, json);
        slot.deleted = false;
      }
    } catch (err) {
      slot.deleted = false;
      if (!(err instanceof RedisUnavailableError) && !slot.loggedError) {
        slot.loggedError = true;
        logger.error("game_backup_write_failed", { roomCode, error: err });
      }
    } finally {
      slot.inFlight = false;
    }
    // Change pendant l'ecriture : on reecrit avec l'etat le plus recent. Une
    // seule operation en vol par salle, donc un DEL passe toujours apres la
    // derniere ecriture, et une vieille copie apres une plus recente jamais.
    if (slot.dirty) schedule(roomCode, slot);
    // Partie finie ou effacee : le slot s'en va, DEL reussi ou pas. Un DEL
    // rate laisse la cle a sa duree de vie, et la reprise jette de toute facon
    // la copie d'une partie qui n'est plus en cours.
    else if (json === null) slots.delete(roomCode);
  }

  return {
    markDirty(roomCode) {
      const slot = slotOf(roomCode);
      slot.dirty = true;
      schedule(roomCode, slot);
    },
    async settled() {
      while (active.size > 0) await Promise.all(Array.from(active));
    },
  };
}
