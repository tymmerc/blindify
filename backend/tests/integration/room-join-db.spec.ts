/**
 * Entree dans une salle (POST /api/rooms/:code/join) contre une VRAIE base
 * Postgres : la base jetable de `npm run test:db` (voir tests/testDatabase.ts).
 *
 * Le front relance le join quand la reponse tarde (filet de securite du lobby)
 * et un F5 le renvoie : le meme joueur peut l'envoyer plusieurs fois. Avec les
 * vraies contraintes de la base (UNIQUE (room_id, user_id), ON CONFLICT), un
 * join rejoue ne doit ni creer de doublon, ni fausser le compte des places, ni
 * effacer le pseudo deja choisi ; une salle pleine refuse un nouveau venu mais
 * laisse revenir un joueur deja inscrit.
 *
 * Seules la session (le joueur est donne tel quel) et la diffusion socket.io
 * sont simulees.
 */
import crypto from "crypto";
import type { Request, Response } from "express";

jest.mock("../../src/utils/session", () => ({
  getSessionContext: jest.fn(),
}));
const mockEmit = jest.fn();
jest.mock("../../src/socket", () => ({
  io: { to: jest.fn(() => ({ emit: mockEmit })) },
}));

import { roomsController } from "../../src/controllers/roomsController";
import { pool } from "../../src/config/db";
import { getSessionContext } from "../../src/utils/session";
import { bootstrapGameState, clearGame, getGameState, revealRound, startNextRound } from "../../src/services/realtimeGame";
import { resolveTestDatabaseUrl } from "../testDatabase";

// Cette suite ecrit de vraies lignes : sans base de test jetable, elle s'arrete ici.
resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);

const mockGetSessionContext = getSessionContext as jest.Mock;

type Player = { id: number; username: string; provider: "guest" };
type Room = { id: number; code: string };
type JoinBody = {
  success: boolean;
  data: { room: { room_code: string }; lateJoin?: boolean; rejoined?: boolean } | null;
  error: { code: string } | null;
};

const seededUsers: number[] = [];
const seededRooms: number[] = [];

async function seedPlayer(name: string): Promise<Player> {
  const username = `${name}_${crypto.randomUUID().slice(0, 8)}`;
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (provider, provider_id, username) VALUES ('guest', $1, $2) RETURNING id`,
    [crypto.randomUUID(), username],
  );
  seededUsers.push(rows[0].id);
  return { id: rows[0].id, username, provider: "guest" };
}

async function seedRoom(host: Player, maxPlayers: number): Promise<Room> {
  const code = crypto.randomUUID().replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO multiplayer_rooms (room_code, host_user_id, status, max_players, question_count)
     VALUES ($1, $2, 'waiting', $3, 3) RETURNING id`,
    [code, host.id, maxPlayers],
  );
  seededRooms.push(rows[0].id);
  return { id: rows[0].id, code };
}

/** Envoie le join de `player` comme le ferait le front, et rend le statut HTTP et la reponse. */
async function join(player: Player, room: Room, nickname?: string): Promise<{ status: number; body: JoinBody }> {
  mockGetSessionContext.mockResolvedValue({ user: player });
  const req = {
    params: { code: room.code.toLowerCase() },
    body: nickname === undefined ? {} : { nickname },
    headers: {},
    session: {},
  } as unknown as Request;
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  await roomsController.joinRoom(req, res as unknown as Response);
  return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] };
}

async function seats(room: Room): Promise<Array<{ user_id: number; nickname: string | null }>> {
  const { rows } = await pool.query<{ user_id: number; nickname: string | null }>(
    `SELECT user_id, nickname FROM room_participants WHERE room_id=$1 ORDER BY id`,
    [room.id],
  );
  return rows;
}

afterAll(async () => {
  if (seededRooms.length) {
    await pool.query(`DELETE FROM room_participants WHERE room_id = ANY($1)`, [seededRooms]);
    await pool.query(`DELETE FROM multiplayer_rooms WHERE id = ANY($1)`, [seededRooms]);
  }
  if (seededUsers.length) await pool.query(`DELETE FROM users WHERE id = ANY($1)`, [seededUsers]);
  await pool.end();
});

