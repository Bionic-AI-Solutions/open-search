# MCP Server Native HTTP/SSE Support

## Overview

The MCP server now supports **native HTTP/SSE transport** in addition to stdio transport. This eliminates the need for bridge services and enables direct remote access via standard HTTP/HTTPS protocols.

## ✅ What Changed

### Before (stdio-only)
- Required bridge service to translate HTTP → stdio
- Needed kubectl exec for remote access
- Complex setup with multiple components

### After (HTTP/SSE native)
- Direct HTTP/SSE access - no bridge needed
- Standard HTTP endpoints for remote clients
- Simplified architecture

## 🏗️ Architecture

```
Remote MCP Client
    ↓ HTTP/SSE
MCP Server (Kubernetes)
    ↓ HTTP
SearXNG / Crawl4AI / Redis
```

**No bridge service needed!**

## 🚀 Usage

### Transport Modes

The server supports three transport modes (controlled by `MCP_TRANSPORT` environment variable):

1. **`stdio`** - Standard input/output (for local/spawned processes)
2. **`http`** - HTTP/SSE transport (for remote access)
3. **`auto`** - Automatically selects based on environment:
   - Uses `stdio` if `PORT` is not set
   - Uses `http` if `PORT` is set

### Kubernetes Deployment

The Kubernetes deployment is configured to use HTTP transport by default:

```yaml
env:
  - name: MCP_TRANSPORT
    value: "http"
  - name: PORT
    value: "3000"
```

### Endpoints

#### Health Check
```
GET /health
```

Returns:
```json
{
  "status": "healthy",
  "service": "mcp-search-server",
  "transport": "http",
  "tools": ["web_search", "web_crawl", "extract_content", "analyze_search_results"]
}
```

#### Readiness Check
```
GET /ready
```

Returns:
```json
{
  "status": "ready"
}
```

#### MCP Protocol Endpoint
```
POST /mcp
GET /mcp
DELETE /mcp
```

The MCP protocol endpoint handles:
- **POST**: Initialize new sessions and send requests
- **GET**: Stream responses (SSE)
- **DELETE**: Close sessions

**Headers:**
- `mcp-session-id`: Session identifier (required for GET/DELETE, optional for initial POST)

## 🔌 Client Configuration

### For Cursor/Claude Desktop

```json
{
  "mcpServers": {
    "open-search": {
      "transport": "http",
      "url": "http://mcp-server.search-infrastructure.svc.cluster.local:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"  // Optional, if auth is added
      }
    }
  }
}
```

### For Remote Clients (via LoadBalancer/Ingress)

```json
{
  "mcpServers": {
    "open-search": {
      "transport": "http",
      "url": "https://mcp.yourdomain.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

### For IBM MCP Gateway

You can now connect directly to the MCP server without a bridge service:

1. **In Gateway Admin UI:**
   - Go to **Servers** → **Add Server**
   - **Name:** `open-search-mcp-server`
   - **Transport:** `HTTP` or `SSE`
   - **URL:** 
     - **Internal:** `http://mcp-server.search-infrastructure.svc.cluster.local:3000/mcp`
     - **External:** `http://<loadbalancer-ip>:3000/mcp`
     - **Via Ingress:** `https://mcp.yourdomain.com/mcp`

2. **No bridge service needed!**

### For Custom TypeScript Clients

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(
  new URL("http://mcp-server:3000/mcp"),
  {
    headers: {
      Authorization: "Bearer YOUR_TOKEN", // Optional
    },
  }
);

const client = new Client(
  {
    name: "my-client",
    version: "1.0.0",
  },
  {
    capabilities: {},
  }
);

await client.connect(transport);
```

## 🔄 Backwards Compatibility

### Stdio Transport Still Supported

For local development or spawned processes, stdio transport is still available:

```bash
# Set transport mode to stdio
export MCP_TRANSPORT=stdio

