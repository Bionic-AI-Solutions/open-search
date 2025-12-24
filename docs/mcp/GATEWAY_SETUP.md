# IBM MCP Gateway Setup

## Overview

The IBM MCP Gateway at `mcp.bionicaisolutions.com` provides enterprise-grade access to the MCP server with security, rate limiting, and observability.

## Quick Setup

### Step 1: Access Gateway Admin UI

1. Navigate to: `https://mcp.bionicaisolutions.com/admin/login`
2. Log in with your admin credentials

### Step 2: Register MCP Server

1. Go to **Servers** → **Add Server**
2. **Name**: `oss-search-tools`
3. **Transport**: `SSE` (recommended) or `HTTP`
4. **URL**: 
   - **Internal**: `http://mcp-server-fastmcp.search-infrastructure.svc.cluster.local:8000/sse`
   - **External**: `http://192.168.0.220:8000/sse`
5. Click **Save**

### Step 3: Test Connection

1. In Gateway Admin UI, go to **Servers** → Select your server
2. Click **Test Connection**
3. Should show "Connected" ✅

### Step 4: Configure Remote Clients

**For Cursor/Claude Desktop:**

```json
{
  "mcpServers": {
    "oss-search": {
      "transport": "sse",
      "url": "https://mcp.bionicaisolutions.com/mcp/oss-search-tools",
      "headers": {
        "Authorization": "Bearer YOUR_API_TOKEN"
      }
    }
  }
}
```

## Benefits

- ✅ **Security**: JWT authentication, API keys
- ✅ **Rate Limiting**: Protect backend services
- ✅ **Observability**: Monitor usage and performance
- ✅ **Federation**: Multiple MCP servers in one gateway
- ✅ **Production Ready**: Enterprise-grade solution

## Troubleshooting

If connection fails:
1. Verify the MCP server is running: `kubectl get pods -n search-infrastructure -l app=mcp-server-fastmcp`
2. Check service endpoints: `kubectl get endpoints -n search-infrastructure mcp-server-fastmcp`
3. Test health endpoint: `curl http://192.168.0.220:8000/health`
4. Check gateway logs: `kubectl logs -n mcp-gateway -l app=mcp-context-forge --tail=50`

