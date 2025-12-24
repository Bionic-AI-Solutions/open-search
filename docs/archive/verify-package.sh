#!/bin/bash

# Package Verification Script
# Run this after extracting to verify all files are present

echo "=========================================="
echo "  OSS Search Infrastructure"
echo "  Package Verification"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

MISSING=0
PRESENT=0

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        ((PRESENT++))
    else
        echo -e "${RED}✗${NC} $1 - MISSING"
        ((MISSING++))
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        ((PRESENT++))
    else
        echo -e "${RED}✗${NC} $1/ - MISSING"
        ((MISSING++))
    fi
}

echo "Checking root files..."
check_file "START_HERE.md"
check_file "README.md"
check_file "DEPLOYMENT.md"
check_file "oss-search-architecture.md"
check_file "docker-compose.yml"
check_file "setup.sh"
check_file "Makefile"
check_file ".env.example"
check_file ".gitignore"

echo ""
echo "Checking MCP Server files..."
check_dir "mcp-server"
check_file "mcp-server/package.json"
check_file "mcp-server/tsconfig.json"
check_file "mcp-server/Dockerfile"
check_file "mcp-server/.env.example"
check_dir "mcp-server/src"
check_file "mcp-server/src/index.ts"
check_file "mcp-server/src/config.ts"
check_dir "mcp-server/src/clients"
check_file "mcp-server/src/clients/searxng.ts"
check_file "mcp-server/src/clients/crawl4ai.ts"
check_file "mcp-server/src/clients/redis.ts"
check_dir "mcp-server/src/tools"
check_file "mcp-server/src/tools/search.ts"
check_file "mcp-server/src/tools/crawl.ts"
check_file "mcp-server/src/tools/extract.ts"
check_file "mcp-server/src/tools/analyze.ts"
check_file "mcp-server/src/tools/index.ts"
check_dir "mcp-server/src/types"
check_file "mcp-server/src/types/index.ts"
check_dir "mcp-server/src/utils"
check_file "mcp-server/src/utils/cache.ts"

echo ""
echo "Checking Crawl4AI Service files..."
check_dir "crawl4ai-service"
check_file "crawl4ai-service/main.py"
check_file "crawl4ai-service/requirements.txt"
check_file "crawl4ai-service/Dockerfile"

echo ""
echo "Checking configuration files..."
check_dir "searxng"
check_file "searxng/settings.yml"
check_file "searxng/limiter.toml"
check_dir "nginx"
check_file "nginx/nginx.conf"
check_dir "postgres"
check_file "postgres/init.sql"

echo ""
echo "Checking Kubernetes manifests..."
check_dir "k8s"
check_file "k8s/namespace.yaml"
check_dir "k8s/deployments"
check_file "k8s/deployments/redis.yaml"
check_file "k8s/deployments/searxng.yaml"
check_file "k8s/deployments/crawl4ai.yaml"
check_file "k8s/deployments/mcp-server.yaml"
check_file "k8s/deployments/mcp-server-hpa.yaml"
check_dir "k8s/services"
check_file "k8s/services/redis.yaml"
check_file "k8s/services/searxng.yaml"
check_file "k8s/services/crawl4ai.yaml"
check_file "k8s/services/mcp-server.yaml"
check_dir "k8s/storage"
check_file "k8s/storage/redis-pvc.yaml"
check_dir "k8s/ingress"
check_file "k8s/ingress/ingress.yaml"

echo ""
echo "=========================================="
echo "  Verification Results"
echo "=========================================="
echo -e "Files present: ${GREEN}$PRESENT${NC}"
echo -e "Files missing: ${RED}$MISSING${NC}"
echo ""

if [ $MISSING -eq 0 ]; then
    echo -e "${GREEN}✓ All files present! Package is complete.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Review START_HERE.md for quick start"
    echo "2. Run: chmod +x setup.sh"
    echo "3. Run: ./setup.sh"
    echo ""
    exit 0
else
    echo -e "${RED}✗ Some files are missing!${NC}"
    echo "Please re-download the package or contact support."
    echo ""
    exit 1
fi
