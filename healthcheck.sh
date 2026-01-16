#!/bin/bash

# ============================================
# Blindify Health Check Script
# Monitors all services and sends alerts
# ============================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
DOMAIN="https://tymmerc.eu/blindify"
ALERT_EMAIL=""  # Add email for alerts
LOG_FILE="/var/log/blindify-health.log"

# Status tracking
ALL_OK=true

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

check_service() {
    local service_name=$1
    local check_command=$2
    local error_message=$3

    if eval "$check_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} $service_name is healthy"
        return 0
    else
        echo -e "${RED}✗${NC} $service_name is down: $error_message"
        log "ERROR: $service_name - $error_message"
        ALL_OK=false
        return 1
    fi
}

# Check PostgreSQL
check_service "PostgreSQL" \
    "pg_isready" \
    "Database is not responding"

# Check Redis
check_service "Redis" \
    "redis-cli ping" \
    "Redis is not responding"

# Check Backend API
check_service "Backend API" \
    "curl -f -s --max-time 5 $DOMAIN/api/health" \
    "Backend health endpoint failed"

# Check Frontend
check_service "Frontend" \
    "curl -f -s --max-time 5 -o /dev/null $DOMAIN" \
    "Frontend is not accessible"

# Check Disk Space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 80 ]; then
    echo -e "${YELLOW}⚠${NC} Disk usage is high: ${DISK_USAGE}%"
    log "WARNING: Disk usage at ${DISK_USAGE}%"
    ALL_OK=false
else
    echo -e "${GREEN}✓${NC} Disk usage is healthy: ${DISK_USAGE}%"
fi

# Check Memory
MEM_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')
if [ "$MEM_USAGE" -gt 90 ]; then
    echo -e "${YELLOW}⚠${NC} Memory usage is high: ${MEM_USAGE}%"
    log "WARNING: Memory usage at ${MEM_USAGE}%"
else
    echo -e "${GREEN}✓${NC} Memory usage is healthy: ${MEM_USAGE}%"
fi

# Check PM2 processes (if using PM2)
if command -v pm2 &> /dev/null; then
    PM2_STATUS=$(pm2 jlist 2>/dev/null)

    if echo "$PM2_STATUS" | grep -q '"status":"errored"'; then
        echo -e "${RED}✗${NC} Some PM2 processes have errors"
        log "ERROR: PM2 processes in error state"
        ALL_OK=false
    elif echo "$PM2_STATUS" | grep -q '"status":"stopped"'; then
        echo -e "${YELLOW}⚠${NC} Some PM2 processes are stopped"
        log "WARNING: PM2 processes stopped"
        ALL_OK=false
    else
        echo -e "${GREEN}✓${NC} All PM2 processes are running"
    fi
fi

# Check Redis memory
REDIS_MEM=$(redis-cli INFO memory | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')
echo -e "${GREEN}ℹ${NC} Redis memory usage: $REDIS_MEM"

# Check active game sessions
if redis-cli KEYS "game:state:*" | wc -l > /dev/null 2>&1; then
    ACTIVE_GAMES=$(redis-cli KEYS "game:state:*" | wc -l)
    echo -e "${GREEN}ℹ${NC} Active game sessions: $ACTIVE_GAMES"
fi

# Check database connections
DB_CONNECTIONS=$(psql -U blindify -d blindify -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='blindify';" 2>/dev/null || echo "0")
echo -e "${GREEN}ℹ${NC} Database connections: $DB_CONNECTIONS"

# Final status
echo ""
if [ "$ALL_OK" = true ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  All systems operational ✓${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}  System issues detected!${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # Send alert email if configured
    if [ -n "$ALERT_EMAIL" ]; then
        echo "Blindify health check failed on $(hostname) at $(date)" | \
            mail -s "Blindify Alert: System Issues Detected" "$ALERT_EMAIL"
    fi

    exit 1
fi
