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
-- backend retrouve des donnees coherentes. Deux declencheurs suivent toute
-- ecriture de ces colonnes, quel que soit l'ecrivain (l'ancien backend pendant
-- le deploiement, le backend de dev sur la meme base, les outils de test qui
-- ensemencent en SQL) : un premier importeur ecrit recoit son lien, un premier
-- importeur efface (l'ancien code qui retire une carte) perd le sien.
--
-- game_rounds.owner_user_id : le joueur dont la carte a apporte le morceau dans
-- CETTE partie. Le recapitulatif de fin de partie le lisait dans
-- audio_sources.user_id, qui n'est plus forcement un joueur de la salle.
--
-- Trois temps, pour ne jamais bloquer une partie longtemps (mesures sur
-- 150 000 morceaux, 90 000 lies, 200 000 manches) :
--   1. le schema, en une transaction courte (25 ms) : la seule qui bloque les
--      ecritures sur audio_sources, users et imported_links, et game_rounds
--      en entier (ajout de la colonne). lock_timeout de 3 s : si une longue
--      requete tient une de ces tables, elle abandonne sans rien ecrire
--      plutot que de faire la queue en bloquant tout le monde derriere elle ;
--   2. l'index de game_rounds.owner_user_id, a part : il parcourt la table en
--      bloquant ses ecritures, pas ses lectures (35 ms) ;
--   3. la reprise de l'existant par lots de 2 000 morceaux, un COMMIT par lot,
--      sans verrou fort (13 s en tout, les parties continuent) : le
--      declencheur, deja en place, relie les ecritures qui arrivent pendant
--      ce temps.
-- Chaque transaction prend d'abord le verrou consultatif 5005 : deux
-- applications en meme temps (le backend et le backend de dev qui redemarrent
-- ensemble, deux suites de tests) passent l'une apres l'autre au lieu
-- d'echouer (doublon dans pg_type, « tuple concurrently updated »).
--
-- Idempotente et rejouable. Le backend la rejoue a chaque demarrage
-- (ensureUserTracksSchema) : c'est ce qui la fait exister dans la pile de test
-- et en CI, dont la base vient du schema de la prod. Rejouee, elle ne prend
-- aucun verrou fort (rien n'est recree) et ne recree que les liens qui
-- manquent a un premier importeur : une reprise interrompue se termine au
-- passage suivant. Les lignes « -- @envoi » coupent le fichier pour
-- ensureUserTracksSchema : le bloc de la reprise doit partir seul (psql envoie
-- deja chaque commande a part).
--
-- En prod, AVANT de redemarrer le backend (sans l'option -1 de psql, qui
-- mettrait tout dans une seule transaction) :
--   docker exec -i blindify-postgres psql -U blindify -d blindify -v ON_ERROR_STOP=1 \
--     < backend/migrations/005_user_audio_sources.sql
-- Puis : bash tools/schema-snapshot.sh, et commiter backend/db/schema.sql.
--
-- Retour arriere : remettre l'image precedente du backend, puis
--   DROP TRIGGER IF EXISTS audio_sources_lien_proprietaire ON audio_sources;
--   DROP TRIGGER IF EXISTS audio_sources_lien_retire ON audio_sources;
--   DROP FUNCTION IF EXISTS audio_sources_lien_proprietaire();
--   DROP FUNCTION IF EXISTS audio_sources_lien_retire();
--   DROP TABLE IF EXISTS user_audio_sources;
-- (la colonne game_rounds.owner_user_id peut rester, l'ancien code l'ignore).
-- L'ancien code retrouve l'etat d'avant : le premier importeur garde le
-- morceau, les liens des importeurs suivants sont perdus.

-- @envoi : 1. le schema
BEGIN;
SELECT pg_advisory_xact_lock(5005);
SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS user_audio_sources (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  audio_source_id UUID NOT NULL REFERENCES audio_sources(id) ON DELETE CASCADE,
  link_id INTEGER REFERENCES imported_links(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, audio_source_id)
);

-- La cle primaire sert les lectures par joueur. Ces deux index servent les
-- autres sens : qui possede ce morceau (« qui a mis quoi », le fonds commun),
-- et les cascades quand un morceau ou une carte disparait. (CREATE INDEX IF
-- NOT EXISTS verrouille la table avant de regarder si l'index existe : d'ou
-- le test.)
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

-- Un premier importeur ecrit dans audio_sources recoit son lien. Une carte ne
-- compte que si elle est a ce joueur : sinon le lien est garde sans carte, et
-- la bibliotheque le range dans « Imports precedents ». Un lien deja juste
-- n'est pas reecrit : l'import de chaque morceau passe par ici, pour chaque
-- joueur qui l'importe.
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
  DO UPDATE SET link_id = COALESCE(EXCLUDED.link_id, public.user_audio_sources.link_id)
  WHERE public.user_audio_sources.link_id IS DISTINCT FROM COALESCE(EXCLUDED.link_id, public.user_audio_sources.link_id);
  RETURN NULL;
END
$$;

-- L'ancien code retire une carte en vidant audio_sources.user_id (le nouveau
-- retire aussi le lien lui-meme). Sans ce declencheur, pendant le deploiement,
-- le lien restait sans carte et le morceau revenait au joueur dans « Imports
-- precedents ».
CREATE OR REPLACE FUNCTION audio_sources_lien_retire() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.user_audio_sources
  WHERE user_id = OLD.user_id AND audio_source_id = OLD.id;
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
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.audio_sources'::regclass AND tgname = 'audio_sources_lien_retire'
  ) THEN
    CREATE TRIGGER audio_sources_lien_retire
    AFTER UPDATE OF user_id ON audio_sources
    FOR EACH ROW WHEN (OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)
    EXECUTE FUNCTION audio_sources_lien_retire();
  END IF;
