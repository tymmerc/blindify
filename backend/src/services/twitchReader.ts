/**
 * Lecteur du chat Twitch d'une partie streamer (T5b).
 *
 * - IRC sur WebSocket (wss://irc-ws.chat.twitch.tv:443), en anonyme : PASS
 *   SCHMOOPIIE puis pseudo justinfan…, comme tmi.js. Aucun compte, aucun
 *   secret, lecture seule.
 * - Une connexion par partie, fermee a la fin de la partie ou quand l'hote part.
 * - Coupure : reprise avec un delai qui double (1 s, 2 s, 4 s… 30 s au plus).
 *   Le delai ne repart a 1 s que si la connexion a tenu au moins 10 s apres
 *   l'accueil de Twitch : une connexion qui tombe aussitot ne fait pas boucler.
 * - Connexion muette (ni message ni PING pendant 6 min) ou ouverture qui
 *   traine (pas d'accueil en 15 s) : on ferme, la reprise prend le relais.
 * - Seules les lignes candidates (filtre `accept`, `!b` pour le jeu) entament
 *   le plafond par seconde : le bavardage d'un raid ne mange pas le quota.
 *
 * Le WebSocket est celui de Node 22 (global), injectable pour les tests.
 * TWITCH_IRC_URL ne vaut que pour une adresse locale (faux serveur de la pile).
 */
import { logger } from "../utils/logger";
import { CHANNEL_FORMAT, anonymousNick, chatLineOf, parseIrcLine, type ChatLine } from "./twitchChat";

export const DEFAULT_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
export const MAX_MESSAGES_PER_SECOND = 50;
export const IDLE_TIMEOUT_MS = 6 * 60_000;
export const OPEN_TIMEOUT_MS = 15_000;
/** Une connexion qui a tenu ce temps apres l'accueil remet le delai de reprise a 1 s. */
export const STABLE_AFTER_MS = 10_000;
const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const LOCAL_IRC_URL = /^ws:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?(\/[A-Za-z0-9_\-/]*)?$/;

/** Ce dont le lecteur a besoin d'un WebSocket (celui de Node, ou un faux). */
export interface WsLike {
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type ReaderStatus = "connexion" | "connecte" | "reconnexion" | "ferme";

export interface ReaderOptions {
  channel: string;
  onLine: (line: ChatLine) => void;
  onStatus?: (status: ReaderStatus) => void;
  /** Lignes qui comptent (avant le plafond par seconde). Par defaut : toutes. */
  accept?: (text: string) => boolean;
  url?: string;
  openSocket?: (url: string) => WsLike;
  now?: () => number;
  maxPerSecond?: number;
}

export interface TwitchReader {
  readonly channel: string;
  close(): void;
}

function defaultOpen(url: string): WsLike {
  const Ws = (globalThis as { WebSocket?: new (u: string) => WsLike }).WebSocket;
  if (!Ws) throw new Error("WebSocket indisponible (Node 22 requis)");
  return new Ws(url);
}

let warnedUrl = false;

/**
 * Adresse du chat : le vrai Twitch, sauf un faux serveur local pour la pile.
 * Toute autre valeur de TWITCH_IRC_URL est ignoree (avertissement une fois).
 */
export function ircUrl(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string {
  const raw = env.TWITCH_IRC_URL?.trim();
  if (!raw) return DEFAULT_IRC_URL;
  if (LOCAL_IRC_URL.test(raw)) return raw;
  if (!warnedUrl) {
    warnedUrl = true;
    logger.warn("twitch_irc_url_ignoree", { raison: "seule une adresse ws:// locale est acceptee" });
  }
  return DEFAULT_IRC_URL;
}

/** Au demarrage : dit tout de suite si TWITCH_IRC_URL est ignoree. */
export function checkTwitchConfig(): void {
  ircUrl();
}

export function openTwitchReader(opts: ReaderOptions): TwitchReader {
  if (!CHANNEL_FORMAT.test(opts.channel)) throw new Error("nom de chaine Twitch invalide");
  const url = opts.url ?? ircUrl();
  const open = opts.openSocket ?? defaultOpen;
  const now = opts.now ?? Date.now;
  const limit = opts.maxPerSecond ?? MAX_MESSAGES_PER_SECOND;
  const accept = opts.accept ?? (() => true);
  let ws: WsLike | null = null;
  let closed = false;
  let delay = BACKOFF_START_MS;
  let welcomedAt: number | null = null;
  let retry: NodeJS.Timeout | null = null;
  let watchdog: NodeJS.Timeout | null = null;
  let windowStart = 0;
  let inWindow = 0;
  let dropped = 0;

  const status = (s: ReaderStatus) => opts.onStatus?.(s);

  const allow = (): boolean => {
    const t = now();
    if (t - windowStart >= 1_000) {
      if (dropped) logger.info("twitch_messages_ignores", { channel: opts.channel, dropped });
      windowStart = t;
      inWindow = 0;
      dropped = 0;
    }
    inWindow += 1;
    if (inWindow > limit) dropped += 1;
    return inWindow <= limit;
  };

  /** Rearme le chien de garde : `ms` sans rien recevoir, et la connexion est fermee. */
  const arm = (socket: WsLike, ms: number) => {
    if (watchdog) clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      watchdog = null;
      logger.info("twitch_connexion_muette", { channel: opts.channel });
      socket.close();
    }, ms);
    watchdog.unref?.();
  };

