-- ====================================
-- BLINDIFY DATABASE SCHEMA
-- Universal music blind test platform
-- ====================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users & Authentication -----------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    username VARCHAR(120),
    email VARCHAR(255),
    avatar TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_id)
);

CREATE TABLE IF NOT EXISTS user_connections (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TIMESTAMP,
    scope TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Audio Sources ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS audio_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    provider TEXT NOT NULL,
    external_id TEXT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album_cover TEXT,
    duration_ms INTEGER,
    audio_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_audio_sources_user ON audio_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_audio_sources_provider ON audio_sources(provider);

-- Game Sessions ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    host_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    mode TEXT NOT NULL,
    difficulty TEXT DEFAULT 'normal',
    source_provider TEXT,
    source_reference TEXT,
    room_code TEXT,
    total_rounds INTEGER DEFAULT 10,
    current_round INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    state TEXT DEFAULT 'waiting'
);

CREATE INDEX IF NOT EXISTS idx_sessions_host ON game_sessions(host_user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_room_code ON game_sessions(room_code);

CREATE TABLE IF NOT EXISTS game_participants (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    accuracy NUMERIC(5,2),
    avg_response_ms INTEGER,
    best_streak INTEGER,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, user_id)
);

CREATE TABLE IF NOT EXISTS game_rounds (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    round_index INTEGER NOT NULL,
    audio_source_id UUID REFERENCES audio_sources(id) ON DELETE SET NULL,
    correct_title TEXT NOT NULL,
    correct_artist TEXT NOT NULL,
    reveal_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, round_index)
);

CREATE TABLE IF NOT EXISTS round_responses (
    id SERIAL PRIMARY KEY,
    round_id INTEGER NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    guess_title TEXT,
    guess_artist TEXT,
    is_correct BOOLEAN DEFAULT FALSE,
    response_time_ms INTEGER,
    score_delta INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(round_id, user_id)
);

-- Progression & Analytics -----------------------------------------------
CREATE TABLE IF NOT EXISTS user_stats (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_games INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    total_guesses INTEGER DEFAULT 0,
    total_reaction_ms BIGINT DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    total_xp INTEGER DEFAULT 0,
    longest_game INTEGER DEFAULT 0,
    last_played_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    audio_source_id UUID REFERENCES audio_sources(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, audio_source_id)
);

CREATE TABLE IF NOT EXISTS uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    duration_ms INTEGER,
    audio_source_id UUID REFERENCES audio_sources(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Badges & Achievements -------------------------------------------------
CREATE TABLE IF NOT EXISTS badges (
    id SERIAL PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    tier TEXT,
    requirement_type TEXT,
    requirement_value INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_badges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    badge_id INTEGER REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_id)
);

-- Multiplayer Rooms (staging lobby) -------------------------------------
CREATE TABLE IF NOT EXISTS multiplayer_rooms (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(6) UNIQUE NOT NULL,
    host_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE SET NULL,
    name VARCHAR(120),
    status TEXT DEFAULT 'waiting',
    max_players INTEGER DEFAULT 8,
    question_count INTEGER DEFAULT 10,
    difficulty TEXT DEFAULT 'normal',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS room_participants (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_ready BOOLEAN DEFAULT FALSE,
    UNIQUE(room_id, user_id)
);

-- Friendships --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (user_a <> user_b),
    UNIQUE(user_a, user_b)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_a ON friendships(user_a);
CREATE INDEX IF NOT EXISTS idx_friendships_user_b ON friendships(user_b);

-- Seed default badges ---------------------------------------------------
INSERT INTO badges (slug, name, description, icon, tier, requirement_type, requirement_value)
VALUES
    ('first-play', 'Première Note', 'Joue ta première partie', '🎵', 'bronze', 'games_played', 1),
    ('ten-games', 'Amateur', 'Joue 10 parties', '🎹', 'silver', 'games_played', 10),
    ('fifty-games', 'Mélomane', 'Joue 50 parties', '🎸', 'gold', 'games_played', 50),
    ('hundred-games', 'Légende', 'Joue 100 parties', '🎺', 'platinum', 'games_played', 100),
    ('streak-3', 'Première Série', 'Atteins une série de 3', '🔥', 'bronze', 'streak', 3),
    ('streak-5', 'En Feu', 'Atteins une série de 5', '🔥🔥', 'silver', 'streak', 5),
    ('streak-10', 'Inarrêtable', 'Atteins une série de 10', '🔥🔥🔥', 'gold', 'streak', 10),
    ('xp-500', 'Niveau 5', 'Accumule 500 XP', '⭐', 'bronze', 'xp', 500),
    ('xp-1500', 'Niveau 10', 'Accumule 1500 XP', '⭐⭐', 'silver', 'xp', 1500),
    ('xp-5000', 'Niveau 25', 'Accumule 5000 XP', '⭐⭐⭐', 'gold', 'xp', 5000),
    ('discover-20', 'Explorateur', 'Découvre 20 nouvelles musiques', '🧭', 'silver', 'discoveries', 20),
    ('hard-10', 'Expert Difficile', 'Gagne 10 parties difficiles', '💎', 'gold', 'hard_games', 10)
ON CONFLICT (slug) DO NOTHING;

-- Final notice ----------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '✅ Blindify universal schema ready';
END $$;
