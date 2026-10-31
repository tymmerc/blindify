/**
 * Qui recoit quoi dans une partie streamer (T5).
 *
 * Deux publics, deux vues de l'etat, deux rooms socket.io :
 *
 * - « media » (stream:media:CODE) : l'hote et l'overlay OBS. Ils recoivent
 *   l'extrait (previewUrl), puisque l'overlay joue le son dans le stream.
 *   Le titre, l'artiste et la pochette restent caches jusqu'au reveal : la
 *   page de l'hote est souvent a l'ecran, et en duo il devine lui aussi.
 * - « public » : la room de la salle (anciens participants) et
 *   stream:viewers:CODE (page /live). Jamais d'extrait, a aucun moment, jamais
 *   l'id du morceau, jamais les metadonnees. Le titre n'arrive qu'au reveal.
 *
 * Le public est envoye « sauf media » : l'hote est aussi dans la room de la
 * salle (presence du lobby) et ne doit pas recevoir la vue sans extrait.
 */
import type { Server as IOServer } from "socket.io";
import type { StreamerRound, StreamerState } from "../types/streamer";

export const mediaRoom = (roomCode: string): string => `stream:media:${roomCode}`;
export const viewersRoom = (roomCode: string): string => `stream:viewers:${roomCode}`;

/** Phases ou quelqu'un doit encore deviner (le streamer devine en REVEAL_PARTIAL). */
export const HIDDEN_PHASES: ReadonlySet<StreamerState["phase"]> = new Set([
  "STARTING_ROUND",
  "GUESSING_CHAT",
  "REVEAL_PARTIAL",
  "GUESSING_STREAMER",
]);

function hiddenTrack(t: StreamerRound, previewUrl: string | null): StreamerRound {
  return {
    round: t.round,
    // trackId/audioSourceId sont l'external_id du provider : les laisser
    // permettait de resoudre la reponse via api.deezer.com/track/{id}.
    trackId: "hidden",
    title: "",
    artist: "",
    album: null,
    previewUrl,
    albumCover: null,
    metadata: null,
    trackSource: t.trackSource,
  };
}

/** Vue de l'hote et de l'overlay : extrait present, reponse cachee avant le reveal. */
export function mediaView(state: StreamerState): StreamerState {
  const t = state.currentTrack;
  if (!t || !HIDDEN_PHASES.has(state.phase)) return state;
  return { ...state, currentTrack: hiddenTrack(t, t.previewUrl) };
}

/** Vue des viewers : jamais d'extrait, ni d'id, ni de metadonnees. */
export function viewerView(state: StreamerState): StreamerState {
  const t = state.currentTrack;
  if (!t) return state;
  if (HIDDEN_PHASES.has(state.phase)) return { ...state, currentTrack: hiddenTrack(t, null) };
  return {
    ...state,
    currentTrack: {
      round: t.round,
      trackId: "hidden",
      title: t.title,
      artist: t.artist,
      album: t.album ?? null,
      previewUrl: null,
      albumCover: t.albumCover ?? null,
      metadata: null,
      trackSource: t.trackSource,
      provider: t.provider ?? null,
    },
  };
}

/** Envoie l'etat a chaque public, dans sa vue. */
export function emitStreamerState(io: IOServer, roomCode: string, event: string, state: StreamerState): void {
  io.to(mediaRoom(roomCode)).emit(event, mediaView(state));
  io.to(roomCode).to(viewersRoom(roomCode)).except(mediaRoom(roomCode)).emit(event, viewerView(state));
}

/** Petit evenement reserve a l'hote et a l'overlay (compteurs, liste des pseudos). */
export function emitToMedia(io: IOServer, roomCode: string, event: string, payload: unknown): void {
  io.to(mediaRoom(roomCode)).emit(event, payload);
}
