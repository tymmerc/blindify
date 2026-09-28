SELECT json_build_object(
  'genere_le', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS'),
  'resume', (SELECT json_build_object(
      'parties',        (SELECT count(*) FROM game_sessions),
      'parties_30j',    (SELECT count(*) FROM game_sessions WHERE started_at > now() - interval '30 days'),
      'parties_7j',     (SELECT count(*) FROM game_sessions WHERE started_at > now() - interval '7 days'),
      'manches',        (SELECT count(*) FROM game_rounds),
      'reponses',       (SELECT count(*) FROM round_responses),
      'joueurs',        (SELECT count(*) FROM users),
      'comptes',        (SELECT count(*) FROM users WHERE password_hash IS NOT NULL),
      'morceaux',       (SELECT count(*) FROM audio_sources),
      'liens',          (SELECT count(*) FROM imported_links),
      'jour_record',    (SELECT coalesce(max(n),0) FROM (SELECT count(*) n FROM game_sessions GROUP BY started_at::date) z),
      'parties_test',   (SELECT count(*) FROM game_sessions g JOIN users u ON u.id=g.host_user_id WHERE (u.username LIKE 'e2e\_%' ESCAPE '\' OR u.username IN ('Lea','Max','Megane','Zoe','StreamerHost','Intrus','Tymeo')))
  )),
  'par_jour', (SELECT coalesce(json_agg(json_build_object('j', j, 'n', n) ORDER BY j), '[]'::json) FROM (
      SELECT started_at::date AS j, count(*) AS n FROM game_sessions
      WHERE started_at > now() - interval '120 days' GROUP BY 1) a),
  'par_mode', (SELECT coalesce(json_agg(json_build_object('mode', mode, 'n', n) ORDER BY n DESC), '[]'::json) FROM (
      SELECT coalesce(mode,'inconnu') AS mode, count(*) AS n FROM game_sessions GROUP BY 1) b),
  'par_etat', (SELECT coalesce(json_agg(json_build_object('etat', etat, 'n', n) ORDER BY n DESC), '[]'::json) FROM (
      SELECT coalesce(state,'inconnu') AS etat, count(*) AS n FROM game_sessions GROUP BY 1) c),
  'reponses_qualite', (SELECT json_build_object(
      'total', count(*),
      'correctes', count(*) FILTER (WHERE r.is_correct),
      'temps_median_ms', coalesce(percentile_disc(0.5) WITHIN GROUP (ORDER BY r.response_time_ms) FILTER (WHERE r.response_time_ms IS NOT NULL), 0),
      'ecartees', (SELECT count(*) FROM round_responses r2 JOIN users u2 ON u2.id=r2.user_id
                   WHERE (u2.username LIKE 'e2e\_%' ESCAPE '\' OR u2.username IN ('Lea','Max','Megane','Zoe','StreamerHost','Intrus','Tymeo')))
  ) FROM round_responses r LEFT JOIN users u ON u.id=r.user_id WHERE NOT (u.username LIKE 'e2e\_%' ESCAPE '\' OR u.username IN ('Lea','Max','Megane','Zoe','StreamerHost','Intrus','Tymeo')) OR u.username IS NULL),
  'providers', (SELECT coalesce(json_agg(json_build_object('provider', provider, 'n', n, 'joue', joue) ORDER BY n DESC), '[]'::json) FROM (
      SELECT coalesce(provider,'inconnu') AS provider, count(*) AS n, coalesce(sum(times_played),0) AS joue
      FROM imported_links GROUP BY 1) d),
  'inscriptions', (SELECT coalesce(json_agg(json_build_object('m', m, 'n', n) ORDER BY m), '[]'::json) FROM (
      SELECT to_char(created_at,'YYYY-MM') AS m, count(*) AS n FROM users WHERE created_at IS NOT NULL GROUP BY 1) e),
  'top_joueurs', (SELECT coalesce(json_agg(json_build_object(
        'pseudo', pseudo, 'parties', parties, 'bonnes', bonnes, 'tentatives', tentatives, 'serie', serie, 'xp', xp, 'vu_le', vu_le
      ) ORDER BY parties DESC NULLS LAST), '[]'::json) FROM (
      SELECT u.username AS pseudo, s.total_games AS parties, s.total_correct AS bonnes,
             s.total_guesses AS tentatives, s.best_streak AS serie, s.total_xp AS xp,
             to_char(s.last_played_at,'YYYY-MM-DD') AS vu_le
      FROM user_stats s JOIN users u ON u.id = s.user_id
      WHERE NOT (u.username LIKE 'e2e\_%' ESCAPE '\' OR u.username IN ('Lea','Max','Megane','Zoe','StreamerHost','Intrus','Tymeo'))
      ORDER BY s.total_games DESC NULLS LAST LIMIT 15) f),
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
