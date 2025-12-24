# MCP Gateway Connection Analysis

## Log Analysis Results

### Current MCP Server Status

**Server is running successfully:**
- ✅ MCP Server is running on stdio
- ✅ All tools are available: `web_search`, `web_crawl`, `extract_content`, `analyze_search_results`
- ✅ Server is listening and ready for connections

### Issues Found

#### 1. Redis Connection Failure (Non-Critical)

**Error:**
```
Redis Client Error: Error: connect ECONNREFUSED 10.43.242.40:10515
Failed to initialize Redis: ReconnectStrategyError: Max reconnection attempts reached
```

**Impact:**
- ⚠️ **Non-fatal** - Server continues to run without Redis
- ⚠️ Caching functionality is disabled
- ✅ Core MCP functionality (tools) still works

**Resolution:**
- Check Redis service status: `kubectl get pods -n <redis-namespace> -l app=redis`
- Verify Redis connection configuration in ConfigMap
- This doesn't prevent MCP Gateway connections

#### 2. No MCP Gateway Connection Errors in Server Logs

**Observation:**
- ❌ **No connection attempts visible** in MCP server logs
- ❌ No protocol errors or connection timeouts
- ❌ No errors related to IBM Gateway or Context Forge

**This suggests:**
1. **Connection attempts aren't reaching the MCP server**
   - Likely because there's no bridge service to translate HTTP/SSE → stdio
   - IBM Gateway can only use HTTP/SSE, but MCP server only accepts stdio
   - The connection is failing before it reaches the server

2. **Missing Bridge Service**
   - No `mcp-bridge-service` deployed
   - Gateway has nothing to connect to

### Root Cause Analysis

```
IBM MCP Gateway (HTTP/SSE only)
    ↓ Trying to connect...
    ❌ No bridge service exists
    ❌ Cannot connect to stdio-based MCP server
    ↓ Connection fails at gateway level
    (Errors likely in gateway logs, not MCP server logs)
```

## Solution

### Deploy HTTP Bridge Service

The IBM MCP Gateway needs an HTTP bridge service to translate HTTP/SSE requests to stdio:

1. **Deploy Bridge Service:**
   ```bash
   kubectl apply -f k8s/rbac/mcp-bridge-rbac.yaml
   kubectl apply -f k8s/deployments/mcp-bridge-service.yaml
   kubectl apply -f k8s/services/mcp-bridge-service.yaml
   ```

2. **Expose Bridge Service:**
   - If gateway is **outside cluster**: Use `LoadBalancer` service type
   - If gateway is **inside cluster**: Use `ClusterIP` and internal DNS

3. **Configure Gateway:**
   - Point IBM Gateway to bridge service URL
   - Use HTTP or SSE transport

### Verify Connection Flow

After deploying bridge service:

1. **Check bridge service logs:**
   ```bash
   kubectl logs -n search-infrastructure -l app=mcp-bridge-service
   ```

2. **Check MCP server logs for tool calls:**
   ```bash
   kubectl logs -n search-infrastructure -l app=mcp-server | grep "Tool called"
   ```

3. **Test from gateway:**
   - Should see connection attempts in bridge service logs
   - Should see tool calls in MCP server logs

## Next Steps

1. ✅ **Deploy bridge service** (see `MCP_IBM_GATEWAY_SETUP.md`)
2. ✅ **Configure IBM Gateway** to point to bridge service
3. ✅ **Test connection** and verify logs show connection attempts
4. ⚠️ **Fix Redis connection** (optional, for caching)

## Expected Log Output After Fix

**Bridge Service Logs:**
```
[Bridge] Starting HTTP bridge service...
[Bridge] Listening on port 8080
[Bridge] Received MCP request from gateway
[Bridge] Executing kubectl exec to MCP server pod
[Bridge] Sending request to MCP server via stdio
[Bridge] Received response from MCP server
[Bridge] Returning HTTP response to gateway
```

**MCP Server Logs:**
```
[MCP] Tool called: web_search
[MCP] Tool called: tools/list
```

## Troubleshooting

### If Still No Connection After Bridge Service

1. **Check bridge service is running:**
   ```bash
   kubectl get pods -n search-infrastructure -l app=mcp-bridge-service
   ```

2. **Check bridge service can reach MCP server:**
   ```bash
   kubectl exec -n search-infrastructure -l app=mcp-bridge-service -- \
     kubectl get pods -n search-infrastructure -l app=mcp-server
   ```

3. **Check gateway configuration:**
   - Verify URL is correct
   - Verify transport is HTTP or SSE (not stdio)
   - Check authentication settings

4. **Check network connectivity:**
   ```bash
   # From bridge service pod
   kubectl exec -n search-infrastructure -l app=mcp-bridge-service -- \
     curl -v http://mcp-server.search-infrastructure.svc.cluster.local:3000/health
   ```

---

**Summary:** The MCP server is running correctly. The connection issue is that the IBM Gateway (HTTP/SSE only) cannot directly connect to a stdio-based server. Deploy the HTTP bridge service to enable the connection.

