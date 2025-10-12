import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import slowDown from "express-slow-down";
import session from "cookie-session";
import { json, urlencoded } from "body-parser";
import { Pool } from "pg";
import { Server } from "socket.io";
import http from "http";
import axios from "axios";
import querystring from "querystring";

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "https://blindify-zeta.vercel.app",
      "https://blindify.vercel.app",
      "https://blindify-git-main-tymmercier-gmailcoms-projects.vercel.app"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

// === Middlewares ===
app.use(helmet());
app.use(cors({
  origin: [
    "https://blindify-zeta.vercel.app",
    "https://blindify.vercel.app",
    "https://blindify-git-main-tymmercier-gmailcoms-projects.vercel.app"
  ],
  credentials: true
}));
app.use(json());
app.use(urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 60_000, max: 60 }));
app.use(slowDown({ windowMs: 60_000, delayAfter: 30, delayMs: 200 }));
app.use(session({
  secret: process.env.SESSION_SECRET!,
  maxAge: 24 * 60 * 60 * 1000
}));

// === PostgreSQL ===
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
pool.connect()
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) => console.error("❌ Database connection error:", err));

// === Spotify Auth Routes ===

// Step 1 – redirect user to Spotify
app.get("/auth/login", (_, res) => {
  const params = querystring.stringify({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: "user-read-private user-read-email user-library-read user-read-playback-state user-modify-playback-state",
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
  });
  res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});

// Step 2 – Spotify redirects back to callback
app.get("/auth/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) return res.status(400).send("Missing authorization code");

  try {
    const response = await axios.post(
      "https://accounts.spotify.com/api/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
        client_id: process.env.SPOTIFY_CLIENT_ID!,
        client_secret: process.env.SPOTIFY_CLIENT_SECRET!,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token } = response.data;
    res.redirect(`${process.env.FRONTEND_URL}/menu?access_token=${access_token}&refresh_token=${refresh_token}`);
  } catch (error: any) {
    console.error("❌ Spotify callback error:", error.response?.data || error.message);
    res.status(500).send("Authentication failed");
  }
});

// === Auth Verification Route ===
app.get("/api/auth/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ authenticated: false });

    const token = authHeader.split(" ")[1];
    const response = await axios.get("https://api.spotify.com/v1/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    res.json({
      authenticated: true,
      user: {
        id: response.data.id,
        name: response.data.display_name,
        email: response.data.email,
      },
    });
  } catch (error: any) {
    console.error("❌ Spotify auth check failed:", error.response?.data || error.message);
    res.status(401).json({ authenticated: false });
  }
});

// === API Routes ===
app.get("/", (_, res) => res.send("Blindify backend operational."));
app.get("/health", (_, res) => res.json({ status: "ok" }));
app.post("/games", (req, res) => res.json({ message: "Game created", body: req.body }));

// === WebSocket ===
io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  socket.on("disconnect", () => console.log(`❌ Client disconnected: ${socket.id}`));
});

// === Server start ===
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
