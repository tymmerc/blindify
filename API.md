# Blindify API Documentation

## Base URL
```
Production: https://blindify.app/api
Development: http://localhost:3000/api
```

## Authentication

All authenticated endpoints require a session cookie or Bearer token.

### Session Cookie
Set automatically after successful login. Include `credentials: 'include'` in fetch requests.

### Headers
```
Cookie: session=<session_token>
```

---

## Endpoints

### 🔐 Authentication

#### `GET /auth/login`
Initiates Spotify OAuth flow.

**Response:**
- Redirects to Spotify authorization page

---

#### `GET /auth/spotify/callback`
OAuth callback handler.

**Query Parameters:**
- `code` (string): Authorization code from Spotify
- `state` (string): CSRF protection token

**Response:**
- Redirects to frontend with session cookie set

---

#### `POST /auth/guest`
Creates a guest user session (no Spotify account required).

**Response:** `200 OK`
```json
{
  "sessionToken": "abc123...",
  "user": {
    "id": "guest-uuid",
    "displayName": "Guest",
    "provider": "GUEST",
    "email": null,
    "imageUrl": null
  }
}
```

---

#### `GET /auth/me`
Returns current authenticated user.

**Auth:** Required

**Response:** `200 OK`
```json
{
  "id": "user-uuid",
  "displayName": "John Doe",
  "provider": "SPOTIFY",
  "email": "john@example.com",
  "imageUrl": "https://...",
  "createdAt": "2024-01-01T00:00:00Z"
}
```

**Error:** `401 Unauthorized`
```json
{
  "error": "Not authenticated"
}
```

---

#### `POST /auth/logout`
Destroys current session.

**Auth:** Required

**Response:** `200 OK`
```json
{
  "message": "Logged out successfully"
}
```

---

### 🎮 Games

#### `POST /api/games/solo`
Starts a new solo game.

**Auth:** Required

**Request Body:**
```json
{
  "source": "liked" | "library" | "playlist" | "top_week" | "top_month" | "top_all",
  "playlistId": "spotify:playlist:xxx" // Required if source is "playlist"
  "difficulty": "easy" | "medium" | "hard",
  "rounds": 10
}
```

**Response:** `200 OK`
```json
{
  "sessionId": "game-session-uuid",
  "tracks": [
    {
      "id": "track-uuid",
      "previewUrl": "https://...",
      "duration": 30000,
      "albumCover": "https://..."
    }
  ],
  "settings": {
    "rounds": 10,
    "difficulty": "medium"
  }
}
```

---

#### `POST /api/games/solo/complete`
Records solo game results.

**Auth:** Required

**Request Body:**
```json
{
  "sessionId": "game-session-uuid",
  "rounds": [
    {
      "trackId": "track-uuid",
      "correct": true,
      "reactionTimeMs": 5234,
      "score": 145
    }
  ],
  "totalScore": 1450,
  "accuracy": 0.9
}
```

**Response:** `200 OK`
```json
{
  "gameId": "game-record-uuid",
  "rank": 156,
  "newBadges": ["speed_demon"],
  "xpGained": 150
}
```

---

#### `GET /api/games/history`
Returns user's game history.

**Auth:** Required

**Query Parameters:**
- `limit` (number, optional): Max results (default: 20)
- `offset` (number, optional): Pagination offset (default: 0)
- `mode` (string, optional): Filter by game mode

**Response:** `200 OK`
```json
{
  "games": [
    {
      "id": "game-uuid",
      "mode": "SOLO",
      "score": 1450,
      "accuracy": 0.9,
      "rounds": 10,
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "total": 45,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### 🚪 Rooms (Multiplayer)

#### `POST /api/rooms/create`
Creates a new multiplayer room.

**Auth:** Required

**Request Body:**
```json
{
  "mode": "FRIENDS" | "EVENT" | "STREAMER",
  "settings": {
    "maxPlayers": 8,
    "rounds": 10,
    "roundDuration": 25000,
    "difficulty": "medium"
  },
  "isPrivate": true
}
```

**Response:** `200 OK`
```json
{
  "roomCode": "ABC123",
  "hostId": "user-uuid",
  "mode": "FRIENDS",
  "settings": { ... },
  "createdAt": "2024-01-01T00:00:00Z"
}
```

---

#### `GET /api/rooms/:code`
Gets room details.

**Auth:** Required

**Response:** `200 OK`
```json
{
  "roomCode": "ABC123",
  "hostId": "user-uuid",
  "mode": "FRIENDS",
  "players": [
    {
      "id": "user-uuid",
      "displayName": "John",
      "ready": true,
      "isHost": true
    }
  ],
  "settings": { ... },
  "state": "LOBBY" | "PLAYING" | "FINISHED"
}
```

**Error:** `404 Not Found`
```json
{
  "error": "Room not found"
}
```

---

#### `POST /api/rooms/:code/join`
Joins a room.

**Auth:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "room": { ... }
}
```

