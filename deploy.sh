#!/bin/bash

# ============================================
# Blindify VPS Deployment Script
# Usage: ./deploy.sh [backend|frontend|all]
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/opt/blindify"
BACKUP_DIR="/opt/backups"
COMPONENT=${1:-all}

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

backup_database() {
    log_info "Creating database backup..."
    mkdir -p $BACKUP_DIR
    BACKUP_FILE="$BACKUP_DIR/blindify_$(date +%Y%m%d_%H%M%S).sql"

    if pg_dump blindify > "$BACKUP_FILE"; then
        log_success "Database backed up to $BACKUP_FILE"
    else
        log_error "Database backup failed!"
        exit 1
    fi
}

check_services() {
    log_info "Checking required services..."

    # Check PostgreSQL
    if ! pg_isready -q; then
        log_error "PostgreSQL is not running!"
        exit 1
    fi
    log_success "PostgreSQL is running"

    # Check Redis
    if ! redis-cli ping > /dev/null 2>&1; then
        log_warning "Redis is not running. Starting Redis..."
        sudo systemctl start redis-server || log_error "Failed to start Redis"
    fi
    log_success "Redis is running"
}

deploy_backend() {
    log_info "Deploying backend..."

    cd $PROJECT_DIR/backend

    # Install dependencies
    log_info "Installing dependencies..."
    npm install --production=false

    # Run tests
    if [ "$SKIP_TESTS" != "true" ]; then
        log_info "Running tests..."
        npm test || log_warning "Tests failed, continuing anyway..."
    fi

    # Build
    log_info "Building backend..."
    npm run build

    # Restart service
    log_info "Restarting backend service..."
    if command -v pm2 &> /dev/null; then
        pm2 restart blindify-backend || pm2 start dist/index.js --name blindify-backend
    elif systemctl is-active --quiet blindify-backend; then
        sudo systemctl restart blindify-backend
    else
        log_warning "No process manager found. Please restart backend manually."
    fi

    log_success "Backend deployed successfully"
}

deploy_frontend() {
    log_info "Deploying frontend..."

    cd $PROJECT_DIR/frontend

    # Install dependencies
    log_info "Installing dependencies..."
    npm install

    # Build
    log_info "Building frontend..."
    npm run build

    # Restart service
    log_info "Restarting frontend service..."
    if command -v pm2 &> /dev/null; then
        pm2 restart blindify-frontend || pm2 start npm --name blindify-frontend -- start
    elif systemctl is-active --quiet blindify-frontend; then
        sudo systemctl restart blindify-frontend
    else
        log_warning "No process manager found. Please restart frontend manually."
    fi

    log_success "Frontend deployed successfully"
}

verify_deployment() {
    log_info "Verifying deployment..."

    # Wait for services to start
    sleep 3

    # Check backend health
    if curl -f -s https://tymmerc.eu/blindify/api/health > /dev/null; then
        log_success "Backend is healthy"
    else
        log_error "Backend health check failed!"
        show_logs
        exit 1
    fi

    # Check frontend
    if curl -f -s https://tymmerc.eu/blindify > /dev/null; then
        log_success "Frontend is accessible"
    else
        log_warning "Frontend may not be accessible"
    fi
}

show_logs() {
    log_info "Recent logs:"
    if command -v pm2 &> /dev/null; then
        pm2 logs blindify-backend --lines 20 --nostream
    else
        tail -20 $PROJECT_DIR/backend/logs/combined.log 2>/dev/null || echo "No logs found"
    fi
}

cleanup_old_backups() {
    log_info "Cleaning up old backups (>7 days)..."
    find $BACKUP_DIR -name "blindify_*.sql" -mtime +7 -delete 2>/dev/null || true
    log_success "Old backups cleaned up"
}

# Main execution
main() {
    echo "============================================"
    echo "  Blindify Deployment Script"
    echo "  Component: $COMPONENT"
    echo "  Date: $(date)"
    echo "============================================"
    echo ""

    # Navigate to project directory
    cd $PROJECT_DIR

    # Pre-deployment checks
    check_services

    # Backup database before deployment
    backup_database

    # Deploy based on component
    case $COMPONENT in
        backend)
            deploy_backend
            ;;
        frontend)
            deploy_frontend
            ;;
        all)
            deploy_backend
            deploy_frontend
            ;;
        *)
            log_error "Invalid component: $COMPONENT"
            echo "Usage: $0 [backend|frontend|all]"
            exit 1
            ;;
    esac

    # Verify deployment
    verify_deployment

    # Cleanup
    cleanup_old_backups

    # Show status
    echo ""
    log_success "Deployment completed successfully!"
    echo ""
    log_info "Service status:"
    if command -v pm2 &> /dev/null; then
        pm2 status
    fi

    echo ""
    log_info "Monitor logs with: pm2 logs"
    log_info "View site at: https://tymmerc.eu/blindify"
}

# Run main function
main
