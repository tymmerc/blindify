import pg from "pg";
import fs from "fs";

const sql = fs.readFileSync("backend/schemaSQL.sql", "utf8"); // chemin relatif à backend/
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDB() {
  const queries = sql
    .split(";")
    .map(q => q.trim())
    .filter(Boolean);

  try {
    for (const query of queries) {
      await pool.query(query);
    }
    console.log("✅ Database schema imported successfully");
  } catch (err) {
    console.error("❌ Error importing schema:", err);
  } finally {
    await pool.end();
  }
}

initDB();
