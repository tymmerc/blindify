import pg from "pg";
import fs from "fs";

const sql = fs.readFileSync("backend/schemaSQL.sql", "utf8");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.query(sql)
  .then(() => console.log("✅ Database schema imported successfully"))
  .catch(err => console.error("❌ Error importing schema:", err))
  .finally(() => pool.end());
