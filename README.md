# OSS Search Infrastructure with MCP Integration

Complete open-source search infrastructure to replace commercial APIs (Tavily, Brave Search, Serper) with deployment on Kubernetes/Docker and MCP server integration.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Component Details](#component-details)
- [MCP Server](#mcp-server)
- [Deployment](#deployment)
- [Configuration](#configuration)
- [Documentation](#documentation)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

This project provides a production-ready, self-hosted search infrastructure with:

- **SearXNG**: Meta-search engine aggregating results from 70+ search engines
- **Crawl4AI**: Advanced web crawling with AI-powered content extraction
- **Redis**: High-performance caching layer
- **MCP Server**: FastMCP (Python) server exposing search and crawl tools to AI agents
- **PostgreSQL**: Optional analytics database

### Key Benefits

✅ **Privacy**: No tracking, complete data control  
✅ **Cost-effective**: Unlimited searches vs. per-query API pricing  
✅ **Customizable**: Full control over search engines and extraction strategies  
✅ **Scalable**: Kubernetes-ready with auto-scaling support  
✅ **AI-Native**: MCP integration for seamless AI agent access  

## 🏗️ Architecture

```
Client Apps → FastMCP Server (Python) → SearXNG / Crawl4AI → External Search Engines
                                      → Redis Cache (optional)
```

**Simple, clean, and production-ready!**

## 📦 Prerequisites

### Required
- Docker 24.0+
- Docker Compose 2.20+ OR Kubernetes 1.27+
- 4GB RAM minimum (8GB recommended)
- 20GB disk space

### Optional
- kubectl (for Kubernetes deployment)
- Node.js 20+ (for local MCP development)
- Python 3.11+ (for Crawl4AI development)

## 🚀 Quick Start

### Option 1: Automated Setup (Recommended)

```bash
# Clone or download the project files
cd oss-search-infrastructure

# Make setup script executable
chmod +x setup.sh

# Run setup
./setup.sh
```

The script will:
1. Check prerequisites
2. Create directory structure
3. Generate secure secrets
4. Build Docker images
5. Start all services
6. Display access information

### Option 2: Manual Setup

```bash
# 1. Create necessary files (if not already present)
mkdir -p searxng crawl4ai-service mcp-server nginx postgres

# 2. Set environment variables
cp .env.example .env
# Edit .env with your values

# 3. Build and start services
docker-compose build
docker-compose up -d

# 4. Check service health
docker-compose ps
docker-compose logs -f
```

### Verification

Once services are running, test each component:

```bash
# Test SearXNG
curl "http://localhost:8080/search?q=test&format=json"

# Test Crawl4AI
curl -X POST http://localhost:8000/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Test Redis
docker exec -it redis-cache redis-cli ping

# Test MCP Server
curl http://localhost:8000/health
```

## 🔧 Component Details

### SearXNG (Port 8080)

Meta-search engine that queries multiple search engines and aggregates results.

**Features:**
- 70+ supported search engines
- JSON API for programmatic access
- Privacy-focused (no tracking)
- Customizable ranking

**Configuration:** `searxng/settings.yml`

### Crawl4AI (Port 8000)

Advanced web crawler with AI-powered content extraction.

**Features:**
- JavaScript rendering via Playwright
- Multiple extraction strategies (auto, LLM, cosine)
- Screenshot capture
- Media extraction
- Caching support

**API Endpoints:**
- `POST /crawl` - Single URL crawl
- `POST /crawl/batch` - Batch crawling
- `GET /result/{job_id}` - Retrieve results
- `GET /health` - Health check

### MCP Server (Port 8000)

FastMCP (Python) server exposing search infrastructure to AI agents via Model Context Protocol.

**Tools:**
- `web_search` - Search the web using SearXNG
- `web_crawl` - Deep crawl URLs using Crawl4AI
- `extract_content` - Extract specific content from pages
- `analyze_search_results` - Analyze and rank search results

**See**: [MCP Documentation](./docs/mcp/README.md) for details.

### Redis (Port 6379)

In-memory cache for search results and crawled content.

**Configuration:**
- Search cache TTL: 1 hour (configurable)
- Crawl cache TTL: 24 hours (configurable)
- Max memory: 512MB (configurable)
- Eviction policy: allkeys-lru

## 🤖 MCP Server

### Quick Start

The MCP server is deployed and running. See [MCP Documentation](./docs/mcp/README.md) for:
- Quick start guide
- Client configuration
- Gateway setup
- Tool documentation

### Configure MCP Client

For Cursor/Claude Desktop or other MCP clients:

```json
{
  "mcpServers": {
    "oss-search": {
      "transport": "sse",
      "url": "http://192.168.0.220:8000/sse"
    }
  }
}
```

**For Kubernetes (internal):**
```json
{
  "mcpServers": {
    "oss-search": {
      "transport": "sse",
      "url": "http://mcp-server-fastmcp.search-infrastructure.svc.cluster.local:8000/sse"
    }
  }
}
```

### Using the Tools

Once configured, AI agents can use the search tools:

**Example: Web Search**
```
User: "Search for recent AI developments"
Agent: [Calls web_search tool]
       {
         "query": "recent AI developments 2024",
         "engines": ["google", "duckduckgo"],
         "language": "en"
       }
```

**Example: Web Crawl**
```
User: "Get the full content from this article: https://example.com/article"
Agent: [Calls web_crawl tool]
       {
         "url": "https://example.com/article",
         "extraction_strategy": "llm",
         "screenshot": false
       }
```

## 🚢 Deployment Options

### Docker Compose (Development/Small Scale)

Already configured! Just run:

```bash
docker-compose up -d
```

**Pros:**
- Simple setup
- Low resource overhead
- Easy debugging

**Cons:**
- Single host limitation
- No built-in auto-scaling
- Manual high availability

### Kubernetes (Production)

Comprehensive Kubernetes manifests are provided in the `k8s/` directory.

**Deploy to Kubernetes:**

```bash
# Create namespace
kubectl apply -f k8s/namespace.yaml

# Create secrets
kubectl create secret generic search-secrets \
  --from-literal=searxng-secret=$(openssl rand -hex 32) \
  --from-literal=db-password=$(openssl rand -hex 16) \
  -n search-infrastructure

# Deploy services
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/services/
kubectl apply -f k8s/ingress/

# Check status
kubectl get pods -n search-infrastructure
kubectl get svc -n search-infrastructure
```

**Pros:**
- Auto-scaling
- Self-healing
- Load balancing
- Multi-host deployment

**Monitoring:**

```bash
# View logs
kubectl logs -f -n search-infrastructure deployment/mcp-server-fastmcp

# Scale deployment
kubectl scale deployment mcp-server-fastmcp --replicas=5 -n search-infrastructure

# View resource usage
kubectl top pods -n search-infrastructure
```

## ⚙️ Configuration

### Environment Variables

Key environment variables in `.env`:

```bash
# SearXNG
SEARXNG_SECRET=your-secret-key-here

# Database
DB_PASSWORD=your-db-password

# Cache TTLs (seconds)
CACHE_TTL_SEARCH=3600      # 1 hour
CACHE_TTL_CRAWL=86400      # 24 hours

# MCP Server
NODE_ENV=production
LOG_LEVEL=info
```

### SearXNG Engines

Enable/disable search engines in `searxng/settings.yml`:

```yaml
engines:
  - name: google
    engine: google
    shortcut: go
    # disabled: false
    
  - name: brave
    engine: brave
    shortcut: br
    # disabled: false
```

### Rate Limiting

Configure in `searxng/limiter.toml`:

```toml
[botdetection.ip_limit.link_token]
suspicious_ip_window = 60
suspicious_ip_max = 3
```

## 📊 API Usage

### SearXNG API

**Basic Search:**
```bash
curl "http://localhost:8080/search?q=kubernetes&format=json"
```

**Advanced Search:**
```bash
curl "http://localhost:8080/search" \
  -G \
  --data-urlencode "q=machine learning" \
  --data-urlencode "engines=google,duckduckgo" \
  --data-urlencode "categories=general" \
  --data-urlencode "language=en" \
  --data-urlencode "format=json"
```

### Crawl4AI API

**Simple Crawl:**
```bash
curl -X POST http://localhost:8000/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "extraction_strategy": "auto"
  }'
```

**Advanced Crawl:**
```bash
curl -X POST http://localhost:8000/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "extraction_strategy": "llm",
    "chunking_strategy": "markdown",
    "screenshot": true,
    "wait_for": "css:.main-content",
    "timeout": 30
  }'
```

**Batch Crawl:**
```bash
curl -X POST http://localhost:8000/crawl/batch \
  -H "Content-Type: application/json" \
  -d '{
    "urls": [
      "https://example1.com",
      "https://example2.com"
    ],
    "extraction_strategy": "auto"
  }'
```

## 📈 Monitoring

### Logs

**View all logs:**
```bash
docker-compose logs -f
```

**View specific service:**
```bash
docker-compose logs -f mcp-server
docker-compose logs -f searxng
docker-compose logs -f crawl4ai
```

### Metrics

Connect to Redis Commander (debug mode):
```bash
docker-compose --profile debug up -d redis-commander
# Access at http://localhost:8081
```

### PostgreSQL Analytics

Connect to PostgreSQL and run analytics queries:

```bash
docker exec -it search-analytics psql -U searchuser -d search_analytics
```

```sql
-- View search statistics
SELECT * FROM search_stats LIMIT 10;

-- View popular queries
SELECT * FROM popular_queries LIMIT 20;

-- View crawl job status
SELECT status, COUNT(*) 
FROM crawl_jobs 
GROUP BY status;
```

## 🔍 Troubleshooting

### Service Won't Start

**Check logs:**
```bash
docker-compose logs [service-name]
```

**Common issues:**
- Port conflicts: Change ports in `docker-compose.yml`
- Memory limits: Increase Docker memory allocation
- Missing files: Ensure all configuration files are present

### SearXNG Returns No Results

**Possible causes:**
1. Search engines are blocking requests
2. Rate limits exceeded
3. Network connectivity issues

**Solutions:**
```bash
# Check SearXNG logs
docker-compose logs searxng

# Test search engines individually
curl "http://localhost:8080/search?q=test&engines=duckduckgo&format=json"

# Restart SearXNG
docker-compose restart searxng
```

### Crawl4AI Timeouts

**Increase timeout:**
```bash
# In crawl request
{
  "url": "https://example.com",
  "timeout": 60  # Increase from default 30
}
```

**Check browser installation:**
```bash
docker exec -it crawl4ai-service playwright install chromium
```

### Redis Connection Errors

**Check Redis status:**
```bash
docker exec -it redis-cache redis-cli ping
# Should return: PONG
```

**Clear cache:**
```bash
docker exec -it redis-cache redis-cli FLUSHALL
```

### High Memory Usage

**Check container stats:**
```bash
docker stats
```

**Solutions:**
- Reduce cache TTLs
- Limit concurrent crawls
- Scale horizontally instead of vertically

## 📚 Additional Resources

### Documentation Files

- `oss-search-architecture.md` - Complete architecture documentation
- `docker-compose.yml` - Docker Compose configuration
- `k8s/` - Kubernetes manifests
- `mcp-server-fastmcp/` - FastMCP server (Python) - **Active**
- `docs/mcp/` - MCP server documentation
- `crawl4ai-service/` - Crawl4AI service wrapper

### External Links

- [SearXNG Documentation](https://docs.searxng.org/)
- [Crawl4AI GitHub](https://github.com/unclecode/crawl4ai)
- [MCP Documentation](https://modelcontextprotocol.io/)
- [Redis Documentation](https://redis.io/docs/)

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is open source and available under the MIT License.

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section
2. Review logs: `docker-compose logs`
3. Open an issue on GitHub

## 🎉 Acknowledgments

- SearXNG team for the excellent meta-search engine
- Crawl4AI for the powerful web crawling library
- Anthropic for the MCP specification
- Open source community

---

**Built with ❤️ for the open-source community**
