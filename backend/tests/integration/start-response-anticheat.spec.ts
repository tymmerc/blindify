/**
 * Anti-triche, cote REST : la reponse HTTP de POST /rooms/:code/start part chez
 * l'hote, qui joue souvent lui aussi (a distance, "je joue aussi", streamer).
 * Elle ne doit porter AUCUNE reponse de la partie : ni titre, ni artiste, ni
 * pochette, ni identifiant du morceau chez le fournisseur. Seul l'extrait de
 * la manche en cours peut sortir (il faut bien l'ecouter).
 *
 * Avant le correctif, ouvrir l'onglet Reseau au lancement donnait le corrige
 * complet de la partie. Necessite la base de test (voir tests/setup.ts).
 */
import crypto from "crypto";
import type { Request, Response } from "express";
import {
  startTestServer,
  seedUsers,
  seedRoom,
  cleanupGame,
  cleanupUsers,
  closePool,
  pool,
  type TestServer,
  type TestUser,
} from "./helpers/socket-test-harness";
import { roomsController } from "../../src/controllers/roomsController";
import { cleanupStreamer } from "../../src/services/streamerOrchestrator";

jest.setTimeout(30000);

type Seeded = { title: string; artist: string; externalId: string; cover: string; audioUrl: string; isrc: string };

