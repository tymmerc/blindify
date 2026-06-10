CREATE TABLE IF NOT EXISTS challenges (
    id SERIAL PRIMARY KEY,
    code VARCHAR(12) UNIQUE NOT NULL,
    creator_name VARCHAR(120),
    track_data JSONB NOT NULL,
    creator_score INTEGER DEFAULT 0,
    creator_correct INTEGER DEFAULT 0,
    creator_total INTEGER DEFAULT 0,
    creator_best_streak INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS challenge_attempts (
    id SERIAL PRIMARY KEY,
    challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    player_name VARCHAR(120) DEFAULT 'Joueur',
    score INTEGER DEFAULT 0,
    correct INTEGER DEFAULT 0,
    total INTEGER DEFAULT 0,
    best_streak INTEGER DEFAULT 0,
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_challenges_code ON challenges(code);
CREATE INDEX IF NOT EXISTS idx_challenge_attempts_challenge_id ON challenge_attempts(challenge_id);
