# IBM MCP Gateway Configuration Guide

## Overview

The IBM MCP Gateway (Context Forge) at `mcp.bionicaisolutions.com` is **perfectly suited** for enabling remote access to your Kubernetes-deployed MCP server. This gateway is specifically designed to bridge stdio-based MCP servers with HTTP/SSE/WebSocket clients.

## ✅ Why IBM MCP Gateway is Ideal

The IBM MCP Gateway provides:

- ✅ **Multi-Transport Support** - Handles HTTP and SSE (perfect for remote clients)
- ✅ **Protocol Translation** - Works with HTTP bridge service to bridge stdio ↔ HTTP
- ✅ **Security Features** - JWT authentication, rate limiting, observability
- ✅ **Admin UI** - Easy configuration via web interface
- ✅ **Federation** - Can federate multiple MCP servers
- ✅ **Production Ready** - Enterprise-grade gateway solution

## 🏗️ Architecture

```
Remote MCP Client
    ↓ HTTP/SSE
IBM MCP Gateway (mcp.bionicaisolutions.com)
    ↓ HTTP/SSE
HTTP Bridge Service (Kubernetes)
    ↓ stdio (via kubectl exec)
MCP Server Pod (Kubernetes)
    ↓ HTTP
SearXNG / Crawl4AI / Redis
```

**Note:** The IBM Gateway supports HTTP and SSE transports only. The bridge service handles the stdio translation.

## 🔧 Configuration Approach

**Important:** The IBM MCP Gateway supports **SSE and HTTP transports only** (not stdio). Therefore, we need to deploy an HTTP bridge service that translates HTTP ↔ stdio.

### Required: HTTP Bridge Service

Deploy a lightweight HTTP bridge service that the IBM Gateway connects to. The bridge handles the stdio ↔ HTTP translation via kubectl exec.

**Why this is needed:**

- ✅ IBM Gateway only supports SSE/HTTP (not stdio)
- ✅ Bridge service translates HTTP → stdio via kubectl exec
- ✅ Gateway connects via standard HTTP/SSE
- ✅ Clean separation of concerns
- ✅ Easy to scale and monitor

## 🚀 Setup Instructions

### Step 1: Deploy HTTP Bridge Service (Required)

Create a lightweight bridge service that translates HTTP to MCP stdio:

**File:** `k8s/deployments/mcp-bridge-service.yaml`

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-bridge-service
  namespace: search-infrastructure
spec:
  replicas: 2
  selector:
    matchLabels:
      app: mcp-bridge-service
  template:
    metadata:
      labels:
        app: mcp-bridge-service
    spec:
      serviceAccountName: mcp-bridge-sa
      containers:
        - name: bridge
          image: docker4zerocool/mcp-bridge-service:latest
          ports:
            - containerPort: 8080
          env:
            - name: MCP_NAMESPACE
              value: "search-infrastructure"
            - name: PORT
              value: "8080"
          resources:
            requests:
              memory: "128Mi"
              cpu: "100m"
            limits:
              memory: "256Mi"
              cpu: "200m"
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 5
```

**File:** `k8s/services/mcp-bridge-service.yaml`

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mcp-bridge-service
  namespace: search-infrastructure
spec:
  selector:
    app: mcp-bridge-service
  ports:
    - port: 80
      targetPort: 8080
  # Use LoadBalancer if IBM Gateway is outside the cluster
  # Use ClusterIP if IBM Gateway is inside the cluster
  type: LoadBalancer # Change to ClusterIP if gateway is in-cluster
```

**Important:**

- If IBM Gateway is **outside** your Kubernetes cluster, use `type: LoadBalancer` to get an external IP
- If IBM Gateway is **inside** your cluster, use `type: ClusterIP` and use the internal DNS name

**File:** `k8s/rbac/mcp-bridge-rbac.yaml`

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: mcp-bridge-sa
  namespace: search-infrastructure
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: mcp-bridge-role
  namespace: search-infrastructure
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list"]
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: mcp-bridge-rolebinding
  namespace: search-infrastructure
subjects:
  - kind: ServiceAccount
    name: mcp-bridge-sa
    namespace: search-infrastructure
roleRef:
  kind: Role
  name: mcp-bridge-role
  apiGroup: rbac.authorization.k8s.io
```

### Step 2: Configure IBM MCP Gateway

#### Access Admin Interface

1. Navigate to: `https://mcp.bionicaisolutions.com/admin/login`
2. Log in with your admin credentials

#### Register MCP Server

**Since IBM Gateway only supports SSE/HTTP, use the HTTP Bridge Service:**

1. **First, deploy the bridge service** (see Step 1 above)

