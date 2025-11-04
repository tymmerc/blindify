const apiBaseEnv =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://blindify-production.up.railway.app"
    : "http://localhost:8080")

export const API_BASE_URL = apiBaseEnv.replace(/\/$/, "")

export function apiUrl(path: string): string {
  if (!path.startsWith("/")) {
    return `${API_BASE_URL}/${path}`
  }
  return `${API_BASE_URL}${path}`
}
