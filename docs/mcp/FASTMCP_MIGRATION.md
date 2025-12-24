# FastMCP Migration Guide

## Why FastMCP?

The current TypeScript MCP server has become overly complex:
- Complex HTTP/SSE transport handling
- Gateway compatibility issues
- TypeScript build complexity
- Multiple transport modes to maintain

**FastMCP simplifies everything:**
- ✅ ~150 lines of Python code vs 400+ lines of TypeScript
- ✅ Automatic transport handling (stdio, HTTP, SSE)
- ✅ No gateway compatibility issues
- ✅ Simple deployment
- ✅ Easy to maintain and extend

## Architecture Comparison

### Before (TypeScript)
```
Client → Gateway → HTTP Bridge → MCP Server (TypeScript) → SearXNG/Crawl4AI
         (issues)   (complex)      (400+ lines)
```

### After (FastMCP)
```
Client → MCP Server (FastMCP Python) → SearXNG/Crawl4AI
         (simple, ~150 lines)
```

## Migration Steps

### 1. Build and Push Docker Image

```bash
cd mcp-server-fastmcp
docker build -t docker4zerocool/mcp-server-fastmcp:latest .
docker push docker4zerocool/mcp-server-fastmcp:latest
```

### 2. Deploy to Kubernetes

```bash
kubectl apply -f k8s/deployments/mcp-server-fastmcp.yaml
kubectl apply -f k8s/services/mcp-server-fastmcp.yaml
```

### 3. Update Gateway Configuration

Point the IBM Gateway to the new FastMCP server:
- URL: `http://mcp-server-fastmcp.search-infrastructure.svc.cluster.local:8000`
- Transport: `HTTP` or `SSE` (FastMCP handles both automatically)

### 4. Test

```bash
# Health check
curl http://mcp-server-fastmcp.search-infrastructure.svc.cluster.local:8000/health

# Test search tool
# (via MCP client or gateway)
```

### 5. Remove Old Server (Optional)

Once verified working:
```bash
kubectl delete deployment mcp-server -n search-infrastructure
kubectl delete service mcp-server -n search-infrastructure
```

## Benefits

1. **Simplicity**: 70% less code
2. **Reliability**: FastMCP handles transport automatically
3. **Maintainability**: Python is easier to modify
4. **No Gateway Issues**: FastMCP works with any MCP client
5. **Same Functionality**: All tools work the same

## Tools Available

- `web_search`: Search using SearXNG
- `web_crawl`: Crawl using Crawl4AI

Both tools support Redis caching (optional).

## Next Steps

1. Test the FastMCP server
2. Update client configurations
3. Monitor for any issues
4. Remove old TypeScript server once stable

