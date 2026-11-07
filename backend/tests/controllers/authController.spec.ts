import bcrypt from "bcryptjs";

jest.mock("../../src/config/db", () => ({
  pool: { query: jest.fn() },
}));
jest.mock("../../src/utils/session", () => ({
  LONG_SESSION_TTL_MS: 1000 * 60 * 60 * 24 * 365,
  SESSION_TOKEN_COOKIE: "blindify_session_token",
  createSessionToken: jest.fn(),
  revokeSessionToken: jest.fn(),
  getSessionContext: jest.fn(),
  clearSession: jest.fn(),
}));
jest.mock("../../src/utils/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { authController } from "../../src/controllers/authController";
import { pool } from "../../src/config/db";
import {
  createSessionToken,
  revokeSessionToken,
  getSessionContext,
  clearSession,
} from "../../src/utils/session";

const mockQuery = pool.query as jest.Mock;
const mockCreateSessionToken = createSessionToken as jest.Mock;
const mockRevokeSessionToken = revokeSessionToken as jest.Mock;
const mockGetSessionContext = getSessionContext as jest.Mock;
const mockClearSession = clearSession as jest.Mock;
const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
const mockConnect = jest.fn();
(pool as any).connect = mockConnect;

function mockReq(overrides: any = {}) {
  return {
    body: {},
    headers: {},
    session: {},
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("authController.register", () => {
  it("should register a new user successfully", async () => {
    const req = mockReq({ body: { username: "Alice", password: "secret123" } });
    const res = mockRes();

    // No existing user
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Insert returns new user
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          provider: "local",
          provider_id: "uuid-1",
          username: "Alice",
          email: null,
          avatar: null,
          created_at: new Date().toISOString(),
        },
      ],
    });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "sess-token-abc" });

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          user: expect.objectContaining({ username: "Alice" }),
          sessionToken: "sess-token-abc",
        }),
      })
    );
  });

  it("should reject missing username", async () => {
    const req = mockReq({ body: { password: "secret123" } });
    const res = mockRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "invalid_username" }),
      })
    );
  });

  it("should reject username shorter than 2 chars", async () => {
    const req = mockReq({ body: { username: "A", password: "secret123" } });
    const res = mockRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "invalid_username" }),
      })
    );
  });

  it("should reject missing password", async () => {
    const req = mockReq({ body: { username: "Alice" } });
    const res = mockRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "invalid_password" }),
      })
    );
  });

  it("should reject password shorter than 6 chars", async () => {
    const req = mockReq({ body: { username: "Alice", password: "abc" } });
    const res = mockRes();

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "invalid_password" }),
      })
    );
  });

  it("should return 409 if username already taken", async () => {
    const req = mockReq({ body: { username: "Alice", password: "secret123" } });
    const res = mockRes();

    mockQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] });

    await authController.register(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "username_taken" }),
      })
    );
  });

  it("should set session cookie and return user + sessionToken", async () => {
    const req = mockReq({ body: { username: "Bob", password: "password1" } });
    const res = mockRes();

    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          provider: "local",
          provider_id: "uuid-5",
          username: "Bob",
          email: null,
          avatar: null,
          created_at: new Date().toISOString(),
        },
      ],
    });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "token-xyz" });

    await authController.register(req, res);

    // T26 : session d'un an, glissante, comme pour un invite.
    expect(mockCreateSessionToken).toHaveBeenCalledWith(5, ONE_YEAR_MS);
    expect(res.cookie).toHaveBeenCalledWith(
      "blindify_session_token",
      "token-xyz",
      expect.objectContaining({ httpOnly: true, path: "/", maxAge: ONE_YEAR_MS })
    );
    expect(req.session.userId).toBe(5);
    expect(req.session.sessionToken).toBe("token-xyz");
  });
});

