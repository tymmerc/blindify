// Deezer signe ses previews avec une expiration (`?hdnea=exp=<unixSec>~...`). Passe ce delai,
// l'URL renvoie 403 (text/html) et le navigateur leve NotSupportedError -> AUCUN son en jeu.
// Les URLs sont stockees en base et peuvent dater de plusieurs mois -> on doit les detecter.

/**
 * Validite minimale d'un extrait qu'on va jouer bientot (manches a venir, cache
 * Deezer). Les liens vivent ~15 min : une partie de 20 manches les depasse, et
 * un lien tire du cache pouvait mourir 3 min apres le lancement (T35, 12/11).
 */
export const PREVIEW_MIN_VALIDITY_MS = 5 * 60_000;

/** Heure d'expiration (ms) d'un extrait signe, ou null s'il n'en porte pas. */
export function previewExpiresAt(url: string | null | undefined): number | null {
  if (!url) return null;
  const m = url.match(/exp=(\d{8,})/);
  if (!m) return null;
  const exp = parseInt(m[1], 10);
  return Number.isFinite(exp) ? exp * 1000 : null;
}

/** Expire, ou valable moins de `marginMs` (60 s par defaut). Sans signature : jamais expire. */
export function isExpiredPreview(url: string | null | undefined, marginMs = 60_000): boolean {
  const expiresAt = previewExpiresAt(url);
  return expiresAt !== null && expiresAt <= Date.now() + marginMs;
}