**Errors:**
- `404`: Room not found
- `403`: Room is full or private
- `409`: Already in room

---

#### `POST /api/rooms/:code/preferences`
Sets player source preferences for multiplayer.

**Auth:** Required

**Request Body:**
```json
{
  "sources": ["liked", "library"],
  "excludeSources": []
}
```

**Response:** `200 OK`

---

#### `POST /api/rooms/:code/start`
Starts the game (host only).

**Auth:** Required (must be host)

**Response:** `200 OK`
```json
{
  "success": true,
  "gameStarted": true
}
```

**Error:** `403 Forbidden`
```json
{
  "error": "Only host can start the game"
}
```

---

### 👥 Friends

#### `GET /api/friends`
Gets user's friends list.

**Auth:** Required

**Response:** `200 OK`
```json
{
  "friends": [
    {
      "id": "user-uuid",
      "displayName": "Alice",
      "imageUrl": "https://...",
      "status": "ACCEPTED",
      "onlineStatus": "online" | "offline",
      "currentActivity": "playing" | "idle" | "hosting"
    }
  ]
}
```

---

#### `POST /api/friends/:userId/request`
Sends friend request.

**Auth:** Required

**Response:** `200 OK`
```json
{
  "success": true,
  "friendshipId": "friendship-uuid"
}
```

---

#### `POST /api/friends/:userId/accept`
Accepts friend request.

**Auth:** Required

**Response:** `200 OK`

---

#### `DELETE /api/friends/:userId`
Removes friend.

**Auth:** Required

**Response:** `200 OK`

---

#### `POST /api/friends/:userId/block`
Blocks user.

**Auth:** Required

**Response:** `200 OK`

---

### 📨 Invitations

#### `GET /api/invitations`
Gets pending invitations.

**Auth:** Required

**Response:** `200 OK`
```json
{
  "invitations": [
    {
      "id": "invite-uuid",
      "roomCode": "ABC123",
      "fromUser": {
        "id": "user-uuid",
        "displayName": "Bob"
      },
      "createdAt": "2024-01-01T00:00:00Z",
      "expiresAt": "2024-01-01T00:01:00Z"
    }
  ]
}
```

---

#### `POST /api/invitations`
Sends room invitation to friend.

**Auth:** Required

**Request Body:**
```json
{
  "roomCode": "ABC123",
  "userId": "friend-user-uuid"
}
```

**Response:** `200 OK`

---

#### `PATCH /api/invitations/:id`
Accepts or declines invitation.

**Auth:** Required

**Request Body:**
```json
{
  "action": "accept" | "decline"
}
```

**Response:** `200 OK`

---

### 📊 Stats

#### `GET /api/stats`
Gets user statistics.

**Auth:** Required

**Response:** `200 OK`
```json
{
  "gamesPlayed": 145,
  "totalScore": 145000,
  "averageScore": 1000,
  "accuracy": 0.87,
  "currentStreak": 5,
  "longestStreak": 12,
  "xp": 15000,
  "level": 15,
  "rank": 156
}
```

---

#### `GET /api/stats/leaderboard`
Gets global leaderboard.

**Query Parameters:**
- `limit` (number, optional): Max results (default: 100)
- `offset` (number, optional): Pagination offset
- `period` (string, optional): "daily" | "weekly" | "monthly" | "all-time"

**Response:** `200 OK`
```json
{
  "leaderboard": [
    {
      "rank": 1,
      "userId": "user-uuid",
      "displayName": "ProPlayer",
      "score": 15000,
      "accuracy": 0.95,
      "gamesPlayed": 200
    }
  ],
  "pagination": { ... }
}
```

---

### 🎵 Audio Sources

#### `GET /api/audio-sources`
Lists available audio sources.

**Auth:** Required

**Query Parameters:**
- `provider` (string, optional): Filter by provider
- `limit`, `offset`: Pagination

**Response:** `200 OK`
```json
{
  "sources": [
    {
      "id": "source-uuid",
      "provider": "SPOTIFY",
      "title": "Song Title",
      "artist": "Artist Name",
      "album": "Album Name",
      "previewUrl": "https://...",
      "albumCover": "https://...",
      "popularity": 85
    }
  ],
  "pagination": { ... }
}
```

---

#### `POST /api/audio-sources/import`
Imports tracks from Spotify/iTunes.

**Auth:** Required

**Request Body:**
```json
{
  "provider": "SPOTIFY",
  "source": "library" | "liked" | "playlist",
  "playlistId": "spotify:playlist:xxx" // If source is playlist
}
```

**Response:** `200 OK`
```json
{
  "imported": 145,
  "duplicates": 12,
  "failed": 0
}
```

---

### ❤️ Likes

#### `POST /api/likes`
Likes a track.

**Auth:** Required

**Request Body:**
```json
{
  "trackId": "source-uuid"
}
```

**Response:** `200 OK`

---

#### `DELETE /api/likes/:trackId`
Unlikes a track.

**Auth:** Required

**Response:** `200 OK`

---