  const handleLine = (lineText: string) => {
    const msg = parseIrcLine(lineText);
    if (!msg) return;
    if (msg.command === "PING") {
      ws?.send(`PONG :${msg.params[0] ?? "tmi.twitch.tv"}`);
    } else if (msg.command === "001") {
      welcomedAt = now();
      status("connecte");
    } else if (msg.command === "RECONNECT") {
      ws?.close();
    } else if (msg.command === "PRIVMSG") {
      const line = chatLineOf(msg);
      if (line && line.channel === opts.channel && accept(line.text) && allow()) opts.onLine(line);
    }
  };

  const handle = (raw: string) => {
    for (const lineText of raw.split("\r\n")) {
      if (!lineText) continue;
      // Une ligne qui plante ne doit ni tuer le processus ni les lignes suivantes.
      try {
        handleLine(lineText);
      } catch (err) {
        logger.error("twitch_ligne_en_erreur", { channel: opts.channel, error: err });
      }
    }
  };

  const scheduleRetry = () => {
    if (closed || retry) return;
    status("reconnexion");
    retry = setTimeout(() => {
      retry = null;
      connect();
    }, delay);
    retry.unref?.();
    delay = Math.min(delay * 2, BACKOFF_MAX_MS);
  };

  const onClosed = (socket: WsLike) => {
    if (ws !== socket) return;
    ws = null;
    if (watchdog) clearTimeout(watchdog);
    watchdog = null;
    // Le delai ne repart a zero que pour une connexion qui a vraiment tenu.
    if (welcomedAt !== null && now() - welcomedAt >= STABLE_AFTER_MS) delay = BACKOFF_START_MS;
    welcomedAt = null;
    scheduleRetry();
  };

  const connect = () => {
    if (closed) return;
    status("connexion");
    let socket: WsLike;
    try {
      socket = open(url);
    } catch (err) {
      logger.error("twitch_connexion_impossible", { channel: opts.channel, error: err });
      scheduleRetry();
      return;
    }
    ws = socket;
    arm(socket, OPEN_TIMEOUT_MS);
    socket.onopen = () => {
      socket.send("CAP REQ :twitch.tv/tags");
      socket.send("PASS SCHMOOPIIE");
      socket.send(`NICK ${anonymousNick()}`);
      socket.send(`JOIN #${opts.channel}`);
    };
    socket.onmessage = ev => {
      if (ws !== socket) return;
      if (typeof ev.data === "string") handle(ev.data);
      // Avant l'accueil de Twitch, le delai d'ouverture court toujours.
      if (welcomedAt !== null) arm(socket, IDLE_TIMEOUT_MS);
    };
    socket.onerror = () => {
      // onclose suit toujours : la reprise se decide la.
    };
    socket.onclose = () => onClosed(socket);
  };

  connect();

  return {
    channel: opts.channel,
    close() {
      if (closed) return;
      closed = true;
      if (retry) clearTimeout(retry);
      if (watchdog) clearTimeout(watchdog);
      retry = null;
      watchdog = null;
      const socket = ws;
      ws = null;
      socket?.close();
      status("ferme");
    },
  };
}
