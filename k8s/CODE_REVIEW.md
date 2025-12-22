# Code Review - Search Infrastructure Kubernetes Manifests

**Date:** 2025-12-19  
**Reviewer:** AI Assistant  
**Status:** Issues Identified - Updates Required

## Executive Summary

This code review identified multiple areas requiring updates to align with the existing cluster infrastructure and remove duplicates. The main issues are:

1. **Duplicate manifest files** - Example files need to be removed after updating main manifests
2. **Standalone Redis deployment** - Should be commented out (using existing Redis Enterprise)
3. **Incorrect secret references** - SearXNG secret name mismatch
4. **Placeholder image references** - Need Docker Hub registry updates
5. **Missing infrastructure reuse** - Not using existing PostgreSQL and Redis clusters
6. **Docker registry authentication** - PAT test failed, needs new token

---

## 1. Duplicate Files Identified

### Files to Remove (after updating main manifests):

- `k8s/deployments/mcp-server-updated.yaml.example`
- `k8s/deployments/crawl4ai-updated.yaml.example`
- `k8s/deployments/searxng-updated.yaml.example`

**Action:** Remove these files after updating the main deployment manifests.

---

## 2. Standalone Redis Deployment

### Issue

`k8s/deployments/redis.yaml` and `k8s/services/redis.yaml` deploy a standalone Redis instance, but we should use the existing Redis Enterprise `mcp-database`.

### Current State

- Deploys new Redis pod in `search-infrastructure` namespace
- Uses PVC for storage
- Creates new service

### Required Action

