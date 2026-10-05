-- Statistiques du tableau de bord privé. Une seule requête, un seul JSON.
--
-- Changement de principe (28/09) : on n'agrège plus en SQL, on envoie les
-- parties elles-mêmes. 254 lignes, quelques Ko. Le navigateur filtre par
-- période et recalcule tout, ce qui rend le sélecteur de période réel et le
-- clic sur un jour ou une partie possible. Le SQL ne fait que les jointures
-- coûteuses.
--
-- Comptes de test (05/10) : une seule liste, en tête de requête, et tout le
-- JSON s'en sert. Les parties gardent un drapeau "test" (le tableau de bord
-- les masque par défaut, une case les remet) ; le reste est compté hors
-- tests, avec le nombre exclu à côté quand c'est utile. Testé par
-- tools/stats.test.sh.

WITH
-- Pseudos des comptes de test. Un script qui recrée son invité à chaque
-- passage se filtre par son pseudo ; un compte ponctuel par son id plus bas.
-- Liste revue le 05/10/2026 sur la base de prod, en lecture seule.
pseudos_test(pseudo) AS (VALUES
  -- Personas des scripts E2E (soiree, party-4-joueurs, anticheat-e2e,
  -- buzzer-e2e, equite-e2e, batch-e2e, lobby-shots) : ~120 invités au 05/10.
  ('Tymeo'), ('Lea'), ('Max'), ('Megane'), ('Zoe'),
  ('Intrus'),             -- anticheat-e2e.mjs, lobby-shots.mjs
  ('StreamerHost'),       -- streamer-finalize-check.mjs, lobby-shots.mjs
  ('VerifA'), ('VerifB'), -- source-guess-check.mjs
  ('Tym'),                -- Tym quand il essaie le site (10 invités, 1 compte)
  ('testplayer')          -- compte local créé pour un test en mars
),
ids_test(id) AS (VALUES
  -- Invités Guest-xxxxxx des 09 et 10/09 : game-start-check.mjs les crée
  -- sans pseudo. Pas de filtre sur le motif Guest-* : le site en crée aussi
  -- pour un vrai visiteur qui n'a pas encore donné de pseudo.
  (3339), (3340), (3341), (3342), (3347), (3348), (3349),
  (3360), (3361), (3362), (3363)
),
comptes_test AS (
  SELECT id FROM users
  WHERE username IN (SELECT pseudo FROM pseudos_test)
     OR username LIKE 'e2e%'          -- e2e_*, e2etest_*, e2egame_* (scripts E2E)
     OR username LIKE 'audittest%'    -- audit de sécurité de mars
     OR username LIKE 'sonde-pile-%'  -- témoin de tools/test-stack/stack.sh, écrit en base de test : par précaution
     OR id IN (SELECT id FROM ids_test)
),
-- Une partie est de test dès qu'un compte de test l'héberge ou y joue.
parties_test AS (
  SELECT g.id FROM game_sessions g
  WHERE g.host_user_id IN (SELECT id FROM comptes_test)
     OR EXISTS (SELECT 1 FROM game_participants p
                WHERE p.session_id = g.id AND p.user_id IN (SELECT id FROM comptes_test))
)
SELECT json_build_object(
  'genere_le', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'),

  -- Couverture : les réponses ne sont enregistrées que depuis le 04/09/2026,
  -- les participants depuis septembre. À afficher avant tout chiffre.
  'couverture', (SELECT json_build_object(
      'premiere_reponse', (SELECT to_char(min(created_at),'YYYY-MM-DD') FROM round_responses),
      'premier_participant', (SELECT to_char(min(g.started_at),'YYYY-MM-DD') FROM game_participants p JOIN game_sessions g ON g.id=p.session_id),
      -- Verdict fin (correct / proche / faux) et devinette "qui a mis quoi" :
      -- colonnes ajoutées le 28/09/2026, rien avant.
      'premier_verdict', (SELECT to_char(min(created_at),'YYYY-MM-DD') FROM round_responses WHERE verdict IS NOT NULL)
  )),

  -- Une ligne par partie, avec tout ce qui se calcule en jointure.
  'sessions', (SELECT coalesce(json_agg(json_build_object(
      'id', id, 'mode', mode, 'etat', etat, 'debut', debut, 'fin', fin, 'hote', hote,
      'joueurs', joueurs, 'manches', manches, 'repondues', repondues, 'reponses', reponses,
      'bonnes', bonnes, 'proches', proches, 'devinettes', devinettes, 'devinettes_justes', devinettes_justes,
      'delai_s', delai_s, 'duree_s', duree_s, 'test', test
    ) ORDER BY debut), '[]'::json) FROM (
      SELECT g.id,
             coalesce(g.mode,'?') AS mode,
             coalesce(g.state,'?') AS etat,
             to_char(g.started_at,'YYYY-MM-DD"T"HH24:MI:SS') AS debut,
             to_char(g.ended_at,'YYYY-MM-DD"T"HH24:MI:SS') AS fin,
             u.username AS hote,
             (SELECT count(*) FROM game_participants p WHERE p.session_id=g.id)::int AS joueurs,
             g.total_rounds AS manches,
             (SELECT count(DISTINCT r.round_id) FROM round_responses r JOIN game_rounds gr ON gr.id=r.round_id WHERE gr.session_id=g.id)::int AS repondues,
             (SELECT count(*) FROM round_responses r JOIN game_rounds gr ON gr.id=r.round_id WHERE gr.session_id=g.id)::int AS reponses,
             (SELECT count(*) FROM round_responses r JOIN game_rounds gr ON gr.id=r.round_id WHERE gr.session_id=g.id AND r.is_correct)::int AS bonnes,
             -- "Proche" = le joueur avait le titre OU l'artiste, pas les deux.
             (SELECT count(*) FROM round_responses r JOIN game_rounds gr ON gr.id=r.round_id WHERE gr.session_id=g.id AND r.verdict='close')::int AS proches,
             -- Devinette "qui a mis ce morceau" : combien de fois tentée, combien de fois juste.
             (SELECT count(*) FROM round_responses r JOIN game_rounds gr ON gr.id=r.round_id WHERE gr.session_id=g.id AND r.source_guess IS NOT NULL)::int AS devinettes,
             (SELECT count(*) FROM round_responses r JOIN game_rounds gr ON gr.id=r.round_id WHERE gr.session_id=g.id AND r.source_correct)::int AS devinettes_justes,
             (SELECT EXTRACT(EPOCH FROM min(r.created_at) - g.started_at)::int FROM round_responses r JOIN game_rounds gr ON gr.id=r.round_id WHERE gr.session_id=g.id) AS delai_s,
             CASE WHEN g.ended_at IS NOT NULL THEN EXTRACT(EPOCH FROM g.ended_at - g.started_at)::int END AS duree_s,
             -- Partie de test (liste en tete de requete).
             (g.id IN (SELECT id FROM parties_test)) AS test
      FROM game_sessions g LEFT JOIN users u ON u.id=g.host_user_id
      WHERE g.started_at IS NOT NULL) s),

  -- Qui a joué quoi : sert à la fidélité par période.
  'participations', (SELECT coalesce(json_agg(json_build_object('s', p.session_id, 'u', p.user_id, 'score', p.score)), '[]'::json)
      FROM game_participants p),

  -- Les morceaux : combien de fois joués, combien de fois trouvés. Le vrai
  -- baromètre de difficulté, et ce que personne ne trouve jamais.
  'titres', (SELECT coalesce(json_agg(json_build_object(
      'titre', titre, 'artiste', artiste, 'joue', joue, 'reponses', reponses, 'bonnes', bonnes, 'proches', proches
    ) ORDER BY joue DESC, bonnes ASC), '[]'::json) FROM (
      SELECT gr.correct_title AS titre, gr.correct_artist AS artiste,
             count(DISTINCT gr.id)::int AS joue,
             count(r.id)::int AS reponses,
             count(r.id) FILTER (WHERE r.is_correct)::int AS bonnes,
             count(r.id) FILTER (WHERE r.verdict='close')::int AS proches
      FROM game_rounds gr LEFT JOIN round_responses r ON r.round_id=gr.id
      -- Hors parties de test : les personas des scripts repondent toujours
      -- faux et rendraient n'importe quel titre "introuvable".
      WHERE gr.correct_title IS NOT NULL AND gr.session_id NOT IN (SELECT id FROM parties_test)
      GROUP BY 1,2 HAVING count(DISTINCT gr.id) >= 2
      ORDER BY joue DESC LIMIT 60) t),

  'joueurs', (SELECT coalesce(json_agg(json_build_object(
      'pseudo', pseudo, 'parties', parties, 'bonnes', bonnes, 'tentatives', tentatives, 'serie', serie, 'xp', xp, 'vu_le', vu_le
    ) ORDER BY parties DESC NULLS LAST), '[]'::json) FROM (
      SELECT u.username AS pseudo, s.total_games AS parties, s.total_correct AS bonnes,
             s.total_guesses AS tentatives, s.best_streak AS serie, s.total_xp AS xp,
             to_char(s.last_played_at,'YYYY-MM-DD') AS vu_le
      FROM user_stats s JOIN users u ON u.id=s.user_id
      -- Les personas des scripts E2E jouent tous les jours et repondent toujours
      -- faux : sans ce filtre ils trustent le classement.
      WHERE u.id NOT IN (SELECT id FROM comptes_test)
      ORDER BY s.total_games DESC NULLS LAST LIMIT 20) j),

  -- n et comptes : hors tests. tests : comptes de test crees ce jour-la (les
  -- scripts E2E en creent plusieurs par passage, c'etait l'essentiel du chiffre).
  'inscriptions', (SELECT coalesce(json_agg(json_build_object('j', j, 'n', n, 'comptes', comptes, 'tests', tests) ORDER BY j), '[]'::json) FROM (
      SELECT created_at::date AS j,
             count(*) FILTER (WHERE NOT test)::int AS n,
             count(*) FILTER (WHERE NOT test AND password_hash IS NOT NULL)::int AS comptes,
             count(*) FILTER (WHERE test)::int AS tests
      FROM (SELECT u.created_at, u.password_hash, u.id IN (SELECT id FROM comptes_test) AS test FROM users u) u
      WHERE created_at IS NOT NULL GROUP BY 1) i),

  -- n et joue : hors tests (63 liens sur 99 venaient des scripts au 05/10).
  'liens', (SELECT coalesce(json_agg(json_build_object('provider', provider, 'n', n, 'joue', joue, 'tests', tests) ORDER BY n DESC), '[]'::json) FROM (
      SELECT coalesce(provider,'inconnu') AS provider,
             count(*) FILTER (WHERE NOT test)::int AS n,
             coalesce(sum(times_played) FILTER (WHERE NOT test),0)::int AS joue,
             count(*) FILTER (WHERE test)::int AS tests
      FROM (SELECT l.provider, l.times_played, l.user_id IN (SELECT id FROM comptes_test) AS test FROM imported_links l) l
      GROUP BY 1) l),

  'retours', (SELECT coalesce(json_agg(json_build_object('message', message, 'page', page, 'le', le, 'pseudo', pseudo) ORDER BY le DESC), '[]'::json) FROM (
      SELECT b.message, b.page_url AS page, to_char(b.created_at,'YYYY-MM-DD HH24:MI') AS le, u.username AS pseudo
      FROM bug_reports b LEFT JOIN users u ON u.id=b.user_id ORDER BY b.created_at DESC LIMIT 30) r),

  -- Totaux bruts (tests compris), puis les memes hors tests, puis ce qui a
  -- ete exclu.
  'totaux', (SELECT json_build_object(
      'joueurs', (SELECT count(*) FROM users),
      'comptes', (SELECT count(*) FROM users WHERE password_hash IS NOT NULL),
      'morceaux', (SELECT count(*) FROM audio_sources),
      'morceaux_jouables', (SELECT count(*) FROM audio_sources WHERE audio_url IS NOT NULL AND audio_url <> ''),
      'manches', (SELECT count(*) FROM game_rounds),
      'reponses', (SELECT count(*) FROM round_responses)
  )),
  'totaux_hors_tests', (SELECT json_build_object(
      'joueurs', (SELECT count(*) FROM users WHERE id NOT IN (SELECT id FROM comptes_test)),
      'comptes', (SELECT count(*) FROM users WHERE password_hash IS NOT NULL AND id NOT IN (SELECT id FROM comptes_test)),
      'parties', (SELECT count(*) FROM game_sessions WHERE started_at IS NOT NULL AND id NOT IN (SELECT id FROM parties_test)),
      'manches', (SELECT count(*) FROM game_rounds WHERE session_id NOT IN (SELECT id FROM parties_test)),
      'reponses', (SELECT count(*) FROM round_responses r JOIN game_rounds gr ON gr.id=r.round_id
                   WHERE gr.session_id NOT IN (SELECT id FROM parties_test))
  )),
  'exclus', (SELECT json_build_object(
      'comptes_test', (SELECT count(*) FROM comptes_test),
      'parties_test', (SELECT count(*) FROM game_sessions WHERE started_at IS NOT NULL AND id IN (SELECT id FROM parties_test))
  ))
) AS data;
