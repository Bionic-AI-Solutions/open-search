# MCP Server Remote Access - Quick Summary

## The Challenge

MCP servers use **stdio transport** (stdin/stdout), not HTTP. This means:
- ❌ You can't directly connect via `http://mcp-server:3000`
- ✅ You need a bridge/gateway to translate HTTP → stdio

## Solutions for Remote Access

### 1. IBM MCP Gateway ⭐⭐⭐ (Best Option - You Already Have This!)

**You have an IBM MCP Gateway at `mcp.bionicaisolutions.com`!**

**Best for:** Production, multiple remote clients, enterprise features

**How it works:**
- IBM Gateway handles stdio ↔ HTTP translation automatically
- Configure gateway to connect to your Kubernetes MCP server
- Remote clients connect via `https://mcp.bionicaisolutions.com`
- Built-in security, rate limiting, and observability

**Setup:**
```bash
# 1. Deploy bridge service (if needed)
kubectl apply -f k8s/deployments/mcp-bridge-service.yaml

# 2. Configure gateway via admin UI
# https://mcp.bionicaisolutions.com/admin/login

# 3. Connect remote client
# URL: https://mcp.bionicaisolutions.com/mcp/open-search-mcp-server
```

**See:** `MCP_IBM_GATEWAY_SETUP.md` for complete guide

### 2. Custom HTTP Gateway Service

**Best for:** Production, multiple remote clients, internet access

**How it works:**
- Deploy an HTTP gateway service in Kubernetes
- Gateway accepts HTTP requests and translates them to MCP stdio via `kubectl exec`
- Expose gateway via Ingress/LoadBalancer
- Remote clients connect via standard HTTP/HTTPS

**Setup:**
```bash
# Deploy HTTP gateway
kubectl apply -f k8s/deployments/mcp-http-gateway.yaml
kubectl apply -f k8s/services/mcp-http-gateway.yaml

# Connect remote client
# URL: https://mcp-gateway.yourdomain.com
```

**See:** `MCP_HTTP_GATEWAY.md` for full implementation

### 2. SSH Tunnel

**Best for:** Single user, secure access, temporary connections

**How it works:**
- SSH tunnel to Kubernetes cluster
- Use wrapper script through tunnel
- kubectl exec works through SSH

**Setup:**
```bash
# Create SSH tunnel
ssh -L 6443:localhost:6443 user@k8s-node

# Use wrapper script (in another terminal)
./mcp-server-k8s-wrapper.sh
```

### 3. VPN Connection

**Best for:** Teams, persistent access, existing VPN infrastructure

**How it works:**
- Connect to Kubernetes cluster VPN
- Use wrapper script normally
- kubectl exec works over VPN

**Setup:**
```bash
# Connect VPN
openvpn --config cluster.ovpn

# Use wrapper script
./mcp-server-k8s-wrapper.sh
```

## Quick Comparison

| Method | Complexity | Best For | Production Ready |
|--------|-----------|----------|-----------------|
| **IBM MCP Gateway** | **Low** | **Enterprise, multiple clients** | **✅ Yes** |
| Custom HTTP Gateway | Medium | Multiple clients, custom needs | ✅ Yes |
| SSH Tunnel | Low | Single user, temporary | ⚠️ Limited |
| VPN | Low | Teams, persistent | ✅ Yes |

## Current Setup (Local Access)

For **local access** (same network as cluster), use the wrapper script:

```bash
# Copy wrapper script
cp mcp-server-k8s-wrapper.sh ~/bin/
chmod +x ~/bin/mcp-server-k8s-wrapper.sh

# Configure Cursor
# ~/Library/Application Support/Cursor/User/globalStorage/mcp.json
{
  "mcpServers": {
    "open-search": {
      "command": "~/bin/mcp-server-k8s-wrapper.sh",
      "env": {
        "KUBECONFIG": "/path/to/kubeconfig"
      }
    }
  }
}
```

## Next Steps

1. **For IBM Gateway setup (Recommended):** Read `MCP_IBM_GATEWAY_SETUP.md`
2. **For remote access options:** Read `MCP_REMOTE_ACCESS.md`
3. **For custom HTTP gateway:** Read `MCP_HTTP_GATEWAY.md`
4. **For local access:** Use `MCP_QUICK_START.md`

---

**Key Point:** You already have an IBM MCP Gateway at `mcp.bionicaisolutions.com`! This is the best solution for remote access. Just configure it to connect to your Kubernetes MCP server.

