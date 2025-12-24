# Deployment Documentation

## Kubernetes Deployment

- **[Kubernetes Guide](./KUBERNETES.md)** - Complete Kubernetes deployment guide
- **[Quick Start](./QUICK_START.md)** - Quick deployment steps

## Current Deployments

### Active Services
- **SearXNG**: Meta-search engine
- **Crawl4AI**: Web crawler
- **MCP Server (FastMCP)**: MCP server exposing tools
- **Redis**: Caching layer

### Namespace
- **Namespace**: `search-infrastructure`

### Services
```bash
kubectl get svc -n search-infrastructure
```

### Deployments
```bash
kubectl get deployments -n search-infrastructure
```

## Quick Commands

```bash
# Deploy all services
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/services/

# Check status
kubectl get pods -n search-infrastructure
kubectl get svc -n search-infrastructure

# View logs
kubectl logs -f -n search-infrastructure deployment/mcp-server-fastmcp
```

