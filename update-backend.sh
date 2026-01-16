#!/bin/bash

set -e  # Exit on error

echo "🚀 Blindify Backend Update Script"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

cd /opt/blindify/backend

echo -e "${BLUE}[1/6]${NC} Stopping old backend container..."
docker stop blindify-backend 2>/dev/null || echo "Container already stopped"

echo -e "${BLUE}[2/6]${NC} Removing old container..."
docker rm blindify-backend 2>/dev/null || echo "Container already removed"

echo -e "${BLUE}[3/6]${NC} Building new image with updated dependencies..."
docker build -t blindify-backend . 2>&1 | tail -20

echo -e "${BLUE}[4/6]${NC} Starting new container..."
docker run -d \
  --name blindify-backend \
  --network host \
  --restart unless-stopped \
  --env-file .env \
  -e REDIS_URL=redis://localhost:6379 \
  -e LOG_LEVEL=info \
  blindify-backend

echo -e "${BLUE}[5/6]${NC} Waiting for backend to start..."
sleep 5

echo -e "${BLUE}[6/6]${NC} Checking status..."
docker logs --tail 20 blindify-backend

echo ""
echo -e "${GREEN}✅ Backend updated and restarted!${NC}"
echo ""
echo "Test it: curl https://tymmerc.eu/blindify/api/health"
echo "View logs: docker logs -f blindify-backend"
echo ""
