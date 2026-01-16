# ⚠️ ACTION REQUIRED - Immediate Steps

## 🚨 CRITICAL - Do This First

### 1. Rotate All Secrets Immediately

Your current `.env` file may contain exposed credentials. You **MUST** rotate all secrets before deploying to production.

#### Generate New Secrets

```bash
# Navigate to project root
cd /opt/blindify

# Generate new JWT secret
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Generate new SESSION secret
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

Copy these values to your `.env` file.

#### Rotate Spotify Credentials

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Go to your app settings
3. Click "Show Client Secret"
4. Click "Reset Client Secret" (or create a new app)
5. Update `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` in `.env`

**⚠️ Important**: After rotating, the old credentials will stop working!

---

## 🔧 Setup Steps

### 2. Install New Dependencies

```bash
# Backend
cd /opt/blindify/backend
npm install

# This will install:
# - ioredis (Redis client)
# - winston (Logging)
# - @sentry/node (Error tracking)
# - @sentry/profiling-node (Performance monitoring)
# - supertest (Testing)
```

### 3. Set Up Redis

#### Option A: Using Docker (Recommended)

```bash
# In project root
docker-compose up -d redis

# Verify Redis is running
docker-compose ps redis
```

#### Option B: Local Installation

```bash
# macOS (with Homebrew)
brew install redis
brew services start redis

# Ubuntu/Debian
sudo apt update
sudo apt install redis-server
sudo systemctl start redis

# Verify
redis-cli ping  # Should return "PONG"
```

Update `.env`:
```bash
REDIS_URL=redis://localhost:6379
```

### 4. Update Environment Variables

Edit `/opt/blindify/backend/.env`:

```bash
# Add these new variables:
REDIS_URL=redis://localhost:6379
SENTRY_DSN=  # Optional, leave empty for now
LOG_LEVEL=info  # or 'debug' for development

# Verify existing variables are correct:
DATABASE_URL=postgres://...
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
JWT_SECRET=<your-new-jwt-secret>
SESSION_SECRET=<your-new-session-secret>
```

---

## ✅ Verification

### 5. Test the Setup

```bash
cd /opt/blindify/backend

# Run tests
npm test

# Expected output: All tests pass ✓

# Start development server
npm run dev

# In another terminal, verify health
curl http://localhost:3000/health
# Expected: {"status":"ok",...}
```

### 6. Test Frontend

```bash
cd /opt/blindify/frontend

# Install dependencies (if not already done)
npm install

# Start development server
npm run dev

# Visit http://localhost:3001
# Expected: Blindify homepage loads
```

---

## 📋 Review Checklist

Before deploying to production, verify:

- [ ] All secrets rotated from development values
- [ ] Redis installed and running
- [ ] Backend starts without errors (`npm run dev`)
- [ ] Frontend starts without errors (`npm run dev`)
- [ ] Tests pass (`npm test`)
- [ ] Database connection works
- [ ] Redis connection works
- [ ] Health endpoint returns 200 (`curl http://localhost:3000/health`)
- [ ] Spotify OAuth flow works (try logging in)
- [ ] `.env` file is NOT committed to git (`git status` shouldn't show it)

---

## 📚 Next Steps

### After Verification

1. **Review Documentation**:
   - Read [SECURITY.md](./SECURITY.md) for security best practices
   - Review [API.md](./API.md) for API changes
   - Check [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment options

2. **Deploy to Staging** (if you have one):
   ```bash
   # Using Docker Compose
   docker-compose up -d

   # Or deploy to Railway/Vercel (see DEPLOYMENT.md)
   ```

3. **Set Up Monitoring**:
   - Sign up for [Sentry](https://sentry.io) (free tier available)
   - Add `SENTRY_DSN` to `.env`
   - Restart backend

4. **Run Full Test Suite**:
   ```bash
   cd backend
   npm run test:coverage

   # Review coverage report
   open coverage/index.html
   ```

---

## 🐛 Troubleshooting

### Redis Connection Error

**Error**: `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution**:
```bash
# Check if Redis is running
redis-cli ping

# If not running:
# Docker:
docker-compose up -d redis

# Local:
sudo systemctl start redis
# or
brew services start redis
```

### Database Connection Error

**Error**: `Error: connect ECONNREFUSED postgresql://...`

**Solution**:
```bash
# Verify PostgreSQL is running
psql -c "SELECT 1"

# Check DATABASE_URL in .env
# Ensure database exists:
createdb blindify

# Run initialization:
npm run init-db
```

### Port Already in Use

**Error**: `Error: listen EADDRINUSE: address already in use :::3000`

**Solution**:
```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>

# Or change PORT in .env
PORT=3001
```

### Tests Fail

**Error**: Test failures after installation

**Solution**:
```bash
# Ensure test database exists
createdb blindify_test

# Set test environment variable
export TEST_DATABASE_URL="postgres://blindify:password@localhost:5432/blindify_test"

# Re-run tests
npm test
```

---

## 📞 Getting Help

If you encounter issues:

1. **Check the logs**:
   ```bash
   # Backend logs
   docker-compose logs -f backend
   # or if running locally
   tail -f backend/logs/combined.log
   ```

2. **Review documentation**:
   - [SECURITY.md](./SECURITY.md)
   - [DEPLOYMENT.md](./DEPLOYMENT.md)
   - [TESTING.md](./backend/TESTING.md)

3. **Check git status**:
   ```bash
   git status
   # Make sure .env is not staged!
   ```

4. **Verify all dependencies**:
   ```bash
   # Backend
   cd backend && npm list --depth=0

   # Frontend
   cd ../frontend && npm list --depth=0
   ```

---

## 🎯 Quick Commands Reference

```bash
# Install dependencies
cd backend && npm install
cd ../frontend && npm install

# Run tests
cd backend && npm test

# Start development
cd backend && npm run dev        # Terminal 1
cd frontend && npm run dev       # Terminal 2

# Docker deployment
docker-compose up -d             # Start all services
docker-compose logs -f           # View logs
docker-compose down              # Stop all services

# Database operations
cd backend && npm run init-db    # Initialize database
psql $DATABASE_URL               # Access database

# Generate secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## ✨ Summary

**What Changed**:
- ✅ Added Redis for scalability
- ✅ Added Winston for logging
- ✅ Added Sentry for error tracking
- ✅ Added comprehensive tests
- ✅ Improved Docker configuration
- ✅ Enhanced security practices
- ✅ Complete documentation

**What You Need to Do**:
1. ⚠️ Rotate all secrets (CRITICAL)
2. 🔧 Install new dependencies (`npm install`)
3. 🔧 Set up Redis
4. ✅ Verify everything works
5. 📚 Read the new documentation
6. 🚀 Deploy to production (when ready)

**Time Required**: ~30 minutes

---

**Last Updated**: 2024-01-14
**Priority**: 🔴 HIGH - Complete before production deployment
