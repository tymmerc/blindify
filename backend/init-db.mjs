/**
 * Script d'initialisation de la base de données
 * Exécute le schéma SQL pour créer toutes les tables
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lecture du fichier SQL
const sqlPath = path.join(__dirname, "schema.sql");
const sql = fs.readFileSync(sqlPath, "utf8");

// Connexion à la base de données
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

/**
 * Initialise la base de données avec le schéma complet
 */
async function initDB() {
  console.log("🔧 Initializing Blindify database...");
  
  try {
    // Exécution du schéma SQL complet
    await pool.query(sql);
    console.log("✅ Database schema created successfully");
    console.log("📊 All tables, views, and triggers are ready");
    
    // Vérification des tables créées
    const { rows: tables } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log(`\n📋 Created tables (${tables.length}):`);
    tables.forEach(t => console.log(`   - ${t.table_name}`));
    
  } catch (err) {
    console.error("❌ Error initializing database:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Exécution
initDB();
