/**
 * Mode streamer (T5) sur le vrai serveur socket.io : l'hote, l'overlay OBS
 * (lien signe), trois viewers de la page /live, et un ancien participant de
 * la salle.
 *
 * - l'extrait ne va qu'a l'hote et a l'overlay, jamais a un viewer ;
 * - aucune trame, pour personne, ne contient le titre ou la pochette avant le
 *   reveal final ;
 * - un viewer repond une fois par manche, recoit son resultat et sa place ;
 * - overlay sans jeton valide, ou mode coupe : refus net a la connexion.
 *
 * Requires Postgres (blindz_test) reachable. See tests/setup.ts.
 */
import { io as ClientIO, type Socket as ClientSocket } from "socket.io-client";
import {
  startTestServer,
  seedUsers,
  seedRoom,
  connectClient,
  joinRoom,
  cleanupUsers,
  closePool,
  pool,
  waitFor,
  type TestServer,
  type TestUser,
  type GameClient,
} from "./helpers/socket-test-harness";
import { signOverlayToken, OVERLAY_TTL_MS } from "../../src/services/overlayToken";
import { initStreamerGame } from "../../src/services/streamerOrchestrator";
import { clearStreamerGame, getStreamerState, startNextStreamerRound } from "../../src/services/streamerGame";
import { resetStreamerAttemptsForTests } from "../../src/services/streamerSockets";
import type { StreamerRound, StreamerState } from "../../src/types/streamer";

jest.setTimeout(30000);

const SECRET = "s".repeat(48);
const PREVIEW = "https://extraits.test/streamer-1.mp3";
const TITLE = "Chanson Secrete";
const COVER = "https://pochettes.test/secrete.jpg";

type Frame = { event: string; payload: unknown; at: number };
type Watcher = { socket: ClientSocket; frames: Frame[] };

let server: TestServer;
let users: TestUser[] = [];
let roomCode = "";
let roomId = 0;
const opened: ClientSocket[] = [];

beforeAll(async () => {
  process.env.OVERLAY_SECRET = SECRET;
  server = await startTestServer();
});

afterAll(async () => {
  delete process.env.OVERLAY_SECRET;
  await server.close();
  await closePool();
});

beforeEach(async () => {
  resetStreamerAttemptsForTests();
  users = await seedUsers(2, "S");
  roomCode = await seedRoom(users, "waiting");
  await pool.query(`ALTER TABLE multiplayer_rooms ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'friends'`);
  const { rows } = await pool.query<{ id: number }>(
    `UPDATE multiplayer_rooms SET mode='streamer' WHERE room_code=$1 RETURNING id`,
    [roomCode],
  );
  roomId = rows[0].id;
});

afterEach(async () => {
  for (const s of opened.splice(0)) s.close();
  clearStreamerGame(roomCode);
  delete process.env.STREAMER_MODE;
  await cleanupUsers(users);
});

function open(auth: Record<string, unknown>): ClientSocket {
  const socket = ClientIO(`http://127.0.0.1:${server.port}`, { auth, transports: ["websocket"], reconnection: false, forceNew: true });
  opened.push(socket);
  return socket;
}

async function connectWatcher(auth: Record<string, unknown>): Promise<Watcher> {
  const socket = open(auth);
  const watcher: Watcher = { socket, frames: [] };
  socket.onAny((event: string, payload: unknown) => watcher.frames.push({ event, payload, at: Date.now() }));
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("connect timeout")), 4000);
    socket.on("connect", () => { clearTimeout(t); resolve(); });
    socket.on("connect_error", err => { clearTimeout(t); reject(err); });
  });
  return watcher;
}

async function refusal(auth: Record<string, unknown>): Promise<string> {
  const socket = open(auth);
  return new Promise<string>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("no refusal")), 4000);
    socket.on("connect", () => { clearTimeout(t); reject(new Error("connected, refusal expected")); });
    socket.on("connect_error", err => { clearTimeout(t); resolve(err.message); });
  });
}

