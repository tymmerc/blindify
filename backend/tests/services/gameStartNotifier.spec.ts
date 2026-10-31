// Notification de debut de partie (T18) : quand, a qui, combien de fois.
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { logger } from "../../src/utils/logger";
import { createGameStartNotifier, notificationDecision, type GameStartInfo } from "../../src/services/gameStartNotifier";
import type { NotifConfig, NotifMail } from "../../src/services/gameStartMail";

const CONFIG: NotifConfig = { to: "t@example.test", from: "B <b@example.test>", key: "re_x", missing: [] };
const SECRET = "s".repeat(40);
// 25/10/2026 a 23 h 14, heure de Paris.
const T0 = Date.UTC(2026, 9, 25, 22, 14);

let seq = 0;
function info(over: Partial<GameStartInfo> = {}): GameStartInfo {
  seq += 1;
  return {
    roomId: over.roomId ?? 1000 + seq,
    roomCode: over.roomCode ?? `R${String(seq).padStart(5, "0")}`,
    mode: "friends",
    discord: false,
    players: [{ id: 1, username: "Julie" }, { id: 2, username: "Paul" }],
    providers: ["spotify"],
    e2e: false,
    ...over,
  };
}

function setup(opts: { now?: () => number; send?: jest.Mock; dailyCap?: number; config?: NotifConfig; secret?: string | null } = {}) {
  const sent: NotifMail[] = [];
  const send = opts.send ?? jest.fn(async (mail: NotifMail) => { sent.push(mail); return { sent: true, detail: "envoye" }; });
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const notifier = createGameStartNotifier({
    config: opts.config ?? CONFIG,
    secret: opts.secret === undefined ? SECRET : opts.secret,
    linkBase: "https://blindz.app",
    send,
    now: opts.now ?? (() => T0),
    dailyCap: opts.dailyCap,
    schedule: (fn, ms) => { timers.push({ fn, ms }); return { unref() {} } as unknown as NodeJS.Timeout; },
  });
  const flush = () => new Promise(r => setImmediate(r));
  return { notifier, send, sent, timers, flush };
}

beforeEach(() => jest.clearAllMocks());

describe("notificationDecision", () => {
  it("2 vrais joueurs a distance, autour d'une table, sur Discord : oui", () => {
    expect(notificationDecision(info())).toEqual({ notify: true });
    expect(notificationDecision(info({ mode: "event" }))).toEqual({ notify: true });
    expect(notificationDecision(info({ discord: true }))).toEqual({ notify: true });
  });

  it("un seul vrai joueur : non", () => {
    expect(notificationDecision(info({ players: [{ id: 1, username: "Julie" }] }))).toEqual({ notify: false, reason: "pas_assez_de_vrais_joueurs" });
  });

  it("Tym dans la salle, meme avec deux amis : non", () => {
    const players = [{ id: 1, username: "Julie" }, { id: 2, username: "Paul" }, { id: 3, username: "Tym" }];
    expect(notificationDecision(info({ players }))).toEqual({ notify: false, reason: "tym" });
  });

  it("comptes de test : ne comptent pas comme vrais joueurs", () => {
    expect(notificationDecision(info({ players: [{ id: 1, username: "Julie" }, { id: 2, username: "e2e_bot" }] })).notify).toBe(false);
    expect(notificationDecision(info({ players: [{ id: 1, username: "Lea" }, { id: 2, username: "Max" }] })).notify).toBe(false);
    // Un vrai groupe ou un ami s'appelle Max : les deux autres suffisent.
    const players = [{ id: 1, username: "Julie" }, { id: 2, username: "Paul" }, { id: 3, username: "Max" }];
    expect(notificationDecision(info({ players }))).toEqual({ notify: true });
  });

  it("lancee par un outil E2E (cle E2E) : non", () => {
    expect(notificationDecision(info({ e2e: true }))).toEqual({ notify: false, reason: "e2e" });
  });

  it("mode streamer : non (hors du brief)", () => {
    expect(notificationDecision(info({ mode: "streamer" }))).toEqual({ notify: false, reason: "mode" });
  });
});

