-- Extraits des morceaux Spotify : ce que la base sait, en LECTURE SEULE.
-- docker exec -i blindify-postgres psql -U blindify -d blindify -f - < tools/extrait/estimation.sql
--
-- Un morceau Spotify n'a pas d'extrait a lui : on prend celui d'un morceau
-- Deezer trouve par recherche de titre (avant le 07/10/2026 : sans regarder la
-- version, d'ou "You Say Run (Earth-2021)" a la place de l'OST). La base ne
-- garde ni le titre ni l'identifiant du morceau Deezer retenu : seul un
-- echantillon interroge chez Deezer (echantillon.ts) dit combien sont faux.
-- Les extraits Deezer expirent (~15 min) et sont re-resolus a chaque partie :
-- la nouvelle regle s'applique donc d'elle-meme, sans rattrapage en base.
SELECT
  count(*)                                                        AS spotify_total,
  count(*) FILTER (WHERE audio_url ~ 'dzcdn\.net')                AS extrait_deezer,
  count(*) FILTER (WHERE audio_url ~ 'dzcdn\.net'
                     AND (substring(audio_url from 'exp=([0-9]+)'))::bigint > extract(epoch FROM now())) AS extrait_deezer_encore_valide,
  count(*) FILTER (WHERE audio_url ~ 'scdn\.co')                  AS extrait_spotify_historique,
  count(*) FILTER (WHERE audio_url IS NULL)                       AS sans_extrait,
  count(*) FILTER (WHERE metadata ? 'isrc')                       AS avec_isrc,
  count(*) FILTER (WHERE title ~ '\(|\[| - |-[^-]+-\s*$')         AS titre_avec_mention
FROM audio_sources
WHERE provider = 'spotify';