describe("authController.login", () => {
  it("should login with valid credentials", async () => {
    const password = "correct-password";
    const hash = await bcrypt.hash(password, 10);

    const req = mockReq({ body: { username: "Alice", password } });
    const res = mockRes();

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          provider: "local",
          provider_id: "uuid-1",
          username: "Alice",
          email: null,
          avatar: null,
          created_at: new Date().toISOString(),
          password_hash: hash,
        },
      ],
    });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "login-token" });

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          sessionToken: "login-token",
          user: expect.not.objectContaining({ password_hash: expect.anything() }),
        }),
      })
    );
  });

  it("should return 401 for non-existent user", async () => {
    const req = mockReq({ body: { username: "Ghost", password: "anything" } });
    const res = mockRes();

    mockQuery.mockResolvedValueOnce({ rows: [] });

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "invalid_credentials" }),
      })
    );
  });

  it("should return 401 for wrong password", async () => {
    const hash = await bcrypt.hash("real-password", 10);

    const req = mockReq({ body: { username: "Alice", password: "wrong-password" } });
    const res = mockRes();

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          provider: "local",
          provider_id: "uuid-1",
          username: "Alice",
          email: null,
          avatar: null,
          created_at: new Date().toISOString(),
          password_hash: hash,
        },
      ],
    });

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "invalid_credentials" }),
      })
    );
  });

  it("should return 400 for missing credentials", async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();

    await authController.login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "missing_credentials" }),
      })
    );
  });
});

describe("authController.guest", () => {
  it("should create guest user with random nickname", async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 10,
          provider: "guest",
          provider_id: "uuid-10",
          username: "Guest-abc123",
          email: null,
          avatar: null,
          created_at: new Date().toISOString(),
        },
      ],
    });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "guest-token" });

    await authController.guest(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          sessionToken: "guest-token",
          user: expect.objectContaining({ provider: "guest" }),
        }),
      })
    );
  });

  it("should create guest user with custom nickname", async () => {
    const req = mockReq({ body: { nickname: "CoolPlayer" } });
    const res = mockRes();

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 11,
          provider: "guest",
          provider_id: "uuid-11",
          username: "CoolPlayer",
          email: null,
          avatar: null,
          created_at: new Date().toISOString(),
        },
      ],
    });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "guest-token-2" });

    await authController.guest(req, res);

    // Verify the INSERT query used the custom nickname
    const insertCall = mockQuery.mock.calls[0];
    expect(insertCall[1][1]).toBe("CoolPlayer");
  });

  // La session invite dure 1 an depuis le 07/08/2026 (0d37325) : l'app se
  // souvient du joueur sans compte. Le test attendait encore 4 h.
  it("should set a one-year guest session TTL", async () => {
    const req = mockReq({ body: {} });
    const res = mockRes();

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 12,
          provider: "guest",
          provider_id: "uuid-12",
          username: "Guest-xyz",
          email: null,
          avatar: null,
          created_at: new Date().toISOString(),
        },
      ],
    });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "guest-token-3" });

    await authController.guest(req, res);

    const oneYearMs = 1000 * 60 * 60 * 24 * 365;
    expect(mockCreateSessionToken).toHaveBeenCalledWith(12, oneYearMs);
    expect(res.cookie).toHaveBeenCalledWith(
      "blindify_session_token",
      "guest-token-3",
      expect.objectContaining({ maxAge: oneYearMs })
    );
  });
});

describe("authController.me", () => {
  it("should return current user when authenticated", async () => {
    const req = mockReq();
    const res = mockRes();

    const fakeContext = {
      user: { id: 1, username: "Alice", provider: "local" },
      sessionToken: "tok",
    };
    mockGetSessionContext.mockResolvedValueOnce(fakeContext);

    await authController.me(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: { user: fakeContext.user },
      })
    );
  });

  // T15 : plus de connexion Spotify. L'ancienne reponse renvoyait la ligne
  // user_connections entiere, jetons OAuth compris, au navigateur.
  it("ne renvoie jamais de connexion ni de jeton de fournisseur", async () => {
    const req = mockReq();
    const res = mockRes();
    mockGetSessionContext.mockResolvedValueOnce({
      user: { id: 1, username: "Alice", provider: "local" },
      connection: { provider: "spotify", access_token: "jeton-acces", refresh_token: "jeton-refresh" },
      sessionToken: "tok",
    });

    await authController.me(req, res);

    const body = JSON.stringify(res.json.mock.calls[0][0]);
    expect(body).not.toContain("providerConnection");
    expect(body).not.toContain("jeton-acces");
    expect(body).not.toContain("jeton-refresh");
  });

  it("should return 401 when not authenticated", async () => {
    const req = mockReq();
    const res = mockRes();

    // getSessionContext returns null (it handles sending the 401 itself)
    mockGetSessionContext.mockResolvedValueOnce(null);

    await authController.me(req, res);

    // When context is null, the controller returns early.
    // getSessionContext itself calls fail(res, ..., 401) internally,
    // so the controller does not call ok().
    expect(res.json).not.toHaveBeenCalled();
  });
});

