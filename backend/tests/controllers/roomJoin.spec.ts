// Entree dans une salle (POST /api/rooms/:code/join), base remplacee par un faux.
// Le front relance ce join quand la reponse n'arrive pas a temps (filet de
// securite du lobby), et un F5 le renvoie aussi : le join doit etre rejouable.
// Un joueur deja inscrit dans une salle pleine ne doit donc pas recevoir
// "La salle est pleine".

jest.mock("../../src/config/db", () => ({
  pool: { query: jest.fn() },
}));
jest.mock("../../src/utils/session", () => ({
  getSessionContext: jest.fn(),
}));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
const mockEmit = jest.fn();
jest.mock("../../src/socket", () => ({
  io: { to: jest.fn(() => ({ emit: mockEmit })) },
}));

import type { Request, Response } from "express";
import { roomsController } from "../../src/controllers/roomsController";
import { pool } from "../../src/config/db";
import { getSessionContext } from "../../src/utils/session";

const mockQuery = pool.query as jest.Mock;
const mockGetSessionContext = getSessionContext as jest.Mock;

const ROOM = { id: 41, room_code: "ABC123", max_players: 2, status: "waiting" };

function mockReq(): Request {
  return { params: { code: "abc123" }, body: { nickname: "Lea" }, headers: {}, session: {} } as unknown as Request;
}

type MockRes = Response & { status: jest.Mock; json: jest.Mock };

function mockRes(): MockRes {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res as unknown as MockRes;
}

/** Salle de 2 places : `total` inscrits, dont `self` (0 ou 1) pour ce joueur. */
function roomWith(total: number, self: number) {
  mockQuery
    .mockResolvedValueOnce({ rows: [ROOM] })
    .mockResolvedValueOnce({ rows: [{ total, self }] })
    .mockResolvedValue({ rows: [] });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  mockGetSessionContext.mockResolvedValue({ user: { id: 7, provider: "guest", username: "Lea" } });
});

describe("roomsController.joinRoom", () => {
  it("refuse un nouveau venu quand la salle est pleine", async () => {
    roomWith(2, 0);
    const res = mockRes();
    await roomsController.joinRoom(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls[0][0].error.code).toBe("room_full");
    expect(mockQuery.mock.calls.some(([sql]) => /INSERT INTO room_participants/.test(sql))).toBe(false);
  });

  it("laisse entrer un joueur deja inscrit qui renvoie son join, meme salle pleine", async () => {
    roomWith(2, 1);
    const res = mockRes();
    await roomsController.joinRoom(mockReq(), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, data: { room: { room_code: "ABC123" } } });
  });

  it("compte les places avec une requete parametree sur la salle et le joueur", async () => {
    roomWith(1, 0);
    await roomsController.joinRoom(mockReq(), mockRes());
    const [sql, params] = mockQuery.mock.calls[1];
    expect(sql).toMatch(/COUNT\(\*\) FILTER \(WHERE user_id=\$2\)/);
    expect(params).toEqual([41, 7]);
    expect(mockEmit).toHaveBeenCalledWith("player-joined", expect.objectContaining({ userId: 7, roomCode: "ABC123" }));
  });
});
