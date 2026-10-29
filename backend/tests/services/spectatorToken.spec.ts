// Lien spectateur (T18) : jeton signe par HMAC, valable 3 h, propre a une
// salle (son code ET son id en base, un code peut resservir apres coup).
import {
  SPECTATOR_TTL_MS,
  readSpectatorSecret,
  signSpectatorToken,
  spectatorLink,
  verifySpectatorToken,
} from "../../src/services/spectatorToken";

const SECRET = "a".repeat(64);
const NOW = Date.UTC(2026, 9, 29, 21, 0, 0);
const ROOM = { roomCode: "ABCD12", roomId: 41 };

function token(over: Partial<{ roomCode: string; roomId: number; expiresAt: number; secret: string }> = {}) {
  return signSpectatorToken(
    { roomCode: over.roomCode ?? ROOM.roomCode, roomId: over.roomId ?? ROOM.roomId, expiresAt: over.expiresAt ?? NOW + SPECTATOR_TTL_MS },
    over.secret ?? SECRET,
  );
}

describe("readSpectatorSecret", () => {
  it("absent ou trop court : pas de lien spectateur", () => {
    expect(readSpectatorSecret({})).toBeNull();
    expect(readSpectatorSecret({ SPECTATEUR_SECRET: "  " })).toBeNull();
    expect(readSpectatorSecret({ SPECTATEUR_SECRET: "court" })).toBeNull();
  });
  it("32 caracteres au moins : accepte, espaces retires", () => {
    expect(readSpectatorSecret({ SPECTATEUR_SECRET: ` ${SECRET} ` })).toBe(SECRET);
  });
});

describe("verifySpectatorToken", () => {
  it("jeton valide pour sa salle", () => {
    const res = verifySpectatorToken({ ...ROOM, token: token(), now: NOW }, SECRET);
    expect(res).toEqual({ ok: true, expiresAt: NOW + SPECTATOR_TTL_MS });
  });

  it("valable 3 h, refuse juste apres", () => {
    const t = token();
    expect(verifySpectatorToken({ ...ROOM, token: t, now: NOW + SPECTATOR_TTL_MS - 1 }, SECRET).ok).toBe(true);
    expect(verifySpectatorToken({ ...ROOM, token: t, now: NOW + SPECTATOR_TTL_MS }, SECRET)).toEqual({ ok: false, reason: "expired" });
  });

  it("une autre salle (autre code, ou meme code mais autre id) : refuse", () => {
    const t = token();
    expect(verifySpectatorToken({ roomCode: "ZZZZ99", roomId: 41, token: t, now: NOW }, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySpectatorToken({ roomCode: "ABCD12", roomId: 42, token: t, now: NOW }, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("falsifie : signature changee, date repoussee, autre secret", () => {
    const t = token();
    const [exp, sig] = t.split(".");
    const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect(verifySpectatorToken({ ...ROOM, token: `${exp}.${flipped}`, now: NOW }, SECRET).ok).toBe(false);
    // Repousser l'expiration sans re-signer : la signature ne colle plus.
    const later = String(Number(exp) + 3_600_000);
    expect(verifySpectatorToken({ ...ROOM, token: `${later}.${sig}`, now: NOW }, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifySpectatorToken({ ...ROOM, token: token({ secret: "b".repeat(64) }), now: NOW }, SECRET)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("un jeton signe pour plus de 3 h (secret vole ou bug) est refuse", () => {
    const t = token({ expiresAt: NOW + SPECTATOR_TTL_MS + 120_000 });
    expect(verifySpectatorToken({ ...ROOM, token: t, now: NOW }, SECRET)).toEqual({ ok: false, reason: "too_long" });
  });

  it("forme invalide : refuse sans lever d'exception", () => {
    for (const bad of ["", "abc", ".", "123.", ".sig", "12a.sig", "1.2.3", "x".repeat(500), undefined, null, 42, {}]) {
      const res = verifySpectatorToken({ ...ROOM, token: bad as unknown as string, now: NOW }, SECRET);
      expect(res).toEqual({ ok: false, reason: "malformed" });
    }
  });

  it("le jeton ne se devine pas a partir du code : deux salles, deux jetons sans rapport", () => {
    const a = token({ roomCode: "AAAA11", roomId: 1 });
    const b = token({ roomCode: "AAAA12", roomId: 2 });
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
    expect(a.split(".")[1]).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("spectatorLink", () => {
  it("lien vers la page spectateur, parametres encodes", () => {
    const t = token();
    expect(spectatorLink("https://blindz.app/", "ABCD12", t)).toBe(`https://blindz.app/spectateur/?salle=ABCD12&jeton=${encodeURIComponent(t)}`);
  });
});
