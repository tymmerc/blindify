-- Migration 008 : photo de profil des joueurs (T39).
--
-- Une photo par joueur au plus, deja recadree en carre, reduite a 256 px et
-- reencodee en WebP par le backend (services/userPhotos.ts) : quelques dizaines
-- de Ko. Elle vit en base, pas sur le disque du conteneur (perdu a chaque
-- recreation, aucun volume) : elle suit les sauvegardes et part avec le compte
-- (ON DELETE CASCADE, RGPD).
--
-- La table uploads n'est pas reprise : elle sert aux fichiers audio locaux,
-- garde le fichier sur le disque du conteneur, ses colonnes sont celles d'un
-- son (duree, morceau), et elle est vide en prod.
--
-- L'id change a chaque nouvelle photo : l'adresse /api/photos/<id>.webp
-- (users.avatar) change avec, donc aucun cache ne garde l'ancienne, et
-- l'adresse ne se devine pas.
--
-- Idempotente et rejouable ; le backend la rejoue a chaque demarrage
-- (ensureUserPhotosSchema), comme 005 et 006 : c'est ce qui la fait exister
-- dans la pile de test et en CI, dont la base vient du schema de la prod.
-- Deja appliquee, elle ne prend aucun verrou.
--
-- En prod, AVEC le deploiement du backend (avant que le nouveau code tourne) :
--   docker exec -i blindify-postgres psql -U blindify -d blindify -v ON_ERROR_STOP=1 \
--     < backend/migrations/008_user_photos.sql
-- Puis : bash tools/schema-snapshot.sh, et commiter backend/db/schema.sql.
--
-- Retour arriere (l'ancien code ignore la table ; les avatars qui pointent
-- vers une photo afficheraient une image cassee, d'ou le UPDATE) :
--   UPDATE users SET avatar = NULL WHERE avatar LIKE '/api/photos/%';
--   DROP TABLE IF EXISTS user_photos;

BEGIN;
SET LOCAL lock_timeout = '3s';

DO $$
BEGIN
  IF to_regclass('public.user_photos') IS NULL THEN
    CREATE TABLE user_photos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      -- UNIQUE : une photo par joueur, et l'index qui sert la cascade.
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      image BYTEA NOT NULL,
      mime_type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      -- Meme format et meme plafond que le backend (PHOTO_MAX_BYTES).
      CONSTRAINT user_photos_mime CHECK (mime_type = 'image/webp'),
      CONSTRAINT user_photos_size CHECK (octet_length(image) BETWEEN 1 AND 262144)
    );
  END IF;
END
$$;

COMMIT;
