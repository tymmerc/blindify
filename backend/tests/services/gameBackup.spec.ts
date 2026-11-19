// Copie de secours des parties dans Redis (ADR-001, etape 4).
// L'aller-retour tourne toujours ; le reste demande le Redis de test
// (TEST_REDIS_URL) et se saute proprement sans lui.
import net from "net";
import type { AddressInfo } from "net";
import Redis from "ioredis";

import {
  RedisUnavailableError,
  closeRedis,
  connectRedis,
  deleteGameState,
  getGameState as readRaw,
  setGameState,
} from "../../src/config/redis";
import {
  createBackupWriter,
  deserializeGame,
  serializeGame,
  type AbsentEntry,
  type BackupStore,
} from "../../src/services/gameBackup";
import {
  bootstrapGameState,
  clearGame,
  gameBackupsSettled,
  getGameState,
  markDisconnected,
  nextRevealStep,
  pauseGame,
  recordAnswer,
  revealRound,
  startNextRound,
  startReconnectGrace,
  type GameState,
  type LiveGame,
  type PlayerState,
  type RoundTrack,
} from "../../src/services/realtimeGame";
import type { WaitingPlayer } from "../../src/services/lateJoiners";
import { logger } from "../../src/utils/logger";

const TEST_REDIS_URL = process.env.TEST_REDIS_URL;
const describeWithRedis = TEST_REDIS_URL ? describe : describe.skip;

// Tous les champs obligatoires : un champ ajoute plus tard au type casse la
// compilation du test tant qu'il n'est pas rempli ici (et donc verifie).
type Full<T> = { [K in keyof T]-?: T[K] };

function fullPlayer(userId: number): Full<PlayerState> {
  return {
    userId,
    username: `Joueur ${userId}`,
    avatar: `https://cdn.example.com/avatars/${userId}.webp`,
    score: 1840 + userId,
    accuracy: 66,
    rounds: 3,
    correct: 2,
    streak: 2,
    bestStreak: 2,
    hasAnswered: true,
    isReady: false,
    disconnected: userId === 3,
    lastGuess: "bohemian rhapsody queen",
    lastGuessTitle: "Bohemian Rhapsody",
    lastGuessArtist: "Queen",
    lastSourceGuess: 2,
    lastVerdict: "correct",
    lastTitleOk: true,
    lastArtistOk: true,
    lastOwnerOk: false,
    answerAt: 1_700_000_004_200,
    lastGained: 950,
    lastPoints: { answer: 800, streak: 150, owner: 0, ms: 4200 },
    totalReactionMs: 12_400,
    absent: false,
    answeredRounds: 3,
  };
}

function fullTrack(round: number): Full<RoundTrack> {
  return {
    round,
    trackId: `deezer-${1000 + round}`,
    audioSourceId: 500 + round,
    title: `Titre ${round}`,
    artist: `Artiste ${round}`,
    previewUrl: `https://cdns-preview.example.com/stream/${round}.mp3?hdnea=exp=1700000900~acl=*~hmac=abc`,
    albumCover: `https://cdn.example.com/covers/${round}.jpg`,
    metadata: { owner_user_id: 2, owner_username: "Joueur 2", co_owner_ids: [1, 2], album: "Album" },
    ownerChoices: [1, 2, 3],
    ownerQuestion: true,
    provider: "deezer",
  };
}

function fullGame(): Full<LiveGame> {
  const tracks = [1, 2, 3].map(fullTrack);
  const waiting: WaitingPlayer[] = [{ userId: 9, username: "Tard", avatar: null, disconnected: true }];
  const state: Full<GameState> = {
    roomCode: "AB12CD",
    hostUserId: 1,
    hostPlays: true,
    hostConnected: false,
    singleContributor: false,
    mode: "friends",
    phase: "GUESSING",
    currentRound: 2,
    totalRounds: 3,
    requestedRounds: 5,
    shortReason: "library",
    currentTrack: tracks[1],
    timing: { startAt: 1_700_000_000_000, revealAt: 1_700_000_030_000 },
    players: { 1: fullPlayer(1), 2: fullPlayer(2), 3: fullPlayer(3) },
    waiting: [{ userId: 9, username: "Tard" }],
    paused: true,
    idle: { reason: "silent", stopAt: 1_700_000_120_000 },
    absentees: [{ userId: 8, username: "Parti" }],
    pacing: { step: "answer", endsAt: 1_700_000_038_000, ms: 8000 },
    config: { autoAdvance: false, roundDurationMs: 30_000 },
  };
  return {
    state,
    roomId: 77,
    tracks,
    mode: "friends",
    roundDurationMs: 30_000,
    sessionId: 4242,
    reconnectGraceMs: 5000,
    graceUntil: { 3: 1_700_000_009_000 },
    waiting,
    launchPlayerIds: new Set([1, 2, 3]),
    missed: { 1: 0, 2: 1, 3: 2 },
    silentRounds: 1,
    emptySince: 1_700_000_001_000,
    pausedByIdle: true,
    restoredRound: 2,
    pausedAt: 1_700_000_005_000,
  };
}

