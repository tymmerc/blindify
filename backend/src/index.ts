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

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
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

// === Routes ===
app.get("/", (_, res) => res.send("Blindify backend operational."));
app.get("/health", (_, res) => res.json({ status: "ok" }));
app.get("/api/auth/me", (_, res) => res.json({ message: "Authenticated user endpoint reachable" }));
app.post("/games", (req, res) => res.json({ message: "Game created", body: req.body }));

// === WebSocket ===
io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);
  socket.on("disconnect", () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// === Server start ===
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
