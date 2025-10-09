import express from "express";
import http from "http";
import { Server } from "socket.io";
import SpotifyWebApi from "spotify-web-api-node";
import cookieSession from "cookie-session";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

// Middleware
app.use(express.json());

// <CHANGE> CORS configuré pour accepter les requêtes depuis l'IP du frontend
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);

app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "supersecret123"],
    maxAge: 24 * 60 * 60 * 1000,
  })
);

// Spotify API
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI,
});

// Routes d'authentification
app.get("/auth/login", (req, res) => {
  const scopes = ["user-library-read", "user-read-email", "user-read-private"];
  const authorizeURL = spotifyApi.createAuthorizeURL(scopes);
  res.redirect(authorizeURL);
});

app.get("/auth/callback", async (req, res) => {
  const { code } = req.query;

  try {
    const data = await spotifyApi.authorizationCodeGrant(code as string);
    req.session!.access_token = data.body.access_token;
    req.session!.refresh_token = data.body.refresh_token;

    res.redirect(`${process.env.FRONTEND_URL}/menu`);
  } catch (err) {
    console.error("Error during Spotify callback:", err);
    res.redirect(`${process.env.FRONTEND_URL}?error=auth_failed`);
  }
});

// Routes API
app.get("/api/auth/me", (req, res) => {
  if (!req.session?.access_token) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  res.json({
    authenticated: true,
    access_token: req.session.access_token,
  });
});

app.get("/api/user/tracks", async (req, res) => {
  if (!req.session?.access_token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    spotifyApi.setAccessToken(req.session.access_token);
    const data = await spotifyApi.getMySavedTracks({ limit: 50 });
    
    const tracks = data.body.items.map((item: any) => ({
      id: item.track.id,
      name: item.track.name,
      artist: item.track.artists[0].name,
      preview_url: item.track.preview_url,
      album_image: item.track.album.images[0]?.url,
    }));

    res.json({ tracks });
  } catch (err) {
    console.error("Error fetching tracks:", err);
    res.status(500).json({ error: "Failed to fetch tracks" });
  }
});

app.post("/api/games/solo/start", async (req, res) => {
  if (!req.session?.access_token) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  res.json({ 
    gameId: Date.now().toString(),
    message: "Game started" 
  });
});

// Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

// Démarrer le serveur
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});