describe("copie de secours : aller-retour", () => {
  it("retrouve une partie entierement remplie, Set et absents compris", () => {
    const game = fullGame();
    const absent = new Map<number, AbsentEntry>([[8, { username: "Parti", avatar: null, since: 1_699_999_000_000 }]]);
    const json = serializeGame(game, absent, 1_700_000_006_000);
    const restored = deserializeGame(json);
    expect(restored).not.toBeNull();
    expect(restored!.game).toEqual(game);
    expect(restored!.game.launchPlayerIds).toBeInstanceOf(Set);
    expect(restored!.roomAbsent).toEqual(absent);
    expect(restored).toMatchObject({ roomCode: "AB12CD", roomId: 77, sessionId: 4242, savedAt: 1_700_000_006_000 });
    // Le lien piste en cours / liste des pistes est refait (replaceRoundPreview).
    expect(restored!.game.state.currentTrack).toBe(restored!.game.tracks[1]);
    expect(JSON.parse(json).v).toBe(1);
  });

  it("refuse d'ecrire un champ qui ne passe pas en JSON", () => {
    const game = fullGame();
    game.tracks[0].metadata = { owners: new Map([[1, "x"]]) };
    expect(() => serializeGame(game, undefined)).toThrow("game_backup_not_json");
  });

  it("ignore une copie d'une autre version ou illisible", () => {
    const doc = JSON.parse(serializeGame(fullGame(), undefined));
    expect(deserializeGame(JSON.stringify({ ...doc, v: 2 }))).toBeNull();
    expect(deserializeGame("{pas du json")).toBeNull();
  });
});

function tracks(count: number): RoundTrack[] {
  return Array.from({ length: count }, (_, i) => ({
    round: i + 1,
    trackId: `track-${i + 1}`,
    title: `Song ${i + 1}`,
    artist: `Artist ${i + 1}`,
    previewUrl: `https://example.com/preview-${i + 1}.mp3`,
  }));
}

/** Une partie de 3 manches, jouee par les fonctions publiques de realtimeGame. */
async function playGame(room: string, onRound?: (round: number) => Promise<void>): Promise<void> {
  bootstrapGameState({
    roomCode: room,
    hostUserId: 1,
    tracks: tracks(3),
    participants: [1, 2].map(id => ({ userId: id, username: `P${id}` })),
    sessionId: 900,
    roomId: 31,
  });
  for (let round = 1; round <= 3; round++) {
    startNextRound(room, { startAt: Date.now() });
    recordAnswer(room, 1, `Song ${round}`, null, `Song ${round}`, `Artist ${round}`);
    recordAnswer(room, 2, "rien");
    revealRound(room);
    await onRound?.(round);
    if (nextRevealStep(room) === "scores") nextRevealStep(room);
  }
  // Apres la derniere manche : la fin de partie.
  startNextRound(room);
}

let roomSeq = 0;
const nextRoom = () => `BK${process.pid % 1000}${++roomSeq}`;

