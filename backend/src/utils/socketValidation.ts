/**
 * Lightweight, dependency-free validation for socket payloads.
 *
 * Socket events are an untrusted boundary: a malicious or buggy client can send
 * arbitrarily large or malformed payloads. These helpers bound string sizes
 * (DoS prevention) and coerce types, without pulling in a schema library.
 */

export const MAX_ROOM_CODE_LEN = 16;
export const MAX_GUESS_LEN = 120;
export const MAX_CHAT_LEN = 500;

/** Returns a sane room code or null. Room codes are short alphanumeric strings. */
export function validRoomCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_ROOM_CODE_LEN) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

/** Trims and caps a free-text string; returns undefined for non-strings. */
export function clampText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, max);
}

/** Coerces to a finite integer or null. */
export function toIntOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
