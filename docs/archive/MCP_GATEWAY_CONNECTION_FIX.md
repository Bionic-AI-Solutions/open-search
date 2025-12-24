# MCP Gateway Connection Issue - Fix Guide

## 🔍 Problem Identified

The IBM MCP Gateway (`mcp-context-forge`) is unable to connect to the MCP server. The gateway logs show:

```
ERROR - GatewayConnectionError in group: (GatewayConnectionError('Failed to initialize gateway at http://192.168.0.215:3000'),)
ERROR - GatewayConnectionError in group: (GatewayConnectionError('Failed to initialize gateway at http://mcp-server.search-infrastructure.svc.cluster.local:80'),)
```

## ✅ Root Cause

The gateway is configured with **incorrect URLs**:
1. **Missing endpoint path**: Using `http://192.168.0.215:3000` instead of `http://192.168.0.215:3000/mcp`
2. **Wrong port**: Some attempts use port `80` instead of `3000`
3. **Missing `/mcp` path**: The MCP server requires the `/mcp` endpoint path for protocol communication

**Current (incorrect) gateway configuration:**
- `http://mcp-server.search-infrastructure.svc.cluster.local:80` ❌
- `http://192.168.0.215:3000` ❌ (missing `/mcp` path)

## ✅ Correct Configuration

Since the MCP server now supports **native HTTP/SSE transport**, the gateway should connect directly to:

**Internal (gateway is in same cluster):**
```
http://mcp-server.search-infrastructure.svc.cluster.local:3000/mcp
```

**External (if gateway is outside cluster):**
```
http://192.168.0.215:3000/mcp
```

**Note:** The MCP server service is already configured as a LoadBalancer with IP `192.168.0.215`. However, the gateway must include the `/mcp` endpoint path.

**Current LoadBalancer IP:** `192.168.0.215` (already configured)

## 🔧 Fix Steps

### Step 1: Access Gateway Admin UI

1. Navigate to: `https://mcp.bionicaisolutions.com/admin/login`
2. Log in with your admin credentials

### Step 2: Update MCP Server Configuration

1. Go to **Servers** → Find your MCP server (likely named `open-search-mcp-server`)
2. Click **Edit** or **Update**
3. Update the **URL** field to:
   ```
   http://mcp-server.search-infrastructure.svc.cluster.local:3000/mcp
   ```
4. Ensure **Transport** is set to `HTTP` or `SSE` (both work)
5. Click **Save** or **Update**

### Step 3: Test Connection

1. In the Gateway Admin UI, go to **Servers** → Select your server
2. Click **Test Connection**
3. Should show "Connected" ✅

### Step 4: Verify Connection

After updating, check the gateway logs to confirm successful connection:

```bash
kubectl logs -n mcp-gateway -l app=mcp-context-forge --tail=50 | grep -i "initialize\|connected\|error"
```

You should see successful initialization messages instead of errors.

## ✅ Verification

The MCP server is working correctly. Test from gateway pod:

```bash
# Health check
kubectl exec -n mcp-gateway <gateway-pod> -- python -c "import requests; r = requests.get('http://mcp-server.search-infrastructure.svc.cluster.local:3000/health'); print(r.status_code, r.json())"

# MCP initialize
kubectl exec -n mcp-gateway <gateway-pod> -- python -c "import requests; r = requests.post('http://mcp-server.search-infrastructure.svc.cluster.local:3000/mcp', json={'jsonrpc':'2.0','method':'initialize','params':{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'test','version':'1.0.0'}},'id':1}, headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'}); print('Status:', r.status_code); print('Response:', r.text[:200])"
```

Both should return `200` status codes.

## 📝 Notes

- The MCP server now supports **native HTTP/SSE transport** - no bridge service needed
- The gateway must use the `/mcp` endpoint path (not just the base URL)
- Port must be `3000` (not `80`)
- Use internal service name when gateway is in the same cluster

## 🔄 Alternative: If Gateway is Outside Cluster

If the gateway is outside your Kubernetes cluster, you'll need to:

1. **Expose MCP server via LoadBalancer:**
   ```bash
   kubectl patch svc -n search-infrastructure mcp-server -p '{"spec":{"type":"LoadBalancer"}}'
   kubectl get svc -n search-infrastructure mcp-server
   # Use the EXTERNAL-IP in gateway configuration
   ```

2. **Or use Ingress:**
   - Configure Ingress for `mcp-server` service
   - Use the Ingress URL in gateway configuration: `https://mcp.yourdomain.com/mcp`

