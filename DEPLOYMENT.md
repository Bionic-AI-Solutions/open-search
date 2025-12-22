# Deployment Guide

This guide will walk you through deploying the OSS Search Infrastructure step by step.

## Table of Contents
1. [Docker Compose Deployment](#docker-compose-deployment)
2. [Kubernetes Deployment](#kubernetes-deployment)
3. [MCP Client Configuration](#mcp-client-configuration)
4. [Verification](#verification)
5. [Troubleshooting](#troubleshooting)

---

## Docker Compose Deployment

### Prerequisites
- Docker 24.0+
- Docker Compose 2.20+
- 4GB RAM minimum (8GB recommended)
- 20GB disk space

### Quick Start

**Option 1: Automated Setup (Recommended)**

```bash
# Make setup script executable
chmod +x setup.sh

# Run automated setup
./setup.sh
```

The script will:
- Check prerequisites
- Create directories
- Generate secrets
- Build images
- Start services
- Display access information

**Option 2: Manual Setup**

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Edit .env with your values
nano .env

# 3. Generate secrets
SEARXNG_SECRET=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 16)

# Update .env with these secrets

# 4. Build images
docker-compose build

# 5. Start services
docker-compose up -d

# 6. Check status
docker-compose ps
```

### Using Makefile Commands

```bash
make help          # Show all commands
make start         # Start all services
make logs          # View logs
make test-all      # Test all components
make status        # Show service status
make stop          # Stop all services
make clean         # Remove everything
```

### Access URLs

After deployment:
- **MCP Server:** http://localhost:3000
- **SearXNG:** http://localhost:8080
- **Crawl4AI:** http://localhost:8000
- **Redis Commander:** http://localhost:8081 (debug mode)
- **PostgreSQL:** localhost:5432

---

## Kubernetes Deployment

### Prerequisites
- Kubernetes cluster 1.27+
- kubectl configured
- 3+ nodes (recommended)
- Storage class available
- (Optional) cert-manager for TLS
- (Optional) nginx-ingress-controller

### Step 1: Build and Push Images

```bash
# Set your registry
export REGISTRY="your-registry.io"

# Build MCP Server
cd mcp-server
docker build -t $REGISTRY/mcp-search-server:latest .
docker push $REGISTRY/mcp-search-server:latest

# Build Crawl4AI Service
cd ../crawl4ai-service
docker build -t $REGISTRY/crawl4ai-service:latest .
docker push $REGISTRY/crawl4ai-service:latest
```

### Step 2: Update Image References

Edit the deployment files to use your registry:

```bash
# Update in k8s/deployments/mcp-server.yaml
sed -i 's|your-registry.io|'$REGISTRY'|g' k8s/deployments/mcp-server.yaml

# Update in k8s/deployments/crawl4ai.yaml
sed -i 's|your-registry.io|'$REGISTRY'|g' k8s/deployments/crawl4ai.yaml
```

### Step 3: Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### Step 4: Create Secrets

```bash
# Generate secrets
SEARXNG_SECRET=$(openssl rand -hex 32)
DB_PASSWORD=$(openssl rand -hex 16)

# Create secrets
kubectl create secret generic search-secrets \
  --from-literal=searxng-secret=$SEARXNG_SECRET \
  --from-literal=db-password=$DB_PASSWORD \
  -n search-infrastructure
```

### Step 5: Create ConfigMaps

```bash
# Create SearXNG ConfigMap
kubectl create configmap searxng-config \
  --from-file=settings.yml=searxng/settings.yml \
  -n search-infrastructure
```

### Step 6: Deploy Storage

```bash
kubectl apply -f k8s/storage/
```

### Step 7: Deploy Services

```bash
# Deploy Redis first
kubectl apply -f k8s/deployments/redis.yaml
kubectl apply -f k8s/services/redis.yaml

# Wait for Redis to be ready
kubectl wait --for=condition=ready pod -l app=redis -n search-infrastructure --timeout=120s

# Deploy SearXNG
kubectl apply -f k8s/deployments/searxng.yaml
kubectl apply -f k8s/services/searxng.yaml

# Deploy Crawl4AI
kubectl apply -f k8s/deployments/crawl4ai.yaml
kubectl apply -f k8s/services/crawl4ai.yaml

# Wait for all to be ready
kubectl wait --for=condition=ready pod -l app=searxng -n search-infrastructure --timeout=120s
kubectl wait --for=condition=ready pod -l app=crawl4ai -n search-infrastructure --timeout=180s

# Deploy MCP Server
kubectl apply -f k8s/deployments/mcp-server.yaml
kubectl apply -f k8s/services/mcp-server.yaml

# Deploy HPA
kubectl apply -f k8s/deployments/mcp-server-hpa.yaml
```

### Step 8: Deploy Ingress (Optional)

If you have nginx-ingress-controller:

```bash
# Update domain in ingress.yaml
sed -i 's|search.yourdomain.com|your-actual-domain.com|g' k8s/ingress/ingress.yaml

kubectl apply -f k8s/ingress/ingress.yaml
```

### Step 9: Verify Deployment

```bash
# Check all pods
kubectl get pods -n search-infrastructure

# Check services
kubectl get svc -n search-infrastructure

# Check HPA
kubectl get hpa -n search-infrastructure

# View logs
kubectl logs -f deployment/mcp-server -n search-infrastructure
```

### Using Makefile for Kubernetes

```bash
make k8s-deploy     # Deploy everything
make k8s-status     # Check status
make k8s-logs       # View logs
make k8s-scale REPLICAS=5  # Scale MCP server
make k8s-delete     # Delete everything
```

---

## MCP Client Configuration

### For Claude Desktop

Add to your Claude Desktop config file:

**Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Configuration:**

```json
{
  "mcpServers": {
    "search": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "SEARXNG_URL": "http://localhost:8080",
        "CRAWL4AI_URL": "http://localhost:8000",
        "REDIS_URL": "redis://localhost:6379"
      }
    }
  }
}
```

For Kubernetes deployment, update URLs:

```json
{
  "mcpServers": {
    "search": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "SEARXNG_URL": "http://your-k8s-ip:8080",
        "CRAWL4AI_URL": "http://your-k8s-ip:8000",
        "REDIS_URL": "redis://your-k8s-ip:6379"
      }
    }
  }
}
```

### For Custom MCP Clients

```javascript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["/path/to/mcp-server/dist/index.js"],
  env: {
    SEARXNG_URL: "http://localhost:8080",
    CRAWL4AI_URL: "http://localhost:8000",
    REDIS_URL: "redis://localhost:6379"
  }
});

