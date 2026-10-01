/**
 * Formats des identifiants Spotify et Deezer, verifies a l'entree avant d'etre
 * colles dans une URL d'API (alertes CodeQL js/request-forgery 2, 3 et 4).
 *
 * La regex ne remplace pas encodeURIComponent dans l'URL : CodeQL ne reconnait
 * que l'encodage comme assainisseur, une garde par regex seule laisse l'alerte
 * ouverte. Les deux vont ensemble.
 */

// Id Spotify (playlist, titre, album) : 22 caracteres base62.
export const SPOTIFY_ID_RE = /^[A-Za-z0-9]{22}$/;

// Id Deezer (playlist, profil) : numerique. 20 chiffres laissent une large marge
// (les ids actuels en font une dizaine).
export const DEEZER_ID_RE = /^\d{1,20}$/;

export function isSpotifyId(value: unknown): value is string {
  return typeof value === "string" && SPOTIFY_ID_RE.test(value);
}

export function isDeezerId(value: unknown): value is string {
  return typeof value === "string" && DEEZER_ID_RE.test(value);
}
