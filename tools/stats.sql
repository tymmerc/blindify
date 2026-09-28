-- Statistiques du tableau de bord privé. Une seule requête, un seul JSON.
--
-- Les métriques suivent ce que font les outils d'analyse produit : un chiffre
-- se lit toujours contre la période précédente, et un entonnoir vaut mieux
-- qu'un total. La fenêtre est de 30 jours, comparée aux 30 jours d'avant.

WITH bornes AS (
  SELECT now() - interval '30 days' AS debut,
         now() - interval '60 days' AS debut_prec
),
p_act AS (SELECT count(*)::int n FROM game_sessions, bornes WHERE started_at >= debut),
p_prec AS (SELECT count(*)::int n FROM game_sessions, bornes WHERE started_at >= debut_prec AND started_at < debut),
j_act AS (SELECT count(DISTINCT p.user_id)::int n FROM game_participants p JOIN game_sessions g ON g.id=p.session_id, bornes WHERE g.started_at >= debut),
j_prec AS (SELECT count(DISTINCT p.user_id)::int n FROM game_participants p JOIN game_sessions g ON g.id=p.session_id, bornes WHERE g.started_at >= debut_prec AND g.started_at < debut),
r_act AS (SELECT count(*)::int n FROM round_responses, bornes WHERE created_at >= debut),
r_prec AS (SELECT count(*)::int n FROM round_responses, bornes WHERE created_at >= debut_prec AND created_at < debut)

