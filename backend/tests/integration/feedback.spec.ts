/**
 * Retours de fin de partie (POST /api/feedback) contre une vraie base de test.
 *
 * Ce qui est verifie :
 * - la migration 004 (appliquee en prod par Tym) et ensureFeedbackSchema
 *   (appelee au demarrage, pour la pile de test et la CI) creent la meme table ;
 * - un avis et un bug arrivent en base, rattaches a leur partie quand on la
 *   connait (directement en solo, par le code de salle en multijoueur) ;
 * - en multijoueur, la partie vient toujours de la salle, jamais d'un
 *   identifiant envoye par le client ;
 * - les refus : corps invalide, limite d'envois par adresse (une IPv6 compte
 *   pour son /64), plafond commun a toutes les adresses ;
 * - la purge du janitor efface les retours de plus de 12 mois, pas les autres ;
 * - la table manquante est recreee au premier envoi au lieu d'une erreur 500.
 *
 * Base : TEST_DATABASE_URL (voir tests/testDatabase.ts), jamais la prod.
 */
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
// Le mail a Tym est teste a part (services/feedbackNotifier.spec.ts) : ici on
// verifie seulement quand la route le demande.
jest.mock("../../src/services/feedbackNotifier", () => ({ notifyWrittenFeedback: jest.fn() }));

import fs from "fs";
import path from "path";
import http from "http";
import crypto from "crypto";
import express from "express";
import type { AddressInfo } from "net";
import { resolveTestDatabaseUrl } from "../testDatabase";
import { pool } from "../../src/config/db";
import { CONTACT_PURGE_SQL, ensureFeedbackSchema, FEEDBACK_PURGE_SQL, MAX_USER_AGENT } from "../../src/services/feedback";
import { notifyWrittenFeedback } from "../../src/services/feedbackNotifier";
import { logger } from "../../src/utils/logger";
import { createFeedbackRouter, type FeedbackLimits } from "../../src/routes/feedback";

// Sans base de test jetable, la suite s'arrete ici, avant toute requete.
resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);

const MIGRATION = path.join(__dirname, "../../migrations/004_game_feedback.sql");
const MIGRATION_007 = path.join(__dirname, "../../migrations/007_feedback_contact.sql");

type TestApp = { url: string; close: () => Promise<void> };