describe("join d'une salle, base reelle", () => {
  it("le meme joueur qui rejoint deux fois n'occupe qu'une ligne et une seule place", async () => {
    const [host, lea, max] = [await seedPlayer("Hote"), await seedPlayer("Lea"), await seedPlayer("Max")];
    const room = await seedRoom(host, 2);

    expect((await join(lea, room, "Lea")).status).toBe(200);
    expect((await join(lea, room, "Lea")).status).toBe(200);
    expect(await seats(room)).toEqual([{ user_id: lea.id, nickname: "Lea" }]);

    // La seconde place est toujours libre pour quelqu'un d'autre.
    expect((await join(max, room, "Max")).status).toBe(200);
    expect((await seats(room)).map(s => s.user_id)).toEqual([lea.id, max.id]);
  });

  it("salle pleine : refuse un nouveau venu, laisse revenir un joueur deja inscrit", async () => {
    const [host, lea, max, zoe] = [
      await seedPlayer("Hote"),
      await seedPlayer("Lea"),
      await seedPlayer("Max"),
      await seedPlayer("Zoe"),
    ];
    const room = await seedRoom(host, 2);
    await join(lea, room, "Lea");
    await join(max, room, "Max");

    const refused = await join(zoe, room, "Zoe");
    expect(refused.status).toBe(409);
    expect(refused.body.error?.code).toBe("room_full");

    const back = await join(lea, room, "Lea");
    expect(back.status).toBe(200);
    expect(back.body).toMatchObject({ success: true, data: { room: { room_code: room.code } } });
    expect((await seats(room)).map(s => s.user_id)).toEqual([lea.id, max.id]);
  });

  it("un join rejoue sans pseudo garde celui deja choisi, un nouveau pseudo le remplace", async () => {
    const [host, lea] = [await seedPlayer("Hote"), await seedPlayer("Lea")];
    const room = await seedRoom(host, 4);
    await join(lea, room, "Lea");

    await join(lea, room);
    expect(await seats(room)).toEqual([{ user_id: lea.id, nickname: "Lea" }]);

    await join(lea, room, "Lea B");
    expect(await seats(room)).toEqual([{ user_id: lea.id, nickname: "Lea B" }]);
  });
});

/** Partie en cours, en base et en memoire, avec `players` a la table. */
async function startLiveGame(room: Room, players: Player[]): Promise<void> {
  await pool.query(`UPDATE multiplayer_rooms SET status='in_progress' WHERE id=$1`, [room.id]);
  for (const p of players) {
    await pool.query(`INSERT INTO room_participants (room_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [room.id, p.id]);
  }
  bootstrapGameState({
    roomCode: room.code,
    hostUserId: players[0].id,
    tracks: [1, 2, 3].map(round => ({ round, trackId: `t${round}`, title: `T${round}`, artist: `A${round}`, previewUrl: null })),
    participants: players.map(p => ({ userId: p.id, username: p.username })),
    config: { roundDurationMs: 20_000 },
  });
  startNextRound(room.code);
}

describe("arriver pendant une partie (T19)", () => {
  it("pendant une manche ou un reveal : entre, avec lateJoin, au lieu du 409", async () => {
    const [host, lea, zoe, max] = [await seedPlayer("Hote"), await seedPlayer("Lea"), await seedPlayer("Zoe"), await seedPlayer("Max")];
    const room = await seedRoom(host, 6);
    await startLiveGame(room, [host, lea]);
    try {
      const during = await join(zoe, room, "Zoe");
      expect(during.status).toBe(200);
      expect(during.body.data).toMatchObject({ room: { room_code: room.code }, lateJoin: true });
      expect((await seats(room)).map(s => s.user_id)).toContain(zoe.id);

      revealRound(room.code);
      expect(getGameState(room.code)?.phase).toBe("REVEAL");
      expect((await join(max, room, "Max")).body.data?.lateJoin).toBe(true);

      // Rechargement de page : il en fait deja partie.
      const again = await join(zoe, room);
      expect(again.status).toBe(200);
      expect(again.body.data).toMatchObject({ rejoined: true });
    } finally {
      clearGame(room.code);
    }
  });

  it("salle pleine : toujours refuse pendant une partie", async () => {
    const [host, lea, zoe] = [await seedPlayer("Hote"), await seedPlayer("Lea"), await seedPlayer("Zoe")];
    const room = await seedRoom(host, 2);
    await startLiveGame(room, [host, lea]);
    try {
      const refused = await join(zoe, room, "Zoe");
      expect(refused.status).toBe(409);
      expect(refused.body.error?.code).toBe("room_full");
    } finally {
      clearGame(room.code);
    }
  });

  it("salle en cours sans etat en memoire (backend redemarre) : entre comme avant, sans lateJoin", async () => {
    const [host, zoe] = [await seedPlayer("Hote"), await seedPlayer("Zoe")];
    const room = await seedRoom(host, 4);
    await pool.query(`UPDATE multiplayer_rooms SET status='in_progress' WHERE id=$1`, [room.id]);
    const entered = await join(zoe, room, "Zoe");
    expect(entered.status).toBe(200);
    expect(entered.body.data?.lateJoin).toBeUndefined();
  });
});
