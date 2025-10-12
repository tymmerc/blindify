import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import helmet from "helmet"
import session from "cookie-session"
import rateLimit from "express-rate-limit"
import slowDown from "express-slow-down"
import { json, urlencoded } from "body-parser"
import axios from "axios"
import querystring from "querystring"
import { Server } from "socket.io"
import http from "http"
import { Pool } from "pg"

dotenv.config()
const app = express()
const server = http.createServer(app)

const FRONTEND_URLS = [
  "https://blindify.vercel.app",
  "https://blindify-git-main-tymmercier-gmailcoms-projects.vercel.app"
]

// === Security / Middlewares ===
app.use(helmet())
app.use(cors({ origin: FRONTEND_URLS, credentials: true }))
app.use(json())
app.use(urlencoded({ extended: true }))
app.use(rateLimit({ windowMs: 60_000, max: 60 }))
app.use(slowDown({ windowMs: 60_000, delayAfter: 30, delayMs: 200 }))
app.use(
  session({
    name: "blindify_session",
    secret: process.env.SESSION_SECRET!,
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: "lax",
  })
)

// === PostgreSQL connection ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost")
    ? false
    : { rejectUnauthorized: false }
})
pool.connect()
  .then(() => console.log("✅ PostgreSQL connected"))
  .catch(err => console.error("❌ PostgreSQL error:", err))

// === WebSocket setup ===
const io = new Server(server, {
  cors: { origin: FRONTEND_URLS, methods: ["GET", "POST"] },
})

io.on("connection", socket => {
  console.log(`🔌 Client connected: ${socket.id}`)
  socket.on("disconnect", () => console.log(`❌ Client disconnected: ${socket.id}`))
})

// ============================
//   SPOTIFY AUTHENTICATION
// ============================

app.get("/auth/login", (_, res) => {
  const params = querystring.stringify({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: [
      "user-read-private",
      "user-read-email",
      "user-library-read",
      "user-read-playback-state",
      "user-modify-playback-state",
    ].join(" "),
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
  })
  res.redirect(`https://accounts.spotify.com/authorize?${params}`)
})

app.get("/auth/callback", async (req, res) => {
  const code = req.query.code as string
  if (!code) return res.status(400).send("Missing authorization code")

  try {
    const tokenResponse = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
        client_id: process.env.SPOTIFY_CLIENT_ID!,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET!,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    )

    const { access_token, refresh_token } = tokenResponse.data
    res.redirect(`${process.env.FRONTEND_URL}/menu?access_token=${access_token}&refresh_token=${refresh_token}`)
  } catch (err) {
    console.error("Spotify callback error:", err)
    res.status(500).send("Authentication failed")
  }
})

app.get("/auth/refresh", async (req, res) => {
  const refresh_token = req.query.refresh_token as string
  if (!refresh_token) return res.status(400).send("Missing refresh token")

  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token,
        client_id: process.env.SPOTIFY_CLIENT_ID!,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET!,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    )

    res.json(response.data)
  } catch (err) {
    console.error("Refresh token error:", err)
    res.status(500).send("Failed to refresh token")
  }
})

// ============================
//   API ROUTES
// ============================

// Check Spotify auth status
app.get("/api/auth/check", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "")
  if (!token) return res.json({ authenticated: false })

  try {
    const me = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
    res.json({ authenticated: true, user: me.data })
  } catch {
    res.json({ authenticated: false })
  }
})

// Import liked songs
app.get("/api/spotify/liked", async (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "")
  if (!token) return res.status(401).json({ error: "Missing token" })

  try {
    const response = await axios.get("https://api.spotify.com/v1/me/tracks?limit=50", {
      headers: { Authorization: `Bearer ${token}` },
    })
    res.json(response.data)
  } catch (err) {
    console.error("Spotify liked tracks error:", err)
    res.status(500).json({ error: "Failed to fetch liked tracks" })
  }
})

// Multiplayer rooms
const rooms: Record<string, { id: string; name: string; players: string[] }> = {}

app.post("/api/rooms/create", (req, res) => {
  const { name } = req.body
  const id = Math.random().toString(36).substring(2, 8).toUpperCase()
  rooms[id] = { id, name, players: [] }
  res.json({ room: rooms[id] })
})

app.post("/api/rooms/join", (req, res) => {
  const { code, username } = req.body
  const room = rooms[code]
  if (!room) return res.status(404).json({ error: "Room not found" })
  if (room.players.length >= 8) return res.status(403).json({ error: "Room full" })
  room.players.push(username)
  io.emit("roomUpdate", room)
  res.json({ room })
})

// ============================
//   SERVER START
// ============================
const PORT = process.env.PORT || 4000
server.listen(PORT, () => console.log(`🚀 Blindify backend running on port ${PORT}`))
