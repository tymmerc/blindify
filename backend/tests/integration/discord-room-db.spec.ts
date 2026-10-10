/**
 * Salle par salon Discord contre une VRAIE base Postgres (la base jetable de
 * `npm run test:db`, voir tests/testDatabase.ts).
 *
 * Ce que seule la vraie base peut prouver : la migration 006 s'applique sur le
 * schema de la prod et se rejoue sans erreur ; deux joueurs qui lancent
 * l'Activite au meme instant obtiennent la MEME salle (verrou consultatif et
 * index unique) ; un identifiant trop long est refuse par la base elle-meme.
 */
import crypto from "crypto";

import { pool } from "../../src/config/db";
import { ensureDiscordSchema, resolveDiscordRoom } from "../../src/services/discordRooms";
import { resolveTestDatabaseUrl } from "../testDatabase";

// Cette suite ecrit de vraies lignes : sans base de test jetable, elle s'arrete ici.
resolveTestDatabaseUrl(process.env.TEST_DATABASE_URL);

const seededUsers: number[] = [];
const instances: string[] = [];

async function seedPlayer(name: string): Promise<{ id: number }> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO users (provider, provider_id, username) VALUES ('discord', $1, $2) RETURNING id`,
    [crypto.randomBytes(8).readBigUInt64BE().toString().slice(0, 18).padStart(18, "1"), `${name}_${crypto.randomUUID().slice(0, 8)}`],
  );
  seededUsers.push(rows[0].id);
  return { id: rows[0].id };
}

function newInstance(): string {
  const id = `i-${crypto.randomUUID()}`;
  instances.push(id);
  return id;
}

beforeAll(async () => {
  await ensureDiscordSchema();
  // Rejouable : un second passage ne doit rien casser.
  await ensureDiscordSchema();
});

afterAll(async () => {
  if (instances.length) {
    await pool.query(`DELETE FROM multiplayer_rooms WHERE discord_instance_id = ANY($1::text[])`, [instances]);
  }
  if (seededUsers.length) {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::int[])`, [seededUsers]);
  }
  await pool.end();
});

describe("migration 006", () => {
  it("ajoute la colonne, la borne et l'index unique partiel", async () => {
    const { rows: cols } = await pool.query(
      `SELECT data_type FROM information_schema.columns WHERE table_name = 'multiplayer_rooms' AND column_name = 'discord_instance_id'`,
    );
    expect(cols).toEqual([{ data_type: "text" }]);
    const { rows: idx } = await pool.query(
      `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_multiplayer_rooms_discord_instance'`,
    );
    expect(idx).toHaveLength(1);
    expect(idx[0].indexdef).toMatch(/UNIQUE/);
    expect(idx[0].indexdef).toMatch(/discord_instance_id IS NOT NULL/);
  });
});

describe("resolveDiscordRoom", () => {
  it("le premier cree la salle, le second la retrouve", async () => {
    const [hote, ami] = await Promise.all([seedPlayer("hote"), seedPlayer("ami")]);
    const instance = newInstance();

    const first = await resolveDiscordRoom(instance, hote, "Hote");
    const second = await resolveDiscordRoom(instance, ami, "Ami");

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.room.id).toBe(first.room.id);
    expect(first.room).toMatchObject({ host_user_id: hote.id, mode: "friends", status: "waiting", discord_instance_id: instance });
    expect(first.room.room_code).toMatch(/^[A-Z0-9]{6}$/);

    const { rows: hosts } = await pool.query(
      `SELECT user_id, is_ready, nickname FROM room_participants WHERE room_id=$1 ORDER BY user_id`,
      [first.room.id],
    );
    // Seul l'hote est inscrit ici : les autres entrent par le join habituel.
    expect(hosts).toEqual([{ user_id: hote.id, is_ready: true, nickname: "Hote" }]);
  });

  it("six joueurs qui lancent l'Activite au meme instant : une seule salle", async () => {
    const players = await Promise.all(["a", "b", "c", "d", "e", "f"].map(seedPlayer));
    const instance = newInstance();

    const results = await Promise.all(players.map(p => resolveDiscordRoom(instance, p, null)));

    const ids = new Set(results.map(r => r.room.id));
    expect(ids.size).toBe(1);
    expect(results.filter(r => r.created)).toHaveLength(1);
    const { rows } = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::INT AS n FROM multiplayer_rooms WHERE discord_instance_id=$1`,
      [instance],
    );
    expect(rows[0].n).toBe(1);
  });

  it("deux salons differents : deux salles", async () => {
    const hote = await seedPlayer("hote2");
    const a = await resolveDiscordRoom(newInstance(), hote, null);
    const b = await resolveDiscordRoom(newInstance(), hote, null);

    expect(a.room.id).not.toBe(b.room.id);
  });

  it("la base refuse elle-meme un identifiant au-dela de 128 caracteres", async () => {
    const hote = await seedPlayer("hote3");
    // Le controleur refuse avant ; la contrainte est le filet si un autre chemin ecrit.
    await expect(resolveDiscordRoom("x".repeat(129), hote, null)).rejects.toMatchObject({ code: "23514" });
  });
});
