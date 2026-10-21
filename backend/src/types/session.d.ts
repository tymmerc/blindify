import "express-serve-static-core"
import "cookie-session"

declare module "cookie-session" {
  interface CookieSessionObject {
    userId?: number
    sessionToken?: string
  }
}

declare module "express-serve-static-core" {
  interface Request {
    session?: import("cookie-session").CookieSessionObject | null
  }
}
