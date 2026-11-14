/**
 * T39 : photo de profil, contre une vraie base de test.
 *
 * Ce qui est verifie :
 * - envoyer une photo la range en base (WebP 256 px) et la met en avatar ;
 * - elle se sert par son adresse, non indexee, et une nouvelle photo change
 *   l'adresse (l'ancienne ne sert plus rien) ;
 * - un fichier qui n'est pas une image est refuse, rien n'est ecrit ;
 * - retirer la photo vide l'avatar ;
 * - un invite qui cree son compte la garde, un compte qui se connecte depuis
 *   un invite la reprend s'il n'en a pas, garde la sienne sinon ;
 * - supprimer son compte supprime la photo (RGPD) ;
 * - l'avatar Discord n'ecrase pas une photo mise sur Blindz.
 *
 * Base : TEST_DATABASE_URL (voir tests/testDatabase.ts), jamais la prod.
 */
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import type { Request, Response } from "express";
import sharp from "sharp";
import { pool } from "../../src/config/db";
import { authController } from "../../src/controllers/authController";
import { photosController } from "../../src/routes/photos";
import { ensureUserPhotosSchema } from "../../src/services/userPhotos";
import { upsertDiscordUser } from "../../src/services/discordAccounts";

const created: number[] = [];
let tag = "";

interface Body {
  data: { avatar?: string | null; user: { id: number; avatar: string | null } };
}
type FakeRes = Response & { body: Body; raw?: Buffer; headers: Record<string, string>; cookies: Record<string, string> };

function fakeRes(): FakeRes {
  const state = { cookies: {} as Record<string, string>, headers: {} as Record<string, string>, statusCode: 200 };
  const res = state as unknown as FakeRes;
  Object.assign(res, {
    status: (code: number) => { res.statusCode = code; return res; },
    json: (body: Body) => { res.body = body; return res; },
    cookie: (name: string, value: string) => { res.cookies[name] = value; return res; },
    clearCookie: () => res,
    setHeader: (name: string, value: string) => { res.headers[name.toLowerCase()] = value; return res; },
    end: (data: Buffer) => { res.raw = data; return res; },
  });
  return res;
}

function browser(token: string, body: unknown = {}, params: Record<string, string> = {}): Request {
  return { body, params, headers: { cookie: `blindify_session_token=${token}` }, session: {} } as unknown as Request;
}

async function newGuest(nickname: string): Promise<{ id: number; token: string }> {
  const res = fakeRes();
  await authController.guest({ body: { nickname }, headers: {}, session: {} } as unknown as Request, res);
  const id = res.body.data.user.id as number;
  created.push(id);
  return { id, token: res.cookies.blindify_session_token };
}

const photo = (color: { r: number; g: number; b: number }) =>
  sharp({ create: { width: 900, height: 600, channels: 3, background: color } }).jpeg().toBuffer();

async function upload(token: string, data: Buffer): Promise<FakeRes> {
  const res = fakeRes();
  await photosController.upload(browser(token, data), res);
  return res;
}

async function serve(avatar: string): Promise<FakeRes> {
  const res = fakeRes();
  await photosController.serve(browser("", {}, { file: avatar.split("/").pop() ?? "" }), res);
  return res;
}

async function avatarOf(userId: number): Promise<string | null> {
  const { rows } = await pool.query(`SELECT avatar FROM users WHERE id=$1`, [userId]);
  return rows[0]?.avatar ?? null;
}

