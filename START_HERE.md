# 🚀 Start Here

## Welcome to OSS Search Infrastructure

This project provides a **complete replacement for commercial search APIs** (Tavily, Brave Search, Serper) using open-source infrastructure.

## ✨ What You Get

- ✅ **SearXNG**: Meta-search across 70+ engines
- ✅ **Crawl4AI**: Advanced web crawling with AI extraction
- ✅ **MCP Server**: FastMCP (Python) exposing tools to AI agents
- ✅ **Redis**: High-performance caching
- ✅ **Kubernetes Ready**: Production-ready deployment

## 🎯 Quick Start

### 1. Deploy to Kubernetes

```bash
# Deploy all services
kubectl apply -f k8s/deployments/
kubectl apply -f k8s/services/

# Check status
kubectl get pods -n search-infrastructure
```

### 2. Access MCP Server

**External**: `http://192.168.0.220:8000`  
**Internal**: `http://mcp-server-fastmcp.search-infrastructure.svc.cluster.local:8000`

**Health Check**: `curl http://192.168.0.220:8000/health`

### 3. Configure MCP Client

See [MCP Documentation](./docs/mcp/README.md) for client setup.

## 📚 Documentation

- **[Main README](./README.md)** - Complete project overview
- **[MCP Server Docs](./docs/mcp/README.md)** - MCP server documentation
- **[Deployment Docs](./docs/deployment/README.md)** - Deployment guides
- **[Cleanup Summary](./CLEANUP_SUMMARY.md)** - Recent cleanup and organization

## 🛠️ Available Tools

1. **web_search** - Search the web using SearXNG
2. **web_crawl** - Crawl webpages using Crawl4AI
3. **extract_content** - Extract specific content
4. **analyze_search_results** - Analyze search results

See [Service Capabilities](./docs/mcp/SERVICE_CAPABILITIES.md) for details.

## 🏗️ Architecture

```
MCP Client → FastMCP Server (Python) → SearXNG / Crawl4AI
                                      → Redis (optional cache)
```

**Simple, clean, and production-ready!**

## ✅ Current Status

- **MCP Server**: ✅ Running (FastMCP, 3/3 pods)
- **SearXNG**: ✅ Running
- **Crawl4AI**: ✅ Running
- **Redis**: ✅ Running

## 🆘 Need Help?

1. Check [Troubleshooting](./README.md#troubleshooting) in main README
2. Review [MCP Documentation](./docs/mcp/README.md)
3. Check service logs: `kubectl logs -n search-infrastructure -l app=mcp-server-fastmcp`

---

**Ready to use!** 🎉
