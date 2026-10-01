-- Structure de la base de prod de Blindz, sans aucune donnee.
-- Generee par tools/schema-snapshot.sh : ne pas modifier a la main.
-- Chargee par la base de test locale (npm run test:db) et par la CI.

--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audio_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audio_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer,
    provider text NOT NULL,
    external_id text,
    title text NOT NULL,
    artist text NOT NULL,
    album_cover text,
    duration_ms integer,
    audio_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    link_id integer
);


--
-- Name: badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.badges (
    id integer NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    description text,
    icon text,
    tier text,
    requirement_type text,
    requirement_value integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: badges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.badges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: badges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.badges_id_seq OWNED BY public.badges.id;


--
-- Name: bug_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bug_reports (
    id integer NOT NULL,
    user_id integer,
    message text NOT NULL,
    page_url text,
    user_agent text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: bug_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bug_reports_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bug_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.bug_reports_id_seq OWNED BY public.bug_reports.id;


--
-- Name: challenge_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challenge_attempts (
    id integer NOT NULL,
    challenge_id integer NOT NULL,
    player_name character varying(120) DEFAULT 'Joueur'::character varying,
    score integer DEFAULT 0,
    correct integer DEFAULT 0,
    total integer DEFAULT 0,
    best_streak integer DEFAULT 0,
    completed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: challenge_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.challenge_attempts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: challenge_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.challenge_attempts_id_seq OWNED BY public.challenge_attempts.id;


--
-- Name: challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challenges (
    id integer NOT NULL,
    code character varying(12) NOT NULL,
    creator_name character varying(120),
    track_data jsonb NOT NULL,
    creator_score integer DEFAULT 0,
    creator_correct integer DEFAULT 0,
    creator_total integer DEFAULT 0,
    creator_best_streak integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: challenges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.challenges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: challenges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.challenges_id_seq OWNED BY public.challenges.id;


--
-- Name: friends; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friends (
    id integer NOT NULL,
    requester_id integer NOT NULL,
    receiver_id integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_friends_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'blocked'::text]))),
    CONSTRAINT friends_check CHECK ((requester_id <> receiver_id))
);


--
-- Name: friends_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.friends_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: friends_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.friends_id_seq OWNED BY public.friends.id;


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id integer NOT NULL,
    user_a integer NOT NULL,
    user_b integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_by integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT friendships_check CHECK ((user_a <> user_b))
);


--
-- Name: friendships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.friendships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: friendships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.friendships_id_seq OWNED BY public.friendships.id;


