# MCP Inspector Configuration for Search MCP Server

## Current Setup
- **MCP Server Pod**: `mcp-server-d966dd445-4htp9`
- **Namespace**: `search-infrastructure`
- **Transport**: STDIO (via kubectl exec)

## MCP Inspector Fields

### 1. Transport Type
✅ **STDIO** (already selected)

### 2. Command
```
kubectl
```

### 3. Arguments
```
exec -i -n search-infrastructure mcp-server-d966dd445-4htp9 -- node /app/dist/index.js
```

**Note**: To get the current pod name dynamically:
```bash
kubectl get pods -n search-infrastructure -l app=mcp-server -o jsonpath='{.items[0].metadata.name}'
```

### 4. Environment Variables
**Leave empty** - MCP Inspector should have cluster access via its service account.

If needed (only if RBAC issues):
- `KUBECONFIG`: `/path/to/kubeconfig` (if not using default)

### 5. Authentication
**Leave as default** - Not needed for kubectl exec

### 6. Custom Headers
**Leave empty** - Not needed for STDIO transport

### 7. Configuration
- **Request Timeout**: `300000` (5 minutes) ✅
- **Reset Timeout on Progress**: `True` ✅
- **Maximum Total Timeout**: `60000` (1 minute) ✅
- **Inspector Proxy Address**: `http://192.168.0.217:6274` ✅ (leave as is)
- **Proxy Session Token**: Leave empty

### 8. Click "Connect"

## Expected Result

After connecting, you should see:
- ✅ Connection status: **"Connected"**
- ✅ Available tools:
  - `web_search` - Search the web using SearXNG
  - `web_crawl` - Crawl and extract content from URLs
  - `extract_content` - Extract structured content from web pages
  - `analyze_search_results` - Analyze and summarize search results

## Test the Connection

### Test 1: List Tools
After connecting, the tools should appear automatically in the MCP Inspector interface.

### Test 2: web_search
1. Select `web_search` tool
2. Parameters:
```json
{
  "query": "latest AI news 2024",
  "maxResults": 5
}
```
3. Click "Call Tool"
4. Expected: Returns search results with URLs and snippets

### Test 3: web_crawl
1. Select `web_crawl` tool
2. Parameters:
```json
{
  "url": "https://example.com"
}
```
3. Click "Call Tool"
4. Expected: Returns crawled content from the URL

## Troubleshooting

### Issue: "pod not found"
**Solution**: Get current pod name:
```bash
kubectl get pods -n search-infrastructure -l app=mcp-server -o jsonpath='{.items[0].metadata.name}'
```
Update the Arguments field with the new pod name.

### Issue: "exec forbidden"
**Solution**: Check RBAC:
```bash
kubectl auth can-i exec pods -n search-infrastructure
```
If denied, ensure MCP Inspector's service account has exec permissions.

### Issue: Connection times out
**Solution**: 
- Increase "Request Timeout" to `600000` (10 minutes)
- Check MCP server pod is running:
  ```bash
  kubectl get pods -n search-infrastructure -l app=mcp-server
  ```
- Check MCP server logs:
  ```bash
  kubectl logs -n search-infrastructure mcp-server-d966dd445-4htp9 --tail=50
  ```

### Issue: Redis connection errors in logs
**Status**: ✅ **This is OK!** 
- Redis connection failures are expected (service has no endpoints)
- MCP server continues without cache (caching is optional)
- All tools work without Redis

## Quick Copy-Paste Configuration

**Command**: `kubectl`

**Arguments**: `exec -i -n search-infrastructure mcp-server-d966dd445-4htp9 -- node /app/dist/index.js`

**Transport**: STDIO

**Timeout**: 300000

---

**Last Updated**: Pod name may change after deployments. Always check current pod name before connecting.

