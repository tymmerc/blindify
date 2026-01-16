# Blindify

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)

**Blindify** is a music blind test game that uses your own Spotify library to create personalized quizzes.

## The Concept

Everyone knows blind tests - you hear a song and try to guess the title or artist. But most blind test apps use generic playlists that don't match your music taste.

**Blindify flips the script**: connect your Spotify account and play with the songs *you* actually listen to. Your playlists, your liked songs, your music.

### How it works

1. **Connect Spotify** - Login with your Spotify account
2. **Pick a mode** - Solo practice, play with friends, or host an event
3. **Listen & Guess** - A short preview plays, type your answer before time runs out
4. **Score points** - Faster answers = more points. Compete on leaderboards.

### Game Modes

| Mode | Description |
|------|-------------|
| **Solo** | Practice alone with your own library |
| **Friends** | Create a private lobby, invite friends with a code |
| **Event** | Host a blind test for a larger audience (parties, streams) |
| **Streamer** | Optimized for Twitch/YouTube live streams |

## Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | Next.js 16, React 19, TailwindCSS, Framer Motion |
| **Backend** | Node.js, Express, TypeScript |
| **Database** | PostgreSQL 15, Redis 7 |
| **Realtime** | Socket.IO |
| **Infrastructure** | Docker, Nginx |

## Features

- **Spotify Integration** - OAuth2 login, access your playlists and library
- **Solo Mode** - Practice on your own with your favorite tracks
- **Multiplayer** - Real-time games with friends via Socket.IO
- **Event/Streamer Mode** - Host blind tests for larger audiences
- **Leaderboards** - Track scores and compete with other players
- **Responsive UI** - Works on desktop and mobile

## Getting Started

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Spotify Developer Account ([create one here](https://developer.spotify.com/dashboard))

### Setup

1. Clone the repository
```bash
git clone https://github.com/tymmerc/blindify.git
cd blindify
```

2. Copy environment file and configure
```bash
cp .env.example .env
# Edit .env with your Spotify credentials and secrets
```

3. Start with Docker Compose
```bash
docker-compose up -d
```

4. Access the app
- Frontend: http://localhost:3001
- Backend API: http://localhost:3000

### Local Development

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
blindify/
├── backend/          # Express API server
│   └── src/
│       ├── controllers/
│       ├── services/
│       └── index.ts
├── frontend/         # Next.js app
│   └── src/
│       ├── app/      # App router pages
│       ├── components/
│       └── lib/
├── docker-compose.yml
└── nginx.conf
```

## Environment Variables

See [.env.example](.env.example) for all required variables:

- `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` - Spotify API credentials
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` / `SESSION_SECRET` - Security keys

## License

This project is licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/).

You can view and learn from this code, but commercial use is not permitted.
