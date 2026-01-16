/**
 * Backfills missing audio_url previews for Spotify tracks.
 * Uses client credentials to call the Spotify Tracks API, with a scrape fallback.
 */
import dotenv from "dotenv";
import axios from "axios";
import previewFinder from "spotify-preview-finder";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env") });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

async function getClientToken() {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error("Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET");
  const params = new URLSearchParams();
  params.set("grant_type", "client_credentials");
  const { data } = await axios.post("https://accounts.spotify.com/api/token", params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    auth: { username: id, password: secret },
  });
  return data.access_token;
}

async function fetchPreviewFromSpotify(trackId, token) {
  const { data } = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return data?.preview_url ?? null;
}

async function scrapePreview(title, artist) {
  const result = await previewFinder(title, artist ?? undefined, 1);
  if (result?.success && result.results?.length) {
    return result.results[0]?.previewUrls?.[0] ?? null;
  }
  return null;
}

async function run() {
  const token = await getClientToken();
  const { rows } = await pool.query(
    `SELECT id, external_id, title, artist
     FROM audio_sources
     WHERE provider='spotify' AND audio_url IS NULL
     LIMIT 500`
  );
  console.log(`Found ${rows.length} Spotify tracks without preview`);
  let updated = 0;

  for (const row of rows) {
    let preview = null;
    try {
      preview = await fetchPreviewFromSpotify(row.external_id, token);
      if (!preview) {
        preview = await scrapePreview(row.title, row.artist);
      }
    } catch (err) {
      console.error("preview_lookup_failed", { id: row.id, err: err?.message });
    }

    if (preview) {
      await pool.query("UPDATE audio_sources SET audio_url=$1 WHERE id=$2", [preview, row.id]);
      updated += 1;
      console.log("preview_backfilled", { id: row.id, title: row.title });
    } else {
      console.warn("no_preview_available", { id: row.id, title: row.title });
    }
  }

  console.log(`Done. Updated ${updated}/${rows.length} tracks.`);
  await pool.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
