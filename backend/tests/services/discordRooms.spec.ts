// Un salon Discord egale une salle Blindz : la cle est l'instanceId du SDK.
// Le premier qui lance l'Activite cree la salle, les suivants la retrouvent.
// Base remplacee par un faux : on verifie l'ordre des requetes et le verrou.
jest.mock("../../src/config/db", () => ({
  pool: { connect: jest.fn(), query: jest.fn() },
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { pool } from "../../src/config/db";
import { isValidInstanceId, resolveDiscordRoom } from "../../src/services/discordRooms";

const mockConnect = pool.connect as jest.Mock;

const INSTANCE = "i-4f2a9c1e3b7d";
const HOST = { id: 7 };
const ROOM = { id: 41, room_code: "ABC123", host_user_id: 7, status: "waiting", mode: "friends", discord_instance_id: INSTANCE };

function fakeClient(onQuery: (sql: string, params?: unknown[]) => { rows: unknown[] } | Error) {
  const client = {
    query: jest.fn(async (sql: string, params?: unknown[]) => {
      const out = onQuery(sql, params);
      if (out instanceof Error) throw out;
      return { ...out, rowCount: out.rows.length };
    }),
    release: jest.fn(),
  };
  mockConnect.mockResolvedValue(client);
  return client;
}

const sqlOf = (client: { query: jest.Mock }) => client.query.mock.calls.map(c => String(c[0]).replace(/\s+/g, " ").trim());

beforeEach(() => {
  jest.clearAllMocks();
});

describe("isValidInstanceId", () => {
  it("accepte un identifiant d'instance du SDK (lettres, chiffres, - _ . :), 128 caracteres au plus", () => {
    expect(isValidInstanceId("i-4f2a9c1e3b7d")).toBe(true);
    expect(isValidInstanceId("123456789012345678")).toBe(true);
    // Forme observee : i-<19 chiffres>-gc-<19 chiffres>-<19 chiffres>, soit 64 caracteres.
    expect(isValidInstanceId("i-1234567890123456789-gc-1234567890123456789-1234567890123456789")).toBe(true);
    expect(isValidInstanceId("a".repeat(128))).toBe(true);
  });

  it("refuse le reste : vide, trop long, espaces, balises, autre type", () => {
    expect(isValidInstanceId("")).toBe(false);
    expect(isValidInstanceId("a".repeat(129))).toBe(false);
    expect(isValidInstanceId("abc def")).toBe(false);
    expect(isValidInstanceId("<b>")).toBe(false);
    expect(isValidInstanceId(null)).toBe(false);
    expect(isValidInstanceId(12)).toBe(false);
  });
});

describe("resolveDiscordRoom", () => {
  it("retrouve la salle deja ouverte pour ce salon : rien n'est cree", async () => {
    const client = fakeClient(sql => (/SELECT .*FROM multiplayer_rooms/is.test(sql) ? { rows: [ROOM] } : { rows: [] }));

    const result = await resolveDiscordRoom(INSTANCE, HOST, null);

    expect(result).toEqual({ room: ROOM, created: false });
    const sql = sqlOf(client);
    expect(sql[0]).toBe("BEGIN");
    // Verrou consultatif par instance, dans la transaction : deux joueurs qui
    // lancent l'Activite en meme temps passent l'un apres l'autre.
    expect(sql[1]).toMatch(/pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
    expect(client.query.mock.calls[1][1]).toEqual([INSTANCE]);
    expect(sql.some(s => /INSERT INTO multiplayer_rooms/i.test(s))).toBe(false);
    expect(sql[sql.length - 1]).toBe("COMMIT");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("premier arrive : cree la salle (mode a distance) liee a l'instance, l'hote en participant", async () => {
    const client = fakeClient(sql => {
      if (/INSERT INTO multiplayer_rooms/i.test(sql)) return { rows: [ROOM] };
      return { rows: [] };
    });

    const result = await resolveDiscordRoom(INSTANCE, HOST, "Tym");

    expect(result).toEqual({ room: ROOM, created: true });
    const insertRoom = client.query.mock.calls.find(c => /INSERT INTO multiplayer_rooms/i.test(String(c[0])));
    expect(insertRoom).toBeDefined();
    const [roomSql, roomParams] = insertRoom as [string, unknown[]];
    expect(roomSql).toMatch(/discord_instance_id/);
    expect(roomSql).toMatch(/'waiting'/);
    expect(roomParams).toEqual(expect.arrayContaining([INSTANCE, HOST.id, "friends"]));
    // Le code de salle a la forme habituelle : il reste utilisable par les outils existants.
    expect(roomParams.find(p => typeof p === "string" && /^[A-Z0-9]{6}$/.test(p))).toBeDefined();

    const insertHost = client.query.mock.calls.find(c => /INSERT INTO room_participants/i.test(String(c[0])));
    expect(insertHost).toBeDefined();
    expect((insertHost as [string, unknown[]])[1]).toEqual([ROOM.id, HOST.id, "Tym"]);

    const sql = sqlOf(client);
    expect(sql[sql.length - 1]).toBe("COMMIT");
  });

  it("une erreur en cours de route : ROLLBACK, connexion rendue, erreur remontee", async () => {
    const boom = new Error("disque plein");
    const client = fakeClient(sql => (/INSERT INTO multiplayer_rooms/i.test(sql) ? boom : { rows: [] }));

    await expect(resolveDiscordRoom(INSTANCE, HOST, null)).rejects.toBe(boom);

    expect(sqlOf(client)).toContain("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
