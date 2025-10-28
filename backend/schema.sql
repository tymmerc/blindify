-- ====================================
-- BLINDIFY DATABASE SCHEMA
-- Système de blind test musical
-- ====================================

-- Table des utilisateurs
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    spotify_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100),
    email VARCHAR(255),
    access_token TEXT,
    refresh_token TEXT,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index pour améliorer les performances des requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_users_spotify_id ON users(spotify_id);
CREATE INDEX IF NOT EXISTS idx_users_access_token ON users(access_token);

-- Table des pistes audio (tracks)
CREATE TABLE IF NOT EXISTS tracks (
    id SERIAL PRIMARY KEY,
    spotify_track_id VARCHAR(255) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    artist VARCHAR(500) NOT NULL,
    album VARCHAR(500),
    preview_url TEXT,
    album_cover TEXT,
    duration_ms INTEGER,
    popularity INTEGER,
    energy DECIMAL(3,2),
    valence DECIMAL(3,2),
    danceability DECIMAL(3,2),
    tempo DECIMAL(6,2),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tracks_spotify_id ON tracks(spotify_track_id);
CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks(user_id);

-- Table de blacklist des tracks (éviter les répétitions)
CREATE TABLE IF NOT EXISTS track_blacklist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
    blacklisted_until TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_blacklist_user_track ON track_blacklist(user_id, track_id);
CREATE INDEX IF NOT EXISTS idx_blacklist_until ON track_blacklist(blacklisted_until);

-- Table des sessions de jeu
CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(20) NOT NULL, -- 'solo' ou 'multiplayer'
    difficulty VARCHAR(20) DEFAULT 'normal', -- 'easy', 'normal', 'hard'
    source VARCHAR(100), -- 'liked_tracks', 'playlist', 'top_tracks', 'ai_recommendations'
    source_id VARCHAR(255), -- ID de la playlist ou autre source
    total_questions INTEGER DEFAULT 10,
    correct_answers INTEGER DEFAULT 0,
    final_score INTEGER DEFAULT 0,
    avg_response_time DECIMAL(10,2),
    streak_achieved INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    room_id VARCHAR(50) -- Pour le mode multijoueur
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_completed ON game_sessions(completed);
CREATE INDEX IF NOT EXISTS idx_sessions_mode ON game_sessions(mode);

-- Table des rounds de jeu (chaque question)
CREATE TABLE IF NOT EXISTS game_rounds (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE CASCADE,
    track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
    spotify_track_id VARCHAR(255) NOT NULL,
    question_number INTEGER NOT NULL,
    user_answer TEXT,
    correct_answer TEXT NOT NULL,
    is_correct BOOLEAN DEFAULT FALSE,
    response_time_ms INTEGER,
    points_earned INTEGER DEFAULT 0,
    hint_used BOOLEAN DEFAULT FALSE,
    skipped BOOLEAN DEFAULT FALSE,
    similarity_score DECIMAL(5,2),
    validation_method VARCHAR(20), -- 'exact', 'fuzzy', 'contains'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rounds_session ON game_rounds(session_id);
CREATE INDEX IF NOT EXISTS idx_rounds_track ON game_rounds(track_id);

-- Table des découvertes (nouvelles musiques découvertes)
CREATE TABLE IF NOT EXISTS discoveries (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    track_id INTEGER REFERENCES tracks(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES game_sessions(id) ON DELETE SET NULL,
    liked BOOLEAN DEFAULT FALSE,
    added_to_spotify BOOLEAN DEFAULT FALSE,
    discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_discoveries_user ON discoveries(user_id);

-- Table des badges
CREATE TABLE IF NOT EXISTS badges (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    tier VARCHAR(20), -- 'bronze', 'silver', 'gold', 'platinum'
    requirement_type VARCHAR(50), -- 'games_played', 'streak', 'level', 'discoveries', etc.
    requirement_value INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des badges d'utilisateurs
CREATE TABLE IF NOT EXISTS user_badges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    badge_id INTEGER REFERENCES badges(id) ON DELETE CASCADE,
    earned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);

-- Table des salles multijoueur
CREATE TABLE IF NOT EXISTS multiplayer_rooms (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(6) UNIQUE NOT NULL,
    host_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100),
    max_players INTEGER DEFAULT 8,
    question_count INTEGER DEFAULT 10,
    difficulty VARCHAR(20) DEFAULT 'normal',
    status VARCHAR(20) DEFAULT 'waiting', -- 'waiting', 'in_progress', 'completed'
    current_question INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rooms_code ON multiplayer_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON multiplayer_rooms(status);

-- Table des participants aux salles multijoueur
CREATE TABLE IF NOT EXISTS room_participants (
    id SERIAL PRIMARY KEY,
    room_id INTEGER REFERENCES multiplayer_rooms(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    is_ready BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_participants_room ON room_participants(room_id);

-- Vue des statistiques utilisateur agrégées
CREATE OR REPLACE VIEW user_statistics AS
SELECT 
    u.id as user_id,
    u.username,
    u.level,
    u.xp,
    u.total_score,
    u.games_played,
    u.current_streak,
    u.best_streak,
    COALESCE(AVG(gs.final_score), 0) as average_score,
    COALESCE(MAX(gs.final_score), 0) as best_score,
    COALESCE(AVG(gs.correct_answers::DECIMAL / NULLIF(gs.total_questions, 0) * 100), 0) as average_accuracy,
    COUNT(DISTINCT d.track_id) as discoveries_count,
    COUNT(DISTINCT ub.badge_id) as badges_count,
    COALESCE(AVG(gs.avg_response_time), 0) as avg_response_time
FROM users u
LEFT JOIN game_sessions gs ON u.id = gs.user_id AND gs.completed = TRUE
LEFT JOIN discoveries d ON u.id = d.user_id
LEFT JOIN user_badges ub ON u.id = ub.user_id
GROUP BY u.id, u.username, u.level, u.xp, u.total_score, u.games_played, u.current_streak, u.best_streak;

-- Vue du classement global
CREATE OR REPLACE VIEW leaderboard_global AS
SELECT 
    u.id,
    u.username,
    u.level,
    u.total_score,
    u.games_played,
    u.best_streak,
    COUNT(DISTINCT ub.badge_id) as badges_count,
    ROW_NUMBER() OVER (ORDER BY u.total_score DESC, u.level DESC) as rank
FROM users u
LEFT JOIN user_badges ub ON u.id = ub.user_id
GROUP BY u.id, u.username, u.level, u.total_score, u.games_played, u.best_streak
ORDER BY u.total_score DESC
LIMIT 100;

-- Insertion des badges par défaut
INSERT INTO badges (name, description, icon, tier, requirement_type, requirement_value) VALUES
    ('Première Note', 'Joue ta première partie', '🎵', 'bronze', 'games_played', 1),
    ('Amateur', 'Joue 10 parties', '🎹', 'silver', 'games_played', 10),
    ('Mélomane', 'Joue 50 parties', '🎸', 'gold', 'games_played', 50),
    ('Légende', 'Joue 100 parties', '🎺', 'platinum', 'games_played', 100),
    ('Première Série', 'Obtiens une série de 3', '🔥', 'bronze', 'streak', 3),
    ('En Feu', 'Obtiens une série de 5', '🔥🔥', 'silver', 'streak', 5),
    ('Inarrêtable', 'Obtiens une série de 10', '🔥🔥🔥', 'gold', 'streak', 10),
    ('Niveau 5', 'Atteins le niveau 5', '⭐', 'bronze', 'level', 5),
    ('Niveau 10', 'Atteins le niveau 10', '⭐⭐', 'silver', 'level', 10),
    ('Niveau 25', 'Atteins le niveau 25', '⭐⭐⭐', 'gold', 'level', 25),
    ('Explorateur', 'Découvre 20 nouvelles musiques', '🧭', 'silver', 'discoveries', 20),
    ('Expert Difficile', 'Gagne 10 parties en mode difficile', '💎', 'gold', 'hard_games', 10)
ON CONFLICT (name) DO NOTHING;

-- Fonction pour nettoyer les anciennes blacklists
CREATE OR REPLACE FUNCTION clean_expired_blacklist() RETURNS void AS $$
BEGIN
    DELETE FROM track_blacklist WHERE blacklisted_until < NOW();
END;
$$ LANGUAGE plpgsql;

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour updated_at sur users
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Affichage de confirmation
DO $$ 
BEGIN
    RAISE NOTICE '✅ Blindify database schema created successfully';
END $$;
