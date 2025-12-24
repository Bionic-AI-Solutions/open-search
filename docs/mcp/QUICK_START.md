# MCP Server Quick Start - Kubernetes Deployment

## 🎯 Simple Answer

**You already have an MCP server running in Kubernetes!** You just need to connect your MCP client (like Cursor) to it.

## ✅ What You Have

- ✅ MCP server running in Kubernetes (`search-infrastructure` namespace)
- ✅ All 3 search tools available: `web_search`, `web_crawl`, `extract_content`
- ✅ All environment variables already configured (SEARXNG_URL, CRAWL4AI_URL, REDIS_HOST, etc.)

## 🔌 What You Need to Do

**Connect your client to the existing MCP server!** You have two options:

### Option 1: HTTP/SSE Transport (Recommended - No Bridge Needed!)

The MCP server now supports **native HTTP/SSE transport**, so you can connect directly via HTTP without any bridge service.

1. **Get the MCP server URL:**

   ```bash
   # Get LoadBalancer IP
   kubectl get svc -n search-infrastructure mcp-server

   # Or use internal service URL
   # http://mcp-server.search-infrastructure.svc.cluster.local:3000/mcp
   ```

2. **Configure Cursor** (`~/Library/Application Support/Cursor/User/globalStorage/mcp.json` on macOS):

   ```json
   {
     "mcpServers": {
       "open-search": {
         "transport": "http",
         "url": "http://<loadbalancer-ip>:3000/mcp"
       }
     }
   }
   ```

   Or if you have Ingress configured:

   ```json
   {
     "mcpServers": {
       "open-search": {
         "transport": "http",
         "url": "https://mcp.yourdomain.com/mcp"
       }
     }
   }
   ```

3. **Restart Cursor**

**That's it!** No wrapper script needed - direct HTTP connection.

### Option 2: Stdio Transport (Legacy - For Local Access)

If you prefer stdio transport (for local development):

1. **Copy the wrapper script:**

   ```bash
   cp mcp-server-k8s-wrapper.sh ~/bin/mcp-server-k8s-wrapper.sh
   chmod +x ~/bin/mcp-server-k8s-wrapper.sh
   ```

2. **Configure Cursor** (`~/Library/Application Support/Cursor/User/globalStorage/mcp.json` on macOS):

   ```json
   {
     "mcpServers": {
       "open-search": {
         "command": "~/bin/mcp-server-k8s-wrapper.sh",
         "env": {
           "KUBECONFIG": "/path/to/your/kubeconfig",
           "MCP_NAMESPACE": "search-infrastructure"
         }
       }
     }
   }
   ```

3. **Restart Cursor**

The wrapper script uses `kubectl exec` to connect your client's stdio to the existing MCP server pod.

## 🤔 Common Questions

### Q: Which transport should I use?

**A:**

- **HTTP/SSE (Recommended)**: Use for remote access, production, and when you want direct HTTP connections. No bridge service needed!
- **Stdio (Legacy)**: Use for local development or when you need process-based communication.

### Q: Do I need a wrapper script or bridge service?

**A:** Not anymore! The MCP server now supports native HTTP/SSE transport. You can connect directly via HTTP without any bridge service or wrapper script.

### Q: Do I need to set SEARXNG_URL, CRAWL4AI_URL, REDIS_HOST in the client config?

**A:** No! These are already configured in your Kubernetes deployment. The MCP server pod already knows where to find SearXNG, Crawl4AI, and Redis. You only need to connect to the pod.

### Q: How can I access the MCP server remotely?

**A:** Simply use the HTTP transport option! The server exposes HTTP endpoints that work from anywhere:

- Via LoadBalancer IP
- Via Ingress (with domain name)
- Via VPN (using internal service URL)

See `MCP_HTTP_NATIVE_SUPPORT.md` for complete HTTP/SSE setup guide.

## 🔍 How It Works

### HTTP/SSE Transport (Recommended)

```
Your Cursor Client
    ↓ (HTTP/SSE)
MCP Server Pod (already running)
    ↓ (HTTP)
SearXNG / Crawl4AI / Redis (already configured)
```

Direct HTTP connection - no bridge needed!

### Stdio Transport (Legacy)

```
Your Cursor Client
    ↓ (stdio)
Wrapper Script (kubectl exec -i)
    ↓ (stdio via kubectl)
MCP Server Pod (already running)
    ↓ (HTTP)
SearXNG / Crawl4AI / Redis (already configured)
```

The wrapper script pipes stdio through kubectl to your existing MCP server pod.

## ✅ Verify It's Working

After restarting Cursor, you should see the MCP tools available:

- `web_search`
- `web_crawl`
- `extract_content`
- `analyze_search_results`

Try asking Cursor: "Search for the latest AI news" and it should use the `web_search` tool!

## 🌐 Remote Access

**Native HTTP/SSE support means remote access is now simple!**

- **`MCP_HTTP_NATIVE_SUPPORT.md`** - Complete guide for HTTP/SSE transport (recommended)
- **`MCP_REMOTE_ACCESS.md`** - Legacy guide (for stdio transport methods)

For remote clients, simply use the HTTP transport option with the LoadBalancer IP or Ingress URL. No bridge service needed!
