// T15 : la session ne lit plus les connexions de fournisseur (user_connections).
// Avant, chaque requete authentifiee chargeait la ligne du joueur, jetons OAuth
// Spotify compris, et la passait aux controleurs.
jest.mock("../../src/config/db", () => ({ pool: { query: jest.fn() } }));

import type { Request } from "express";
import { pool } from "../../src/config/db";
import { getSessionContext, getSessionContextFromToken } from "../../src/utils/session";

const mockQuery = pool.query as unknown as jest.Mock;

const USER = { id: 7, provider: "spotify", provider_id: "sp", username: "ancien", email: null, avatar: null, created_at: null };

function sqlCalls(): string[] {
  return mockQuery.mock.calls.map(call => String(call[0]));
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("FROM users")) return { rows: [USER], rowCount: 1 };
    if (sql.includes("FROM user_sessions")) {
      return { rows: [{ token: "h", user_id: USER.id, created_at: null, expires_at: null }], rowCount: 1 };
    }
    if (sql.includes("FROM user_connections")) {
      return { rows: [{ id: 1, user_id: USER.id, provider: "spotify", access_token: "jeton" }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  });
});

describe("getSessionContext", () => {
  it("ne lit pas user_connections et ne renvoie aucune connexion", async () => {
    const req = { session: { userId: USER.id, sessionToken: "brut" }, headers: {} } as unknown as Request;

    const context = await getSessionContext(req, undefined, { provider: "spotify" });

    expect(context?.user.id).toBe(USER.id);
    expect(context).not.toHaveProperty("connection");
    expect(sqlCalls().filter(sql => sql.includes("user_connections"))).toEqual([]);
  });
});

describe("getSessionContextFromToken", () => {
  it("ne lit pas user_connections et ne renvoie aucune connexion", async () => {
    const context = await getSessionContextFromToken("brut");

    expect(context?.user.id).toBe(USER.id);
    expect(context).not.toHaveProperty("connection");
    expect(sqlCalls().filter(sql => sql.includes("user_connections"))).toEqual([]);
  });
});

// T26 : le cookie d'un an prend le relais, et l'echeance ne recule jamais.
describe("T26 : session longue", () => {
  it("sans cookie de 24 h ni Bearer, le cookie blindify_session_token retrouve le joueur", async () => {
    const req = { session: {}, headers: { cookie: "autre=1; blindify_session_token=jeton-brut" } } as unknown as Request;

    const context = await getSessionContext(req);

    expect(context?.user.id).toBe(USER.id);
    expect(context?.sessionToken).toBe("jeton-brut");
    expect((req.session as { userId?: number }).userId).toBe(USER.id);
  });

  it("un jeton de cookie inconnu laisse le joueur « personne », sans planter", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM user_sessions")) return { rows: [], rowCount: 0 };
      return { rows: [USER], rowCount: 1 };
    });
    const req = { session: {}, headers: { cookie: "blindify_session_token=perime" } } as unknown as Request;

    expect(await getSessionContext(req)).toBeNull();
  });

  it("un jeton de cookie expire ne rouvre rien", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("FROM user_sessions")) {
        return { rows: [{ token: "h", user_id: USER.id, created_at: null, expires_at: new Date(Date.now() - 1000) }], rowCount: 1 };
      }
      return { rows: [USER], rowCount: 1 };
    });
    const req = { session: {}, headers: { cookie: "blindify_session_token=vieux" } } as unknown as Request;

    expect(await getSessionContext(req)).toBeNull();
  });

  it("prolonger ne raccourcit jamais : GREATEST sur expires_at", async () => {
    const req = { session: { userId: USER.id, sessionToken: "brut" }, headers: {} } as unknown as Request;

    await getSessionContext(req);

    const update = sqlCalls().find(sql => sql.includes("UPDATE user_sessions"));
    expect(update).toContain("GREATEST(expires_at, $2)");
  });
});
