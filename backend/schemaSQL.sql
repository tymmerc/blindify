-- ==============================
-- 🎵 BLINDIFY DATABASE SCHEMA
-- ==============================

-- === Table des utilisateurs (liée à Spotify)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    spotify_id VARCHAR(100) UNIQUE NOT NULL,
    username VARCHAR(100),
    access_token TEXT,
    refresh_token TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- === Table des morceaux
CREATE TABLE IF NOT EXISTS tracks (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    spotify_track_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255),
    preview_url TEXT,
    album_cover TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, spotify_track_id)
);

-- === Table des parties
CREATE TABLE IF NOT EXISTS games (
    id SERIAL PRIMARY KEY,
    host_id INT REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(20) CHECK (mode IN ('solo', 'multi')) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- === Table des joueurs dans chaque partie
CREATE TABLE IF NOT EXISTS game_players (
    id SERIAL PRIMARY KEY,
    game_id INT REFERENCES games(id) ON DELETE CASCADE,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    score INT DEFAULT 0,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(game_id, user_id)
);

-- === Table des morceaux joués dans une partie
CREATE TABLE IF NOT EXISTS game_tracks (
    id SERIAL PRIMARY KEY,
    game_id INT REFERENCES games(id) ON DELETE CASCADE,
    track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
    "order" INT,
    played BOOLEAN DEFAULT FALSE
);

-- === Indexes (optimisation)
CREATE INDEX IF NOT EXISTS idx_tracks_user ON tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_game_tracks_game ON game_tracks(game_id);
CREATE INDEX IF NOT EXISTS idx_game_players_game ON game_players(game_id);

-- === Vue utile : historique des parties avec pseudo host
CREATE OR REPLACE VIEW game_summary AS
SELECT
  g.id AS game_id,
  g.mode,
  g.created_at,
  u.username AS host_name,
  COUNT(gp.id) AS nb_players
FROM games g
JOIN users u ON g.host_id = u.id
LEFT JOIN game_players gp ON g.id = gp.game_id
GROUP BY g.id, u.username;
