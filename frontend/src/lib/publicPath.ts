/**
 * Prefix a path with the app basePath so assets work both locally and once exported.
 * Default matches next.config.mjs ("/blindify"); can be overridden with NEXT_PUBLIC_BASE_PATH.
 */
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/blindify").replace(/\/+$/, "")

export function publicPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`
  if (!BASE_PATH) return normalized
  return `${BASE_PATH}${normalized}`
}
