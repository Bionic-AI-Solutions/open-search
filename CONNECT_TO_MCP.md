# How to Connect to Your MCP Server in Kubernetes

## Your Current Setup

Based on your `search-infrastructure` namespace deployment:

- **MCP Server Pod**: Running with image `docker4zerocool/mcp-search-server:latest`
- **MCP Server Path**: `/app/dist/index.js` inside the pod
- **Environment**: All variables already configured (SEARXNG_URL, CRAWL4AI_URL, REDIS_HOST, etc.)
- **Protocol**: MCP stdio (stdin/stdout)

## Connect from Cursor (or any MCP Client)

### Step 1: Get Your MCP Server Pod Name

```bash
kubectl get pods -n search-infrastructure -l app=mcp-server
```

You'll see something like: `mcp-server-d966dd445-4htp9`

### Step 2: Create Wrapper Script

Create `~/bin/mcp-server-k8s-wrapper.sh`:

```bash
#!/bin/bash
# Connect to your existing MCP server in Kubernetes

NAMESPACE="search-infrastructure"
MCP_POD=$(kubectl get pods -n "$NAMESPACE" -l app=mcp-server -o jsonpath='{.items[0].metadata.name}')

if [ -z "$MCP_POD" ]; then
  echo "Error: MCP server pod not found" >&2
  exit 1
fi

# Connect via kubectl exec - this streams stdio for MCP protocol
kubectl exec -i -n "$NAMESPACE" "$MCP_POD" -- node /app/dist/index.js
```

Make it executable:
```bash
chmod +x ~/bin/mcp-server-k8s-wrapper.sh
```

### Step 3: Configure Cursor

Edit: `~/Library/Application Support/Cursor/User/globalStorage/mcp.json` (macOS)

```json
{
  "mcpServers": {
    "open-search": {
      "command": "/Users/YOUR_USERNAME/bin/mcp-server-k8s-wrapper.sh",
      "env": {
        "KUBECONFIG": "/path/to/your/.kube/config"
      }
    }
  }
}
```

**That's it!** No need to set SEARXNG_URL, CRAWL4AI_URL, or REDIS_HOST - they're already in the pod.

### Step 4: Restart Cursor

After saving the config, restart Cursor. You should now have access to:
- `web_search`
- `web_crawl`
- `extract_content`
- `analyze_search_results`

## How It Works

```
Your Cursor Client
    ↓ (stdio)
Wrapper Script (kubectl exec -i)
    ↓ (stdio via kubectl)
MCP Server Pod (mcp-server-xxx in search-infrastructure)
    ↓ (already configured with env vars)
SearXNG / Crawl4AI / Redis
```

The wrapper script uses `kubectl exec -i` which:
1. Executes `node /app/dist/index.js` in your MCP server pod
2. Streams stdin/stdout between your client and the pod
3. This is exactly what MCP stdio protocol needs!

## Verify Connection

After restarting Cursor, try asking:
- "Search for the latest AI news"
- "Get content from https://example.com"

The AI should use the `web_search` or `web_crawl` tools automatically.

## Troubleshooting

### If connection fails:

1. **Check pod is running:**
   ```bash
   kubectl get pods -n search-infrastructure -l app=mcp-server
   ```

2. **Check kubectl access:**
   ```bash
   kubectl exec -n search-infrastructure -l app=mcp-server -- echo "test"
   ```

3. **Check MCP server logs:**
   ```bash
   kubectl logs -n search-infrastructure -l app=mcp-server --tail=50
   ```

4. **Test wrapper script manually:**
   ```bash
   ~/bin/mcp-server-k8s-wrapper.sh
   # Should start the MCP server and wait for input
   ```

## That's All!

You don't need to:
- ❌ Run another MCP server
- ❌ Set environment variables in client config
- ❌ Port-forward anything
- ❌ Install anything locally

Just connect via the wrapper script!