describe("authController.logout", () => {
  it("should revoke session token from Bearer header", async () => {
    const req = mockReq({
      headers: { authorization: "Bearer header-token-123" },
      session: {},
    });
    const res = mockRes();

    await authController.logout(req, res);

    expect(mockRevokeSessionToken).toHaveBeenCalledWith("header-token-123");
  });

  it("should revoke session token from session", async () => {
    const req = mockReq({
      headers: {},
      session: { sessionToken: "session-token-456" },
    });
    const res = mockRes();

    await authController.logout(req, res);

    expect(mockRevokeSessionToken).toHaveBeenCalledWith("session-token-456");
  });

  it("should clear session cookie", async () => {
    const req = mockReq({ headers: {}, session: {} });
    const res = mockRes();

    await authController.logout(req, res);

    // Memes options que la pose (domaine compris), sinon le navigateur le garde.
    expect(res.clearCookie).toHaveBeenCalledWith(
      "blindify_session_token",
      expect.objectContaining({ path: "/", httpOnly: true })
    );
  });

  it("should call clearSession", async () => {
    const req = mockReq({ headers: {}, session: {} });
    const res = mockRes();

    await authController.logout(req, res);

    expect(mockClearSession).toHaveBeenCalledWith(req);
  });

  it("should handle logout when already logged out", async () => {
    const req = mockReq({ headers: {}, session: {} });
    const res = mockRes();

    await authController.logout(req, res);

    // Should succeed without errors
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ success: true }),
      })
    );
  });

  it("should revoke both header and session tokens when both present", async () => {
    const req = mockReq({
      headers: { authorization: "Bearer header-tok" },
      session: { sessionToken: "session-tok" },
    });
    const res = mockRes();

    await authController.logout(req, res);

    expect(mockRevokeSessionToken).toHaveBeenCalledWith("header-tok");
    expect(mockRevokeSessionToken).toHaveBeenCalledWith("session-tok");
    expect(mockRevokeSessionToken).toHaveBeenCalledTimes(2);
  });
});

