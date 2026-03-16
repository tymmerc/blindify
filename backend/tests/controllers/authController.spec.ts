import bcrypt from "bcryptjs";

jest.mock("../../src/config/db", () => ({
  pool: { query: jest.fn() },
}));
jest.mock("../../src/utils/session", () => ({
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

    expect(mockCreateSessionToken).toHaveBeenCalledWith(5);
    expect(res.cookie).toHaveBeenCalledWith(
      "blindify_session_token",
      "token-xyz",
      expect.objectContaining({ httpOnly: true, path: "/" })
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

  it("should set 4-hour session TTL", async () => {
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

    const fourHoursMs = 1000 * 60 * 60 * 4;
    expect(mockCreateSessionToken).toHaveBeenCalledWith(12, fourHoursMs);
    expect(res.cookie).toHaveBeenCalledWith(
      "blindify_session_token",
      "guest-token-3",
      expect.objectContaining({ maxAge: fourHoursMs })
    );
  });
});

describe("authController.me", () => {
  it("should return current user when authenticated", async () => {
    const req = mockReq();
    const res = mockRes();

    const fakeContext = {
      user: { id: 1, username: "Alice", provider: "local" },
      connection: { provider: "spotify", accessToken: "abc" },
      sessionToken: "tok",
    };
    mockGetSessionContext.mockResolvedValueOnce(fakeContext);

    await authController.me(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          user: fakeContext.user,
          providerConnection: fakeContext.connection,
        }),
      })
    );
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

    expect(res.clearCookie).toHaveBeenCalledWith("blindify_session_token", { path: "/" });
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
