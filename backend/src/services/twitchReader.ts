/**
 * Lecteur du chat Twitch d'une partie streamer (T5b).
 *
 * - IRC sur WebSocket (wss://irc-ws.chat.twitch.tv:443), en anonyme : pseudo
 *   justinfan…, aucun compte, aucun secret, lecture seule.
 * - Une connexion par partie, fermee a la fin de la partie ou quand l'hote part.
 * - Coupure : reconnexion avec un delai qui double (1 s, 2 s, 4 s… 30 s au plus),
 *   remis a zero quand Twitch accueille la connexion.
 * - Au-dela d'un plafond de messages par seconde, le surplus est ignore.
 *
 * Le WebSocket est celui de Node 22 (global), injectable pour les tests et la
 * pile isolee (TWITCH_IRC_URL vise le faux serveur IRC, sans Internet).
 */
import { logger } from "../utils/logger";
import { anonymousNick, chatLineOf, parseIrcLine, type ChatLine } from "./twitchChat";

export const DEFAULT_IRC_URL = "wss://irc-ws.chat.twitch.tv:443";
export const MAX_MESSAGES_PER_SECOND = 50;
const BACKOFF_START_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;

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

export function ircUrl(env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env): string {
  return env.TWITCH_IRC_URL?.trim() || DEFAULT_IRC_URL;
}

export function openTwitchReader(opts: ReaderOptions): TwitchReader {
  const url = opts.url ?? ircUrl();
  const open = opts.openSocket ?? defaultOpen;
  const now = opts.now ?? Date.now;
  const limit = opts.maxPerSecond ?? MAX_MESSAGES_PER_SECOND;
  let ws: WsLike | null = null;
  let closed = false;
  let delay = BACKOFF_START_MS;
  let retry: NodeJS.Timeout | null = null;
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

  const handle = (raw: string) => {
    for (const lineText of raw.split("\r\n")) {
      const msg = lineText ? parseIrcLine(lineText) : null;
      if (!msg) continue;
      if (msg.command === "PING") {
        ws?.send(`PONG :${msg.params[0] ?? "tmi.twitch.tv"}`);
      } else if (msg.command === "001") {
        delay = BACKOFF_START_MS;
        status("connecte");
      } else if (msg.command === "RECONNECT") {
        ws?.close();
      } else if (msg.command === "PRIVMSG") {
        const line = chatLineOf(msg);
        if (line && line.channel === opts.channel && allow()) opts.onLine(line);
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
    socket.onopen = () => {
      socket.send("CAP REQ :twitch.tv/tags");
      socket.send(`NICK ${anonymousNick()}`);
      socket.send(`JOIN #${opts.channel}`);
    };
    socket.onmessage = ev => {
      if (typeof ev.data === "string") handle(ev.data);
    };
    socket.onerror = () => {
      // onclose suit toujours : la reprise se decide la.
    };
    socket.onclose = () => {
      if (ws === socket) ws = null;
      scheduleRetry();
    };
  };

  connect();

  return {
    channel: opts.channel,
    close() {
      if (closed) return;
      closed = true;
      if (retry) clearTimeout(retry);
      retry = null;
      ws?.close();
      ws = null;
      status("ferme");
    },
  };
}