#### `GET /api/likes`
Gets user's liked tracks.

**Auth:** Required

**Response:** `200 OK`
```json
{
  "likes": [
    {
      "trackId": "source-uuid",
      "track": { ... },
      "likedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

## Socket.IO Events

Connect to WebSocket:
```javascript
import { io } from 'socket.io-client';

const socket = io('https://blindify.app', {
  auth: {
    token: sessionToken
  }
});
```

### Client → Server Events

#### `room:join`
Joins a room for real-time updates.

```javascript
socket.emit('room:join', {
  roomCode: 'ABC123'
});
```

---

#### `room:leave`
Leaves current room.

```javascript
socket.emit('room:leave');
```

---

#### `game:answer`
Submits answer during multiplayer game.

```javascript
socket.emit('game:answer', {
  trackId: 'track-uuid',
  artist: 'Artist Name',
  title: 'Song Title',
  timestamp: Date.now()
});
```

---

#### `game:ready`
Signals ready for next round (friends/event mode).

```javascript
socket.emit('game:ready');
```

---

#### `host:start`
Starts next round (streamer mode, host only).

```javascript
socket.emit('host:start');
```

---

#### `presence:heartbeat`
Keeps presence alive (sent automatically every 30s).

```javascript
socket.emit('presence:heartbeat');
```

---

### Server → Client Events

#### `room:presence`
User joined/left/disconnected from room.

```javascript
socket.on('room:presence', (data) => {
  console.log(data.action); // 'joined' | 'left' | 'disconnected'
  console.log(data.user);
});
```

---

#### `game:state`
Full game state update.

```javascript
socket.on('game:state', (state) => {
  console.log(state.phase); // 'LOBBY' | 'GUESSING' | 'REVEAL' | 'FINISHED'
  console.log(state.players);
  console.log(state.currentRound);
});
```

---

#### `game:round:start`
New round begins.

```javascript
socket.on('game:round:start', (data) => {
  console.log(data.round);
  console.log(data.track.previewUrl);
  console.log(data.deadline); // Timestamp when round ends
});
```

---

#### `game:player_answered`
Another player submitted answer.

```javascript
socket.on('game:player_answered', (data) => {
  console.log(data.playerId);
});
```

---

#### `game:round:reveal`
Answers revealed.

```javascript
socket.on('game:round:reveal', (data) => {
  console.log(data.correctAnswer);
  console.log(data.playerResults);
});
```

---

#### `game:over`
Game finished.

```javascript
socket.on('game:over', (data) => {
  console.log(data.finalScores);
  console.log(data.winner);
});
```

---

#### `friends:status:update`
Friend's online status changed.

```javascript
socket.on('friends:status:update', (data) => {
  console.log(data.userId);
  console.log(data.status); // 'online' | 'offline'
  console.log(data.activity); // 'idle' | 'playing' | 'hosting'
});
```

---

#### `server:tick`
Server time synchronization (every 5 seconds).

```javascript
socket.on('server:tick', (data) => {
  console.log(data.serverTime);
});
```

---

#### `room:error`
Error occurred in room.

```javascript
socket.on('room:error', (error) => {
  console.error(error.message);
});
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": { }
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| `UNAUTHORIZED` | Not authenticated |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `VALIDATION_ERROR` | Invalid request data |
| `RATE_LIMITED` | Too many requests |
| `ROOM_FULL` | Room has reached max players |
| `GAME_IN_PROGRESS` | Cannot join, game already started |
| `SPOTIFY_ERROR` | Spotify API error |

---

## Rate Limiting

**Global Limit:** 600 requests per minute per IP

**Slow Down:** After 120 requests/minute, requests are delayed

**Headers:**
```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 580
X-RateLimit-Reset: 1640000000
```

**429 Response:**
```json
{
  "error": "Too many requests",
  "retryAfter": 60
}
```

---

## Pagination

List endpoints support pagination:

**Query Parameters:**
- `limit`: Max results (default varies by endpoint)
- `offset`: Skip N results

**Response:**
```json
{
  "data": [ ... ],
  "pagination": {
    "total": 145,
    "limit": 20,
    "offset": 40,
    "hasMore": true
  }
}
```

---

## Webhooks (Future)

Coming soon: Webhooks for game events, friend activities, etc.

---

## Client Libraries

### JavaScript/TypeScript
```bash
npm install @blindify/api-client
```

```typescript
import { BlindifyClient } from '@blindify/api-client';

const client = new BlindifyClient({
  baseURL: 'https://blindify.app/api',
  sessionToken: 'your-session-token'
});

const user = await client.auth.me();
const room = await client.rooms.create({ mode: 'FRIENDS' });
```

---

## API Versioning

Current version: **v1** (implicit, no prefix required)

Future versions will use: `/api/v2/...`

---

## Support

- **Documentation:** https://docs.blindify.app
- **API Status:** https://status.blindify.app
- **Issues:** https://github.com/your-org/blindify/issues
- **Email:** api@blindify.app