describe("createGameStartNotifier", () => {
  it("une partie qui compte : un mail, avec le lien spectateur signe", async () => {
    const { notifier, sent, flush } = setup();
    notifier.onGameStarted(info({ roomCode: "ABCD12" }));
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].text).toMatch(/https:\/\/blindz\.app\/spectateur\/\?salle=ABCD12&jeton=\d+\.[A-Za-z0-9_-]{43}/);
    expect(logger.info).toHaveBeenCalledWith("notif_partie_envoyee", expect.objectContaining({ roomId: expect.any(Number) }));
  });

  it("un seul mail par salle, quel que soit le nombre de parties", async () => {
    const { notifier, sent, flush } = setup();
    const first = info();
    notifier.onGameStarted(first);
    notifier.onGameStarted({ ...first });
    notifier.onGameStarted({ ...first, players: [...first.players, { id: 9, username: "Zoe" }] });
    await flush();
    expect(sent).toHaveLength(1);
  });

  it("la premiere partie qui compte : une salle d'abord a un vrai joueur, puis a deux", async () => {
    const { notifier, sent, flush } = setup();
    const lone = info({ players: [{ id: 1, username: "Julie" }, { id: 2, username: "Lea" }] });
    notifier.onGameStarted(lone);
    await flush();
    expect(sent).toHaveLength(0);
    notifier.onGameStarted({ ...lone, players: [{ id: 1, username: "Julie" }, { id: 3, username: "Paul" }] });
    await flush();
    expect(sent).toHaveLength(1);
  });

  it("plafond : 6 mails par jour, puis un seul « et N autres salles » le soir", async () => {
    const { notifier, sent, timers, flush } = setup();
    for (let i = 0; i < 10; i++) notifier.onGameStarted(info());
    await flush();
    expect(sent).toHaveLength(6);
    // Un seul minuteur pour le recapitulatif, pose au premier depassement.
    expect(timers).toHaveLength(1);
    timers[0].fn();
    await flush();
    expect(sent).toHaveLength(7);
    expect(sent[6].subject).toBe("Blindz : et 4 autres salles aujourd'hui (25/10)");
    // Le minuteur ne renvoie pas deux fois.
    timers[0].fn();
    await flush();
    expect(sent).toHaveLength(7);
  });

  it("le recapitulatif part aussi au changement de jour si le minuteur n'a pas sonne", async () => {
    let now = T0;
    const { notifier, sent, flush } = setup({ now: () => now, dailyCap: 1 });
    notifier.onGameStarted(info());
    notifier.onGameStarted(info());
    await flush();
    expect(sent).toHaveLength(1);
    now = T0 + 24 * 3600_000;
    notifier.onGameStarted(info());
    await flush();
    expect(sent.map(m => m.subject)).toEqual([
      expect.stringContaining("une partie à 2"),
      "Blindz : et 1 autre salle aujourd'hui (25/10)",
      expect.stringContaining("une partie à 2"),
    ]);
  });

  it("le minuteur du soir vise minuit, heure de Paris", () => {
    const { notifier, timers } = setup({ dailyCap: 0 });
    notifier.onGameStarted(info());
    // 23 h 14 a Paris : minuit dans 46 minutes, plus une minute de marge.
    expect(timers[0].ms).toBe(47 * 60_000);
  });

  it("l'envoi ne bloque jamais : onGameStarted rend la main avant l'envoi", () => {
    let resolveSend: (v: { sent: boolean; detail: string }) => void = () => {};
    const send = jest.fn(() => new Promise<{ sent: boolean; detail: string }>(r => { resolveSend = r; }));
    const { notifier } = setup({ send });
    const t = Date.now();
    expect(notifier.onGameStarted(info())).toBeUndefined();
    expect(Date.now() - t).toBeLessThan(50);
    resolveSend({ sent: true, detail: "envoye" });
  });

  it("un echec est journalise, sans nouvel essai ni exception", async () => {
    const send = jest.fn(async () => { throw new Error("panne"); });
    const { notifier, flush } = setup({ send });
    const room = info();
    expect(() => notifier.onGameStarted(room)).not.toThrow();
    await flush();
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("notif_partie_echec", expect.objectContaining({ roomId: room.roomId }));
    // Meme salle, partie suivante : pas de second essai.
    notifier.onGameStarted({ ...room });
    await flush();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("config absente : rien n'est tente", async () => {
    const { notifier, send, flush } = setup({ config: { to: null, from: null, key: null, missing: ["x"] } });
    notifier.onGameStarted(info());
    await flush();
    expect(send).not.toHaveBeenCalled();
  });

  it("sans secret spectateur : le mail part quand meme, sans lien", async () => {
    const { notifier, sent, flush } = setup({ secret: null });
    notifier.onGameStarted(info());
    await flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].text).not.toContain("/spectateur/");
  });

  it("entree inattendue : jamais d'exception vers le lancement de partie", () => {
    const { notifier } = setup();
    expect(() => notifier.onGameStarted(null as unknown as GameStartInfo)).not.toThrow();
    expect(() => notifier.onGameStarted({ ...info(), players: null } as unknown as GameStartInfo)).not.toThrow();
  });
});
