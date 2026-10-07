// Deezer signe ses previews avec une expiration (`?hdnea=exp=<unixSec>~...`). Passe ce delai,
// l'URL renvoie 403 (text/html) et le navigateur leve NotSupportedError -> AUCUN son en jeu.
// Les URLs sont stockees en base et peuvent dater de plusieurs mois -> on doit les detecter.
export function isExpiredPreview(url: string | null | undefined): boolean {
  if (!url) return false;
  const m = url.match(/exp=(\d{8,})/);
  if (!m) return false;
  const exp = parseInt(m[1], 10);
  if (!Number.isFinite(exp)) return false;
  return exp * 1000 <= Date.now() + 60_000; // expiree, ou moins de 60s restantes
}