END
$$;

-- Colonne neuve sans valeur par defaut : pas de reecriture de la table, et la
-- cle etrangere n'a rien a verifier (mesure : 3 ms sur un million de manches).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.game_rounds'::regclass AND attname = 'owner_user_id' AND NOT attisdropped
  ) THEN
    ALTER TABLE game_rounds ADD COLUMN owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
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

-- 2. L'index de game_rounds.owner_user_id (suppression d'un compte : ON DELETE
-- SET NULL). Partiel : les manches d'avant la migration n'ont pas de
-- contributeur. Sa construction parcourt game_rounds en bloquant ses
-- ecritures (pas ses lectures) : hors de la transaction du schema, qui bloque
-- aussi les lectures de game_rounds.
BEGIN;
SELECT pg_advisory_xact_lock(5005);
SET LOCAL lock_timeout = '3s';
DO $$
BEGIN
  IF to_regclass('public.idx_game_rounds_owner') IS NULL THEN
    CREATE INDEX idx_game_rounds_owner ON game_rounds (owner_user_id) WHERE owner_user_id IS NOT NULL;
  END IF;
END
$$;
COMMIT;

-- @envoi : 3. la reprise de l'existant, chaque premier importeur garde son
-- lien et sa carte. Par lots de 2 000 morceaux dans l'ordre de leur id, un
-- COMMIT par lot : seulement ROW EXCLUSIVE sur user_audio_sources et des
-- lectures, jamais plus d'un lot a la fois (une fraction de seconde).
DO $$
DECLARE
  depuis uuid := '00000000-0000-0000-0000-000000000000';
  jusqua uuid;
BEGIN
  LOOP
    PERFORM pg_advisory_xact_lock(5005);
    -- Dernier id du lot ; NULL quand il reste moins de 2 000 morceaux (le lot
    -- va alors jusqu'au bout). Deux bornes simples : l'index de la cle
    -- primaire ne lit que le lot.
    jusqua := (SELECT a.id FROM audio_sources a WHERE a.id > depuis ORDER BY a.id OFFSET 1999 LIMIT 1);
    INSERT INTO user_audio_sources (user_id, audio_source_id, link_id, created_at)
    SELECT a.user_id,
           a.id,
           (SELECT il.id FROM imported_links il WHERE il.id = a.link_id AND il.user_id = a.user_id),
           COALESCE(a.created_at, NOW())
    FROM audio_sources a
    WHERE a.id > depuis
      AND a.id <= COALESCE(jusqua, 'ffffffff-ffff-ffff-ffff-ffffffffffff')
      AND a.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM user_audio_sources ua
        WHERE ua.user_id = a.user_id AND ua.audio_source_id = a.id)
    ON CONFLICT (user_id, audio_source_id) DO NOTHING;
    COMMIT;
    EXIT WHEN jusqua IS NULL;
    depuis := jusqua;
  END LOOP;
END
$$;