async function photoCount(userId: number): Promise<number> {
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM user_photos WHERE user_id=$1`, [userId]);
  return rows[0].n;
}

beforeAll(async () => {
  await ensureUserPhotosSchema();
});

beforeEach(() => {
  tag = Math.random().toString(36).slice(2, 8);
});

afterAll(async () => {
  if (created.length) await pool.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [created]);
  await pool.query(`DELETE FROM users WHERE provider='discord' AND provider_id LIKE '39%'`);
  await pool.end();
});

describe("T39 : envoyer, servir, changer, retirer", () => {
  it("la photo devient l'avatar, se sert en WebP 256 px, non indexee", async () => {
    const guest = await newGuest(`Lila-${tag}`);
    const res = await upload(guest.token, await photo({ r: 200, g: 80, b: 50 }));

    expect(res.statusCode).toBe(201);
    const avatar = res.body.data.avatar as string;
    expect(avatar).toMatch(/^\/api\/photos\/[0-9a-f-]{36}\.webp$/);
    expect(await avatarOf(guest.id)).toBe(avatar);

    const served = await serve(avatar);
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toBe("image/webp");
    expect(served.headers["x-robots-tag"]).toContain("noindex");
    const meta = await sharp(served.raw as Buffer).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 256, 256]);
  });

  it("une nouvelle photo change l'adresse, l'ancienne ne sert plus", async () => {
    const guest = await newGuest(`Noé-${tag}`);
    const first = (await upload(guest.token, await photo({ r: 10, g: 120, b: 90 }))).body.data.avatar as string;
    const second = (await upload(guest.token, await photo({ r: 240, g: 200, b: 40 }))).body.data.avatar as string;

    expect(second).not.toBe(first);
    expect(await photoCount(guest.id)).toBe(1);
    expect((await serve(first)).statusCode).toBe(404);
    expect((await serve(second)).statusCode).toBe(200);
  });

  it("un fichier qui n'est pas une image est refuse et rien n'est ecrit", async () => {
    const guest = await newGuest(`Sam-${tag}`);
    const res = await upload(guest.token, Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"));
    expect(res.statusCode).toBe(415);
    expect(await photoCount(guest.id)).toBe(0);
    expect(await avatarOf(guest.id)).toBeNull();
  });

  it("sans session : 401, rien n'est ecrit", async () => {
    const res = await upload("jeton-inconnu", await photo({ r: 1, g: 2, b: 3 }));
    expect(res.statusCode).toBe(401);
  });

  it("retirer la photo vide l'avatar", async () => {
    const guest = await newGuest(`Ines-${tag}`);
    const avatar = (await upload(guest.token, await photo({ r: 90, g: 90, b: 200 }))).body.data.avatar as string;

    const res = fakeRes();
    await photosController.remove(browser(guest.token), res);
    expect(res.statusCode).toBe(200);
    expect(await avatarOf(guest.id)).toBeNull();
    expect((await serve(avatar)).statusCode).toBe(404);
  });

  it("une adresse mal formee ne touche pas la base", async () => {
    expect((await serve("/api/photos/../../etc/passwd")).statusCode).toBe(404);
    expect((await serve("/api/photos/pas-un-uuid.webp")).statusCode).toBe(404);
  });
});

describe("T39 : la photo suit le compte (T26)", () => {
  it("un invite qui cree son compte garde sa photo", async () => {
    const guest = await newGuest(`Zoé-${tag}`);
    const avatar = (await upload(guest.token, await photo({ r: 30, g: 30, b: 30 }))).body.data.avatar as string;

    const reg = fakeRes();
    await authController.register(browser(guest.token, { username: `Zoé-${tag}`, password: "motdepasse" }), reg);
    expect(reg.body.data.user.id).toBe(guest.id);
    expect(reg.body.data.user.avatar).toBe(avatar);
  });

  it("un compte sans photo reprend celle de l'invite qui se connecte", async () => {
    const accountGuest = await newGuest(`Tom-${tag}`);
    const reg = fakeRes();
    await authController.register(browser(accountGuest.token, { username: `Tom-${tag}`, password: "motdepasse" }), reg);
    const accountId = reg.body.data.user.id as number;

    const snap = await newGuest(`Tom-${tag}`);
    const avatar = (await upload(snap.token, await photo({ r: 120, g: 60, b: 160 }))).body.data.avatar as string;

    const login = fakeRes();
    await authController.login(browser(snap.token, { username: `Tom-${tag}`, password: "motdepasse" }), login);
    expect(login.body.data.user.id).toBe(accountId);
    expect(await avatarOf(accountId)).toBe(avatar);
    expect(await photoCount(accountId)).toBe(1);
    expect(await avatarOf(snap.id)).toBeNull();
    expect((await serve(avatar)).statusCode).toBe(200);
  });

  it("un compte qui a deja sa photo la garde", async () => {
    const accountGuest = await newGuest(`Eva-${tag}`);
    const mine = (await upload(accountGuest.token, await photo({ r: 0, g: 0, b: 200 }))).body.data.avatar as string;
    const reg = fakeRes();
    await authController.register(browser(accountGuest.token, { username: `Eva-${tag}`, password: "motdepasse" }), reg);
    const accountId = reg.body.data.user.id as number;

    const snap = await newGuest(`Eva-${tag}`);
    await upload(snap.token, await photo({ r: 200, g: 0, b: 0 }));

    const login = fakeRes();
    await authController.login(browser(snap.token, { username: `Eva-${tag}`, password: "motdepasse" }), login);
    expect(await avatarOf(accountId)).toBe(mine);
  });

  it("supprimer son compte supprime sa photo", async () => {
    const guest = await newGuest(`Max-${tag}`);
    const avatar = (await upload(guest.token, await photo({ r: 50, g: 150, b: 50 }))).body.data.avatar as string;

    const res = fakeRes();
    await authController.deleteAccount(browser(guest.token), res);
    expect(res.statusCode).toBe(200);
    expect(await photoCount(guest.id)).toBe(0);
    expect((await serve(avatar)).statusCode).toBe(404);
  });
});

describe("T39 : Activite Discord", () => {
  it("l'avatar Discord sert par defaut, sans ecraser une photo mise sur Blindz", async () => {
    const discordId = `39${Date.now()}`;
    const first = await upsertDiscordUser({ id: discordId, username: "lou", globalName: null, avatar: "a1b2c3" });
    expect(first.avatar).toContain("cdn.discordapp.com");

    const photoAvatar = "/api/photos/0f8fad5b-d9cb-469f-a165-70867728950e.webp";
    await pool.query(`UPDATE users SET avatar=$2 WHERE id=$1`, [first.id, photoAvatar]);
    const again = await upsertDiscordUser({ id: discordId, username: "lou", globalName: null, avatar: "d4e5f6" });
    expect(again.avatar).toBe(photoAvatar);
  });
});
