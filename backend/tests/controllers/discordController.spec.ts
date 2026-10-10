// Controleur de l'Activite Discord : configuration publique, connexion par le
// code OAuth2 du SDK, et entree dans la salle du salon. Discord, la base et
// la session sont simules.
jest.mock("../../src/config/db", () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock("../../src/utils/session", () => ({
  createSessionToken: jest.fn(),
  getSessionContext: jest.fn(),
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../../src/services/discordAuth", () => ({
  ...jest.requireActual("../../src/services/discordAuth"),
  exchangeCode: jest.fn(),
  fetchDiscordUser: jest.fn(),
}));
jest.mock("../../src/services/discordAccounts", () => ({
  upsertDiscordUser: jest.fn(),
}));
jest.mock("../../src/services/discordRooms", () => ({
  ...jest.requireActual("../../src/services/discordRooms"),
  resolveDiscordRoom: jest.fn(),
}));
jest.mock("../../src/controllers/roomsController", () => ({
  roomsController: { joinRoom: jest.fn() },
}));

import type { Request, Response } from "express";
import { discordController } from "../../src/controllers/discordController";
import { DiscordAuthError, exchangeCode, fetchDiscordUser } from "../../src/services/discordAuth";
import { upsertDiscordUser } from "../../src/services/discordAccounts";
import { resolveDiscordRoom } from "../../src/services/discordRooms";
import { roomsController } from "../../src/controllers/roomsController";
import { createSessionToken, getSessionContext } from "../../src/utils/session";
import { logger } from "../../src/utils/logger";

const mockExchange = exchangeCode as jest.Mock;
const mockFetchUser = fetchDiscordUser as jest.Mock;
const mockUpsert = upsertDiscordUser as jest.Mock;
const mockResolve = resolveDiscordRoom as jest.Mock;
const mockJoin = roomsController.joinRoom as jest.Mock;
const mockCreateSession = createSessionToken as jest.Mock;
const mockGetSession = getSessionContext as jest.Mock;

type MockRes = Response & { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };

function mockReq(overrides: Partial<Request> = {}): Request {
  return { body: {}, params: {}, headers: {}, session: {}, ...overrides } as unknown as Request;
}

function mockRes(): MockRes {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as MockRes;
}

const body = (res: MockRes) => res.json.mock.calls[0][0];

const USER = { id: 12, provider: "discord", provider_id: "987654321098765432", username: "Tym", email: null, avatar: null, created_at: "2026-10-10" };

beforeEach(() => {
  jest.clearAllMocks();
  process.env.DISCORD_CLIENT_ID = "123456789012345678";
  process.env.DISCORD_CLIENT_SECRET = "s3cret";
});

afterAll(() => {
  delete process.env.DISCORD_CLIENT_ID;
  delete process.env.DISCORD_CLIENT_SECRET;
});

describe("discordController.config (GET /api/discord/config)", () => {
  it("donne l'identifiant public de l'appli quand l'Activite est configuree", async () => {
    const res = mockRes();
    await discordController.config(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(body(res)).toEqual({ success: true, data: { enabled: true, clientId: "123456789012345678" }, error: null });
  });

  it("dit que l'Activite est desactivee sans jamais donner le secret", async () => {
    delete process.env.DISCORD_CLIENT_SECRET;
    const res = mockRes();
    await discordController.config(mockReq(), res);

    expect(body(res).data).toEqual({ enabled: false, clientId: null });
    expect(JSON.stringify(body(res))).not.toContain("s3cret");
  });
});

describe("discordController.auth (POST /api/auth/discord)", () => {
  it("503 discord_disabled sans configuration, sans appeler Discord", async () => {
    delete process.env.DISCORD_CLIENT_ID;
    const res = mockRes();
    await discordController.auth(mockReq({ body: { code: "abc" } } as Partial<Request>), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(body(res).error.code).toBe("discord_disabled");
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("400 invalid_code quand le code manque ou a une forme impossible", async () => {
    for (const code of [undefined, "", "a b", 42]) {
      const res = mockRes();
      await discordController.auth(mockReq({ body: { code } } as Partial<Request>), res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(body(res).error.code).toBe("invalid_code");
    }
    expect(mockExchange).not.toHaveBeenCalled();
  });

  it("echange le code, lit l'utilisateur chez Discord, cree le compte et la session", async () => {
    mockExchange.mockResolvedValue({ accessToken: "discord-tok", expiresIn: 604800 });
    mockFetchUser.mockResolvedValue({ id: "987654321098765432", username: "tym", globalName: "Tym", avatar: null });
    mockUpsert.mockResolvedValue(USER);
    mockCreateSession.mockResolvedValue({ token: "sess-1", user_id: 12, created_at: "x", expires_at: "y" });

    const res = mockRes();
    await discordController.auth(mockReq({ body: { code: "le-code" } } as Partial<Request>), res);

    expect(mockExchange).toHaveBeenCalledWith("le-code", { clientId: "123456789012345678", clientSecret: "s3cret" });
    expect(mockFetchUser).toHaveBeenCalledWith("discord-tok");
    expect(mockUpsert).toHaveBeenCalledWith({ id: "987654321098765432", username: "tym", globalName: "Tym", avatar: null });
    // Session habituelle (24 h glissantes) : l'Activite se reconnecte toute seule a chaque lancement.
    expect(mockCreateSession).toHaveBeenCalledWith(12);
    expect(res.status).toHaveBeenCalledWith(200);
    // Deux jetons dans la reponse : jamais en cache.
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    // Le jeton d'acces Discord repart au client : le SDK en a besoin pour
    // authenticate(). Le secret de l'appli et le jeton de rafraichissement, jamais.
    expect(body(res).data).toEqual({ discordAccessToken: "discord-tok", sessionToken: "sess-1", user: USER });
    expect(JSON.stringify(body(res))).not.toContain("s3cret");
  });

  it("401 discord_code_rejected quand Discord refuse le code, sans journaliser le code", async () => {
    mockExchange.mockRejectedValue(new DiscordAuthError("code_rejected", "refuse", 400));

    const res = mockRes();
    await discordController.auth(mockReq({ body: { code: "code-secret-du-joueur" } } as Partial<Request>), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(body(res).error.code).toBe("discord_code_rejected");
    const journal = JSON.stringify((logger.warn as jest.Mock).mock.calls) + JSON.stringify((logger.error as jest.Mock).mock.calls);
    expect(journal).not.toContain("code-secret-du-joueur");
  });

  it("secret d'appli faux (invalid_client) : 502 pour le joueur, et une ERREUR dans le journal, pas un simple refus", async () => {
    mockExchange.mockRejectedValue(new DiscordAuthError("unavailable", "refuse", 401, "invalid_client"));

    const res = mockRes();
    await discordController.auth(mockReq({ body: { code: "abc" } } as Partial<Request>), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(body(res).error.code).toBe("discord_unavailable");
    expect(logger.error).toHaveBeenCalledWith("discord_app_misconfigured", expect.objectContaining({ discordError: "invalid_client" }));
  });

  it("502 discord_unavailable quand Discord ne repond pas", async () => {
    mockExchange.mockRejectedValue(new DiscordAuthError("unavailable", "panne", 503));

    const res = mockRes();
    await discordController.auth(mockReq({ body: { code: "abc" } } as Partial<Request>), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(body(res).error.code).toBe("discord_unavailable");
  });

  it("500 discord_auth_failed pour une erreur inattendue (base)", async () => {
    mockExchange.mockResolvedValue({ accessToken: "t", expiresIn: null });
    mockFetchUser.mockResolvedValue({ id: "987654321098765432", username: "tym", globalName: null, avatar: null });
    mockUpsert.mockRejectedValue(new Error("base injoignable"));

    const res = mockRes();
    await discordController.auth(mockReq({ body: { code: "abc" } } as Partial<Request>), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(body(res).error.code).toBe("discord_auth_failed");
  });
});

describe("discordController.room (POST /api/discord/room)", () => {
  const ROOM = { id: 41, room_code: "ABC123", host_user_id: 12, status: "waiting", mode: "friends", discord_instance_id: "i-1" };

  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: USER, connection: null, sessionToken: "sess-1" });
  });

  it("sans session : getSessionContext a repondu 401, rien d'autre ne part", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = mockRes();
    await discordController.room(mockReq({ body: { instanceId: "i-1" } } as Partial<Request>), res);

    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it("403 discord_session_required pour une session qui n'est pas Discord (un invite de blindz.app)", async () => {
    // Sans ce refus, un invite du site pouvait ouvrir une salle par instanceId
    // invente, autant de fois qu'il veut, et ces salles vivent 7 jours.
    mockGetSession.mockResolvedValue({ user: { ...USER, provider: "guest" }, connection: null, sessionToken: "sess-g" });
    const res = mockRes();
    await discordController.room(mockReq({ body: { instanceId: "i-1" } } as Partial<Request>), res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(body(res).error.code).toBe("discord_session_required");
    expect(mockResolve).not.toHaveBeenCalled();
    expect(mockJoin).not.toHaveBeenCalled();
  });

  it("400 discord_instance_invalid pour un identifiant d'instance impossible", async () => {
    const res = mockRes();
    await discordController.room(mockReq({ body: { instanceId: "<script>" } } as Partial<Request>), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(body(res).error.code).toBe("discord_instance_invalid");
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("retrouve ou cree la salle du salon, puis passe par le join habituel (acces comme un code de salle)", async () => {
    mockResolve.mockResolvedValue({ room: ROOM, created: true });
    const req = mockReq({ body: { instanceId: "i-1", nickname: "  Tym  " } } as Partial<Request>);
    const res = mockRes();
    await discordController.room(req, res);

    expect(mockResolve).toHaveBeenCalledWith("i-1", USER, "Tym");
    expect(mockJoin).toHaveBeenCalledTimes(1);
    const [joinReq, joinRes] = mockJoin.mock.calls[0];
    expect(joinReq.params.code).toBe("ABC123");
    expect(joinRes).toBe(res);
  });

  it("500 discord_room_failed si la salle ne peut pas etre resolue", async () => {
    mockResolve.mockRejectedValue(new Error("base"));
    const res = mockRes();
    await discordController.room(mockReq({ body: { instanceId: "i-1" } } as Partial<Request>), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(body(res).error.code).toBe("discord_room_failed");
    expect(mockJoin).not.toHaveBeenCalled();
  });
});