async function startApp(limits?: FeedbackLimits): Promise<TestApp> {
  const app = express();
  // Comme en prod (index.ts) : un seul proxy devant, nginx. L'adresse du
  // client est alors la derniere de X-Forwarded-For, ce qui permet aux tests
  // de jouer plusieurs adresses depuis 127.0.0.1.
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/feedback", createFeedbackRouter(limits));
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

afterAll(async () => {
  await pool.end();
});

const randomCode = () => crypto.randomUUID().replace(/[^A-Z0-9]/gi, "").slice(0, 6).toUpperCase();

describe("game_feedback : schema", () => {
  it("les migrations 004 puis 007 et le demarrage du backend creent la meme table", async () => {
    await pool.query("DROP TABLE IF EXISTS game_feedback");
    const sql = fs.readFileSync(MIGRATION, "utf8");
    await pool.query(sql);
    await pool.query(sql); // rejouable sans erreur
    const sql007 = fs.readFileSync(MIGRATION_007, "utf8");
    await pool.query(sql007);
    await pool.query(sql007); // rejouable sans erreur
    const fromMigration = await tableShape();

    await pool.query("DROP TABLE game_feedback");
    await ensureFeedbackSchema();
    await ensureFeedbackSchema(); // idempotente
    const fromBoot = await tableShape();

    expect(fromBoot).toEqual(fromMigration);
    expect(fromBoot.columns.map(c => c.attname)).toEqual([
      "id", "kind", "answer", "message", "mode", "session_id", "game_code", "user_agent", "app_version", "created_at", "contact",
    ]);
  });

  it("la 007 s'applique sur une table de prod deja remplie, sans rien perdre", async () => {
    await pool.query("DROP TABLE IF EXISTS game_feedback");
    await pool.query(fs.readFileSync(MIGRATION, "utf8"));
    await pool.query(`INSERT INTO game_feedback (kind, answer, mode) VALUES ('avis', 'oui', 'solo')`);
    await pool.query(`INSERT INTO game_feedback (kind, mode, message) VALUES ('bug', 'event', 'jest: avant 007')`);
    await ensureFeedbackSchema();
    const { rows } = await pool.query(`SELECT kind, answer, message, contact FROM game_feedback ORDER BY id`);
    expect(rows).toEqual([
      { kind: "avis", answer: "oui", message: null, contact: null },
      { kind: "bug", answer: null, message: "jest: avant 007", contact: null },
    ]);
    await pool.query(`DELETE FROM game_feedback`);
  });

  it("la base accepte un mot avec contact et borne le contact a 120 caracteres", async () => {
    await ensureFeedbackSchema();
    await pool.query(`INSERT INTO game_feedback (kind, mode, message, contact) VALUES ('mot', 'site', 'jest: base', '@moi')`);
    await expect(
      pool.query(`INSERT INTO game_feedback (kind, mode, message, contact) VALUES ('mot', 'solo', 'jest: base', $1)`, ["a".repeat(121)])
    ).rejects.toThrow(/game_feedback_contact_check/);
    await expect(pool.query(`INSERT INTO game_feedback (kind, answer, mode) VALUES ('mot', 'oui', 'solo')`)).rejects.toThrow(/game_feedback_answer_kind/);
    await pool.query(`DELETE FROM game_feedback WHERE message = 'jest: base'`);
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
  });

  it("enregistre un avis solo rattache a sa partie, sans rien de personnel", async () => {
    const res = await post(app.url, { kind: "avis", answer: "oui", mode: "solo", sessionId, appVersion: "abc1234" },
      { "User-Agent": "Mozilla/5.0 (iPhone) jest" });
    expect(res.status).toBe(201);
    const body = await readJson(res);
    expect(body).toMatchObject({ success: true, data: { received: true }, error: null });
    expect((body.data as { followUp?: string }).followUp).toMatch(/^\d+\.[A-Za-z0-9_-]{43}$/);
    const row = await lastFeedback();
    expect(row).toMatchObject({
      kind: "avis", answer: "oui", message: null, mode: "solo", session_id: sessionId,
      game_code: null, user_agent: "Mozilla/5.0 (iPhone) jest", app_version: "abc1234",
    });
    expect(row.created_at).toBeInstanceOf(Date);
  });

  describe("un mot apres Oui ou Pas trop (POST /suite, T32)", () => {
    // Sa propre appli : ses envois ne comptent pas dans la limite par adresse
    // des autres tests.
    let own: TestApp;
    beforeAll(async () => { own = await startApp(); });
    afterAll(async () => { await own.close(); });
    const suiteUrl = () => `${own.url}/suite`;

    async function giveAnswer(answer: "oui" | "pas_trop"): Promise<string> {
      const res = await post(own.url, { kind: "avis", answer, mode: "friends", gameCode: roomCode });
      expect(res.status).toBe(201);
      return ((await readJson(res)).data as { followUp: string }).followUp;
    }

    it("ajoute le texte a la meme ligne, sans en creer une autre, et previent Tym", async () => {
      const token = await giveAnswer("pas_trop");
      const before = await lastFeedback();
      (notifyWrittenFeedback as jest.Mock).mockClear();
      const res = await post(suiteUrl(), { token, message: "  jest: le son a coupe\r\n " });
      expect(res.status).toBe(200);
      const after = await lastFeedback();
      expect(after.id).toBe(before.id);
      expect(after).toMatchObject({ kind: "avis", answer: "pas_trop", message: "jest: le son a coupe", contact: null, session_id: roomSessionId });
      expect(notifyWrittenFeedback).toHaveBeenLastCalledWith(
        { kind: "avis", mode: "friends", message: "jest: le son a coupe", contact: null, answer: "pas_trop" }, false
      );
      expect(JSON.stringify((logger.info as jest.Mock).mock.calls)).not.toContain("le son a coupe");
    });

    it("ne remplace jamais un premier texte", async () => {
      const token = await giveAnswer("oui");
      expect((await post(suiteUrl(), { token, message: "jest: premier" })).status).toBe(200);
      const res = await post(suiteUrl(), { token, message: "jest: second" });
      expect(res.status).toBe(409);
      expect((await lastFeedback()).message).toBe("jest: premier");
    });

    it("refuse un jeton forge, un jeton d'un autre avis ou un avis trop ancien", async () => {
      const token = await giveAnswer("oui");
      const [id, sig] = token.split(".");
      expect((await post(suiteUrl(), { token: `${Number(id) - 1}.${sig}`, message: "jest: x" })).status).toBe(400);
      expect((await post(suiteUrl(), { token: `${id}.${"A".repeat(43)}`, message: "jest: x" })).status).toBe(400);
      expect((await post(suiteUrl(), { token: id, message: "jest: x" })).status).toBe(400);
      await pool.query(`UPDATE game_feedback SET created_at = NOW() - INTERVAL '2 hours' WHERE id = $1`, [Number(id)]);
      expect((await post(suiteUrl(), { token, message: "jest: trop tard" })).status).toBe(409);
      const { rows } = await pool.query(`SELECT message FROM game_feedback WHERE id = $1`, [Number(id)]);
      expect(rows[0].message).toBeNull();
    });

    it("refuse un texte vide ou trop long, sans rien ecrire", async () => {
      const token = await giveAnswer("oui");
      expect((await post(suiteUrl(), { token, message: "   " })).status).toBe(400);
      expect((await post(suiteUrl(), { token, message: "x".repeat(1001) })).status).toBe(400);
      expect((await lastFeedback()).message).toBeNull();
    });

    it("ne rend pas de jeton pour un bug, un mot ou un avis deja ecrit", async () => {
      for (const body of [
        { kind: "bug", mode: "solo", message: "jest: bug" },
        { kind: "mot", mode: "solo", message: "jest: mot" },
        { kind: "avis", answer: "oui", mode: "solo", message: "jest: deja ecrit" },
      ]) {
        const data = (await readJson(await post(own.url, body))).data as { followUp?: string };
        expect(data.followUp).toBeUndefined();
      }
    });

    it("passe par la meme limite d'envois par adresse que l'avis", async () => {
      const limited = await startApp({ perAddress: 2 });
      try {
        const res = await post(limited.url, { kind: "avis", answer: "oui", mode: "friends", gameCode: roomCode });
        const token = ((await readJson(res)).data as { followUp: string }).followUp;
        expect((await post(`${limited.url}/suite`, { token, message: "jest: un" })).status).toBe(200);
        expect((await post(`${limited.url}/suite`, { token, message: "jest: deux" })).status).toBe(429);
      } finally {
        await limited.close();
      }
    });
  });

  it("enregistre un mot avec contact, previent Tym, et ne journalise ni l'un ni l'autre", async () => {
    const secret = "jest: mot 0612345678";
    const res = await post(app.url, { kind: "mot", mode: "friends", gameCode: roomCode, message: `  ${secret}  `, contact: " @prive.jest " });
    expect(res.status).toBe(201);
    expect(await lastFeedback()).toMatchObject({
      kind: "mot", answer: null, message: secret, contact: "@prive.jest", mode: "friends", session_id: roomSessionId,
    });
    expect(notifyWrittenFeedback).toHaveBeenLastCalledWith(
      { kind: "mot", mode: "friends", message: secret, contact: "@prive.jest" }, false
    );
    const logs = JSON.stringify([(logger.info as jest.Mock).mock.calls, (logger.error as jest.Mock).mock.calls]);
    expect(logs).not.toContain("0612345678");
    expect(logs).not.toContain("@prive.jest");
  });

  it("enregistre un mot sans contact depuis le pied de page (mode site)", async () => {
    const res = await post(app.url, { kind: "mot", mode: "site", message: "jest: mot du site" });
    expect(res.status).toBe(201);
    expect(await lastFeedback()).toMatchObject({ kind: "mot", mode: "site", message: "jest: mot du site", contact: null, session_id: null });
  });

  it("ne previent pas Tym pour un simple Oui / Pas trop, mais oui pour un bug decrit", async () => {
    (notifyWrittenFeedback as jest.Mock).mockClear();
    await post(app.url, { kind: "avis", answer: "pas_trop", mode: "chrono" });
    expect(notifyWrittenFeedback).not.toHaveBeenCalled();
    await post(app.url, { kind: "bug", mode: "chrono", message: "jest: bug decrit" });
    expect(notifyWrittenFeedback).toHaveBeenCalledTimes(1);
  });

  it("refuse un mot sans texte ou un contact trop long, sans rien ecrire", async () => {
    const before = await pool.query(`SELECT count(*)::int AS n FROM game_feedback`);
    expect((await post(app.url, { kind: "mot", mode: "solo", message: "   " })).status).toBe(400);
    const res = await post(app.url, { kind: "mot", mode: "solo", message: "jest: x", contact: "a".repeat(121) });
    expect(res.status).toBe(400);
    expect((await readJson(res)).error?.code).toBe("invalid_contact");
    const after = await pool.query(`SELECT count(*)::int AS n FROM game_feedback`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
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

  it("en multijoueur, ignore l'identifiant envoye par le client et prend la partie de la salle", async () => {
    const res = await post(app.url, { kind: "bug", mode: "friends", gameCode: roomCode, sessionId, message: "jest: autre partie" });
    expect(res.status).toBe(201);
    expect(await lastFeedback()).toMatchObject({ message: "jest: autre partie", session_id: roomSessionId, game_code: roomCode });

    const event = await post(app.url, { kind: "bug", mode: "event", sessionId, message: "jest: sans salle" });
    expect(event.status).toBe(201);
    expect(await lastFeedback()).toMatchObject({ message: "jest: sans salle", session_id: null });
  });

  it("ne rattache un identifiant envoye par le client qu'en solo", async () => {
    const res = await post(app.url, { kind: "bug", mode: "chrono", sessionId, message: "jest: chrono" });
    expect(res.status).toBe(201);
    expect(await lastFeedback()).toMatchObject({ message: "jest: chrono", session_id: null });
  });

  it("limite les envois par adresse (429 au-dela)", async () => {
    const limited = await startApp({ perAddress: 2 });
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

  it("compte une IPv6 pour son /64 : changer d'adresse dans le bloc ne remet pas le compteur a zero", async () => {
    const limited = await startApp({ perAddress: 2 });
    const from = (ip: string) => ({ "X-Forwarded-For": ip });
    try {
      const body = { kind: "bug", mode: "solo", message: "jest: ipv6" };
      expect((await post(limited.url, body, from("2001:db8:1:2::1"))).status).toBe(201);
      expect((await post(limited.url, body, from("2001:db8:1:2:aaaa:bbbb:cccc:dddd"))).status).toBe(201);
      expect((await post(limited.url, body, from("2001:db8:1:2::ffff"))).status).toBe(429);
      // Le /64 voisin a son propre compteur, l'IPv4 aussi.
      expect((await post(limited.url, body, from("2001:db8:1:3::1"))).status).toBe(201);
      expect((await post(limited.url, body, from("198.51.100.4"))).status).toBe(201);
    } finally {
      await limited.close();
    }
  });

  it("plafonne l'endpoint toutes adresses confondues", async () => {
    const limited = await startApp({ perAddress: 5, global: 3 });
    const body = { kind: "bug", mode: "solo", message: "jest: plafond" };
    try {
      for (const ip of ["198.51.100.1", "198.51.100.2", "2001:db8:9::1"]) {
        expect((await post(limited.url, body, { "X-Forwarded-For": ip })).status).toBe(201);
      }
      const fourth = await post(limited.url, body, { "X-Forwarded-For": "203.0.113.50" });
      expect(fourth.status).toBe(429);
      expect((await readJson(fourth)).error?.code).toBe("rate_limited");
      // Le plafond commun ne s'annonce pas : les seuls en-tetes RateLimit sont
      // ceux du compteur par adresse (5), jamais le plafond (3) ni son reste.
      expect(fourth.headers.get("ratelimit-limit")).toBe("5");
      expect(fourth.headers.get("ratelimit-remaining")).toBe("4");
      expect(fourth.headers.get("retry-after")).toBeNull();
    } finally {
      await limited.close();
    }
  });

  it("une adresse bloquee ne consomme pas le plafond commun", async () => {
    const limited = await startApp({ perAddress: 1, global: 2 });
    const body = { kind: "bug", mode: "solo", message: "jest: une adresse" };
    const same = { "X-Forwarded-For": "198.51.100.9" };
    try {
      expect((await post(limited.url, body, same)).status).toBe(201);
      for (let i = 0; i < 5; i += 1) expect((await post(limited.url, body, same)).status).toBe(429);
      expect((await post(limited.url, body, { "X-Forwarded-For": "198.51.100.10" })).status).toBe(201);
    } finally {
      await limited.close();
    }
  });
});

describe("purge des vieux retours (janitor)", () => {
  it("efface les retours de plus de 12 mois et garde les autres", async () => {
    await ensureFeedbackSchema();
    const insert = (message: string, age: string) =>
      pool.query(
        `INSERT INTO game_feedback (kind, mode, message, created_at) VALUES ('bug', 'solo', $1, NOW() - $2::interval)`,
        [message, age]
      );
    await insert("jest: purge 13 mois", "13 months");
    await insert("jest: purge 12 mois et 1 jour", "12 months 1 day");
    await insert("jest: purge 11 mois", "11 months");
    await insert("jest: purge hier", "1 day");

    await pool.query(FEEDBACK_PURGE_SQL);

    const { rows } = await pool.query<{ message: string }>(
      `SELECT message FROM game_feedback WHERE message LIKE 'jest: purge%' ORDER BY id`
    );
    expect(rows.map(r => r.message)).toEqual(["jest: purge 11 mois", "jest: purge hier"]);
    await pool.query(`DELETE FROM game_feedback WHERE message LIKE 'jest: purge%'`);
  });
});

describe("purge des contacts (janitor, T24)", () => {
  it("efface le contact apres 12 mois et garde le message", async () => {
    await ensureFeedbackSchema();
    const insert = (message: string, age: string) =>
      pool.query(
        `INSERT INTO game_feedback (kind, mode, message, contact, created_at) VALUES ('mot', 'site', $1, '@moi', NOW() - $2::interval)`,
        [message, age]
      );
    await insert("jest: contact 13 mois", "13 months");
    await insert("jest: contact 11 mois", "11 months");

    await pool.query(CONTACT_PURGE_SQL);

    const { rows } = await pool.query<{ message: string; contact: string | null }>(
      `SELECT message, contact FROM game_feedback WHERE message LIKE 'jest: contact%' ORDER BY id`
    );
    expect(rows).toEqual([
      { message: "jest: contact 13 mois", contact: null },
      { message: "jest: contact 11 mois", contact: "@moi" },
    ]);
    await pool.query(`DELETE FROM game_feedback WHERE message LIKE 'jest: contact%'`);
  });
});
