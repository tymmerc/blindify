/**
 * Mail de debut de partie (T18), par le vrai lancement POST /rooms/:code/start :
 * une vraie partie a plusieurs donne un mail, une partie de Tym ou d'un outil
 * E2E n'en donne pas, et un Resend qui ne repond pas ne retarde pas le
 * lancement. Resend est remplace par un faux fetch. Necessite la base de test.
 */
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import type { Request, Response } from "express";
import {
  startTestServer,
  seedUsers,
  seedRoom,
  cleanupGame,
  cleanupUsers,
  closePool,
  pool,
  waitFor,
  type TestServer,
  type TestUser,
} from "./helpers/socket-test-harness";
import { roomsController } from "../../src/controllers/roomsController";
import { resetGameStartAnnounceForTests } from "../../src/services/gameStartAnnounce";

jest.setTimeout(30000);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const KEY_FILE = path.join(os.tmpdir(), `blindz-resend-${process.pid}.env`);
const E2E_KEY = "cle-e2e-du-test";
const ENV_NAMES = ["ALERTE_DESTINATAIRE", "ALERTE_EXPEDITEUR", "RESEND_CLE_FICHIER", "SPECTATEUR_SECRET", "E2E_BYPASS_KEY", "FRONTEND_URL"];

let server: TestServer;
let fetchSpy: jest.SpyInstance;
const mails: Array<{ subject: string; text: string }> = [];

async function seedLibrary(userId: number, count: number): Promise<void> {
  for (let i = 1; i <= count; i++) {
    const tag = `${userId}-${i}-${crypto.randomUUID().slice(0, 8)}`;
    await pool.query(
      `INSERT INTO audio_sources (user_id, provider, external_id, title, artist, album_cover, audio_url, metadata)
       VALUES ($1, 'deezer', $2, $3, $4, NULL, $5, '{}'::jsonb)`,
      [userId, `ext-${tag}`, `Titre ${tag}`, `Artiste ${tag}`, `https://cdn.example.test/preview-${tag}.mp3`],
    );
  }
}

async function callStart(code: string, hostId: number, headers: Record<string, string> = {}) {
  const res = {} as { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  const req = { params: { code }, body: { source: "library" }, query: {}, headers, session: { userId: hostId } } as unknown as Request;
  const t = Date.now();
  await roomsController.startGame(req, res as unknown as Response);
  return { status: res.status.mock.calls[0]?.[0] as number, ms: Date.now() - t };
}

async function room(prefix: string, names?: string[]): Promise<{ code: string; users: TestUser[] }> {
  const users = await seedUsers(2, prefix);
  if (names) {
    for (const [i, name] of names.entries()) {
      await pool.query(`UPDATE users SET username=$2 WHERE id=$1`, [users[i].id, name]);
    }
  }
  for (const u of users) await seedLibrary(u.id, 3);
  return { code: await seedRoom(users, "waiting"), users };
}

async function cleanupRoom(code: string, users: TestUser[]): Promise<void> {
  cleanupGame(code);
  await pool.query(`DELETE FROM game_sessions WHERE room_code = $1`, [code]);
  await pool.query(`DELETE FROM audio_sources WHERE user_id = ANY($1::int[])`, [users.map(u => u.id)]);
  await cleanupUsers(users);
}

beforeAll(async () => {
  fs.writeFileSync(KEY_FILE, "RESEND_API_KEY=re_cle_de_test_123456\n", { mode: 0o600 });
  Object.assign(process.env, {
    ALERTE_DESTINATAIRE: "tym@example.test",
    ALERTE_EXPEDITEUR: "Blindz <alerte@example.test>",
    RESEND_CLE_FICHIER: KEY_FILE,
    SPECTATEUR_SECRET: "k".repeat(48),
    E2E_BYPASS_KEY: E2E_KEY,
    FRONTEND_URL: "https://blindz.app",
  });
  resetGameStartAnnounceForTests();
  fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
    mails.push(JSON.parse(String((init as RequestInit).body)));
    return new Response("{}", { status: 200 });
  });
  server = await startTestServer();
});

afterAll(async () => {
  fetchSpy.mockRestore();
  for (const name of ENV_NAMES) delete process.env[name];
  resetGameStartAnnounceForTests();
  fs.rmSync(KEY_FILE, { force: true });
  await server.close();
  await closePool();
});

beforeEach(() => {
  mails.length = 0;
  fetchSpy.mockClear();
});

describe("mail au lancement d'une vraie partie a plusieurs", () => {
  it("2 vrais joueurs : un mail avec mode, pseudos, musique et lien spectateur", async () => {
    const { code, users } = await room("Ami");
    try {
      expect((await callStart(code, users[0].id)).status).toBe(200);
      await waitFor(() => mails.length === 1, 4000, "un mail");
      expect(mails[0].subject).toBe("Blindz : une partie à 2 vient de démarrer (À distance)");
      for (const u of users) expect(mails[0].text).toContain(u.username);
      expect(mails[0].text).toContain("Musique : Deezer");
      expect(mails[0].text).toContain(`https://blindz.app/spectateur/?salle=${code}&jeton=`);
      // Rien d'autre sur les joueurs : pas de titre de morceau.
      expect(mails[0].text).not.toContain("Titre ");
    } finally {
      await cleanupRoom(code, users);
    }
  });

  it("Tym dans la salle : pas de mail", async () => {
    const { code, users } = await room("Tym", ["Tym"]);
    try {
      expect((await callStart(code, users[0].id)).status).toBe(200);
      await sleep(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await cleanupRoom(code, users);
    }
  });

  it("comptes de test : pas de mail", async () => {
    const { code, users } = await room("Bot", ["e2e_hote", "Lea"]);
    try {
      expect((await callStart(code, users[0].id)).status).toBe(200);
      await sleep(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await cleanupRoom(code, users);
    }
  });

  it("lancee par un outil E2E (cle E2E) : pas de mail", async () => {
    const { code, users } = await room("Outil");
    try {
      expect((await callStart(code, users[0].id, { "x-e2e-key": E2E_KEY })).status).toBe(200);
      await sleep(400);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await cleanupRoom(code, users);
    }
  });

  it("Resend qui ne repond pas : le lancement n'attend pas", async () => {
    const { code, users } = await room("Lent");
    let release: () => void = () => {};
    fetchSpy.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve(new Response("{}", { status: 200 })); }));
    try {
      const { status, ms } = await callStart(code, users[0].id);
      expect(status).toBe(200);
      expect(ms).toBeLessThan(5000);
      await waitFor(() => fetchSpy.mock.calls.length === 1, 4000, "envoi parti");
    } finally {
      release();
      await cleanupRoom(code, users);
    }
  });
});
