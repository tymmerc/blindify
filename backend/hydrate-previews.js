const previewFinder = require("spotify-preview-finder");
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "postgres",
  port: 5432,
  user: process.env.POSTGRES_USER || "blindify",
  password: process.env.POSTGRES_PASSWORD || "blindify_pass",
  database: process.env.POSTGRES_DB || "blindify",
});

(async () => {
  const { rows } = await pool.query(
    "SELECT id, title, artist FROM audio_sources WHERE audio_url IS NULL AND provider = 'spotify'"
  );
  console.log("Tracks to hydrate:", rows.length);

  let success = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const title = (row.title || "").trim();
      const artist = (row.artist || "").trim();
      if (!title) { failed++; continue; }
      const r = await previewFinder(title, artist || undefined, 1);
      const url = r && r.results && r.results[0] && r.results[0].previewUrls && r.results[0].previewUrls[0];
      if (url) {
        await pool.query("UPDATE audio_sources SET audio_url=$1 WHERE id=$2", [url, row.id]);
        success++;
      } else {
        failed++;
        console.log("  miss:", title, "-", artist);
      }
    } catch (e) {
      failed++;
      console.log("  err:", row.title, "-", (e.message || "").substring(0, 60));
    }
  }
  console.log("Done:", success, "hydrated,", failed, "failed");
  await pool.end();
})();
