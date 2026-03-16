import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

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
