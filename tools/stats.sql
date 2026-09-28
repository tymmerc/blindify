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

  -- Ou decroche-t-on ? Part des manches reellement jouees avant l'abandon.
  -- C'est la mesure actionnable : "63 % d'abandon" ne dit pas quoi corriger,
  -- "ils lachent des la premiere manche" si.
  'abandon_progression', (SELECT coalesce(json_agg(json_build_object('tranche', tranche, 'n', n) ORDER BY ordre), '[]'::json) FROM (
      SELECT CASE WHEN pct = 0 THEN 'aucune manche'
                  WHEN pct <= 25 THEN 'moins du quart'
                  WHEN pct <= 50 THEN 'jusqu a la moitie'
                  WHEN pct <= 75 THEN 'jusqu aux trois quarts'
                  ELSE 'presque au bout' END AS tranche,
             CASE WHEN pct = 0 THEN 1 WHEN pct <= 25 THEN 2 WHEN pct <= 50 THEN 3
                  WHEN pct <= 75 THEN 4 ELSE 5 END AS ordre,
             count(*) AS n
      FROM (
        SELECT g.id,
               round(100.0 * coalesce((SELECT count(DISTINCT r.round_id) FROM round_responses r
                                        JOIN game_rounds gr ON gr.id = r.round_id
                                        WHERE gr.session_id = g.id), 0)
                     / nullif(g.total_rounds, 0)) AS pct
        FROM game_sessions g WHERE g.state = 'abandoned'
      ) q WHERE pct IS NOT NULL GROUP BY 1, 2) ap),

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
