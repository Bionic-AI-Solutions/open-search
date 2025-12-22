# Manifest Fixes and Updates

This document captures all fixes applied to the manifests to ensure they can recreate the working setup from scratch.

## Critical Fixes Applied

### 1. MCP Server - stdin Configuration
**Issue**: MCP server uses stdio transport and was exiting because stdin wasn't kept open.

**Fix**: Added `stdin: true` to the container spec in `deployments/mcp-server.yaml`

```yaml
stdin: true
tty: false
```

**Location**: `/workspace/k8s/deployments/mcp-server.yaml` (line 123)

### 2. Cross-Namespace Secret Access
**Issue**: Kubernetes `secretKeyRef` doesn't support cross-namespace references. Secrets from `pg` and `redis` namespaces couldn't be accessed.

**Fix**: Created secret manifests that copy the secrets to `search-infrastructure` namespace:
- `/workspace/k8s/secrets/redb-mcp-database.yaml` - Redis secret
- `/workspace/k8s/secrets/pg-ceph-app.yaml` - PostgreSQL secret

**Deployment Script Update**: Updated `deploy.sh` to apply these secrets in Step 3.

### 3. Crawl4AI Import Error
**Issue**: `MarkdownChunking` was removed in crawl4ai >=0.7.8

**Fix**: Updated `crawl4ai-service/main.py` to use `RegexChunking` instead of `MarkdownChunking`.

**Note**: This fix is in the Docker image, not the manifest. The image `docker4zerocool/crawl4ai-service:latest` includes this fix.

### 4. Crawl4AI Redis Connection
**Issue**: Hardcoded Redis connection string didn't use environment variables.

**Fix**: Updated `crawl4ai-service/main.py` to construct Redis URL from environment variables:
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`

**Note**: This fix is in the Docker image, not the manifest.

### 5. MCP Server Redis URL Construction
**Issue**: MCP server needed to construct Redis URL from individual environment variables.

**Fix**: Updated `mcp-server/src/config.ts` to construct Redis URL from:
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`

**Note**: This fix is in the Docker image, not the manifest.

### 6. Health Check Configuration
**Issue**: MCP server uses stdio transport, not HTTP, so HTTP health checks failed.

**Fix**: Changed health checks to process-based in `deployments/mcp-server.yaml`:

```yaml
livenessProbe:
  exec:
    command: ["/bin/sh", "-c", "ps aux | grep -v grep | grep 'node dist/index.js' || exit 1"]
readinessProbe:
  exec:
    command: ["/bin/sh", "-c", "ps aux | grep -v grep | grep 'node dist/index.js' || exit 1"]
```

**Location**: `/workspace/k8s/deployments/mcp-server.yaml` (lines 126-139)

### 7. SearXNG ConfigMap
**Issue**: Invalid settings.yml configuration.

**Fix**: Changed `use_default_settings: false` to `use_default_settings: true` in `configmaps/searxng-config.yaml`.

**Location**: `/workspace/k8s/configmaps/searxng-config.yaml` (line 11)

## Manifest Files Status

All manifests are current and include the fixes above:

✅ **Namespace**: `namespace.yaml`
✅ **RBAC**: `rbac/secret-reader-rbac.yaml`
✅ **Secrets**: 
   - `secrets/docker-registry-secret.yaml`
   - `secrets/searxng-secret.yaml` (template)
   - `secrets/redb-mcp-database.yaml` (copied from redis namespace)
   - `secrets/pg-ceph-app.yaml` (copied from pg namespace)
✅ **ConfigMaps**: 
   - `configmaps/app-config.yaml`
   - `configmaps/searxng-config.yaml`
✅ **Services**: 
   - `services/searxng.yaml`
   - `services/crawl4ai.yaml`
   - `services/mcp-server.yaml`
✅ **Deployments**: 
   - `deployments/searxng.yaml`
   - `deployments/crawl4ai.yaml`
   - `deployments/mcp-server.yaml` (includes stdin fix)
   - `deployments/mcp-server-hpa.yaml`
✅ **Ingress**: `ingress/ingress.yaml`
✅ **Deployment Script**: `deploy.sh` (updated to handle secret copying)

## Testing

The setup has been tested by:
1. Deleting the `search-infrastructure` namespace
2. Recreating everything using `deploy.sh`
3. Verifying all pods come up successfully

**Result**: ✅ All 8 pods (3 SearXNG, 2 Crawl4AI, 3 MCP Server) are running and ready.

## Deployment Order

The correct deployment order (as in `deploy.sh`):

1. Namespace
2. RBAC (for cross-namespace access)
3. Secrets (including copied secrets from other namespaces)
4. ConfigMaps
5. Services
6. Deployments
7. HPA (optional)
8. Ingress (optional)

## Notes

- Secrets from other namespaces must be copied to `search-infrastructure` namespace
- The deployment script handles this automatically if secret manifests exist
- If secret manifests don't exist, the script will create them from the source namespaces
- All Docker images have been built and pushed with the necessary fixes

