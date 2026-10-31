// Mode streamer (T5) : bareme, pseudos et plafonds des viewers, interrupteur
// STREAMER_MODE, jeton d'overlay, et refus a la connexion. Aucune base.

jest.mock("../../src/services/gamePersistence", () => ({
  markMultiplayerRoomFinished: jest.fn(async () => undefined),
  markStreamerSessionFinished: jest.fn(async () => undefined),
}));

import { scoreViewerAnswer, remainingRatio } from "../../src/services/streamerScoring";
import {
  cleanPseudo,
  chatViewer,
  clearAllViewersForTests,
  joinViewer,
  leaderboard,
  getViewer,
  pageViewerCount,
  STALE_VIEWER_MS,
  updateViewer,
  viewerPresence,
} from "../../src/services/streamerViewers";
import { maxStreamerGames, maxStreamerViewers, streamerModeEnabled } from "../../src/services/streamerConfig";
import { OVERLAY_TTL_MS, overlayLink, signOverlayToken, verifyOverlayToken } from "../../src/services/overlayToken";
import { signSpectatorToken, verifySpectatorToken } from "../../src/services/spectatorToken";
import { authorizeStreamerSocket, resetStreamerAttemptsForTests, LIVE_ATTEMPTS } from "../../src/services/streamerSockets";
import { streamerStartRefusal } from "../../src/controllers/streamerController";
import { bootstrapStreamerGame, clearAllStreamerGamesForTests, startNextStreamerRound } from "../../src/services/streamerGame";
import type { Server as IOServer } from "socket.io";

const SECRET = "o".repeat(40);
const ROOM = "LIVE01";
const env = { ...process.env };

afterEach(() => {
  process.env = { ...env };
  clearAllViewersForTests();
  clearAllStreamerGamesForTests();
  resetStreamerAttemptsForTests();
});

describe("bareme", () => {
  const track = { title: "Chocolat (feat. Awa Imani)", artist: "Naza, Awa Imani" };
  const window = { startAt: 0, endAt: 20_000 };

  it("titre et artiste a 10 points chacun, plus la rapidite", () => {
    expect(scoreViewerAnswer({ title: "chocolat", artist: "naza", at: 0 }, track, window).points).toBe(30);
    expect(scoreViewerAnswer({ title: "chocolat", artist: "naza", at: 20_000 }, track, window).points).toBe(20);
    expect(scoreViewerAnswer({ title: "chocolat", artist: "", at: 10_000 }, track, window).points).toBe(15);
  });

  it("rien de juste : zero, meme tres vite", () => {
    const s = scoreViewerAnswer({ title: "rien", artist: "personne", at: 0 }, track, window);
    expect(s).toMatchObject({ points: 0, verdict: "wrong" });
  });

  it("le facteur reduit les points (chat Twitch) et reste borne", () => {
    expect(scoreViewerAnswer({ title: "chocolat", artist: "naza", at: 0 }, track, window, 0.5).points).toBe(15);
    expect(scoreViewerAnswer({ title: "chocolat", artist: "naza", at: 0 }, track, window, 7).points).toBe(30);
    expect(scoreViewerAnswer({ title: "chocolat", artist: "naza", at: 0 }, track, window, Number.NaN).points).toBe(0);
  });

  it("temps restant borne entre 0 et 1", () => {
    expect(remainingRatio(-5, window)).toBe(1);
    expect(remainingRatio(99_999, window)).toBe(0);
    expect(remainingRatio(0, { startAt: 5, endAt: 5 })).toBe(0);
  });
});

