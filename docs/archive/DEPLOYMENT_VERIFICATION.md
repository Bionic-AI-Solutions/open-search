# Deployment Verification Guide

## Quick Deployment

To completely recreate the `search-infrastructure` namespace from scratch:

```bash
cd /workspace/k8s
bash deploy.sh
```

This script will:
1. Create the namespace
2. Set up RBAC for cross-namespace secret access
3. Create all required secrets
4. Create ConfigMaps
5. Deploy all services
6. Deploy all deployments
7. Create HPA and Ingress
8. Wait for all pods to be ready

## Manifest Structure

```
k8s/
├── namespace.yaml                    # Namespace definition
├── deploy.sh                         # Complete deployment script
├── configmaps/
│   ├── app-config.yaml              # Application configuration
│   ├── searxng-config.yaml          # SearXNG settings
│   └── searxng-limiter.yaml         # Rate limiting config
├── deployments/
│   ├── searxng.yaml                 # SearXNG deployment (3 replicas)
│   ├── crawl4ai.yaml                # Crawl4AI deployment (2 replicas)
│   ├── mcp-server-fastmcp.yaml      # MCP Server deployment (3 replicas)
│   └── mcp-server-fastmcp-hpa.yaml  # Horizontal Pod Autoscaler
├── services/
│   ├── searxng.yaml                 # SearXNG ClusterIP service
│   ├── crawl4ai.yaml                # Crawl4AI ClusterIP service
│   ├── mcp-server-fastmcp.yaml      # MCP Server LoadBalancer service
│   └── redis-10515-service.yaml     # Redis service reference
├── ingress/
│   └── ingress.yaml                 # Ingress for external access
├── secrets/
│   ├── docker-registry-secret.yaml  # Docker Hub credentials
│   ├── searxng-secret.yaml          # SearXNG secret (auto-generated)
│   ├── redb-mcp-database.yaml       # Redis database secret
│   └── pg-ceph-app.yaml             # PostgreSQL secret (optional)
└── rbac/
    └── secret-reader-rbac.yaml      # RBAC for cross-namespace secrets
```

## Services Deployed

1. **SearXNG** (3 replicas)
   - Meta-search engine aggregating 70+ search engines
   - Service: `searxng:8080` (ClusterIP)
   - Health: `/healthz`

2. **Crawl4AI** (2 replicas)
   - Web crawling and content extraction service
   - Service: `crawl4ai:8000` (ClusterIP)
   - Health: `/health`

3. **MCP Server FastMCP** (3 replicas)
   - Python-based MCP server exposing search and crawl tools
   - Service: `mcp-server-fastmcp:8000` (LoadBalancer)
   - External IP: `192.168.0.215:8000`
   - Health: `/health`
   - Tools: `web_search`, `web_crawl`, `extract_content`, `analyze_search_results`

## Verification Commands

### Check Pod Status
```bash
kubectl get pods -n search-infrastructure
```

### Check Services
```bash
kubectl get svc -n search-infrastructure
```

### Check Deployments
```bash
kubectl get deployments -n search-infrastructure
```

### Test MCP Tools
```bash
# Get MCP server pod
POD_NAME=$(kubectl get pods -n search-infrastructure -l app=mcp-server-fastmcp -o jsonpath='{.items[0].metadata.name}')

# Test web_search
kubectl exec -n search-infrastructure $POD_NAME -- python -c "
import asyncio
from fastmcp import Client
import json

async def test():
    async with Client('http://localhost:8000/sse') as client:
        result = await client.call_tool('web_search', {
            'query': 'test query',
            'max_results': 5
        })
        print(json.loads(result.content[0].text))

asyncio.run(test())
"
```

## Scorched Earth Test

To verify all manifests are correct, run a scorched earth test:

```bash
# Delete namespace
kubectl delete namespace search-infrastructure

# Wait for deletion
kubectl wait --for=delete namespace/search-infrastructure --timeout=60s

# Redeploy
cd /workspace/k8s
bash deploy.sh

# Verify all pods are ready
kubectl wait --for=condition=ready pod -l app=searxng -n search-infrastructure --timeout=180s
kubectl wait --for=condition=ready pod -l app=crawl4ai -n search-infrastructure --timeout=180s
kubectl wait --for=condition=ready pod -l app=mcp-server-fastmcp -n search-infrastructure --timeout=180s

# Test all tools
# (Use test script above)
```

## Dependencies

### External Services Required
- **Redis**: OSS Redis Cluster at `redis-cluster.redis.svc.cluster.local:6379`
  - Or Redis Enterprise at `10.43.242.40:10515` (requires secret)

### Docker Images
- `searxng/searxng:latest` - SearXNG meta-search engine
- `docker4zerocool/crawl4ai-service:latest` - Crawl4AI service
- `docker4zerocool/mcp-server-fastmcp:latest` - MCP Server

All images require `docker-registry-secret` for pulling from Docker Hub.

## Troubleshooting

### Pods Not Starting
1. Check image pull secrets: `kubectl get secrets -n search-infrastructure`
2. Check pod logs: `kubectl logs <pod-name> -n search-infrastructure`
3. Check events: `kubectl get events -n search-infrastructure --sort-by='.lastTimestamp'`

### Services Not Accessible
1. Check service endpoints: `kubectl get endpoints -n search-infrastructure`
2. Check service selectors match pod labels
3. Verify network policies (if any)

### MCP Tools Not Working
1. Check MCP server logs: `kubectl logs -l app=mcp-server-fastmcp -n search-infrastructure`
2. Verify backend services are accessible:
   - `kubectl exec -n search-infrastructure <mcp-pod> -- curl http://searxng:8080/healthz`
   - `kubectl exec -n search-infrastructure <mcp-pod> -- curl http://crawl4ai:8000/health`
3. Check Redis connection (if enabled)

## Last Verified

**Date**: 2024-12-24  
**Status**: ✅ All tests passed  
**Scorched Earth Test**: ✅ Passed  
**All Tools**: ✅ Working

