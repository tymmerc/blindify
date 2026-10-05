/**
 * Retours de fin de partie (POST /api/feedback) contre une vraie base de test.
 *
 * Ce qui est verifie :
 * - la migration 004 (appliquee en prod par Tym) et ensureFeedbackSchema
 *   (appelee au demarrage, pour la pile de test et la CI) creent la meme table ;
 * - un avis et un bug arrivent en base, rattaches a leur partie quand on la
 *   connait (directement en solo, par le code de salle en multijoueur) ;
 * - les refus : corps invalide, limite d'envois par adresse ;
 * - la table manquante est recreee au premier envoi au lieu d'une erreur 500.
 *
 * Base : TEST_DATABASE_URL (voir tests/testDatabase.ts), jamais la prod.
 */
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import fs from "fs";
import path from "path";
import http from "http";
import crypto from "crypto";
import express from "express";
import type { AddressInfo } from "net";
import { resolveTestDatabaseUrl } from "../testDatabase";
import { pool } from "../../src/config/db";
import { ensureFeedbackSchema, MAX_USER_AGENT } from "../../src/services/feedback";
import { createFeedbackRouter } from "../../src/routes/feedback";

// Sans base de test jetable, la suite s'arrete ici, avant toute requete.
resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);

const MIGRATION = path.join(__dirname, "../../migrations/004_game_feedback.sql");

type TestApp = { url: string; close: () => Promise<void> };

async function startApp(maxPerWindow?: number): Promise<TestApp> {
  const app = express();
  app.use(express.json());
  app.use("/api/feedback", createFeedbackRouter(maxPerWindow));
  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/api/feedback`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

type Envelope = { success: boolean; data: unknown; error: { code: string; message: string } | null };

const readJson = async (res: Response): Promise<Envelope> => (await res.json()) as Envelope;

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

/** Colonnes, contraintes et index de game_feedback, sous une forme comparable. */
async function tableShape() {
  const { rows: columns } = await pool.query(
    `SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull,
            pg_get_expr(d.adbin, d.adrelid) AS defaut
     FROM pg_attribute a
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = 'game_feedback'::regclass AND a.attnum > 0 AND NOT a.attisdropped
     ORDER BY a.attnum`
  );
  const { rows: constraints } = await pool.query(
    `SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid = 'game_feedback'::regclass ORDER BY conname`
  );
  const { rows: indexes } = await pool.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'game_feedback' ORDER BY indexname`
  );
  return { columns, constraints, indexes };
}

async function lastFeedback() {
  const { rows } = await pool.query(`SELECT * FROM game_feedback ORDER BY id DESC LIMIT 1`);
  return rows[0];
}

const randomCode = () => crypto.randomUUID().replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase();

describe("game_feedback : schema", () => {
  it("la migration 004 et le demarrage du backend creent la meme table", async () => {
    await pool.query("DROP TABLE IF EXISTS game_feedback");
    const sql = fs.readFileSync(MIGRATION, "utf8");
    await pool.query(sql);
    await pool.query(sql); // rejouable sans erreur
    const fromMigration = await tableShape();

    await pool.query("DROP TABLE game_feedback");
    await ensureFeedbackSchema();
    await ensureFeedbackSchema(); // idempotente
    const fromBoot = await tableShape();

    expect(fromBoot).toEqual(fromMigration);
    expect(fromBoot.columns.map(c => c.attname)).toEqual([
      "id", "kind", "answer", "message", "mode", "session_id", "game_code", "user_agent", "app_version", "created_at",
    ]);
  });

  it("la base refuse elle aussi un avis sans reponse ou un bug avec reponse", async () => {
    await ensureFeedbackSchema();
    await expect(pool.query(`INSERT INTO game_feedback (kind, mode) VALUES ('avis', 'solo')`)).rejects.toThrow(/game_feedback_answer_kind/);
    await expect(pool.query(`INSERT INTO game_feedback (kind, answer, mode) VALUES ('bug', 'oui', 'solo')`)).rejects.toThrow(/game_feedback_answer_kind/);
    await expect(pool.query(`INSERT INTO game_feedback (kind, answer, mode) VALUES ('avis', 'oui', 'tele')`)).rejects.toThrow(/mode_check/);
  });
});