/** Bibliotheque d'un joueur, avec des chaines uniques faciles a chercher dans la reponse. */
async function seedLibrary(userId: number, count: number): Promise<Seeded[]> {
  const out: Seeded[] = [];
  for (let i = 1; i <= count; i++) {
    const tag = `${userId}-${i}-${crypto.randomUUID().slice(0, 8)}`;
    const s: Seeded = {
      title: `Titre secret ${tag}`,
      artist: `Artiste secret ${tag}`,
      externalId: `ext-secret-${tag}`,
      cover: `https://img.example.test/cover-${tag}.jpg`,
      // Pas de "exp=" : l'extrait est frais, aucun appel Deezer pendant le test.
      audioUrl: `https://cdn.example.test/preview-${tag}.mp3`,
      // L'ISRC designe l'enregistrement : avec lui, on retrouve le titre en
      // une recherche. Il ne doit pas sortir non plus avant le reveal.
      isrc: `QZTST${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
    };
    await pool.query(
      `INSERT INTO audio_sources (user_id, provider, external_id, title, artist, album_cover, audio_url, metadata)
       VALUES ($1, 'deezer', $2, $3, $4, $5, $6, $7::jsonb)`,
      [userId, s.externalId, s.title, s.artist, s.cover, s.audioUrl, JSON.stringify({ isrc: s.isrc })],
    );
    out.push(s);
  }
  return out;
}

async function callStart(code: string, hostId: number, body: Record<string, unknown> = { source: "library" }) {
  const res = {} as { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  const req = { params: { code }, body, query: {}, headers: {}, session: { userId: hostId } } as unknown as Request;
  await roomsController.startGame(req, res as unknown as Response);
  return { status: res.status.mock.calls[0]?.[0] as number, body: res.json.mock.calls[0]?.[0] };
}

/** Ce qui, dans la reponse, permettrait de connaitre une reponse avant le reveal. */
function leakedSecrets(body: unknown, library: Seeded[]): string[] {
  const raw = JSON.stringify(body);
  return library.flatMap(s => [s.title, s.artist, s.externalId, s.cover, s.isrc]).filter(v => raw.includes(v));
}

function previewsInBody(body: unknown, library: Seeded[]): number {
  const raw = JSON.stringify(body);
  return library.filter(s => raw.includes(s.audioUrl)).length;
}

function expectHiddenTracks(tracks: Array<Record<string, unknown>>, totalRounds: number): void {
  // Le client garde le nombre de manches (et leur numero), rien d'autre.
  expect(tracks).toHaveLength(totalRounds);
  tracks.forEach((t, i) => {
    expect(t.round).toBe(i + 1);
    expect(t.title).toBeNull();
    expect(t.artist).toBeNull();
    expect(t.audio_url).toBeNull();
    expect(t.album_cover).toBeNull();
    expect(t.track_id).toBeNull();
    expect(t.audioSourceId).toBeNull();
    expect((t.metadata as Record<string, unknown>)?.owner_user_id ?? null).toBeNull();
  });
}

async function cleanupRoom(code: string, users: TestUser[]): Promise<void> {
  cleanupGame(code);
  cleanupStreamer(code);
  await pool.query(`DELETE FROM game_sessions WHERE room_code = $1`, [code]);
  await pool.query(`DELETE FROM audio_sources WHERE user_id = ANY($1::int[])`, [users.map(u => u.id)]);
  await cleanupUsers(users);
}

describe("POST /rooms/:code/start ne livre pas le corrige a l'hote", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await startTestServer();
  });

  afterAll(async () => {
    await server.close();
    await closePool();
  });

  it("partie classique : ni titre, ni artiste, ni pochette, ni identifiant dans la reponse", async () => {
    const users = await seedUsers(2, "Start");
    const code = await seedRoom(users, "waiting");
    try {
      const library = [...(await seedLibrary(users[0].id, 3)), ...(await seedLibrary(users[1].id, 3))];

      const { status, body } = await callStart(code, users[0].id);

      expect(status).toBe(200);
      expect(leakedSecrets(body, library)).toEqual([]);
      const data = body.data;
      expectHiddenTracks(data.tracks, data.session.totalRounds);
      // L'etat de jeu renvoye est la vue publique : manche 1 caviardee, mais
      // jouable (son extrait est la, c'est le seul qui sort).
      expect(data.gameState.phase).toBe("GUESSING");
      expect(data.gameState.currentRound).toBe(1);
      expect(data.gameState.currentTrack.title).toBe("");
      expect(data.gameState.currentTrack.artist).toBe("");
      expect(library.map(s => s.audioUrl)).toContain(data.gameState.currentTrack.previewUrl);
      expect(previewsInBody(body, library)).toBe(1);
    } finally {
      await cleanupRoom(code, users);
    }
  });

  it("relance pendant la partie (double clic, 2e onglet) : meme caviardage", async () => {
    const users = await seedUsers(2, "Relance");
    const code = await seedRoom(users, "waiting");
    try {
      const library = [...(await seedLibrary(users[0].id, 3)), ...(await seedLibrary(users[1].id, 3))];
      const first = await callStart(code, users[0].id);
      expect(first.status).toBe(200);

      // La partie tourne : le 2e appel passe par la branche "deja lancee".
      const { status, body } = await callStart(code, users[0].id);

      expect(status).toBe(200);
      expect(leakedSecrets(body, library)).toEqual([]);
      expectHiddenTracks(body.data.tracks, body.data.session.totalRounds);
      expect(body.data.gameState.phase).toBe("GUESSING");
      expect(body.data.gameState.currentTrack.title).toBe("");
      expect(previewsInBody(body, library)).toBeLessThanOrEqual(1);
    } finally {
      await cleanupRoom(code, users);
    }
  });

  it("mode streamer : le streamer devine aussi, la reponse de lancement reste muette", async () => {
    const users = await seedUsers(3, "Stream");
    const code = await seedRoom(users, "waiting");
    try {
      await pool.query(`UPDATE multiplayer_rooms SET mode = 'streamer' WHERE room_code = $1`, [code]);
      const library = [...(await seedLibrary(users[1].id, 3)), ...(await seedLibrary(users[2].id, 3))];

      const { status, body } = await callStart(code, users[0].id, { source: "library", subMode: "duo" });

      expect(status).toBe(200);
      expect(leakedSecrets(body, library)).toEqual([]);
      expectHiddenTracks(body.data.tracks, body.data.session.totalRounds);
      expect(previewsInBody(body, library)).toBeLessThanOrEqual(1);
    } finally {
      await cleanupRoom(code, users);
    }
  });
});
