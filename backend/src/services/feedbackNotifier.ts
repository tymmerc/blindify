/**
 * Mail a Tym pour chaque message ecrit par un joueur (T24). Le bloc de fin de
 * 2e partie promet « je lis tout » : sans mail, ce serait faux.
 *
 * - Seuls les retours avec un texte comptent (mot, bug decrit, « pas trop »
 *   explique). Un simple Oui / Pas trop ne declenche rien.
 * - Le premier message part tout de suite. Ceux qui arrivent dans les 10
 *   minutes qui suivent attendent la fin de ces 10 minutes et partent ensemble
 *   dans un seul mail. Au plus un mail par tranche de 10 minutes.
 * - Envoi par Resend, avec la configuration du mail de debut de partie
 *   (gameStartMail.ts). Config absente : rien ne part, rien ne casse.
 * - Le message et le contact vont dans le mail, a Tym seul. Jamais dans les
 *   journaux : on n'y ecrit que des nombres et le resultat de l'envoi.
 * - En memoire : un redemarrage pendant l'attente perd le mail groupe, pas les
 *   messages (ils sont deja en base, onglet Retours du tableau de bord).
 */
import { logger } from "../utils/logger";
import type { FeedbackAnswer, FeedbackKind, FeedbackMode } from "../utils/feedbackValidation";
import { loadNotifConfig, parisTime, resendTestBase, sendNotifMail, type NotifConfig, type NotifMail, type SendResult } from "./gameStartMail";

export const FEEDBACK_MAIL_WINDOW_MS = 10 * 60_000;
// Borne la memoire si une rafale arrive pendant l'attente : au-dela, le mail
// donne seulement le nombre de messages en plus.
export const FEEDBACK_MAIL_MAX_ITEMS = 30;

export type WrittenFeedback = {
  kind: FeedbackKind;
  mode: FeedbackMode;
  message: string;
  contact: string | null;
  /** Oui ou Pas trop, pour un avis explique (T32). */
  answer?: FeedbackAnswer | null;
  at: number;
};

const MODE_LABELS: Record<FeedbackMode, string> = {
  solo: "Solo",
  defi: "Défi",
  chrono: "Chrono",
  buzzer: "Un seul tel (buzzer)",
  friends: "À distance",
  event: "Autour d'une table",
  site: "Lien « Donne ton avis » du site",
};

const KIND_LABELS: Record<FeedbackKind, string> = {
  mot: "message",
  bug: "bug signalé",
  avis: "avis expliqué",
};

const ANSWER_LABELS: Record<FeedbackAnswer, string> = {
  oui: "avis « oui » expliqué",
  pas_trop: "avis « pas trop » expliqué",
};

const kindLabel = (item: WrittenFeedback): string =>
  (item.kind === "avis" && item.answer ? ANSWER_LABELS[item.answer] : KIND_LABELS[item.kind]) ?? item.kind;

function describe(item: WrittenFeedback): string[] {
  return [
    `${parisTime(item.at)} · ${MODE_LABELS[item.mode] ?? item.mode} · ${kindLabel(item)}`,
    item.message,
    item.contact ? `Contact laissé : ${item.contact}` : "Pas de contact laissé.",
  ];
}

/** Le mail : chaque message avec son mode, son heure et le contact s'il y en a un. */
export function buildFeedbackMail(items: ReadonlyArray<WrittenFeedback>, dropped = 0): NotifMail {
  const total = items.length + dropped;
  const subject = total > 1
    ? `Blindz : ${total} joueurs t'ont écrit`
    : "Blindz : un joueur t'a écrit";
  const blocks = items.flatMap((item, i) => [...(i ? ["", "----", ""] : []), ...describe(item)]);
  return {
    subject,
    text: [
      ...blocks,
      ...(dropped ? ["", `Et ${dropped} message${dropped > 1 ? "s" : ""} de plus, à lire dans l'onglet Retours.`] : []),
      "",
      "Tout est aussi dans l'onglet Retours du tableau de bord. Heure de Paris.",
      "Les messages d'un même quart d'heure arrivent groupés.",
    ].join("\n"),
  };
}

export type FeedbackNotifier = {
  onFeedback: (item: WrittenFeedback) => void;
  /** Pour les tests : envoie tout de suite ce qui attend. */
  flush: () => void;
};

type Deps = {
  send: (mail: NotifMail) => Promise<SendResult>;
  schedule?: (fn: () => void, ms: number) => unknown;
  windowMs?: number;
};

export function createFeedbackNotifier(deps: Deps): FeedbackNotifier {
  const windowMs = deps.windowMs ?? FEEDBACK_MAIL_WINDOW_MS;
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  });
  let waiting = false;
  let pending: WrittenFeedback[] = [];
  let dropped = 0;

  const deliver = (items: WrittenFeedback[], extra: number) => {
    const meta = { messages: items.length + extra };
    void Promise.resolve()
      .then(() => deps.send(buildFeedbackMail(items, extra)))
      .then(res => {
        if (res.sent) logger.info("notif_retour_envoyee", meta);
        else logger.warn("notif_retour_echec", { ...meta, detail: res.detail });
      })
      .catch(err => logger.warn("notif_retour_echec", { ...meta, detail: err instanceof Error ? err.name : "erreur" }));
  };

  // Fin de la fenetre : ce qui attend part en un mail, et une nouvelle fenetre
  // s'ouvre ; rien n'attend, la prochaine arrivee repartira tout de suite.
  const endWindow = () => {
    if (!pending.length) {
      waiting = false;
      return;
    }
    const items = pending;
    const extra = dropped;
    pending = [];
    dropped = 0;
    deliver(items, extra);
    schedule(endWindow, windowMs);
  };

  return {
    onFeedback(item) {
      if (!waiting) {
        waiting = true;
        deliver([item], 0);
        schedule(endWindow, windowMs);
        return;
      }
      if (pending.length < FEEDBACK_MAIL_MAX_ITEMS) pending.push(item);
      else dropped += 1;
    },
    flush() {
      if (pending.length) endWindow();
    },
  };
}

// ---------------------------------------------------------------------------
// Branchement sur le vrai backend
// ---------------------------------------------------------------------------

let notifier: FeedbackNotifier | null = null;
let config: NotifConfig | null = null;

function getConfig(): NotifConfig {
  if (!config) config = loadNotifConfig();
  return config;
}

/**
 * Appele par POST /api/feedback apres l'enregistrement. Rend la main tout de
 * suite et ne leve jamais : le joueur a deja sa reponse.
 */
export function notifyWrittenFeedback(item: Omit<WrittenFeedback, "at">, e2e: boolean): void {
  // Les parcours de test qui portent la cle E2E n'envoient rien a Tym. Sous le
  // faux Resend de la pile, le filtre est leve pour tester le vrai chemin
  // (meme regle que announceGameStart).
  if ((e2e && resendTestBase() === null) || getConfig().missing.length) return;
  if (!notifier) notifier = createFeedbackNotifier({ send: mail => sendNotifMail({ config: getConfig(), mail }) });
  notifier.onFeedback({ ...item, at: Date.now() });
}
