import pg from "pg";
import dotenv from "dotenv";
import { assertDatabaseTarget } from "./databaseGuard";
dotenv.config();

// Avant le pool : un backend hors production ne doit jamais ouvrir la base de
// prod (voir databaseGuard.ts). Tout ce qui importe le pool passe par ici,
// le serveur comme les scripts.
assertDatabaseTarget();

const isProd = process.env.NODE_ENV === "production";
const dbUrl = process.env.DATABASE_URL;

export const pool = new pg.Pool({
  connectionString: dbUrl,
  // In Docker compose, postgres is on the same bridge network — SSL not needed.
  // For external DB connections, enable SSL.
  ssl: dbUrl?.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
  max: isProd ? 20 : 5,
  min: isProd ? 2 : 1,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("Unexpected database pool error", err);
});
