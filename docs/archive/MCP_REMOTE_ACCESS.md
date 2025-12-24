# MCP Server Remote Access Guide

## Overview

The MCP server uses **stdio transport** (stdin/stdout), which makes remote access challenging. This guide provides several methods to enable remote MCP clients to connect to your Kubernetes-deployed MCP server.

## 🔍 Understanding the Challenge

**MCP Protocol Limitation:**

- MCP uses stdio (standard input/output) for communication
- Clients must spawn the MCP server process and communicate via pipes
- Direct HTTP connections are not supported by the MCP protocol
- Remote access requires a bridge/gateway to translate HTTP to stdio

## 🌐 Remote Access Methods

### Method 1: HTTP Gateway Service (Recommended for Remote Clients)

Create an HTTP gateway that translates HTTP requests to MCP stdio protocol. This allows remote clients to connect via HTTP/HTTPS.

**Architecture:**

```
Remote MCP Client
    ↓ (HTTP/HTTPS)
HTTP Gateway Service (in Kubernetes)
    ↓ (stdio via kubectl exec)
MCP Server Pod
    ↓ (HTTP)
SearXNG / Crawl4AI / Redis
```

**Advantages:**

- ✅ Works from anywhere (internet, VPN, etc.)
- ✅ Standard HTTP/HTTPS access
- ✅ Can use Ingress/LoadBalancer for external access
- ✅ Supports authentication and rate limiting
- ✅ Works with any HTTP client

**See:** `MCP_HTTP_GATEWAY.md` for implementation details

### Method 2: SSH Tunnel + kubectl exec

Use SSH to tunnel kubectl exec commands from a remote machine.

**Setup:**

1. **On the remote client machine:**

   ```bash
   # Create SSH tunnel to Kubernetes master/worker node
   ssh -L 6443:localhost:6443 user@k8s-master-node

   # In another terminal, use kubectl with forwarded port
   export KUBECONFIG=/path/to/kubeconfig
   kubectl config set-cluster default --server=https://localhost:6443
   ```

2. **Use the wrapper script:**

   ```bash
   # The wrapper script will work through the SSH tunnel
   ./mcp-server-k8s-wrapper.sh
   ```

3. **Configure MCP client:**
   ```json
   {
     "mcpServers": {
       "open-search": {
         "command": "/path/to/mcp-server-k8s-wrapper.sh",
         "env": {
           "KUBECONFIG": "/path/to/kubeconfig"
         }
       }
     }
   }
   ```

**Advantages:**

- ✅ Uses existing kubectl exec method
- ✅ Secure (SSH encrypted)
- ✅ No additional services needed

**Disadvantages:**

- ❌ Requires SSH access to cluster
- ❌ Requires kubectl installed on client
- ❌ More complex setup

### Method 3: VPN + kubectl exec

Connect to the Kubernetes cluster via VPN and use kubectl exec directly.

**Setup:**

1. **Connect to VPN:**

   ```bash
   # Connect to your Kubernetes cluster VPN
   openvpn --config cluster.ovpn
   ```

2. **Use wrapper script:**

   ```bash
   # Wrapper script works normally once VPN is connected
   ./mcp-server-k8s-wrapper.sh
   ```

3. **Configure MCP client:**
   ```json
   {
     "mcpServers": {
       "open-search": {
         "command": "/path/to/mcp-server-k8s-wrapper.sh",
         "env": {
           "KUBECONFIG": "/path/to/kubeconfig"
         }
       }
     }
   }
   ```

**Advantages:**

- ✅ Secure (VPN encrypted)
- ✅ Uses existing infrastructure
- ✅ No additional services

**Disadvantages:**

- ❌ Requires VPN setup
- ❌ Requires kubectl on client
- ❌ VPN connection overhead

### Method 4: Port Forwarding + Local Gateway

Port-forward the MCP server pod and run a local HTTP gateway.

**Setup:**

1. **Port-forward the pod:**

   ```bash
   kubectl port-forward -n search-infrastructure \
     $(kubectl get pods -n search-infrastructure -l app=mcp-server -o jsonpath='{.items[0].metadata.name}') \
     3000:3000
   ```

2. **Run local HTTP gateway:**

   ```bash
   # See mcp-http-gateway/ directory for implementation
   cd mcp-http-gateway
   npm install
   npm start
   ```

3. **Connect remote client to gateway:**
   ```json
   {
     "mcpServers": {
       "open-search": {
         "transport": "http",
         "url": "http://your-local-ip:8080"
       }
     }
   }
   ```

**Advantages:**

- ✅ Simple for development
- ✅ No Kubernetes changes needed

**Disadvantages:**

- ❌ Requires port-forward to stay active
- ❌ Not suitable for production
- ❌ Single client limitation

## 🚀 Recommended Solution: IBM MCP Gateway

