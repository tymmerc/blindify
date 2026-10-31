// Spectateur (T18) : autorisation du lien et limite de debit, sans base.
jest.mock("../../src/config/db", () => ({ pool: { query: jest.fn() } }));
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import type { Socket } from "socket.io";
import {
  SPECTATOR_ATTEMPTS,
  SPECTATOR_WINDOW_MS,
  allowSpectatorAttempt,
  authorizeSpectator,
  handshakeIp,
  readSpectatorHandshake,
  resetSpectatorAttemptsForTests,
} from "../../src/services/spectators";
import { SPECTATOR_TTL_MS, signSpectatorToken } from "../../src/services/spectatorToken";

const SECRET = "z".repeat(40);
const NOW = Date.UTC(2026, 9, 29, 20, 0);
const ROOM = { id: 7, mode: "friends", discord: false };
const findRoom = jest.fn(async (code: string) => (code === "ABCD12" ? ROOM : null));
const token = (exp = NOW + SPECTATOR_TTL_MS, roomId = 7) => signSpectatorToken({ roomCode: "ABCD12", roomId, expiresAt: exp }, SECRET);
const hs = (address: string, headers: Record<string, string> = {}, auth: unknown = {}) =>
  ({ handshake: { address, headers, auth } }) as unknown as Pick<Socket, "handshake">;

beforeEach(() => resetSpectatorAttemptsForTests());

describe("authorizeSpectator", () => {
  const go = (salle: unknown, jeton: unknown, secret: string | null = SECRET) =>
    authorizeSpectator({ salle, jeton, ip: "203.0.113.9" }, { secret, findRoom, now: NOW });

  it("lien valide : la salle, son mode, l'expiration", async () => {
    await expect(go("ABCD12", token())).resolves.toEqual({
      ok: true,
      data: { roomCode: "ABCD12", roomId: 7, mode: "friends", discord: false, expiresAt: NOW + SPECTATOR_TTL_MS },
    });
    // Code en minuscules dans le lien : meme salle.
    await expect(go("abcd12", token())).resolves.toMatchObject({ ok: true });
  });

  it("refus : expire, autre salle, salle inconnue, forme invalide", async () => {
    await expect(go("ABCD12", token(NOW - 1))).resolves.toEqual({ ok: false, code: "spectateur_expire" });
    await expect(go("ABCD12", token(undefined, 8))).resolves.toEqual({ ok: false, code: "spectateur_refuse" });
    await expect(go("ZZZZ99", token())).resolves.toEqual({ ok: false, code: "spectateur_refuse" });
    await expect(go("AB CD", token())).resolves.toEqual({ ok: false, code: "spectateur_refuse" });
    await expect(go("ABCD12", 42)).resolves.toEqual({ ok: false, code: "spectateur_refuse" });
  });

  it("sans secret : desactive, sans lire la base", async () => {
    findRoom.mockClear();
    await expect(go("ABCD12", token(), null)).resolves.toEqual({ ok: false, code: "spectateur_desactive" });
    expect(findRoom).not.toHaveBeenCalled();
  });
});

describe("allowSpectatorAttempt", () => {
  it(`${SPECTATOR_ATTEMPTS} tentatives par fenetre et par IP, puis refus ; la fenetre suivante repart`, () => {
    for (let i = 0; i < SPECTATOR_ATTEMPTS; i++) expect(allowSpectatorAttempt("198.51.100.1", NOW)).toBe(true);
    expect(allowSpectatorAttempt("198.51.100.1", NOW)).toBe(false);
    expect(allowSpectatorAttempt("198.51.100.2", NOW)).toBe(true);
    expect(allowSpectatorAttempt("198.51.100.1", NOW + SPECTATOR_WINDOW_MS)).toBe(true);
  });

  it("IPv6 : un compteur par /64", () => {
    for (let i = 0; i < SPECTATOR_ATTEMPTS; i++) allowSpectatorAttempt(`2001:db8:1:2::${i + 1}`, NOW);
    expect(allowSpectatorAttempt("2001:db8:1:2::ffff", NOW)).toBe(false);
  });
});

describe("handshakeIp", () => {
  it("X-Real-IP de nginx, si la connexion vient de la boucle locale ou de la passerelle Docker", () => {
    expect(handshakeIp(hs("127.0.0.1", { "x-real-ip": "203.0.113.5" }))).toBe("203.0.113.5");
    expect(handshakeIp(hs("::ffff:172.18.0.1", { "x-real-ip": "203.0.113.6" }))).toBe("203.0.113.6");
  });
  it("jamais d'une adresse publique (en-tete forge)", () => {
    expect(handshakeIp(hs("198.51.100.7", { "x-real-ip": "1.2.3.4" }))).toBe("198.51.100.7");
  });
});

describe("readSpectatorHandshake", () => {
  it("seulement auth.spectateur", () => {
    expect(readSpectatorHandshake(hs("127.0.0.1", {}, { spectateur: { salle: "A", jeton: "b" } }))).toEqual({ salle: "A", jeton: "b" });
    expect(readSpectatorHandshake(hs("127.0.0.1", {}, { token: "session" }))).toBeNull();
    expect(readSpectatorHandshake(hs("127.0.0.1", {}, { spectateur: "texte" }))).toBeNull();
  });
});
