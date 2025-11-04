import "express-serve-static-core"
import "cookie-session"

declare module "cookie-session" {
  interface CookieSessionObject {
    userId?: number
    spotifyId?: string
    accessToken?: string
    refreshToken?: string
    expiresAt?: number
    oauthState?: string
  }
}

declare module "express-serve-static-core" {
  interface Request {
    session?: import("cookie-session").CookieSessionObject | null
  }
}
