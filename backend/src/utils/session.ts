import type { Request, Response } from "express"
import { pool } from "../config/db"
import { makeSpotify } from "../config/spotify"
import type { AuthenticatedUser } from "../types/user"

interface SessionOptions {
  refresh?: boolean
  forceRefresh?: boolean
}

export interface SessionContext {
  user: AuthenticatedUser
  accessToken: string
  refreshToken: string | null
}

type SessionData = NonNullable<Request["session"]>

async function refreshSpotifyToken(
  user: AuthenticatedUser,
  session: SessionData
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: number }> {
  const refreshToken = session.refreshToken || user.refresh_token
  if (!refreshToken) {
    throw new Error("Missing refresh token")
  }

  const spotify = makeSpotify(undefined, refreshToken)
  const refreshed = await spotify.refreshAccessToken()
  const newAccess = refreshed.body.access_token
  const newRefresh = refreshed.body.refresh_token || refreshToken
  const expiresIn = refreshed.body.expires_in ?? 3600
  const expiresAt = Date.now() + expiresIn * 1000

  session.accessToken = newAccess
  session.refreshToken = newRefresh
  session.expiresAt = expiresAt

  await pool.query(
    `UPDATE users SET access_token=$1, refresh_token=$2, updated_at=NOW() WHERE id=$3`,
    [newAccess, newRefresh, user.id]
  )

  return { accessToken: newAccess, refreshToken: newRefresh, expiresAt }
}

function ensureSessionObject(req: Request): SessionData {
  if (!req.session) {
    req.session = {}
  }
  return req.session as SessionData
}

export async function getSessionContext(
  req: Request,
  res?: Response,
  options: SessionOptions = {}
): Promise<SessionContext | null> {
  const session = ensureSessionObject(req)

  if (!session.userId) {
    if (res) res.status(401).json({ error: "Unauthorized" })
    return null
  }

  const { rows } = await pool.query<AuthenticatedUser>(`SELECT * FROM users WHERE id=$1 LIMIT 1`, [session.userId])
  const user = rows[0]

  if (!user) {
    req.session = null
    if (res) res.status(401).json({ error: "Unauthorized" })
    return null
  }

  session.userId = user.id
  session.spotifyId = user.spotify_id

  let accessToken = session.accessToken || user.access_token || undefined
  let refreshToken = session.refreshToken || user.refresh_token || null

  const shouldForceRefresh = options.forceRefresh === true
  const expiresAt = session.expiresAt ?? 0
  const needsRefresh = shouldForceRefresh || (!!refreshToken && (!accessToken || expiresAt <= Date.now() + 60_000))

  if (needsRefresh) {
    try {
      const refreshed = await refreshSpotifyToken(user, session)
      accessToken = refreshed.accessToken
      refreshToken = refreshed.refreshToken
    } catch (err) {
      console.error("token_refresh_failed", err)
      req.session = null
      if (res) res.status(401).json({ error: "Unauthorized" })
      return null
    }
  }

  if (!accessToken) {
    if (res) res.status(401).json({ error: "Unauthorized" })
    return null
  }

  req.session = session

  if (options.refresh !== false && refreshToken && session.expiresAt && session.expiresAt <= Date.now() + 60_000) {
    try {
      const refreshed = await refreshSpotifyToken(user, session)
      accessToken = refreshed.accessToken
      refreshToken = refreshed.refreshToken
      req.session = session
    } catch (err) {
      console.error("token_refresh_failed", err)
      req.session = null
      if (res) res.status(401).json({ error: "Unauthorized" })
      return null
    }
  }

  return { user, accessToken, refreshToken }
}

export function clearSession(req: Request): void {
  req.session = null
}