describe("viewers", () => {
  it("pseudo nettoye, refuse s'il est trop court, trop long ou bizarre", () => {
    expect(cleanPseudo("  Léna   la  Folle ")).toBe("Léna la Folle");
    expect(cleanPseudo("a")).toBeNull();
    expect(cleanPseudo("x".repeat(21))).toBeNull();
    expect(cleanPseudo("<script>")).toBeNull();
    expect(cleanPseudo(42)).toBeNull();
  });

  it("pseudo deja pris dans la salle (sans tenir compte de la casse)", () => {
    expect(joinViewer(ROOM, { pseudo: "Lena" }).ok).toBe(true);
    expect(joinViewer(ROOM, { pseudo: "LENA" })).toEqual({ ok: false, code: "pseudo_pris" });
    expect(joinViewer("AUTRE1", { pseudo: "Lena" }).ok).toBe(true);
  });

  it("la cle de reprise rend le meme viewer et son score", () => {
    const first = joinViewer(ROOM, { pseudo: "Lena" });
    if (!first.ok) throw new Error("join");
    updateViewer(ROOM, first.viewer.id, v => ({ ...v, score: 12 }));
    const again = joinViewer(ROOM, { pseudo: "Autre", key: first.viewer.key });
    expect(again).toMatchObject({ ok: true, resumed: true, viewer: { id: first.viewer.id, pseudo: "Lena", score: 12 } });
  });

  it("le classement ne montre jamais la cle", () => {
    const r = joinViewer(ROOM, { pseudo: "Lena" });
    if (!r.ok) throw new Error("join");
    updateViewer(ROOM, r.viewer.id, v => ({ ...v, score: 5 }));
    expect(JSON.stringify(leaderboard(ROOM))).not.toContain(r.viewer.key);
  });

  it("plafond de viewers par partie (STREAMER_MAX_VIEWERS)", () => {
    process.env.STREAMER_MAX_VIEWERS = "2";
    expect(joinViewer(ROOM, { pseudo: "Un1" }).ok).toBe(true);
    expect(joinViewer(ROOM, { pseudo: "Deux" }).ok).toBe(true);
    expect(joinViewer(ROOM, { pseudo: "Trois" })).toEqual({ ok: false, code: "live_complet" });
    expect(pageViewerCount(ROOM)).toBe(2);
  });

  it("plafond atteint : un viewer parti depuis longtemps sans un point libere sa place", () => {
    process.env.STREAMER_MAX_VIEWERS = "2";
    const t0 = 1_000_000;
    const gone = joinViewer(ROOM, { pseudo: "Parti" }, t0);
    const scorer = joinViewer(ROOM, { pseudo: "Marqueur" }, t0);
    if (!gone.ok || !scorer.ok) throw new Error("join");
    viewerPresence(ROOM, gone.viewer.id, 1, t0);
    viewerPresence(ROOM, gone.viewer.id, -1, t0);
    updateViewer(ROOM, scorer.viewer.id, v => ({ ...v, score: 10 }));
    expect(joinViewer(ROOM, { pseudo: "Nouveau" }, t0 + 1_000)).toEqual({ ok: false, code: "live_complet" });
    const later = joinViewer(ROOM, { pseudo: "Nouveau" }, t0 + STALE_VIEWER_MS + 1);
    expect(later.ok).toBe(true);
    // Celui qui avait marque garde sa place et son score.
    expect(joinViewer(ROOM, { pseudo: "x", key: scorer.viewer.key }, t0 + STALE_VIEWER_MS + 2)).toMatchObject({ ok: true, viewer: { score: 10 } });
  });

  it("un pseudo du chat et un pseudo de la page ne se confondent pas", () => {
    expect(joinViewer(ROOM, { pseudo: "Lena" }).ok).toBe(true);
    const chat = chatViewer(ROOM, "lena", "Lena");
    expect(chat?.source).toBe("chat");
    expect(chatViewer(ROOM, "lena", "Lena")?.id).toBe(chat?.id);
  });
});

