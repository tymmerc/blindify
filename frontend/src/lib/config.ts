const rawBase =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://tymmerc.eu/blindify"
    : "http://localhost:3000")

// Remove trailing slashes and strip a trailing "/api" to avoid "/api/api" when paths already include /api
const normalized = rawBase.replace(/\/+$/, "")
export const API_BASE_URL = normalized.endsWith("/api")
  ? normalized.slice(0, -4)
  : normalized

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`
  }
  return `${API_BASE_URL}${path}`
}
