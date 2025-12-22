# MCP Server Quick Start - Kubernetes Deployment

## 🎯 Simple Answer

**You already have an MCP server running in Kubernetes!** You just need to connect your MCP client (like Cursor) to it.

## ✅ What You Have

- ✅ MCP server running in Kubernetes (`search-infrastructure` namespace)
- ✅ All 3 search tools available: `web_search`, `web_crawl`, `extract_content`
- ✅ All environment variables already configured (SEARXNG_URL, CRAWL4AI_URL, REDIS_HOST, etc.)

## 🔌 What You Need to Do

**Just connect your client to the existing MCP server!**

### For Cursor (Running Locally)

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

That's it! The wrapper script uses `kubectl exec` to connect your client's stdio to the existing MCP server pod.

## 🤔 Common Questions

### Q: Why do I need a wrapper script?

**A:** MCP uses stdio (stdin/stdout) protocol, not HTTP. The wrapper script uses `kubectl exec -i` to stream stdio from your local machine to the MCP server pod in Kubernetes.

### Q: Do I need to set SEARXNG_URL, CRAWL4AI_URL, REDIS_HOST in the client config?

**A:** No! These are already configured in your Kubernetes deployment. The MCP server pod already knows where to find SearXNG, Crawl4AI, and Redis. You only need to connect to the pod.

### Q: Do I need to run another MCP server?

**A:** No! Your MCP server is already running in Kubernetes. The wrapper script just connects to it.

### Q: Can I use SSE instead of stdio?

**A:** The current MCP server implementation uses stdio transport. If you need SSE/HTTP, you would need to add an HTTP gateway service, but stdio via kubectl exec works perfectly for this use case.

## 🔍 How It Works

```
Your Cursor Client
    ↓ (stdio)
Wrapper Script (kubectl exec -i)
    ↓ (stdio via kubectl)
MCP Server Pod (already running)
    ↓ (HTTP)
SearXNG / Crawl4AI / Redis (already configured)
```

The wrapper script is just a bridge that pipes stdio through kubectl to your existing MCP server pod.

## ✅ Verify It's Working

After restarting Cursor, you should see the MCP tools available:
- `web_search`
- `web_crawl` 
- `extract_content`
- `analyze_search_results`

Try asking Cursor: "Search for the latest AI news" and it should use the `web_search` tool!