2. **In Gateway Admin UI:**
   - Go to **Servers** → **Add Server**
   - **Name:** `open-search-mcp-server`
   - **Transport:** `HTTP` or `SSE` (both work, SSE recommended for streaming)
   - **URL:**
     - **Internal (if gateway is in cluster):** `http://mcp-bridge-service.search-infrastructure.svc.cluster.local:80`
     - **External (if gateway is outside cluster):** `http://<bridge-service-loadbalancer-ip>:80`
     - **Or via Ingress:** `https://mcp-bridge.yourdomain.com` (if you set up ingress)
   - **Authentication:** Configure as needed (API key, JWT, etc.)

**Note:** The bridge service URL must be accessible from the IBM Gateway. If the gateway is outside your Kubernetes cluster, you'll need to expose the bridge service via LoadBalancer or Ingress.

#### Configure Security

1. **Authentication:**

   - Enable JWT authentication
   - Configure API keys if needed
   - Set up OAuth if required

2. **Rate Limiting:**

   - Set appropriate rate limits per client
   - Configure burst limits

3. **CORS:**
   - Configure CORS if clients are browser-based
   - Allow necessary origins

### Step 3: Test Connection

#### Test via Admin UI

1. Go to **Servers** → Select your server
2. Click **Test Connection**
3. Verify status shows "Connected"

#### Test via API

```bash
# List available tools
curl -X POST https://mcp.bionicaisolutions.com/mcp/open-search-mcp-server/tools/list \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "params": {},
    "id": 1
  }'

# Call web_search tool
curl -X POST https://mcp.bionicaisolutions.com/mcp/open-search-mcp-server/tools/call \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {
      "name": "web_search",
      "arguments": {
        "query": "latest AI news",
        "maxResults": 5
      }
    },
    "id": 2
  }'
```

### Step 4: Configure Remote MCP Clients

#### For Cursor/Claude Desktop

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

#### For Custom Clients

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const transport = new SSEClientTransport(
  new URL("https://mcp.bionicaisolutions.com/mcp/open-search-mcp-server"),
  {
    headers: {
      Authorization: "Bearer YOUR_API_TOKEN",
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

## 🔐 Security Best Practices

### 1. Authentication

- **Use JWT tokens** for authentication
- **Rotate tokens** regularly
- **Use API keys** for service-to-service communication
- **Implement OAuth 2.0** for user authentication

### 2. Network Security

- **Use HTTPS** (TLS) for all connections
- **Restrict source IPs** if possible
- **Use network policies** in Kubernetes
- **Enable mTLS** for service-to-service communication

### 3. Rate Limiting

- **Set appropriate limits** per client/IP
- **Configure burst limits** for legitimate traffic spikes
- **Monitor for abuse** and adjust limits accordingly

### 4. Observability

- **Enable logging** for all requests
- **Monitor metrics** (latency, error rates, throughput)
- **Set up alerts** for anomalies
- **Review access logs** regularly

## 🐛 Troubleshooting

### Gateway Can't Connect to MCP Server

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

**Verify network connectivity:**

```bash
# From bridge service pod
kubectl exec -n search-infrastructure -l app=mcp-bridge-service -- \
  curl http://mcp-server.search-infrastructure.svc.cluster.local:3000/health
```

### Authentication Issues

- Verify JWT token is valid and not expired
- Check API key is correctly configured
- Review gateway logs for authentication errors

### Rate Limiting Issues

- Check if client is hitting rate limits
- Review rate limit configuration in gateway admin UI
- Adjust limits if needed for legitimate use cases

## 📊 Monitoring

### Key Metrics to Monitor

1. **Connection Status**

   - Gateway → Bridge service connectivity
   - Bridge service → MCP server connectivity

2. **Performance**

   - Request latency (p50, p95, p99)
   - Throughput (requests per second)
   - Error rates

3. **Resource Usage**
   - CPU and memory usage
   - Network bandwidth
   - Pod health status

### Logging

Enable structured logging in:

- IBM MCP Gateway
- Bridge service (if used)
- MCP server

## 📚 Additional Resources

- [IBM MCP Gateway Documentation](https://ibm.github.io/mcp-context-forge/)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Kubernetes RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)

## ✅ Verification Checklist

- [ ] Bridge service deployed and running (if using Option 1)
- [ ] RBAC permissions configured
- [ ] IBM Gateway can reach bridge service or MCP server
- [ ] MCP server registered in gateway admin UI
- [ ] Authentication configured and tested
- [ ] Rate limiting configured appropriately
- [ ] Remote client can connect via gateway
- [ ] Tools are accessible through gateway
- [ ] Monitoring and logging enabled
- [ ] Security policies reviewed and implemented

---

**Next Steps:**

1. **If using Option 1:** Deploy the bridge service and configure gateway to point to it
2. **If using Option 2:** Configure gateway with kubectl exec access
3. **Test connection** via admin UI and API
4. **Configure remote clients** to use `https://mcp.bionicaisolutions.com`
5. **Monitor and optimize** based on usage patterns
