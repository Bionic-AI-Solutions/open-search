# IBM MCP Gateway Quick Start

## ✅ You're All Set!

You have an **IBM MCP Gateway** at `mcp.bionicaisolutions.com` - this is the perfect solution for remote MCP access!

## 🚀 Quick Setup (5 Minutes)

### Step 1: Access Gateway Admin UI

1. Go to: `https://mcp.bionicaisolutions.com/admin/login`
2. Log in with your admin credentials

### Step 2: Deploy HTTP Bridge Service (Required)

**Important:** IBM MCP Gateway only supports **HTTP** and **SSE** transports (not stdio). You need a bridge service to translate HTTP ↔ stdio.

1. **Deploy bridge service:**
   ```bash
   kubectl apply -f k8s/rbac/mcp-bridge-rbac.yaml
   kubectl apply -f k8s/deployments/mcp-bridge-service.yaml
   kubectl apply -f k8s/services/mcp-bridge-service.yaml
   ```

2. **Get bridge service URL:**
   ```bash
   # If gateway is in the same cluster:
   # Use: http://mcp-bridge-service.search-infrastructure.svc.cluster.local:80
   
   # If gateway is outside cluster, get LoadBalancer IP:
   kubectl get svc -n search-infrastructure mcp-bridge-service
   # Use the EXTERNAL-IP from the output
   ```

### Step 3: Register MCP Server in Gateway

1. **Access Gateway Admin UI:**
   - Go to: `https://mcp.bionicaisolutions.com/admin/login`

2. **Add Server:**
   - Go to **Servers** → **Add Server**
   - **Name:** `open-search-mcp-server`
   - **Transport:** `HTTP` or `SSE` (SSE recommended for better streaming)
   - **URL:** 
     - **If gateway is in cluster:** `http://mcp-bridge-service.search-infrastructure.svc.cluster.local:80`
     - **If gateway is outside cluster:** `http://<EXTERNAL-IP>:80` (from step 2)
   - **Authentication:** Configure as needed (API key, JWT, etc.)

### Step 4: Test Connection

In Gateway Admin UI:
- Go to **Servers** → Select your server
- Click **Test Connection**
- Should show "Connected" ✅

### Step 5: Configure Remote Client

**For Cursor/Claude Desktop:**

Edit MCP config file:
- **macOS:** `~/Library/Application Support/Cursor/User/globalStorage/mcp.json`
- **Linux:** `~/.config/Cursor/User/globalStorage/mcp.json`
- **Windows:** `%APPDATA%\Cursor\User\globalStorage\mcp.json`

```json
{
  "mcpServers": {
    "open-search": {
      "transport": "http",
      "url": "https://mcp.bionicaisolutions.com/mcp/open-search-mcp-server",
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN"
      }
    }
  }
}
```

**Restart Cursor/Claude Desktop**

## ✅ Verify It's Working

After restarting, you should see these tools available:
- `web_search`
- `web_crawl`
- `extract_content`
- `analyze_search_results`

Try: "Search for the latest AI news" and it should work!

## 🔐 Security Setup

### Enable Authentication

1. In Gateway Admin UI → **Security** → **Authentication**
2. Choose method:
   - **JWT** (recommended for production)
   - **API Keys** (simple for testing)
   - **OAuth 2.0** (for user authentication)

### Configure Rate Limiting

1. In Gateway Admin UI → **Security** → **Rate Limiting**
2. Set appropriate limits:
   - Requests per minute: `60`
   - Burst: `10`

## 🐛 Troubleshooting

### Gateway Can't Connect

**Check bridge service:**
```bash
kubectl get pods -n search-infrastructure -l app=mcp-bridge-service
kubectl logs -n search-infrastructure -l app=mcp-bridge-service
```

**Check MCP server:**
```bash
kubectl get pods -n search-infrastructure -l app=mcp-server
kubectl logs -n search-infrastructure -l app=mcp-server
```

### Authentication Issues

- Verify token is valid and not expired
- Check API key is correctly configured
- Review gateway logs in admin UI

## 📚 More Information

- **Full Setup Guide:** `MCP_IBM_GATEWAY_SETUP.md`
- **Remote Access Options:** `MCP_REMOTE_ACCESS.md`
- **Local Access:** `MCP_QUICK_START.md`

---

**That's it!** Your IBM MCP Gateway is now configured for remote access. 🎉

