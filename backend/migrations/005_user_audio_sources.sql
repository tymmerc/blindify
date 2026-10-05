-- Migration 005 : chaque joueur garde le lien avec les morceaux qu'il a importes.
--
-- Avant : audio_sources n'a qu'une ligne par morceau pour toute la plateforme
-- (unique sur provider + external_id) et sa colonne user_id ne retient que le
-- PREMIER importeur. Un second joueur qui importe le meme morceau (meme
-- playlist publique qu'un ami, ou le meme joueur revenu en invite sur un autre
-- telephone) ne recoit rien : l'ecran dit « 12 titres importes », sa carte en
-- montre 0 et l'hote ne peut pas lancer (need_more_music).
--
-- Apres : user_audio_sources relie un joueur a chaque morceau qu'il a importe,
-- avec la carte de bibliotheque (imported_links) d'ou il vient. Un morceau peut
-- donc etre a plusieurs joueurs. Le jeu (lancement, solo, tourniquet par
-- contributeur, « qui a mis quoi ») ne lit plus que cette table.
--
-- Les colonnes audio_sources.user_id et link_id restent, et le code les ecrit
-- toujours comme avant (premier importeur) : un retour a l'image precedente du
-- backend retrouve des donnees coherentes. Le declencheur recopie toute
-- ecriture de ces colonnes dans la nouvelle table, quel que soit l'ecrivain :
-- l'ancien backend pendant le deploiement, le backend de dev (meme base), les
-- outils de test qui ensemencent en SQL.
--
-- game_rounds.owner_user_id : le joueur dont la carte a apporte le morceau dans
-- CETTE partie. Le recapitulatif de fin de partie le lisait dans
-- audio_sources.user_id, qui n'est plus forcement un joueur de la salle.
--
-- Idempotente et rejouable. Le backend la rejoue a chaque demarrage
-- (ensureUserTracksSchema) : c'est ce qui la fait exister dans la pile de test
-- et en CI, dont la base vient du schema de la prod. Rejouee, elle ne recree
-- que les liens qui manquent a un premier importeur (jamais un lien qu'un
-- joueur a retire : retirer une carte vide aussi audio_sources.user_id).
-- Rejouee sur une base qui l'a deja, elle ne prend aucun verrou fort : les
-- index, le declencheur, la colonne et le GRANT ne sont crees que s'ils
-- manquent. Sinon chaque demarrage bloquait audio_sources et game_rounds le
-- temps de la transaction, et pouvait s'interbloquer avec une partie en cours
-- (vu dans les tests : deadlock detected).
--
-- En prod, AVANT de redemarrer le backend :
--   docker exec -i blindify-postgres psql -U blindify -d blindify -v ON_ERROR_STOP=1 \
--     < backend/migrations/005_user_audio_sources.sql
-- Puis : bash tools/schema-snapshot.sh, et commiter backend/db/schema.sql.
--
-- Retour arriere : remettre l'image precedente du backend, puis
--   DROP TRIGGER IF EXISTS audio_sources_lien_proprietaire ON audio_sources;
--   DROP FUNCTION IF EXISTS audio_sources_lien_proprietaire();
--   DROP TABLE IF EXISTS user_audio_sources;
-- (la colonne game_rounds.owner_user_id peut rester, l'ancien code l'ignore).
-- L'ancien code retrouve l'etat d'avant : le premier importeur garde le
-- morceau, les liens des importeurs suivants sont perdus.

BEGIN;

CREATE TABLE IF NOT EXISTS user_audio_sources (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audio_source_id UUID NOT NULL REFERENCES audio_sources(id) ON DELETE CASCADE,
  link_id INTEGER REFERENCES imported_links(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, audio_source_id)
);

-- La cle primaire sert les lectures par joueur. Ces deux index servent les
-- autres sens : qui possede ce morceau (« qui a mis quoi »), et les cascades
-- quand un morceau ou une carte disparait. (CREATE INDEX IF NOT EXISTS
-- verrouille la table avant de regarder si l'index existe : d'ou le test.)
DO $$
BEGIN
  IF to_regclass('public.idx_user_audio_sources_source') IS NULL THEN
    CREATE INDEX idx_user_audio_sources_source ON user_audio_sources (audio_source_id);
  END IF;
  IF to_regclass('public.idx_user_audio_sources_link') IS NULL THEN
    CREATE INDEX idx_user_audio_sources_link ON user_audio_sources (link_id);
  END IF;
END
$$;

-- Une carte ne compte que si elle est a ce joueur : sinon le lien est garde
-- sans carte, et la bibliotheque le range dans « Imports precedents ».
CREATE OR REPLACE FUNCTION audio_sources_lien_proprietaire() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.user_audio_sources (user_id, audio_source_id, link_id)
  VALUES (
    NEW.user_id,
    NEW.id,
    (SELECT il.id FROM public.imported_links il WHERE il.id = NEW.link_id AND il.user_id = NEW.user_id)
  )
  ON CONFLICT (user_id, audio_source_id)
  DO UPDATE SET link_id = COALESCE(EXCLUDED.link_id, public.user_audio_sources.link_id);
  RETURN NULL;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.audio_sources'::regclass AND tgname = 'audio_sources_lien_proprietaire'
  ) THEN
    CREATE TRIGGER audio_sources_lien_proprietaire
    AFTER INSERT OR UPDATE OF user_id, link_id ON audio_sources
    FOR EACH ROW WHEN (NEW.user_id IS NOT NULL)
    EXECUTE FUNCTION audio_sources_lien_proprietaire();
  END IF;
END
$$;

-- Reprise de l'existant : chaque premier importeur garde son lien et sa carte.
INSERT INTO user_audio_sources (user_id, audio_source_id, link_id, created_at)
SELECT a.user_id,
       a.id,
       (SELECT il.id FROM imported_links il WHERE il.id = a.link_id AND il.user_id = a.user_id),
       COALESCE(a.created_at, NOW())
FROM audio_sources a
WHERE a.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_audio_sources ua
    WHERE ua.user_id = a.user_id AND ua.audio_source_id = a.id)
ON CONFLICT (user_id, audio_source_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.game_rounds'::regclass AND attname = 'owner_user_id' AND NOT attisdropped
  ) THEN
    ALTER TABLE game_rounds ADD COLUMN owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.idx_game_rounds_owner') IS NULL THEN
    CREATE INDEX idx_game_rounds_owner ON game_rounds (owner_user_id);
  END IF;
END
$$;

-- Le tableau de bord lit la base avec le role blindz_ro (SELECT seul). Une
-- table creee apres lui ne lui est pas lisible sans ce GRANT. Le role n'existe
-- que sur le VPS : ailleurs (CI, pile de test), il n'y a rien a faire.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'blindz_ro')
     AND NOT has_table_privilege('blindz_ro', 'public.user_audio_sources', 'SELECT') THEN
    GRANT SELECT ON user_audio_sources TO blindz_ro;
  END IF;
END
$$;

COMMIT;