describe("POST /api/feedback", () => {
  let app: TestApp;
  let sessionId: number;
  let roomSessionId: number;
  let roomCode: string;

  beforeAll(async () => {
    await ensureFeedbackSchema();
    app = await startApp();
    const { rows: solo } = await pool.query<{ id: number }>(
      `INSERT INTO game_sessions (mode, state) VALUES ('solo', 'finished') RETURNING id`
    );
    sessionId = solo[0].id;
    const { rows: multi } = await pool.query<{ id: number }>(
      `INSERT INTO game_sessions (mode, state) VALUES ('friends', 'finished') RETURNING id`
    );
    roomSessionId = multi[0].id;
    roomCode = randomCode();
    await pool.query(
      `INSERT INTO multiplayer_rooms (room_code, session_id, status) VALUES ($1, $2, 'finished')`,
      [roomCode, roomSessionId]
    );
  });

  afterAll(async () => {
    await app.close();
    await pool.query(`DELETE FROM game_feedback WHERE session_id = ANY($1::int[]) OR message LIKE 'jest:%'`, [[sessionId, roomSessionId]]);
    await pool.query(`DELETE FROM multiplayer_rooms WHERE room_code = $1`, [roomCode]);
    await pool.query(`DELETE FROM game_sessions WHERE id = ANY($1::int[])`, [[sessionId, roomSessionId]]);
    await pool.end();
  });

  it("enregistre un avis solo rattache a sa partie, sans rien de personnel", async () => {
    const res = await post(app.url, { kind: "avis", answer: "oui", mode: "solo", sessionId, appVersion: "abc1234" },
      { "User-Agent": "Mozilla/5.0 (iPhone) jest" });
    expect(res.status).toBe(201);
    expect(await readJson(res)).toEqual({ success: true, data: { received: true }, error: null });
    const row = await lastFeedback();
    expect(row).toMatchObject({
      kind: "avis", answer: "oui", message: null, mode: "solo", session_id: sessionId,
      game_code: null, user_agent: "Mozilla/5.0 (iPhone) jest", app_version: "abc1234",
    });
    expect(row.created_at).toBeInstanceOf(Date);
  });

  it("retrouve la partie d'un bug multijoueur par son code de salle", async () => {
    const res = await post(app.url, { kind: "bug", mode: "friends", gameCode: roomCode.toLowerCase(), message: "jest: le son a coupé" });
    expect(res.status).toBe(201);
    expect(await lastFeedback()).toMatchObject({
      kind: "bug", answer: null, message: "jest: le son a coupé", mode: "friends", session_id: roomSessionId, game_code: roomCode,
    });
  });

  it("ne cherche pas de salle pour un defi : le code est celui du defi", async () => {
    const res = await post(app.url, { kind: "avis", answer: "pas_trop", mode: "defi", gameCode: roomCode, message: "jest: defi" });
    expect(res.status).toBe(201);
    expect(await lastFeedback()).toMatchObject({ mode: "defi", game_code: roomCode, session_id: null });
  });

  it("garde le retour quand la partie annoncee n'existe pas", async () => {
    const res = await post(app.url, { kind: "bug", mode: "solo", sessionId: 2_000_000_000, message: "jest: partie fantome" });
    expect(res.status).toBe(201);
    expect(await lastFeedback()).toMatchObject({ message: "jest: partie fantome", session_id: null });
  });

  it("tronque le navigateur a 300 caracteres", async () => {
    const res = await post(app.url, { kind: "bug", mode: "chrono", message: "jest: ua" }, { "User-Agent": "x".repeat(500) });
    expect(res.status).toBe(201);
    expect((await lastFeedback()).user_agent).toHaveLength(MAX_USER_AGENT);
  });

  it("refuse un corps invalide avec un code clair, sans rien ecrire", async () => {
    const before = await pool.query(`SELECT count(*)::int AS n FROM game_feedback`);
    const res = await post(app.url, { kind: "bug", mode: "solo", message: "a".repeat(1001) });
    expect(res.status).toBe(400);
    expect((await readJson(res)).error?.code).toBe("invalid_message");
    const after = await pool.query(`SELECT count(*)::int AS n FROM game_feedback`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("detache le retour quand la partie est supprimee (ON DELETE SET NULL)", async () => {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO game_sessions (mode, state) VALUES ('solo', 'finished') RETURNING id`
    );
    const doomed = rows[0].id;
    await post(app.url, { kind: "bug", mode: "solo", sessionId: doomed, message: "jest: partie supprimee" });
    await pool.query(`DELETE FROM game_sessions WHERE id = $1`, [doomed]);
    const { rows: kept } = await pool.query(`SELECT session_id FROM game_feedback WHERE message = 'jest: partie supprimee'`);
    expect(kept).toEqual([{ session_id: null }]);
  });

  it("recree la table au premier envoi si elle manque", async () => {
    await pool.query("DROP TABLE game_feedback");
    const res = await post(app.url, { kind: "bug", mode: "buzzer", message: "jest: table recreee" });
    expect(res.status).toBe(201);
    expect(await lastFeedback()).toMatchObject({ mode: "buzzer", message: "jest: table recreee" });
  });

  it("limite les envois par adresse (429 au-dela)", async () => {
    const limited = await startApp(2);
    try {
      const body = { kind: "bug", mode: "solo", message: "jest: rafale" };
      expect((await post(limited.url, body)).status).toBe(201);
      expect((await post(limited.url, body)).status).toBe(201);
      const third = await post(limited.url, body);
      expect(third.status).toBe(429);
      expect((await readJson(third)).error?.code).toBe("rate_limited");
    } finally {
      await limited.close();
    }
  });
});
