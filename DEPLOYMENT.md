# Deployment Guide for Blindify

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Docker Deployment](#docker-deployment)
4. [Railway Deployment](#railway-deployment)
5. [Vercel Deployment (Frontend)](#vercel-deployment)
6. [Manual Deployment](#manual-deployment)
7. [Database Migrations](#database-migrations)
8. [Post-Deployment](#post-deployment)
9. [Monitoring](#monitoring)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js** 20+ (LTS recommended)
- **PostgreSQL** 15+
- **Redis** 7+
- **Docker** & Docker Compose (for containerized deployment)
- **Git**

### Required Accounts
- **Spotify Developer Account** - [Get credentials](https://developer.spotify.com/dashboard)
- **Railway Account** - [Sign up](https://railway.app) (optional, for hosting)
- **Vercel Account** - [Sign up](https://vercel.com) (optional, for frontend)

---

## Environment Setup

### 1. Clone the Repository
```bash
git clone https://github.com/your-org/blindify.git
cd blindify
```

### 2. Configure Environment Variables

#### Backend (.env)
```bash
cd backend
cp .env.example .env
```

Edit `.env` and fill in:
```bash
# Database
DATABASE_URL=postgres://blindify:your_password@localhost:5432/blindify?sslmode=require

# Redis
REDIS_URL=redis://:your_redis_password@localhost:6379

# Spotify API (from https://developer.spotify.com/dashboard)
SPOTIFY_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_SECRET=your_client_secret
SPOTIFY_REDIRECT_URI=https://yourdomain.com/api/auth/callback

# URLs
FRONTEND_URL=https://yourdomain.com
PUBLIC_BACKEND_URL=https://yourdomain.com

# Secrets (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
JWT_SECRET=your_generated_jwt_secret
SESSION_SECRET=your_generated_session_secret

# Cookie Settings
COOKIE_DOMAIN=.yourdomain.com
COOKIE_SECURE=true

# Environment
NODE_ENV=production
PORT=3000

# Monitoring (optional)
SENTRY_DSN=your_sentry_dsn
LOG_LEVEL=info
```

#### Frontend (.env.local)
```bash
cd ../frontend
cp .env.example .env.local
```

Edit `.env.local`:
```bash
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
NEXT_PUBLIC_SOCKET_URL=https://yourdomain.com
```

### 3. Generate Secrets
```bash
# Generate JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate Session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Docker Deployment

### Production Deployment with Docker Compose

#### 1. Configure Environment
Create `.env` in project root:
```bash
# Copy from .env.example and fill in values
cp .env.example .env
```

#### 2. Build and Start Services
```bash
# Build images
docker-compose build

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

#### 3. Initialize Database
```bash
# Run database initialization
docker-compose exec backend npm run init-db
```

#### 4. Verify Deployment
```bash
# Check service health
docker-compose ps

# Test backend health
curl http://localhost:3000/health

# Test frontend
curl http://localhost:3001
```

### With Nginx Reverse Proxy
```bash
# Start with nginx profile
docker-compose --profile with-nginx up -d
```

### Useful Docker Commands
```bash
# Stop services
docker-compose down

# Rebuild specific service
docker-compose build backend

# View logs for specific service
docker-compose logs -f backend

# Restart service
docker-compose restart backend

# Execute command in container
docker-compose exec backend npm run lint
```

---

## Railway Deployment

Railway provides easy deployment with automatic CI/CD.

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

### 2. Create New Project
```bash
railway init
```

### 3. Add PostgreSQL Database
```bash
railway add
# Select PostgreSQL from the list
```

### 4. Add Redis
```bash
railway add
# Select Redis from the list
```

### 5. Configure Environment Variables
In Railway dashboard:
1. Go to your project
2. Navigate to Variables tab
3. Add all variables from `.env.example`
4. Railway automatically provides `DATABASE_URL` and `REDIS_URL`

### 6. Deploy Backend
```bash
cd backend
railway up
```

### 7. Deploy Frontend
```bash
cd ../frontend
railway up
```

### 8. Connect Custom Domain
1. Go to Settings → Domains
2. Add your custom domain
3. Update DNS records as instructed
4. Update `COOKIE_DOMAIN` and URLs in environment variables

---

## Vercel Deployment

Perfect for the Next.js frontend.

### 1. Install Vercel CLI
```bash
npm install -g vercel
```

### 2. Deploy Frontend
```bash
cd frontend
vercel
```

### 3. Configure Environment Variables
In Vercel dashboard:
1. Go to Project Settings → Environment Variables
2. Add:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.railway.app/api
   NEXT_PUBLIC_SOCKET_URL=https://your-backend.railway.app
   ```

### 4. Configure Custom Domain
1. Go to Settings → Domains
2. Add your domain
3. Configure DNS as instructed

---

## Manual Deployment

### Backend Deployment

#### 1. Install Dependencies
```bash
cd backend
npm ci --only=production
```

#### 2. Build TypeScript
```bash
npm run build
```

#### 3. Initialize Database
```bash
npm run init-db
```

#### 4. Start Server
```bash
# Production mode
npm start

# Or with PM2 for process management
npm install -g pm2
pm2 start dist/index.js --name blindify-backend
pm2 save
pm2 startup
```

### Frontend Deployment

#### 1. Install Dependencies
```bash
cd frontend
npm ci
```

#### 2. Build Next.js
```bash
npm run build
```

#### 3. Start Server
```bash
# Production mode
npm start

# Or with PM2
pm2 start npm --name blindify-frontend -- start
pm2 save
```

---

## Database Migrations

### Initial Setup
```bash
cd backend
npm run init-db
```

### Schema Updates
When modifying database schema:

1. Update `init-db.mjs` with new tables/columns
2. Create backup:
   ```bash
   pg_dump blindify > backup_$(date +%Y%m%d).sql
   ```
3. Run migration:
   ```bash
   npm run init-db
   ```

### Rollback (if needed)
```bash
psql blindify < backup_YYYYMMDD.sql
```

---

## Post-Deployment

### 1. Verify Services
```bash
# Backend health check
curl https://yourdomain.com/health

# Frontend
curl https://yourdomain.com

# WebSocket connection
curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" https://yourdomain.com/socket.io/
```

### 2. Test Authentication
1. Navigate to `https://yourdomain.com`
2. Click "Login with Spotify"
3. Verify redirect and callback work
4. Check user session persists

### 3. Test Game Flow
1. Start a solo game
2. Verify audio playback
3. Submit answers
4. Check scoring works
5. Test multiplayer room creation

### 4. Monitor Logs
```bash
# Backend logs (if using PM2)
pm2 logs blindify-backend

# Docker logs
docker-compose logs -f backend

# Railway logs
railway logs
```

---

## Monitoring

### Application Health
Set up health check monitoring (e.g., UptimeRobot, Pingdom):
- URL: `https://yourdomain.com/health`
- Interval: 5 minutes
- Alert on failure

### Error Tracking
Configure Sentry:
```bash
# In .env
SENTRY_DSN=https://xxx@sentry.io/yyy
```

### Log Aggregation
Logs are stored in:
- **Docker**: `/app/logs` (mounted volume)
- **PM2**: `~/.pm2/logs`
- **Railway**: Dashboard → Logs tab

### Database Monitoring
```bash
# Check PostgreSQL performance
psql -c "SELECT * FROM pg_stat_activity;"

# Check Redis memory
redis-cli INFO memory
```

### Performance Metrics
Monitor:
- Response times (target: <200ms for API calls)
- Socket.IO latency
- Redis hit rate
- Database query performance
- Memory usage

---

## Troubleshooting

### Backend Won't Start

**Check logs:**
```bash
docker-compose logs backend
# or
pm2 logs blindify-backend
```

**Common issues:**
- Database connection failed → Verify `DATABASE_URL`
- Redis connection failed → Verify `REDIS_URL`
- Port already in use → Change `PORT` in `.env`

### Database Connection Errors

```bash
# Test connection
psql $DATABASE_URL -c "SELECT 1"

# Check PostgreSQL is running
docker-compose ps postgres
# or
sudo systemctl status postgresql
```

### Redis Connection Errors

```bash
# Test connection
redis-cli -u $REDIS_URL ping

# Check Redis is running
docker-compose ps redis
# or
sudo systemctl status redis
```

### Spotify OAuth Not Working

1. Check redirect URI in Spotify Dashboard matches `SPOTIFY_REDIRECT_URI`
2. Verify `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET`
3. Ensure HTTPS is configured (Spotify requires HTTPS for callbacks)
4. Check CORS settings allow your frontend domain

### WebSocket Connection Fails

1. Verify Socket.IO endpoint: `https://yourdomain.com/socket.io/`
2. Check nginx configuration for WebSocket upgrade headers:
   ```nginx
   proxy_http_version 1.1;
   proxy_set_header Upgrade $http_upgrade;
   proxy_set_header Connection "upgrade";
   ```
3. Ensure firewall allows WebSocket connections

### CORS Errors

In `backend/src/index.ts`, verify CORS configuration includes your domain:
```typescript
const corsOptions = {
  origin: [
    process.env.FRONTEND_URL,
    'https://yourdomain.com'
  ],
  credentials: true
};
```

### High Memory Usage

1. Check for memory leaks in game state cache
2. Clear old game states:
   ```bash
   redis-cli KEYS "game:state:*" | xargs redis-cli DEL
   ```
3. Restart services:
   ```bash
   docker-compose restart backend
   # or
   pm2 restart blindify-backend
   ```

### SSL/HTTPS Issues

**Let's Encrypt with Certbot:**
```bash
# Install certbot
sudo apt install certbot

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Update nginx configuration with cert paths
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

---

## Security Checklist

Before going live, verify:

- [ ] All secrets rotated from development values
- [ ] HTTPS enabled with valid certificate
- [ ] `COOKIE_SECURE=true` in production
- [ ] Database uses SSL: `?sslmode=require`
- [ ] Firewall configured (only expose 80, 443)
- [ ] Rate limiting enabled
- [ ] CORS restricted to known domains
- [ ] Error messages don't leak sensitive info
- [ ] Sentry configured for error tracking
- [ ] Regular backups scheduled
- [ ] Monitoring and alerts configured

---

## Backup Strategy

### Database Backups

**Automated daily backups:**
```bash
# Add to crontab
0 2 * * * pg_dump $DATABASE_URL | gzip > /backups/blindify_$(date +\%Y\%m\%d).sql.gz
```

**Restore from backup:**
```bash
gunzip < backup.sql.gz | psql $DATABASE_URL
```

### Redis Backups

Redis automatically persists with AOF (Append Only File) enabled in docker-compose.yml.

**Manual backup:**
```bash
redis-cli SAVE
cp /var/lib/redis/dump.rdb /backups/redis_$(date +%Y%m%d).rdb
```

---

## Scaling

### Horizontal Scaling

With Redis for state management, you can run multiple backend instances:

```yaml
# docker-compose.yml
backend:
  deploy:
    replicas: 3
  # ... rest of config
```

### Load Balancing

Use nginx or a cloud load balancer to distribute traffic across instances.

### Database Optimization

- Add indexes for frequently queried columns
- Use connection pooling (already configured in `db.ts`)
- Consider read replicas for heavy read loads

---

## Support

For deployment issues:
- Check [GitHub Issues](https://github.com/your-org/blindify/issues)
- Review [SECURITY.md](./SECURITY.md) for security concerns
- Contact: support@blindify.app
