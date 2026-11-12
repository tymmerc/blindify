/**
 * T26 : un joueur qui revient retrouve ses infos, contre une vraie base de test.
 *
 * Vu en prod le 05/11/2026 : la bande du 01/11 est revenue et le site leur a
 * cree des invites neufs. Deux defauts cote serveur :
 * - le site ne lisait que le cookie de cookie-session (24 h, jamais renouvele),
 *   le cookie d'un an n'etait lu que par le socket ;
 * - chaque /api/auth/me ramenait l'echeance en base a « maintenant + 24 h ».
 *
 * Ce qui est verifie :
 * - un invite qui revient 3 jours plus tard, avec seulement son cookie d'un an,
 *   est le meme joueur ;
 * - creer un compte depuis cet invite garde le meme id, donc tout ;
 * - se connecter a un compte depuis un invite fait reprendre a ce compte les
 *   parties, scores, badges et musique de cet invite, et seulement de lui ;
 * - un autre invite au meme pseudo n'est jamais touche.
 *
 * Base : TEST_DATABASE_URL (voir tests/testDatabase.ts), jamais la prod.
 */
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import type { Request, Response } from "express";
import { pool } from "../../src/config/db";
import { authController } from "../../src/controllers/authController";

const DAY = 24 * 60 * 60 * 1000;
const created: number[] = [];
let tag = "";

type FakeRes = Response & { body?: any; cookies: Record<string, string> };

function fakeRes(): FakeRes {
  const res: any = { cookies: {}, statusCode: 200 };
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: unknown) => { res.body = body; return res; };
  res.cookie = (name: string, value: string) => { res.cookies[name] = value; return res; };
  res.clearCookie = () => res;
  return res as FakeRes;
}

// Un navigateur qui ne garde que le cookie d'un an : le cookie de 24 h est
// parti (expire, ou vide), comme pour la bande du 01/11 revenue le 05/11.
function browserWithCookie(token: string, body: unknown = {}): Request {
  return { body, headers: { cookie: `blindify_session_token=${token}` }, session: {} } as unknown as Request;
}

async function newGuest(nickname: string): Promise<{ id: number; token: string }> {
  const res = fakeRes();
  await authController.guest({ body: { nickname }, headers: {}, session: {} } as unknown as Request, res);
  const id = res.body.data.user.id as number;
  created.push(id);
  return { id, token: res.cookies.blindify_session_token };
}

async function me(req: Request): Promise<number | null> {
  const res = fakeRes();
  await authController.me(req, res);
  return res.statusCode === 200 ? (res.body.data.user.id as number) : null;
}

