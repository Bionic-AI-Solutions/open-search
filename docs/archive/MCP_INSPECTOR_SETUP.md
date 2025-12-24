# MCP Inspector Setup for Kubernetes MCP Server

## Your Setup

- **MCP Server**: Running in `search-infrastructure` namespace
- **MCP Inspector**: Running in a different namespace (same cluster)
- **MCP Server Pod**: `mcp-server-d966dd445-*` (3 pods available)

## MCP Inspector Configuration

Since MCP Inspector is running in the same cluster, you can connect directly using `kubectl exec`.

### Option 1: Direct kubectl exec (Recommended)

**Transport Type:** `STDIO` (already selected)

**Command:** `kubectl`

**Arguments:**

```
exec -i -n search-infrastructure mcp-server-d966dd445-4htp9 -- node /app/dist/index.js
```

**Environment Variables:**

- `KUBECONFIG`: `/path/to/kubeconfig` (if needed)
- Or leave empty if using default kubeconfig

**Note:** Replace `mcp-server-d966dd445-4htp9` with the actual pod name from your cluster.

### Option 2: Use Pod Selector (Dynamic)

If you want it to automatically pick a pod:

**Command:** `sh`

**Arguments:**

```
-c kubectl exec -i -n search-infrastructure $(kubectl get pods -n search-infrastructure -l app=mcp-server -o jsonpath='{.items[0].metadata.name}') -- node /app/dist/index.js
```

### Option 3: Create a Service Account (If RBAC Required)

If MCP Inspector needs special permissions:

1. **Create ServiceAccount:**

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: mcp-inspector
  namespace: <your-inspector-namespace>
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: mcp-server-exec
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
  name: mcp-inspector-exec
  namespace: search-infrastructure
subjects:
  - kind: ServiceAccount
    name: mcp-inspector
    namespace: <your-inspector-namespace>
roleRef:
  kind: Role
  name: mcp-server-exec
  apiGroup: rbac.authorization.k8s.io
```

2. **Use in MCP Inspector:**
   - Set environment variable: `KUBERNETES_SERVICE_ACCOUNT=mcp-inspector`

## Complete MCP Inspector Configuration

### Fields to Fill:

1. **Transport Type:** `STDIO` ✅ (already selected)

2. **Command:** `kubectl`

3. **Arguments:**

   ```
   exec -i -n search-infrastructure mcp-server-d966dd445-4htp9 -- node /app/dist/index.js
   ```

   **To get current pod name:**

   ```bash
   kubectl get pods -n search-infrastructure -l app=mcp-server -o jsonpath='{.items[0].metadata.name}'
   ```

4. **Environment Variables:** (Optional - only if needed)

   - `KUBECONFIG`: `/path/to/kubeconfig` (if not using default)
   - Or leave empty if MCP Inspector has cluster access

5. **Authentication:** Leave as default (not needed for kubectl exec)

6. **Configuration:**

   - **Request Timeout:** `300000` (5 minutes) - good for search operations
   - **Reset Timeout on Progress:** `True` ✅
   - **Maximum Total Timeout:** `60000` (1 minute) - adjust if needed
   - **Inspector Proxy Address:** Leave as is
   - **Proxy Session Token:** Leave empty

7. **Click "Connect"**

## Verify Connection

After connecting, you should see:

- ✅ Connection status: "Connected"
- ✅ Available tools listed:
  - `web_search`
  - `web_crawl`
  - `extract_content`
  - `analyze_search_results`

## Test the Tools

1. **Test web_search:**

   - Select `web_search` tool
   - Parameters: `{"query": "latest AI news", "maxResults": 5}`
   - Click "Call Tool"

2. **Test web_crawl:**
   - Select `web_crawl` tool
   - Parameters: `{"url": "https://example.com"}`
   - Click "Call Tool"

## Troubleshooting

### Issue: "pod not found" or "exec forbidden"

**Solution:** Check RBAC permissions:

```bash
kubectl auth can-i exec pods -n search-infrastructure
```

If denied, create the RoleBinding above.

### Issue: "command not found: kubectl"

**Solution:** MCP Inspector pod needs kubectl installed, or use a different approach:

- Use a sidecar with kubectl
- Or use the service account approach with proper RBAC

### Issue: Connection times out

**Solution:**

- Increase "Request Timeout" to `600000` (10 minutes)
- Check MCP server pod is running: `kubectl get pods -n search-infrastructure -l app=mcp-server`
- Check MCP server logs: `kubectl logs -n search-infrastructure -l app=mcp-server --tail=50`

## Quick Reference

**Current MCP Server Pod:** `mcp-server-d966dd445-4htp9` (check with command above)

**Full Command:**

```bash
kubectl exec -i -n search-infrastructure mcp-server-d966dd445-4htp9 -- node /app/dist/index.js
```

**MCP Inspector Config:**

- Transport: STDIO
- Command: `kubectl`
- Arguments: `exec -i -n search-infrastructure mcp-server-d966dd445-4htp9 -- node /app/dist/index.js`