**You already have an IBM MCP Gateway at `mcp.bionicaisolutions.com`!** This is the **ideal solution** for remote access.

The IBM MCP Gateway (Context Forge) is specifically designed for this use case and provides:

1. **Multi-Transport Support** - Handles stdio, HTTP, SSE, and WebSocket
2. **Protocol Translation** - Automatically bridges stdio ↔ HTTP
3. **Security Features** - JWT authentication, rate limiting, observability
4. **Admin UI** - Easy configuration via web interface
5. **Production Ready** - Enterprise-grade gateway solution

**See:** `MCP_IBM_GATEWAY_SETUP.md` for complete configuration guide.

### Alternative: Custom HTTP Gateway Service

If you prefer a custom solution, you can implement an HTTP Gateway Service. This provides:

1. **Standard HTTP/HTTPS access** - Works with any HTTP client
2. **Ingress/LoadBalancer support** - Expose via domain name or IP
3. **Authentication** - Add API keys, OAuth, etc.
4. **Rate limiting** - Protect against abuse
5. **Scalability** - Handle multiple concurrent clients

### Implementation Steps

1. **Deploy HTTP Gateway:**

   ```bash
   kubectl apply -f k8s/deployments/mcp-http-gateway.yaml
   kubectl apply -f k8s/services/mcp-http-gateway.yaml
   ```

2. **Configure Ingress (optional):**

   ```bash
   # Update ingress.yaml with gateway service
   kubectl apply -f k8s/ingress/mcp-gateway-ingress.yaml
   ```

3. **Connect remote client:**
   ```json
   {
     "mcpServers": {
       "open-search": {
         "transport": "http",
         "url": "https://mcp-gateway.yourdomain.com",
         "headers": {
           "Authorization": "Bearer YOUR_API_KEY"
         }
       }
     }
   }
   ```

## 🔐 Security Considerations

### For HTTP Gateway:

1. **Authentication:**

   - API keys (recommended)
   - OAuth 2.0
   - mTLS certificates

2. **Network Security:**

   - Use HTTPS/TLS
   - Restrict source IPs (if possible)
   - Rate limiting
   - Request size limits

3. **Kubernetes Security:**
   - Network policies
   - Service account with minimal permissions
   - RBAC for gateway service

### For SSH/VPN Methods:

1. **SSH Security:**

   - Use SSH keys (no passwords)
   - Disable root login
   - Use non-standard ports
   - Fail2ban for brute force protection

2. **VPN Security:**
   - Strong encryption (AES-256)
   - Certificate-based authentication
   - Regular key rotation

## 📊 Comparison Matrix

| Method       | Complexity | Security | Scalability | Production Ready |
| ------------ | ---------- | -------- | ----------- | ---------------- |
| HTTP Gateway | Medium     | High     | High        | ✅ Yes           |
| SSH Tunnel   | Low        | High     | Low         | ⚠️ Limited       |
| VPN          | Low        | High     | Medium      | ✅ Yes           |
| Port Forward | Low        | Medium   | Low         | ❌ No            |

## 🛠️ Troubleshooting

### HTTP Gateway Issues

**Problem:** Gateway not responding

```bash
# Check gateway pod status
kubectl get pods -n search-infrastructure -l app=mcp-http-gateway

# Check logs
kubectl logs -n search-infrastructure -l app=mcp-http-gateway

# Check service
kubectl get svc -n search-infrastructure mcp-http-gateway
```

**Problem:** MCP protocol errors

- Verify gateway can exec into MCP server pod
- Check RBAC permissions for gateway service account
- Verify MCP server pod is running

### SSH/VPN Issues

**Problem:** kubectl exec fails

```bash
# Test kubectl access
kubectl get pods -n search-infrastructure

# Test exec directly
kubectl exec -n search-infrastructure -l app=mcp-server -- echo "test"
```

**Problem:** Connection timeout

- Check network connectivity
- Verify firewall rules
- Check VPN/SSH tunnel status

## 📚 Additional Resources

- [IBM MCP Gateway Setup](./MCP_IBM_GATEWAY_SETUP.md) - **Recommended for your setup**
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Kubernetes Exec Documentation](https://kubernetes.io/docs/reference/generated/kubectl/kubectl-commands#exec)
- [HTTP Gateway Implementation](./MCP_HTTP_GATEWAY.md) - Alternative custom solution

## 🆘 Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review gateway logs: `kubectl logs -n search-infrastructure -l app=mcp-http-gateway`
3. Verify MCP server is running: `kubectl get pods -n search-infrastructure -l app=mcp-server`
4. Open an issue on GitHub

---

**Next Steps:**

1. **If you have IBM MCP Gateway:** See `MCP_IBM_GATEWAY_SETUP.md` for configuration
2. **If building custom gateway:** See `MCP_HTTP_GATEWAY.md` for implementation