describeWithRedis("copie de secours dans Redis", () => {
  let inspect: Redis;

  beforeAll(() => {
    inspect = new Redis(TEST_REDIS_URL!);
  });

  afterAll(async () => {
    await inspect.quit();
  });

  beforeEach(async () => {
    await expect(connectRedis(TEST_REDIS_URL)).resolves.toBe(true);
  });

  afterEach(async () => {
    await gameBackupsSettled();
    await closeRedis();
  });

  it("suit une partie jouee manche par manche, puis disparait a la fin", async () => {
    const room = nextRoom();
    const key = `game:state:${room}`;
    await playGame(room, async round => {
      await gameBackupsSettled();
      const raw = await inspect.get(key);
      const restored = deserializeGame(raw!);
      expect(restored).toMatchObject({ roomCode: room, roomId: 31, sessionId: 900 });
      expect(restored!.game.state.currentRound).toBe(round);
      expect(restored!.game.state.phase).toBe("REVEAL");
      // La copie est l'etat en memoire, points compris.
      expect(restored!.game.state).toEqual(getGameState(room));
      expect(restored!.game.state.players[1].score).toBeGreaterThan(0);
      const ttl = await inspect.ttl(key);
      expect(ttl).toBeGreaterThan(3590);
      expect(ttl).toBeLessThanOrEqual(3600);
    });
    expect(getGameState(room)?.phase).toBe("FINISHED");
    await gameBackupsSettled();
    expect(await inspect.exists(key)).toBe(0);
    clearGame(room);
  });

  it("supprime la copie quand la salle est effacee en pleine partie", async () => {
    const room = nextRoom();
    bootstrapGameState({ roomCode: room, hostUserId: 1, tracks: tracks(2), participants: [{ userId: 1, username: "P1" }] });
    startNextRound(room);
    markDisconnected(room, 1);
    startReconnectGrace(room, 1);
    pauseGame(room);
    await gameBackupsSettled();
    const restored = deserializeGame((await inspect.get(`game:state:${room}`))!);
    expect(restored!.game.pausedAt).toEqual(expect.any(Number));
    expect(restored!.game.graceUntil[1]).toEqual(expect.any(Number));
    clearGame(room);
    await gameBackupsSettled();
    expect(await inspect.exists(`game:state:${room}`)).toBe(0);
  });

  it("groupe une rafale de changements et garde la derniere version", async () => {
    const room = nextRoom();
    let version = 0;
    let writes = 0;
    const store: BackupStore = {
      ready: () => true,
      write: async (code, json) => {
        writes += 1;
        await setGameState(code, json);
      },
      del: deleteGameState,
    };
    const writer = createBackupWriter(() => JSON.stringify({ version }), store);
    for (let i = 0; i < 50; i++) {
      version += 1;
      writer.markDirty(room);
    }
    await writer.settled();
    expect(writes).toBe(1);
    expect(JSON.parse((await readRaw(room))!)).toEqual({ version: 50 });
    await deleteGameState(room);
  });

  it("une ecriture lente n'ecrase pas une copie plus recente et ne recree pas une cle supprimee", async () => {
    const room = nextRoom();
    let current: string | null = "v1";
    const ops: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    let release!: () => void;
    const firstWriteHeld = new Promise<void>(resolve => (release = resolve));
    const store: BackupStore = {
      ready: () => true,
      write: async (code, json) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        if (json === "v1") await firstWriteHeld;
        await setGameState(code, json);
        ops.push(`write ${json}`);
        inFlight -= 1;
      },
      del: async code => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await deleteGameState(code);
        ops.push("del");
        inFlight -= 1;
      },
    };
    const writer = createBackupWriter(() => current, store);

    writer.markDirty(room);
    await new Promise(resolve => setImmediate(resolve));
    // Pendant l'ecriture lente de v1 : la partie change, puis elle est effacee.
    current = "v2";
    writer.markDirty(room);
    await new Promise(resolve => setImmediate(resolve));
    current = null;
    writer.markDirty(room);
    release();
    await writer.settled();
    expect(maxInFlight).toBe(1);
    expect(ops).toEqual(["write v1", "del"]);
    expect(await readRaw(room)).toBeNull();

    // Meme chose sans effacement : la copie finale est la plus recente.
    current = "v3";
    writer.markDirty(room);
    current = "v4";
    writer.markDirty(room);
    await writer.settled();
    expect(await readRaw(room)).toBe("v4");
    await deleteGameState(room);
  });
});

describe("copie de secours : Redis coupe", () => {
  afterEach(async () => {
    await gameBackupsSettled();
    await closeRedis();
  });

  it("la partie se joue jusqu'au bout sans exception ni journal par changement", async () => {
    const srv = net.createServer();
    await new Promise<void>(resolve => srv.listen(0, "127.0.0.1", resolve));
    const { port } = srv.address() as AddressInfo;
    await new Promise<void>(resolve => srv.close(() => resolve()));
    const warn = jest.spyOn(logger, "warn");
    const error = jest.spyOn(logger, "error");
    await connectRedis(`redis://127.0.0.1:${port}`);
    warn.mockClear();
    const room = nextRoom();
    await expect(playGame(room)).resolves.toBeUndefined();
    await gameBackupsSettled();
    expect(getGameState(room)?.phase).toBe("FINISHED");
    const backupLogs = [...warn.mock.calls, ...error.mock.calls].filter(([msg]) => String(msg).startsWith("game_backup"));
    expect(backupLogs).toEqual([]);
    warn.mockRestore();
    error.mockRestore();
    clearGame(room);
  });

  it("une ecriture qui echoue (Redis tombe pendant l'envoi) est absorbee sans journal", async () => {
    const warn = jest.spyOn(logger, "warn");
    const error = jest.spyOn(logger, "error");
    const store: BackupStore = {
      ready: () => true,
      write: async () => {
        throw new RedisUnavailableError("Commande Redis en echec");
      },
      del: async () => undefined,
    };
    const writer = createBackupWriter(() => "{}", store);
    for (let i = 0; i < 5; i++) {
      writer.markDirty("XX");
      await writer.settled();
    }
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    warn.mockRestore();
    error.mockRestore();
  });
});
