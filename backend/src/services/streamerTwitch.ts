/**
 * Chat Twitch d'une partie streamer (T5b) : le lien entre le lecteur IRC
 * (twitchReader.ts) et la partie (streamerGame.ts).
 *
 * - Le streamer donne le nom de sa chaine au lancement. Le lecteur s'ouvre
 *   avec la partie et se ferme a sa fin (fin normale, « Finir », hote parti).
 * - Seuls les messages `!b titre - artiste` comptent, et seulement pendant la
 *   phase de reponse du public. Une reponse par pseudo Twitch et par manche
 *   (le registre des viewers le garantit, comme pour la page).
 * - Un viewer du chat est une fiche a part (source « chat ») : jamais confondu
 *   avec un pseudo de la page, meme identique.
 */
import type { Server as IOServer } from "socket.io";
import { logger } from "../utils/logger";
import { emitToMedia } from "./streamerChannels";
import { getStreamerState, onStreamerGameEnd, recordViewerAnswer, refreshViewerCount } from "./streamerGame";
import { chatViewer } from "./streamerViewers";
import { looksLikeAnswer, parseChatAnswer, type ChatLine } from "./twitchChat";
import { openTwitchReader, type ReaderStatus, type TwitchReader } from "./twitchReader";

type Opener = typeof openTwitchReader;

const readers = new Map<string, TwitchReader>();
let opener: Opener = openTwitchReader;

/** Tests : remplace l'ouverture du lecteur (faux WebSocket, faux serveur). */
export function setTwitchOpenerForTests(fn: Opener | null): void {
  opener = fn ?? openTwitchReader;
}

export function twitchChannelOf(roomCode: string): string | null {
  return readers.get(roomCode)?.channel ?? null;
}

/** Un message du chat : une reponse `!b`, pendant la phase du public, sinon rien. */
export function handleChatLine(io: IOServer, roomCode: string, line: ChatLine, at = Date.now()): void {
  const state = getStreamerState(roomCode);
  if (!state || state.phase !== "GUESSING_CHAT") return;
  const answer = parseChatAnswer(line.text);
  if (!answer) return;
  const found = chatViewer(roomCode, line.login, line.displayName, at);
  if (!found) return;
  recordViewerAnswer(io, roomCode, found.viewer.id, answer, at);
  if (found.created) refreshViewerCount(io, roomCode);
}

function announce(io: IOServer, roomCode: string, channel: string, status: ReaderStatus): void {
  emitToMedia(io, roomCode, "streamer:twitch", { roomCode, channel, status });
}

/** Ouvre la lecture du chat de `channel` pour la partie (en remplace une ancienne). */
export function startTwitch(io: IOServer, roomCode: string, channel: string): void {
  stopTwitch(roomCode);
  const reader = opener({
    channel,
    // Le plafond par seconde ne compte que les `!b` : le bavardage d'un raid
    // ne fait pas jeter les reponses.
    accept: looksLikeAnswer,
    onLine: line => handleChatLine(io, roomCode, line),
    onStatus: status => announce(io, roomCode, channel, status),
  });
  readers.set(roomCode, reader);
  logger.info("twitch_lecture_ouverte", { roomCode });
}

export function stopTwitch(roomCode: string): void {
  const reader = readers.get(roomCode);
  if (!reader) return;
  readers.delete(roomCode);
  reader.close();
}

export function stopAllTwitchForTests(): void {
  for (const code of [...readers.keys()]) stopTwitch(code);
}

// Fin de partie, quelle qu'en soit la raison : plus de lecture du chat.
onStreamerGameEnd(stopTwitch);