const client = new Client(
  { name: "my-client", version: "1.0.0" },
  { capabilities: {} }
);

await client.connect(transport);

// Use the tools
const result = await client.callTool({
  name: "web_search",
  arguments: {
    query: "kubernetes best practices",
    engines: ["google", "duckduckgo"]
  }
});
```

---

## Verification

### Test SearXNG

```bash
curl "http://localhost:8080/search?q=test&format=json"
```

Expected: JSON response with search results

### Test Crawl4AI

```bash
curl -X POST http://localhost:8000/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

Expected: JSON response with crawled content

### Test MCP Server (if running)

```bash
# Through MCP client
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | \
  node mcp-server/dist/index.js
```

Expected: List of available tools

### Test Full Workflow

Use the MCP client to:

1. **Search:**
```javascript
await client.callTool({
  name: "web_search",
  arguments: {
    query: "best web scraping tools 2024"
  }
});
```

2. **Crawl a result:**
```javascript
await client.callTool({
  name: "web_crawl",
  arguments: {
    url: "https://url-from-search-results.com"
  }
});
```

3. **Extract content:**
```javascript
await client.callTool({
  name: "extract_content",
  arguments: {
    url: "https://url-from-search-results.com",
    content_type: "links"
  }
});
```

---

## Troubleshooting

### Docker Compose Issues

**Services won't start:**
```bash
# Check logs
docker-compose logs [service-name]

# Common fixes
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

**Port conflicts:**
```bash
# Check what's using the ports
lsof -i :8080
lsof -i :8000
lsof -i :3000

# Kill process or change ports in docker-compose.yml
```

**Out of memory:**
```bash
# Increase Docker memory limit
# Docker Desktop: Settings > Resources > Memory

# Or reduce concurrent services
docker-compose up -d redis searxng mcp-server
```

### Kubernetes Issues

**Pods not starting:**
```bash
# Describe pod for events
kubectl describe pod <pod-name> -n search-infrastructure

# Check logs
kubectl logs <pod-name> -n search-infrastructure

# Common issues:
# - Image pull errors: Check registry credentials
# - Resource limits: Adjust requests/limits
# - ConfigMap missing: Apply configmaps first
```

**Services not accessible:**
```bash
# Check service endpoints
kubectl get endpoints -n search-infrastructure

# Port forward for testing
kubectl port-forward svc/mcp-server 3000:3000 -n search-infrastructure
```

**HPA not scaling:**
```bash
# Check metrics server
kubectl top pods -n search-infrastructure

# Install metrics-server if missing
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
```

### MCP Server Issues

**Connection errors:**
- Verify service URLs are correct
- Check that all backend services are running
- Test backend services individually

**Cache not working:**
- Check Redis is running: `docker exec -it redis-cache redis-cli ping`
- Verify REDIS_URL environment variable
- Check Redis logs for errors

**Slow response:**
- Check backend service health
- Increase timeout values
- Scale up replicas
- Check cache hit rate

### Common Error Messages

**"Redis Client Error"**
- Solution: Ensure Redis is running and accessible
- Check: `docker-compose ps redis` or `kubectl get pod -l app=redis`

**"SearXNG search failed"**
- Solution: Check SearXNG logs
- Verify: Search engines aren't blocking requests
- Try: Different search engines or reduce request rate

**"Crawl4AI failed"**
- Solution: Check target website allows crawling
- Increase: Timeout values
- Verify: Playwright browsers are installed

---

## Next Steps

1. **Configure for production:**
   - Update all secrets
   - Set up SSL/TLS
   - Configure proper monitoring
   - Set up log aggregation

2. **Scale appropriately:**
   - Adjust replica counts
   - Configure HPA thresholds
   - Monitor resource usage

3. **Customize:**
   - Add/remove search engines
   - Adjust cache TTLs
   - Configure rate limiting
   - Add custom tools

4. **Monitor:**
   - Set up Prometheus metrics
   - Create Grafana dashboards
   - Configure alerts
   - Review analytics

---

## Support

For issues:
1. Check logs: `make logs` or `kubectl logs`
2. Review troubleshooting section above
3. Test components individually
4. Check the main README.md for more details

## Resources

- [SearXNG Documentation](https://docs.searxng.org/)
- [Crawl4AI GitHub](https://github.com/unclecode/crawl4ai)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
