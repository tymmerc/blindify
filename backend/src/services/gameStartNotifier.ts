/**
 * Mail a Tym quand une vraie partie a plusieurs demarre (T18, decisions de Tym
 * du 28/10/2026) :
 *
 * - declencheur : la premiere partie lancee dans une salle qui compte au moins
 *   2 vrais joueurs (A distance, Autour d'une table, Discord) ;
 * - pas de mail si Tym est dans la salle, ni pour les comptes de test (meme
 *   liste que le tableau de bord, testAccounts.ts), ni pour une partie lancee
 *   avec la cle E2E (outils de test) ;
 * - un seul mail par salle ;
 * - au plus 6 par jour (heure de Paris), puis un seul recapitulatif « et N
 *   autres salles aujourd'hui », a minuit ou au premier lancement du
 *   lendemain si le minuteur n'a pas sonne (redemarrage).
 *
 * L'etat vit en memoire : apres un redemarrage du backend, une salle deja
 * annoncee peut l'etre une seconde fois a sa partie suivante. Accepte.
 *
 * onGameStarted ne bloque jamais et ne leve jamais : l'envoi part apres, et
 * un echec est journalise, sans nouvel essai.
 */
import { logger } from "../utils/logger";
import { isOwnerAccount, isTestAccount, type AccountRef } from "./testAccounts";
import { SPECTATOR_TTL_MS, signSpectatorToken, spectatorLink } from "./spectatorToken";
import { buildOverflowMail, buildStartMail, parisDay, type NotifConfig, type NotifMail, type SendResult } from "./gameStartMail";

export const DAILY_MAIL_CAP = 6;
const NOTIFIED_MEMORY_MS = 48 * 3600_000;
const NOTIFIED_MODES = new Set(["friends", "event"]);

export type GameStartInfo = {
  roomId: number;
  roomCode: string;
  mode: string;
  discord: boolean;
  /** Tous les humains de la salle (presentateur compris). */
  players: AccountRef[];
  /** Fournisseurs des morceaux de la partie (spotify, deezer). */
  providers: Array<string | null | undefined>;
  /** Lancement par un outil de test (cle E2E valide sur la requete). */
  e2e: boolean;
};

export type Decision = { notify: true } | { notify: false; reason: "mode" | "e2e" | "tym" | "pas_assez_de_vrais_joueurs" };

export function notificationDecision(info: GameStartInfo): Decision {
  if (!info.discord && !NOTIFIED_MODES.has(info.mode)) return { notify: false, reason: "mode" };
  if (info.e2e) return { notify: false, reason: "e2e" };
  if (info.players.some(isOwnerAccount)) return { notify: false, reason: "tym" };
  const real = new Set(info.players.filter(p => !isTestAccount(p)).map(p => p.id));
  return real.size >= 2 ? { notify: true } : { notify: false, reason: "pas_assez_de_vrais_joueurs" };
}

/** Millisecondes jusqu'a minuit a Paris (plus une minute de marge). */
export function msUntilParisMidnight(now: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
  const elapsed = ((get("hour") * 60 + get("minute")) * 60 + get("second")) * 1000 + (now % 1000);
  return 24 * 3600_000 - elapsed + 60_000;
}

type Deps = {
  config: NotifConfig;
  /** SPECTATEUR_SECRET, ou null : le mail part alors sans lien. */
  secret: string | null;
  /** Base du front (FRONTEND_URL ou SPECTATEUR_BASE_URL). */
  linkBase: string;
  send: (mail: NotifMail) => Promise<SendResult>;
  now?: () => number;
  dailyCap?: number;
  schedule?: (fn: () => void, ms: number) => NodeJS.Timeout;
};

type Day = { key: string; label: string; sent: number; overflow: number; summaryDone: boolean; timer: NodeJS.Timeout | null };

export type GameStartNotifier = { onGameStarted: (info: GameStartInfo) => void };

export function createGameStartNotifier(deps: Deps): GameStartNotifier {
  const now = deps.now ?? Date.now;
  const cap = deps.dailyCap ?? DAILY_MAIL_CAP;
  const schedule = deps.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const notified = new Map<number, number>();
  let day: Day | null = null;

  const deliver = (mail: NotifMail, meta: Record<string, unknown>) => {
    void Promise.resolve()
      .then(() => deps.send(mail))
      .then(res => {
        if (res.sent) logger.info("notif_partie_envoyee", meta);
        else logger.warn("notif_partie_echec", { ...meta, detail: res.detail });
      })
      .catch(err => logger.warn("notif_partie_echec", { ...meta, detail: err instanceof Error ? err.name : "erreur" }));
  };

  const sendSummary = (d: Day) => {
    if (d.summaryDone || d.overflow === 0) return;
    d.summaryDone = true;
    if (d.timer) clearTimeout(d.timer);
    deliver(buildOverflowMail({ count: d.overflow, dayLabel: d.label }), { recapitulatif: true, salles: d.overflow });
  };

  const currentDay = (t: number): Day => {
    const label = parisDay(t);
    if (day && day.key === label) return day;
    // Nouveau jour : le recapitulatif de la veille part s'il attendait encore.
    if (day) sendSummary(day);
    day = { key: label, label, sent: 0, overflow: 0, summaryDone: false, timer: null };
    return day;
  };

  const forget = (t: number) => {
    if (notified.size < 500) return;
    for (const [id, at] of notified) if (t - at > NOTIFIED_MEMORY_MS) notified.delete(id);
  };

  const handle = (info: GameStartInfo) => {
    if (deps.config.missing.length) return;
    if (notified.has(info.roomId)) return;
    const decision = notificationDecision(info);
    if (!decision.notify) {
      logger.debug("notif_partie_ignoree", { roomId: info.roomId, reason: decision.reason });
      return;
    }
    const t = now();
    forget(t);
    notified.set(info.roomId, t);
    const d = currentDay(t);
    if (d.sent >= cap) {
      d.overflow += 1;
      if (!d.timer && !d.summaryDone) {
        const timer = schedule(() => sendSummary(d), msUntilParisMidnight(t));
        timer.unref?.();
        d.timer = timer;
      }
      logger.info("notif_partie_plafond", { roomId: info.roomId, salles: d.overflow });
      return;
    }
    d.sent += 1;
    const link = deps.secret
      ? spectatorLink(
          deps.linkBase,
          info.roomCode,
          signSpectatorToken({ roomCode: info.roomCode, roomId: info.roomId, expiresAt: t + SPECTATOR_TTL_MS }, deps.secret),
        )
      : null;
    const mail = buildStartMail({ mode: info.mode, discord: info.discord, players: info.players, providers: info.providers, startedAt: t, link });
    deliver(mail, { roomId: info.roomId, joueurs: info.players.length });
  };

  return {
    onGameStarted(info) {
      try {
        handle(info);
      } catch (err) {
        logger.warn("notif_partie_echec", { detail: err instanceof Error ? err.name : "erreur" });
      }
    },
  };
}
