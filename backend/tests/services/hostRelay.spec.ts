// Relais de l'hote dans un salon Discord (decision de Tym du 10/10/2026) :
// quand l'hote part, le plus ancien joueur encore present devient hote et peut
// lancer, sans que personne relance l'Activite. Base remplacee par un faux.
jest.mock("../../src/config/db", () => ({
  pool: { query: jest.fn() },
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { pool } from "../../src/config/db";
import { relayDiscordHost } from "../../src/services/hostRelay";

const mockQuery = pool.query as jest.Mock;

const DISCORD_ROOM = { id: 41, host_user_id: 1, status: "waiting", discord_instance_id: "i-1" };

/** Enchaine les reponses : la salle, puis le candidat, puis l'UPDATE. */
function db(room: unknown, candidate: number | null = null, updated = 1) {
  mockQuery
    .mockResolvedValueOnce({ rows: room ? [room] : [], rowCount: room ? 1 : 0 })
    .mockResolvedValueOnce({ rows: candidate === null ? [] : [{ user_id: candidate }], rowCount: candidate === null ? 0 : 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: updated });
}
const sql = () => mockQuery.mock.calls.map(c => String(c[0]).replace(/\s+/g, " "));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
});

describe("relayDiscordHost", () => {
  it("l'hote part du lobby : le plus ancien present devient hote", async () => {
    db(DISCORD_ROOM, 2);

    const result = await relayDiscordHost("ABC123", 1, [3, 2]);

    expect(result).toEqual({ relayed: true, from: 1, to: 2 });
    const candidate = mockQuery.mock.calls[1];
    expect(String(candidate[0])).toMatch(/ORDER BY joined_at ASC/);
    expect(candidate[1]).toEqual([41, [3, 2]]);
    const update = mockQuery.mock.calls[2];
    expect(String(update[0])).toMatch(/UPDATE multiplayer_rooms SET host_user_id/);
    // Garde : l'hote n'a pas change entre-temps.
    expect(update[1]).toEqual([2, 41, 1]);
  });

  it("salle du site (pas de salon Discord) : rien ne bouge", async () => {
    db({ ...DISCORD_ROOM, discord_instance_id: null }, 2);
    expect(await relayDiscordHost("ABC123", 1, [2])).toEqual({ relayed: false, reason: "not_discord" });
    expect(sql().some(s => /UPDATE/.test(s))).toBe(false);
  });

  it("celui qui part n'est pas l'hote : rien ne bouge", async () => {
    db(DISCORD_ROOM, 2);
    expect(await relayDiscordHost("ABC123", 7, [2])).toEqual({ relayed: false, reason: "not_host" });
    expect(sql().some(s => /UPDATE/.test(s))).toBe(false);
  });

  it("en pleine partie : meme comportement que le site, pas de relais", async () => {
    db({ ...DISCORD_ROOM, status: "in_progress" }, 2);
    expect(await relayDiscordHost("ABC123", 1, [2])).toEqual({ relayed: false, reason: "in_game" });
    expect(sql().some(s => /UPDATE/.test(s))).toBe(false);
  });

  it("partie finie (podium) : relais, pour que quelqu'un puisse rejouer", async () => {
    db({ ...DISCORD_ROOM, status: "finished" }, 2);
    expect(await relayDiscordHost("ABC123", 1, [2])).toEqual({ relayed: true, from: 1, to: 2 });
  });

  it("le dernier joueur part : personne a nommer, la salle garde son hote", async () => {
    db(DISCORD_ROOM);
    expect(await relayDiscordHost("ABC123", 1, [])).toEqual({ relayed: false, reason: "nobody" });
    expect(sql().some(s => /UPDATE/.test(s))).toBe(false);
  });

  it("personne de present mais un arrivant en secours : c'est lui", async () => {
    db(DISCORD_ROOM, null);
    expect(await relayDiscordHost("ABC123", 1, [], 9)).toEqual({ relayed: true, from: 1, to: 9 });
    expect(mockQuery.mock.calls[2][1]).toEqual([9, 41, 1]);
  });

  it("l'hote a change entre la lecture et l'ecriture : pas de relais", async () => {
    db(DISCORD_ROOM, 2, 0);
    expect(await relayDiscordHost("ABC123", 1, [2])).toEqual({ relayed: false, reason: "not_host" });
  });

  it("salle introuvable : not_found, sans erreur", async () => {
    db(null);
    expect(await relayDiscordHost("ZZZZZZ", 1, [2])).toEqual({ relayed: false, reason: "not_found" });
  });
});
