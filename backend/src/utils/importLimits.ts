/**
 * Bornes de l'import en masse (POST /api/import/sync-all).
 *
 * Chaque playlist demandee coute au moins un appel a Deezer ou Spotify, fait
 * depuis l'adresse du VPS. Sans borne, une seule requete de 1 Mo pouvait en
 * declencher des dizaines de milliers, et Deezer (Akamai) bloque alors l'IP du
 * VPS pour tous les joueurs pendant des heures (vu deux fois en 08/2026).
 *
 * Les plafonds suivent ce que le produit promet deja et ce que le front envoie :
 * 200 playlists par profil (limite de l'import de profil), 50 titres par
 * playlist au plus (le front demande 50 sur /jouer/, 10 ailleurs).
 */
import { isDeezerId, isSpotifyId } from "./providerIds";

export const MAX_PLAYLISTS_PER_SYNC = 200;
export const MAX_TRACKS_PER_PLAYLIST = 50;
export const DEFAULT_TRACKS_PER_PLAYLIST = 10;

export type ImportProvider = "spotify" | "deezer";

export interface SyncAllRequest {
  ok: true;
  provider: ImportProvider;
  /** Ids valides, sans doublon, dans l'ordre recu, coupes au plafond. */
  playlistIds: string[];
  perPlaylistLimit: number;
  linkId: number | null;
  /** Elements ecartes parce qu'ils n'ont pas le format du fournisseur. */
  ignored: number;
  /** Ids valides laisses de cote au-dela du plafond. */
  truncated: number;
}

export interface SyncAllRejection {
  ok: false;
  code: "missing_params" | "invalid_provider" | "invalid_playlist_ids";
  message: string;
}

export function isImportProvider(value: unknown): value is ImportProvider {
  return value === "spotify" || value === "deezer";
}

/** Vrai si `id` a le format d'un identifiant de playlist du fournisseur. */
export function isPlaylistIdFor(provider: ImportProvider, id: unknown): id is string {
  return provider === "spotify" ? isSpotifyId(id) : isDeezerId(id);
}

function perPlaylistLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return DEFAULT_TRACKS_PER_PLAYLIST;
  return Math.min(Math.floor(value), MAX_TRACKS_PER_PLAYLIST);
}

function linkIdOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Valide et borne le corps de POST /api/import/sync-all, sans rien modifier. */
export function normalizeSyncAllRequest(body: unknown): SyncAllRequest | SyncAllRejection {
  const b = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const { provider, playlistIds } = b;

  if (!provider || !Array.isArray(playlistIds) || playlistIds.length === 0) {
    return { ok: false, code: "missing_params", message: "provider et playlistIds requis." };
  }
  if (!isImportProvider(provider)) {
    return { ok: false, code: "invalid_provider", message: "Provider doit être 'spotify' ou 'deezer'." };
  }

  const valid = playlistIds.filter((id): id is string => isPlaylistIdFor(provider, id));
  const unique = [...new Set(valid)];
  if (unique.length === 0) {
    return { ok: false, code: "invalid_playlist_ids", message: "Aucun identifiant de playlist valide." };
  }

  const kept = unique.slice(0, MAX_PLAYLISTS_PER_SYNC);
  return {
    ok: true,
    provider,
    playlistIds: kept,
    perPlaylistLimit: perPlaylistLimit(b.maxTracksPerPlaylist),
    linkId: linkIdOrNull(b.linkId),
    ignored: playlistIds.length - valid.length,
    truncated: unique.length - kept.length,
  };
}
