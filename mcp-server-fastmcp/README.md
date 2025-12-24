# FastMCP Search Server

Simple MCP server using FastMCP (Python) to expose SearXNG and Crawl4AI tools.

## Features

- ✅ **Simple**: Just ~150 lines of Python code
- ✅ **FastMCP**: Handles all transport complexity (stdio, HTTP, SSE) automatically
- ✅ **Two Tools**: `web_search` and `web_crawl`
- ✅ **Redis Caching**: Optional caching support
- ✅ **No Gateway Issues**: FastMCP handles HTTP/SSE natively

## Tools

### `web_search`

Search the web using SearXNG meta-search engine.

**Parameters:**

- `query` (required): Search query string
- `engines` (optional): Comma-separated list of engines
- `max_results` (optional): Maximum number of results (default: 10)

### `web_crawl`

Crawl and extract content from a webpage using Crawl4AI.

**Parameters:**

- `url` (required): URL to crawl
- `extraction_strategy` (optional): Extraction strategy
- `screenshot` (optional): Whether to take a screenshot (default: False)

## Environment Variables

- `SEARXNG_URL`: SearXNG service URL (default: `http://searxng.search-infrastructure.svc.cluster.local:8080`)
- `CRAWL4AI_URL`: Crawl4AI service URL (default: `http://crawl4ai.search-infrastructure.svc.cluster.local:8000`)
- `REDIS_ENABLED`: Enable Redis caching (default: `false`)
- `REDIS_HOST`: Redis host (default: `redis-cluster.redis.svc.cluster.local`)
- `REDIS_PORT`: Redis port (default: `6379`)

## Deployment

### Docker

```bash
docker build -t mcp-server-fastmcp:latest .
docker run -e SEARXNG_URL=http://searxng:8080 -e CRAWL4AI_URL=http://crawl4ai:8000 mcp-server-fastmcp:latest
```

### Kubernetes

See `k8s/deployments/mcp-server-fastmcp.yaml`

## Usage

FastMCP automatically supports:

- **stdio**: For local/spawned processes
- **HTTP/SSE**: For remote access (no gateway needed!)

Just point your MCP client to the server URL and FastMCP handles the rest.
