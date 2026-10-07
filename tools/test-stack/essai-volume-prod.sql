-- Volume comparable a la prod, pour essayer la migration 005 sur la pile
-- (jamais sur la prod). Chiffres de la prod lus le 07/10/2026 (lecture seule) :
-- 8 776 morceaux (2 652 Deezer, 6 124 Spotify, tous sans ISRC), 1 456 avec un
-- premier importeur parmi 31 joueurs, 1 150 avec une carte, 277 joueurs,
-- 112 cartes, 321 parties, 2 658 manches.
-- Quelques morceaux ont la carte d'un AUTRE joueur (ecrite par l'ancien code,
-- qui ne verifiait pas a qui etait la carte) : la reprise doit l'ecarter.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO users (provider, provider_id, username)
SELECT 'guest', 'essai-volume-' || g, 'essai-volume-' || g FROM generate_series(1, 277) g;

CREATE TEMP TABLE joueurs AS
SELECT id, row_number() OVER (ORDER BY id) AS n FROM users WHERE provider_id LIKE 'essai-volume-%';

-- 112 cartes sur les 31 premiers joueurs.
INSERT INTO imported_links (user_id, url, normalized_url, provider, kind, label)
SELECT j.id, 'https://www.deezer.com/fr/playlist/' || (7000000 + g), 'deezer:playlist:' || (7000000 + g), 'deezer', 'playlist', 'Carte ' || g
FROM generate_series(1, 112) g JOIN joueurs j ON j.n = 1 + (g % 31);

INSERT INTO audio_sources (provider, external_id, title, artist, duration_ms, metadata)
SELECT CASE WHEN g <= 2652 THEN 'deezer' ELSE 'spotify' END,
       CASE WHEN g <= 2652 THEN (8000000 + g)::text ELSE substr(md5(g::text) || md5((g + 1)::text), 1, 22) END,
       'Titre ' || g, 'Artiste ' || (g % 400), 180000, '{"source":"essai-volume"}'
FROM generate_series(1, 8776) g;

-- 1 456 morceaux a un premier importeur (31 joueurs).
CREATE TEMP TABLE lies AS
SELECT a.id, j.id AS user_id, row_number() OVER (ORDER BY a.id) AS n
FROM (SELECT id, row_number() OVER (ORDER BY md5(id::text)) AS k FROM audio_sources WHERE metadata->>'source' = 'essai-volume') a
JOIN joueurs j ON j.n = 1 + (a.k % 31)
WHERE a.k <= 1456;
UPDATE audio_sources s SET user_id = l.user_id FROM lies l WHERE s.id = l.id;

-- 1 150 avec une carte : celle du joueur, sauf 20 avec la carte d'un autre.
UPDATE audio_sources s
SET link_id = (SELECT min(il.id) FROM imported_links il
               WHERE (l.n > 20 AND il.user_id = l.user_id) OR (l.n <= 20 AND il.user_id <> l.user_id))
FROM lies l WHERE s.id = l.id AND l.n <= 1150;

-- 321 parties, 2 658 manches sur ces morceaux.
INSERT INTO game_sessions (host_user_id, mode, state, total_rounds, started_at, ended_at)
SELECT j.id, 'friends', 'finished', 10, now() - interval '2 days', now() - interval '2 days'
FROM generate_series(1, 321) g JOIN joueurs j ON j.n = 1 + (g % 31);
INSERT INTO game_rounds (session_id, round_index, audio_source_id, correct_title, correct_artist)
SELECT s.id, r, (SELECT id FROM lies WHERE n = 1 + ((s.id * 10 + r) % 1456)), 'Titre', 'Artiste'
FROM (SELECT id, row_number() OVER (ORDER BY id) AS k FROM game_sessions WHERE started_at < now() - interval '1 day') s
CROSS JOIN generate_series(1, 9) r
WHERE (s.k - 1) * 9 + r <= 2658;
COMMIT;

SELECT count(*) || ' morceaux, ' || count(user_id) || ' lies a ' || count(DISTINCT user_id) || ' joueurs, ' || count(link_id) || ' avec carte'
FROM audio_sources;
SELECT count(*) || ' manches' FROM game_rounds;