describe("reglages et interrupteur", () => {
  it("STREAMER_MODE : ouvert par defaut, ferme avec off", () => {
    expect(streamerModeEnabled({})).toBe(true);
    expect(streamerModeEnabled({ STREAMER_MODE: "on" })).toBe(true);
    expect(streamerModeEnabled({ STREAMER_MODE: "OFF" })).toBe(false);
    expect(streamerModeEnabled({ STREAMER_MODE: "false" })).toBe(false);
  });

  it("plafonds par defaut et reglables", () => {
    expect(maxStreamerGames({})).toBe(3);
    expect(maxStreamerGames({ STREAMER_MAX_GAMES: "5" })).toBe(5);
    expect(maxStreamerGames({ STREAMER_MAX_GAMES: "nimp" })).toBe(3);
    expect(maxStreamerViewers({})).toBe(300);
    expect(maxStreamerViewers({ STREAMER_MAX_VIEWERS: "0" })).toBe(300);
  });

  it("lancement refuse si le mode est coupe", () => {
    process.env.STREAMER_MODE = "off";
    expect(streamerStartRefusal(ROOM)).toMatchObject({ status: 403, code: "streamer_off" });
  });

  it("pas plus de N parties streamer en meme temps", () => {
    process.env.STREAMER_MAX_GAMES = "2";
    const io = { to: () => ({ to: () => ({ except: () => ({ emit: () => true }) }), emit: () => true }) } as unknown as IOServer;
    for (const code of ["AAA111", "BBB222"]) {
      bootstrapStreamerGame({ roomCode: code, hostUserId: 1, rounds: [], subMode: "viewers_only" });
    }
    expect(streamerStartRefusal("CCC333")).toMatchObject({ status: 503, code: "streamer_full" });
    // Une partie deja lancee dans cette salle : verrouillee, pas « pleine ».
    expect(streamerStartRefusal("AAA111")).toMatchObject({ status: 409 });
    // Une partie finie libere sa place.
    startNextStreamerRound(io, "BBB222");
    expect(streamerStartRefusal("CCC333")).toBeNull();
  });
});

describe("jeton d'overlay", () => {
  const input = { roomCode: ROOM, roomId: 7, expiresAt: Date.now() + 60_000 };

  it("signe et verifie pour la bonne salle", () => {
    const token = signOverlayToken(input, SECRET);
    expect(verifyOverlayToken({ roomCode: ROOM, roomId: 7, token }, SECRET)).toMatchObject({ ok: true });
    expect(verifyOverlayToken({ roomCode: ROOM, roomId: 8, token }, SECRET)).toMatchObject({ ok: false, reason: "bad_signature" });
    expect(verifyOverlayToken({ roomCode: "AUTRE1", roomId: 7, token }, SECRET)).toMatchObject({ ok: false });
  });

  it("un jeton spectateur ne vaut rien comme overlay, et inversement", () => {
    const spectator = signSpectatorToken(input, SECRET);
    expect(verifyOverlayToken({ roomCode: ROOM, roomId: 7, token: spectator }, SECRET)).toMatchObject({ ok: false, reason: "bad_signature" });
    const overlay = signOverlayToken(input, SECRET);
    expect(verifySpectatorToken({ roomCode: ROOM, roomId: 7, token: overlay }, SECRET)).toMatchObject({ ok: false, reason: "bad_signature" });
  });

  it("expire, ou trop long", () => {
    const old = signOverlayToken({ ...input, expiresAt: Date.now() - 1 }, SECRET);
    expect(verifyOverlayToken({ roomCode: ROOM, roomId: 7, token: old }, SECRET)).toMatchObject({ reason: "expired" });
    const long = signOverlayToken({ ...input, expiresAt: Date.now() + OVERLAY_TTL_MS * 2 }, SECRET);
    expect(verifyOverlayToken({ roomCode: ROOM, roomId: 7, token: long }, SECRET)).toMatchObject({ reason: "too_long" });
  });

  it("adresse de la page overlay", () => {
    expect(overlayLink("https://blindz.app/", "AB12CD", "1.x")).toBe("https://blindz.app/streamer/overlay/?salle=AB12CD&jeton=1.x");
  });
});