# Or don't set PORT (auto mode will use stdio)
node dist/index.js
```

### Wrapper Script Still Works

The `mcp-server-k8s-wrapper.sh` script still works for stdio-based clients, but is no longer necessary for HTTP clients.

## 🔐 Security Considerations

### Current Implementation

- No authentication by default
- Accessible to anyone with network access to the service

### Recommended Security Enhancements

1. **Add Authentication:**
   - API key validation
   - JWT token verification
   - OAuth 2.0

2. **Network Security:**
   - Use Ingress with TLS/HTTPS
   - Network policies to restrict access
   - Rate limiting

3. **Example: Add API Key Authentication**

```typescript
// In mcp-server/src/index.ts
const API_KEY = process.env.MCP_API_KEY;

app.post("/mcp", async (req, res) => {
  // Validate API key
  const apiKey = req.headers["x-api-key"];
  if (API_KEY && apiKey !== API_KEY) {
    return res.status(401).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Unauthorized" },
      id: null,
    });
  }
  // ... rest of handler
});
```

## 📊 Comparison: Before vs After

| Feature | Before (stdio + bridge) | After (native HTTP) |
|---------|------------------------|---------------------|
| Components | MCP Server + Bridge Service | MCP Server only |
| Remote Access | Requires bridge | Direct HTTP access |
| Setup Complexity | High (2 services) | Low (1 service) |
| Network Overhead | HTTP → stdio → HTTP | HTTP only |
| Scalability | Limited by bridge | Direct scaling |
| Maintenance | 2 services to maintain | 1 service |

## 🧪 Testing

### Test Health Endpoint

```bash
# From within cluster
curl http://mcp-server.search-infrastructure.svc.cluster.local:3000/health

# From external (via LoadBalancer)
curl http://<loadbalancer-ip>:3000/health
```

### Test MCP Endpoint

```bash
# Initialize session
curl -X POST http://mcp-server:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "test-client",
        "version": "1.0.0"
      }
    },
    "id": 1
  }'
```

### Test Tool Call

```bash
# List tools
curl -X POST http://mcp-server:3000/mcp \
  -H "Content-Type: application/json" \
  -H "mcp-session-id: <session-id-from-initialize>" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 2
  }'
```

## 🐛 Troubleshooting

### Server Not Starting

**Check logs:**
```bash
kubectl logs -n search-infrastructure -l app=mcp-server
```

**Verify environment variables:**
```bash
kubectl exec -n search-infrastructure -l app=mcp-server -- env | grep MCP_TRANSPORT
kubectl exec -n search-infrastructure -l app=mcp-server -- env | grep PORT
```

### Health Check Failing

**Check if server is listening:**
```bash
kubectl exec -n search-infrastructure -l app=mcp-server -- curl http://localhost:3000/health
```

**Verify port is exposed:**
```bash
kubectl get svc -n search-infrastructure mcp-server
```

### Session Issues

**Check active sessions:**
```bash
kubectl logs -n search-infrastructure -l app=mcp-server | grep "Session"
```

**Common issues:**
- Missing `mcp-session-id` header for GET/DELETE requests
- Session expired (sessions are cleaned up on close)
- Invalid initialize request format

## 📚 Additional Resources

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Streamable HTTP Transport Docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/server/streamableHttp.ts)

## ✅ Migration Checklist

If you're migrating from stdio + bridge setup:

- [ ] Update MCP server image to latest version
- [ ] Set `MCP_TRANSPORT=http` in deployment
- [ ] Update health checks to use HTTP endpoints
- [ ] Remove bridge service deployment (optional)
- [ ] Update client configurations to use HTTP transport
- [ ] Update IBM Gateway configuration (remove bridge URL)
- [ ] Test all endpoints
- [ ] Update documentation references

---

**Next Steps:**

1. **Deploy updated MCP server** with HTTP transport
2. **Update client configurations** to use HTTP URLs
3. **Remove bridge service** (if no longer needed)
4. **Add authentication** for production use
5. **Configure Ingress** with TLS for secure access