--
-- Name: game_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_participants (
    id integer NOT NULL,
    session_id integer NOT NULL,
    user_id integer NOT NULL,
    score integer DEFAULT 0,
    accuracy numeric(5,2),
    avg_response_ms integer,
    best_streak integer,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: game_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.game_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: game_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.game_participants_id_seq OWNED BY public.game_participants.id;


--
-- Name: game_rounds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_rounds (
    id integer NOT NULL,
    session_id integer NOT NULL,
    round_index integer NOT NULL,
    audio_source_id uuid,
    correct_title text NOT NULL,
    correct_artist text NOT NULL,
    reveal_at timestamp without time zone,
    completed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: game_rounds_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.game_rounds_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: game_rounds_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.game_rounds_id_seq OWNED BY public.game_rounds.id;


--
-- Name: game_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.game_sessions (
    id integer NOT NULL,
    host_user_id integer,
    mode text NOT NULL,
    difficulty text DEFAULT 'normal'::text,
    source_provider text,
    source_reference text,
    room_code text,
    total_rounds integer DEFAULT 10,
    current_round integer DEFAULT 0,
    started_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    ended_at timestamp without time zone,
    state text DEFAULT 'waiting'::text
);


--
-- Name: game_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.game_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: game_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.game_sessions_id_seq OWNED BY public.game_sessions.id;


--
-- Name: imported_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imported_links (
    id integer NOT NULL,
    user_id integer NOT NULL,
    url text NOT NULL,
    normalized_url text NOT NULL,
    provider text,
    kind text,
    label text,
    image_url text,
    active boolean DEFAULT true NOT NULL,
    times_played integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    last_import_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: imported_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.imported_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: imported_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.imported_links_id_seq OWNED BY public.imported_links.id;


--
-- Name: leaderboard_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leaderboard_snapshots (
    id integer NOT NULL,
    session_id integer,
    payload jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: leaderboard_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.leaderboard_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: leaderboard_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.leaderboard_snapshots_id_seq OWNED BY public.leaderboard_snapshots.id;


--
-- Name: likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.likes (
    id integer NOT NULL,
    user_id integer,
    audio_source_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: likes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.likes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: likes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.likes_id_seq OWNED BY public.likes.id;


--
-- Name: multiplayer_rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.multiplayer_rooms (
    id integer NOT NULL,
    room_code character varying(6) NOT NULL,
    host_user_id integer,
    session_id integer,
    name character varying(120),
    status text DEFAULT 'waiting'::text,
    mode text DEFAULT 'friends'::text,
    max_players integer DEFAULT 8,
    question_count integer DEFAULT 10,
    difficulty text DEFAULT 'normal'::text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    auto_advance boolean DEFAULT false,
    host_plays boolean DEFAULT false,
    round_duration_ms integer
);


--
-- Name: multiplayer_rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.multiplayer_rooms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: multiplayer_rooms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.multiplayer_rooms_id_seq OWNED BY public.multiplayer_rooms.id;


--
-- Name: room_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_invitations (
    id integer NOT NULL,
    room_id integer NOT NULL,
    room_code character varying(12) NOT NULL,
    from_user integer NOT NULL,
    to_user integer NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_room_invitation_status CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'expired'::text]))),
    CONSTRAINT room_invitations_check CHECK ((from_user <> to_user))
);


--
-- Name: room_invitations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.room_invitations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: room_invitations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.room_invitations_id_seq OWNED BY public.room_invitations.id;


--
-- Name: room_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_participants (
    id integer NOT NULL,
    room_id integer,
    user_id integer,
    joined_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    is_ready boolean DEFAULT false,
    source_pref text,
    playlist_pref text,
    nickname character varying(30)
);


--
-- Name: room_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.room_participants_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: room_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.room_participants_id_seq OWNED BY public.room_participants.id;


--
-- Name: round_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.round_responses (
    id integer NOT NULL,
    round_id integer NOT NULL,
    user_id integer NOT NULL,
    guess_title text,
    guess_artist text,
    is_correct boolean DEFAULT false,
    response_time_ms integer,
    score_delta integer DEFAULT 0,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    verdict text,
    source_guess integer,
    source_owner integer,
    source_correct boolean
);


--
-- Name: round_responses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.round_responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: round_responses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.round_responses_id_seq OWNED BY public.round_responses.id;


--
-- Name: uploads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uploads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id integer,
    filename text NOT NULL,
    mime_type text NOT NULL,
    size integer NOT NULL,
    duration_ms integer,
    audio_source_id uuid,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: used_tracks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.used_tracks (
    id integer NOT NULL,
    audio_source_id uuid NOT NULL,
    used_at timestamp without time zone DEFAULT now()
);


--
-- Name: used_tracks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.used_tracks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: used_tracks_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.used_tracks_id_seq OWNED BY public.used_tracks.id;


--
-- Name: user_badges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_badges (
    id integer NOT NULL,
    user_id integer,
    badge_id integer,
    earned_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_badges_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_badges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_badges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_badges_id_seq OWNED BY public.user_badges.id;


--
-- Name: user_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_connections (
    id integer NOT NULL,
    user_id integer NOT NULL,
    provider text NOT NULL,
    access_token text,
    refresh_token text,
    expires_at timestamp without time zone,
    scope text[],
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: user_connections_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_connections_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_connections_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_connections_id_seq OWNED BY public.user_connections.id;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    token text NOT NULL,
    user_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    expires_at timestamp without time zone
);


--
-- Name: user_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_stats (
    user_id integer NOT NULL,
    total_games integer DEFAULT 0,
    total_correct integer DEFAULT 0,
    total_guesses integer DEFAULT 0,
    total_reaction_ms bigint DEFAULT 0,
    best_streak integer DEFAULT 0,
    total_xp integer DEFAULT 0,
    longest_game integer DEFAULT 0,
    last_played_at timestamp without time zone,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id integer NOT NULL,
    provider text NOT NULL,
    provider_id text NOT NULL,
    username character varying(120),
    email character varying(255),
    avatar text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    password_hash text
);


--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: badges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges ALTER COLUMN id SET DEFAULT nextval('public.badges_id_seq'::regclass);


--
-- Name: bug_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports ALTER COLUMN id SET DEFAULT nextval('public.bug_reports_id_seq'::regclass);


--
-- Name: challenge_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_attempts ALTER COLUMN id SET DEFAULT nextval('public.challenge_attempts_id_seq'::regclass);


--
-- Name: challenges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenges ALTER COLUMN id SET DEFAULT nextval('public.challenges_id_seq'::regclass);


--
-- Name: friends id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends ALTER COLUMN id SET DEFAULT nextval('public.friends_id_seq'::regclass);


--
-- Name: friendships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships ALTER COLUMN id SET DEFAULT nextval('public.friendships_id_seq'::regclass);


--
-- Name: game_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_participants ALTER COLUMN id SET DEFAULT nextval('public.game_participants_id_seq'::regclass);


--
-- Name: game_rounds id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rounds ALTER COLUMN id SET DEFAULT nextval('public.game_rounds_id_seq'::regclass);


--
-- Name: game_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_sessions ALTER COLUMN id SET DEFAULT nextval('public.game_sessions_id_seq'::regclass);


--
-- Name: imported_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imported_links ALTER COLUMN id SET DEFAULT nextval('public.imported_links_id_seq'::regclass);


--
-- Name: leaderboard_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_snapshots ALTER COLUMN id SET DEFAULT nextval('public.leaderboard_snapshots_id_seq'::regclass);


--
-- Name: likes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes ALTER COLUMN id SET DEFAULT nextval('public.likes_id_seq'::regclass);


--
-- Name: multiplayer_rooms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multiplayer_rooms ALTER COLUMN id SET DEFAULT nextval('public.multiplayer_rooms_id_seq'::regclass);


--
-- Name: room_invitations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_invitations ALTER COLUMN id SET DEFAULT nextval('public.room_invitations_id_seq'::regclass);


--
-- Name: room_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_participants ALTER COLUMN id SET DEFAULT nextval('public.room_participants_id_seq'::regclass);


--
-- Name: round_responses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.round_responses ALTER COLUMN id SET DEFAULT nextval('public.round_responses_id_seq'::regclass);


--
-- Name: used_tracks id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.used_tracks ALTER COLUMN id SET DEFAULT nextval('public.used_tracks_id_seq'::regclass);


--
-- Name: user_badges id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges ALTER COLUMN id SET DEFAULT nextval('public.user_badges_id_seq'::regclass);


--
-- Name: user_connections id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_connections ALTER COLUMN id SET DEFAULT nextval('public.user_connections_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: audio_sources audio_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_sources
    ADD CONSTRAINT audio_sources_pkey PRIMARY KEY (id);


--
-- Name: audio_sources audio_sources_provider_external_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_sources
    ADD CONSTRAINT audio_sources_provider_external_id_key UNIQUE (provider, external_id);


--
-- Name: badges badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_pkey PRIMARY KEY (id);


--
-- Name: badges badges_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.badges
    ADD CONSTRAINT badges_slug_key UNIQUE (slug);


--
-- Name: bug_reports bug_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_pkey PRIMARY KEY (id);


--
-- Name: challenge_attempts challenge_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_attempts
    ADD CONSTRAINT challenge_attempts_pkey PRIMARY KEY (id);


--
-- Name: challenges challenges_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_code_key UNIQUE (code);


--
-- Name: challenges challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenges
    ADD CONSTRAINT challenges_pkey PRIMARY KEY (id);


--
-- Name: friends friends_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_user_a_user_b_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_a_user_b_key UNIQUE (user_a, user_b);


--
-- Name: game_participants game_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_participants
    ADD CONSTRAINT game_participants_pkey PRIMARY KEY (id);


--
-- Name: game_participants game_participants_session_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_participants
    ADD CONSTRAINT game_participants_session_id_user_id_key UNIQUE (session_id, user_id);


--
-- Name: game_rounds game_rounds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rounds
    ADD CONSTRAINT game_rounds_pkey PRIMARY KEY (id);


--
-- Name: game_rounds game_rounds_session_id_round_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rounds
    ADD CONSTRAINT game_rounds_session_id_round_index_key UNIQUE (session_id, round_index);


--
-- Name: game_sessions game_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_pkey PRIMARY KEY (id);


--
-- Name: imported_links imported_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imported_links
    ADD CONSTRAINT imported_links_pkey PRIMARY KEY (id);


--
-- Name: imported_links imported_links_user_id_normalized_url_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imported_links
    ADD CONSTRAINT imported_links_user_id_normalized_url_key UNIQUE (user_id, normalized_url);


--
-- Name: leaderboard_snapshots leaderboard_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_snapshots
    ADD CONSTRAINT leaderboard_snapshots_pkey PRIMARY KEY (id);


--
-- Name: likes likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_pkey PRIMARY KEY (id);


--
-- Name: likes likes_user_id_audio_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_user_id_audio_source_id_key UNIQUE (user_id, audio_source_id);


--
-- Name: multiplayer_rooms multiplayer_rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multiplayer_rooms
    ADD CONSTRAINT multiplayer_rooms_pkey PRIMARY KEY (id);


--
-- Name: multiplayer_rooms multiplayer_rooms_room_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multiplayer_rooms
    ADD CONSTRAINT multiplayer_rooms_room_code_key UNIQUE (room_code);


--
-- Name: room_invitations room_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_invitations
    ADD CONSTRAINT room_invitations_pkey PRIMARY KEY (id);


--
-- Name: room_participants room_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_pkey PRIMARY KEY (id);


--
-- Name: room_participants room_participants_room_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_room_id_user_id_key UNIQUE (room_id, user_id);


--
-- Name: round_responses round_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.round_responses
    ADD CONSTRAINT round_responses_pkey PRIMARY KEY (id);


--
-- Name: round_responses round_responses_round_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.round_responses
    ADD CONSTRAINT round_responses_round_id_user_id_key UNIQUE (round_id, user_id);


--
-- Name: uploads uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_pkey PRIMARY KEY (id);


--
-- Name: used_tracks used_tracks_audio_source_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.used_tracks
    ADD CONSTRAINT used_tracks_audio_source_id_key UNIQUE (audio_source_id);


--
-- Name: used_tracks used_tracks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.used_tracks
    ADD CONSTRAINT used_tracks_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_pkey PRIMARY KEY (id);


--
-- Name: user_badges user_badges_user_id_badge_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_badge_id_key UNIQUE (user_id, badge_id);


--
-- Name: user_connections user_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_connections
    ADD CONSTRAINT user_connections_pkey PRIMARY KEY (id);


--
-- Name: user_connections user_connections_user_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_connections
    ADD CONSTRAINT user_connections_user_id_provider_key UNIQUE (user_id, provider);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (token);


--
-- Name: user_stats user_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stats
    ADD CONSTRAINT user_stats_pkey PRIMARY KEY (user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_provider_provider_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_provider_provider_id_key UNIQUE (provider, provider_id);


--
-- Name: idx_audio_sources_link_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audio_sources_link_id ON public.audio_sources USING btree (link_id);


--
-- Name: idx_audio_sources_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audio_sources_provider ON public.audio_sources USING btree (provider);


--
-- Name: idx_audio_sources_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audio_sources_user ON public.audio_sources USING btree (user_id);


--
-- Name: idx_bug_reports_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bug_reports_user ON public.bug_reports USING btree (user_id);


--
-- Name: idx_challenge_attempts_challenge_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenge_attempts_challenge_id ON public.challenge_attempts USING btree (challenge_id);


--
-- Name: idx_challenges_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_challenges_code ON public.challenges USING btree (code);


--
-- Name: idx_friends_pair; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_friends_pair ON public.friends USING btree (LEAST(requester_id, receiver_id), GREATEST(requester_id, receiver_id));


--
-- Name: idx_friends_receiver_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friends_receiver_status ON public.friends USING btree (receiver_id, status);


--
-- Name: idx_friends_requester_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friends_requester_status ON public.friends USING btree (requester_id, status);


--
-- Name: idx_friendships_user_a; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friendships_user_a ON public.friendships USING btree (user_a);


--
-- Name: idx_friendships_user_b; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_friendships_user_b ON public.friendships USING btree (user_b);


--
-- Name: idx_game_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_participants_user ON public.game_participants USING btree (user_id);


--
-- Name: idx_game_rounds_audio_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_game_rounds_audio_source ON public.game_rounds USING btree (audio_source_id);


--
-- Name: idx_likes_audio_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_likes_audio_source ON public.likes USING btree (audio_source_id);


--
-- Name: idx_multiplayer_rooms_host; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_multiplayer_rooms_host ON public.multiplayer_rooms USING btree (host_user_id);


--
-- Name: idx_multiplayer_rooms_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_multiplayer_rooms_session ON public.multiplayer_rooms USING btree (session_id);


--
-- Name: idx_multiplayer_rooms_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_multiplayer_rooms_status ON public.multiplayer_rooms USING btree (status);


--
-- Name: idx_room_invitation_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_room_invitation_expires ON public.room_invitations USING btree (expires_at);


--
-- Name: idx_room_invitation_to_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_room_invitation_to_status ON public.room_invitations USING btree (to_user, status);


--
-- Name: idx_room_invitation_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_room_invitation_unique ON public.room_invitations USING btree (room_id, from_user, to_user, status) WHERE (status = 'pending'::text);


--
-- Name: idx_room_invitations_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_room_invitations_from ON public.room_invitations USING btree (from_user);


--
-- Name: idx_room_participants_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_room_participants_user ON public.room_participants USING btree (user_id);


--
-- Name: idx_round_responses_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_round_responses_user ON public.round_responses USING btree (user_id);


--
-- Name: idx_sessions_host; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_host ON public.game_sessions USING btree (host_user_id);


--
-- Name: idx_sessions_room_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_room_code ON public.game_sessions USING btree (room_code);


--
-- Name: idx_uploads_audio_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uploads_audio_source ON public.uploads USING btree (audio_source_id);


--
-- Name: idx_uploads_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_uploads_user ON public.uploads USING btree (user_id);


--
-- Name: idx_used_tracks_used_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_used_tracks_used_at ON public.used_tracks USING btree (used_at);


--
-- Name: idx_user_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_expires ON public.user_sessions USING btree (expires_at);


--
-- Name: idx_user_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_user ON public.user_sessions USING btree (user_id);


--
-- Name: idx_users_username_lower; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_username_lower ON public.users USING btree (lower((username)::text));


--
-- Name: audio_sources audio_sources_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audio_sources
    ADD CONSTRAINT audio_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: bug_reports bug_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bug_reports
    ADD CONSTRAINT bug_reports_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: challenge_attempts challenge_attempts_challenge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challenge_attempts
    ADD CONSTRAINT challenge_attempts_challenge_id_fkey FOREIGN KEY (challenge_id) REFERENCES public.challenges(id) ON DELETE CASCADE;


--
-- Name: friends friends_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friends friends_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friends
    ADD CONSTRAINT friends_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user_a_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_a_fkey FOREIGN KEY (user_a) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_user_b_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_user_b_fkey FOREIGN KEY (user_b) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: game_participants game_participants_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_participants
    ADD CONSTRAINT game_participants_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.game_sessions(id) ON DELETE CASCADE;


--
-- Name: game_participants game_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_participants
    ADD CONSTRAINT game_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: game_rounds game_rounds_audio_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rounds
    ADD CONSTRAINT game_rounds_audio_source_id_fkey FOREIGN KEY (audio_source_id) REFERENCES public.audio_sources(id) ON DELETE SET NULL;


--
-- Name: game_rounds game_rounds_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_rounds
    ADD CONSTRAINT game_rounds_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.game_sessions(id) ON DELETE CASCADE;


--
-- Name: game_sessions game_sessions_host_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.game_sessions
    ADD CONSTRAINT game_sessions_host_user_id_fkey FOREIGN KEY (host_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: imported_links imported_links_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imported_links
    ADD CONSTRAINT imported_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: leaderboard_snapshots leaderboard_snapshots_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leaderboard_snapshots
    ADD CONSTRAINT leaderboard_snapshots_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.game_sessions(id) ON DELETE CASCADE;


--
-- Name: likes likes_audio_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_audio_source_id_fkey FOREIGN KEY (audio_source_id) REFERENCES public.audio_sources(id) ON DELETE CASCADE;


--
-- Name: likes likes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.likes
    ADD CONSTRAINT likes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: multiplayer_rooms multiplayer_rooms_host_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multiplayer_rooms
    ADD CONSTRAINT multiplayer_rooms_host_user_id_fkey FOREIGN KEY (host_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: multiplayer_rooms multiplayer_rooms_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.multiplayer_rooms
    ADD CONSTRAINT multiplayer_rooms_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.game_sessions(id) ON DELETE SET NULL;


--
-- Name: room_invitations room_invitations_from_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_invitations
    ADD CONSTRAINT room_invitations_from_user_fkey FOREIGN KEY (from_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: room_invitations room_invitations_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_invitations
    ADD CONSTRAINT room_invitations_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.multiplayer_rooms(id) ON DELETE CASCADE;


--
-- Name: room_invitations room_invitations_to_user_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_invitations
    ADD CONSTRAINT room_invitations_to_user_fkey FOREIGN KEY (to_user) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: room_participants room_participants_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.multiplayer_rooms(id) ON DELETE CASCADE;


--
-- Name: room_participants room_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: round_responses round_responses_round_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.round_responses
    ADD CONSTRAINT round_responses_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.game_rounds(id) ON DELETE CASCADE;


--
-- Name: round_responses round_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.round_responses
    ADD CONSTRAINT round_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: uploads uploads_audio_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_audio_source_id_fkey FOREIGN KEY (audio_source_id) REFERENCES public.audio_sources(id) ON DELETE SET NULL;


--
-- Name: uploads uploads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: used_tracks used_tracks_audio_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.used_tracks
    ADD CONSTRAINT used_tracks_audio_source_id_fkey FOREIGN KEY (audio_source_id) REFERENCES public.audio_sources(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_badge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_badge_id_fkey FOREIGN KEY (badge_id) REFERENCES public.badges(id) ON DELETE CASCADE;


--
-- Name: user_badges user_badges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_badges
    ADD CONSTRAINT user_badges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_connections user_connections_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_connections
    ADD CONSTRAINT user_connections_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_stats user_stats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_stats
    ADD CONSTRAINT user_stats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--