describe("connexion de l'overlay et des viewers", () => {
  const streamerRoom = async () => ({ id: 7, mode: "streamer", status: "waiting" });
  const friendsRoom = async () => ({ id: 7, mode: "friends", status: "waiting" });
  const live = (pseudo: string, salle = ROOM) => ({ kind: "live" as const, salle, pseudo, cle: undefined });

  it("viewer : inscrit avec un pseudo dans une salle streamer", async () => {
    const r = await authorizeStreamerSocket(live("Lena"), "1.2.3.4", { findRoom: streamerRoom });
    expect(r).toMatchObject({ ok: true, data: { kind: "live", roomCode: ROOM } });
  });

  it("viewer : refuse hors salle streamer, ou mode coupe", async () => {
    expect(await authorizeStreamerSocket(live("Lena"), "1.2.3.4", { findRoom: friendsRoom })).toEqual({ ok: false, code: "live_introuvable" });
    expect(await authorizeStreamerSocket(live("Lena"), "1.2.3.4", { findRoom: async () => null })).toEqual({ ok: false, code: "live_introuvable" });
    process.env.STREAMER_MODE = "off";
    expect(await authorizeStreamerSocket(live("Lena"), "1.2.3.4", { findRoom: streamerRoom })).toEqual({ ok: false, code: "live_desactive" });
  });

  it("viewer : limite de connexions par adresse", async () => {
    for (let i = 0; i < LIVE_ATTEMPTS; i++) {
      await authorizeStreamerSocket(live(`Joueur${i}`), "9.9.9.9", { findRoom: streamerRoom });
    }
    expect(await authorizeStreamerSocket(live("EncoreUn"), "9.9.9.9", { findRoom: streamerRoom })).toEqual({ ok: false, code: "live_limite" });
    expect((await authorizeStreamerSocket(live("Ailleurs"), "8.8.8.8", { findRoom: streamerRoom })).ok).toBe(true);
  });

  it("viewer : revenir avec sa cle n'entame pas la limite", async () => {
    const first = await authorizeStreamerSocket(live("Lena"), "7.7.7.7", { findRoom: streamerRoom });
    if (!first.ok || first.data.kind !== "live") throw new Error("join");
    const key = getViewer(ROOM, first.data.viewerId)?.key;
    for (let i = 1; i < LIVE_ATTEMPTS; i++) await authorizeStreamerSocket(live(`Joueur${i}`), "7.7.7.7", { findRoom: streamerRoom });
    expect(await authorizeStreamerSocket(live("Encore"), "7.7.7.7", { findRoom: streamerRoom })).toEqual({ ok: false, code: "live_limite" });
    const back = await authorizeStreamerSocket({ kind: "live", salle: ROOM, pseudo: "Lena", cle: key }, "7.7.7.7", { findRoom: streamerRoom });
    expect(back).toMatchObject({ ok: true, data: { viewerId: first.data.viewerId } });
  });

  it("overlay : jeton valide, sinon refus net", async () => {
    const jeton = signOverlayToken({ roomCode: ROOM, roomId: 7, expiresAt: Date.now() + 60_000 }, SECRET);
    const hs = (j: string) => ({ kind: "overlay" as const, salle: ROOM, jeton: j });
    expect(await authorizeStreamerSocket(hs(jeton), "1.2.3.4", { findRoom: streamerRoom, overlaySecret: SECRET })).toMatchObject({ ok: true, data: { kind: "overlay" } });
    expect(await authorizeStreamerSocket(hs(jeton + "x"), "1.2.3.4", { findRoom: streamerRoom, overlaySecret: SECRET })).toEqual({ ok: false, code: "overlay_refuse" });
    expect(await authorizeStreamerSocket(hs(jeton), "1.2.3.4", { findRoom: streamerRoom, overlaySecret: null })).toEqual({ ok: false, code: "overlay_desactive" });
  });
});
