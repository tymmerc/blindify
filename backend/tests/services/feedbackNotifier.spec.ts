// Mail a Tym pour chaque message ecrit (T24) : tout de suite pour le premier,
// groupe sur 10 minutes ensuite, et jamais rien de personnel dans les journaux.
jest.mock("../../src/utils/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { logger } from "../../src/utils/logger";
import {
  buildFeedbackMail,
  createFeedbackNotifier,
  FEEDBACK_MAIL_MAX_ITEMS,
  FEEDBACK_MAIL_WINDOW_MS,
  type WrittenFeedback,
} from "../../src/services/feedbackNotifier";
import type { NotifMail } from "../../src/services/gameStartMail";

// 01/11/2026 a 22 h 05, heure de Paris.
const T0 = Date.UTC(2026, 10, 1, 21, 5);
const SECRET_TEXT = "mon-numero-0612345678";
const SECRET_CONTACT = "@contact.tres.prive";

function item(over: Partial<WrittenFeedback> = {}): WrittenFeedback {
  return { kind: "mot", mode: "friends", message: "Trop bien le jeu", contact: null, at: T0, ...over };
}

function setup(send?: jest.Mock) {
  const sent: NotifMail[] = [];
  const sendFn = send ?? jest.fn(async (mail: NotifMail) => { sent.push(mail); return { sent: true, detail: "envoye" }; });
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const notifier = createFeedbackNotifier({
    send: sendFn,
    schedule: (fn, ms) => { timers.push({ fn, ms }); return null; },
  });
  const settle = () => new Promise(r => setImmediate(r));
  const fire = async () => {
    const t = timers.shift();
    t?.fn();
    await settle();
  };
  return { notifier, send: sendFn, sent, timers, settle, fire };
}

beforeEach(() => jest.clearAllMocks());

describe("buildFeedbackMail", () => {
  it("donne le mode, l'heure de Paris, le message et le contact", () => {
    const mail = buildFeedbackMail([item({ contact: "@julie", mode: "buzzer" })]);
    expect(mail.subject).toBe("Blindz : un joueur t'a écrit");
    expect(mail.text).toContain("22:05 · Un seul tel (buzzer) · message");
    expect(mail.text).toContain("Trop bien le jeu");
    expect(mail.text).toContain("Contact laissé : @julie");
  });

  it("dit quand il n'y a pas de contact, et nomme le lien du site", () => {
    const mail = buildFeedbackMail([item({ mode: "site" })]);
    expect(mail.text).toContain("Pas de contact laissé.");
    expect(mail.text).toContain("Lien « Donne ton avis » du site");
  });

  it("au pluriel, compte aussi les messages en trop", () => {
    const mail = buildFeedbackMail([item(), item({ kind: "bug" })], 3);
    expect(mail.subject).toBe("Blindz : 5 joueurs t'ont écrit");
    expect(mail.text).toContain("bug signalé");
    expect(mail.text).toContain("Et 3 messages de plus");
  });
});

describe("createFeedbackNotifier", () => {
  it("envoie le premier message tout de suite et ouvre une fenetre de 10 minutes", async () => {
    const { notifier, sent, timers, settle } = setup();
    notifier.onFeedback(item());
    await settle();
    expect(sent).toHaveLength(1);
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(FEEDBACK_MAIL_WINDOW_MS);
  });

  it("regroupe les messages des 10 minutes suivantes dans un seul mail", async () => {
    const { notifier, sent, settle, fire, timers } = setup();
    notifier.onFeedback(item({ message: "premier" }));
    notifier.onFeedback(item({ message: "deuxieme" }));
    notifier.onFeedback(item({ message: "troisieme", contact: "@paul" }));
    await settle();
    expect(sent).toHaveLength(1);
    await fire();
    expect(sent).toHaveLength(2);
    expect(sent[1].subject).toBe("Blindz : 2 joueurs t'ont écrit");
    expect(sent[1].text).toContain("deuxieme");
    expect(sent[1].text).toContain("troisieme");
    expect(sent[1].text).toContain("Contact laissé : @paul");
    // Une nouvelle fenetre s'ouvre apres un envoi groupe.
    expect(timers).toHaveLength(1);
  });

  it("une fenetre vide se ferme : le message suivant repart tout de suite", async () => {
    const { notifier, sent, settle, fire, timers } = setup();
    notifier.onFeedback(item());
    await settle();
    await fire();
    expect(timers).toHaveLength(0);
    notifier.onFeedback(item({ message: "plus tard" }));
    await settle();
    expect(sent).toHaveLength(2);
    expect(sent[1].text).toContain("plus tard");
  });

  it("borne la file d'attente et compte le reste", async () => {
    const { notifier, sent, settle, fire } = setup();
    notifier.onFeedback(item());
    for (let i = 0; i < FEEDBACK_MAIL_MAX_ITEMS + 4; i++) notifier.onFeedback(item({ message: `m${i}` }));
    await settle();
    await fire();
    expect(sent[1].subject).toBe(`Blindz : ${FEEDBACK_MAIL_MAX_ITEMS + 4} joueurs t'ont écrit`);
    expect(sent[1].text).toContain("Et 4 messages de plus");
  });

  it("ne met jamais le message ni le contact dans les journaux, meme en cas d'echec", async () => {
    const failing = jest.fn(async () => ({ sent: false, detail: "Resend HTTP 500" }));
    const { notifier, settle } = setup(failing);
    notifier.onFeedback(item({ message: SECRET_TEXT, contact: SECRET_CONTACT }));
    await settle();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith("notif_retour_echec", { messages: 1, detail: "Resend HTTP 500" });
    const all = JSON.stringify([
      (logger.info as jest.Mock).mock.calls,
      (logger.warn as jest.Mock).mock.calls,
      (logger.error as jest.Mock).mock.calls,
    ]);
    expect(all).not.toContain(SECRET_TEXT);
    expect(all).not.toContain(SECRET_CONTACT);
  });

  it("un envoi qui leve ne casse rien", async () => {
    const throwing = jest.fn(async () => { throw new TypeError("boom"); });
    const { notifier, settle } = setup(throwing);
    expect(() => notifier.onFeedback(item())).not.toThrow();
    await settle();
    expect(logger.warn).toHaveBeenCalledWith("notif_retour_echec", { messages: 1, detail: "TypeError" });
  });
});
