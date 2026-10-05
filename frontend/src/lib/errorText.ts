import { ApiError } from "./apiClient"

// Textes d'erreur montres au joueur. Seules les erreurs du backend (ApiError
// avec un code) ont un message ecrit pour lui, en francais. Le reste vient du
// navigateur ou d'un proxy, en anglais : "Failed to fetch" (Chrome), "Load
// failed" (Safari), "Bad Gateway"... On ne l'affiche jamais tel quel.

/** Message du backend s'il en a un, sinon `fallback`. */
export function playerErrorText(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.code && err.message ? err.message : fallback
}

/** "missing" : le defi n'existe pas (ou plus). "network" : on peut reessayer. */
export type ChallengeLoadProblem = "missing" | "network"

/** 400 (code mal forme) et 404 : defi introuvable ; tout le reste se retente. */
export function challengeLoadProblem(err: unknown): ChallengeLoadProblem {
  return err instanceof ApiError && (err.status === 400 || err.status === 404) ? "missing" : "network"
}
