#!/bin/bash

# OSS Search Infrastructure Setup Script
# This script helps you deploy the complete search infrastructure

set -e

echo "================================================"
echo "  OSS Search Infrastructure Setup"
echo "================================================"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    print_success "Docker found: $(docker --version)"
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    print_success "Docker Compose found"
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker."
        exit 1
    fi
    print_success "Docker daemon is running"
}

# Create directory structure
create_directories() {
    print_info "Creating directory structure..."
    
    mkdir -p searxng
    mkdir -p crawl4ai-service/logs
    mkdir -p mcp-server/src/{clients,tools,utils,types}
    mkdir -p nginx/ssl
    mkdir -p postgres
    mkdir -p k8s/{deployments,services,configmaps,secrets,ingress,storage}
    
    print_success "Directory structure created"
}

# Generate secrets
generate_secrets() {
    print_info "Generating secrets..."
    
    # Generate SearXNG secret
    SEARXNG_SECRET=$(openssl rand -hex 32)
    DB_PASSWORD=$(openssl rand -hex 16)
    
    # Create .env file
    cat > .env << EOF
# SearXNG Configuration
SEARXNG_SECRET=${SEARXNG_SECRET}

# Database Configuration
DB_PASSWORD=${DB_PASSWORD}

# Cache Configuration
CACHE_TTL_SEARCH=3600
CACHE_TTL_CRAWL=86400

# MCP Server Configuration
NODE_ENV=production
LOG_LEVEL=info
EOF
    
    print_success "Secrets generated and saved to .env"
    print_info "IMPORTANT: Keep the .env file secure and add it to .gitignore"
}

# Create nginx configuration
create_nginx_config() {
    print_info "Creating nginx configuration..."
    
    cat > nginx/nginx.conf << 'EOF'
events {
    worker_connections 1024;
}

http {
    upstream mcp_backend {
        least_conn;
        server mcp-server:3000 max_fails=3 fail_timeout=30s;
    }
    
    upstream searxng_backend {
        server searxng:8080 max_fails=3 fail_timeout=30s;
    }
    
    server {
        listen 80;
        server_name localhost;
        
        # MCP Server
        location / {
            proxy_pass http://mcp_backend;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            
            # Timeouts
            proxy_connect_timeout 60s;
            proxy_send_timeout 60s;
            proxy_read_timeout 60s;
        }
        
        # SearXNG (optional direct access)
        location /searxng/ {
            proxy_pass http://searxng_backend/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
        
        # Health check
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF
    
    print_success "Nginx configuration created"
}

# Create PostgreSQL init script
create_postgres_init() {
    print_info "Creating PostgreSQL init script..."
    
    cat > postgres/init.sql << 'EOF'
-- Search Analytics Database Schema

CREATE TABLE IF NOT EXISTS search_queries (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    engine TEXT,
    results_count INTEGER,
    response_time_ms INTEGER,
    client_id TEXT,
    timestamp TIMESTAMP DEFAULT NOW(),
    INDEX idx_timestamp (timestamp),
    INDEX idx_query (query)
);

CREATE TABLE IF NOT EXISTS crawl_jobs (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    content_hash TEXT,
    extraction_strategy TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    completed_at TIMESTAMP,
    error_message TEXT,
    INDEX idx_url (url),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

CREATE TABLE IF NOT EXISTS cache_stats (
    id SERIAL PRIMARY KEY,
    cache_key TEXT NOT NULL,
    hit_count INTEGER DEFAULT 0,
    last_accessed TIMESTAMP DEFAULT NOW(),
    INDEX idx_cache_key (cache_key)
);

-- Create views for analytics
CREATE OR REPLACE VIEW search_stats AS
SELECT 
    DATE(timestamp) as date,
    COUNT(*) as total_searches,
    AVG(response_time_ms) as avg_response_time,
    COUNT(DISTINCT query) as unique_queries
FROM search_queries
GROUP BY DATE(timestamp)
ORDER BY date DESC;

CREATE OR REPLACE VIEW popular_queries AS
SELECT 
    query,
    COUNT(*) as search_count,
    MAX(timestamp) as last_searched
FROM search_queries
GROUP BY query
ORDER BY search_count DESC
LIMIT 100;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO searchuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO searchuser;
EOF
    
    print_success "PostgreSQL init script created"
}

# Build and start services
start_services() {
    print_info "Building and starting services..."
    
    # Build images
    print_info "Building Docker images (this may take a few minutes)..."
    docker-compose build
    
    # Start services
    print_info "Starting services..."
    docker-compose up -d
    
    print_success "Services started"
}

# Wait for services
wait_for_services() {
    print_info "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose ps | grep -q "healthy"; then
            sleep 5
            attempt=$((attempt + 1))
            echo -n "."
        else
            break
        fi
    done
    
    echo ""
    print_success "Services are ready"
}

# Display status
display_status() {
    echo ""
    echo "================================================"
    echo "  Deployment Status"
    echo "================================================"
    echo ""
    
    docker-compose ps
    
    echo ""
    echo "================================================"
    echo "  Access Information"
    echo "================================================"
    echo ""
    echo "MCP Server:       http://localhost:3000"
    echo "SearXNG:          http://localhost:8080"
    echo "Crawl4AI:         http://localhost:8000"
    echo "Redis Commander:  http://localhost:8081 (if debug profile enabled)"
    echo "PostgreSQL:       localhost:5432"
    echo ""
    echo "================================================"
    echo "  Next Steps"
    echo "================================================"
    echo ""
    echo "1. Test SearXNG:"
    echo "   curl 'http://localhost:8080/search?q=test&format=json'"
    echo ""
    echo "2. Test Crawl4AI:"
    echo "   curl -X POST http://localhost:8000/crawl \\"
    echo "     -H 'Content-Type: application/json' \\"
    echo "     -d '{\"url\": \"https://example.com\"}'"
    echo ""
    echo "3. Configure MCP client with the server endpoint"
    echo ""
    echo "4. View logs:"
    echo "   docker-compose logs -f [service-name]"
    echo ""
    echo "5. Stop services:"
    echo "   docker-compose down"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    create_directories
    generate_secrets
    create_nginx_config
    create_postgres_init
    start_services
    wait_for_services
    display_status
    
    print_success "Setup completed successfully!"
}

# Run main function
main
