-- Migration 007 : le message aux joueurs de Tym (T24, 04/11/2026).
--
-- - Colonne contact : un pseudo Insta ou une adresse e-mail que le joueur
--   laisse s'il veut une reponse. Facultative, 120 caracteres au plus,
--   effacee au bout de 12 mois (janitor, CONTACT_PURGE_SQL).
-- - Type « mot » : le message libre (« Hello, je suis l'etudiant derriere
--   Blindz... »), a cote de « avis » et « bug ».
-- - Mode « site » : le meme formulaire ouvert depuis le pied de page.
--
-- Idempotente et rejouable. Le backend joue les memes requetes au demarrage
-- (ensureFeedbackSchema, verifie par tests/integration/feedback.spec.ts) :
-- l'appliquer a la main n'est pas obligatoire. Une contrainte n'est remplacee
-- que si elle n'a pas deja la nouvelle valeur : au redemarrage, rien ne bouge.
-- La table fait quelques dizaines de lignes, la verification est instantanee.

ALTER TABLE game_feedback ADD COLUMN IF NOT EXISTS contact TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'game_feedback'::regclass AND conname = 'game_feedback_contact_check') THEN
    ALTER TABLE game_feedback ADD CONSTRAINT game_feedback_contact_check CHECK (char_length(contact) <= 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'game_feedback'::regclass AND conname = 'game_feedback_kind_check'
                   AND pg_get_constraintdef(oid) LIKE '%''mot''%') THEN
    ALTER TABLE game_feedback
      DROP CONSTRAINT IF EXISTS game_feedback_kind_check,
      ADD CONSTRAINT game_feedback_kind_check CHECK (kind IN ('avis', 'bug', 'mot'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'game_feedback'::regclass AND conname = 'game_feedback_mode_check'
                   AND pg_get_constraintdef(oid) LIKE '%''site''%') THEN
    ALTER TABLE game_feedback
      DROP CONSTRAINT IF EXISTS game_feedback_mode_check,
      ADD CONSTRAINT game_feedback_mode_check
        CHECK (mode IN ('solo', 'defi', 'chrono', 'buzzer', 'friends', 'event', 'site'));
  END IF;
END
$$;