const overlayToken = (expiresAt = Date.now() + OVERLAY_TTL_MS) => signOverlayToken({ roomCode, roomId, expiresAt }, SECRET);

function rounds(): StreamerRound[] {
  return [{
    round: 1,
    trackId: "deezer-777",
    audioSourceId: "src-777",
    title: TITLE,
    artist: "Groupe Mystere",
    album: "Album",
    previewUrl: PREVIEW,
    albumCover: COVER,
    metadata: { owner_user_id: users[0].id },
    trackSource: "streamer",
  }];
}

function recordAll(c: GameClient): Frame[] {
  const frames: Frame[] = [];
  c.socket.onAny((event: string, payload: unknown) => frames.push({ event, payload, at: Date.now() }));
  return frames;
}

const text = (f: Frame) => JSON.stringify(f.payload);
const isState = (p: unknown): p is StreamerState => Boolean(p && typeof p === "object" && "phase" in p);

/** Trames recues avant le reveal final (celle du reveal exclue). */
function beforeReveal(frames: Frame[]): Frame[] {
  const i = frames.findIndex(f => isState(f.payload) && f.payload.phase === "REVEAL_FINAL");
  return i < 0 ? frames : frames.slice(0, i);
}

describe("mode streamer sur le vrai serveur", () => {
  it("extrait a l'hote et a l'overlay seulement, aucune reponse avant le reveal, resultat par viewer", async () => {
    const [hostUser, legacyUser] = users;
    const host = await connectClient(server.port, hostUser);
    const legacy = await connectClient(server.port, legacyUser);
    const hostFrames = recordAll(host);
    const legacyFrames = recordAll(legacy);
    await joinRoom(server.io, roomCode, [host, legacy]);

    const overlay = await connectWatcher({ overlay: { salle: roomCode, jeton: overlayToken() } });
    const viewers = await Promise.all(
      ["Lena", "Malik", "Zoe"].map(pseudo => connectWatcher({ live: { salle: roomCode, pseudo } })),
    );
    await waitFor(() => viewers.every(v => v.frames.some(f => f.event === "live:init")), 4000, "live:init");
    expect(overlay.frames.some(f => f.event === "overlay:init")).toBe(true);
    const lenaKey = (viewers[0].frames.find(f => f.event === "live:init")?.payload as { me: { key: string } }).me.key;
    expect(lenaKey).toMatch(/^[A-Za-z0-9_-]{32}$/);

    initStreamerGame(server.io, {
      roomCode,
      hostUserId: hostUser.id,
      rounds: rounds(),
      subMode: "viewers_only",
      timings: { countdownMs: 150, chatMs: 1200 },
    });
    startNextStreamerRound(server.io, roomCode);
    await waitFor(() => getStreamerState(roomCode)?.phase === "GUESSING_CHAT", 3000, "GUESSING_CHAT");

    viewers[0].socket.emit("live:guess", { title: "chanson secrete", artist: "groupe mystere" });
    viewers[1].socket.emit("live:guess", { title: "chanson secrete", artist: "" });
    viewers[2].socket.emit("live:guess", { title: "pas du tout", artist: "non" });
    await waitFor(() => viewers.every(v => v.frames.some(f => f.event === "live:ack")), 3000, "acks");
    viewers[0].socket.emit("live:guess", { title: "autre", artist: "essai" });
    await waitFor(() => viewers[0].frames.filter(f => f.event === "live:ack").length === 2, 3000, "2e ack");
    const acks = viewers[0].frames.filter(f => f.event === "live:ack").map(f => (f.payload as { outcome: string }).outcome);
    expect(acks).toEqual(["ok", "deja"]);

    await waitFor(() => getStreamerState(roomCode)?.phase === "GAME_OVER", 5000, "GAME_OVER");
    await waitFor(() => viewers.every(v => v.frames.some(f => f.event === "live:result")), 3000, "live:result");

    // L'hote et l'overlay ont l'extrait pendant la manche, les autres jamais.
    for (const frames of [hostFrames, overlay.frames]) {
      expect(frames.some(f => isState(f.payload) && f.payload.phase === "GUESSING_CHAT" && text(f).includes(PREVIEW))).toBe(true);
    }
    for (const frames of [...viewers.map(v => v.frames), legacyFrames]) {
      expect(frames.length).toBeGreaterThan(3);
      for (const f of frames) {
        expect(text(f)).not.toContain(PREVIEW);
        expect(text(f)).not.toContain("deezer-777");
        expect(text(f)).not.toContain("src-777");
      }
    }
    // Personne ne voit le titre ni la pochette avant le reveal final.
    for (const frames of [hostFrames, overlay.frames, legacyFrames, ...viewers.map(v => v.frames)]) {
      for (const f of beforeReveal(frames)) {
        expect(text(f)).not.toContain(TITLE);
        expect(text(f)).not.toContain(COVER);
      }
    }
    // Au reveal, le public voit la reponse.
    const reveal = viewers[0].frames.find(f => f.event === "round:reveal:final")?.payload as StreamerState;
    expect(reveal.currentTrack).toMatchObject({ title: TITLE, albumCover: COVER, previewUrl: null });

    // Resultat de chacun, et classement final.
    const result = (i: number) => viewers[i].frames.find(f => f.event === "live:result")?.payload as { verdict: string; rank: number; points: number };
    expect(result(0)).toMatchObject({ verdict: "correct", rank: 1 });
    expect(result(1)).toMatchObject({ verdict: "close", rank: 2 });
    expect(result(2)).toMatchObject({ verdict: "wrong", points: 0 });
    const over = overlay.frames.filter(f => isState(f.payload) && f.payload.phase === "GAME_OVER").pop()?.payload as StreamerState;
    expect(over.leaderboard?.map(e => e.pseudo)).toEqual(["Lena", "Malik"]);
    // L'hote voit le compteur de reponses, sans leur texte.
    const answers = hostFrames.filter(f => f.event === "streamer:answers");
    expect(answers.length).toBeGreaterThan(0);
    for (const f of answers) expect(text(f)).not.toContain("pas du tout");

    // La cle de reprise rend le meme viewer, avec son score.
    const back = await connectWatcher({ live: { salle: roomCode, pseudo: "Nimporte", cle: lenaKey } });
    await waitFor(() => back.frames.some(f => f.event === "live:init"), 3000, "reprise");
    const me = (back.frames.find(f => f.event === "live:init")?.payload as { me: { pseudo: string; score: number } }).me;
    expect(me.pseudo).toBe("Lena");
    expect(me.score).toBeGreaterThan(20);

    host.socket.close();
    legacy.socket.close();
  });

  it("overlay : jeton faux, expire ou d'une autre salle refuse ; viewer : pseudo pris refuse", async () => {
    expect(await refusal({ overlay: { salle: roomCode, jeton: "123.abc" } })).toBe("overlay_refuse");
    expect(await refusal({ overlay: { salle: roomCode, jeton: overlayToken(Date.now() - 1000) } })).toBe("overlay_expire");
    const other = await seedRoom(users, "waiting");
    expect(await refusal({ overlay: { salle: other, jeton: overlayToken() } })).toBe("overlay_refuse");
    await connectWatcher({ live: { salle: roomCode, pseudo: "Lena" } });
    expect(await refusal({ live: { salle: roomCode, pseudo: "lena" } })).toBe("pseudo_pris");
    expect(await refusal({ live: { salle: "ZZZZZZ", pseudo: "Lena" } })).toBe("live_introuvable");
  });

  it("STREAMER_MODE=off : ni overlay ni viewer", async () => {
    process.env.STREAMER_MODE = "off";
    expect(await refusal({ overlay: { salle: roomCode, jeton: overlayToken() } })).toBe("live_desactive");
    expect(await refusal({ live: { salle: roomCode, pseudo: "Lena" } })).toBe("live_desactive");
  });
});