SELECT json_build_object(
  'genere_le', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'),

  -- Indicateurs principaux, avec leur variation sur 30 jours glissants.
  'kpi', json_build_object(
    'parties',  json_build_object('valeur', (SELECT n FROM p_act), 'avant', (SELECT n FROM p_prec)),
    'joueurs',  json_build_object('valeur', (SELECT n FROM j_act), 'avant', (SELECT n FROM j_prec)),
    'reponses', json_build_object('valeur', (SELECT n FROM r_act), 'avant', (SELECT n FROM r_prec)),
    'taux_fin', json_build_object(
        'valeur', (SELECT coalesce(round(100.0 * count(*) FILTER (WHERE state='finished') / nullif(count(*),0)), 0)::int
                   FROM game_sessions, bornes WHERE started_at >= debut),
        'avant',  (SELECT coalesce(round(100.0 * count(*) FILTER (WHERE state='finished') / nullif(count(*),0)), 0)::int
                   FROM game_sessions, bornes WHERE started_at >= debut_prec AND started_at < debut))
  ),

  -- Totaux depuis le début, pour le contexte.
  'totaux', (SELECT json_build_object(
      'parties',  (SELECT count(*) FROM game_sessions),
      'joueurs',  (SELECT count(*) FROM users),
      'comptes',  (SELECT count(*) FROM users WHERE password_hash IS NOT NULL),
      'manches',  (SELECT count(*) FROM game_rounds),
      'morceaux', (SELECT count(*) FROM audio_sources),
      'liens',    (SELECT count(*) FROM imported_links),
      'jour_record', (SELECT coalesce(max(n),0) FROM (SELECT count(*) n FROM game_sessions GROUP BY started_at::date) z)
  )),

  -- Entonnoir : où les parties se perdent. C'est la vue la plus utile du lot,
  -- elle rend visible l'abandon, qui est le vrai problème d'un jeu de soirée.
  -- current_round n'est pas fiable comme signal de depart : il est remis a zero
  -- sur certaines parties terminees. On s'appuie sur l'existence de manches.
  'entonnoir', (SELECT json_build_object(
      'creees',   count(*),
      'jouees',   count(*) FILTER (WHERE EXISTS (SELECT 1 FROM game_rounds r WHERE r.session_id = g.id)),
      'finies',   count(*) FILTER (WHERE state = 'finished'),
      'abandon',  count(*) FILTER (WHERE state = 'abandoned')
  ) FROM game_sessions g),

  -- COUVERTURE DES DONNEES. A lire avant tout le reste : les reponses ne sont
  -- enregistrees que depuis le 04/09/2026, et les participants depuis
  -- septembre. Tout ce qui precede n'a que son etat, pas son deroule. Sans
  -- cette precision on conclut "les parties ne demarrent jamais" alors qu'on
  -- regarde simplement une periode sans instrumentation.
  'couverture', (SELECT json_build_object(
      'premiere_reponse', (SELECT to_char(min(created_at),'YYYY-MM-DD') FROM round_responses),
      'parties_instrumentees', (SELECT count(*) FROM game_sessions g
          WHERE g.started_at >= (SELECT min(created_at)::date FROM round_responses)),
      'parties_avant', (SELECT count(*) FROM game_sessions g
          WHERE g.started_at < (SELECT min(created_at)::date FROM round_responses))
  )),

  -- DELAI AVANT LA PREMIERE REPONSE. Le temps entre le lancement de la partie
  -- et la toute premiere reponse d'un joueur. Court, la partie prend ; long ou
  -- absent, le salon n'accroche pas. Restreint aux parties instrumentees.
  'demarrage', (SELECT json_build_object(
      'avec_reponse', count(*) FILTER (WHERE premiere IS NOT NULL),
      'sans_reponse', count(*) FILTER (WHERE premiere IS NULL),
      'median_s', coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY delai) FILTER (WHERE premiere IS NOT NULL), 0)::int,
      'min_s', coalesce(min(delai), 0)::int,
      'max_s', coalesce(max(delai), 0)::int,
      'tranches', (SELECT coalesce(json_agg(json_build_object('tranche', tr, 'n', n) ORDER BY ordre), '[]'::json) FROM (
          SELECT CASE WHEN d < 15 THEN 'moins de 15 s'
                      WHEN d < 30 THEN '15 a 30 s'
                      WHEN d < 60 THEN '30 a 60 s'
                      ELSE 'plus d une minute' END AS tr,
                 CASE WHEN d < 15 THEN 1 WHEN d < 30 THEN 2 WHEN d < 60 THEN 3 ELSE 4 END AS ordre,
                 count(*) AS n
          FROM (SELECT EXTRACT(EPOCH FROM min(r.created_at) - g.started_at) AS d
                FROM game_sessions g
                JOIN game_rounds gr ON gr.session_id = g.id
                JOIN round_responses r ON r.round_id = gr.id
                GROUP BY g.id, g.started_at) x
          WHERE d IS NOT NULL GROUP BY 1, 2) y)
  ) FROM (
      SELECT g.id,
             (SELECT min(r.created_at) FROM game_rounds gr JOIN round_responses r ON r.round_id = gr.id
               WHERE gr.session_id = g.id) AS premiere,
             EXTRACT(EPOCH FROM (SELECT min(r.created_at) FROM game_rounds gr JOIN round_responses r ON r.round_id = gr.id
               WHERE gr.session_id = g.id) - g.started_at) AS delai
      FROM game_sessions g
      WHERE g.started_at >= (SELECT min(created_at)::date FROM round_responses)
  ) z),

  'par_jour', (SELECT coalesce(json_agg(json_build_object('j', j, 'n', n) ORDER BY j), '[]'::json) FROM (
      SELECT started_at::date AS j, count(*) AS n FROM game_sessions
      WHERE started_at > now() - interval '120 days' GROUP BY 1) a),

  -- Quand joue-t-on ? Utile pour un jeu de soirée : on s'attend au créneau du soir.
  'par_heure', (SELECT coalesce(json_agg(json_build_object('h', h, 'n', n) ORDER BY h), '[]'::json) FROM (
      SELECT extract(hour from started_at)::int AS h, count(*) AS n
      FROM game_sessions WHERE started_at IS NOT NULL GROUP BY 1) hh),
  'par_jsem', (SELECT coalesce(json_agg(json_build_object('d', d, 'n', n) ORDER BY d), '[]'::json) FROM (
      SELECT extract(isodow from started_at)::int AS d, count(*) AS n
      FROM game_sessions WHERE started_at IS NOT NULL GROUP BY 1) dd),

  'par_mode', (SELECT coalesce(json_agg(json_build_object('mode', mode, 'n', n) ORDER BY n DESC), '[]'::json) FROM (
      SELECT coalesce(mode,'inconnu') AS mode, count(*) AS n FROM game_sessions GROUP BY 1) b),

  -- Fidélité : combien de joueurs reviennent. Une partie unique ne prouve rien.
  'fidelite', (SELECT coalesce(json_agg(json_build_object('tranche', tranche, 'n', n) ORDER BY ordre), '[]'::json) FROM (
      SELECT CASE WHEN parties = 1 THEN '1 partie'
                  WHEN parties BETWEEN 2 AND 3 THEN '2 à 3'
                  WHEN parties BETWEEN 4 AND 9 THEN '4 à 9'
                  ELSE '10 et plus' END AS tranche,
             CASE WHEN parties = 1 THEN 1 WHEN parties BETWEEN 2 AND 3 THEN 2
                  WHEN parties BETWEEN 4 AND 9 THEN 3 ELSE 4 END AS ordre,
             count(*) AS n
      FROM (SELECT user_id, count(DISTINCT session_id) AS parties FROM game_participants GROUP BY 1) q
      GROUP BY 1, 2) f),

  'taille_parties', (SELECT coalesce(json_agg(json_build_object('joueurs', joueurs, 'n', n) ORDER BY joueurs), '[]'::json) FROM (
      SELECT least(nb, 6) AS joueurs, count(*) AS n FROM (
        SELECT g.id, (SELECT count(*) FROM game_participants p WHERE p.session_id=g.id) AS nb
        FROM game_sessions g) x WHERE nb > 0 GROUP BY 1) tp),

  'reponses_qualite', (SELECT json_build_object(
      'total', count(*),
      'correctes', count(*) FILTER (WHERE is_correct),
      'temps_median_ms', coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY response_time_ms) FILTER (WHERE response_time_ms IS NOT NULL), 0)
  ) FROM round_responses),

  'providers', (SELECT coalesce(json_agg(json_build_object('provider', provider, 'n', n) ORDER BY n DESC), '[]'::json) FROM (
      SELECT coalesce(provider,'inconnu') AS provider, count(*) AS n FROM imported_links GROUP BY 1) d),

  'inscriptions', (SELECT coalesce(json_agg(json_build_object('m', m, 'n', n) ORDER BY m), '[]'::json) FROM (
      SELECT to_char(created_at,'YYYY-MM') AS m, count(*) AS n FROM users WHERE created_at IS NOT NULL GROUP BY 1) e),

  'top_joueurs', (SELECT coalesce(json_agg(json_build_object(
        'pseudo', pseudo, 'parties', parties, 'bonnes', bonnes, 'tentatives', tentatives, 'serie', serie, 'xp', xp, 'vu_le', vu_le
      ) ORDER BY parties DESC NULLS LAST), '[]'::json) FROM (
      SELECT u.username AS pseudo, s.total_games AS parties, s.total_correct AS bonnes,
             s.total_guesses AS tentatives, s.best_streak AS serie, s.total_xp AS xp,
             to_char(s.last_played_at,'YYYY-MM-DD') AS vu_le
      FROM user_stats s JOIN users u ON u.id = s.user_id
      ORDER BY s.total_games DESC NULLS LAST LIMIT 15) f2),

  'retours', (SELECT coalesce(json_agg(json_build_object(
        'message', message, 'page', page, 'le', le, 'pseudo', pseudo) ORDER BY le DESC), '[]'::json) FROM (
      SELECT b.message, b.page_url AS page, to_char(b.created_at,'YYYY-MM-DD HH24:MI') AS le, u.username AS pseudo
      FROM bug_reports b LEFT JOIN users u ON u.id = b.user_id
      ORDER BY b.created_at DESC LIMIT 30) g),

  'dernieres_parties', (SELECT coalesce(json_agg(json_build_object(
        'mode', mode, 'manches', manches, 'etat', etat, 'le', le, 'hote', hote, 'joueurs', joueurs) ORDER BY le DESC), '[]'::json) FROM (
      SELECT coalesce(g.mode,'?') AS mode, g.total_rounds AS manches, coalesce(g.state,'?') AS etat,
             to_char(g.started_at,'YYYY-MM-DD HH24:MI') AS le, coalesce(u.username,'invité') AS hote,
             (SELECT count(*) FROM game_participants p WHERE p.session_id = g.id) AS joueurs
      FROM game_sessions g LEFT JOIN users u ON u.id = g.host_user_id
      ORDER BY g.started_at DESC LIMIT 25) h)
) AS data;
