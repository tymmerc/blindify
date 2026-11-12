/**
 * API YouTube Data v3 (lecture des playlists publiques, jamais le son).
 *
 * YOUTUBE_API_KEY : cle restreinte a cette API et aux adresses du serveur,
 * dans le .env du serveur seulement. Sans elle, l'import YouTube repond qu'il
 * n'est pas disponible ; le reste du jeu ne change pas.
 *
 * YOUTUBE_API_BASE : surchargeable UNIQUEMENT pour la pile de test
 * (tools/test-stack), qui pointe sur une fausse API locale, comme le faux Deezer.
 */
export function youtubeApiBase(): string {
  return (process.env.YOUTUBE_API_BASE || "https://www.googleapis.com/youtube/v3").replace(/\/+$/, "");
}

export function youtubeApiKey(): string | null {
  const key = process.env.YOUTUBE_API_KEY?.trim();
  return key ? key : null;
}
