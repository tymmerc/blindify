-- Migration 006 : une salle Blindz par salon Discord (Activite Discord).
--
-- Tous ceux qui lancent l'Activite dans un meme salon vocal partagent un
-- identifiant d'instance (instanceId du SDK Discord). Le premier arrive cree
-- la salle, les suivants la retrouvent par cet identifiant : il est garde sur
-- la salle. Les salles du site n'en ont pas (NULL). Un index unique partiel
-- garantit qu'un salon n'a jamais deux salles, meme si deux joueurs lancent
-- l'Activite au meme instant (le backend prend en plus un verrou consultatif
-- par instance, services/discordRooms.ts).
--
-- Idempotente et rejouable ; le backend la rejoue a chaque demarrage
-- (ensureDiscordSchema) : c'est ce qui la fait exister dans la pile de test et
-- en CI, dont la base vient du schema de la prod. Deja appliquee, elle ne
-- prend aucun verrou : les tests d'existence passent avant chaque commande.
--
-- En prod, AVEC le deploiement du backend (la colonne doit exister avant que
-- le nouveau code tourne) :
--   docker exec -i blindify-postgres psql -U blindify -d blindify -v ON_ERROR_STOP=1 \
--     < backend/migrations/006_discord_rooms.sql
-- Puis : bash tools/schema-snapshot.sh, et commiter backend/db/schema.sql.
--
-- Retour arriere (l'ancien code ignore la colonne, elle peut aussi rester) :
--   DROP INDEX IF EXISTS idx_multiplayer_rooms_discord_instance;
--   ALTER TABLE multiplayer_rooms DROP CONSTRAINT IF EXISTS multiplayer_rooms_discord_instance_len;
--   ALTER TABLE multiplayer_rooms DROP COLUMN IF EXISTS discord_instance_id;

BEGIN;
SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  -- Colonne sans valeur par defaut : pas de reecriture de la table.
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.multiplayer_rooms'::regclass AND attname = 'discord_instance_id' AND NOT attisdropped
  ) THEN
    ALTER TABLE multiplayer_rooms ADD COLUMN discord_instance_id TEXT;
  END IF;

  -- Meme borne que la validation du backend (DISCORD_INSTANCE_ID_PATTERN).
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'multiplayer_rooms_discord_instance_len') THEN
    ALTER TABLE multiplayer_rooms
      ADD CONSTRAINT multiplayer_rooms_discord_instance_len CHECK (char_length(discord_instance_id) <= 64);
  END IF;

  -- Un salon, une salle. Partiel : les salles du site, sans instance, ne
  -- comptent pas. (CREATE INDEX IF NOT EXISTS verrouille la table avant de
  -- regarder si l'index existe : d'ou le test.)
  IF to_regclass('public.idx_multiplayer_rooms_discord_instance') IS NULL THEN
    CREATE UNIQUE INDEX idx_multiplayer_rooms_discord_instance
      ON multiplayer_rooms (discord_instance_id) WHERE discord_instance_id IS NOT NULL;
  END IF;
END
$$;

COMMIT;
