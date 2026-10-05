-- Migration 004 : retours de fin de partie (« Ça s'est bien passé ? »).
--
-- Une ligne par retour envoye depuis un ecran de resultats : un avis rapide
-- (oui / pas trop) ou un signalement de bug avec un texte facultatif. Lu dans
-- le tableau de bord prive (onglet Retours). Aucune donnee personnelle en
-- plus : ni compte, ni pseudo, ni adresse IP. Le lien avec la partie passe
-- par session_id quand on le connait.
--
-- A appliquer en prod AVEC le deploiement du backend (idempotent, rejouable) :
--   docker exec -i blindify-postgres psql -U blindify -d blindify -v ON_ERROR_STOP=1 \
--     < backend/migrations/004_game_feedback.sql
-- Le backend cree aussi la table au demarrage si elle manque (ensureFeedbackSchema,
-- meme definition, verifiee par tests/integration/feedback.spec.ts) : c'est ce qui
-- la fait exister dans la pile de test et en CI, dont la base vient du schema de
-- la prod. Apres le deploiement : bash tools/schema-snapshot.sh, puis commiter
-- backend/db/schema.sql.

CREATE TABLE IF NOT EXISTS game_feedback (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('avis', 'bug')),
  answer TEXT CHECK (answer IN ('oui', 'pas_trop')),
  message TEXT CHECK (char_length(message) <= 1000),
  mode TEXT NOT NULL CHECK (mode IN ('solo', 'defi', 'chrono', 'buzzer', 'friends', 'event')),
  session_id INTEGER REFERENCES game_sessions(id) ON DELETE SET NULL,
  game_code TEXT CHECK (char_length(game_code) <= 16),
  user_agent TEXT CHECK (char_length(user_agent) <= 300),
  app_version TEXT CHECK (char_length(app_version) <= 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT game_feedback_answer_kind CHECK ((kind = 'avis') = (answer IS NOT NULL))
);

-- L'onglet Retours lit les plus recents d'abord ; l'index sur session_id evite
-- un parcours complet quand le janitor supprime une vieille partie (SET NULL).
CREATE INDEX IF NOT EXISTS idx_game_feedback_created ON game_feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_feedback_session ON game_feedback (session_id);

-- Le tableau de bord lit la base avec le role blindz_ro (SELECT seul). Une
-- table creee apres lui ne lui est pas lisible sans ce GRANT. Le role n'existe
-- que sur le VPS : ailleurs (CI, pile de test), il n'y a rien a faire.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blindz_ro') THEN
    GRANT SELECT ON game_feedback TO blindz_ro;
  END IF;
END
$$;