// T26 : un joueur qui revient retrouve ses infos.
describe("T26 : l'invite devient un compte sans rien perdre", () => {
  const GUEST = { id: 42, provider: "guest", provider_id: "g-42", username: "océ", email: null, avatar: null, created_at: null };

  it("creer un compte depuis un invite transforme SA ligne (meme id) au lieu d'en creer une", async () => {
    const req = mockReq({ body: { username: "océ", password: "motdepasse" } });
    const res = mockRes();
    mockGetSessionContext.mockResolvedValueOnce({ user: GUEST, sessionToken: "jeton-invite" });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // pseudo libre
    mockQuery.mockResolvedValueOnce({ rows: [{ ...GUEST, provider: "local" }] });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "jeton-compte" });

    await authController.register(req, res);

    const sql = String(mockQuery.mock.calls[1][0]);
    expect(sql).toContain("UPDATE users SET provider='local'");
    expect(sql).not.toContain("INSERT");
    expect(mockQuery.mock.calls[1][1][0]).toBe(42);
    expect(mockCreateSessionToken).toHaveBeenCalledWith(42, ONE_YEAR_MS);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ keptGuest: true }) })
    );
  });

  it("sans invite en cours, l'inscription cree un compte neuf comme avant", async () => {
    const req = mockReq({ body: { username: "Nouveau", password: "motdepasse" } });
    const res = mockRes();
    mockGetSessionContext.mockResolvedValueOnce(null);
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ ...GUEST, id: 7, provider: "local", username: "Nouveau" }] });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "t" });

    await authController.register(req, res);

    expect(String(mockQuery.mock.calls[1][0])).toContain("INSERT INTO users");
  });

  it("un compte deja connecte qui s'inscrit ne transforme pas son compte", async () => {
    const req = mockReq({ body: { username: "Autre", password: "motdepasse" } });
    const res = mockRes();
    mockGetSessionContext.mockResolvedValueOnce({ user: { ...GUEST, provider: "local" }, sessionToken: "t" });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [{ ...GUEST, id: 8, provider: "local", username: "Autre" }] });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "t2" });

    await authController.register(req, res);

    expect(String(mockQuery.mock.calls[1][0])).toContain("INSERT INTO users");
  });

  it("se connecter depuis un invite : le compte reprend cet invite dans une transaction", async () => {
    const hash = await bcrypt.hash("motdepasse", 4);
    const req = mockReq({ body: { username: "Miguel", password: "motdepasse" } });
    const res = mockRes();
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    mockConnect.mockResolvedValueOnce(client);
    mockQuery.mockResolvedValueOnce({ rows: [{ ...GUEST, id: 9, provider: "local", username: "Miguel", password_hash: hash }] });
    mockGetSessionContext.mockResolvedValueOnce({ user: GUEST, sessionToken: "jeton-invite" });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "jeton-compte" });

    await authController.login(req, res);

    const sqls = client.query.mock.calls.map(c => String(c[0]));
    expect(sqls[0]).toBe("BEGIN");
    expect(sqls).toContain("COMMIT");
    expect(sqls.some(q => q.includes("UPDATE game_participants"))).toBe(true);
    expect(client.query.mock.calls.find(c => String(c[0]).includes("UPDATE game_participants"))?.[1]).toEqual([42, 9]);
    expect(client.release).toHaveBeenCalled();
    expect(req.session.userId).toBe(9);
  });

  it("si la reprise echoue, la connexion passe quand meme et l'invite reste intact", async () => {
    const hash = await bcrypt.hash("motdepasse", 4);
    const req = mockReq({ body: { username: "Miguel", password: "motdepasse" } });
    const res = mockRes();
    const client = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes("game_participants")) throw new Error("boom");
        return { rows: [] };
      }),
      release: jest.fn(),
    };
    mockConnect.mockResolvedValueOnce(client);
    mockQuery.mockResolvedValueOnce({ rows: [{ ...GUEST, id: 9, provider: "local", username: "Miguel", password_hash: hash }] });
    mockGetSessionContext.mockResolvedValueOnce({ user: GUEST, sessionToken: "jeton-invite" });
    mockCreateSessionToken.mockResolvedValueOnce({ token: "jeton-compte" });

    await authController.login(req, res);

    expect(client.query.mock.calls.map(c => c[0])).toContain("ROLLBACK");
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(req.session.userId).toBe(9);
  });

  it("mauvais mot de passe : aucune reprise tentee", async () => {
    const hash = await bcrypt.hash("motdepasse", 4);
    const req = mockReq({ body: { username: "Miguel", password: "faux-faux" } });
    const res = mockRes();
    mockQuery.mockResolvedValueOnce({ rows: [{ ...GUEST, id: 9, provider: "local", username: "Miguel", password_hash: hash }] });

    await authController.login(req, res);

    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockGetSessionContext).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("/me prolonge d'un an et repose le cookie", async () => {
    const req = mockReq();
    const res = mockRes();
    mockGetSessionContext.mockResolvedValueOnce({ user: GUEST, sessionToken: "jeton-invite" });

    await authController.me(req, res);

    expect(mockGetSessionContext).toHaveBeenCalledWith(req, res, expect.objectContaining({ ttlMs: ONE_YEAR_MS }));
    expect(res.cookie).toHaveBeenCalledWith(
      "blindify_session_token",
      "jeton-invite",
      expect.objectContaining({ maxAge: ONE_YEAR_MS, httpOnly: true })
    );
  });
});