// Une partie jouee, une manche, des stats, un badge, un lien et un morceau.
async function seedHistory(userId: number, label: string) {
  const { rows: [session] } = await pool.query(
    `INSERT INTO game_sessions (mode, host_user_id) VALUES ('multiplayer', $1) RETURNING id`, [userId]);
  await pool.query(`INSERT INTO game_participants (session_id, user_id, score) VALUES ($1, $2, 120)`, [session.id, userId]);
  const { rows: [round] } = await pool.query(
    `INSERT INTO game_rounds (session_id, round_index, correct_title, correct_artist) VALUES ($1, 0, 't', 'a') RETURNING id`,
    [session.id]);
  await pool.query(`INSERT INTO round_responses (round_id, user_id) VALUES ($1, $2)`, [round.id, userId]);
  await pool.query(
    `INSERT INTO user_stats (user_id, total_games, total_correct, total_guesses, total_xp, best_streak)
     VALUES ($1, 1, 4, 6, 50, 3)`, [userId]);
  const { rows: [badge] } = await pool.query(
    `INSERT INTO badges (slug, name) VALUES ($1, $1) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
    [`t26-${tag}-${label}`]);
  await pool.query(`INSERT INTO user_badges (user_id, badge_id) VALUES ($1, $2)`, [userId, badge.id]);
  const { rows: [link] } = await pool.query(
    `INSERT INTO imported_links (user_id, url, normalized_url) VALUES ($1, $2, $2) RETURNING id`,
    [userId, `https://deezer.test/${tag}/${label}`]);
  const { rows: [track] } = await pool.query(
    `INSERT INTO audio_sources (provider, external_id, title, artist, user_id)
     VALUES ('deezer', $1, 'titre', 'artiste', $2) RETURNING id`, [`t26-${tag}-${label}`, userId]);
  await pool.query(
    `INSERT INTO user_audio_sources (user_id, audio_source_id, link_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [userId, track.id, link.id]);
  return { sessionId: session.id as number };
}

async function counts(userId: number) {
  const { rows: [r] } = await pool.query(
    `SELECT
       (SELECT count(*) FROM game_participants WHERE user_id=$1)::int AS games,
       (SELECT count(*) FROM round_responses WHERE user_id=$1)::int AS answers,
       (SELECT count(*) FROM user_badges WHERE user_id=$1)::int AS badges,
       (SELECT count(*) FROM imported_links WHERE user_id=$1)::int AS links,
       (SELECT count(*) FROM user_audio_sources WHERE user_id=$1)::int AS tracks,
       (SELECT COALESCE(SUM(total_games), 0) FROM user_stats WHERE user_id=$1)::int AS total_games,
       (SELECT COALESCE(MAX(best_streak), 0) FROM user_stats WHERE user_id=$1)::int AS best_streak,
       (SELECT count(*) FROM user_sessions WHERE user_id=$1)::int AS sessions`,
    [userId]);
  return r;
}

beforeEach(() => {
  tag = Math.random().toString(36).slice(2, 8);
});

afterEach(() => {
  jest.useRealTimers();
});

afterAll(async () => {
  if (created.length) {
    await pool.query(`DELETE FROM audio_sources WHERE external_id LIKE 't26-%'`);
    await pool.query(`DELETE FROM game_sessions WHERE host_user_id = ANY($1::int[])`, [created]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [created]);
    await pool.query(`DELETE FROM badges WHERE slug LIKE 't26-%'`);
  }
  await pool.end();
});

// Seule l'horloge du JS avance (les echeances sont comparees cote Node).
function travel(ms: number) {
  jest.useFakeTimers({
    now: Date.now() + ms,
    doNotFake: ["nextTick", "setImmediate", "setTimeout", "setInterval", "clearTimeout", "clearInterval", "queueMicrotask"],
  });
}

describe("T26 : revenir des jours plus tard", () => {
  it("un invite qui repasse le lendemain puis revient 3 jours apres reste le meme joueur", async () => {
    const guest = await newGuest(`océ-${tag}`);

    travel(2 * 60 * 60 * 1000); // le soir meme, 2 h apres
    expect(await me(browserWithCookie(guest.token))).toBe(guest.id);

    travel(3 * DAY); // avant T26 : session expiree 24 h apres ce passage
    expect(await me(browserWithCookie(guest.token))).toBe(guest.id);

    const { rows: [s] } = await pool.query(
      `SELECT expires_at FROM user_sessions WHERE user_id=$1`, [guest.id]);
    expect(new Date(s.expires_at).getTime()).toBeGreaterThan(Date.now() + 300 * DAY);
  });

  it("un jeton inconnu ne retrouve personne (le front recree alors un invite)", async () => {
    expect(await me(browserWithCookie("jeton-qui-n-existe-pas"))).toBeNull();
  });
});

describe("T26 : garder ses infos avec un compte", () => {
  it("creer un compte depuis un invite garde le meme id et tout son historique", async () => {
    const guest = await newGuest(`Manou-${tag}`);
    await seedHistory(guest.id, "manou");
    const before = await counts(guest.id);

    const res = fakeRes();
    await authController.register(browserWithCookie(guest.token, { username: `Manou-${tag}`, password: "motdepasse" }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.user.id).toBe(guest.id);
    expect(res.body.data.user.provider).toBe("local");
    expect(res.body.data.keptGuest).toBe(true);
    expect(await counts(guest.id)).toMatchObject({ ...before, sessions: expect.any(Number) });

    // Et le compte se retrouve ensuite depuis n'importe quel navigateur.
    const login = fakeRes();
    await authController.login({ body: { username: `Manou-${tag}`, password: "motdepasse" }, headers: {}, session: {} } as unknown as Request, login);
    expect(login.body.data.user.id).toBe(guest.id);
  });

  it("se connecter depuis un invite : le compte reprend cet invite, pas un homonyme", async () => {
    // Le compte, avec son passe.
    const accountGuest = await newGuest(`Miguel-${tag}`);
    await seedHistory(accountGuest.id, "compte");
    const reg = fakeRes();
    await authController.register(browserWithCookie(accountGuest.token, { username: `Miguel-${tag}`, password: "motdepasse" }), reg);
    const accountId = reg.body.data.user.id as number;

    // Le meme joueur, dans Snapchat : un invite neuf qui joue une partie.
    const snap = await newGuest(`Miguel-${tag}`);
    await seedHistory(snap.id, "snap");
    // Un autre Miguel, sur un autre telephone : il ne doit rien perdre.
    const other = await newGuest(`Miguel-${tag}`);
    await seedHistory(other.id, "autre");
    const otherBefore = await counts(other.id);

    const res = fakeRes();
    await authController.login(browserWithCookie(snap.token, { username: `Miguel-${tag}`, password: "motdepasse" }), res);
    expect(res.body.data.user.id).toBe(accountId);

    expect(await counts(accountId)).toMatchObject({
      games: 2, answers: 2, badges: 2, links: 2, tracks: 2, total_games: 2, best_streak: 3,
    });
    expect(await counts(snap.id)).toMatchObject({
      games: 0, answers: 0, badges: 0, links: 0, tracks: 0, total_games: 0, sessions: 0,
    });
    expect(await counts(other.id)).toEqual(otherBefore);

    // L'ancien jeton de l'invite ne rouvre plus rien.
    expect(await me(browserWithCookie(snap.token))).toBeNull();
  });

  it("mauvais mot de passe : rien ne bouge", async () => {
    const guest = await newGuest(`Fannou-${tag}`);
    const reg = fakeRes();
    await authController.register(browserWithCookie(guest.token, { username: `Fannou-${tag}`, password: "motdepasse" }), reg);

    const intrus = await newGuest(`Intrus-${tag}`);
    await seedHistory(intrus.id, "intrus");
    const before = await counts(intrus.id);

    const res = fakeRes();
    await authController.login(browserWithCookie(intrus.token, { username: `Fannou-${tag}`, password: "pas-le-bon" }), res);

    expect(res.statusCode).toBe(401);
    expect(await counts(intrus.id)).toEqual(before);
  });
});
