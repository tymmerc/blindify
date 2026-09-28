-- Statistiques du tableau de bord privé. Une seule requête, un seul JSON.
--
-- Changement de principe (28/09) : on n'agrège plus en SQL, on envoie les
-- parties elles-mêmes. 254 lignes, quelques Ko. Le navigateur filtre par
-- période et recalcule tout, ce qui rend le sélecteur de période réel et le
-- clic sur un jour ou une partie possible. Le SQL ne fait que les jointures
-- coûteuses.

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
             -- Parties lancees par les personas des scripts E2E (soiree, anticheat...).
             (u.username LIKE 'e2e\_%' ESCAPE '\' OR u.username IN ('Lea','Max','Megane','Zoe','StreamerHost','Intrus','Tymeo','VerifA','VerifB')
              OR EXISTS (SELECT 1 FROM game_participants p2 JOIN users u2 ON u2.id=p2.user_id
                         WHERE p2.session_id=g.id AND (u2.username IN ('Lea','Max','Megane','Zoe','VerifA','VerifB') OR u2.username LIKE 'e2e\_%' ESCAPE '\'))) AS test
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
      WHERE gr.correct_title IS NOT NULL
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
      WHERE NOT (u.username LIKE 'e2e\_%' ESCAPE '\' OR u.username IN ('Lea','Max','Megane','Zoe','StreamerHost','Intrus','Tymeo','VerifA','VerifB'))
      ORDER BY s.total_games DESC NULLS LAST LIMIT 20) j),

  'inscriptions', (SELECT coalesce(json_agg(json_build_object('j', j, 'n', n, 'comptes', comptes) ORDER BY j), '[]'::json) FROM (
      SELECT created_at::date AS j, count(*)::int AS n, count(*) FILTER (WHERE password_hash IS NOT NULL)::int AS comptes
      FROM users WHERE created_at IS NOT NULL GROUP BY 1) i),

  'liens', (SELECT coalesce(json_agg(json_build_object('provider', provider, 'n', n, 'joue', joue) ORDER BY n DESC), '[]'::json) FROM (
      SELECT coalesce(provider,'inconnu') AS provider, count(*)::int AS n, coalesce(sum(times_played),0)::int AS joue
      FROM imported_links GROUP BY 1) l),

  'retours', (SELECT coalesce(json_agg(json_build_object('message', message, 'page', page, 'le', le, 'pseudo', pseudo) ORDER BY le DESC), '[]'::json) FROM (
      SELECT b.message, b.page_url AS page, to_char(b.created_at,'YYYY-MM-DD HH24:MI') AS le, u.username AS pseudo
      FROM bug_reports b LEFT JOIN users u ON u.id=b.user_id ORDER BY b.created_at DESC LIMIT 30) r),

  'totaux', (SELECT json_build_object(
      'joueurs', (SELECT count(*) FROM users),
      'comptes', (SELECT count(*) FROM users WHERE password_hash IS NOT NULL),
      'morceaux', (SELECT count(*) FROM audio_sources),
      'morceaux_jouables', (SELECT count(*) FROM audio_sources WHERE audio_url IS NOT NULL AND audio_url <> ''),
      'manches', (SELECT count(*) FROM game_rounds),
      'reponses', (SELECT count(*) FROM round_responses)
  ))
) AS data;