- **Comment out** the Redis deployment (don't remove)
- **Comment out** the Redis service (don't remove)
- **Comment out** the Redis PVC (don't remove)
- Update all services to use `mcp-database.redis.svc.cluster.local:10515`

---

## 3. Secret Reference Issues

### SearXNG Secret Mismatch

**File:** `k8s/deployments/searxng.yaml`  
**Line 25:** References `search-secrets`  
**Should be:** `searxng-secret` (matches the secret template)

**Current:**

```yaml
secretKeyRef:
  name: search-secrets
  key: searxng-secret
```

**Should be:**

```yaml
secretKeyRef:
  name: searxng-secret
  key: secret
```

---

## 4. Image Registry Configuration

### Current Issues

1. **Placeholder Images:**

   - `mcp-server.yaml`: `your-registry.io/mcp-search-server:latest`
   - `crawl4ai.yaml`: `your-registry.io/crawl4ai-service:latest`

2. **Docker Hub Configuration:**
   - Username: `docker4zerocool`
   - Registry: `docker.io` or `docker4zerocool` (for private repos)
   - PAT: **FAILED AUTHENTICATION TEST** - Needs new token

### Required Updates

**MCP Server:**

```yaml
image: docker4zerocool/mcp-search-server:latest
```

**Crawl4AI:**

```yaml
image: docker4zerocool/crawl4ai-service:latest
```

**SearXNG:**

- Already uses public image: `searxng/searxng:latest` ✓

### Image Pull Secrets

For private Docker Hub images, need to:

1. Create `docker-registry` secret with new PAT
2. Add `imagePullSecrets` to deployments

---

## 5. Infrastructure Reuse Issues

### PostgreSQL Connection

**Current State:**

- No PostgreSQL connection configured in deployments
- Should use existing `pg-ceph` cluster

**Required Updates:**

- Add environment variables referencing `pg-ceph-app` secret
- Use service: `pg-ceph-rw.pg.svc.cluster.local:5432`
- Add to `mcp-server.yaml` (for analytics)

### Redis Connection

**Current State:**

- `mcp-server.yaml`: Uses `redis://redis:6379` (standalone)
- `crawl4ai.yaml`: Uses `redis:6379` (standalone)

**Required Updates:**

- Use `mcp-database.redis.svc.cluster.local:10515`
- Reference `redb-mcp-database` secret for password
- Update both deployments

---

## 6. Environment Variable Configuration

### MCP Server Issues

**Current:**

```yaml
- name: REDIS_URL
  value: "redis://redis:6379"
```

**Should be:**

- Use ConfigMap references
- Reference secrets for credentials
- Use existing infrastructure endpoints

### Crawl4AI Issues

**Current:**

```yaml
- name: REDIS_HOST
  value: "redis"
- name: REDIS_PORT
  value: "6379"
```

**Should be:**

- Use ConfigMap references
- Reference secrets for password

---

## 7. ConfigMap Issues

### app-config.yaml

**Status:** ✓ Good - Already configured for existing infrastructure

### searxng-config.yaml

**Issue:** Redis cache URL uses cluster endpoint without password

```yaml
cache:
  type: redis
  url: redis://redis-cluster.redis.svc.cluster.local:6379
```

**Note:** SearXNG may not support password in URL. May need to use MCP database or configure differently.

---

## 8. Storage Configuration

### Redis PVC

**File:** `k8s/storage/redis-pvc.yaml`

**Issue:**

- Storage class: `standard` (should be `ceph-rbd-fast` if used)
- Not needed if using existing Redis

**Action:** Comment out (don't remove)

---

## 9. Service Configuration

### MCP Server Service

**File:** `k8s/services/mcp-server.yaml`

**Issue:** Type is `LoadBalancer`

- May want `ClusterIP` with Ingress instead
- Check if LoadBalancer is intentional

### Redis Service

**File:** `k8s/services/redis.yaml`

**Action:** Comment out (not using standalone Redis)

---

## 10. Ingress Configuration

### Current Issues

**File:** `k8s/ingress/ingress.yaml`

1. Uses `nginx` ingress class (cluster uses `kong` primarily)
2. Placeholder domain: `search.yourdomain.com`
3. Only routes to MCP server (may want multiple paths)

**Recommendation:**

- Consider using `kong` ingress class
- Update domain to actual domain
- Add paths for SearXNG and Crawl4AI if needed

---

## 11. Health Check Configuration

### Issues Found

1. **SearXNG:** Uses `/healthz` ✓ (correct)
2. **MCP Server:** Uses `/health` and `/ready` ✓ (correct)
3. **Crawl4AI:** Uses `/health` ✓ (correct)
4. **Redis:** Uses `redis-cli ping` ✓ (correct, but won't be used)

**Status:** Health checks are properly configured

---

## 12. Resource Limits

### Current Configuration

**MCP Server:**

- Requests: 256Mi, 250m CPU ✓
- Limits: 512Mi, 500m CPU ✓

**Crawl4AI:**

- Requests: 1Gi, 500m CPU ✓
- Limits: 2Gi, 1000m CPU ✓

**SearXNG:**

- Requests: 256Mi, 250m CPU (may be low)
- Limits: 512Mi, 500m CPU (may be low)

**Recommendation:** Consider increasing SearXNG resources based on usage.

---

## 13. Missing RBAC Configuration

### Cross-Namespace Secret Access

**Issue:** Deployments reference secrets in `pg` and `redis` namespaces, but no RBAC configured.

**Required:**

- Create Role in `pg` namespace for `pg-ceph-app` secret
- Create Role in `redis` namespace for `redb-mcp-database` secret
- Create RoleBindings to allow `search-infrastructure` service account

---

## 14. HPA Configuration

### File: `k8s/deployments/mcp-server-hpa.yaml`

**Status:** ✓ Well configured

- Min replicas: 3
- Max replicas: 10
- CPU/Memory targets: 70%/80%

**Note:** HPA references `mcp-server` deployment, which is correct.

---

## 15. Docker Registry Authentication

### PAT Test Result: **FAILED**

**Test Command:**

```bash
echo "dckr_pat_iZn55_MiVeYSzhx-OECGWfaFlpw" | docker login --username docker4zerocool --password-stdin
```

**Result:** `unauthorized: incorrect username or password`

**Action Required:**

1. Request new Docker Hub PAT from user
2. Test new PAT for both push and pull
3. Create `docker-registry` secret
4. Add `imagePullSecrets` to deployments

---

## Summary of Required Actions

### High Priority

1. ✅ **Request new Docker Hub PAT** (authentication failed)
2. ✅ **Update image references** to `docker4zerocool/*`
3. ✅ **Comment out standalone Redis** deployment/service/PVC
4. ✅ **Fix SearXNG secret reference**
5. ✅ **Update Redis connections** to use existing infrastructure
6. ✅ **Add PostgreSQL connections** to MCP server

### Medium Priority

7. ✅ **Remove duplicate example files** (after updating main files)
8. ✅ **Create RBAC** for cross-namespace secret access
9. ✅ **Update Ingress** to use Kong (if applicable)
10. ✅ **Create imagePullSecrets** after PAT is validated

### Low Priority

11. ✅ **Review resource limits** for SearXNG
12. ✅ **Update domain** in Ingress
13. ✅ **Consider service types** (LoadBalancer vs ClusterIP)

---

## Files Requiring Updates

1. `k8s/deployments/mcp-server.yaml` - Major updates needed
2. `k8s/deployments/crawl4ai.yaml` - Major updates needed
3. `k8s/deployments/searxng.yaml` - Secret reference fix
4. `k8s/deployments/redis.yaml` - Comment out
5. `k8s/services/redis.yaml` - Comment out
6. `k8s/storage/redis-pvc.yaml` - Comment out
7. `k8s/ingress/ingress.yaml` - Review ingress class
8. `k8s/secrets/docker-registry-secret.yaml` - Create new (after PAT)

---

## Next Steps

1. **Wait for new Docker Hub PAT**
2. **Test PAT** (push and pull)
3. **Update all manifests** with fixes
4. **Create RBAC resources**
5. **Remove duplicate files**
6. **Test deployment** in cluster

---

**Review Status:** Complete  
**Ready for Updates:** Yes (pending new PAT)
